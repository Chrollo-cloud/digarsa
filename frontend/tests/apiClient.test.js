import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, API_BASE_URL, apiRequest } from "../src/lib/apiClient.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function setToken(token = "test-token") {
  globalThis.window = {
    sessionStorage: { getItem: () => token },
  };
}

test("central transport adds bearer auth and sends/parses JSON", async () => {
  setToken();
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await apiRequest("/api/example", { method: "POST", body: { name: "Ada" } });
  assert.equal(captured.url, `${API_BASE_URL}/api/example`);
  assert.equal(captured.options.headers.get("Authorization"), "Bearer test-token");
  assert.equal(captured.options.headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(captured.options.body), { name: "Ada" });
  assert.deepEqual(result, { data: { ok: true } });
});

test("401 and 403 remain distinct and preserve backend validation details", async () => {
  for (const [status, code] of [[401, "INVALID_TOKEN"], [403, "FORBIDDEN"]]) {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { code, message: "Rejected", details: [{ field: "email", message: "Invalid" }] },
    }), { status, headers: { "Content-Type": "application/json" } });
    await assert.rejects(apiRequest("/api/example"), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.deepEqual(error.details, [{ field: "email", message: "Invalid" }]);
      return true;
    });
  }
});

test("non-JSON errors and network failures are normalized safely", async () => {
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 502 });
  await assert.rejects(apiRequest("/api/example"), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.code, "HTTP_ERROR");
    return true;
  });

  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(apiRequest("/api/example"), (error) => {
    assert.equal(error.status, 0);
    assert.equal(error.code, "NETWORK_ERROR");
    return true;
  });
});
