import assert from "node:assert/strict";
import test from "node:test";
import { bookingErrorMessage, bookingListQuery, createBooking, getBooking, listBookings, mapBooking, requestCancellation, sellerDecision, validateBooking } from "../src/features/bookings/bookingApi.js";

const bookingDto = {
  id: "booking-1", customer_user_id: "customer-1", seller_profile_id: "seller-1", service_id: "service-1",
  service_title: "Brand identity", seller_name: "Studio A", estimated_price: 1200000, delivery_mode: "remote",
  requested_date: null, location: null, requirements: "At least ten characters", description: "A sufficiently detailed project description.",
  status: "FutureStatus", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  decline_reason: null, delivered_at: null, completed_at: null, revision_policy_snapshot: null, active_delivery_cycle: null, payment: null,
};

test("booking mapper preserves server status and handles absent optional values", () => {
  const booking = mapBooking(bookingDto);
  assert.equal(booking.status, "FutureStatus");
  assert.equal(booking.estimatedPrice, 1200000);
  assert.equal(booking.payment, null);
  assert.equal(booking.requestedDate, null);
  assert.equal(booking.creatorName, "Studio A");
});

test("booking list query passes through opaque cursor and server status", () => {
  const query = bookingListQuery({ status: "Delivered", cursor: "a/b+opaque", limit: 999 });
  assert.equal(query.get("status"), "Delivered");
  assert.equal(query.get("cursor"), "a/b+opaque");
  assert.equal(query.get("limit"), "100");
});

test("validation and creation send only contract fields and acknowledged server policy", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { sessionStorage: { getItem: () => "test-token" } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const payload = calls.length === 1
      ? { data: { valid: true, service_id: "service-1", estimated_price: 1200000, delivery_mode: "remote", revision_policy: { hash: "a".repeat(64), terms: "One revision", free_revision_count: 1, request_window_duration: 48 } } }
      : { data: bookingDto };
    return new Response(JSON.stringify(payload), { status: calls.length === 1 ? 200 : 201, headers: { "content-type": "application/json" } });
  };
  try {
    const draft = { requirements: "At least ten characters", description: "A sufficiently detailed project description.", requestedDate: null, location: null };
    const validation = await validateBooking("service-1", draft);
    const created = await createBooking("service-1", draft, validation);
    assert.equal(created.id, "booking-1");
    assert.equal(calls[0].url.endsWith("/api/v1/services/service-1/booking-validation"), true);
    assert.deepEqual(calls[0].body, { requirements: draft.requirements, description: draft.description, requested_date: null, location: null });
    assert.deepEqual(calls[1].body, {
      service_id: "service-1", requirements: draft.requirements, description: draft.description,
      requested_date: null, location: null, confirmed: true,
      revision_policy_hash: "a".repeat(64), revision_policy_acknowledged: true,
    });
    assert.equal("price" in calls[1].body, false);
    assert.equal("seller_name" in calls[1].body, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("booking API errors preserve useful status-specific guidance", () => {
  assert.match(bookingErrorMessage({ status: 401 }), /session has expired/i);
  assert.match(bookingErrorMessage({ status: 409, message: "Booking changed." }), /Booking changed/);
  assert.match(bookingErrorMessage({ status: 0 }), /check your connection/i);
});

test("seller booking reads and decisions use authenticated server endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { sessionStorage: { getItem: () => "seller-token" } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const payload = calls.length === 1
      ? { data: [bookingDto], page: { has_more: false, next_cursor: null }, total: 1 }
      : calls.length === 2 ? { data: bookingDto } : { data: { ...bookingDto, status: "Accepted" } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const page = await listBookings("seller", { status: "Requested", cursor: "cursor-1" });
    const detail = await getBooking("seller", "booking/1");
    const updated = await sellerDecision(detail, "accept");
    assert.equal(page.items[0].id, "booking-1");
    assert.equal(calls[0].url, "http://localhost:3000/api/v1/seller/bookings?limit=20&status=Requested&cursor=cursor-1");
    assert.equal(calls[1].url, "http://localhost:3000/api/v1/seller/bookings/booking%2F1");
    assert.equal(updated.status, "Accepted");
    assert.equal(calls[2].url, "http://localhost:3000/api/v1/seller/bookings/booking-1/accept");
    assert.deepEqual(calls[2].body, { expected_status: "Requested" });
    for (const call of calls) assert.equal(call.init.headers.get("Authorization"), "Bearer seller-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("booking list surfaces server authorization failures without substituting demo records", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: () => "customer-token" } };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Seller access required." } }), {
    status: 403, headers: { "content-type": "application/json" },
  });
  try {
    await assert.rejects(listBookings("customer"), (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(bookingErrorMessage(error), "This action is not available for your account.");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("cancellation evidence uses the backend multipart contract through the shared client", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let request;
  globalThis.window = { sessionStorage: { getItem: () => "test-token" } };
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ data: { id: "cancel-1", status: "PENDING" } }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    await requestCancellation("booking-1", "A sufficiently detailed reason", new Blob(["evidence"], { type: "text/plain" }));
    assert.match(request.url, /\/api\/v1\/me\/bookings\/booking-1\/cancellation-requests$/);
    assert.equal(request.init.body.get("reason"), "A sufficiently detailed reason");
    assert.ok(request.init.body.get("evidence"));
    assert.equal(request.init.headers.has("Content-Type"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
