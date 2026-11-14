import { apiRequest } from "../../lib/apiClient.js";
import { mapPublicService } from "../catalog/catalogApi.js";

const ENDPOINTS = Object.freeze({ favorites: "/api/v1/me/favorites", cart: "/api/v1/me/cart" });

function endpoint(kind) {
  const value = ENDPOINTS[kind];
  if (!value) throw new Error("Unsupported saved-items collection.");
  return value;
}

export function mapSavedItem(row) {
  if (!row || typeof row.service_id !== "string" || typeof row.available !== "boolean") {
    throw new Error("The saved-items response has an invalid item.");
  }
  return {
    serviceId: row.service_id,
    service: row.service ? mapPublicService(row.service) : null,
    available: row.available,
  };
}

export async function listSavedItems(kind, { cursor, limit = 100, signal } = {}) {
  const query = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
  if (typeof cursor === "string" && cursor) query.set("cursor", cursor);
  const payload = await apiRequest(`${endpoint(kind)}?${query}`, { signal });
  if (!Array.isArray(payload?.data) || !payload?.page || typeof payload.page.has_more !== "boolean") {
    throw new Error("The saved-items response has an invalid shape.");
  }
  const nextCursor = typeof payload.page.next_cursor === "string" ? payload.page.next_cursor : null;
  if (payload.page.has_more && !nextCursor) throw new Error("The saved-items response is missing its next cursor.");
  return {
    items: payload.data.map(mapSavedItem),
    nextCursor,
    hasMore: payload.page.has_more,
    total: Number.isInteger(payload.total) && payload.total >= 0 ? payload.total : payload.data.length,
  };
}

export async function addSavedItem(kind, serviceId) {
  if (typeof serviceId !== "string" || !serviceId) throw new Error("Choose a service first.");
  const payload = await apiRequest(`${endpoint(kind)}/${encodeURIComponent(serviceId)}`, { method: "PUT", body: {} });
  if (payload?.data?.service_id !== serviceId) throw new Error("The server could not confirm that the service was saved.");
  return payload.data;
}

export async function removeSavedItem(kind, serviceId) {
  if (typeof serviceId !== "string" || !serviceId) throw new Error("Choose a service first.");
  await apiRequest(`${endpoint(kind)}/${encodeURIComponent(serviceId)}`, { method: "DELETE" });
}

