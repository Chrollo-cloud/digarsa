import { apiRequest } from "../../lib/apiClient.js";

function sellerDto(payload) {
  const seller = payload?.data?.seller || payload?.data;
  if (!seller || typeof seller.id !== "string" || typeof seller.name !== "string") {
    throw new Error("The server returned an invalid seller profile response.");
  }
  return seller;
}

export async function getMySellerProfile({ signal } = {}) {
  return sellerDto(await apiRequest("/api/sellers/me", { signal }));
}

export async function applySellerProfile(input) {
  return sellerDto(await apiRequest("/api/sellers/apply", { method: "POST", body: input }));
}

export async function updateMySellerProfile(input) {
  return sellerDto(await apiRequest("/api/sellers/me", { method: "PATCH", body: input }));
}

export async function getMyActivationStatus({ signal } = {}) {
  const payload = await apiRequest("/api/sellers/me/activation-review", { signal });
  const data = payload?.data;
  if (!data || !["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED", "WITHDRAWN"].includes(data.status)) {
    throw new Error("The server returned an invalid seller activation status.");
  }
  return {
    status: data.status,
    review: data.review && typeof data.review.id === "string" ? {
      id: data.review.id,
      status: data.review.status,
      submittedAt: data.review.submitted_at || null,
      reviewedAt: data.review.reviewed_at || null,
      withdrawnAt: data.review.withdrawn_at || null,
      rejectionReason: data.review.rejection_reason || "",
    } : null,
  };
}

export async function submitActivationReview() {
  const payload = await apiRequest("/api/sellers/me/activation-review", { method: "POST", body: {} });
  if (payload?.data?.status !== "PENDING" || typeof payload.data.id !== "string") {
    throw new Error("The server returned an invalid activation submission response.");
  }
  return payload.data;
}

export async function withdrawActivationReview() {
  const payload = await apiRequest("/api/sellers/me/activation-review", { method: "DELETE" });
  if (payload?.data?.status !== "WITHDRAWN" || typeof payload.data.id !== "string") {
    throw new Error("The server returned an invalid activation withdrawal response.");
  }
  return payload.data;
}

export async function listMyPortfolio({ signal } = {}) {
  const payload = await apiRequest("/api/sellers/me/portfolio", { signal });
  if (!Array.isArray(payload?.data)) throw new Error("The server returned an invalid portfolio response.");
  return payload.data.map((item) => {
    if (!item || typeof item.id !== "string" || typeof item.image_url !== "string") throw new Error("The server returned an invalid portfolio item.");
    return { id: item.id, title: item.title || "", description: item.description || "", imageUrl: item.image_url, createdAt: item.created_at || "" };
  });
}

export async function createPortfolioItem({ title, description, imageUrl }) {
  const payload = await apiRequest("/api/sellers/me/portfolio", {
    method: "POST",
    body: { title: title || null, description: description || null, image_url: imageUrl },
  });
  const item = payload?.data;
  if (!item || typeof item.id !== "string" || typeof item.image_url !== "string") throw new Error("The server returned an invalid portfolio item.");
  return { id: item.id, title: item.title || "", description: item.description || "", imageUrl: item.image_url, createdAt: item.created_at || "" };
}

export async function deletePortfolioItem(id) {
  const payload = await apiRequest(`/api/sellers/me/portfolio/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (payload?.data?.id !== id || payload.data.deleted !== true) throw new Error("The server could not confirm portfolio item removal.");
}

export async function listMyServices({ signal } = {}) {
  const payload = await apiRequest("/api/services/mine", { signal });
  if (!Array.isArray(payload?.data)) throw new Error("The server returned an invalid service preparation response.");
  return payload.data.map((service) => {
    if (!service || typeof service.id !== "string" || typeof service.title !== "string") throw new Error("The server returned an invalid service preparation item.");
    return {
      id: service.id,
      title: service.title,
      category: service.category || "",
      description: service.description || "",
      price: Number.isSafeInteger(service.price) ? service.price : null,
      delivery: service.delivery || "",
      turnaround: service.turnaround || "",
      availability: service.availability || "",
      active: service.active === true,
      hidden: service.hidden === true,
      hiddenReason: service.hiddenReason || "",
      moderationStatus: service.moderationStatus || (service.hidden ? "PENDING" : ""),
    };
  });
}

export function canSubmitActivation(status) {
  return ["NOT_SUBMITTED", "REJECTED", "WITHDRAWN"].includes(status);
}

export function canWithdrawActivation(status) {
  return status === "PENDING";
}
