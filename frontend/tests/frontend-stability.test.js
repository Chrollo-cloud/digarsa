import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_KEY } from "../src/features/account/demoStore.js";
import {
  CUSTOMER_KEY,
  createCustomerStore,
} from "../src/features/customer/customerStore.js";
import {
  SELLER_KEY,
  createSellerStore,
} from "../src/features/seller/sellerStore.js";
import {
  createCatalogStatus,
  createCatalogSync,
} from "../src/features/seller/catalogSync.js";
import { buildOverlay } from "../src/features/seller/sellerCatalog.js";
import { reviewScenario } from "./fixtures/reviewScenario.js";

const brief = {
  requirements: "Identitas visual dan logo bisnis.",
  description: "Identitas visual untuk peluncuran usaha kreatif kami.",
};
const submit = (s, id = s.service.id) =>
  s.orders.createBooking(id, brief, {
    confirmed: true,
    expectedUserId: s.buyer.id,
  });
const sellerClient = (s, extra = {}) =>
  createSellerStore({
    storage: s.storage,
    currentUser: () => s.accounts.current(),
    activeBookingCount: (id) => s.orders.getActiveBookingCount(id),
    ...extra,
  });
const loginSeller = (s) =>
  s.accounts.login("reviews-seller@example.test", s.password);

test("editorial creator metadata and missing resolver cannot authorize direct bookings", async () => {
  const s = await reviewScenario();
  const fake = { ...s.service, id: "editorial", creatorId: "fictional" };
  s.catalog.push(fake);
  // Even convincing public metadata is not an account-backed Seller Profile.
  const orders = createCustomerStore({
    storage: s.storage,
    currentUser: () => s.accounts.current(),
    catalog: s.catalog,
    creators: [
      { id: "fictional", name: "Fictional studio", ownerUserId: s.seller.id },
    ],
    resolveSellerProfile: (id) => s.accounts.getBookableSeller(id),
  });
  const before = s.values.get(CUSTOMER_KEY);
  assert.match(orders.getBookingRestriction(fake.id), /akun pemilik/);
  assert.throws(() => orders.validateBooking(fake.id, brief), /akun pemilik/);
  assert.throws(
    () =>
      orders.createBooking(fake.id, brief, {
        confirmed: true,
        expectedUserId: s.buyer.id,
      }),
    /akun pemilik/,
  );
  const unwired = createCustomerStore({
    storage: s.storage,
    currentUser: () => s.accounts.current(),
    catalog: s.catalog,
    creators: [s.profile],
  });
  assert.throws(
    () =>
      unwired.createBooking(s.service.id, brief, {
        confirmed: true,
        expectedUserId: s.buyer.id,
      }),
    /akun pemilik/,
  );
  assert.equal(s.values.get(CUSTOMER_KEY), before);
});

for (const damage of [
  "orphan",
  "disassociated",
  "duplicate-owner",
  "duplicate-profile",
  "incomplete-profile",
  "corrupt",
]) {
  test(`seller proof rejects ${damage} without changing existing data`, async () => {
    const s = await reviewScenario();
    s.orders.validateBooking(s.service.id, brief);
    const db = JSON.parse(s.values.get(ACCOUNT_KEY));
    if (damage === "orphan")
      db.accounts = db.accounts.filter((a) => a.id !== s.seller.id);
    if (damage === "disassociated")
      db.accounts.find((a) => a.id === s.seller.id).sellerProfileId = null;
    if (damage === "duplicate-owner")
      db.accounts.push({ ...db.accounts.find((a) => a.id === s.seller.id) });
    if (damage === "duplicate-profile") db.profiles.push({ ...db.profiles[0] });
    if (damage === "incomplete-profile") delete db.profiles[0].bio;
    s.values.set(
      ACCOUNT_KEY,
      damage === "corrupt" ? "{damaged" : JSON.stringify(db),
    );
    const before = s.values.get(CUSTOMER_KEY);
    assert.throws(() => submit(s));
    assert.equal(s.values.get(CUSTOMER_KEY), before);
    assert.equal(
      s.values.get(ACCOUNT_KEY),
      damage === "corrupt" ? "{damaged" : JSON.stringify(db),
    );
  });
}

test("real owner remains bookable; privacy, self-booking, and lifecycle remain enforced", async () => {
  const s = await reviewScenario();
  const booking = submit(s);
  assert.equal(booking.customerId, s.buyer.id);
  assert.equal(booking.creatorId, s.profile.id);
  assert.equal(booking.status, "Requested");
  await loginSeller(s);
  assert.throws(
    () =>
      s.orders.createBooking(s.service.id, brief, {
        confirmed: true,
        expectedUserId: s.seller.id,
      }),
    /sendiri/,
  );
  assert.throws(() => s.orders.getBooking(booking.id), /bukan milik/);
  s.orders.respondToBooking(booking.id, "accept");
  assert.throws(
    () => s.orders.respondToBooking(booking.id, "complete"),
    /Accepted/,
  );
  await s.accounts.login("reviews-buyer@example.test", s.password);
  assert.equal(s.orders.getBooking(booking.id).status, "Accepted");
  assert.throws(() => s.orders.respondToBooking(booking.id, "decline"));
});

for (const raw of [
  "",
  "{broken",
  JSON.stringify({ version: 1, lists: [] }),
  JSON.stringify({ version: 1, lists: [], bookings: [{}] }),
]) {
  test(`malformed booking data blocks deletion (${raw || "empty string"})`, async () => {
    const s = await reviewScenario();
    await loginSeller(s);
    s.values.set(CUSTOMER_KEY, raw);
    const before = s.values.get(SELLER_KEY);
    assert.throws(
      () => sellerClient(s).remove(s.service.id),
      /belum dapat diverifikasi/,
    );
    assert.equal(s.values.get(SELLER_KEY), before);
    assert.equal(s.values.get(CUSTOMER_KEY), raw);
  });
}

test("unavailable booking storage blocks deletion without overwriting anything", async () => {
  const s = await reviewScenario();
  await loginSeller(s);
  const before = s.values.get(SELLER_KEY);
  const unavailable = createCustomerStore({
    storage: {
      getItem() {
        throw new Error("denied");
      },
    },
    currentUser: () => s.accounts.current(),
    catalog: s.catalog,
    creators: [s.profile],
  });
  assert.throws(
    () =>
      sellerClient(s, {
        activeBookingCount: (id) => unavailable.getActiveBookingCount(id),
      }).remove(s.service.id),
    /belum dapat diverifikasi/,
  );
  assert.equal(s.values.get(SELLER_KEY), before);
});

for (const status of [
  "Requested",
  "Accepted",
  "Paid",
  "Completed",
  "Declined",
  "Cancelled",
]) {
  test(`deletion respects ${status} booking state`, async () => {
    const s = await reviewScenario();
    await loginSeller(s);
    const db = JSON.parse(s.values.get(CUSTOMER_KEY));
    db.bookings = [{ ...db.bookings[0], status }];
    s.values.set(CUSTOMER_KEY, JSON.stringify(db));
    const seller = sellerClient(s);
    if (["Requested", "Accepted", "Paid"].includes(status))
      assert.throws(() => seller.remove(s.service.id), /booking aktif/);
    else {
      seller.remove(s.service.id);
      assert.equal(seller.mine().services.length, 0);
    }
  });
}

test("unknown active counts fail closed; verified empty store permits owned deletion only", async () => {
  const s = await reviewScenario();
  assert.throws(() => sellerClient(s).remove(s.service.id), /Seller Profile/);
  await loginSeller(s);
  for (const count of [undefined, NaN, Infinity, -1, "0"])
    assert.throws(
      () =>
        sellerClient(s, { activeBookingCount: () => count }).remove(
          s.service.id,
        ),
      /belum dapat diverifikasi/,
    );
  const unconfigured = createSellerStore({
    storage: s.storage,
    currentUser: () => s.accounts.current(),
  });
  assert.throws(
    () => unconfigured.remove(s.service.id),
    /belum dapat diverifikasi/,
  );
  s.values.delete(CUSTOMER_KEY);
  sellerClient(s).remove(s.service.id);
  assert.equal(sellerClient(s).mine().services.length, 0);
});

async function catalogScenario() {
  const s = await reviewScenario();
  const status = createCatalogStatus();
  let published;
  let publishes = 0;
  const refresh = createCatalogSync({
    readEntries: () => sellerClient(s).catalogEntries(),
    readProfiles: () => s.accounts.listSellerProfiles(),
    build: buildOverlay,
    publish: (overlay) => {
      published = overlay;
      publishes++;
    },
    status,
  });
  return {
    s,
    status,
    refresh,
    published: () => published,
    publishes: () => publishes,
  };
}

test("catalog read failure preserves seller services and moderation; retry recovers", async () => {
  const c = await catalogScenario();
  const db = JSON.parse(c.s.values.get(SELLER_KEY));
  db.moderation.editorial = {
    reason: "Hidden for moderation",
    at: new Date().toISOString(),
  };
  const good = JSON.stringify(db);
  c.s.values.set(SELLER_KEY, good);
  let updates = 0;
  const stop = c.status.subscribe(() => updates++);
  assert.equal(c.refresh(), true);
  const previous = c.published();
  for (const bad of [
    "",
    "{broken",
    JSON.stringify({ ...db, services: [...db.services, {}] }),
  ]) {
    c.s.values.set(SELLER_KEY, bad);
    assert.equal(c.refresh(), false);
    assert.equal(c.published(), previous);
    assert.equal(c.publishes(), 1);
    assert.equal(c.status.snapshot().hasValidCatalog, true);
    assert.ok(c.status.snapshot().error);
    assert.equal(c.s.values.get(SELLER_KEY), bad);
  }
  assert.ok(previous.services.some((row) => row.id === c.s.service.id));
  assert.deepEqual(previous.hiddenServiceIds, ["editorial"]);
  c.s.values.set(SELLER_KEY, good);
  assert.equal(c.refresh(), true);
  assert.equal(c.status.snapshot().error, "");
  assert.equal(c.s.values.get(SELLER_KEY), good);
  assert.equal(updates, 5);
  stop();
  c.refresh();
  assert.equal(updates, 5);
});

for (const failure of ["entries", "profiles", "build", "ownership"]) {
  test(`catalog ${failure} failure is visible, including initial load`, async () => {
    const c = await catalogScenario();
    const options = {
      readEntries: () => ({ services: [], hiddenServiceIds: [] }),
      readProfiles: () => [],
      build: buildOverlay,
      publish() {
        assert.fail("must not publish fallback");
      },
      status: c.status,
    };
    if (failure === "entries")
      options.readEntries = () => {
        throw new Error("storage denied");
      };
    if (failure === "profiles")
      options.readProfiles = () => {
        throw new Error("accounts unreadable");
      };
    if (failure === "build")
      options.build = () => {
        throw new TypeError("invalid profile");
      };
    if (failure === "ownership")
      options.readEntries = () => ({
        services: [c.s.service],
        hiddenServiceIds: [],
      });
    assert.equal(createCatalogSync(options)(), false);
    assert.ok(c.status.snapshot().error);
    assert.equal(c.status.snapshot().hasValidCatalog, false);
  });
}

test("catalog health also gates direct booking calls until reliable recovery", async () => {
  const s = await reviewScenario();
  let error = "catalog damaged";
  const orders = createCustomerStore({
    storage: s.storage,
    currentUser: () => s.accounts.current(),
    catalog: s.catalog,
    creators: [s.profile],
    resolveSellerProfile: (id) => s.accounts.getBookableSeller(id),
    catalogError: () => error,
  });
  assert.match(orders.getBookingRestriction(s.service.id), /katalog/);
  assert.throws(
    () =>
      orders.createBooking(s.service.id, brief, {
        confirmed: true,
        expectedUserId: s.buyer.id,
      }),
    /katalog/,
  );
  error = "";
  assert.equal(
    orders.createBooking(s.service.id, brief, {
      confirmed: true,
      expectedUserId: s.buyer.id,
    }).status,
    "Requested",
  );
});

test("inconsistent booking-to-service ownership blocks deletion", async () => {
  const s = await reviewScenario();
  await loginSeller(s);
  const db = JSON.parse(s.values.get(CUSTOMER_KEY));
  db.bookings = [
    { ...db.bookings[0], creatorId: "different-profile", status: "Requested" },
  ];
  s.values.set(CUSTOMER_KEY, JSON.stringify(db));
  const before = s.values.get(SELLER_KEY);
  assert.throws(() => sellerClient(s).remove(s.service.id), /Asosiasi booking/);
  assert.equal(s.values.get(SELLER_KEY), before);
});
