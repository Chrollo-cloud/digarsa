import assert from "node:assert/strict";
import test from "node:test";
import type { PublicServiceRow } from "../src/modules/catalog/catalog.service.js";
import { deterministicRecommendationEngine, type RecommendationPreferences, validateProviderResults } from "../src/modules/recommendations/recommendation.service.js";

const approvedDisposableUrl = "postgresql://digarsa_concurrency_test_user:local-test-only@localhost:5432/digarsa_concurrency_test?schema=public";
process.env.NODE_ENV = "test";
process.env.DIRECT_URL_CONCURRENCY_TEST = approvedDisposableUrl;
const { createRecommendationHandler } = await import("../src/modules/recommendations/recommendation.controller.js");

const createdAt = new Date("2026-01-01T00:00:00.000Z");

function service(overrides: Partial<{
  id: string;
  title: string;
  description: string;
  price: number;
  categoryName: string;
  city: string;
  avgRating: number;
  reviewCount: number;
  createdAt: Date;
}> = {}) {
  const values = {
    id: "service-1",
    title: "Studio photo",
    description: "Fotografi produk dan katalog",
    price: 1_000_000,
    categoryName: "Fotografi",
    city: "Makassar",
    avgRating: 4.8,
    reviewCount: 20,
    createdAt,
    ...overrides,
  };
  return {
    id: values.id,
    sellerId: "seller-profile-1",
    title: values.title,
    description: values.description,
    price: values.price,
    delivery: "Remote",
    turnaround: "3 hari",
    revisionPolicyVersion: 1,
    revisionFreeCount: null,
    revisionRequestWindowHours: null,
    revisionTerms: null,
    image: null,
    active: true,
    serviceLocation: null,
    dpPercent: null,
    maxBookingsPerDay: 1,
    region: "Sulawesi Selatan",
    lat: null,
    lng: null,
    status: "OPEN",
    isHidden: false,
    moderationStatus: "APPROVED",
    moderationNote: null,
    moderatedById: null,
    moderatedAt: null,
    avgRating: values.avgRating,
    reviewCount: values.reviewCount,
    createdAt: values.createdAt,
    updatedAt: values.createdAt,
    category: { id: 1, name: values.categoryName, slug: "fotografi", description: null, iconUrl: null, isActive: true, createdAt },
    seller: {
      id: "seller-profile-1",
      displayName: "Studio Nyata",
      category: values.categoryName,
      city: values.city,
      image: null,
      bio: "",
      specialties: ["produk"],
      portfolioLink: null,
      publicLocation: null,
      verificationStatus: "APPROVED",
      user: { accountStatus: "ACTIVE" },
    },
    serviceImages: [],
  } as unknown as PublicServiceRow;
}

function rank(rows: PublicServiceRow[], preferences: RecommendationPreferences = {}) {
  return deterministicRecommendationEngine.rank(rows, preferences);
}

function request(query: Record<string, string> = {}) {
  return { query } as never;
}

function response() {
  let statusCode = 0;
  let body: any;
  return {
    res: {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as never,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

test("category preference ranks matching category first", () => {
  const photo = service({ id: "photo", categoryName: "Fotografi" });
  const design = service({ id: "design", categoryName: "Desain Grafis" });
  assert.equal(rank([design, photo], { category: "fotografi" })[0]?.service.id, "photo");
});

test("budget preference ranks affordable services first", () => {
  const affordable = service({ id: "affordable", price: 800_000 });
  const expensive = service({ id: "expensive", price: 1_400_000 });
  assert.equal(rank([expensive, affordable], { max_budget: 1_000_000 })[0]?.service.id, "affordable");
});

test("city preference ranks matching seller city first", () => {
  const local = service({ id: "local", city: "Makassar" });
  const other = service({ id: "other", city: "Bandung" });
  assert.equal(rank([other, local], { city: "MAKASSAR" })[0]?.service.id, "local");
});

test("rating relevance considers review confidence, not rating alone", () => {
  const supported = service({ id: "supported", avgRating: 4.6, reviewCount: 40 });
  const oneReview = service({ id: "one-review", avgRating: 5, reviewCount: 1 });
  assert.equal(rank([oneReview, supported])[0]?.service.id, "supported");
});

test("cold-start ranking is deterministic and favors supported ratings fairly", () => {
  const rated = service({ id: "rated", avgRating: 4.5, reviewCount: 20 });
  const unrated = service({ id: "unrated", avgRating: 0, reviewCount: 0 });
  assert.equal(rank([unrated, rated])[0]?.service.id, "rated");
  assert.deepEqual(rank([unrated, rated]).map((item) => item.service.id), rank([unrated, rated]).map((item) => item.service.id));
});

test("missing ratings and location stay neutral instead of receiving fabricated values", () => {
  const missing = service({ id: "missing", avgRating: 0, reviewCount: 0, city: "" });
  const result = rank([missing], { city: "Makassar" })[0];
  assert.equal(result?.score, 50);
  assert.deepEqual(result?.explanation, ["Layanan aktif yang tersedia untuk dipesan."]);
});

test("query preference ranks candidate with more matching terms and returns grounded explanation", () => {
  const close = service({ id: "close", title: "Foto produk UMKM", description: "Fotografi katalog" });
  const partial = service({ id: "partial", title: "Foto produk", description: "" });
  const result = rank([partial, close], { query: "foto produk katalog" });
  assert.equal(result[0]?.service.id, "close");
  assert.ok(result[0]?.explanation.includes("Judul, kategori, atau deskripsi cocok dengan pencarianmu."));
});

test("controller constrains candidates to visible open services and maps public service DTO", async () => {
  let args: any;
  const eligible = service({ id: "eligible" });
  const handler = createRecommendationHandler({
    service: { async findMany(input) { args = input; return [eligible]; } },
  } as never);
  const result = response();
  await handler(request({ category: "Fotografi", limit: "3" }), result.res);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(args.where.AND[0], {
    active: true,
    isHidden: false,
    moderationStatus: "APPROVED",
    category: { is: { isActive: true } },
    seller: { is: { verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } } },
  });
  assert.deepEqual(args.where.AND[1], { status: "OPEN" });
  assert.equal(args.take, 250);
  assert.equal(args.orderBy[0].createdAt, "desc");
  assert.equal(result.body.data[0].id, "eligible");
  assert.equal(result.body.data[0].recommendation.ranking_source, "rule_based");
  assert.equal(result.body.data[0].bookable, true);
  assert.equal(result.body.meta.provider_configured, false);
});

test("hidden, unapproved, inactive and full-book records are excluded before ranking", async () => {
  let where: any;
  const handler = createRecommendationHandler({
    service: { async findMany(args) { where = args.where; return []; } },
  } as never);
  const result = response();
  await handler(request(), result.res);
  assert.equal(where.AND[0].active, true);
  assert.equal(where.AND[0].isHidden, false);
  assert.equal(where.AND[0].moderationStatus, "APPROVED");
  assert.equal(where.AND[0].seller.is.verificationStatus, "APPROVED");
  assert.equal(where.AND[1].status, "OPEN");
  assert.deepEqual(result.body.data, []);
});

test("invalid recommendation query parameters return validation error", async () => {
  const handler = createRecommendationHandler({ service: { async findMany() { assert.fail("invalid input must not query catalog"); } } } as never);
  await assert.rejects(handler(request({ max_budget: "-1" }), response().res), { code: "VALIDATION_FAILED" });
  await assert.rejects(handler(request({ limit: "51" }), response().res), { code: "VALIDATION_FAILED" });
  await assert.rejects(handler(request({ query: "x".repeat(121) }), response().res), { code: "VALIDATION_FAILED" });
});

test("empty catalog returns an honest empty rule-based result", async () => {
  const handler = createRecommendationHandler({ service: { async findMany() { return []; } } } as never);
  const result = response();
  await handler(request(), result.res);
  assert.deepEqual(result.body.data, []);
  assert.equal(result.body.meta.ranking_source, "rule_based");
});

test("future provider results cannot introduce or duplicate catalog service IDs", () => {
  const candidates = [service({ id: "candidate-1" }), service({ id: "candidate-2" })];
  const validated = validateProviderResults(candidates, [
    { service_id: "invented-service", explanation: ["invented"] },
    { service_id: "candidate-2", explanation: ["  cocok  ", 42] },
    { service_id: "candidate-2", explanation: ["duplicate"] },
    { service_id: "candidate-1", explanation: "invalid shape" },
  ], 5);
  assert.deepEqual(validated.map((item) => item.service.id), ["candidate-2", "candidate-1"]);
  assert.deepEqual(validated[0]?.explanation, ["cocok"]);
});

test("recommendation API route is GET /recommendations", async () => {
  const routes = (await import("../src/modules/recommendations/recommendation.routes.js")).default;
  const stack = (routes as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack;
  assert.ok(stack.some((layer) => layer.route?.path === "/recommendations" && layer.route.methods.get));
});
