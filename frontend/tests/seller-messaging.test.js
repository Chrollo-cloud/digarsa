import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createDemoStore } from "../src/features/account/demoStore.js";
import { createCustomerStore } from "../src/features/customer/customerStore.js";
import { createMessagingAdapters } from "../src/features/messaging/adapters.js";
import { createMessagingStore } from "../src/features/messaging/messagingStore.js";
import { createSellerStore } from "../src/features/seller/sellerStore.js";
import { createSellerMessaging } from "../src/features/seller/sellerMessaging.js";

const password = "Demo-password-123";
const sellerProfileInput = (name) => ({
  name: `${name} Studio`,
  category: "Branding",
  city: "Makassar",
  bio: "Studio kreatif yang membantu bisnis membangun identitas visual.",
  image: "",
  portfolioLink: "",
  specialties: "Branding",
});
const serviceInput = {
  title: "Identitas visual lengkap",
  category: "Branding",
  description:
    "Paket identitas visual mencakup logo, palet warna dan panduan pemakaian.",
  price: "1500000",
  delivery: "Remote",
  turnaround: "7 hari kerja",
  availability: "Open",
  image: "",
};

async function fixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let sequence = 0;
  let tick = 0;
  const accounts = createDemoStore(storage, webcrypto);
  const catalog = [];
  const creators = [];
  const customers = createCustomerStore({
    storage,
    currentUser: () => accounts.current(),
    catalog,
    creators,
    randomId: () => `booking-${++sequence}`,
  });
  const sellerStore = createSellerStore({
    storage,
    currentUser: () => accounts.current(),
    baseServices: () => [],
    randomId: () => `service-${++sequence}`,
  });
  const messaging = createMessagingStore({
    ...createMessagingAdapters({
      accounts,
      customers,
      getServices: () => catalog,
    }),
    storage,
    randomId: () => `message-${++sequence}`,
    now: () => new Date(Date.UTC(2026, 10, 8, 0, 0, tick++)).toISOString(),
  });
  const sellerMessaging = createSellerMessaging({
    messaging,
    accounts,
    customers,
    getServices: () => catalog,
  });
  async function addSeller(name, email) {
    await accounts.register({ name, email, password });
    const profile = accounts.activateSeller(sellerProfileInput(name));
    const service = sellerStore.create(serviceInput);
    catalog.push({
      ...service,
      creatorId: profile.id,
      studio: profile.name,
    });
    creators.push({
      id: profile.id,
      ownerUserId: profile.ownerUserId,
      name: profile.name,
    });
    return { user: accounts.current(), profile, service };
  }
  return {
    values,
    accounts,
    customers,
    messaging,
    sellerMessaging,
    addSeller,
    addCustomer: (name, email) => accounts.register({ name, email, password }),
  };
}

test("Seller inbox resolves Customer identity and only lists its own Seller Profile conversations", async () => {
  const f = await fixture();
  const sellerA = await f.addSeller("Seller A", "seller-a@test.dev");
  const sellerB = await f.addSeller("Seller B", "seller-b@test.dev");
  const customer = await f.addCustomer("Nadia Customer", "nadia@test.dev");
  f.accounts.updateProfile(
    { avatarUrl: "https://images.example.test/nadia.png" },
    { expectedUserId: customer.id },
  );
  const conversationA = f.messaging.getOrCreateConversation({
    seller_profile_id: sellerA.profile.id,
    service_id: sellerA.service.id,
  });
  f.messaging.sendMessage(conversationA.id, "Halo, saya tertarik berdiskusi.");
  const conversationB = f.messaging.getOrCreateConversation({
    seller_profile_id: sellerB.profile.id,
    service_id: sellerB.service.id,
  });
  f.messaging.sendMessage(conversationB.id, "Halo Seller B.");

  await f.accounts.login("seller-a@test.dev", password);
  const inbox = f.sellerMessaging.listInbox();
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, conversationA.id);
  assert.equal(inbox[0].customer_name, "Nadia Customer");
  assert.equal(inbox[0].customer_avatar_url, "https://images.example.test/nadia.png");
  assert.equal(inbox[0].last_message.content, "Halo, saya tertarik berdiskusi.");
  assert.equal(inbox[0].unread_count, 1);
  assert.throws(
    () => f.sellerMessaging.getThread(conversationB.id),
    (error) => error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  assert.equal(f.sellerMessaging.getOrCreateConversation, undefined);
});

test("Seller reads and replies through the shared message records", async () => {
  const f = await fixture();
  const seller = await f.addSeller("Seller", "seller@test.dev");
  const customer = await f.addCustomer("Raka Customer", "raka@test.dev");
  const conversation = f.messaging.getOrCreateConversation({
    seller_profile_id: seller.profile.id,
    service_id: seller.service.id,
  });
  const sentByCustomer = f.messaging.sendMessage(conversation.id, "Apakah bisa diskusi hari ini?");
  assert.equal(sentByCustomer.sender_user_id, customer.id);

  await f.accounts.login("seller@test.dev", password);
  assert.equal(f.sellerMessaging.listInbox()[0].unread_count, 1);
  const thread = f.sellerMessaging.getThread(conversation.id);
  assert.equal(thread.messages[0].content, "Apakah bisa diskusi hari ini?");
  assert.equal(f.sellerMessaging.markRead(conversation.id).messages_marked_read, 1);
  assert.equal(f.sellerMessaging.listInbox()[0].unread_count, 0);
  const reply = f.sellerMessaging.send(conversation.id, "Tentu, saya siap berdiskusi.", {
    client_event_id: "seller-reply-1",
  });
  assert.equal(reply.sender_user_id, seller.user.id);
  assert.notEqual(reply.sender_user_id, seller.profile.id);

  await f.accounts.login("raka@test.dev", password);
  const messages = f.messaging.listMessages(conversation.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].sender_user_id, seller.user.id);
  assert.equal(messages[1].content, "Tentu, saya siap berdiskusi.");
  assert.equal(f.messaging.getUnreadCount(conversation.id), 1);
});

test("Customer avatar lookup is seller-scoped and uses initials when absent", async () => {
  const f = await fixture();
  const seller = await f.addSeller("Seller", "seller@test.dev");
  const customer = await f.addCustomer("Dewi Customer", "dewi@test.dev");
  const conversation = f.messaging.getOrCreateConversation({
    seller_profile_id: seller.profile.id,
    service_id: seller.service.id,
  });
  await f.accounts.login("dewi@test.dev", password);
  assert.throws(() => f.accounts.customerIdentities([customer.id]), /Akses ditolak/);
  await f.accounts.login("seller@test.dev", password);
  const thread = f.sellerMessaging.getThread(conversation.id);
  assert.equal(thread.conversation.customer_name, "Dewi Customer");
  assert.equal(thread.conversation.customer_avatar_url, "");
});

test("Seller receives shared message notifications and can mark them read", async () => {
  const f = await fixture();
  const seller = await f.addSeller("Seller", "seller@test.dev");
  const customer = await f.addCustomer("Rani Customer", "rani@test.dev");
  const conversation = f.messaging.getOrCreateConversation({
    seller_profile_id: seller.profile.id,
    service_id: seller.service.id,
  });
  const message = f.messaging.sendMessage(conversation.id, "Saya ingin bertanya.");

  await f.accounts.login("seller@test.dev", password);
  const [notice] = f.sellerMessaging.listNotifications();
  assert.equal(notice.type, "new_message");
  assert.equal(notice.recipient_user_id, seller.user.id);
  assert.equal(notice.related_entity_id, message.id);
  assert.equal(notice.to, `/seller-dashboard/messages/${conversation.id}`);
  assert.equal(f.sellerMessaging.getUnreadNotificationCount(), 1);
  f.sellerMessaging.markNotificationRead(notice.id);
  assert.equal(f.sellerMessaging.getUnreadNotificationCount(), 0);

  await f.accounts.login("rani@test.dev", password);
  assert.equal(f.messaging.listMessages(conversation.id)[0].sender_user_id, customer.id);
});

test("Seller receives one deduplicated notification for a verified new booking", async () => {
  const f = await fixture();
  const seller = await f.addSeller("Seller", "seller@test.dev");
  const customer = await f.addCustomer("Tara Customer", "tara@test.dev");
  const booking = f.customers.createBooking(
    seller.service.id,
    {
      requirements: "Saya membutuhkan bantuan branding untuk bisnis baru.",
      description: "Mohon diskusikan kebutuhan identitas visual untuk usaha saya.",
    },
    { confirmed: true, expectedUserId: customer.id },
  );

  f.messaging.notifyBookingEvent(booking.id);
  f.messaging.notifyBookingEvent(booking.id);
  await f.accounts.login("seller@test.dev", password);
  const notices = f.sellerMessaging.listNotifications();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, "booking_requested");
  assert.equal(notices[0].related_entity_id, booking.id);
  assert.equal(notices[0].to, `/seller-dashboard/orders/${booking.id}`);
});

test("Seller cannot read or mark another Seller's notifications", async () => {
  const f = await fixture();
  const sellerA = await f.addSeller("Seller A", "seller-a@test.dev");
  const sellerB = await f.addSeller("Seller B", "seller-b@test.dev");
  await f.addCustomer("Nia Customer", "nia@test.dev");
  const conversation = f.messaging.getOrCreateConversation({
    seller_profile_id: sellerB.profile.id,
    service_id: sellerB.service.id,
  });
  f.messaging.sendMessage(conversation.id, "Pesan untuk seller B.");

  await f.accounts.login("seller-a@test.dev", password);
  assert.equal(f.sellerMessaging.listNotifications().length, 0);
  assert.throws(
    () => f.sellerMessaging.markNotificationRead("notification-not-owned"),
    (error) => error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  assert.equal(sellerA.profile.id === sellerB.profile.id, false);
});
