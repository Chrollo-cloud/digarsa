import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createDemoStore, ACCOUNT_KEY } from "../src/features/account/demoStore.js";
import { createCustomerStore, CUSTOMER_KEY } from "../src/features/customer/customerStore.js";
import { cartSelection, checkoutGroups, checkoutTotal, checkoutDestination, parseCheckout } from "../src/features/customer/checkoutModel.js";
import { createMessagingStore } from "../src/features/messaging/messagingStore.js";
import { createMessagingAdapters } from "../src/features/messaging/adapters.js";
import { createReviewStore } from "../src/features/reviews/reviewStore.js";
import { createReviewAdapters } from "../src/features/reviews/reviewAdapters.js";
import { recoverLocalDemo } from "../dev/recovery.js";
import { safeReturnTo } from "../src/features/account/redirects.js";

const brief = { requirements: "Logo dan materi peluncuran bisnis kreatif.", description: "Kami membutuhkan hasil kreatif untuk kampanye usaha lokal yang baru.", requestedDate: "2099-01-01", location: "Studio proyek QA sintetis" };
async function fixture() {
  const records = new Map();
  let failure = "";
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem(key, value) {
      if (key === CUSTOMER_KEY && failure === "before") throw new Error("quota");
      records.set(key, value);
      if (key === CUSTOMER_KEY && failure === "after") throw new Error("uncertain");
    },
  };
  const accounts = createDemoStore(storage, webcrypto);
  const password = webcrypto.randomUUID();
  const people = [];
  const users = {};
  for (const label of ["sellerA", "sellerB", "buyer", "other"]) {
    users[label] = await accounts.register({ name: `Akun ${label}`, email: `${label.toLowerCase()}@example.test`, password });
    if (label.startsWith("seller")) people.push(accounts.activateSeller({ name: `Studio ${label}`, category: "Branding", city: "Makassar", bio: "Studio kreatif lokal untuk pengujian checkout lintas kreator.", specialties: "Branding" }));
  }
  const catalog = [0, 1, 2].map(index => ({ id: `service-${index}`, creatorId: people[index === 0 ? 0 : 1].id, title: `Layanan ${index}`, price: (index + 1) * 100000, delivery: index === 1 ? "Onsite" : "Remote", availability: "Open" }));
  let enabled = true;
  const options = { storage, currentUser: () => accounts.current(), catalog, creators: people, resolveSellerProfile: id => accounts.getBookableSeller(id), allowDemoPayment: () => enabled, randomId: () => webcrypto.randomUUID() };
  const orders = createCustomerStore(options);
  const as = label => accounts.login(`${label.toLowerCase()}@example.test`, password);
  await as("buyer");
  catalog.forEach(row => orders.addToCart(row.id));
  const entries = catalog.map(row => ({ serviceId: row.id, input: { ...brief } }));
  const confirm = { checkoutId: "checkout-retry-1", confirmed: true, expectedUserId: users.buyer.id };
  return { records, storage, accounts, people, catalog, users, orders, options, as, password, entries, confirm,
    fail: mode => { failure = mode; }, paymentEnabled: value => { enabled = value; } };
}

test("cart selects/deselects eligible distinct services, groups real Sellers, and totals selected prices", () => {
  const catalog = [{ id: "a", creatorId: "seller-a", price: 12 }, { id: "b", creatorId: "seller-b", price: 23 }];
  const eligible = id => id === "bad" ? "unavailable" : "";
  assert.deepEqual(cartSelection(["a", "a", "b", "bad"], ["a", "b", "bad"], eligible), ["a", "b"]);
  assert.deepEqual(cartSelection(["a", "b"], [], eligible), []);
  assert.equal(checkoutTotal(["a", "b"], catalog), 35);
  assert.equal(checkoutTotal(["b"], catalog), 23);
  assert.deepEqual(checkoutGroups(["a", "b"], catalog, []).map(row => row.id), ["seller-a", "seller-b"]);
  const path = checkoutDestination(["a", "b"], "checkout-test");
  assert.deepEqual(parseCheckout(new URL(path, "http://localhost").searchParams), { ids: ["a", "b"], checkoutId: "checkout-test" });
  for (const query of ["", "attempt=checkout-a&service=a&service=a", "attempt=bad&service=a", "attempt=checkout-a&service=../bad"])
    assert.throws(() => parseCheckout(new URLSearchParams(query)));
});

test("multi-Seller checkout creates three independent bookings and exposes only each Seller's own orders", async () => {
  const f = await fixture();
  const saved = f.orders.submitCheckout(f.entries, f.confirm);
  assert.equal(saved.length, 3);
  assert.equal(new Set(saved.map(row => row.id)).size, 3);
  assert.equal(new Set(saved.map(row => row.checkoutId)).size, 1);
  assert.deepEqual(f.orders.view().cart, []);
  assert.equal(f.orders.view().bookings.length, 3);
  await f.as("sellerA");
  assert.equal(f.orders.sellerView().bookings.length, 1);
  assert.equal(f.orders.view().bookings.length, 0);
  assert.throws(() => f.orders.getBooking(saved[0].id));
  assert.throws(() => f.orders.respondToBooking(saved[1].id, "accept"));
  await f.as("sellerB");
  assert.equal(f.orders.sellerView().bookings.length, 2);
  f.orders.respondToBooking(saved[1].id, "decline", { reason: "Jadwal penuh" });
  await f.as("buyer");
  assert.equal(f.orders.getBooking(saved[1].id).declineReason, "Jadwal penuh");
  assert.equal(f.orders.getBooking(saved[2].id).status, "Requested");
});

test("checkout validates all per-service fields and eligibility before any mutation", async () => {
  const f = await fixture();
  const original = f.records.get(CUSTOMER_KEY);
  for (const key of ["requestedDate", "requirements", "description", "location"]) {
    const entries = structuredClone(f.entries);
    entries[1].input[key] = "";
    assert.throws(() => f.orders.submitCheckout(entries, f.confirm));
    assert.equal(f.records.get(CUSTOMER_KEY), original);
  }
  f.catalog[2].availability = "Full-book";
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm), /Full-book/);
  f.catalog[2].availability = "Open";
  const profile = f.catalog[2].creatorId;
  f.catalog[2].creatorId = "fictional";
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm));
  f.catalog[2].creatorId = profile;
  assert.throws(() => f.orders.submitCheckout([f.entries[0], f.entries[0]], f.confirm));
  assert.equal(f.records.get(CUSTOMER_KEY), original);
  f.orders.removeFromCart(f.entries[2].serviceId);
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm), /keranjang/);
});

test("account switching and own-service checkout cannot bypass store authorization", async () => {
  const f = await fixture();
  await f.as("other");
  assert.deepEqual(f.orders.view().cart, []);
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm), /Sesi/);
  assert.throws(() => f.orders.submitCheckout(f.entries, { ...f.confirm, expectedUserId: f.users.other.id }), /keranjang/);
  await f.as("sellerA");
  f.orders.addToCart(f.catalog[0].id);
  assert.throws(() => f.orders.submitCheckout([f.entries[0]], { ...f.confirm, expectedUserId: f.users.sellerA.id }), /sendiri/);
  assert.throws(() => f.orders.adminView(), /admin/);
  await f.as("buyer");
  assert.throws(() => f.orders.sellerView(), /Seller/);
});

test("checkout repeat submissions preserve IDs and reject altered draft or account contexts", async () => {
  const f = await fixture();
  const saved = f.orders.submitCheckout(f.entries, f.confirm);
  assert.deepEqual(f.orders.submitCheckout(f.entries, f.confirm).map(row => row.id), saved.map(row => row.id));
  assert.equal(f.orders.view().bookings.length, 3);
  const changed = structuredClone(f.entries);
  changed[0].input.description += " altered";
  assert.throws(() => f.orders.submitCheckout(changed, f.confirm), /berbeda/);
  assert.throws(() => f.orders.submitCheckout(f.entries.slice(0, 1), f.confirm), /berbeda/);
  await f.as("other");
  assert.throws(() => f.orders.submitCheckout(f.entries, { ...f.confirm, expectedUserId: f.users.other.id }), /bukan milik/);
});

test("failed/uncertain persistence retries safely; a verified partial group resumes without duplicating saved rows", async () => {
  const f = await fixture();
  f.fail("before");
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm), /belum tersimpan/);
  assert.equal(f.orders.view().bookings.length, 0);
  assert.equal(f.orders.view().cart.length, 3);
  f.fail("after");
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm));
  const saved = f.orders.view().bookings;
  assert.equal(saved.length, 3);
  f.fail("");
  assert.equal(f.orders.submitCheckout(f.entries, f.confirm).length, 3);
  // Simulated interrupted external persistence, not an assertion that localStorage
  // normally partially writes a single key.
  const partial = JSON.parse(f.records.get(CUSTOMER_KEY));
  partial.bookings = [partial.bookings[0]];
  partial.lists.find(row => row.userId === f.users.buyer.id).cart = ["service-1", "service-2"];
  f.records.set(CUSTOMER_KEY, JSON.stringify(partial));
  const resumed = f.orders.submitCheckout(f.entries, f.confirm);
  assert.equal(resumed[0].id, partial.bookings[0].id);
  assert.equal(f.orders.view().bookings.length, 3);
});

test("acceptance freezes independent final prices; demo payment requires accepted state, exact quote, owner and intent", async () => {
  const f = await fixture();
  const [one, two] = f.orders.submitCheckout(f.entries, f.confirm);
  const payment = { confirmed: true, expectedUserId: f.users.buyer.id, expectedFinalPrice: 125000 };
  assert.throws(() => f.orders.simulatePayment(one.id, payment));
  await f.as("sellerA");
  for (const price of [-1, 1.5, NaN, Infinity, "1200"])
    assert.throws(() => f.orders.respondToBooking(one.id, "accept", { finalPrice: price }));
  f.orders.respondToBooking(one.id, "accept", { finalPrice: 125000, expectedStatus: "Requested" });
  assert.throws(() => f.orders.respondToBooking(one.id, "complete"));
  assert.throws(() => f.orders.confirmAcceptedPrice(one.id, 700));
  await f.as("sellerB");
  f.orders.respondToBooking(two.id, "accept", { finalPrice: 999000 });
  await f.as("other");
  assert.throws(() => f.orders.simulatePayment(one.id, { ...payment, expectedUserId: f.users.other.id }), /bukan milik/);
  await f.as("buyer");
  assert.throws(() => f.orders.simulatePayment(one.id, { ...payment, confirmed: false }));
  assert.throws(() => f.orders.simulatePayment(one.id, { ...payment, expectedFinalPrice: 123 }));
  f.paymentEnabled(false);
  assert.throws(() => f.orders.simulatePayment(one.id, payment), /diaktifkan/);
  f.paymentEnabled(true);
  const paid = f.orders.simulatePayment(one.id, payment);
  assert.equal(paid.status, "Paid");
  assert.equal(paid.demoPayment.amount, 125000);
  assert.equal(f.orders.simulatePayment(one.id, payment).demoPayment.id, paid.demoPayment.id);
  assert.equal(f.orders.getBooking(two.id).status, "Accepted");
  assert.equal(f.orders.getBooking(two.id).finalPrice, 999000);
  await f.as("sellerB");
  assert.throws(() => f.orders.respondToBooking(one.id, "complete"));
  await f.as("sellerA");
  f.orders.respondToBooking(one.id, "complete", { expectedStatus: "Paid" });
  await f.as("buyer");
  assert.equal(f.orders.getBooking(one.id).status, "Completed");
});

test("legacy accepted quotes require owning Seller confirmation and payment persistence failures remain retryable", async () => {
  const f = await fixture();
  const [one] = f.orders.submitCheckout(f.entries, f.confirm);
  await f.as("sellerA");
  f.orders.respondToBooking(one.id, "accept");
  const legacy = JSON.parse(f.records.get(CUSTOMER_KEY));
  delete legacy.bookings[0].finalPrice;
  f.records.set(CUSTOMER_KEY, JSON.stringify(legacy));
  await f.as("buyer");
  assert.throws(() => f.orders.simulatePayment(one.id, { confirmed: true, expectedUserId: f.users.buyer.id, expectedFinalPrice: 100000 }));
  await f.as("sellerB");
  assert.throws(() => f.orders.confirmAcceptedPrice(one.id, 100000));
  await f.as("sellerA");
  f.orders.confirmAcceptedPrice(one.id, 100000);
  await f.as("buyer");
  const payment = { confirmed: true, expectedUserId: f.users.buyer.id, expectedFinalPrice: 100000 };
  f.fail("before");
  assert.throws(() => f.orders.simulatePayment(one.id, payment));
  assert.equal(f.orders.getBooking(one.id).status, "Accepted");
  f.fail("after");
  assert.throws(() => f.orders.simulatePayment(one.id, payment));
  const receipt = f.orders.getBooking(one.id).demoPayment.id;
  f.fail("");
  assert.equal(f.orders.simulatePayment(one.id, payment).demoPayment.id, receipt);
});

test("shared notifications deduplicate Requested/Accepted/Paid/Completed; review only follows real demo lifecycle", async () => {
  const f = await fixture();
  const messaging = createMessagingStore({ storage: f.storage, ...createMessagingAdapters({ accounts: f.accounts, customers: f.orders, getServices: () => f.catalog }) });
  const reviews = createReviewStore({ storage: f.storage, ...createReviewAdapters({ accounts: f.accounts, customers: f.orders, getServices: () => f.catalog }) });
  const [one] = f.orders.submitCheckout(f.entries, f.confirm);
  const review = { booking_id: one.id, service_id: one.serviceId, seller_profile_id: one.creatorId, rating: 5, comment: "Hasil sesuai kebutuhan dan proses kolaborasi sangat jelas." };
  assert.throws(() => reviews.submit(review, { expected_user_id: f.users.buyer.id }));
  const requested = messaging.notifyBookingEvent(one.id);
  assert.equal(messaging.notifyBookingEvent(one.id).id, requested.id);
  await f.as("sellerA");
  f.orders.respondToBooking(one.id, "accept", { finalPrice: 120000 });
  const accepted = messaging.notifyBookingEvent(one.id);
  assert.equal(messaging.notifyBookingEvent(one.id).id, accepted.id);
  await f.as("buyer");
  f.orders.simulatePayment(one.id, { confirmed: true, expectedUserId: f.users.buyer.id, expectedFinalPrice: 120000 });
  const paid = messaging.notifyBookingEvent(one.id);
  assert.equal(paid.type, "booking_paid");
  assert.equal(paid.recipient_user_id, f.users.sellerA.id);
  assert.equal(messaging.notifyBookingEvent(one.id).id, paid.id);
  assert.throws(() => reviews.submit(review, { expected_user_id: f.users.buyer.id }));
  await f.as("other");
  assert.equal(messaging.listNotifications().length, 0);
  assert.throws(() => messaging.notifyBookingEvent(one.id));
  await f.as("sellerA");
  assert.throws(() => messaging.notifyBookingEvent(one.id));
  assert.ok(messaging.listNotifications().some(row => row.id === paid.id));
  f.orders.respondToBooking(one.id, "complete");
  const completed = messaging.notifyBookingEvent(one.id);
  assert.equal(messaging.notifyBookingEvent(one.id).id, completed.id);
  await f.as("buyer");
  const submitted = reviews.submit(review, { expected_user_id: f.users.buyer.id });
  assert.equal(submitted.rating, 5);
});

test("malformed checkout/payment data fails closed without overwriting damaged storage", async () => {
  const f = await fixture();
  f.orders.submitCheckout(f.entries, f.confirm);
  const data = JSON.parse(f.records.get(CUSTOMER_KEY));
  data.bookings[0].finalPrice = -1;
  const raw = JSON.stringify(data);
  f.records.set(CUSTOMER_KEY, raw);
  assert.ok(f.orders.view().error);
  assert.throws(() => f.orders.submitCheckout(f.entries, f.confirm));
  assert.equal(f.records.get(CUSTOMER_KEY), raw);
});

test("offline recovery requires explicit backup identity/approval; preserves associations and permissions", async () => {
  const f = await fixture();
  await f.as("sellerA");
  const raw = f.records.get(ACCOUNT_KEY);
  const newPassword = webcrypto.randomUUID();
  const input = { accountId: f.users.sellerA.id, email: "sellera@example.test", newPassword, confirmation: newPassword, approved: true };
  assert.throws(() => recoverLocalDemo(raw, { ...input, approved: false }));
  assert.throws(() => recoverLocalDemo(raw, { ...input, accountId: f.users.buyer.id }));
  assert.throws(() => recoverLocalDemo(raw, { ...input, confirmation: "different" }));
  assert.throws(() => recoverLocalDemo(raw, { ...input, newPassword: "short", confirmation: "short" }));
  assert.throws(() => recoverLocalDemo("{bad", input));
  const recovered = recoverLocalDemo(raw, input);
  assert.equal(f.records.get(ACCOUNT_KEY), raw); // Offline transformation never writes browser storage.
  const original = JSON.parse(raw);
  const restored = JSON.parse(recovered);
  assert.equal(restored.session, null);
  assert.deepEqual(restored.profiles, original.profiles);
  assert.deepEqual(restored.accounts.filter(row => row.id !== input.accountId), original.accounts.filter(row => row.id !== input.accountId));
  assert.equal(restored.accounts.find(row => row.id === input.accountId).sellerProfileId, f.people[0].id);
  f.records.set(ACCOUNT_KEY, recovered);
  assert.equal((await f.accounts.login(input.email, newPassword)).id, input.accountId);
  await assert.rejects(f.accounts.login(input.email, f.password));
  original.accounts.find(row => row.id === input.accountId).permissions.push("admin:access");
  assert.throws(() => recoverLocalDemo(JSON.stringify(original), input), /Admin recovery/);
});

test("checkout/payment/legacy and nested availability return paths retain query/hash and reject unsafe syntax", () => {
  for (const path of ["/checkout?attempt=checkout-a&service=service-a#summary", "/payment/booking-a", "/booking", "/seller-dashboard/services/service-a/availability?week=1#calendar"])
    assert.equal(safeReturnTo(path), path);
  for (const path of ["//evil.test/checkout", "/checkout/../admin", "/payment/%2f%2fevil", "/checkout?x=%0a", "/seller-dashboard/services/a/availability/other"])
    assert.equal(safeReturnTo(path), "/");
});
