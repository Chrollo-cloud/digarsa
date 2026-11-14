import { apiRequest } from "../../lib/apiClient.js";

const root = "/api/v1";

export function mapBooking(row) {
  if (!row || typeof row.id !== "string" || typeof row.status !== "string" || typeof row.service_id !== "string") {
    throw new Error("The booking response has an invalid shape.");
  }
  const amount = Number.isSafeInteger(row.estimated_price) && row.estimated_price >= 0 ? row.estimated_price : null;
  return {
    id: row.id,
    customerId: typeof row.customer_user_id === "string" ? row.customer_user_id : "",
    sellerProfileId: typeof row.seller_profile_id === "string" ? row.seller_profile_id : "",
    serviceId: row.service_id,
    serviceTitle: typeof row.service_title === "string" ? row.service_title : "Service",
    creatorName: typeof row.seller_name === "string" ? row.seller_name : "Creator",
    estimatedPrice: amount,
    deliveryMode: row.delivery_mode === "onsite" ? "onsite" : row.delivery_mode === "remote" ? "remote" : "unknown",
    requestedDate: typeof row.requested_date === "string" ? row.requested_date : null,
    location: typeof row.location === "string" ? row.location : null,
    requirements: typeof row.requirements === "string" ? row.requirements : "",
    description: typeof row.description === "string" ? row.description : "",
    status: row.status,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    declineReason: typeof row.decline_reason === "string" ? row.decline_reason : "",
    deliveredAt: typeof row.delivered_at === "string" ? row.delivered_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    revisionPolicySnapshot: row.revision_policy_snapshot && typeof row.revision_policy_snapshot === "object" ? row.revision_policy_snapshot : null,
    activeDeliveryCycle: row.active_delivery_cycle && typeof row.active_delivery_cycle === "object" ? row.active_delivery_cycle : null,
    payment: row.payment && typeof row.payment === "object" ? {
      status: typeof row.payment.status === "string" ? row.payment.status : null,
      payoutStatus: typeof row.payment.payout_status === "string" ? row.payment.payout_status : null,
      amount: Number.isSafeInteger(row.payment.amount) && row.payment.amount >= 0 ? row.payment.amount : null,
      paidAt: typeof row.payment.paid_at === "string" ? row.payment.paid_at : null,
    } : null,
  };
}

export function bookingListQuery({ status = "", cursor = "", limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 20))) });
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  return params;
}

function mapList(payload) {
  if (!Array.isArray(payload?.data) || !payload?.page || typeof payload.page.has_more !== "boolean") {
    throw new Error("The booking list response has an invalid shape.");
  }
  const nextCursor = typeof payload.page.next_cursor === "string" ? payload.page.next_cursor : null;
  if (payload.page.has_more && !nextCursor) throw new Error("The booking list response is missing its next cursor.");
  return {
    items: payload.data.map(mapBooking),
    nextCursor,
    hasMore: payload.page.has_more,
    total: Number.isInteger(payload.total) && payload.total >= 0 ? payload.total : payload.data.length,
  };
}

export async function listBookings(role, options = {}) {
  if (!(["customer", "seller"].includes(role))) throw new Error("Unsupported booking list.");
  const path = role === "customer" ? `${root}/me/bookings` : `${root}/seller/bookings`;
  const query = bookingListQuery(options);
  return mapList(await apiRequest(`${path}?${query}`, { signal: options.signal }));
}

export async function getBooking(role, id, options = {}) {
  if (!(["customer", "seller"].includes(role))) throw new Error("Unsupported booking detail.");
  const path = role === "customer" ? `${root}/me/bookings` : `${root}/seller/bookings`;
  const payload = await apiRequest(`${path}/${encodeURIComponent(id)}`, { signal: options.signal });
  return mapBooking(payload?.data);
}

export async function validateBooking(serviceId, draft, options = {}) {
  const payload = await apiRequest(`${root}/services/${encodeURIComponent(serviceId)}/booking-validation`, {
    method: "POST",
    body: {
      requirements: draft.requirements,
      description: draft.description,
      requested_date: draft.requestedDate || null,
      location: draft.location || null,
    },
    signal: options.signal,
  });
  const data = payload?.data;
  if (data?.valid !== true || data.service_id !== serviceId || !data.revision_policy || typeof data.revision_policy.hash !== "string") {
    throw new Error("The booking validation response has an invalid shape.");
  }
  return data;
}

export async function createBooking(serviceId, draft, validation) {
  const payload = await apiRequest(`${root}/bookings`, {
    method: "POST",
    body: {
      service_id: serviceId,
      requirements: draft.requirements,
      description: draft.description,
      requested_date: draft.requestedDate || null,
      location: draft.location || null,
      confirmed: true,
      revision_policy_hash: validation.revision_policy.hash,
      revision_policy_acknowledged: true,
    },
  });
  return mapBooking(payload?.data);
}

export async function sellerDecision(booking, action, reason = "") {
  if (!["accept", "decline"].includes(action)) throw new Error("Unsupported seller booking action.");
  const payload = await apiRequest(`${root}/seller/bookings/${encodeURIComponent(booking.id)}/${action}`, {
    method: "POST",
    body: { expected_status: "Requested", ...(action === "decline" && reason.trim() ? { reason: reason.trim() } : {}) },
  });
  return mapBooking(payload?.data);
}

export async function completeBooking(bookingId) {
  const payload = await apiRequest(`${root}/me/bookings/${encodeURIComponent(bookingId)}/complete`, {
    method: "POST", body: { expected_status: "Delivered" },
  });
  return mapBooking(payload?.data);
}

export async function requestCancellation(bookingId, reason, evidence) {
  const body = new FormData();
  body.set("reason", reason);
  body.set("evidence", evidence);
  const payload = await apiRequest(`${root}/me/bookings/${encodeURIComponent(bookingId)}/cancellation-requests`, {
    method: "POST", body,
  });
  if (typeof payload?.data?.id !== "string" || typeof payload.data.status !== "string") throw new Error("The cancellation response has an invalid shape.");
  return payload.data;
}

export async function listRevisions(bookingId) {
  const payload = await apiRequest(`${root}/me/bookings/${encodeURIComponent(bookingId)}/revisions`);
  if (!Array.isArray(payload?.data)) throw new Error("The revision list response has an invalid shape.");
  return payload.data;
}

export async function createRevision(bookingId, requestText) {
  const payload = await apiRequest(`${root}/me/bookings/${encodeURIComponent(bookingId)}/revisions`, {
    method: "POST", body: { request_text: requestText },
  });
  if (!payload?.data || typeof payload.data.id !== "string") throw new Error("The revision response has an invalid shape.");
  return payload.data;
}

export async function listSellerRevisions(bookingId) {
  const payload = await apiRequest(`${root}/seller/bookings/${encodeURIComponent(bookingId)}/revisions`);
  if (!Array.isArray(payload?.data)) throw new Error("The revision list response has an invalid shape.");
  return payload.data;
}

export async function respondToRevision(bookingId, revisionId, input) {
  const payload = await apiRequest(`${root}/seller/bookings/${encodeURIComponent(bookingId)}/revisions/${encodeURIComponent(revisionId)}/respond`, {
    method: "POST", body: input,
  });
  if (!payload?.data || typeof payload.data.id !== "string") throw new Error("The revision response has an invalid shape.");
  return payload.data;
}

export async function respondToRevisionClarification(bookingId, revisionId, clarificationId, responseText) {
  const payload = await apiRequest(`${root}/me/bookings/${encodeURIComponent(bookingId)}/revisions/${encodeURIComponent(revisionId)}/clarifications/${encodeURIComponent(clarificationId)}/respond`, {
    method: "POST", body: { response_text: responseText },
  });
  if (!payload?.data || typeof payload.data.id !== "string") throw new Error("The clarification response has an invalid shape.");
  return payload.data;
}

export function bookingErrorMessage(error) {
  if (error?.status === 401) return "Your session has expired. Sign in again to continue.";
  if (error?.status === 403) return "This action is not available for your account.";
  if (error?.status === 404) return "This booking is not available to your account.";
  if (error?.status === 409) return error.message || "The booking changed. Refresh and try again.";
  if (error?.status === 422) {
    const detail = Array.isArray(error.details) ? error.details[0]?.message : "";
    return detail || error.message || "Check the information and try again.";
  }
  if (error?.status === 0) return "We could not reach Digarsa. Check your connection before trying again.";
  return error?.message || "The request could not be completed. Try again.";
}
