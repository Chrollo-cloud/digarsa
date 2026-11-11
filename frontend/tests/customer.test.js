import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import {
  createCustomerStore,
  CUSTOMER_KEY,
} from "../src/features/customer/customerStore.js";
import { createDemoStore } from "../src/features/account/demoStore.js";
import { customerDeclineReason } from "../src/features/customer/formatters.js";
import { safeReturnTo } from "../src/features/account/redirects.js";

const first = { id: "buyer-a", capabilities: ["buyer"], sellerProfileId: null };
const second = {
  id: "buyer-b",
  capabilities: ["buyer", "seller"],
  sellerProfileId: "profile-b",
};
const brief = {
  requirements: "Logo dan pedoman warna untuk bisnis.",
  description: "Kami ingin memperbarui identitas visual usaha kopi lokal.",
};
function setup() {
  const records = new Map();
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
  let account = first;
  const catalog = [
    {
      id: "remote",
      creatorId: "studio",
      title: "Identitas visual",
      price: 1200000,
      availability: "Open",
      delivery: "Remote",
    },
    {
      id: "onsite",
      creatorId: "studio",
      title: "Fotografi produk",
      price: 900000,
      availability: "Open",
      delivery: "Onsite",
    },
    {
      id: "full",
      creatorId: "studio",
      title: "Web",
      price: 2000000,
      availability: "Full-book",
      delivery: "Remote",
    },
    {
      id: "unknown",
      creatorId: "studio",
      title: "Tidak diketahui",
      price: 100000,
      availability: "Open",
      delivery: "Hybrid",
    },
    {
      id: "scheduled",
      creatorId: "studio",
      title: "Sesi daring",
      price: 100000,
      availability: "Open",
      delivery: "Remote",
      requiresSchedule: true,
    },
    {
      id: "own",
      creatorId: "profile-b",
      title: "Layanan sendiri",
      price: 100000,
      availability: "Open",
      delivery: "Remote",
    },
  ];
  const people = [
    { id: "studio", ownerUserId: "seller-account", name: "Studio Kreatif" },
    { id: "profile-b", ownerUserId: second.id, name: "Studio B" },
  ];
  const ownerAccounts = [
    { id: "seller-account", sellerProfileId: "studio" },
    second,
  ];
  const options = {
    storage,
    currentUser: () => account,
    catalog,
    creators: people,
    resolveSellerProfile: (id) =>
      people.find(
        (profile) =>
          profile.id === id &&
          ownerAccounts.some(
            (owner) =>
              owner.id === profile.ownerUserId && owner.sellerProfileId === id,
          ),
      ),
    randomId: randomUUID,
    today: () => "2026-11-07",
    now: () => "2026-11-07T08:00:00.000Z",
  };
  const store = createCustomerStore(options);
  return {
    store,
    storage,
    catalog,
    options,
    as: (user) => {
      account = user;
    },
    confirm: (serviceId, input = brief) =>
      store.createBooking(serviceId, input, {
        confirmed: true,
        expectedUserId: account?.id,
      }),
  };
}

test("favorites persist per user, prevent duplicates, and cannot be changed by a caller-supplied user ID", () => {
  const s = setup();
  s.store.addFavorite("remote");
  s.store.addFavorite("remote");
  assert.deepEqual(s.store.view().favorites, ["remote"]);
  s.as(second);
  assert.deepEqual(s.store.view().favorites, []);
  s.store.addFavorite("onsite");
  s.store.removeFavorite("remote");
  s.as(first);
  assert.deepEqual(s.store.view().favorites, ["remote"]);
  assert.deepEqual(createCustomerStore(s.options).view().favorites, ["remote"]);
  s.store.removeFavorite("remote");
  assert.deepEqual(s.store.view().favorites, []);
});

test("cart is isolated, persists full-book entries, and has no quantity or combined checkout", () => {
  const s = setup();
  s.store.addToCart("remote");
  s.store.addToCart("remote");
  s.store.addToCart("full");
  assert.deepEqual(s.store.view().cart, ["remote", "full"]);
  s.as(second);
  assert.deepEqual(s.store.view().cart, []);
  s.store.removeFromCart("full");
  s.as(first);
  assert.deepEqual(createCustomerStore(s.options).view().cart, [
    "remote",
    "full",
  ]);
  s.store.removeFromCart("remote");
  assert.deepEqual(s.store.view().cart, ["full"]);
  assert.equal(s.store.checkout, undefined);
});

test("multi-service checkout creates separate Requested bookings atomically and removes only selected cart items", () => {
  const s = setup();
  s.store.addToCart("remote");
  s.store.addToCart("onsite");
  s.store.addToCart("scheduled");
  const onsiteBrief = {
    ...brief,
    requestedDate: "2026-11-08",
    location: "Jalan Pengayoman nomor 12, Makassar",
  };
  const created = s.store.createBookings([
    { serviceId: "remote", input: brief },
    { serviceId: "onsite", input: onsiteBrief },
  ], { confirmed: true, expectedUserId: first.id });
  assert.equal(created.length, 2);
  assert.deepEqual(created.map(({ status, paymentStatus }) => [status, paymentStatus]), [
    ["Requested", "Unpaid"],
    ["Requested", "Unpaid"],
  ]);
  assert.deepEqual(s.store.view().cart, ["scheduled"]);
  assert.equal(s.store.view().bookings.length, 2);
  assert.throws(() => s.store.createBookings([
    { serviceId: "remote", input: brief },
    { serviceId: "remote", input: brief },
  ], { confirmed: true, expectedUserId: first.id }), /duplikat/);
  assert.equal(s.store.view().bookings.length, 2);
});

test("payment waits for Seller acceptance, retries failed simulation, and changes the shared order lifecycle only on success", () => {
  const s = setup();
  const booking = s.confirm("remote");
  assert.equal(booking.paymentStatus, "Unpaid");
  assert.throws(() => s.store.beginPayment(booking.id, "BCA", { expectedUserId: first.id }), /setelah Seller menerima/);
  s.as({ ...second, id: "seller-account", capabilities: ["buyer", "seller"], sellerProfileId: "studio" });
  assert.throws(() => s.store.beginPayment(booking.id, "BCA", { expectedUserId: first.id }), /Sesi berubah/);
  s.store.respondToBooking(booking.id, "accept");
  s.as(first);
  s.store.beginPayment(booking.id, "QRIS", { expectedUserId: first.id });
  assert.equal(s.store.getBooking(booking.id).status, "Accepted");
  assert.equal(s.store.getBooking(booking.id).paymentStatus, "Pending");
  s.store.simulatePayment(booking.id, false, { expectedUserId: first.id });
  assert.equal(s.store.getBooking(booking.id).status, "Accepted");
  assert.equal(s.store.getBooking(booking.id).paymentStatus, "Failed");
  s.store.beginPayment(booking.id, "BCA", { expectedUserId: first.id });
  s.store.simulatePayment(booking.id, true, { expectedUserId: first.id });
  assert.equal(s.store.getBooking(booking.id).status, "Paid");
  assert.equal(s.store.getBooking(booking.id).paymentStatus, "Paid");
});

test("guests cannot mutate favorites, cart, or bookings", () => {
  const s = setup();
  s.as(null);
  assert.throws(() => s.store.addFavorite("remote"), /Masuk/);
  assert.throws(() => s.store.addToCart("remote"), /Masuk/);
  assert.throws(() => s.confirm("remote"), /Masuk/);
  assert.deepEqual(s.store.view().bookings, []);
});

test("remote booking allows no date and ignores an onsite address", () => {
  const s = setup();
  const booking = s.confirm("remote", { ...brief, location: "Not needed" });
  assert.equal(booking.requestedDate, "");
  assert.equal(booking.location, "");
  assert.equal(booking.deliveryMode, "remote");
});

test("onsite requires real future/present date and a complete address", () => {
  const s = setup();
  assert.throws(() => s.confirm("onsite"), /Tanggal/);
  assert.throws(
    () => s.confirm("onsite", { ...brief, requestedDate: "2026-11-08" }),
    /Lokasi/,
  );
  for (const date of ["2026-02-30", "2026-11-06", "nonsense"])
    assert.throws(
      () =>
        s.confirm("onsite", {
          ...brief,
          requestedDate: date,
          location: "Jalan Merdeka nomor 25, Makassar",
        }),
      /tanggal/,
    );
  const booking = s.confirm("onsite", {
    ...brief,
    requestedDate: "2026-11-08",
    location: "Jalan Merdeka nomor 25, Makassar",
  });
  assert.equal(booking.deliveryMode, "onsite");
  assert.equal(booking.requestedDate, "2026-11-08");
});

test("explicitly scheduled remote work requires a date", () => {
  const s = setup();
  assert.throws(() => s.confirm("scheduled"), /Tanggal/);
  assert.equal(
    s.confirm("scheduled", { ...brief, requestedDate: "2026-11-08" }).location,
    "",
  );
});

test("full-book, unknown service/mode, missing creator, and self-booking are rejected", () => {
  const s = setup();
  assert.throws(() => s.confirm("full"), /Full-book/);
  assert.throws(() => s.confirm("missing"), /tidak ditemukan/);
  assert.throws(() => s.confirm("unknown"), /belum didukung/);
  s.as(second);
  assert.throws(() => s.confirm("own"), /sendiri/);
  s.as({ ...second, sellerProfileId: "another-profile" });
  assert.throws(() => s.confirm("own"), /sendiri/);
  s.catalog[0].creatorId = "missing";
  assert.throws(() => s.confirm("remote"), /belum lengkap/);
});

test("booking validates brief lengths and requires explicit confirmation from the reviewed account", () => {
  const s = setup();
  assert.throws(
    () => s.confirm("remote", { ...brief, requirements: "short" }),
    /Kebutuhan/,
  );
  assert.throws(
    () => s.confirm("remote", { ...brief, description: "short" }),
    /Deskripsi/,
  );
  assert.throws(() => s.store.createBooking("remote", brief), /konfirmasi/);
  assert.throws(
    () =>
      s.store.createBooking("remote", brief, {
        confirmed: true,
        expectedUserId: second.id,
      }),
    /Sesi berubah/,
  );
  assert.equal(s.store.view().bookings.length, 0);
});

test("booking creation generates unique IDs, forces Requested, snapshots price and ignores forged ownership/status", () => {
  const s = setup();
  const a = s.confirm("remote", {
    ...brief,
    status: "Paid",
    customerId: second.id,
    estimatedPrice: 0,
  });
  const b = s.confirm("remote");
  assert.notEqual(a.id, b.id);
  assert.equal(a.status, "Requested");
  assert.equal(a.customerId, first.id);
  assert.equal(a.estimatedPrice, 1200000);
  assert.equal(s.store.view().bookings.length, 2);
  assert.equal(s.store.transition, undefined);
});

test("service availability is revalidated at submission and cart removal is part of the same successful write", () => {
  const s = setup();
  s.store.addToCart("remote");
  s.store.addToCart("onsite");
  s.store.validateBooking("remote", brief);
  s.catalog[0].availability = "Full-book";
  assert.throws(() => s.confirm("remote"));
  assert.deepEqual(s.store.view().cart, ["remote", "onsite"]);
  s.catalog[0].availability = "Open";
  s.confirm("remote");
  assert.deepEqual(s.store.view().cart, ["onsite"]);
});

test("private bookings remain isolated through logout and account switching", () => {
  const s = setup();
  const a = s.confirm("remote");
  s.as(second);
  assert.deepEqual(s.store.view().bookings, []);
  assert.throws(() => s.store.getBooking(a.id), /bukan milik/);
  const b = s.confirm("remote");
  s.as(null);
  assert.throws(() => s.store.getBooking(b.id));
  s.as(first);
  assert.equal(s.store.getBooking(a.id).customerId, first.id);
  assert.throws(() => s.store.getBooking(b.id));
});

test("malformed JSON and schema versions fail safely without overwriting stored data", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ version: 99, lists: [], bookings: [] }),
    JSON.stringify({ version: 1, lists: {}, bookings: [] }),
  ]) {
    const s = setup();
    s.storage.setItem(CUSTOMER_KEY, raw);
    assert.equal(s.store.view().bookings.length, 0);
    assert.ok(s.store.view().error);
    assert.throws(() => s.store.addFavorite("remote"));
    assert.equal(s.storage.getItem(CUSTOMER_KEY), raw);
  }
});

test("invalid individual records are excluded while valid owned records remain visible", () => {
  const s = setup();
  const booking = s.confirm("remote");
  const data = JSON.parse(s.storage.getItem(CUSTOMER_KEY));
  data.bookings.push(
    null,
    { ...booking, id: "bad", estimatedPrice: "100" },
    { ...booking, id: "bad-status", status: "Surprise" },
  );
  data.lists.push({ userId: first.id, favorites: [null], cart: [] });
  s.storage.setItem(CUSTOMER_KEY, JSON.stringify(data));
  assert.equal(s.store.view().bookings.length, 1);
  assert.ok(s.store.view().error);
  assert.throws(() => s.confirm("remote"));
});

test("all lifecycle and terminal states can be read without exposing customer transitions", () => {
  const s = setup();
  const booking = s.confirm("remote");
  for (const status of [
    "Requested",
    "Accepted",
    "Paid",
    "Completed",
    "Declined",
    "Cancelled",
  ]) {
    s.storage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({
        version: 1,
        lists: [],
        bookings: [{ ...booking, status }],
      }),
    );
    assert.equal(s.store.getBooking(booking.id).status, status);
  }
  assert.equal(s.store.accept, undefined);
  assert.equal(s.store.pay, undefined);
});

test("Phase 5 sessions and seller activation preserve the same buyer data and ownership", async () => {
  const s = setup();
  const auth = createDemoStore(s.storage, webcrypto);
  await auth.register({
    name: "Real Studio",
    email: "studio@example.test",
    password: "Demo-password-123",
  });
  const seller = auth.activateSeller({
    name: "Real Studio",
    category: "Branding",
    city: "Makassar",
    bio: "Studio kreatif untuk identitas visual bisnis lokal dan UMKM.",
  });
  s.catalog
    .filter((row) => row.creatorId === "studio")
    .forEach((row) => {
      row.creatorId = seller.id;
    });
  s.options.creators.push(seller);
  const buyer = await auth.register({
    name: "Demo Buyer",
    email: "buyer@example.test",
    password: "Demo-password-123",
  });
  const store = createCustomerStore({
    ...s.options,
    currentUser: () => auth.current(),
    resolveSellerProfile: (id) => auth.getBookableSeller(id),
  });
  store.addFavorite("remote");
  store.addToCart("remote");
  auth.activateSeller({
    name: "Studio Buyer",
    category: "Branding",
    city: "Makassar",
    bio: "Identitas kreatif untuk bisnis lokal di kota Makassar.",
  });
  assert.equal(auth.current().id, buyer.id);
  assert.deepEqual(store.view().favorites, ["remote"]);
  const booking = store.createBooking("remote", brief, {
    confirmed: true,
    expectedUserId: buyer.id,
  });
  auth.logout();
  assert.equal(store.view().bookings.length, 0);
  await auth.register({
    name: "Other Buyer",
    email: "other@example.test",
    password: "Demo-password-123",
  });
  assert.deepEqual(store.view().favorites, []);
  assert.deepEqual(store.view().cart, []);
  assert.throws(() => store.getBooking(booking.id));
  await auth.login("buyer@example.test", "Demo-password-123");
  assert.equal(store.getBooking(booking.id).customerId, buyer.id);
});

test("booking, favorites, cart and order details are safe return destinations", () => {
  for (const path of [
    "/booking/remote",
    "/favorites",
    "/cart",
    "/orders/booking-123",
  ])
    assert.equal(safeReturnTo(path), path);
  assert.equal(safeReturnTo("//evil.example/cart"), "/");
});

test("write failures do not report success or remove cart entries", () => {
  const s = setup();
  s.store.addToCart("remote");
  const failing = createCustomerStore({
    ...s.options,
    storage: {
      getItem: s.storage.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    },
  });
  assert.throws(
    () =>
      failing.createBooking("remote", brief, {
        confirmed: true,
        expectedUserId: first.id,
      }),
    /belum tersimpan/,
  );
  assert.deepEqual(s.store.view().cart, ["remote"]);
  assert.equal(s.store.view().bookings.length, 0);
});


test("decline reasons persist and are available only in the owning customer's booking view", () => {
  const f = setup();
  const booking = f.confirm("remote");
  f.as({ id: "seller-account", capabilities: ["buyer", "seller"], sellerProfileId: "studio" });
  f.store.respondToBooking(booking.id, "decline", { reason: "  Jadwal studio tidak tersedia.  " });
  f.as(first);
  const own = f.store.getBooking(booking.id);
  assert.equal(customerDeclineReason(own, first.id), "Jadwal studio tidak tersedia.");
  const restored = createCustomerStore(f.options);
  assert.equal(customerDeclineReason(restored.getBooking(booking.id), first.id), "Jadwal studio tidak tersedia.");
  f.as(second);
  assert.deepEqual(f.store.view().bookings, []);
  assert.throws(() => f.store.getBooking(booking.id), /bukan milik/);
  assert.equal(customerDeclineReason(own, second.id), "");
  assert.equal(customerDeclineReason(own, null), "");
});

test("decline reason display handles legacy, empty, malformed and non-declined bookings gracefully", () => {
  const base = { customerId: first.id, status: "Declined" };
  for (const declineReason of [undefined, null, "", "  ", 42, { text: "Not displayable" }]) {
    assert.equal(customerDeclineReason({ ...base, declineReason }, first.id), "");
  }
  for (const status of ["Requested", "Accepted", "Paid", "Completed", "Cancelled"]) {
    assert.equal(customerDeclineReason({ ...base, status, declineReason: "Stale reason" }, first.id), "");
  }
  assert.equal(customerDeclineReason(undefined, first.id), "");
  assert.equal(customerDeclineReason({ ...base, declineReason: "  Jadwal penuh.\nCoba tanggal lain.  " }, first.id), "Jadwal penuh.\nCoba tanggal lain.");
});

test('Keranjang keeps the existing cart distinct from favorites through individual booking and reload', () => {
  const s = setup();
  s.store.addFavorite('remote');
  s.store.addToCart('remote');
  s.store.addToCart('onsite');
  const existing = createCustomerStore(s.options);
  assert.deepEqual(existing.view().favorites, ['remote']);
  assert.deepEqual(existing.view().cart, ['remote','onsite']);
  const booking = s.confirm('remote');
  assert.equal(booking.status, 'Requested');
  assert.deepEqual(existing.view().favorites, ['remote']);
  assert.deepEqual(existing.view().cart, ['onsite']);
  s.as(second);
  assert.deepEqual(existing.view().cart, []);
  s.as(first);
  assert.deepEqual(existing.view().cart, ['onsite']);
});
