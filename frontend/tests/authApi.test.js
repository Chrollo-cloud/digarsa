import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { API_BASE_URL } from "../src/lib/apiClient.js";
import {
  getCurrentAccount,
  loginAccount,
  logoutAllSessions,
  registerAccount,
  updateCurrentAccount,
} from "../src/features/account/authApi.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const user = {
  id: "user-1",
  name: "Demo Customer",
  email: "customer@example.test",
  capabilities: ["buyer"],
  permissions: [],
};

function setToken(token = "test-access-token") {
  globalThis.window = { sessionStorage: { getItem: () => token } };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("registration and login use backend auth routes without sending a stale token", async () => {
  setToken();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse({ user, accessToken: "new-access-token" }, calls.length === 1 ? 201 : 200);
  };

  const registered = await registerAccount({ name: user.name, email: user.email, password: "demo-password" });
  const loggedIn = await loginAccount(user.email, "demo-password");

  assert.deepEqual(registered, { user, accessToken: "new-access-token" });
  assert.deepEqual(loggedIn, { user, accessToken: "new-access-token" });
  assert.equal(calls[0].url, `${API_BASE_URL}/api/auth/register`);
  assert.equal(calls[1].url, `${API_BASE_URL}/api/auth/login`);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[0].options.headers.has("Authorization"), false);
  assert.equal(calls[1].options.headers.has("Authorization"), false);
  assert.deepEqual(calls[0].body, { name: user.name, email: user.email, password: "demo-password" });
  assert.deepEqual(calls[1].body, { email: user.email, password: "demo-password" });
});

test("session restoration and profile update use the authenticated current-user endpoint", async () => {
  setToken();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return jsonResponse({ user: { ...user, name: calls.length === 1 ? user.name : "Updated Customer" } });
  };

  const restored = await getCurrentAccount();
  const updated = await updateCurrentAccount({ name: "Updated Customer" });

  assert.equal(restored.id, user.id);
  assert.equal(updated.name, "Updated Customer");
  assert.equal(calls[0].url, `${API_BASE_URL}/api/auth/me`);
  assert.equal(calls[1].url, `${API_BASE_URL}/api/auth/me`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].options.method, "PATCH");
  for (const call of calls) assert.equal(call.options.headers.get("Authorization"), "Bearer test-access-token");
  assert.deepEqual(calls[1].body, { name: "Updated Customer" });
});

test("malformed auth responses fail closed", async () => {
  globalThis.fetch = async () => jsonResponse({ user: { id: user.id } });
  await assert.rejects(loginAccount(user.email, "demo-password"), /invalid authentication response/i);

  globalThis.fetch = async () => jsonResponse({ user: { name: user.name } });
  await assert.rejects(getCurrentAccount(), /invalid account response/i);
});

test("logout-all sends the captured bearer token without exposing it to auth handling", async () => {
  let captured;
  setToken("stale-browser-token");
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ error: { code: "INVALID_TOKEN", message: "Expired" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };
  await assert.rejects(logoutAllSessions("captured-token"), (error) => error.status === 401);
  assert.equal(captured.url, `${API_BASE_URL}/api/auth/logout-all`);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.get("Authorization"), "Bearer captured-token");
});
