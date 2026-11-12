import test from "node:test";
import assert from "node:assert/strict";
import { createMessagingStore } from "../src/features/messaging/messagingStore.js";
import { createCustomerMessaging } from "../src/features/messaging/customerMessaging.js";
import { MESSAGING_KEY } from "../src/features/messaging/contracts.js";
import { safeReturnTo } from "../src/features/account/redirects.js";
import { installBookingNotificationBridge } from "../src/features/messaging/bookingNotificationBridge.js";

function fixture() {
  const buyer = { id: "buyer", sellerProfileId: "buyer-studio" };
  const seller = { id: "seller", sellerProfileId: "seller-studio" };
  const other = { id: "other", sellerProfileId: null };
  let user = buyer;
  let sequence = 0;
  let raw = null;
  let broken = false;
  const profiles = [
    { id: "seller-studio", ownerUserId: seller.id, name: "Studio Nyata" },
    { id: "buyer-studio", ownerUserId: buyer.id, name: "Studio Pembeli" },
  ];
  const services = [
    { id: "design", creatorId: "seller-studio", title: "Identitas Brand" },
    { id: "own", creatorId: "buyer-studio", title: "Ilustrasi" },
    { id: "fictional", creatorId: "editorial", title: "Editorial" },
  ];
  const bookings = [
    {
      id: "booking-one",
      customerId: buyer.id,
      creatorId: "seller-studio",
      serviceId: "design",
      status: "Requested",
    },
    {
      id: "booking-two",
      customerId: other.id,
      creatorId: "seller-studio",
      serviceId: "design",
      status: "Requested",
    },
  ];
  const accountListeners = new Set();
  const bookingListeners = new Set();
  const accounts = {
    current: () => user,
    listSellerProfiles: () => profiles,
    subscribe: (fn) => {
      accountListeners.add(fn);
      return () => accountListeners.delete(fn);
    },
  };
  const customers = {
    subscribe: (fn) => {
      bookingListeners.add(fn);
      return () => bookingListeners.delete(fn);
    },
    sellerView: () => ({
      bookings: bookings.filter(
        (row) => row.creatorId === user?.sellerProfileId,
      ),
    }),
    view: () => ({
      bookings: bookings.filter((row) => row.customerId === user?.id),
    }),
  };
  const messaging = createMessagingStore({
    storage: {
      getItem: () => {
        if (broken) throw new Error("blocked");
        return raw;
      },
      setItem: (_key, value) => {
        if (broken) throw new Error("blocked");
        raw = value;
      },
    },
    currentUser: () => user,
    resolveSellerProfile: (id) => {
      const p = profiles.find((p) => p.id === id);
      return p && { id, owner_user_id: p.ownerUserId };
    },
    resolveService: (id) => {
      const s = services.find((s) => s.id === id);
      return s && { id, seller_profile_id: s.creatorId };
    },
    resolveBooking: (id) => {
      const b = bookings.find((b) => b.id === id);
      if (
        !b ||
        (b.customerId !== user?.id &&
          profiles.find((p) => p.id === b.creatorId)?.ownerUserId !== user?.id)
      )
        return null;
      return {
        id,
        customer_user_id: b.customerId,
        seller_profile_id: b.creatorId,
        service_id: b.serviceId,
        status: b.status,
      };
    },
    randomId: () => `id-${++sequence}`,
    now: () => new Date(1800000000000 + sequence * 1000).toISOString(),
  });
  const ui = createCustomerMessaging({
    messaging,
    accounts,
    customers,
    getServices: () => services,
  });
  return {
    ui,
    messaging,
    buyer,
    seller,
    other,
    bookings,
    accounts,
    customers,
    emitBooking: () => bookingListeners.forEach((fn) => fn()),
    as: (u) => {
      user = u;
      accountListeners.forEach((fn) => fn());
    },
    damage: (value) => {
      raw = value;
    },
    raw: () => raw,
    block: () => {
      broken = true;
    },
  };
}
const rejects = (fn, code) => assert.throws(fn, (error) => error.code === code);

test("customer inbox excludes selling conversations for the same unified account", () => {
  const f = fixture();
  const buying = f.ui.startService("design");
  f.as(f.other);
  const selling = f.messaging.getOrCreateConversation({
    seller_profile_id: "buyer-studio",
    service_id: "own",
  });
  f.messaging.sendMessage(selling.id, "Pesan untuk penjual");
  f.as(f.buyer);
  assert.deepEqual(
    f.ui.listInbox().map((row) => row.id),
    [buying.id],
  );
  assert.equal(f.ui.counts().messages, 0);
  assert.equal(f.ui.counts().notifications, 0);
  assert.equal(f.messaging.getUnreadNotificationCount(), 1);
  rejects(() => f.ui.getThread(selling.id), "NOT_FOUND_OR_FORBIDDEN");
  rejects(
    () => f.ui.send(selling.id, "Bukan ruang penjual"),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  rejects(() => f.ui.markRead(selling.id), "NOT_FOUND_OR_FORBIDDEN");
  f.as(f.seller);
  f.messaging.sendMessage(buying.id, "Balasan untuk ruang pelanggan");
  f.as(f.buyer);
  assert.equal(f.ui.counts().messages, 1);
  assert.equal(f.ui.counts().notifications, 1);
  assert.equal(f.messaging.getUnreadNotificationCount(), 2);
  f.ui.markNotificationRead(f.ui.listNotifications()[0].id);
  assert.equal(f.ui.counts().notifications, 0);
  assert.equal(f.messaging.getUnreadNotificationCount(), 1);
});

test("service and booking starts preserve precise contexts and prevent duplicates", () => {
  const f = fixture();
  const service = f.ui.startService("design");
  assert.equal(f.ui.startService("design").id, service.id);
  const booking = f.ui.startBooking("booking-one");
  assert.equal(f.ui.startBooking("booking-one").id, booking.id);
  assert.notEqual(booking.id, service.id);
  assert.equal(booking.service_id, "design");
  assert.equal(booking.seller_profile_id, "seller-studio");
  assert.equal(booking.booking_id, "booking-one");
  assert.equal(f.ui.listInbox()[0].seller_name, "Studio Nyata");
  assert.equal(f.ui.listInbox()[0].service_title, "Identitas Brand");
});

test("service messaging rejects self, fictional creators, missing services, and guests", () => {
  const f = fixture();
  assert.match(f.ui.contactAvailability("buyer-studio"), /sendiri/);
  assert.match(f.ui.contactAvailability("editorial"), /editorial/);
  rejects(() => f.ui.startService("own"), "INVALID_CONTEXT");
  rejects(() => f.ui.startService("fictional"), "INVALID_CONTEXT");
  rejects(() => f.ui.startService("missing"), "INVALID_CONTEXT");
  assert.equal(f.raw(), null);
  f.as(null);
  assert.equal(f.ui.contactAvailability("seller-studio"), "");
  rejects(() => f.ui.startService("design"), "UNAUTHENTICATED");
});

test("booking starts reject other customers and seller-side private orders", () => {
  const f = fixture();
  rejects(() => f.ui.startBooking("booking-two"), "NOT_FOUND_OR_FORBIDDEN");
  f.as(f.seller);
  rejects(() => f.ui.startBooking("booking-one"), "NOT_FOUND_OR_FORBIDDEN");
  assert.equal(f.raw(), null);
});

test("thread privacy is rechecked after account switching for every operation", () => {
  const f = fixture();
  const c = f.ui.startService("design");
  f.ui.send(c.id, "Halo");
  f.as(f.other);
  assert.deepEqual(f.ui.listInbox(), []);
  for (const operation of [
    () => f.ui.getThread(c.id),
    () => f.ui.send(c.id, "Terlarang"),
    () => f.ui.markRead(c.id),
  ])
    rejects(operation, "NOT_FOUND_OR_FORBIDDEN");
  f.as(f.seller);
  assert.equal(f.messaging.getConversation(c.id).id, c.id);
  rejects(() => f.ui.getThread(c.id), "NOT_FOUND_OR_FORBIDDEN");
  f.as(f.buyer);
  assert.equal(f.ui.getThread(c.id).messages[0].content, "Halo");
});

test("customer unread counts, preview, ordering, and recipient read state stay consistent", () => {
  const f = fixture();
  const older = f.ui.startService("design");
  const newer = f.ui.startBooking("booking-one");
  f.as(f.seller);
  const sent = f.messaging.sendMessage(older.id, "Balasan kreator");
  f.as(f.buyer);
  assert.deepEqual(
    f.ui.listInbox().map((row) => row.id),
    [older.id],
  );
  const inbox = f.ui.listInbox();
  assert.deepEqual(inbox[0].conversation_ids, [older.id, newer.id]);
  assert.equal(inbox[0].last_message.id, sent.id);
  assert.equal(f.ui.counts().messages, 1);
  assert.equal(f.ui.counts().notifications, 1);
  assert.deepEqual(f.ui.markRead(older.id), { messages_marked_read: 1 });
  assert.equal(f.ui.counts().messages, 0);
  assert.equal(f.ui.counts().notifications, 0);
  assert.ok(f.ui.getThread(older.id).messages[0].read_at);
});

test("notification links are resolved to authorized customer contexts, never raw entity URLs", () => {
  const f = fixture();
  const c = f.ui.startBooking("booking-one");
  f.as(f.seller);
  f.messaging.sendMessage(c.id, "Halo kembali");
  f.bookings[0].status = "Accepted";
  f.messaging.notifyBookingEvent("booking-one");
  f.as(f.buyer);
  const notifications = f.ui.listNotifications();
  assert.ok(notifications.some((row) => row.to === `/messages/${c.id}`));
  assert.ok(notifications.some((row) => row.to === "/orders/booking-one"));
  f.ui.markNotificationRead(notifications[0].id);
  assert.equal(f.ui.listNotifications()[0].is_read, true);
  f.as(f.other);
  assert.deepEqual(f.ui.listNotifications(), []);
  rejects(
    () => f.ui.markNotificationRead(notifications[0].id),
    "NOT_FOUND_OR_FORBIDDEN",
  );
});

test("seller-side message notifications do not link to a customer thread", () => {
  const f = fixture();
  const c = f.ui.startService("design");
  f.ui.send(c.id, "Halo kreator");
  f.as(f.seller);
  assert.deepEqual(f.ui.listNotifications(), []);
  assert.equal(f.ui.counts().notifications, 0);
  const sellerNotice = f.messaging.listNotifications()[0];
  rejects(() => f.ui.markNotificationRead(sellerNotice.id), "NOT_FOUND_OR_FORBIDDEN");
  assert.equal(f.messaging.listNotifications()[0].is_read, false);
});

test("requested notifications derive real ownership, deduplicate, and never update payments", () => {
  const f = fixture();
  const first = f.ui.notifyRequested("booking-one");
  assert.equal(first.recipient_user_id, f.seller.id);
  assert.equal(first.actor_user_id, f.buyer.id);
  assert.equal(f.ui.notifyRequested("booking-one").id, first.id);
  assert.equal(f.bookings[0].status, "Requested");
  rejects(() => f.ui.notifyRequested("booking-two"), "NOT_FOUND_OR_FORBIDDEN");
  f.bookings[0].status = "Accepted";
  rejects(() => f.ui.notifyRequested("booking-one"), "INVALID_CONTEXT");
});

test("corrupted or unavailable storage is surfaced without silently replacing data", () => {
  const f = fixture();
  f.damage("{invalid");
  rejects(() => f.ui.listInbox(), "STORAGE_CORRUPT");
  rejects(() => f.ui.listNotifications(), "STORAGE_CORRUPT");
  rejects(() => f.ui.startService("design"), "STORAGE_CORRUPT");
  assert.equal(f.raw(), "{invalid");
  f.block();
  rejects(() => f.ui.counts(), "STORAGE_UNAVAILABLE");
  assert.equal(MESSAGING_KEY, "digarsa.demo.messaging.v1");
});

test("customer messaging return paths preserve nested IDs, query and hash while rejecting attacks", () => {
  for (const path of [
    "/messages",
    "/notifications",
    "/messages/conversation-a_b?from=notice#latest",
    "/service/design?chat=1",
    "/orders/booking-one",
  ])
    assert.equal(safeReturnTo(path), path);
  for (const path of [
    "//evil.test/messages",
    "https://evil.test/messages",
    "/messages/../admin",
    "/messages/%2F%2Fevil.test",
    "/messages/a%0a",
    "/messages/a\\b",
    "/notifications/https://evil.test",
  ])
    assert.equal(safeReturnTo(path), "/");
});

test("booking notification bridge emits actual seller decisions once without changing booking states", () => {
  const f = fixture();
  const stop = installBookingNotificationBridge(f);
  f.as(f.seller);
  f.bookings[0].status = "Accepted";
  f.emitBooking();
  f.emitBooking();
  f.bookings[1].status = "Declined";
  f.emitBooking();
  assert.equal(f.bookings[0].status, "Accepted");
  f.as(f.buyer);
  assert.deepEqual(
    f.ui.listNotifications().map((row) => row.type),
    ["booking_accepted"],
  );
  f.as(f.other);
  assert.deepEqual(
    f.ui.listNotifications().map((row) => row.type),
    ["booking_declined"],
  );
  stop();
});

test("booking bridge does not emit retrospective events on login or trust customer-side status changes", () => {
  const f = fixture();
  const stop = installBookingNotificationBridge(f);
  f.bookings[0].status = "Accepted";
  f.emitBooking();
  f.as(f.seller);
  f.emitBooking();
  f.as(f.buyer);
  assert.equal(f.ui.listNotifications().length, 0);
  stop();
});

test("notification storage failure does not undo a successful booking change", () => {
  const f = fixture();
  const errors = [];
  f.as(f.seller);
  const stop = installBookingNotificationBridge({
    ...f,
    onError: (error) => errors.push(error),
  });
  f.damage("corrupt");
  f.bookings[0].status = "Accepted";
  assert.doesNotThrow(() => f.emitBooking());
  assert.equal(errors[0].code, "STORAGE_CORRUPT");
  assert.equal(f.bookings[0].status, "Accepted");
  assert.equal(f.raw(), "corrupt");
  stop();
});
