import { apiRequest } from "../../lib/apiClient.js";

function authResult(payload) {
  const result = payload?.data;
  if (!result || typeof result.accessToken !== "string" || !result.accessToken || !result.user || typeof result.user.id !== "string") {
    throw new Error("The server returned an invalid authentication response.");
  }
  return { user: result.user, accessToken: result.accessToken };
}

export async function registerAccount({ name, email, password }) {
  return authResult(await apiRequest("/api/auth/register", {
    method: "POST", auth: false, body: { name, email, password },
  }));
}

export async function loginAccount(email, password) {
  return authResult(await apiRequest("/api/auth/login", {
    method: "POST", auth: false, body: { email, password },
  }));
}

// The backend endpoint revokes every session for this account, not only this
// browser. The caller clears local state immediately and treats server failure
// as best-effort revocation.
export async function logoutAllSessions(accessToken) {
  if (!accessToken) return;
  return apiRequest("/api/auth/logout-all", {
    method: "POST",
    auth: false,
    handleUnauthorized: false,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getCurrentAccount(signal) {
  const payload = await apiRequest("/api/auth/me", { signal });
  if (!payload?.data?.user || typeof payload.data.user.id !== "string") {
    throw new Error("The server returned an invalid account response.");
  }
  return payload.data.user;
}

export async function updateCurrentAccount(patch) {
  const payload = await apiRequest("/api/auth/me", { method: "PATCH", body: patch });
  if (!payload?.data?.user || typeof payload.data.user.id !== "string") {
    throw new Error("The server returned an invalid profile response.");
  }
  return payload.data.user;
}
