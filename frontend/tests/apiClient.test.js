import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, API_BASE_URL, apiRequest } from "../src/lib/apiClient.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let tokenValue = "test-token";
let authEvents = 0;
let authEventTarget;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function setToken(token = "test-token") {
  tokenValue = token;
  authEvents = 0;
  authEventTarget = new EventTarget();
  authEventTarget.addEventListener("digarsa:authenticated-request-unauthorized", () => { authEvents += 1; });
  globalThis.window = {
    sessionStorage: { getItem: () => tokenValue, removeItem: () => { tokenValue = null; } },
    dispatchEvent: authEventTarget.dispatchEvent.bind(authEventTarget),
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
    setToken();
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
    assert.equal(authEvents, status === 401 ? 1 : 0);
    assert.equal(tokenValue, status === 401 ? null : "test-token");
  }
});

test("public 401 responses do not clear or signal an authenticated session", async () => {
  setToken();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(apiRequest("/api/public", { auth: false }));
  assert.equal(authEvents, 0);
  assert.equal(tokenValue, "test-token");
});

test("a stale authenticated 401 does not clear a newer session", async () => {
  setToken("old-token");
  let finishRequest;
  globalThis.fetch = () => new Promise((resolve) => { finishRequest = resolve; });
  const pending = apiRequest("/api/protected");
  tokenValue = "new-token";
  finishRequest(new Response(JSON.stringify({ error: { code: "INVALID_TOKEN" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }));
  await assert.rejects(pending);
  assert.equal(authEvents, 0);
  assert.equal(tokenValue, "new-token");
});

test("403, server errors, and network failures do not clear auth state", async () => {
  setToken();
  for (const status of [403, 500]) {
    globalThis.fetch = async () => new Response("failure", { status });
    await assert.rejects(apiRequest("/api/protected"));
    assert.equal(tokenValue, "test-token");
  }
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(apiRequest("/api/protected"));
  assert.equal(authEvents, 0);
  assert.equal(tokenValue, "test-token");
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
