import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import {
  ACCOUNT_KEY,
  ADMIN_PERMISSION,
  createDemoStore,
} from "../src/features/account/demoStore.js";
import { createCustomerStore } from "../src/features/customer/customerStore.js";
import { safeReturnTo } from "../src/features/account/redirects.js";

const credentials = {
  name: "Nama Awal",
  email: "profile@example.test",
  password: "Demo-password-123",
};
const newPassword = "New-demo-password-456";
function setup() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return { storage, store: createDemoStore(storage, webcrypto) };
}
const change = (store, id, overrides = {}) =>
  store.changePassword(
    {
      currentPassword: credentials.password,
      newPassword,
      confirmation: newPassword,
      ...overrides,
    },
    { expectedUserId: id },
  );


test("profile changes are scoped to the session, preserve ID/email, and persist across instances", async () => {
  const { store, storage } = setup();

  const first = await store.register(credentials);
  const second = await store.register({
    ...credentials,
    email: "other@example.test",
    name: "Akun Lain",
  });

  await store.login(credentials.email, credentials.password);

  let notices = 0;
  const stop = store.subscribe(() => notices++);

  const uploadedAvatar =
    `data:image/jpeg;base64,/9j/${"A".repeat(120)}`;

  const updated = store.updateProfile(
    {
      name: "Nama Baru",
      phone: "+62 812-3456-7890",
      avatarUrl: uploadedAvatar,
    },
    { expectedUserId: first.id },
  );

  assert.equal(updated.name, "Nama Baru");
  assert.equal(updated.id, first.id);
  assert.equal(updated.email, credentials.email);
  assert.equal(updated.phone, "+62 812-3456-7890");
  assert.equal(updated.avatarUrl, uploadedAvatar);
  assert.equal(notices, 1);

  stop();

  const reloaded = createDemoStore(storage, webcrypto);

  assert.equal(reloaded.current().id, first.id);
  assert.equal(reloaded.current().name, "Nama Baru");
  assert.equal(reloaded.current().phone, "+62 812-3456-7890");
  assert.equal(reloaded.current().avatarUrl, uploadedAvatar);

  const other = await store.login(
    "other@example.test",
    credentials.password,
  );

  assert.equal(other.id, second.id);
  assert.equal(other.name, "Akun Lain");
  assert.equal(other.avatarUrl, "");
});

test("another user cannot be selected by ID and protected account fields cannot be patched", async () => {
  const { store, storage } = setup();
  const first = await store.register(credentials);
  const second = await store.register({
    ...credentials,
    email: "other@example.test",
  });
  const before = storage.getItem(ACCOUNT_KEY);
  assert.throws(
    () => store.updateProfile({ name: "Forged" }, { expectedUserId: first.id }),
    /Sesi berubah/,
  );
  for (const field of [
    "id",
    "userId",
    "email",
    "createdAt",
    "permissions",
    "sellerProfileId",
    "passwordVerifier",
  ]) {
    assert.throws(
      () =>
        store.updateProfile(
          { [field]: first.id },
          { expectedUserId: second.id },
        ),
      /Hanya informasi/,
    );
  }
  assert.equal(storage.getItem(ACCOUNT_KEY), before);
  await assert.rejects(change(store, first.id), /Sesi berubah/);
  store.logout();
  assert.throws(() =>
    store.updateProfile({ name: "Nama Baru" }, { expectedUserId: second.id }),
  );
});

test("profile validation rejects invalid values and supports clearing optional fields", async () => {
  const { store } = setup();
  const user = await store.register(credentials);
  for (const patch of [
    { name: " " },
    { name: "a".repeat(81) },
    { phone: "abc123" },
    { phone: "1".repeat(30) },
    { birthDate: "2026-02-30" },
    { birthDate: "9999-01-01" },
    { gender: "unsupported" },
    { avatarUrl: "javascript:alert(1)" },
    { avatarUrl: "data:image/png;base64,abc" },
    { avatarUrl: "https://name:secret@example.test/image.png" },
    { name: null },
  ]) {
    assert.throws(() =>
      store.updateProfile(patch, { expectedUserId: user.id }),
    );
    assert.equal(store.current().name, credentials.name);
  }
  store.updateProfile(
    { phone: "081234567890", avatarUrl: "https://example.test/photo.png" },
    { expectedUserId: user.id },
  );
  store.updateProfile(
    { phone: "", avatarUrl: "" },
    { expectedUserId: user.id },
  );
  assert.equal(store.current().phone, "");
  assert.equal(store.current().avatarUrl, "");
});

test("creation metadata is added for new accounts without inventing dates for legacy accounts", async () => {
  const { store, storage } = setup();
  const user = await store.register(credentials);
  assert.ok(Number.isFinite(Date.parse(user.createdAt)));
  const db = JSON.parse(storage.getItem(ACCOUNT_KEY));
  delete db.accounts[0].createdAt;
  storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
  assert.equal(store.current().createdAt, null);
  store.updateProfile({ name: "Akun Lama" }, { expectedUserId: user.id });
  assert.equal(store.current().createdAt, null);
});

test("password change verifies the old password, rotates the salt, and preserves the session", async () => {
  const { store, storage } = setup();
  const user = await store.register(credentials);
  const before = JSON.parse(storage.getItem(ACCOUNT_KEY));
  const updated = await change(store, user.id);
  const after = JSON.parse(storage.getItem(ACCOUNT_KEY));
  assert.equal(updated.id, user.id);
  assert.deepEqual(before.session, after.session);
  assert.notEqual(before.accounts[0].salt, after.accounts[0].salt);
  assert.equal(storage.getItem(ACCOUNT_KEY).includes(newPassword), false);
  assert.equal("passwordVerifier" in updated, false);
  store.logout();
  await assert.rejects(
    store.login(credentials.email, credentials.password),
    /tidak cocok/,
  );
  assert.equal((await store.login(credentials.email, newPassword)).id, user.id);
});

test("incorrect current passwords, short passwords, reused passwords, and confirmation mismatches do not write", async () => {
  const { store, storage } = setup();
  const user = await store.register(credentials);
  const before = storage.getItem(ACCOUNT_KEY);
  for (const patch of [
    { currentPassword: "incorrect" },
    { currentPassword: "" },
    { newPassword: "short", confirmation: "short" },
    { confirmation: "Different-confirmation" },
    { newPassword: credentials.password, confirmation: credentials.password },
  ])
    await assert.rejects(change(store, user.id, patch));
  assert.equal(storage.getItem(ACCOUNT_KEY), before);
  assert.equal(
    (await store.login(credentials.email, credentials.password)).id,
    user.id,
  );
});

test("profile/password updates preserve owned Seller Profile, internal permissions, and existing bookings", async () => {
  const { store, storage } = setup();
  await store.register({
    ...credentials,
    name: "Studio Lain",
    email: "external-owner@example.test",
  });
  const external = store.activateSeller({
    name: "Studio Lain",
    category: "Branding",
    city: "Makassar",
    bio: "Studio lain untuk proyek identitas visual bisnis lokal.",
  });
  const user = await store.register(credentials);
  const seller = store.activateSeller({
    name: "Studio Akun",
    category: "Branding",
    city: "Makassar",
    bio: "Studio untuk membangun identitas visual bisnis lokal.",
  });
  const db = JSON.parse(storage.getItem(ACCOUNT_KEY));
  db.accounts.find((account) => account.id === user.id).permissions = [
    ADMIN_PERMISSION,
  ];
  storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
  const customer = createCustomerStore({
    storage,
    currentUser: () => store.current(),
    resolveSellerProfile: (id) => store.getBookableSeller(id),
    catalog: [
      {
        id: "service-a",
        creatorId: external.id,
        title: "Branding",
        price: 1200000,
        availability: "Open",
        delivery: "Remote",
      },
    ],
    creators: [external],
    randomId: randomUUID,
  });
  customer.addFavorite("service-a");
  customer.addToCart("service-a");
  const booking = customer.createBooking(
    "service-a",
    {
      requirements: "Logo dan pedoman visual usaha.",
      description: "Proyek identitas visual untuk bisnis kopi lokal.",
    },
    { confirmed: true, expectedUserId: user.id },
  );
  store.updateProfile({ name: "Nama Baru" }, { expectedUserId: user.id });
  await change(store, user.id);
  assert.equal(store.current().sellerProfileId, seller.id);
  assert.deepEqual(store.current().capabilities, ["buyer", "seller"]);
  assert.deepEqual(store.current().permissions, [ADMIN_PERMISSION]);
  assert.equal(store.getOwnedSeller(seller.id).ownerUserId, user.id);
  assert.equal(customer.getBooking(booking.id).customerId, user.id);
  assert.deepEqual(customer.view().favorites, ["service-a"]);
});

function delayedStore(storage) {
  let release;
  let began;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const crypto = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: webcrypto.randomUUID.bind(webcrypto),
    subtle: {
      importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
      deriveBits: async (...args) => {
        began();
        await gate;
        return webcrypto.subtle.deriveBits(...args);
      },
    },
  };
  return { store: createDemoStore(storage, crypto), release, started };
}

test("an account switch during asynchronous password verification prevents the write", async () => {
  const { store, storage } = setup();
  const first = await store.register(credentials);
  const delayed = delayedStore(storage);
  const pending = change(delayed.store, first.id);
  await delayed.started;
  const second = await store.register({
    ...credentials,
    email: "other@example.test",
  });
  delayed.release();
  await assert.rejects(pending, /Sesi atau kata sandi berubah/);
  assert.equal(store.current().id, second.id);
  assert.equal(
    (await store.login(credentials.email, credentials.password)).id,
    first.id,
  );
});

test("profile edits during password hashing are preserved by the final re-read", async () => {
  const { store, storage } = setup();
  const user = await store.register(credentials);
  const delayed = delayedStore(storage);
  const pending = change(delayed.store, user.id);
  await delayed.started;
  store.updateProfile(
    { name: "Nama Selama Verifikasi" },
    { expectedUserId: user.id },
  );
  delayed.release();
  await pending;
  assert.equal(store.current().name, "Nama Selama Verifikasi");
});

test("corrupt/unavailable storage is surfaced without destructive writes", async () => {
  const { store, storage } = setup();
  const user = await store.register(credentials);
  const before = storage.getItem(ACCOUNT_KEY);
  const failing = createDemoStore(
    {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    },
    webcrypto,
  );
  assert.throws(
    () =>
      failing.updateProfile(
        { name: "Tidak Tersimpan" },
        { expectedUserId: user.id },
      ),
    /Penyimpanan/,
  );
  await assert.rejects(change(failing, user.id), /Penyimpanan/);
  assert.equal(storage.getItem(ACCOUNT_KEY), before);
  const unavailable = createDemoStore(
    {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: storage.setItem,
    },
    webcrypto,
  );
  assert.throws(() => unavailable.current(), /tidak dapat dibaca/);
  for (const raw of [
    "{broken",
    JSON.stringify({
      version: 1,
      accounts: [null],
      profiles: [],
      session: null,
    }),
  ]) {
    storage.setItem(ACCOUNT_KEY, raw);
    assert.throws(
      () =>
        store.updateProfile(
          { name: "Tidak Tersimpan" },
          { expectedUserId: user.id },
        ),
      /Data demo/,
    );
    await assert.rejects(change(store, user.id), /Data demo/);
    assert.equal(storage.getItem(ACCOUNT_KEY), raw);
  }
});

test("settings is a safe private return destination", () => {
  assert.equal(safeReturnTo("/settings"), "/settings");
  assert.equal(safeReturnTo("//evil.example/settings"), "/");
});
