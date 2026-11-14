import { getAccessToken } from "./authToken.js";

const configuredBase = import.meta.env?.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredBase || "http://localhost:3000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message || "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = code || "HTTP_ERROR";
    this.details = details;
  }
}

export async function apiRequest(path, { method = "GET", body, headers = {}, signal, auth = true } = {}) {
  const requestHeaders = new Headers(headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) requestHeaders.set("Content-Type", "application/json");
  if (auth) {
    const token = getAccessToken();
    if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Could not reach the Digarsa server. Check your connection and try again." });
  }

  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (contentType.toLowerCase().includes("json")) {
    try { payload = await response.json(); } catch { payload = null; }
  } else if (response.status !== 204) {
    try { payload = await response.text(); } catch { payload = null; }
  }

  if (!response.ok) {
    const error = payload && typeof payload === "object" ? payload.error : null;
    throw new ApiError({
      status: response.status,
      code: typeof error?.code === "string" ? error.code : response.status === 401 ? "UNAUTHORIZED" : response.status === 403 ? "FORBIDDEN" : "HTTP_ERROR",
      message: typeof error?.message === "string" ? error.message : `Request failed with status ${response.status}.`,
      details: error?.details,
    });
  }
  return payload;
}
