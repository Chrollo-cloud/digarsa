import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createDemoStore,
  ACCOUNT_KEY,
  ADMIN_PERMISSION,
} from "../src/features/account/demoStore.js";
import { createDemoAdminProvisioner } from "../src/dev/demoAdminProvisioner.js";

async function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const accounts = createDemoStore(storage, webcrypto);
  const password = "PhaseA-test-only-8742!";
  const buyer = await accounts.register({
    name: "Customer",
    email: "customer@example.test",
    password,
  });
  const seller = await accounts.register({
    name: "Seller",
    email: "seller@example.test",
    password,
  });
  const profile = accounts.activateSeller({
    name: "Studio Test",
    category: "Branding",
    city: "Makassar",
    bio: "Studio kreatif untuk identitas visual bisnis lokal.",
  });
  const tool = (options) =>
    createDemoAdminProvisioner({
      development: true,
      hostname: "localhost",
      storage,
      accounts,
      ...options,
    });
  return { data, storage, accounts, password, buyer, seller, profile, tool };
}

test("explicit development provisioning preserves accounts, seller association, and session", async () => {
  const f = await fixture();
  assert.deepEqual(f.accounts.current().permissions, []);
  assert.throws(() => f.accounts.listAccountsForAdmin(), /admin/);
  const before = JSON.parse(f.data.get(ACCOUNT_KEY));
  f.tool().provision(f.seller.id);
  const after = JSON.parse(f.data.get(ACCOUNT_KEY));
  const expected = structuredClone(before);
  expected.accounts
    .find((row) => row.id === f.seller.id)
    .permissions.push(ADMIN_PERMISSION);
  assert.deepEqual(after, expected);
  assert.deepEqual(f.accounts.current().capabilities, ["buyer", "seller"]);
  assert.equal(f.accounts.current().sellerProfileId, f.profile.id);
  assert.equal(f.accounts.listAccountsForAdmin().length, 2);
  const once = f.data.get(ACCOUNT_KEY);
  f.tool().provision(f.seller.id);
  assert.equal(f.data.get(ACCOUNT_KEY), once);
  const reloaded = createDemoStore(f.storage, webcrypto);
  assert.deepEqual(reloaded.current().permissions, [ADMIN_PERMISSION]);
  reloaded.logout();
  assert.equal(reloaded.current(), null);
  assert.throws(() => reloaded.listAccountsForAdmin(), /admin/);
  await reloaded.login("seller@example.test", f.password);
  assert.equal(reloaded.current().id, f.seller.id);
  assert.deepEqual(reloaded.current().permissions, [ADMIN_PERMISSION]);
  await reloaded.login("customer@example.test", f.password);
  assert.deepEqual(reloaded.current().permissions, []);
  assert.throws(() => reloaded.listAccountsForAdmin(), /admin/);
});

test("production, non-loopback origins, guests, and a different account cannot be provisioned", async () => {
  const f = await fixture();
  const before = f.data.get(ACCOUNT_KEY);
  for (const options of [
    { development: false },
    { development: undefined },
    { hostname: "digarsa.example" },
    { hostname: "localhost.evil.example" },
  ])
    assert.throws(
      () => f.tool(options).provision(f.seller.id),
      /development localhost/,
    );
  assert.throws(() => f.tool().provision(f.buyer.id), /ID harus sama/);
  assert.throws(() => f.tool().provision(), /ID harus sama/);
  assert.equal(f.data.get(ACCOUNT_KEY), before);
  f.accounts.logout();
  assert.throws(() => f.tool().provision(f.seller.id), /Masuk/);
});

test("corrupt or unavailable account storage is never silently overwritten by provisioning", async () => {
  const f = await fixture();
  f.data.set(ACCOUNT_KEY, "{damaged");
  assert.throws(() => f.tool().provision(f.seller.id));
  assert.equal(f.data.get(ACCOUNT_KEY), "{damaged");
  assert.throws(
    () =>
      f
        .tool({
          storage: {
            getItem() {
              throw new Error("denied");
            },
          },
          accounts: { current: () => f.seller },
        })
        .provision(f.seller.id),
    /tidak dapat dibaca/,
  );
});

test('explicit revocation affects only the verified active ID and preserves credentials and associations', async () => {
  const f = await fixture();
  const before = f.data.get(ACCOUNT_KEY);
  f.tool().provision(f.seller.id);
  assert.throws(() => f.tool().revoke(f.buyer.id), /ID harus sama/);
  f.tool().revoke(f.seller.id);
  assert.equal(f.data.get(ACCOUNT_KEY), before);
  assert.throws(() => f.accounts.listAccountsForAdmin(), /admin/);
  f.tool().revoke(f.seller.id);
  assert.equal(f.accounts.current().sellerProfileId, f.profile.id);
});
