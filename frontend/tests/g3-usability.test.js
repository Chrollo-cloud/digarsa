import test from "node:test";
import { setImmediate } from "node:timers";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { cartBadge } from "../src/features/customer/cartPresentation.js";
import { createDemoStore } from "../src/features/account/demoStore.js";
import { createSellerStore } from "../src/features/seller/sellerStore.js";
import { createCustomerStore } from "../src/features/customer/customerStore.js";
import { buildOverlay } from "../src/features/seller/sellerCatalog.js";
import { createDemoBookingSetup, DEMO_BOOKING_KEY, assertLocalDevelopment } from "../src/dev/demoBookingSetup.js";
import { readingFromPosition } from "../src/features/location/locationModel.js";
import { bookingStatusLabel, bookingLifecycle } from "../src/features/customer/bookingLifecycle.js";
import { createMediaStore, validatePhoto, preparePhoto } from "../src/features/media/mediaStore.js";

test("cart badges count distinct owned services and never substitute zero for unavailable data", () => {
  assert.equal(cartBadge({ cart: ["a", "a", "b"] }, "buyer"), 2);
  assert.equal(cartBadge({ cart: ["other"] }, null), null);
  assert.equal(cartBadge({ cart: [], error: "bad" }, "buyer"), null);
});
test("reported device accuracy is distinct from coordinates and invalid readings fail safely", () => {
  const row = readingFromPosition({ coords: { latitude: -5, longitude: 119, accuracy: 5000 } });
  assert.equal(row.accuracy, 5000);
  assert.deepEqual(row.point, { lat: -5, lng: 119 });
  assert.equal(readingFromPosition({ coords: { latitude: 0, longitude: 0, accuracy: NaN } }).accuracy, null);
  assert.throws(() => readingFromPosition({ coords: { latitude: 91, longitude: 1, accuracy: 1 } }));
});
test("Indonesian status presentation preserves all canonical lifecycle values", () => {
  assert.deepEqual(bookingLifecycle, ["Requested", "Accepted", "Paid", "Completed"]);
  assert.deepEqual(["Requested", "Accepted", "Paid", "Completed", "Declined", "Cancelled"].map(bookingStatusLabel), ["Menunggu Persetujuan", "Diterima Seller", "Sudah Dibayar", "Selesai", "Ditolak Seller", "Dibatalkan"]);
});
test("opt-in fixtures create real seller/buyer ownership, are idempotent and preserve booking safeguards", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const accounts = createDemoStore(storage, webcrypto);
  const sellerStore = createSellerStore({ storage, currentUser: () => accounts.current(), activeBookingCount: () => 0 });
  const setup = createDemoBookingSetup({ accounts, services: sellerStore, storage, enabled: () => true });
  const credentials = { sellerPassword: webcrypto.randomUUID(), buyerPassword: webcrypto.randomUUID() };
  const seed = await setup.setup(credentials);
  assert.notEqual(seed.buyerId, seed.sellerId);
  assert.equal(seed.serviceIds.length, 2);
  assert.deepEqual(await setup.setup(credentials), seed);
  const catalog = buildOverlay({ profiles: accounts.listSellerProfiles(), records: sellerStore.catalogEntries().services });
  const orders = createCustomerStore({ storage, currentUser: () => accounts.current(), catalog: catalog.services, creators: catalog.creators, resolveSellerProfile: id => accounts.getBookableSeller(id) });
  orders.addToCart(seed.serviceIds[0]);
  assert.equal(cartBadge(orders.view(), seed.buyerId), 1);
  const booking = orders.createBooking(seed.serviceIds[0], { requirements: "Fotografi produk untuk bisnis lokal", description: "Foto sintetis untuk pengujian alur pesanan yang dapat ditinjau seller.", location: "Lokasi QA sintetis yang disepakati", requestedDate: "2099-01-01" }, { confirmed: true, expectedUserId: seed.buyerId });
  assert.equal(booking.status, "Requested");
  await setup.login("seller", credentials.sellerPassword);
  assert.equal(orders.view().bookings.length, 0);
  assert.equal(cartBadge(orders.view(), seed.sellerId), 0);
  assert.equal(orders.sellerView().bookings[0].id, booking.id);
  orders.respondToBooking(booking.id, "accept", { expectedStatus: "Requested" });
  assert.throws(() => orders.respondToBooking(booking.id, "complete", { expectedStatus: "Accepted" }));
  await setup.reset(credentials.sellerPassword);
  assert.equal(sellerStore.mine().services.filter(row => row.active).length, 0);
  assert.equal(orders.sellerView().bookings.length, 1);
  await setup.login("buyer", credentials.buyerPassword);
  assert.equal(orders.view().bookings[0].status, "Accepted");
  assert.deepEqual(accounts.current().permissions, []);
  storage.setItem(DEMO_BOOKING_KEY, "{broken");
  await assert.rejects(setup.login("buyer", credentials.buyerPassword));
  assert.equal(storage.getItem(DEMO_BOOKING_KEY), "{broken");
});
test("fixture provisioning refuses production/non-loopback and does not overwrite conflicting accounts", async () => {
  assert.throws(() => assertLocalDevelopment(false, "localhost"));
  assert.throws(() => assertLocalDevelopment(true, "example.com"));
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const accounts = createDemoStore(storage, webcrypto);
  const password = webcrypto.randomUUID();
  const old = await accounts.register({ name: "Existing unrelated", email: "seller.booking@example.test", password });
  const setup = createDemoBookingSetup({ accounts, services: {}, storage, enabled: () => true });
  await assert.rejects(setup.setup({ sellerPassword: password, buyerPassword: password }));
  assert.equal(accounts.current().id, old.id);
  assert.equal(storage.getItem(DEMO_BOOKING_KEY), null);
});
test("photo validation rejects unsupported, oversized, empty and undecodable files", async () => {
  assert.throws(() => validatePhoto(new Blob([], { type: "image/png" })));
  assert.throws(() => validatePhoto(new Blob(["svg"], { type: "image/svg+xml" })));
  assert.throws(() => validatePhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 }));
  await assert.rejects(preparePhoto(new Blob(["bad"], { type: "image/png" }), { decode: async () => { throw new Error(); } }), /dibaca/);
  let closed = false;
  await assert.rejects(preparePhoto(new Blob(["qa"], { type: "image/png" }), { decode: async () => ({ width: 10000, height: 10000, close: () => { closed = true; } }) }), /Dimensi/);
  assert.equal(closed, true);
  await assert.rejects(createMediaStore(null).put(new Blob(["qa"], { type: "image/png" }), "user", "account"), /tidak tersedia/);
});

function memoryIndexedDB({ failWrites = false } = {}) {
  const records = new Map();
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          createObjectStore() {}, close() {},
          transaction() {
            const tx = {};
            let pending = 0;
            const operation = (body) => {
              const result = {}; pending++;
              queueMicrotask(() => {
                if (failWrites && body.write) { tx.onerror?.(); return; }
                result.result = body(); result.onsuccess?.();
                if (--pending === 0) queueMicrotask(() => tx.oncomplete?.());
              });
              return result;
            };
            tx.objectStore = () => ({
              add(row) { const write = () => records.set(row.id, row); write.write = true; return operation(write); },
              get(id) { return operation(() => records.get(id)); },
              delete(id) { const write = () => records.delete(id); write.write = true; return operation(write); },
            });
            return tx;
          },
        };
        request.onupgradeneeded?.(); request.onsuccess?.();
      });
      return request;
    },
  };
}
test("photo blobs persist by stable owner/scope reference, isolate accounts, and handle deletion/failure", async () => {
  const idb = memoryIndexedDB();
  const store = createMediaStore(idb);
  const blob = new Blob(["synthetic raster bytes"], { type: "image/png" });
  const id = await store.put(blob, "owner-a", "account");
  assert.ok(id.startsWith("local-photo-"));
  assert.equal((await createMediaStore(idb).get(id, "owner-a", "account")).size, blob.size);
  assert.equal(await store.get(id, "owner-b", "account"), null);
  assert.equal(await store.get(id, "owner-a", "seller"), null);
  await store.remove(id, "owner-b", "account");
  assert.ok(await store.get(id, "owner-a", "account"));
  await store.remove(id, "owner-a", "account");
  assert.equal(await store.get(id, "owner-a", "account"), null);
  await assert.rejects(createMediaStore(memoryIndexedDB({ failWrites: true })).put(blob, "owner-a", "account"), /gagal|penuh/);
});
test("photo processing downsizes and re-encodes pixels rather than persisting a temporary URL", async () => {
  let dimensions, closed = false;
  const output = new Blob(["processed"], { type: "image/webp" });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(callback) { dimensions = [this.width, this.height]; callback(output); } };
  assert.equal(await preparePhoto(new Blob(["source"], { type: "image/jpeg" }), {
    decode: async () => ({ width: 2400, height: 1200, close: () => { closed = true; } }), canvas: () => canvas,
  }), output);
  assert.deepEqual(dimensions, [1200, 600]); assert.equal(closed, true);
});

test("optional photo references preserve account identity, seller association and existing URL compatibility", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const accounts = createDemoStore(storage, webcrypto);
  const user = await accounts.register({ name: "Photo QA", email: "photo-owner@example.test", password: webcrypto.randomUUID() });
  const profile = accounts.activateSeller({ name: "Photo Studio", category: "Branding", city: "Makassar", bio: "Studio pengujian foto perangkat tanpa perubahan identitas akun.", specialties: "Branding", image: "https://example.invalid/legacy.jpg", portfolioLink: "" });
  const reference = "local-photo-test-reference";
  accounts.updateProfile({ avatarMediaId: reference, avatarUrl: "" }, { expectedUserId: user.id });
  accounts.updateSellerProfile({ ...profile, specialties: "Branding", imageMediaId: reference });
  assert.equal(accounts.current().id, user.id);
  assert.equal(accounts.current().avatarMediaId, reference);
  assert.equal(accounts.current().sellerProfileId, profile.id);
  assert.deepEqual(accounts.current().permissions, []);
  assert.equal(accounts.getOwnedSeller(profile.id).image, "https://example.invalid/legacy.jpg");
  assert.equal(accounts.getOwnedSeller(profile.id).imageMediaId, reference);
  assert.throws(() => accounts.updateProfile({ avatarMediaId: "blob:not-persistent" }, { expectedUserId: user.id }));
  assert.throws(() => accounts.updateSellerProfile({ ...profile, specialties: "Branding", imageMediaId: "data:invalid" }));
  await accounts.register({ name: "Other Photo", email: "photo-other@example.test", password: webcrypto.randomUUID() });
  assert.equal(accounts.current().avatarMediaId, "");
  assert.throws(() => accounts.updateProfile({ avatarMediaId: reference }, { expectedUserId: user.id }));
  assert.throws(() => accounts.getOwnedSeller(profile.id));
});
test("device accuracy is session-only and clears on manual correction, clear and account switch", async () => {
  const { createDeviceLocationSession } = await import("../src/features/location/deviceLocationSession.js");
  const session = createDeviceLocationSession({ getGeolocation: () => ({ getCurrentPosition: success => success({ coords: { latitude: -5, longitude: 119, accuracy: 4000 } }) }), getPermissions: () => ({ query: async () => ({ state: "granted" }) }) });
  const detach = session.attach("owner-a");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.snapshot().accuracy, 4000);
  session.useManual({ lat: -5.1, lng: 119.4 });
  assert.equal(session.snapshot().source, "manual");
  assert.equal(session.snapshot().accuracy, null);
  session.clear(); assert.equal(session.snapshot().point, null);
  detach(); const stop = session.attach("owner-b");
  assert.equal(session.snapshot().accuracy, null);
  stop();
});
