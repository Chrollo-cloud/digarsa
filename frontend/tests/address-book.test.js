import test from "node:test";
import assert from "node:assert/strict";
import { getRegionOptions } from "../src/features/location/regionDirectory.js";

test("region directory loads only the selected hierarchy and maps village postal codes", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ data: [{ id: "32.73.01.1001", name: "Sukarasa", postal_code: "40152" }] }),
    };
  };
  const options = await getRegionOptions("villages", "32.73.01", fetchImpl);
  assert.deepEqual(options, [{ id: "32.73.01.1001", name: "Sukarasa", postalCode: "40152" }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/villages\/32\.73\.01\.json$/);
  await assert.rejects(getRegionOptions("villages", "", fetchImpl), /parent region/);
});

test("region directory falls back to cached non-personal region data when the source is unavailable", async () => {
  const cacheKey = "digarsa.region-directory.v2:districts:99.88";
  globalThis.localStorage?.setItem(cacheKey, JSON.stringify([{ id: "99.88.01", name: "Cached district" }]));
  const original = globalThis.localStorage;
  const values = new Map([[cacheKey, JSON.stringify([{ id: "99.88.01", name: "Cached district" }])]]);
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  try {
    const result = await getRegionOptions("districts", "99.88", async () => { throw new Error("offline"); });
    assert.deepEqual(result, [{ id: "99.88.01", name: "Cached district" }]);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
