import assert from "node:assert/strict";
import test from "node:test";
import { acceptAdditionalRevisionOffer, createAdditionalRevisionOffer, createAdditionalRevisionRequest, getDemoPaymentAvailability, listAdditionalRevisionRequests, payAdditionalRevisionDemo, payBookingDemo, rejectAdditionalRevisionRequest } from "../src/features/bookings/bookingApi.js";

test("additional revision APIs use authenticated backend data and never submit payment status", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { sessionStorage: { getItem: () => "session-token" } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const data = calls.length === 1 ? { data: { id: "request-1", status: "OPEN" } }
      : calls.length === 2 ? { data: { id: "offer-1", status: "ACTIVE" } }
        : { data: { id: "agreement-1", status: "AWAITING_PAYMENT" } };
    return new Response(JSON.stringify(data), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const request = await createAdditionalRevisionRequest("booking/1", "Please add a separate item to the work.");
    const offer = await createAdditionalRevisionOffer("booking/1", request.id, {
      scope: "Create one extra asset", terms: "One delivery and one review cycle", seller_price: 10000, estimated_duration_hours: 12,
    });
    const agreement = await acceptAdditionalRevisionOffer("booking/1", request.id, offer.id);
    assert.equal(agreement.status, "AWAITING_PAYMENT");
    assert.equal(calls[0].url.endsWith("/me/bookings/booking%2F1/additional-revision-requests"), true);
    assert.deepEqual(calls[0].body, { description: "Please add a separate item to the work." });
    assert.equal(calls[1].url.endsWith("/seller/bookings/booking%2F1/additional-revision-requests/request-1/offers"), true);
    assert.equal("admin_fee" in calls[1].body, false);
    assert.equal("buyer_total" in calls[1].body, false);
    assert.equal("status" in calls[2].body, false);
    assert.equal(calls[2].init.headers.get("Authorization"), "Bearer session-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("additional revision list scopes requests to the selected party endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: () => "session-token" } };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await listAdditionalRevisionRequests("customer", "booking-1");
    await listAdditionalRevisionRequests("seller", "booking-1");
    assert.match(calls[0], /\/me\/bookings\/booking-1\/additional-revision-requests$/);
    assert.match(calls[1], /\/seller\/bookings\/booking-1\/additional-revision-requests$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("seller rejection sends the request message to the owner-scoped reject endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let call;
  globalThis.window = { sessionStorage: { getItem: () => "session-token" } };
  globalThis.fetch = async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ data: { id: "request-1", status: "REJECTED" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rejectAdditionalRevisionRequest("booking-1", "request-1", "This request is outside the agreed scope.");
    assert.equal(result.status, "REJECTED");
    assert.match(call.url, /\/api\/v1\/seller\/bookings\/booking-1\/additional-revision-requests\/request-1\/reject$/);
    assert.deepEqual(call.body, { message: "This request is outside the agreed scope." });
    assert.equal(call.init.headers.get("Authorization"), "Bearer session-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("demo payment adapters send only the amount and currency and require simulation provenance", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { sessionStorage: { getItem: () => "session-token" } };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.get("Authorization") });
    const data = calls.length === 1 ? { data: { enabled: true, label: "DEMO PAYMENT — NO REAL TRANSACTION" } }
      : { data: { status: "DEMO_PAID", provenance: "DEMO_SIMULATION" } };
    return new Response(JSON.stringify(data), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    assert.equal((await getDemoPaymentAvailability()).enabled, true);
    await payBookingDemo("booking-1", 1050000);
    await payAdditionalRevisionDemo("booking-1", "agreement-1", 52500);
    assert.deepEqual(calls[1].body, { amount: 1050000, currency: "IDR" });
    assert.deepEqual(calls[2].body, { amount: 52500, currency: "IDR" });
    assert.ok(calls.slice(1).every((call) => !("status" in call.body)), "frontend cannot send or set payment status");
    assert.ok(calls.every((call) => call.auth === "Bearer session-token"));
    assert.match(calls[2].url, /additional-revision-agreements\/agreement-1\/demo-payment$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
