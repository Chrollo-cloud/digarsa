import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createDemoStore,
  ACCOUNT_KEY,
} from "../src/features/account/demoStore.js";
import {
  createSellerStore,
  SELLER_KEY,
} from "../src/features/seller/sellerStore.js";
import { buildOverlay } from "../src/features/seller/sellerCatalog.js";
import {
  createCatalogStatus,
  createCatalogSync,
} from "../src/features/seller/catalogSync.js";
import {
  validateCoordinates,
  parseCoordinates,
  validateBuyerLocation,
  validatePublicLocation,
  publicLocation,
  haversineKm,
  requestBrowserLocation,
} from "../src/features/location/locationModel.js";
import { discoverServices } from "../src/features/location/discovery.js";
import { safeReturnTo } from "../src/features/account/redirects.js";

const password = "Location-test-only-9876!";
const point = { lat: -5.14, lng: 119.41 };
const pin = {
  version: 1,
  visibility: "pin",
  area: "Area uji studio",
  coordinates: point,
  confirmed: true,
};
const buyerLocation = {
  version: 1,
  city: "Area uji",
  coordinates: point,
  source: "manual",
  consent: true,
};
const serviceInput = {
  title: "Fotografi produk untuk usaha",
  category: "Branding",
  description:
    "Fotografi produk untuk usaha lokal dengan pengarahan visual dan penyuntingan.",
  price: "500000",
  delivery: "Onsite",
  turnaround: "3 hari kerja",
  availability: "Open",
  image: "",
};
async function fixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const accounts = createDemoStore(storage, webcrypto);
  const seller = await accounts.register({
    name: "Studio Lokasi",
    email: "seller-location@example.test",
    password,
  });
  const profile = accounts.activateSeller({
    name: "Studio Lokasi",
    category: "Branding",
    city: "Wilayah uji",
    bio: "Studio kreatif untuk pengujian wilayah layanan yang dibagikan secara eksplisit.",
    publicLocation: pin,
  });
  const store = createSellerStore({
    storage,
    currentUser: () => accounts.current(),
    activeBookingCount: () => 0,
  });
  const service = store.create(serviceInput);
  const refresh = () =>
    buildOverlay({
      profiles: accounts.listSellerProfiles(),
      records: store.catalogEntries().services,
      hiddenServiceIds: store.catalogEntries().hiddenServiceIds,
    });
  const discover = (options = {}) =>
    discoverServices({
      catalog: refresh().services,
      resolveSellerProfile: (id) => accounts.getBookableSeller(id),
      ...options,
    });
  return {
    values,
    storage,
    accounts,
    seller,
    profile,
    store,
    service,
    refresh,
    discover,
  };
}

test("coordinate validation rejects empty, nonfinite, out-of-range, and unexpected fields", () => {
  assert.deepEqual(parseCoordinates("0", "0"), { lat: 0, lng: 0 });
  assert.equal(parseCoordinates("", ""), null);
  for (const coordinates of [
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
    { lat: NaN, lng: 2 },
    { lat: 1, lng: Infinity },
    { lat: "-5", lng: 119 },
    { lat: 0 },
    { ...point, address: "private" },
  ])
    assert.throws(() => validateCoordinates(coordinates));
  for (const pair of [
    ["", "119"],
    ["abc", "1"],
    ["1", "Infinity"],
    ["0x10", "5"],
  ])
    assert.throws(() => parseCoordinates(...pair));
});

test("precise coordinates require explicit consent; city text never creates a point", () => {
  assert.throws(() =>
    validateBuyerLocation({ ...buyerLocation, consent: false }),
  );
  assert.throws(() =>
    validateBuyerLocation({ ...buyerLocation, source: "city" }),
  );
  const city = validateBuyerLocation({
    version: 1,
    city: "Bandung",
    coordinates: null,
    source: "city",
    consent: false,
  });
  assert.equal(city.coordinates, null);
  assert.throws(() =>
    validateBuyerLocation({ ...buyerLocation, city: "bad\ncity" }),
  );
  assert.throws(() => validatePublicLocation({ ...pin, confirmed: false }));
  assert.equal(
    publicLocation({
      version: 1,
      visibility: "hidden",
      area: "",
      coordinates: null,
      confirmed: false,
    }),
    null,
  );
  assert.throws(() => publicLocation({ ...pin, visibility: "hidden" }));
  assert.throws(() => publicLocation({ ...pin, visibility: "area" }));
});

test("buyer location stays account-scoped, private, persistent, and explicitly clearable", async () => {
  const f = await fixture();
  const buyer = await f.accounts.register({
    name: "Buyer",
    email: "buyer-location@example.test",
    password,
  });
  f.accounts.updateBuyerLocation(buyerLocation, { expectedUserId: buyer.id });
  assert.deepEqual(f.accounts.getBuyerLocation(), buyerLocation);
  assert.equal("discoveryLocation" in f.accounts.current(), false);
  assert.equal(
    JSON.stringify(f.accounts.listSellerProfiles()).includes(
      '"source":"manual"',
    ),
    false,
  );
  const reloaded = createDemoStore(f.storage, webcrypto);
  assert.deepEqual(reloaded.getBuyerLocation(), buyerLocation);
  const before = f.values.get(ACCOUNT_KEY);
  assert.throws(() =>
    f.accounts.updateBuyerLocation(buyerLocation, {
      expectedUserId: f.seller.id,
    }),
  );
  assert.throws(() =>
    f.accounts.clearBuyerLocation({ expectedUserId: f.seller.id }),
  );
  assert.equal(f.values.get(ACCOUNT_KEY), before);
  await f.accounts.login("seller-location@example.test", password);
  assert.equal(f.accounts.getBuyerLocation(), null);
  assert.throws(() =>
    f.accounts.clearBuyerLocation({ expectedUserId: buyer.id }),
  );
  assert.equal(
    f.accounts.getBookableSeller(f.profile.id).ownerUserId,
    f.seller.id,
  );
  await f.accounts.login("buyer-location@example.test", password);
  f.accounts.clearBuyerLocation({ expectedUserId: buyer.id });
  assert.equal(f.accounts.getBuyerLocation(), null);
  assert.equal(f.accounts.current().id, buyer.id);
  f.accounts.logout();
  assert.throws(() => f.accounts.getBuyerLocation());
});

test("corrupt buyer location and unavailable storage fail safely without automatic writes", async () => {
  const f = await fixture();
  const db = JSON.parse(f.values.get(ACCOUNT_KEY));
  db.accounts[0].discoveryLocation = {
    ...buyerLocation,
    coordinates: { lat: 999, lng: 0 },
  };
  const damaged = JSON.stringify(db);
  f.values.set(ACCOUNT_KEY, damaged);
  assert.throws(() => f.accounts.getBuyerLocation());
  assert.equal(f.values.get(ACCOUNT_KEY), damaged);
  f.accounts.clearBuyerLocation({ expectedUserId: f.seller.id });
  assert.equal(f.accounts.getBuyerLocation(), null);
  f.values.set(ACCOUNT_KEY, "{broken");
  assert.throws(() =>
    f.accounts.clearBuyerLocation({ expectedUserId: f.seller.id }),
  );
  assert.equal(f.values.get(ACCOUNT_KEY), "{broken");
  const unavailable = createDemoStore(
    {
      getItem() {
        throw new Error("denied");
      },
    },
    webcrypto,
  );
  assert.throws(() => unavailable.getBuyerLocation());
});

test("geolocation is an explicit one-shot action with denial and unavailable fallbacks", async () => {
  let calls = 0;
  const denied = {
    getCurrentPosition(ok, fail, options) {
      calls++;
      assert.equal(options.maximumAge, 0);
      fail({ code: 1 });
    },
  };
  assert.equal(calls, 0);
  await assert.rejects(requestBrowserLocation(denied), /ditolak.*manual/);
  assert.equal(calls, 1);
  await assert.rejects(requestBrowserLocation(null), /tidak tersedia/);
  await assert.rejects(
    requestBrowserLocation({
      getCurrentPosition(ok, fail) {
        fail({ code: 3 });
      },
    }),
    /manual/,
  );
  assert.deepEqual(
    await requestBrowserLocation({
      getCurrentPosition(ok) {
        ok({ coords: { latitude: point.lat, longitude: point.lng } });
      },
    }),
    point,
  );
});

test("public Seller pin is explicit, owner-editable, and inherited only by onsite services", async () => {
  const f = await fixture();
  const overlay = f.refresh();
  assert.deepEqual(overlay.services[0].publicLocation, pin);
  f.store.update(f.service.id, { ...serviceInput, delivery: "Remote" });
  assert.equal(f.refresh().services[0].publicLocation, null);
  assert.equal(f.discover({ mode: "remote" })[0].distance, null);
  assert.equal(f.discover().length, 0);
  f.store.update(f.service.id, {
    ...serviceInput,
    serviceLocation: {
      version: 1,
      visibility: "hidden",
      area: "",
      coordinates: null,
      confirmed: false,
    },
  });
  assert.equal(f.refresh().services[0].publicLocation, null);
  f.store.update(f.service.id, { ...serviceInput, serviceLocation: null });
  assert.deepEqual(f.refresh().services[0].publicLocation, pin);
  await f.accounts.register({
    name: "Other",
    email: "other-location@example.test",
    password,
  });
  assert.throws(() => f.accounts.updateSellerProfile({ publicLocation: pin }));
  assert.throws(() =>
    f.store.update(f.service.id, { ...serviceInput, serviceLocation: pin }),
  );
});

test("legacy account and service records remain intact, with no coordinates inferred", async () => {
  const f = await fixture();
  const db = JSON.parse(f.values.get(ACCOUNT_KEY));
  delete db.profiles[0].publicLocation;
  f.values.set(ACCOUNT_KEY, JSON.stringify(db));
  const before = f.values.get(ACCOUNT_KEY);
  assert.equal(f.accounts.getBuyerLocation(), null);
  assert.equal(f.refresh().services[0].publicLocation, null);
  assert.equal(f.discover({ origin: point })[0].distance, null);
  assert.equal(f.values.get(ACCOUNT_KEY), before);
  const sellerRaw = f.values.get(SELLER_KEY);
  f.store.catalogEntries();
  assert.equal(f.values.get(SELLER_KEY), sellerRaw);
  assert.equal(f.accounts.current().sellerProfileId, f.profile.id);
});

test("Haversine uses geographic straight-line distance, including antimeridian and coincident points", () => {
  assert.equal(haversineKm(point, point), 0);
  assert.ok(
    Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) <
      0.01,
  );
  assert.ok(
    Math.abs(
      haversineKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }) - 22.239,
    ) < 0.01,
  );
  assert.ok(
    Number.isFinite(haversineKm({ lat: 90, lng: 0 }, { lat: -90, lng: 180 })),
  );
});

test("nearby ordering/radius, missing points, search, area, and category filtering are honest", async () => {
  const f = await fixture();
  const far = f.store.create({
    ...serviceInput,
    title: "Layanan jauh",
    serviceLocation: { ...pin, coordinates: { lat: -5.5, lng: 119.4 } },
  });
  const missing = f.store.create({
    ...serviceInput,
    title: "Layanan wilayah saja",
    serviceLocation: {
      ...pin,
      visibility: "area",
      coordinates: null,
      confirmed: false,
    },
  });
  const rows = f.discover({ origin: point });
  assert.equal(rows[0].id, f.service.id);
  assert.equal(rows[1].id, far.id);
  assert.equal(rows[2].id, missing.id);
  assert.equal(rows[2].distance, null);
  assert.equal(f.discover({ origin: point, radiusKm: 5 }).length, 1);
  assert.equal(f.discover({ query: "jauh" })[0].id, far.id);
  assert.equal(f.discover({ city: "tidak ada" }).length, 0);
  assert.equal(f.discover({ category: "Web & Digital" }).length, 0);
  assert.throws(() => f.discover({ radiusKm: 25 }), /memerlukan/);
});

test("unavailable, inactive, moderated, and fictional/orphaned services never appear", async () => {
  const f = await fixture();
  const base = f.refresh().services[0];
  const catalog = [
    base,
    { ...base, id: "full", availability: "Full-book" },
    { ...base, id: "hidden", hidden: true },
    { ...base, id: "inactive", active: false },
    { ...base, id: "fictional", creatorId: "editorial" },
  ];
  assert.deepEqual(
    f.discover({ catalog }).map((row) => row.id),
    [base.id],
  );
  f.store.setAvailability(f.service.id, "Full-book");
  assert.equal(f.discover().length, 0);
  f.store.setAvailability(f.service.id, "Open");
  const db = JSON.parse(f.values.get(ACCOUNT_KEY));
  db.accounts[0].sellerProfileId = null;
  f.values.set(ACCOUNT_KEY, JSON.stringify(db));
  assert.equal(f.discover().length, 0);
});

test("bad stored location blocks catalog synchronization and discovery until legitimate recovery", async () => {
  const f = await fixture();
  const good = f.values.get(SELLER_KEY);
  const state = createCatalogStatus();
  let published;
  const refresh = createCatalogSync({
    status: state,
    readEntries: () => f.store.catalogEntries(),
    readProfiles: () => f.accounts.listSellerProfiles(),
    build: buildOverlay,
    publish: (value) => {
      published = value;
    },
  });
  assert.equal(refresh(), true);
  const previous = published;
  const damaged = JSON.parse(good);
  damaged.services[0].serviceLocation = { ...pin, confirmed: false };
  f.values.set(SELLER_KEY, JSON.stringify(damaged));
  assert.equal(refresh(), false);
  assert.equal(published, previous);
  assert.throws(
    () => f.discover({ catalogError: state.snapshot().error }),
    /belum dapat diverifikasi/,
  );
  assert.throws(
    () => f.store.update(f.service.id, serviceInput),
    /tidak valid/,
  );
  f.values.set(SELLER_KEY, good);
  assert.equal(refresh(), true);
  assert.equal(f.discover().length, 1);
  assert.equal(safeReturnTo("/nearby"), "/");
});

test("seller visibility changes remove public pins without changing account location or ownership", async () => {
  const f = await fixture();
  f.accounts.updateBuyerLocation(buyerLocation, {
    expectedUserId: f.seller.id,
  });
  const original = f.accounts.getOwnedSeller(f.profile.id);
  const input = {
    ...original,
    specialties: original.specialties.join(", "),
    publicLocation: {
      version: 1,
      visibility: "hidden",
      area: "",
      coordinates: null,
      confirmed: false,
    },
  };
  f.accounts.updateSellerProfile(input);
  assert.equal(f.accounts.listSellerProfiles()[0].publicLocation, null);
  assert.equal(f.accounts.getBookableSeller(f.profile.id).publicLocation, null);
  assert.equal(f.refresh().services[0].publicLocation, null);
  assert.deepEqual(f.accounts.getBuyerLocation(), buyerLocation);
  assert.equal(f.accounts.current().sellerProfileId, original.id);
  const explicit = { ...pin, coordinates: { lat: -5.15, lng: 119.42 } };
  f.store.update(f.service.id, { ...serviceInput, serviceLocation: explicit });
  f.store.update(f.service.id, {
    ...serviceInput,
    title: "Judul layanan diperbarui",
  });
  assert.deepEqual(f.refresh().services[0].publicLocation, explicit);
});

test("saved Makassar city matches a confirmed district label without changing radius or displayed area", async () => {
  const f = await fixture();
  const profile = f.accounts.getOwnedSeller(f.profile.id);
  f.accounts.updateSellerProfile({
    ...profile,
    specialties: profile.specialties.join(", "),
    city: "Makassar",
    publicLocation: {
      ...pin,
      area: "Panakkukang",
      coordinates: { lat: -5.145, lng: 119.415 },
    },
  });
  const buyer = await f.accounts.register({
    name: "Buyer Makassar",
    email: "makassar-buyer@example.test",
    password,
  });
  f.accounts.updateBuyerLocation({ ...buyerLocation, city: "Makassar" }, {
    expectedUserId: buyer.id,
  });
  const saved = f.accounts.getBuyerLocation();
  const rows = f.discover({ city: saved.city, origin: saved.coordinates, radiusKm: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, f.service.id);
  assert.equal(rows[0].area, "Panakkukang");
  assert.ok(rows[0].distance > 0.7 && rows[0].distance < 0.9);
  assert.equal(f.discover({ city: " makassar " }).length, 1);
  assert.equal(f.discover({ city: "Panakkukang" }).length, 1);
  assert.equal(f.discover({ query: "Makassar" }).length, 1);
  assert.equal(f.discover({ city: "Bandung" }).length, 0);
  assert.equal(f.discover({ city: "Makassar", origin: point, radiusKm: 0.25 }).length, 0);
  assert.equal(f.discover({ city: "Makassar" })[0].distance, null);
  assert.throws(() => f.discover({ city: "Makassar", origin: { lat: 91, lng: 0 } }), /Koordinat/);
});

test("city matching never reveals hidden pins or private buyer data and keeps remote services separate", async () => {
  const f = await fixture();
  const remote = f.store.create({ ...serviceInput, title: "Layanan Remote Makassar", delivery: "Remote" });
  const profile = f.accounts.getOwnedSeller(f.profile.id);
  f.accounts.updateBuyerLocation(buyerLocation, { expectedUserId: f.seller.id });
  f.accounts.updateSellerProfile({
    ...profile,
    specialties: profile.specialties.join(", "),
    city: "Makassar",
    publicLocation: { version: 1, visibility: "hidden", area: "", coordinates: null, confirmed: false },
  });
  const onsite = f.discover({ city: "Makassar" });
  assert.deepEqual(onsite.map(row => row.id), [f.service.id]);
  assert.equal(onsite[0].area, "Makassar");
  assert.equal(onsite[0].publicLocation, null);
  assert.equal(onsite[0].coordinates, null);
  assert.equal(onsite[0].distance, null);
  assert.equal(Object.hasOwn(onsite[0], "discoveryLocation"), false);
  assert.equal(f.discover({ city: "Area uji studio" }).length, 0);
  assert.equal(f.discover({ city: "Makassar", origin: point, radiusKm: 25 }).length, 0);
  const online = f.discover({ city: "Makassar", mode: "remote", origin: point });
  assert.deepEqual(online.map(row => row.id), [remote.id]);
  assert.equal(online[0].coordinates, null);
  assert.equal(online[0].distance, null);
  assert.deepEqual(f.accounts.getBuyerLocation(), buyerLocation);
});
