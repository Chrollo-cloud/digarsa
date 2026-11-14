import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddServiceToCart, createSavedItemsStore } from "../src/features/customer/savedItemsStore.js";

const page = (items = [], total = items.length) => ({ items, total, nextCursor: null, hasMore: false });
const service = { id: "service-1", title: "Identity", bookable: true };
const item = { serviceId: "service-1", service, available: true };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a repeated favorite action while pending issues one request and reconciles from the server", async () => {
  let added = false;
  let addCalls = 0;
  const api = {
    async listSavedItems(kind) { return kind === "favorites" && added ? page([item]) : page(); },
    async addSavedItem() { addCalls += 1; await tick(); added = true; return { service_id: service.id }; },
    async removeSavedItem() { added = false; },
  };
  const store = createSavedItemsStore(api);
  store.activate("account-a");
  await tick();
  assert.equal(store.view("account-a").favorites.status, "ready");
  assert.deepEqual(store.view("account-a").favorites.items, []);
  const [first, duplicate] = await Promise.all([
    store.addFavorite(service.id, service),
    store.addFavorite(service.id, service),
  ]);
  assert.equal(first, true);
  assert.equal(duplicate, false);
  assert.equal(addCalls, 1);
  assert.equal(store.view("account-a").favorites.items.length, 1);
  assert.equal(store.view("account-a").favorites.total, 1);
});

test("saved membership reads follow backend cursors and deduplicate service entries", async () => {
  let pageCalls = 0;
  const api = {
    async listSavedItems(kind, { cursor } = {}) {
      if (kind !== "favorites") return page();
      pageCalls += 1;
      return cursor ? { items: [item, { serviceId: "service-2", service: null, available: false }], total: 2, nextCursor: null, hasMore: false }
        : { items: [item], total: 2, nextCursor: "cursor-2", hasMore: true };
    },
    async addSavedItem() {},
    async removeSavedItem() {},
  };
  const store = createSavedItemsStore(api);
  store.activate("account-a");
  await tick();
  assert.equal(pageCalls, 2); // The first favorites page and its next cursor page.
  assert.deepEqual(store.view("account-a").favorites.items.map((saved) => saved.serviceId), ["service-1", "service-2"]);
  assert.equal(store.view("account-a").favorites.hasMore, false);
});

test("account switching hides old data immediately and ignores late responses", async () => {
  const deferred = new Map();
  let requestedAccount = "account-a";
  const api = {
    listSavedItems(kind) {
      const key = `${requestedAccount}:${kind}`;
      return new Promise((resolve) => deferred.set(key, resolve));
    },
    async addSavedItem() {},
    async removeSavedItem() {},
  };
  const store = createSavedItemsStore(api);
  store.activate("account-a");
  requestedAccount = "account-b";
  store.activate("account-b");
  assert.equal(store.view("account-b").favorites.status, "loading");
  assert.deepEqual(store.view("account-b").favorites.items, []);
  deferred.get("account-b:favorites")(page([{ serviceId: "b-fav", service: null, available: false }], 1));
  deferred.get("account-b:cart")(page([{ serviceId: "b-cart", service: null, available: false }], 1));
  await tick();
  deferred.get("account-a:favorites")(page([{ serviceId: "a-fav", service: null, available: false }], 1));
  deferred.get("account-a:cart")(page([{ serviceId: "a-cart", service: null, available: false }], 1));
  await tick();
  assert.deepEqual(store.view("account-b").favorites.items.map((saved) => saved.serviceId), ["b-fav"]);
  assert.deepEqual(store.view("account-b").cart.items.map((saved) => saved.serviceId), ["b-cart"]);
  assert.deepEqual(store.view("account-a").favorites.items, []);
});

test("cart operations reject unauthenticated calls and preserve 401 failures", async () => {
  const unauthorized = Object.assign(new Error("Session expired"), { status: 401, code: "INVALID_TOKEN" });
  const store = createSavedItemsStore({
    async listSavedItems(kind) { if (kind === "cart") throw unauthorized; return page(); },
    async addSavedItem() { throw unauthorized; },
    async removeSavedItem() {},
  });
  await assert.rejects(store.addToCart("service-1", service), /Sign in/);
  store.activate("account-a");
  await tick();
  assert.equal(store.view("account-a").cart.error.status, 401);
  await assert.rejects(store.addToCart("service-1", service), (error) => error.status === 401);
});

test("only backend-marked bookable services can be added to cart", () => {
  assert.equal(canAddServiceToCart(service), true);
  assert.equal(canAddServiceToCart({ ...service, bookable: false }), false);
  assert.equal(canAddServiceToCart(null), false);
  const store = createSavedItemsStore({ listSavedItems: async () => page(), addSavedItem: async () => {}, removeSavedItem: async () => {} });
  store.activate("account-a");
  assert.throws(() => store.addToCart("service-hidden", { bookable: false }), /not currently available/i);
});

