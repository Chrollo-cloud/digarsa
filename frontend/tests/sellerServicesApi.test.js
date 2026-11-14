import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  createSellerAvailability,
  createSellerService,
  deleteSellerAvailability,
  deleteSellerService,
  listSellerAvailability,
  listSellerServices,
  setSellerServiceActive,
  setSellerServiceAvailability,
  updateSellerAvailability,
  updateSellerService,
} from "../src/features/seller/sellerServicesApi.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const input = {
  title: "Brand identity package", category: "Branding", description: "A complete identity design service for growing local businesses.",
  price: "1200000", delivery: "Remote", turnaround: "7 working days", availability: "Open", image: "",
  revisionFreeCount: "2", revisionRequestWindowHours: "24", revisionTerms: "Two minor revisions are included.", serviceLocation: null,
};
const dto = {
  id: "service-1", creatorId: "seller-1", ownerUserId: "user-1", title: input.title, category: input.category,
  description: input.description, price: 1200000, delivery: input.delivery, turnaround: input.turnaround,
  availability: "Open", image: null, active: true, hidden: false,
  revision_policy: { free_revision_count: 2, request_window_duration: 24, terms: input.revisionTerms, hash: "policy-hash" },
};

test("lists and maps only the authenticated seller service response", async () => {
  let request;
  globalThis.window = { sessionStorage: { getItem: () => "seller-token" } };
  globalThis.fetch = async (url, init) => { request = { url, init }; return response({ data: [dto] }); };
  const services = await listSellerServices();
  assert.match(request.url, /\/api\/services\/mine$/);
  assert.equal(request.init.headers.get("Authorization"), "Bearer seller-token");
  assert.deepEqual([services[0].id, services[0].revisionFreeCount, services[0].revisionRequestWindowHours, services[0].revisionTerms], ["service-1", 2, 24, input.revisionTerms]);
});

test("creates and updates services with all required revision policy fields", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body && JSON.parse(init.body) }); return response({ data: dto }); };
  await createSellerService(input);
  await updateSellerService("service/one", input);
  assert.match(calls[0].url, /\/api\/services$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].body.revisionFreeCount, 2);
  assert.equal(calls[0].body.revisionRequestWindowHours, 24);
  assert.equal(calls[0].body.revisionTerms, input.revisionTerms);
  assert.match(calls[1].url, /\/api\/services\/service%2Fone$/);
  assert.equal(calls[1].init.method, "PATCH");
});

test("rejects invalid revision policy without sending a request", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return response({ data: dto }); };
  await assert.rejects(createSellerService({ ...input, revisionRequestWindowHours: 36 }), (error) => {
    assert.ok(error.details.some((item) => item.field === "revisionRequestWindowHours"));
    return true;
  });
  await assert.rejects(createSellerService({ ...input, revisionTerms: "" }), /Ketentuan revisi wajib diisi/);
  assert.equal(called, false);
});

test("service status and delete operations use the backend contract", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body && JSON.parse(init.body) }); return init.method === "DELETE" ? response({ data: { message: "Service removed." } }) : response({ data: dto }); };
  await setSellerServiceActive("service-1", false);
  await setSellerServiceAvailability("service-1", "Full-book");
  await deleteSellerService("service-1");
  assert.deepEqual(calls.map(({ init }) => init.method), ["PATCH", "PATCH", "DELETE"]);
  assert.deepEqual(calls[0].body, { active: false });
  assert.deepEqual(calls[1].body, { availability: "Full-book" });
  assert.match(calls[2].url, /\/api\/services\/service-1$/);
});

test("lists, creates, updates, and deletes seller availability slots", async () => {
  const calls = [];
  const slot = { id: "slot-1", serviceId: "service-1", date: "2026-12-01", startTime: "09:00", endTime: "10:00", note: "Morning" };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body && JSON.parse(init.body) });
    return init.method === "DELETE" ? response({ data: { message: "Slot removed." } }) : response({ data: init.method === "GET" ? [slot] : slot });
  };
  assert.equal((await listSellerAvailability("service-1"))[0].id, "slot-1");
  await createSellerAvailability("service-1", slot);
  await updateSellerAvailability("service-1", "slot-1", { ...slot, note: "Updated" });
  await deleteSellerAvailability("service-1", "slot-1");
  assert.match(calls[0].url, /\/api\/services\/service-1\/availability$/);
  assert.match(calls[2].url, /\/api\/services\/service-1\/availability\/slot-1$/);
  assert.equal(calls[1].body.date, slot.date);
  assert.equal(calls[2].body.note, "Updated");
  assert.equal(calls[3].init.method, "DELETE");
});

test("availability validation rejects invalid time ranges and preserves API authorization errors", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return response({ error: { message: "Forbidden" } }, 403); };
  await assert.rejects(createSellerAvailability("service-1", { date: "2026-12-01", startTime: "11:00", endTime: "10:00" }), /Waktu selesai/);
  assert.equal(called, false);
  await assert.rejects(listSellerServices(), (error) => error.status === 403 && error.code === "FORBIDDEN");
});

test("expired seller sessions preserve the backend unauthorized response", async () => {
  globalThis.fetch = async () => response({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, 401);
  await assert.rejects(listSellerServices(), (error) => error.status === 401 && error.code === "UNAUTHORIZED");
});
