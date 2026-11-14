import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { addSavedItem, listSavedItems, mapSavedItem, removeSavedItem } from "../src/features/customer/savedItemsApi.js";
import { API_BASE_URL } from "../src/lib/apiClient.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const token = "saved-items-token";
beforeEach(() => { globalThis.window = { sessionStorage: { getItem: () => token } }; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function jsonResponse(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }
const visibleService = {
  id: "service-1", seller_profile_id: "seller-1", title: "Brand identity", category: "Branding", description: "A public service",
  price: 100000, delivery: "Remote", turnaround: "5 days", availability: "Open", image_url: null, images: [],
  active: true, bookable: true, studio: "Studio", city: "Makassar", avg_rating: null, review_count: 0,
};

test("favorites and cart use authenticated paginated endpoints and map backend service data", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ data: [
      { service_id: "service-1", service: visibleService, available: true },
      { service_id: "service-hidden", service: null, available: false },
    ], page: { next_cursor: "saved-next", has_more: true }, total: 101 });
  };
  const page = await listSavedItems("favorites", { cursor: "older", limit: 20 });
  assert.equal(calls[0].url, `${API_BASE_URL}/api/v1/me/favorites?limit=20&cursor=older`);
  assert.equal(calls[0].options.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(page.items[0].service.title, "Brand identity");
  assert.equal(page.items[1].service, null);
  assert.equal(page.items[1].available, false);
  assert.equal(page.nextCursor, "saved-next");
  assert.equal(page.total, 101);

  await listSavedItems("cart");
  assert.equal(new URL(calls[1].url).pathname, "/api/v1/me/cart");
  assert.equal(new URL(calls[1].url).searchParams.get("limit"), "100");
});

test("add is idempotent PUT with an empty body; remove accepts the backend 204 response", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") return jsonResponse({ data: { service_id: "service-1" } });
    return new Response(null, { status: 204 });
  };
  await addSavedItem("favorites", "service-1");
  await addSavedItem("favorites", "service-1");
  await addSavedItem("cart", "service-1");
  await removeSavedItem("cart", "service-1");
  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
  assert.equal(calls[0].url, `${API_BASE_URL}/api/v1/me/favorites/service-1`);
  assert.equal(calls[2].url, `${API_BASE_URL}/api/v1/me/cart/service-1`);
  assert.equal(calls[3].options.method, "DELETE");
  assert.equal(calls[3].url, `${API_BASE_URL}/api/v1/me/cart/service-1`);
  assert.equal(calls.filter((call) => call.options.method === "PUT").length, 3);
});

test("unavailable and non-bookable cart entries remain unavailable without a replacement service", () => {
  const unavailable = mapSavedItem({ service_id: "removed-id", service: null, available: false });
  assert.deepEqual(unavailable, { serviceId: "removed-id", service: null, available: false });
  const full = mapSavedItem({ service_id: "full-id", service: { ...visibleService, id: "full-id", availability: "Full-book", bookable: false }, available: false });
  assert.equal(full.service.availability, "Full-book");
  assert.equal(full.service.bookable, false);
  assert.equal(full.available, false);
  assert.throws(() => mapSavedItem({ service_id: "x", service: visibleService, available: "yes" }), /invalid item/i);
});

test("401 and server validation errors are preserved for session and UI handling", async () => {
  globalThis.fetch = async () => jsonResponse({ error: { code: "INVALID_TOKEN", message: "Session expired" } }, 401);
  await assert.rejects(listSavedItems("cart"), (error) => error.status === 401 && error.code === "INVALID_TOKEN");
  globalThis.fetch = async () => jsonResponse({ error: { code: "SERVICE_NOT_FOUND", message: "Service unavailable" } }, 404);
  await assert.rejects(addSavedItem("cart", "service-1"), (error) => error.status === 404 && error.code === "SERVICE_NOT_FOUND");
});

test("paginated response must provide a cursor when more records exist", async () => {
  globalThis.fetch = async () => jsonResponse({ data: [], page: { next_cursor: null, has_more: true }, total: 1 });
  await assert.rejects(listSavedItems("favorites"), /missing its next cursor/i);
});

