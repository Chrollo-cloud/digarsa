import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  ACCOUNT_KEY,
  ADMIN_PERMISSION,
  createDemoStore,
} from "../src/features/account/demoStore.js";
import { safeReturnTo } from "../src/features/account/redirects.js";

function setup() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return { store: createDemoStore(storage, webcrypto), storage };
}
const account = (email = "demo@example.com") => ({
  name: "Akun Demo",
  email,
  password: "Demo-password-123",
});
const profile = {
  name: "Studio Demo",
  category: "Branding",
  city: "Makassar",
  bio: "Studio kreatif untuk identitas visual bisnis lokal.",
  image: "",
  portfolioLink: "",
  specialties: "Branding, Packaging",
};

test("registration normalizes email, ignores submitted permissions and never persists plaintext passwords", async () => {
  const { store, storage } = setup();
  const user = await store.register({
    ...account(" DEMO@Example.com "),
    role: "admin",
    permissions: [ADMIN_PERMISSION],
    sellerProfileId: "shared-seller",
  });
  assert.equal(user.email, "demo@example.com");
  assert.deepEqual(user.capabilities, ["buyer"]);
  assert.deepEqual(user.permissions, []);
  assert.equal(user.sellerProfileId, null);
  assert.equal(
    storage.getItem(ACCOUNT_KEY).includes("Demo-password-123"),
    false,
  );
  assert.equal("passwordVerifier" in user, false);
  await assert.rejects(
    store.register(account("demo@example.com")),
    /sudah terdaftar/,
  );
});

test("registration validates name, email, password and login rejects bad credentials", async () => {
  const { store } = setup();
  await assert.rejects(store.register({ ...account(), name: " " }));
  await assert.rejects(store.register(account("not-email")));
  await assert.rejects(store.register({ ...account(), password: "short" }));
  await store.register(account());
  store.logout();
  await assert.rejects(
    store.login("demo@example.com", "incorrect"),
    /tidak cocok/,
  );
  await assert.rejects(
    store.login("missing@example.com", "incorrect"),
    /tidak cocok/,
  );
  assert.equal(store.current(), null);
  const user = await store.login("DEMO@example.com", account().password);
  assert.equal(user.email, "demo@example.com");
});

test("sessions persist across store instances and logout clears only the session", async () => {
  const { store, storage } = setup();
  const user = await store.register(account());
  const reloaded = createDemoStore(storage, webcrypto);
  assert.equal(reloaded.current().id, user.id);
  reloaded.logout();
  assert.equal(store.current(), null);
  assert.equal(
    (await reloaded.login(account().email, account().password)).id,
    user.id,
  );
});

test("seller activation associates the profile with the session owner and retains buyer capabilities", async () => {
  const { store, storage } = setup();
  const user = await store.register(account());
  const seller = store.activateSeller({
    ...profile,
    ownerUserId: "forged-owner",
    id: "shared-id",
  });
  assert.equal(seller.ownerUserId, user.id);
  assert.notEqual(seller.id, "shared-id");
  assert.equal(store.current().sellerProfileId, seller.id);
  assert.deepEqual(store.current().capabilities, ["buyer", "seller"]);
  assert.equal(
    createDemoStore(storage, webcrypto).getOwnedSeller(seller.id).ownerUserId,
    user.id,
  );
  assert.throws(() => store.activateSeller(profile), /sudah diaktifkan/);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_KEY)).profiles.length, 1);
});

test("separate accounts receive distinct profile IDs and cannot access another account profile", async () => {
  const { store } = setup();
  const first = await store.register(account("first@example.com"));
  const firstSeller = store.activateSeller(profile);
  store.logout();
  assert.throws(() => store.activateSeller(profile), /Masuk/);
  assert.throws(() => store.getOwnedSeller(firstSeller.id));
  const second = await store.register(account("second@example.com"));
  assert.notEqual(first.id, second.id);
  assert.deepEqual(store.current().capabilities, ["buyer"]);
  assert.throws(() => store.getOwnedSeller(firstSeller.id));
  const secondSeller = store.activateSeller(profile);
  assert.notEqual(firstSeller.id, secondSeller.id);
  assert.equal(secondSeller.ownerUserId, second.id);
  await store.login("first@example.com", account().password);
  assert.equal(store.current().sellerProfileId, firstSeller.id);
  assert.throws(() => store.getOwnedSeller(secondSeller.id));
});

test("seller validation rejects unsafe URLs and invalid fields without partial activation", async () => {
  const { store } = setup();
  await store.register(account());
  for (const changes of [
    { bio: "short" },
    { city: "" },
    { category: "unknown" },
    { image: "javascript:alert(1)" },
    { portfolioLink: "https://name:secret@example.com/" },
  ]) {
    assert.throws(() => store.activateSeller({ ...profile, ...changes }));
    assert.equal(store.current().sellerProfileId, null);
  }
});

test("email text and public profile IDs never confer seller or admin permission", async () => {
  const { store, storage } = setup();
  await store.register(account("admin+seller@digarsa.test"));
  assert.deepEqual(store.current().permissions, []);
  assert.deepEqual(store.current().capabilities, ["buyer"]);
  assert.throws(() => store.getOwnedSeller("arah"));
  // Explicit internal fixture provisioning; no registration/UI path grants this.
  const db = JSON.parse(storage.getItem(ACCOUNT_KEY));
  db.accounts[0].permissions = [ADMIN_PERMISSION];
  storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
  assert.deepEqual(store.current().permissions, [ADMIN_PERMISSION]);
  assert.deepEqual(store.current().capabilities, ["buyer"]);
});

test("a forged profile association does not confer seller capability", async () => {
  const { store, storage } = setup();
  await store.register(account("first@example.com"));
  const seller = store.activateSeller(profile);
  const second = await store.register(account("second@example.com"));
  const db = JSON.parse(storage.getItem(ACCOUNT_KEY));
  db.accounts.find((item) => item.id === second.id).sellerProfileId = seller.id;
  storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
  assert.deepEqual(store.current().capabilities, ["buyer"]);
  assert.throws(() => store.getOwnedSeller(seller.id));
});

test("return destinations allow supported local pages and reject external, encoded, control and auth-loop paths", () => {
  for (const path of [
    "/become-a-creator",
    "/seller-dashboard",
    "/service/identity",
    "/marketplace?category=Branding#results",
    "/marketplace?category=Fotografi%20%26%20Film",
    "/seller/arah",
  ])
    assert.equal(safeReturnTo(path), path);
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/%2f%2fevil.example",
    "/login",
    "/register",
    "/unknown",
    "/\n/evil.example",
    null,
  ])
    assert.equal(safeReturnTo(path), "/dashboard");
});

test("storage failure does not report successful registration; malformed data is surfaced", async () => {
  const { storage } = setup();
  const store = createDemoStore(
    {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    },
    webcrypto,
  );
  await assert.rejects(store.register(account()), /Penyimpanan/);
  assert.equal(store.current(), null);
  storage.setItem(ACCOUNT_KEY, "{broken");
  assert.throws(() => store.current(), /Data demo/);
});
