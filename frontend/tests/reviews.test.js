import test from "node:test";
import assert from "node:assert/strict";
import {
  createReviewStore,
  REVIEW_KEY,
  reviewFields,
  summarizeReviews,
} from "../src/features/reviews/reviewStore.js";
import { createReviewAdapters } from "../src/features/reviews/reviewAdapters.js";
import { createReviewActions } from "../src/features/reviews/reviewActions.js";
import { createMessagingStore } from "../src/features/messaging/messagingStore.js";
import { createMessagingAdapters } from "../src/features/messaging/adapters.js";
import { safeReturnTo } from "../src/features/account/redirects.js";
import { reviewScenario } from "./fixtures/reviewScenario.js";

function fixture(overrides = {}) {
  const values = new Map();
  let current = {
    id: "buyer-user",
    name: "Nadia Rahma",
    capabilities: ["buyer", "seller"],
    sellerProfileId: "buyer-studio",
  };
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const booking = {
    id: "booking-1",
    customer_user_id: "buyer-user",
    service_id: "service-1",
    seller_profile_id: "seller-profile",
    status: "Completed",
    service_title: "Identitas visual",
    seller_name: "Studio Temu",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const records = [booking];
  const profile = { id: "seller-profile", owner_user_id: "seller-user" };
  const service = { id: "service-1", seller_profile_id: "seller-profile" };
  let sequence = 0;
  const options = {
    storage,
    currentUser: () => current,
    listBookings: () =>
      records.filter((row) => row.customer_user_id === current?.id),
    resolveSellerProfile: () => profile,
    resolveService: () => service,
    now: () => "2026-11-08T00:00:00.000Z",
    randomId: () => `id-${++sequence}`,
    ...overrides,
  };
  const store = createReviewStore(options);
  const input = (changes = {}) => ({
    booking_id: booking.id,
    service_id: service.id,
    seller_profile_id: profile.id,
    rating: 5,
    comment: "Komunikasi jelas dan hasilnya sesuai brief yang kami diskusikan.",
    ...changes,
  });
  return {
    store,
    storage,
    values,
    options,
    records,
    booking,
    profile,
    service,
    input,
    as: (user) => {
      current = user;
    },
    submit: (changes) =>
      store.submit(input(changes), { expected_user_id: current?.id }),
  };
}
const rejects = (fn, code) =>
  assert.throws(
    fn,
    (error) => error.name === "ReviewError" && error.code === code,
  );

test("Completed booking reviews persist with exact snake_case schema and stable IDs", () => {
  const f = fixture();
  assert.equal(f.store.getEligibility(f.booking.id).eligible, true);
  const row = f.submit();
  assert.deepEqual(Object.keys(row).sort(), [...reviewFields].sort());
  assert.equal(row.customer_user_id, "buyer-user");
  assert.equal(row.seller_profile_id, "seller-profile");
  assert.equal(f.store.getEligibility(f.booking.id).eligible, false);
  assert.equal(createReviewStore(f.options).listOwn()[0].id, row.id);
  row.comment = "local mutation";
  assert.notEqual(f.store.listOwn()[0].comment, "local mutation");
});

test("Requested, Accepted, Paid, Declined and Cancelled never become review-eligible", () => {
  for (const status of [
    "Requested",
    "Accepted",
    "Paid",
    "Declined",
    "Cancelled",
  ]) {
    const f = fixture();
    f.booking.status = status;
    assert.equal(f.store.getEligibility(f.booking.id).eligible, false);
    assert.deepEqual(f.store.listCompletedBookings(), []);
    rejects(() => f.submit(), "INELIGIBLE");
    assert.equal(f.values.has(REVIEW_KEY), false);
    assert.equal(f.booking.status, status);
  }
});

test("guests and other accounts cannot submit or read private booking contexts", () => {
  const f = fixture();
  f.as(null);
  rejects(() => f.store.listOwn(), "UNAUTHENTICATED");
  rejects(() => f.submit(), "UNAUTHENTICATED");
  f.as({
    id: "other",
    name: "Other",
    capabilities: ["buyer"],
    permissions: ["admin:access"],
  });
  rejects(() => f.submit(), "NOT_FOUND_OR_FORBIDDEN");
  rejects(() => f.store.getEligibility(f.booking.id), "NOT_FOUND_OR_FORBIDDEN");
  assert.deepEqual(f.store.listOwn(), []);
});

test("actual seller owner and associated profile cannot review their own service", () => {
  const f = fixture();
  f.profile.owner_user_id = "buyer-user";
  assert.equal(f.store.getEligibility(f.booking.id).eligible, false);
  rejects(() => f.submit(), "SELF_REVIEW");
  const second = fixture();
  second.profile.id = "buyer-studio";
  second.booking.seller_profile_id = "buyer-studio";
  rejects(
    () => second.submit({ seller_profile_id: "buyer-studio" }),
    "SELF_REVIEW",
  );
});

test("service, seller, booking relationships and real seller ownership are validated", () => {
  const f = fixture();
  rejects(() => f.submit({ service_id: "other-service" }), "INVALID_CONTEXT");
  rejects(
    () => f.submit({ seller_profile_id: "other-profile" }),
    "INVALID_CONTEXT",
  );
  f.service.seller_profile_id = "someone-else";
  rejects(() => f.submit(), "INVALID_CONTEXT");
  const orphan = fixture({ resolveSellerProfile: () => null });
  rejects(() => orphan.submit(), "INVALID_CONTEXT");
  const historical = fixture({ resolveService: () => null });
  assert.equal(historical.submit().service_id, "service-1");
});

test("duplicate reviews cannot be created across reloads or another account", () => {
  const f = fixture();
  const first = f.submit();
  const raw = f.values.get(REVIEW_KEY);
  rejects(
    () =>
      createReviewStore(f.options).submit(f.input(), {
        expected_user_id: "buyer-user",
      }),
    "DUPLICATE_REVIEW",
  );
  assert.equal(f.values.get(REVIEW_KEY), raw);
  assert.equal(f.store.listOwn()[0].id, first.id);
  f.as({
    id: "seller-user",
    capabilities: ["buyer", "seller"],
    sellerProfileId: "seller-profile",
  });
  rejects(() => f.submit(), "NOT_FOUND_OR_FORBIDDEN");
});

test("rating must be an integer 1–5; comments must contain 10–2000 valid characters", () => {
  for (const rating of [0, 6, 2.5, "5", NaN, null]) {
    const f = fixture();
    rejects(() => f.submit({ rating }), "INVALID_INPUT");
  }
  for (const comment of [
    "",
    "    ",
    "short",
    "\u200b".repeat(20),
    "a".repeat(2001),
    "Hello world\u0000",
    null,
  ]) {
    const f = fixture();
    rejects(() => f.submit({ comment }), "INVALID_INPUT");
  }
  const f = fixture();
  const row = f.submit({
    comment: "  Proses rapi, komunikasinya jelas dan hasilnya sesuai brief.  ",
    rating: 1,
  });
  assert.equal(row.comment, row.comment.trim());
  assert.equal(row.rating, 1);
});

test("sender impersonation and stale form account IDs are rejected", () => {
  const f = fixture();
  rejects(
    () =>
      f.store.submit(
        { ...f.input(), customer_user_id: "other" },
        { expected_user_id: "buyer-user" },
      ),
    "INVALID_INPUT",
  );
  rejects(
    () => f.store.submit(f.input(), { expected_user_id: "other" }),
    "SESSION_CHANGED",
  );
  rejects(() => f.store.submit(f.input()), "SESSION_CHANGED");
});

test("public publication excludes booking/account identifiers and account switching scopes private lists", () => {
  const f = fixture();
  const row = f.submit();
  f.as({ id: "other", capabilities: ["buyer"] });
  assert.deepEqual(f.store.listOwn(), []);
  rejects(
    () => f.store.getNotificationContext(row.id),
    "NOT_FOUND_OR_FORBIDDEN",
  );
  f.as(null);
  const publicRow = f.store.listPublic({ service_id: "service-1" })[0];
  for (const key of [
    "booking_id",
    "customer_user_id",
    "email",
    "phone",
    "requirements",
  ])
    assert.equal(Object.hasOwn(publicRow, key), false);
  assert.equal(publicRow.verified, true);
  assert.equal(publicRow.id, row.id);
  assert.deepEqual(f.store.listPublic({ seller_profile_id: "other" }), []);
  rejects(
    () => f.store.listPublic({ customer_user_id: "buyer-user" }),
    "INVALID_INPUT",
  );
});

test("averages and distribution use actual records only, including an honest zero state", () => {
  const zero = summarizeReviews([]);
  assert.equal(zero.average, null);
  assert.equal(zero.total, 0);
  assert.ok(
    zero.distribution.every((row) => row.count === 0 && row.percentage === 0),
  );
  const summary = summarizeReviews([
    { rating: 5 },
    { rating: 5 },
    { rating: 4 },
    { rating: 2 },
  ]);
  assert.equal(summary.average, 4);
  assert.equal(summary.total, 4);
  assert.deepEqual(
    summary.distribution.map((row) => row.count),
    [2, 1, 0, 1, 0],
  );
  assert.deepEqual(
    summary.distribution.map((row) => row.percentage),
    [50, 25, 0, 25, 0],
  );
  const f = fixture();
  f.submit();
  assert.equal(f.store.getSummary().average, 5);
});

test("malformed, incompatible, duplicate or invalid stored reviews fail closed without overwrite", () => {
  const f = fixture();
  f.submit();
  const valid = JSON.parse(f.values.get(REVIEW_KEY));
  const cases = [
    "",
    "{bad",
    "null",
    JSON.stringify({ version: 2, reviews: [] }),
    JSON.stringify({ ...valid, extra: true }),
    JSON.stringify({ ...valid, reviews: [...valid.reviews, ...valid.reviews] }),
    ...[
      { rating: 0 },
      { comment: "x" },
      { service_id: "" },
      { created_at: "bad" },
      { customer_user_id: null },
      { customerUserId: "fake" },
    ].map((patch) =>
      JSON.stringify({
        ...valid,
        reviews: [{ ...valid.reviews[0], ...patch }],
      }),
    ),
  ];
  for (const raw of cases) {
    f.values.set(REVIEW_KEY, raw);
    rejects(() => f.store.listPublic(), "STORAGE_CORRUPT");
    rejects(() => f.submit(), "STORAGE_CORRUPT");
    assert.equal(f.values.get(REVIEW_KEY), raw);
  }
});

test("storage failure, source errors and ID collisions never partially overwrite reviews", () => {
  const blocked = fixture({
    storage: {
      getItem: () => {
        throw new Error();
      },
    },
  });
  rejects(() => blocked.store.getSummary(), "STORAGE_UNAVAILABLE");
  const quota = fixture({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error();
      },
    },
  });
  rejects(() => quota.submit(), "STORAGE_UNAVAILABLE");
  const source = fixture({
    listBookings: () => {
      throw new Error("bad");
    },
  });
  rejects(() => source.submit(), "DEPENDENCY_UNAVAILABLE");
  const f = fixture({ randomId: () => "same" });
  f.submit();
  f.records.push({ ...f.booking, id: "booking-2" });
  const raw = f.values.get(REVIEW_KEY);
  rejects(() => f.submit({ booking_id: "booking-2" }), "INVALID_DEPENDENCY");
  assert.equal(f.values.get(REVIEW_KEY), raw);
});

test("new_review targets the actual seller account via shared notifications and deduplicates retry", () => {
  const f = fixture();
  const messaging = createMessagingStore({
    ...f.options,
    resolveBooking: (id) => f.records.find((row) => row.id === id),
    resolveReview: (id) => f.store.getNotificationContext(id),
  });
  const actions = createReviewActions({ reviews: f.store, messaging });
  const result = actions.submit(f.input(), { expected_user_id: "buyer-user" });
  assert.equal(result.notification_error, "");
  actions.retryNotification(result.review.id);
  f.as({
    id: "seller-user",
    capabilities: ["buyer", "seller"],
    sellerProfileId: "seller-profile",
  });
  const notices = messaging.listNotifications();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, "new_review");
  assert.equal(notices[0].recipient_user_id, "seller-user");
  assert.equal(notices[0].actor_user_id, "buyer-user");
  rejects(
    () => actions.retryNotification(result.review.id),
    "NOT_FOUND_OR_FORBIDDEN",
  );
});

test("notification failure reports a saved review, preserving duplicate protection", () => {
  const f = fixture();
  const actions = createReviewActions({
    reviews: f.store,
    messaging: {
      notifyReviewEvent: () => {
        throw new Error("blocked");
      },
    },
  });
  const result = actions.submit(f.input(), { expected_user_id: "buyer-user" });
  assert.ok(result.notification_error);
  assert.equal(f.store.listOwn()[0].id, result.review.id);
  rejects(
    () => actions.submit(f.input(), { expected_user_id: "buyer-user" }),
    "DUPLICATE_REVIEW",
  );
});

test("real account/seller/booking adapters review legitimate Completed fixtures without bypassing lifecycle", async () => {
  const f = await reviewScenario();
  const reviews = createReviewStore({
    storage: f.storage,
    ...createReviewAdapters({
      accounts: f.accounts,
      customers: f.orders,
      getServices: () => f.catalog,
    }),
  });
  assert.equal(f.orders.getBooking(f.first.id).status, "Completed");
  assert.equal(f.orders.getBooking(f.pending.id).status, "Requested");
  const messaging = createMessagingStore({
    storage: f.storage,
    ...createMessagingAdapters({
      accounts: f.accounts,
      customers: f.orders,
      getServices: () => f.catalog,
    }),
    resolveReview: (id) => reviews.getNotificationContext(id),
  });
  const actions = createReviewActions({ reviews, messaging });
  const saved = actions.submit(
    {
      booking_id: f.first.id,
      service_id: f.service.id,
      seller_profile_id: f.profile.id,
      rating: 4,
      comment: "Komunikasinya jelas dan hasil kolaborasi sesuai brief kami.",
    },
    { expected_user_id: f.buyer.id },
  );
  assert.equal(saved.notification_error, "");
  assert.equal(
    reviews.getSummary({ seller_profile_id: f.profile.id }).average,
    4,
  );
  assert.equal(
    reviews.listCompletedBookings().filter((row) => row.eligible).length,
    1,
  );
  await f.accounts.login("reviews-seller@example.test", f.password);
  assert.equal(messaging.listNotifications()[0].recipient_user_id, f.seller.id);
  assert.deepEqual(reviews.listOwn(), []);
});

test("review login return URLs are allowed without weakening redirect validation", () => {
  for (const path of ["/reviews", "/review/booking-a_b?source=orders#form"])
    assert.equal(safeReturnTo(path), path);
  for (const path of [
    "//evil.test/reviews",
    "/review/%2f%2fevil.test",
    "/review/../admin",
    "https://evil.test",
  ])
    assert.equal(safeReturnTo(path), "/");
});

test("changed persisted booking associations cannot be used for private reads or notifications", () => {
  const f = fixture();
  const review = f.submit();
  f.booking.service_id = "different-service";
  rejects(() => f.store.listOwn(), "INVALID_CONTEXT");
  rejects(() => f.store.getNotificationContext(review.id), "INVALID_CONTEXT");
  rejects(() => f.store.getEligibility(f.booking.id), "STORAGE_CORRUPT");
});

test("a mis-scoped or corrupt booking adapter blocks submissions", () => {
  const f = fixture({
    listBookings: () => [{ customer_user_id: "different-account" }],
  });
  rejects(() => f.submit(), "DEPENDENCY_UNAVAILABLE");
  const adapters = createReviewAdapters({
    accounts: {
      current: () => ({ id: "buyer-user", capabilities: ["buyer"] }),
    },
    customers: {
      view: () => ({ bookings: [], error: "damaged booking store" }),
    },
    getServices: () => [],
  });
  rejects(() => adapters.listBookings(), "DEPENDENCY_UNAVAILABLE");
});

test("invalid clock/ID dependencies do not create unstable identifiers", () => {
  for (const randomId of [
    () => undefined,
    () => "",
    () => "bad/id",
    () => 123,
  ]) {
    const f = fixture({ randomId });
    rejects(() => f.submit(), "INVALID_DEPENDENCY");
    assert.equal(f.values.has(REVIEW_KEY), false);
  }
  const f = fixture({ now: () => "bad-date" });
  rejects(() => f.submit(), "INVALID_DEPENDENCY");
});

test("subscriptions signal committed writes only and cannot turn saved reviews into failures", () => {
  const f = fixture();
  let changes = 0;
  const stop = f.store.subscribe(() => {
    changes++;
  });
  f.store.subscribe(() => {
    throw new Error("render failure");
  });
  f.submit();
  assert.equal(changes, 1);
  rejects(() => f.submit(), "DUPLICATE_REVIEW");
  assert.equal(changes, 1);
  stop();
  f.records.push({ ...f.booking, id: "booking-2" });
  f.submit({ booking_id: "booking-2" });
  assert.equal(changes, 1);
});

test("fictional catalog testimonials never enter verified metrics", () => {
  const f = fixture();
  f.service.reviews = Array.from({ length: 100 }, () => ({
    score: 5,
    name: "Demo",
    text: "Illustration only",
  }));
  assert.deepEqual(f.store.getSummary().average, null);
  assert.equal(f.store.getSummary().total, 0);
  f.submit({ rating: 2 });
  assert.equal(f.store.getSummary({ service_id: "service-1" }).total, 1);
  assert.equal(f.store.getSummary({ service_id: "service-1" }).average, 2);
});

test("stored self-reviews and mismatched public service owners cannot inflate published metrics", () => {
  const f = fixture();
  f.submit();
  const valid = f.values.get(REVIEW_KEY);
  const changed = JSON.parse(valid);
  changed.reviews[0].customer_user_id = "seller-user";
  f.values.set(REVIEW_KEY, JSON.stringify(changed));
  rejects(() => f.store.getSummary(), "STORAGE_CORRUPT");
  assert.equal(f.values.get(REVIEW_KEY), JSON.stringify(changed));
  f.values.set(REVIEW_KEY, valid);
  f.service.seller_profile_id = "someone-else";
  rejects(() => f.store.listPublic(), "STORAGE_CORRUPT");
});
