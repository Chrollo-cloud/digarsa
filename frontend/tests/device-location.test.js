import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createDeviceLocationSession, LOCATION_ATTEMPT_KEY } from "../src/features/location/deviceLocationSession.js";
import { createDemoStore, ACCOUNT_KEY } from "../src/features/account/demoStore.js";

const point = { lat: -5.14, lng: 119.41 };
const position = { coords: { latitude: point.lat, longitude: point.lng } };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function fixture({ permission = "prompt", supported = true, values = new Map(), implementation } = {}) {
  const calls = [], deadlines = new Map();
  let access = permission;
  const controller = createDeviceLocationSession({
    getGeolocation: () => supported ? { getCurrentPosition(...args) { calls.push(args); implementation?.(...args); } } : null,
    getPermissions: () => access === "unknown" ? null : { query: async () => ({ state: access }) },
    getFlagStorage: () => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }),
    setTimer: callback => { const id = Symbol(); deadlines.set(id, callback); return id; },
    clearTimer: id => deadlines.delete(id),
  });
  return { controller, calls, values, deadlines, permission: value => { access = value; } };
}

test("granted permission initializes automatically once, without storing coordinates", async () => {
  const f = fixture({ permission: "granted" });
  const release = f.controller.attach("buyer");
  await flush();
  assert.equal(f.calls.length, 1);
  f.calls[0][0](position);
  assert.deepEqual(f.controller.snapshot().point, point);
  assert.equal(f.controller.snapshot().status, "ready");
  assert.deepEqual([...f.values], [[LOCATION_ATTEMPT_KEY, "1"]]);
  release(); await flush();
  f.controller.attach("buyer"); await flush();
  assert.equal(f.calls.length, 1);
});

test("first Nearby visit requests permission; StrictMode remounts share a request", async () => {
  const f = fixture();
  const release = f.controller.attach("guest");
  release();
  const stop = f.controller.attach("guest");
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.controller.snapshot().status, "loading");
  stop(); await flush();
  f.calls[0][0](position);
  assert.equal(f.controller.snapshot().point, null);
  f.controller.attach("guest"); await flush();
  assert.equal(f.calls.length, 1);
});

test("denied permission never re-prompts; manual retry respects browser settings", async () => {
  const f = fixture({ permission: "denied" });
  const release = f.controller.attach("buyer"); await flush();
  assert.equal(f.controller.snapshot().status, "denied");
  assert.equal(f.calls.length, 0);
  release(); await flush(); f.controller.attach("buyer"); await flush();
  assert.equal(f.calls.length, 0);
  f.permission("granted"); await f.controller.retry();
  assert.equal(f.calls.length, 1);
});

test("browser gesture requirement offers explicit retry instead of repeated automatic prompts", async () => {
  let first = true;
  const f = fixture({ implementation(success) {
    if (first) { first = false; throw Object.assign(new Error("Gesture required"), { name: "NotAllowedError" }); }
    success(position);
  } });
  f.controller.attach("guest"); await flush();
  assert.equal(f.controller.snapshot().status, "gesture");
  const retry = f.controller.retry();
  assert.equal(f.calls.length, 2, "retry invokes geolocation synchronously inside the user gesture");
  await retry;
  assert.equal(f.controller.snapshot().status, "ready");
  assert.equal(f.calls.length, 2);
});

test("denial callback distinguishes denied permission from gesture-limited browsers", async () => {
  for (const access of ["denied", "prompt"]) {
    const f = fixture(); f.controller.attach("guest"); await flush();
    f.permission(access); await f.calls[0][1]({ code: 1 });
    assert.equal(f.controller.snapshot().status, access === "denied" ? "denied" : "gesture");
  }
});

test("timeout, unavailable position, invalid coordinates and unsupported API remain recoverable", async () => {
  for (const [code, status] of [[2, "unavailable"], [3, "timeout"]]) {
    const f = fixture(); f.controller.attach("buyer"); await flush();
    await f.calls[0][1]({ code }); assert.equal(f.controller.snapshot().status, status);
    f.controller.useManual(point); assert.deepEqual(f.controller.snapshot().point, point);
  }
  const invalid = fixture(); invalid.controller.attach("guest"); await flush();
  invalid.calls[0][0]({ coords: { latitude: NaN, longitude: 200 } });
  assert.equal(invalid.controller.snapshot().status, "unavailable");
  const unsupported = fixture({ supported: false }); unsupported.controller.attach("guest");
  assert.equal(unsupported.controller.snapshot().status, "unsupported");
  unsupported.controller.useManual(point);
  assert.equal(unsupported.controller.snapshot().source, "manual");
});

test("permission dialog watchdog expires without accepting a late location", async () => {
  const f = fixture(); f.controller.attach("buyer"); await flush();
  [...f.deadlines.values()][0]();
  assert.equal(f.controller.snapshot().status, "timeout");
  f.calls[0][0](position); assert.equal(f.controller.snapshot().point, null);
});

test("reload prompt flag suppresses repeat requests, but granted permission still initializes", async () => {
  for (const access of ["prompt", "unknown", "granted"]) {
    const f = fixture({ permission: access, values: new Map([[LOCATION_ATTEMPT_KEY, "1"]]) });
    f.controller.attach("guest"); await flush();
    assert.equal(f.calls.length, access === "granted" ? 1 : 0);
  }
});

test("manual fallback and clear invalidate GPS callbacks; clear does not auto-request on reentry", async () => {
  const f = fixture({ permission: "granted" });
  let stop = f.controller.attach("buyer"); await flush();
  const manual = { lat: 1, lng: 2 };
  f.controller.useManual(manual); f.calls[0][0](position);
  assert.deepEqual(f.controller.snapshot().point, manual);
  assert.throws(() => f.controller.useManual({ lat: 91, lng: 0 }));
  f.controller.clear(); stop(); await flush();
  stop = f.controller.attach("buyer"); await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.controller.snapshot().status, "cleared");
  stop();
});

test("account switching discards prior coordinates and rejects stale callbacks", async () => {
  const f = fixture(); const stop = f.controller.attach("buyer"); await flush();
  f.controller.useManual(point); stop(); await flush();
  f.controller.attach("other"); await flush();
  f.calls[0][0](position);
  assert.equal(f.controller.snapshot().point, null);
  assert.equal(f.controller.snapshot().owner, "other");
});

test("automatic GPS never changes account storage; explicit save and clear remain owner-scoped", async () => {
  const values = new Map();
  const accounts = createDemoStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, webcrypto);
  const user = await accounts.register({ name: "Buyer Location", email: "location-refinement@example.test", password: "Location-test-9876!" });
  const before = values.get(ACCOUNT_KEY);
  const f = fixture({ permission: "granted" }); f.controller.attach(user.id); await flush(); f.calls[0][0](position);
  assert.equal(values.get(ACCOUNT_KEY), before);
  assert.equal(accounts.getBuyerLocation(), null);
  accounts.updateBuyerLocation({ version: 1, city: "", coordinates: f.controller.snapshot().point, source: "geolocation", consent: true }, { expectedUserId: user.id });
  assert.deepEqual(accounts.getBuyerLocation().coordinates, point);
  assert.throws(() => accounts.clearBuyerLocation({ expectedUserId: "other" }));
  accounts.clearBuyerLocation({ expectedUserId: user.id }); f.controller.clear();
  assert.equal(accounts.getBuyerLocation(), null);
  assert.equal(f.controller.snapshot().point, null);
});

test("blocked session storage and missing Permissions API do not break detection or retry", async () => {
  let count = 0;
  const f = createDeviceLocationSession({
    getGeolocation: () => ({ getCurrentPosition() { count++; } }),
    getFlagStorage: () => { throw new Error("Storage unavailable"); },
    setTimer: () => 1, clearTimer: () => {},
  });
  const stop = f.attach("guest"); await flush(); stop(); await flush();
  f.attach("guest"); await flush(); assert.equal(count, 1);
  await f.retry(); assert.equal(count, 2);
});
