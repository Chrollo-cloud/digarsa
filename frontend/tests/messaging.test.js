import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import { createMessagingStore } from "../src/features/messaging/messagingStore.js";
import {
  MESSAGING_KEY,
  fields,
  messageSafety,
  notificationTypes,
} from "../src/features/messaging/contracts.js";
import { createMessagingAdapters } from "../src/features/messaging/adapters.js";
import { createDemoStore } from "../src/features/account/demoStore.js";
import { createCustomerStore } from "../src/features/customer/customerStore.js";

const buyer = {
  id: "customer-user",
  sellerProfileId: "customer-own-profile",
  capabilities: ["buyer", "seller"],
};
const seller = {
  id: "seller-user",
  sellerProfileId: "seller-profile",
  capabilities: ["buyer", "seller"],
};
const outsider = {
  id: "other-user",
  sellerProfileId: "other-profile",
  capabilities: ["buyer", "seller"],
  permissions: ["admin:access"],
};
const general = { seller_profile_id: "seller-profile" };
function fixture(overrides = {}) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let user = buyer;
  let sequence = 0;
  let tick = 0;
  const profiles = [
    { id: "seller-profile", owner_user_id: seller.id },
    { id: "other-profile", owner_user_id: outsider.id },
    { id: "customer-own-profile", owner_user_id: buyer.id },
  ];
  const catalog = [
    { id: "service-a", seller_profile_id: "seller-profile" },
    { id: "service-other", seller_profile_id: "other-profile" },
  ];
  const bookings = [
    {
      id: "booking-a",
      customer_user_id: buyer.id,
      seller_profile_id: "seller-profile",
      service_id: "service-a",
      status: "Requested",
    },
    {
      id: "booking-b",
      customer_user_id: buyer.id,
      seller_profile_id: "seller-profile",
      service_id: "service-a",
      status: "Requested",
    },
  ];
  const reviews = [
    {
      id: "review-a",
      customer_user_id: buyer.id,
      seller_profile_id: "seller-profile",
      booking_id: "booking-a",
    },
  ];
  const options = {
    storage,
    currentUser: () => user,
    resolveSellerProfile: (id) => profiles.find((row) => row.id === id),
    resolveService: (id) => catalog.find((row) => row.id === id),
    resolveBooking: (id) =>
      bookings.find(
        (row) =>
          row.id === id &&
          (row.customer_user_id === user?.id ||
            profiles.find((p) => p.id === row.seller_profile_id)
              ?.owner_user_id === user?.id),
      ),
    resolveReview: (id) => reviews.find((row) => row.id === id),
    randomId: () => `stable-${++sequence}`,
    now: () => new Date(Date.UTC(2026, 10, 8, 0, 0, tick++)).toISOString(),
    ...overrides,
  };
  return {
    store: createMessagingStore(options),
    storage,
    values,
    options,
    profiles,
    catalog,
    bookings,
    reviews,
    as: (next) => {
      user = next;
    },
  };
}
const rejectsCode = (fn, code) =>
  assert.throws(
    fn,
    (error) => error.name === "MessagingError" && error.code === code,
  );

test("models expose exactly the agreed snake_case fields and stable identifiers", () => {
  const f = fixture();
  const conversation = f.store.getOrCreateConversation(general);
  assert.deepEqual(
    Object.keys(conversation).sort(),
    [...fields.conversation].sort(),
  );
  assert.equal(conversation.service_id, null);
  assert.equal(conversation.booking_id, null);
  assert.equal(conversation.last_message_at, null);
  const message = f.store.sendMessage(conversation.id, "Pesan pertama.");
  assert.deepEqual(Object.keys(message).sort(), [...fields.message].sort());
  assert.equal(message.sender_user_id, buyer.id);
  const reloaded = createMessagingStore(f.options);
  assert.equal(reloaded.getConversation(conversation.id).id, conversation.id);
  assert.equal(reloaded.listMessages(conversation.id)[0].id, message.id);
  f.as(seller);
  const notification = reloaded.listNotifications()[0];
  assert.deepEqual(
    Object.keys(notification).sort(),
    [...fields.notification].sort(),
  );
  assert.equal(notification.recipient_user_id, seller.id);
  assert.notEqual(notification.recipient_user_id, seller.sellerProfileId);
});

test("customers and actual Seller Profile owners can access the same conversation", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  f.store.sendMessage(row.id, "Halo kreator.");
  f.as(seller);
  assert.equal(f.store.getConversation(row.id).customer_user_id, buyer.id);
  const reply = f.store.sendMessage(row.id, "Halo, mari bahas kebutuhanmu.");
  assert.equal(reply.sender_user_id, seller.id);
  f.as(buyer);
  assert.equal(f.store.listMessages(row.id).length, 2);
  const exported = f.store.getConversation(row.id);
  exported.customer_user_id = "tampered";
  assert.equal(f.store.getConversation(row.id).customer_user_id, buyer.id);
});

test("seller IDs are not user IDs; admin and arbitrary outsiders get no message access", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  const notification = f.store.sendMessage(row.id, "Pesan pribadi.");
  for (const user of [
    outsider,
    { id: "seller-profile", sellerProfileId: "seller-profile" },
    { ...seller, sellerProfileId: "wrong-profile" },
  ]) {
    f.as(user);
    assert.deepEqual(f.store.listConversations(), []);
    for (const action of [
      () => f.store.getConversation(row.id),
      () => f.store.listMessages(row.id),
      () => f.store.sendMessage(row.id, "Intrusi"),
      () => f.store.markConversationRead(row.id),
      () => f.store.getUnreadCount(row.id),
    ])
      rejectsCode(action, "NOT_FOUND_OR_FORBIDDEN");
    assert.equal(f.store.getUnreadCount(), 0);
  }
  assert.ok(notification.id);
});

test("no method lets a caller impersonate a sender or recipient", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  rejectsCode(
    () => f.store.sendMessage(row.id, "Hello", { sender_user_id: seller.id }),
    "INVALID_INPUT",
  );
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        ...general,
        customer_user_id: "someone-else",
      }),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  assert.equal(f.store.createNotification, undefined);
  assert.equal(f.store.emitNotification, undefined);
});

test("getOrCreate deduplicates canonical contexts and keeps distinct booking contexts", () => {
  const f = fixture();
  const generalRow = f.store.getOrCreateConversation(general);
  assert.equal(f.store.getOrCreateConversation(general).id, generalRow.id);
  const serviceRow = f.store.getOrCreateConversation({
    ...general,
    service_id: "service-a",
  });
  const bookingRow = f.store.getOrCreateConversation({
    booking_id: "booking-a",
  });
  assert.equal(
    f.store.getOrCreateConversation({
      ...general,
      service_id: "service-a",
      customer_user_id: buyer.id,
      booking_id: "booking-a",
    }).id,
    bookingRow.id,
  );
  const secondBooking = f.store.getOrCreateConversation({
    booking_id: "booking-b",
  });
  assert.equal(
    new Set([generalRow.id, serviceRow.id, bookingRow.id, secondBooking.id])
      .size,
    4,
  );
  f.as(seller);
  assert.equal(
    f.store.getOrCreateConversation({ ...general, customer_user_id: buyer.id })
      .id,
    generalRow.id,
  );
});

test("new seller-initiated conversations require a verified booking context", () => {
  const f = fixture();
  f.as(seller);
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        ...general,
        customer_user_id: buyer.id,
      }),
    "INVALID_CONTEXT",
  );
  assert.equal(
    f.store.getOrCreateConversation({ booking_id: "booking-a" })
      .customer_user_id,
    buyer.id,
  );
});

test("service and booking relationships are validated, including historical booking service deletion", () => {
  const f = fixture();
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        ...general,
        service_id: "service-other",
      }),
    "INVALID_CONTEXT",
  );
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({ ...general, service_id: "missing" }),
    "INVALID_CONTEXT",
  );
  rejectsCode(
    () => f.store.getOrCreateConversation({ booking_id: "missing" }),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        booking_id: "booking-a",
        seller_profile_id: "other-profile",
      }),
    "INVALID_CONTEXT",
  );
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        booking_id: "booking-a",
        customer_user_id: outsider.id,
      }),
    "INVALID_CONTEXT",
  );
  rejectsCode(
    () =>
      f.store.getOrCreateConversation({
        seller_profile_id: buyer.sellerProfileId,
      }),
    "INVALID_CONTEXT",
  );
  f.catalog.splice(0, 1);
  assert.equal(
    f.store.getOrCreateConversation({ booking_id: "booking-a" }).service_id,
    "service-a",
  );
});

test("messages trim valid content, reject empty/invalid/oversized input, and order chronologically", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  for (const value of [
    "",
    "  ",
    "\u200B",
    null,
    {},
    "x".repeat(4001),
    "bad\u0000message",
  ])
    rejectsCode(() => f.store.sendMessage(row.id, value), "INVALID_INPUT");
  const a = f.store.sendMessage(row.id, "  Halo\nKreator  ");
  const b = f.store.sendMessage(row.id, "Pesan kedua.");
  assert.equal(a.content, "Halo\nKreator");
  assert.notEqual(a.id, b.id);
  assert.deepEqual(
    f.store.listMessages(row.id).map((message) => message.id),
    [a.id, b.id],
  );
  assert.equal(f.store.getConversation(row.id).last_message_at, b.created_at);
});

test("message retries are idempotent and do not duplicate new_message notifications", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  const sent = f.store.sendMessage(row.id, "Pesan aman", {
    client_event_id: "request-1",
  });
  const before = f.values.get(MESSAGING_KEY);
  assert.equal(
    f.store.sendMessage(row.id, "Pesan aman", { client_event_id: "request-1" })
      .id,
    sent.id,
  );
  assert.equal(f.values.get(MESSAGING_KEY), before);
  rejectsCode(
    () =>
      f.store.sendMessage(row.id, "Isi berbeda", {
        client_event_id: "request-1",
      }),
    "IDEMPOTENCY_CONFLICT",
  );
  f.as(seller);
  assert.equal(f.store.getUnreadNotificationCount(), 1);
});

test("unread state belongs to the receiving account and mark-read is idempotent", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  f.store.sendMessage(row.id, "Halo");
  assert.equal(f.store.getUnreadCount(), 0);
  assert.deepEqual(f.store.markConversationRead(row.id), {
    messages_marked_read: 0,
  });
  assert.equal(f.store.listMessages(row.id)[0].read_at, null);
  f.as(seller);
  assert.equal(f.store.getUnreadCount(row.id), 1);
  assert.deepEqual(f.store.markConversationRead(row.id), {
    messages_marked_read: 1,
  });
  const read = f.store.listMessages(row.id)[0].read_at;
  assert.equal(f.store.getUnreadNotificationCount(), 0);
  f.store.markConversationRead(row.id);
  assert.equal(f.store.listMessages(row.id)[0].read_at, read);
  f.store.sendMessage(row.id, "Balasan");
  f.as(buyer);
  assert.equal(f.store.getUnreadCount(), 1);
  assert.equal(f.store.listMessages(row.id)[0].read_at, read);
});

test("notification marking is isolated and does not imply a message has been read", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  f.store.sendMessage(row.id, "Halo");
  f.as(seller);
  const notification = f.store.listNotifications()[0];
  assert.equal(f.store.markNotificationRead(notification.id).is_read, true);
  assert.equal(f.store.getUnreadCount(), 1);
  f.as(buyer);
  assert.deepEqual(f.store.listNotifications(), []);
  rejectsCode(
    () => f.store.markNotificationRead(notification.id),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  f.as(null);
  rejectsCode(() => f.store.listNotifications(), "UNAUTHENTICATED");
});

test("booking notifications infer type and recipients from verified booking events", () => {
  const f = fixture();
  const requested = f.store.notifyBookingEvent("booking-a");
  assert.equal(requested.type, "booking_requested");
  assert.equal(requested.recipient_user_id, seller.id);
  assert.equal(f.store.notifyBookingEvent("booking-a").id, requested.id);
  f.bookings[0].status = "Accepted";
  rejectsCode(
    () => f.store.notifyBookingEvent("booking-a"),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  f.as(seller);
  const accepted = f.store.notifyBookingEvent("booking-a");
  assert.equal(accepted.type, "booking_accepted");
  assert.equal(accepted.recipient_user_id, buyer.id);
  f.bookings[1].status = "Declined";
  assert.equal(
    f.store.notifyBookingEvent("booking-b").type,
    "booking_declined",
  );
  f.bookings[0].status = "Completed";
  assert.equal(
    f.store.notifyBookingEvent("booking-a").type,
    "booking_completed",
  );
  f.bookings[0].status = "Paid";
  rejectsCode(
    () => f.store.notifyBookingEvent("booking-a"),
    "UNSUPPORTED_EVENT",
  );
});

test("new_review requires a verified review and a matching completed booking", () => {
  const f = fixture();
  rejectsCode(() => f.store.notifyReviewEvent("review-a"), "INVALID_CONTEXT");
  f.bookings[0].status = "Completed";
  const review = f.store.notifyReviewEvent("review-a");
  assert.equal(review.type, "new_review");
  assert.equal(review.recipient_user_id, seller.id);
  assert.equal(f.store.notifyReviewEvent("review-a").id, review.id);
  f.as(seller);
  rejectsCode(
    () => f.store.notifyReviewEvent("review-a"),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  const noSource = fixture({ resolveReview: undefined });
  rejectsCode(
    () => noSource.store.notifyReviewEvent("review-a"),
    "UNSUPPORTED_EVENT",
  );
  assert.deepEqual(notificationTypes, [
    "new_message",
    "booking_requested",
    "booking_accepted",
    "booking_declined",
    "booking_completed",
    "new_review",
  ]);
});

test("corrupted records, foreign keys, duplicates and idempotency metadata are rejected without overwrite", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  f.store.sendMessage(row.id, "Halo", { client_event_id: "event-a" });
  const good = JSON.parse(f.values.get(MESSAGING_KEY));
  const corruptions = [
    () => "{broken",
    (db) => {
      db.version = 2;
    },
    (db) => {
      db.messages[0].senderUserId = buyer.id;
    },
    (db) => {
      db.messages[0].conversation_id = "missing";
    },
    (db) => {
      db.messages[0].read_at = "bad-date";
    },
    (db) => {
      db.conversations.push({
        ...db.conversations[0],
        id: "duplicate-context",
      });
    },
    (db) => {
      db.messages.push(db.messages[0]);
    },
    (db) => {
      db.notification_events[0].entity_id = "missing";
    },
    (db) => {
      db.message_requests[0].key = JSON.stringify([
        "other-user",
        row.id,
        "event-a",
      ]);
    },
  ];
  for (const mutate of corruptions) {
    const db = structuredClone(good);
    const raw = mutate(db) || JSON.stringify(db);
    f.values.set(MESSAGING_KEY, raw);
    rejectsCode(() => f.store.listMessages(row.id), "STORAGE_CORRUPT");
    rejectsCode(
      () => f.store.sendMessage(row.id, "Do not overwrite"),
      "STORAGE_CORRUPT",
    );
    assert.equal(f.values.get(MESSAGING_KEY), raw);
  }
});

test("quota/read failures and ID collisions cannot partially store messages/notifications", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  const before = f.values.get(MESSAGING_KEY);
  const failing = createMessagingStore({
    ...f.options,
    storage: {
      getItem: f.storage.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    },
  });
  rejectsCode(
    () => failing.sendMessage(row.id, "Hello"),
    "STORAGE_UNAVAILABLE",
  );
  assert.equal(f.values.get(MESSAGING_KEY), before);
  const unreadable = createMessagingStore({
    ...f.options,
    storage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
  });
  rejectsCode(() => unreadable.listConversations(), "STORAGE_UNAVAILABLE");
  const collision = fixture({ randomId: () => "same" });
  const c = collision.store.getOrCreateConversation(general);
  collision.store.sendMessage(c.id, "One");
  rejectsCode(() => collision.store.sendMessage(c.id, "Two"), "ID_COLLISION");
  assert.equal(collision.store.listMessages(c.id).length, 1);
});

test("payment solicitation and arbitrary user markup never become trusted payment instructions", () => {
  assert.equal(
    messageSafety("Transfer langsung ke rekening pribadi 1234567890")
      .off_platform_payment_suspected,
    true,
  );
  assert.equal(
    messageSafety("Halo kreator").is_trusted_payment_instruction,
    false,
  );
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  const message = f.store.sendMessage(
    row.id,
    "<script>pay()</script> Transfer langsung ke rekening 1234567890",
  );
  assert.equal(
    messageSafety(message.content).is_trusted_payment_instruction,
    false,
  );
  f.as(seller);
  assert.equal(
    f.store.listNotifications()[0].message.includes("<script>"),
    false,
  );
  assert.equal(f.bookings[0].status, "Requested");
});

test("subscribers are notified only after successful writes and can unsubscribe", () => {
  const f = fixture();
  let count = 0;
  const stop = f.store.subscribe(() => count++);
  const row = f.store.getOrCreateConversation(general);
  assert.equal(count, 1);
  f.store.getOrCreateConversation(general);
  assert.equal(count, 1);
  stop();
  f.store.sendMessage(row.id, "Another message");
  assert.equal(count, 1);
});

test("real Phase 5/6 adapters preserve user IDs, booking ownership, account switching and events", async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const accounts = createDemoStore(storage, webcrypto);
  const pw = "Demo-password-123";
  const sellerUser = await accounts.register({
    name: "Seller Demo",
    email: "seller@example.test",
    password: pw,
  });
  const profile = accounts.activateSeller({
    name: "Studio Demo",
    category: "Branding",
    city: "Makassar",
    bio: "Studio kreatif untuk proyek identitas visual bisnis lokal.",
  });
  const customer = await accounts.register({
    name: "Customer Demo",
    email: "buyer@example.test",
    password: pw,
  });
  const catalog = [
    {
      id: "service-real",
      creatorId: profile.id,
      title: "Branding",
      price: 1000000,
      availability: "Open",
      delivery: "Remote",
    },
  ];
  const customers = createCustomerStore({
    storage,
    currentUser: () => accounts.current(),
    catalog,
    creators: [
      { id: profile.id, name: profile.name, ownerUserId: sellerUser.id },
    ],
    randomId: randomUUID,
  });
  const booking = customers.createBooking(
    "service-real",
    {
      requirements: "Logo dan pedoman visual usaha.",
      description: "Proyek identitas visual untuk bisnis lokal.",
    },
    { confirmed: true, expectedUserId: customer.id },
  );
  const messaging = createMessagingStore({
    storage,
    ...createMessagingAdapters({
      accounts,
      customers,
      getServices: () => catalog,
    }),
    randomId: randomUUID,
  });
  const conversation = messaging.getOrCreateConversation({
    booking_id: booking.id,
  });
  assert.equal(conversation.seller_profile_id, profile.id);
  messaging.sendMessage(conversation.id, "Halo studio.");
  messaging.notifyBookingEvent(booking.id);
  await accounts.login("seller@example.test", pw);
  assert.equal(messaging.getUnreadCount(), 1);
  assert.equal(messaging.getUnreadNotificationCount(), 2);
  customers.respondToBooking(booking.id, "accept");
  messaging.notifyBookingEvent(booking.id);
  messaging.markConversationRead(conversation.id);
  await accounts.login("buyer@example.test", pw);
  assert.equal(messaging.listNotifications()[0].type, "booking_accepted");
  assert.equal(customers.getBooking(booking.id).status, "Accepted");
  accounts.logout();
  rejectsCode(
    () => messaging.getConversation(conversation.id),
    "UNAUTHENTICATED",
  );
});

test("one account can be a buyer in one conversation and seller in another without mixing unread state", () => {
  const f = fixture();
  const buying = f.store.getOrCreateConversation(general);
  f.as(outsider);
  const selling = f.store.getOrCreateConversation({
    seller_profile_id: buyer.sellerProfileId,
  });
  f.store.sendMessage(selling.id, "Halo, saya mencari layananmu.");
  f.as(buyer);
  assert.equal(f.store.listConversations().length, 2);
  assert.equal(f.store.getUnreadCount(buying.id), 0);
  assert.equal(f.store.getUnreadCount(selling.id), 1);
  f.store.markConversationRead(buying.id);
  assert.equal(f.store.getUnreadCount(selling.id), 1);
  const reply = f.store.sendMessage(selling.id, "Bisa, mari bahas.");
  assert.equal(reply.sender_user_id, buyer.id);
});

test("orphaned seller profiles and failing dependencies do not overwrite messages", () => {
  const f = fixture();
  const row = f.store.getOrCreateConversation(general);
  const before = f.values.get(MESSAGING_KEY);
  f.profiles.shift();
  rejectsCode(() => f.store.sendMessage(row.id, "Halo"), "INVALID_CONTEXT");
  assert.equal(f.values.get(MESSAGING_KEY), before);
  const dependency = fixture({
    resolveSellerProfile: () => {
      throw new Error("source corrupt");
    },
  });
  rejectsCode(
    () => dependency.store.getOrCreateConversation(general),
    "DEPENDENCY_UNAVAILABLE",
  );
  const unavailableSession = fixture({
    currentUser: () => {
      throw new Error("session corrupt");
    },
  });
  rejectsCode(
    () => unavailableSession.store.listConversations(),
    "SESSION_UNAVAILABLE",
  );
});

test("clock rollback preserves chronological ordering and stored record invariants", () => {
  let calls = 0;
  const f = fixture({
    now: () =>
      [
        "2026-11-08T12:00:00.000Z",
        "2026-11-08T12:01:00.000Z",
        "2026-11-08T11:59:00.000Z",
      ][calls++],
  });
  const row = f.store.getOrCreateConversation(general);
  const first = f.store.sendMessage(row.id, "First");
  const second = f.store.sendMessage(row.id, "Second");
  assert.equal(second.created_at, first.created_at);
  assert.deepEqual(
    f.store.listMessages(row.id).map((message) => message.content),
    ["First", "Second"],
  );
});
