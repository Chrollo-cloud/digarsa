import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  catalogSearchParams,
  getCatalogFacets,
  getPublicCreator,
  getPublicService,
  listPublicServices,
  mapPublicService,
} from "../src/features/catalog/catalogApi.js";
import { API_BASE_URL } from "../src/lib/apiClient.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const serviceDto = {
  id: "svc-1", seller_profile_id: "seller-1", title: "Brand identity", category: "Branding",
  description: "A public service", price: 1200000, delivery: "Remote", turnaround: "7 days",
  availability: "Open", image_url: "https://cdn.example/service.jpg", active: true,
  created_at: "2026-11-13T00:00:00.000Z", updated_at: "2026-11-13T00:00:00.000Z",
  studio: "Studio One", city: "Makassar", public_location: null, bookable: true,
  source: "seller", alt: "Brand identity work", images: [{ src: "https://cdn.example/service.jpg", alt: "Work" }],
  avg_rating: 4.5, review_count: 2,
};

test("service list uses verified filters, anonymous transport, and cursor response", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ data: [serviceDto], page: { next_cursor: "next-cursor", has_more: true }, total: 21 });
  };
  const page = await listPublicServices({ q: " brand ", category: "Branding", city: "Makassar", min: "100000", max: "2000000", availability: "Open", sort: "price-up", cursor: "abc", limit: 10 });
  const parsed = new URL(captured.url);
  assert.equal(parsed.origin, API_BASE_URL);
  assert.equal(parsed.pathname, "/api/v1/services");
  assert.equal(parsed.searchParams.get("q"), "brand");
  assert.equal(parsed.searchParams.get("category"), "Branding");
  assert.equal(parsed.searchParams.get("city"), "Makassar");
  assert.equal(parsed.searchParams.get("min"), "100000");
  assert.equal(parsed.searchParams.get("max"), "2000000");
  assert.equal(parsed.searchParams.get("availability"), "Open");
  assert.equal(parsed.searchParams.get("sort"), "price-up");
  assert.equal(parsed.searchParams.get("cursor"), "abc");
  assert.equal(parsed.searchParams.get("limit"), "10");
  assert.equal(captured.options.headers.has("Authorization"), false);
  assert.equal(page.items[0].creatorId, "seller-1");
  assert.equal(page.items[0].avgRating, 4.5);
  assert.equal(page.nextCursor, "next-cursor");
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 21);
});

test("filters restrict sort values and service mapper handles optional or unsafe images", () => {
  const query = new URLSearchParams(catalogSearchParams({ sort: "not-supported", limit: 500, cursor: "" }));
  assert.equal(query.get("sort"), "editor");
  assert.equal(query.get("limit"), "100");
  const mapped = mapPublicService({ ...serviceDto, image_url: "javascript:alert(1)", images: [], avg_rating: null, review_count: 0 });
  assert.equal(mapped.image, "");
  assert.deepEqual(mapped.images, []);
  assert.equal(mapped.avgRating, null);
  assert.equal(mapped.reviewCount, 0);
  assert.equal(mapped.price, 1200000);
});

test("public detail, creator, and facet adapters use the mounted public route contracts", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url.includes("/catalog/facets")) return jsonResponse({ data: { categories: ["Branding"], cities: ["Makassar"] } });
    if (url.includes("/creators/")) return jsonResponse({ data: {
      id: "seller-1", name: "Studio One", category: "Branding", city: "Makassar", bio: "Bio",
      image_url: null, portfolio_link: null, specialties: ["Identity"], public_location: null,
      services: [serviceDto], portfolio: [],
    } });
    return jsonResponse({ data: serviceDto });
  };
  assert.equal((await getPublicService("svc-1")).id, "svc-1");
  const creator = await getPublicCreator("seller-1");
  assert.equal(creator.services[0].id, "svc-1");
  assert.deepEqual(creator.skills, ["Identity"]);
  assert.equal(creator.image, "");
  assert.deepEqual(await getCatalogFacets(), { categories: ["Branding"], cities: ["Makassar"] });
  assert.ok(urls.some((url) => url.endsWith("/api/v1/services/svc-1")));
  assert.ok(urls.some((url) => url.endsWith("/api/v1/creators/seller-1")));
  assert.ok(urls.some((url) => url.endsWith("/api/v1/catalog/facets")));
});
