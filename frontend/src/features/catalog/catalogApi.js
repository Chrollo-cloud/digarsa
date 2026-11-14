import { apiRequest } from "../../lib/apiClient.js";

const stringOrEmpty = (value) => typeof value === "string" ? value : "";
const safeImage = (value) => {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
};

export function mapPublicService(row) {
  if (!row || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.seller_profile_id !== "string") {
    throw new Error("The catalog service response has an invalid shape.");
  }
  const image = safeImage(row.image_url) || safeImage(row.images?.find((item) => item?.src)?.src);
  const images = Array.isArray(row.images)
    ? row.images.map((item) => ({ src: safeImage(item?.src), alt: stringOrEmpty(item?.alt) })).filter((item) => item.src)
    : [];
  if (image && !images.some((item) => item.src === image)) images.unshift({ src: image, alt: stringOrEmpty(row.alt) || row.title });
  if (!["Open", "Full-book"].includes(row.availability)) throw new Error("The service response has an unsupported availability value.");
  const average = Number.isFinite(row.avg_rating) && row.avg_rating >= 0 && row.avg_rating <= 5 ? row.avg_rating : null;
  return {
    id: row.id,
    creatorId: row.seller_profile_id,
    title: row.title,
    category: stringOrEmpty(row.category),
    description: stringOrEmpty(row.description),
    price: Number.isSafeInteger(row.price) && row.price >= 0 ? row.price : null,
    delivery: stringOrEmpty(row.delivery),
    turnaround: stringOrEmpty(row.turnaround),
    availability: row.availability === "Full-book" ? "Full-book" : "Open",
    image,
    alt: stringOrEmpty(row.alt) || row.title,
    images,
    studio: stringOrEmpty(row.studio),
    city: stringOrEmpty(row.city),
    creator: { id: row.seller_profile_id, name: stringOrEmpty(row.studio), city: stringOrEmpty(row.city), image: "" },
    publicLocation: row.public_location && typeof row.public_location === "object" ? row.public_location : null,
    bookable: row.bookable === true,
    avgRating: average,
    reviewCount: Number.isInteger(row.review_count) && row.review_count >= 0 ? row.review_count : 0,
    createdAt: stringOrEmpty(row.created_at),
  };
}

export function mapPublicCreator(row) {
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") {
    throw new Error("The creator response has an invalid shape.");
  }
  const services = Array.isArray(row.services) ? row.services.map(mapPublicService) : [];
  const portfolio = Array.isArray(row.portfolio)
    ? row.portfolio.map((item) => ({
      image: safeImage(item?.image),
      alt: stringOrEmpty(item?.alt),
      title: stringOrEmpty(item?.title),
      serviceId: stringOrEmpty(item?.service_id),
    })).filter((item) => item.image && item.serviceId)
    : [];
  return {
    id: row.id,
    name: row.name,
    role: stringOrEmpty(row.category) || "Creator",
    category: stringOrEmpty(row.category),
    city: stringOrEmpty(row.city),
    bio: stringOrEmpty(row.bio),
    image: safeImage(row.image_url),
    portfolioLink: typeof row.portfolio_link === "string" ? row.portfolio_link : "",
    skills: Array.isArray(row.specialties) ? row.specialties.filter((item) => typeof item === "string") : [],
    publicLocation: row.public_location && typeof row.public_location === "object" ? row.public_location : null,
    services,
    portfolio,
  };
}

export function catalogSearchParams(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "city", "min", "max", "availability"]) {
    const value = filters[key];
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  }
  const sort = ["editor", "price-up", "price-down", "rating"].includes(filters.sort) ? filters.sort : "editor";
  params.set("sort", sort);
  params.set("limit", String(Math.min(100, Math.max(1, Number(filters.limit) || 20))));
  if (typeof filters.cursor === "string" && filters.cursor) params.set("cursor", filters.cursor);
  return params;
}

export async function listPublicServices(filters = {}, { signal } = {}) {
  const query = catalogSearchParams(filters).toString();
  const response = await apiRequest(`/api/v1/services?${query}`, { auth: false, signal });
  if (!Array.isArray(response?.data) || !response?.page || typeof response.page.has_more !== "boolean") {
    throw new Error("The catalog listing response has an invalid shape.");
  }
  return {
    items: response.data.map(mapPublicService),
    nextCursor: typeof response.page.next_cursor === "string" ? response.page.next_cursor : null,
    hasMore: response.page.has_more,
    total: Number.isInteger(response.total) ? response.total : response.data.length,
  };
}

export async function getPublicService(id, { signal } = {}) {
  const response = await apiRequest(`/api/v1/services/${encodeURIComponent(id)}`, { auth: false, signal });
  return mapPublicService(response?.data);
}

export async function getPublicCreator(id, { signal } = {}) {
  const response = await apiRequest(`/api/v1/creators/${encodeURIComponent(id)}`, { auth: false, signal });
  return mapPublicCreator(response?.data);
}

export async function getCatalogFacets({ signal } = {}) {
  const response = await apiRequest("/api/v1/catalog/facets", { auth: false, signal });
  const data = response?.data;
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.cities)) {
    throw new Error("The catalog filter response has an invalid shape.");
  }
  return {
    categories: data.categories.filter((value) => typeof value === "string"),
    cities: data.cities.filter((value) => typeof value === "string"),
  };
}
