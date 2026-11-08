import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  ACCOUNT_KEY,
  ADMIN_PERMISSION,
  createDemoStore,
} from "../src/features/account/demoStore.js";
import {
  CUSTOMER_KEY,
  createCustomerStore,
} from "../src/features/customer/customerStore.js";
import {
  SELLER_KEY,
  createSellerStore,
} from "../src/features/seller/sellerStore.js";
import { buildOverlay } from "../src/features/seller/sellerCatalog.js";
import {
  summarizeEarnings,
  summarizePerformance,
} from "../src/features/seller/earnings.js";

const pw = "Demo-password-123";
const brief = {
  requirements: "Logo dan pedoman warna untuk bisnis.",
  description: "Kami ingin memperbarui identitas visual usaha kopi lokal.",
};
const serviceInput = (overrides = {}) => ({
  title: "Identitas visual lengkap",
  category: "Branding",
  description:
    "Paket identitas visual: logo, palet warna, tipografi, dan panduan pemakaian.",
  price: "1500000",
  delivery: "Remote",
  turnaround: "7–10 hari kerja",
  availability: "Open",
  image: "",
  ...overrides,
});
const profileInput = (name) => ({
  name,
  category: "Branding",
  city: "Makassar",
  bio: "Studio kreatif untuk identitas visual bisnis lokal dan UMKM.",
  image: "",
  portfolioLink: "",
  specialties: "Branding, Packaging",
});

async function world() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const accounts = createDemoStore(storage, webcrypto);
  const baseServices = [
    {
      id: "demo-1",
      creatorId: "arah",
      title: "Layanan demo",
      category: "Branding",
      price: 1000000,
      availability: "Open",
      delivery: "Remote",
    },
  ];
  // Live catalog arrays, rebuilt like data/marketplace.js#syncCatalog does.
  const catalog = [...baseServices];
  const creators = [{ id: "arah", name: "Studio Arah", city: "Bandung" }];
  const orders = createCustomerStore({
    storage,
    currentUser: () => accounts.current(),
    catalog,
    creators,
  });
  const seller = createSellerStore({
    storage,
    currentUser: () => accounts.current(),
    baseServices: () => baseServices,
    activeBookingCount: (id) =>
      orders
        .sellerView()
        .bookings.filter(
          (b) =>
            b.serviceId === id &&
            ["Requested", "Accepted", "Paid"].includes(b.status),
        ).length,
  });
  function refresh() {
    const entries = seller.catalogEntries();
    const overlay = buildOverlay({
      profiles: accounts.listSellerProfiles(),
      records: entries.services,
      hiddenServiceIds: entries.hiddenServiceIds,
      fallbackImage: "fallback.jpg",
    });
    const hidden = new Set(overlay.hiddenServiceIds);
    catalog.splice(
      0,
      catalog.length,
      ...[...baseServices, ...overlay.services].filter(
        (s) => !hidden.has(s.id),
      ),
    );
    creators.splice(
      0,
      creators.length,
      { id: "arah", name: "Studio Arah", city: "Bandung" },
      ...overlay.creators,
    );
  }
  async function join(name, email, { sellerName } = {}) {
    const user = await accounts.register({ name, email, password: pw });
    if (sellerName) accounts.activateSeller(profileInput(sellerName));
    return accounts.current() || user;
  }
  const login = (email) => accounts.login(email, pw);
  return { storage, values, accounts, orders, seller, refresh, join, login };
}
async function fixture() {
  const w = await world();
  const a = await w.join("Seller A", "a@test.dev", { sellerName: "Studio A" });
  const b = await w.join("Seller B", "b@test.dev", { sellerName: "Studio B" });
  const buyer = await w.join("Pembeli", "buyer@test.dev");
  const admin = await w.join("Admin", "admin@test.dev");
  const db = JSON.parse(w.values.get(ACCOUNT_KEY));
  db.accounts.find((x) => x.id === admin.id).permissions = [ADMIN_PERMISSION];
  w.values.set(ACCOUNT_KEY, JSON.stringify(db));
  return { ...w, a, b, buyer, admin };
}
async function requested(f, service) {
  await f.login("buyer@test.dev");
  f.refresh();
  const user = f.accounts.current();
  return f.orders.createBooking(service.id, brief, {
    confirmed: true,
    expectedUserId: user.id,
  });
}

test("only an owner of a Seller Profile can manage services; ownership comes from the session", async () => {
  const f = await fixture();
  await f.login("buyer@test.dev");
  assert.throws(() => f.seller.create(serviceInput()), /Seller Profile/);
  assert.throws(() => f.seller.mine(), /Seller Profile/);

  await f.login("a@test.dev");
  const created = f.seller.create({
    ...serviceInput(),
    ownerUserId: "someone-else",
    creatorId: "arah",
  });
  assert.equal(created.ownerUserId, f.a.id);
  assert.equal(created.creatorId, f.a.sellerProfileId);

  await f.login("b@test.dev");
  assert.deepEqual(f.seller.mine().services, []);
  assert.throws(
    () => f.seller.update(created.id, serviceInput()),
    /bukan milikmu/,
  );
  assert.throws(
    () => f.seller.setAvailability(created.id, "Full-book"),
    /bukan milikmu/,
  );
  assert.throws(() => f.seller.remove(created.id), /bukan milikmu/);
});

test("service input is validated and availability toggles Open/Full-book", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  for (const bad of [
    { title: "ab" },
    { price: "5" },
    { price: "12.5" },
    { price: "abc" },
    { category: "Hacking" },
    { delivery: "Hybrid" },
    { availability: "Closed" },
    { image: "javascript:alert(1)" },
    { description: "terlalu pendek" },
  ])
    assert.throws(
      () => f.seller.create(serviceInput(bad)),
      Error,
      JSON.stringify(bad),
    );
  const svc = f.seller.create(serviceInput());
  const closed = f.seller.setAvailability(svc.id, "Full-book");
  assert.equal(closed.availability, "Full-book");
  assert.throws(
    () => f.seller.setAvailability(svc.id, "Maybe"),
    /ketersediaan/,
  );
  const edited = f.seller.update(
    svc.id,
    serviceInput({ title: "Judul baru layanan", availability: "Open" }),
  );
  assert.equal(edited.title, "Judul baru layanan");
  assert.equal(f.seller.mine().services.length, 1);
});

test("service active status controls publication separately from availability", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  f.refresh();
  const visibleServices = () =>
    buildOverlay({
      profiles: f.accounts.listSellerProfiles(),
      records: f.seller.catalogEntries().services,
    }).services;
  assert.ok(visibleServices().some((item) => item.id === svc.id));
  const inactive = f.seller.setActive(svc.id, false);
  assert.equal(inactive.active, false);
  assert.equal(inactive.availability, "Open");
  f.refresh();
  assert.ok(!visibleServices().some((item) => item.id === svc.id));
  await f.login("b@test.dev");
  assert.deepEqual(f.seller.mine().services, []);
  await f.login("a@test.dev");
  assert.equal(f.seller.setActive(svc.id, true).active, true);
  f.refresh();
  assert.ok(visibleServices().some((item) => item.id === svc.id));
});

test("seller availability slots persist, reject overlaps, and enforce ownership", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const date = new Date();
  date.setDate(date.getDate() + 3);
  const day = date.toISOString().slice(0, 10);
  const first = f.seller.createSchedule(svc.id, {
    date: day,
    startTime: "09:00",
    endTime: "10:00",
    note: "Konsultasi awal",
  });
  f.seller.createSchedule(svc.id, { date: day, startTime: "10:00", endTime: "11:00" });
  assert.throws(
    () => f.seller.createSchedule(svc.id, { date: day, startTime: "09:30", endTime: "10:30" }),
    /bertabrakan/,
  );
  assert.throws(
    () => f.seller.updateSchedule(svc.id, first.id, { date: day, startTime: "10:15", endTime: "10:45" }),
    /bertabrakan/,
  );
  assert.equal(f.seller.schedulesFor(svc.id).schedules.length, 2);
  assert.equal(JSON.parse(f.values.get(SELLER_KEY)).schedules.length, 2);
  await f.login("b@test.dev");
  assert.throws(() => f.seller.schedulesFor(svc.id), /bukan milikmu/);
  assert.throws(() => f.seller.removeSchedule(svc.id, first.id), /bukan milikmu/);
  await f.login("a@test.dev");
  f.seller.removeSchedule(svc.id, first.id);
  assert.equal(f.seller.schedulesFor(svc.id).schedules.length, 1);
});

test("customer request -> seller accept -> customer sees the update, all in one booking record", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const booking = await requested(f, svc);
  assert.equal(booking.status, "Requested");
  assert.equal(booking.creatorId, f.a.sellerProfileId);
  const ordersKeys = [...f.values.keys()].filter((k) => k.includes("order"));
  assert.deepEqual(ordersKeys, [], "no separate orders storage exists");

  await f.login("b@test.dev");
  assert.deepEqual(f.orders.sellerView().bookings, []);
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "accept"),
    /bukan untuk Seller Profile/,
  );

  await f.login("a@test.dev");
  assert.equal(f.orders.sellerView().bookings.length, 1);
  const accepted = f.orders.respondToBooking(booking.id, "accept", {
    expectedStatus: "Requested",
  });
  assert.equal(accepted.status, "Accepted");
  assert.ok(accepted.updatedAt);

  await f.login("buyer@test.dev");
  const seen = f.orders.getBooking(booking.id);
  assert.equal(seen.status, "Accepted");
  assert.equal(seen.estimatedPrice, 1500000);
});

test("decline stores an optional reason; terminal and stale transitions are rejected", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const one = await requested(f, svc);
  await f.login("a@test.dev");
  assert.throws(
    () => f.orders.respondToBooking(one.id, "complete"),
    /tidak dapat/,
  );
  assert.throws(
    () => f.orders.respondToBooking(one.id, "hack"),
    /tidak dikenal/,
  );
  assert.throws(
    () =>
      f.orders.respondToBooking(one.id, "accept", {
        expectedStatus: "Accepted",
      }),
    /sudah berubah/,
  );
  assert.throws(
    () =>
      f.orders.respondToBooking(one.id, "decline", { reason: "x".repeat(501) }),
    /500/,
  );
  const declined = f.orders.respondToBooking(one.id, "decline", {
    reason: "  Jadwal penuh  ",
  });
  assert.equal(declined.status, "Declined");
  assert.equal(declined.declineReason, "Jadwal penuh");
  assert.throws(
    () => f.orders.respondToBooking(one.id, "accept"),
    /tidak dapat/,
  );
  await f.login("buyer@test.dev");
  assert.equal(f.orders.getBooking(one.id).status, "Declined");
});

test("only existing paid work can be completed and feeds the earnings estimate", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const one = await requested(f, svc);
  const two = await requested(f, svc);
  const three = await requested(f, svc);
  await f.login("a@test.dev");
  f.orders.respondToBooking(one.id, "accept");
  const acceptedRaw = f.values.get(CUSTOMER_KEY);
  assert.throws(
    () => f.orders.respondToBooking(one.id, "complete"),
    /tidak dapat/,
  );
  assert.equal(f.values.get(CUSTOMER_KEY), acceptedRaw);
  // Fixture only: simulate a pre-existing legitimate Paid record. No payment action is added.
  const paidFixture = JSON.parse(acceptedRaw);
  paidFixture.bookings.find((booking) => booking.id === one.id).status = "Paid";
  f.values.set(CUSTOMER_KEY, JSON.stringify(paidFixture));
  f.orders.respondToBooking(one.id, "complete", { expectedStatus: "Paid" });
  f.orders.respondToBooking(two.id, "accept");
  f.orders.respondToBooking(three.id, "decline");
  const totals = summarizeEarnings(f.orders.sellerView().bookings);
  assert.equal(totals.completed.total, 1500000);
  assert.equal(totals.inProgress.count, 1);
  assert.equal(totals.pending.count, 0);
  assert.equal(totals.declined, 1);
  assert.equal(totals.months.length, 1);
  const performance = summarizePerformance(f.orders.sellerView().bookings);
  assert.equal(performance.responseRate, 100);
  assert.equal(performance.acceptanceRate, 67);
  assert.equal(performance.completionRate, 50);
});

test("a service with active bookings cannot be deleted; finished ones can", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const one = await requested(f, svc);
  await f.login("a@test.dev");
  assert.throws(() => f.seller.remove(svc.id), /booking aktif/);
  f.orders.respondToBooking(one.id, "decline");
  f.seller.remove(svc.id);
  assert.equal(f.seller.mine().services.length, 0);
});

test("buyers without a profile, and admins who are not sellers, cannot use seller operations", async () => {
  const f = await fixture();
  await f.login("buyer@test.dev");
  assert.throws(() => f.orders.sellerView(), /Seller Profile/);
  assert.throws(
    () => f.orders.respondToBooking("x", "accept"),
    /Seller Profile/,
  );
  await f.login("admin@test.dev");
  assert.throws(() => f.orders.sellerView(), /Seller Profile/);
  assert.throws(() => f.seller.mine(), /Seller Profile/);
  assert.throws(() => f.seller.create(serviceInput()), /Seller Profile/);
});

test("sellers and buyers cannot use admin operations; admin permission is separate", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  for (const email of ["a@test.dev", "buyer@test.dev"]) {
    await f.login(email);
    assert.throws(() => f.orders.adminView(), /admin/);
    assert.throws(() => f.seller.adminList(), /admin/);
    assert.throws(
      () => f.seller.moderate(svc.id, { hidden: true, reason: "spam konten" }),
      /admin/,
    );
    assert.throws(() => f.accounts.listAccountsForAdmin(), /admin/);
  }
  await f.login("admin@test.dev");
  assert.ok(f.orders.adminView().bookings);
  assert.equal(f.seller.adminList().services.length, 2);
  const list = f.accounts.listAccountsForAdmin();
  assert.equal(list.length, 4);
  assert.ok(list.every((x) => !("passwordVerifier" in x) && !("salt" in x)));
  assert.equal(list.find((x) => x.email === "admin@test.dev").isAdmin, true);
  assert.equal(list.find((x) => x.email === "a@test.dev").isAdmin, false);
});

test("admin moderation hides a service from the catalog and blocks new bookings; restore reverses it", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  f.refresh();
  await f.login("admin@test.dev");
  assert.throws(
    () => f.seller.moderate(svc.id, { hidden: true, reason: "x" }),
    /5–300/,
  );
  assert.throws(
    () => f.seller.moderate("nope", { hidden: true, reason: "alasan jelas" }),
    /tidak ditemukan/,
  );
  f.seller.moderate(svc.id, { hidden: true, reason: "Melanggar panduan" });
  f.seller.moderate("demo-1", { hidden: true, reason: "Demo disembunyikan" });
  f.refresh();
  await f.login("buyer@test.dev");
  assert.throws(
    () =>
      f.orders.createBooking(svc.id, brief, {
        confirmed: true,
        expectedUserId: f.accounts.current().id,
      }),
    /tidak ditemukan/,
  );
  await f.login("a@test.dev");
  const mine = f.seller.mine().services[0];
  assert.equal(mine.hidden, true);
  assert.equal(mine.hiddenReason, "Melanggar panduan");
  await f.login("admin@test.dev");
  f.seller.moderate(svc.id, { hidden: false });
  f.refresh();
  await f.login("buyer@test.dev");
  const booking = f.orders.createBooking(svc.id, brief, {
    confirmed: true,
    expectedUserId: f.accounts.current().id,
  });
  assert.equal(booking.status, "Requested");
});

test("sellers cannot book their own seller-created service", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  f.refresh();
  assert.throws(
    () =>
      f.orders.createBooking(svc.id, brief, {
        confirmed: true,
        expectedUserId: f.accounts.current().id,
      }),
    /sendiri/,
  );
});

test("seller profile edits are owner-only, validated, and flow into the catalog overlay", async () => {
  const f = await fixture();
  await f.login("buyer@test.dev");
  assert.throws(
    () => f.accounts.updateSellerProfile(profileInput("X")),
    /Seller Profile/,
  );
  await f.login("a@test.dev");
  assert.throws(
    () =>
      f.accounts.updateSellerProfile({
        ...profileInput("Studio A"),
        bio: "pendek",
      }),
    /Bio/,
  );
  assert.throws(
    () =>
      f.accounts.updateSellerProfile({
        ...profileInput("Studio A"),
        category: "Lain",
      }),
    /kategori/,
  );
  const next = f.accounts.updateSellerProfile({
    ...profileInput("Studio A Baru"),
    ownerUserId: "evil",
    id: "creator-evil",
    city: "Bandung",
  });
  assert.equal(next.id, f.a.sellerProfileId);
  assert.equal(next.ownerUserId, f.a.id);
  const overlay = buildOverlay({
    profiles: f.accounts.listSellerProfiles(),
    records: [],
  });
  assert.equal(
    overlay.creators.find((c) => c.id === next.id).name,
    "Studio A Baru",
  );
  assert.equal(f.accounts.getOwnedSeller(next.id).city, "Bandung");
});

test("customer names are only visible to sellers/admins and never expose credentials", async () => {
  const f = await fixture();
  await f.login("buyer@test.dev");
  assert.throws(() => f.accounts.customerNames([f.a.id]), /ditolak/);
  await f.login("a@test.dev");
  const names = f.accounts.customerNames([f.buyer.id, "unknown"]);
  assert.deepEqual(names, { [f.buyer.id]: "Pembeli" });
});

test("malformed seller data is surfaced and blocks writes instead of being overwritten", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  f.seller.create(serviceInput());
  const good = f.values.get(SELLER_KEY);
  const parsed = JSON.parse(good);
  parsed.services.push({ id: "broken" });
  f.values.set(SELLER_KEY, JSON.stringify(parsed));
  assert.match(f.seller.mine().error, /tidak valid/);
  assert.throws(
    () => f.seller.create(serviceInput({ title: "Layanan kedua" })),
    /tidak valid/,
  );
  f.values.set(SELLER_KEY, "{not json");
  assert.match(f.seller.mine().error, /tidak dapat dibaca/);
  assert.throws(() => f.seller.create(serviceInput()), /tidak dapat dibaca/);
});

test("overlay maps seller records to the public marketplace shape and skips orphaned services", () => {
  const overlay = buildOverlay({
    profiles: [
      {
        id: "creator-1",
        ownerUserId: "u1",
        name: "Studio Satu",
        category: "Branding",
        city: "Makassar",
        bio: "Bio studio yang cukup panjang untuk lolos validasi dasar.",
        image: "",
        portfolioLink: "",
        specialties: [],
      },
    ],
    records: [
      {
        id: "s1",
        creatorId: "creator-1",
        title: "Satu",
        category: "Branding",
        price: 10000,
        availability: "Open",
        delivery: "Remote",
        turnaround: "3 hari",
        description: "d",
        image: "",
      },
      {
        id: "s2",
        creatorId: "creator-gone",
        title: "Dua",
        category: "Branding",
        price: 10000,
        availability: "Open",
        delivery: "Remote",
        turnaround: "3 hari",
        description: "d",
        image: "",
      },
    ],
    fallbackImage: "fallback.jpg",
  });
  assert.equal(overlay.services.length, 1);
  assert.equal(overlay.services[0].image, "fallback.jpg");
  assert.deepEqual(overlay.services[0].reviews, []);
  assert.equal(overlay.creators[0].ownerUserId, "u1");
  assert.deepEqual(overlay.creators[0].skills, ["Branding"]);
});

test("Paid completion enforces seller ownership, valid status, and stale-state checks without a pay action", async () => {
  const f = await fixture();
  await f.login("a@test.dev");
  const svc = f.seller.create(serviceInput());
  const booking = await requested(f, svc);
  await f.login("a@test.dev");
  f.orders.respondToBooking(booking.id, "accept");
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "pay"),
    /tidak dikenal/,
  );
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "__proto__"),
    /tidak dikenal/,
  );
  assert.throws(
    () =>
      f.orders.respondToBooking(booking.id, "complete", {
        expectedStatus: "Accepted",
      }),
    /tidak dapat/,
  );
  assert.equal(f.orders.sellerView().bookings[0].status, "Accepted");
  const db = JSON.parse(f.values.get(CUSTOMER_KEY));
  db.bookings.find((item) => item.id === booking.id).status = "Paid";
  f.values.set(CUSTOMER_KEY, JSON.stringify(db));
  await f.login("buyer@test.dev");
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "complete"),
    /Seller Profile/,
  );
  await f.login("b@test.dev");
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "complete"),
    /bukan untuk/,
  );
  await f.login("admin@test.dev");
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "complete"),
    /Seller Profile/,
  );
  await f.login("a@test.dev");
  assert.throws(
    () =>
      f.orders.respondToBooking(booking.id, "complete", {
        expectedStatus: "Accepted",
      }),
    /sudah berubah/,
  );
  assert.equal(
    f.orders.respondToBooking(booking.id, "complete", {
      expectedStatus: "Paid",
    }).status,
    "Completed",
  );
  assert.throws(
    () => f.orders.respondToBooking(booking.id, "complete"),
    /tidak dapat/,
  );
  await f.login("buyer@test.dev");
  assert.equal(f.orders.getBooking(booking.id).status, "Completed");
});
