import { apiRequest } from "../../lib/apiClient.js";

const ROOT = "/api/services";
const CATEGORIES = ["Branding", "Fotografi & Film", "Web & Digital", "Illustration & Motion"];
const WINDOWS = [12, 24, 48, 72];

export function validateRevisionPolicy(input) {
  const revisionFreeCount = Number(input?.revisionFreeCount);
  const revisionRequestWindowHours = Number(input?.revisionRequestWindowHours);
  const revisionTerms = typeof input?.revisionTerms === "string" ? input.revisionTerms.trim() : "";
  const errors = [];
  if (!Number.isSafeInteger(revisionFreeCount) || revisionFreeCount < 0 || revisionFreeCount > 2_147_483_647) {
    errors.push({ field: "revisionFreeCount", message: "Masukkan jumlah revisi gratis berupa bilangan bulat 0 atau lebih." });
  }
  if (!WINDOWS.includes(revisionRequestWindowHours)) {
    errors.push({ field: "revisionRequestWindowHours", message: "Pilih jendela permintaan revisi 12, 24, 48, atau 72 jam." });
  }
  if (!revisionTerms || revisionTerms.length > 2000) {
    errors.push({ field: "revisionTerms", message: "Ketentuan revisi wajib diisi (maksimal 2000 karakter)." });
  }
  return { valid: errors.length === 0, errors, value: { revisionFreeCount, revisionRequestWindowHours, revisionTerms } };
}

export function normalizeSellerServiceInput(input) {
  const policy = validateRevisionPolicy(input);
  if (!policy.valid) {
    const error = new Error(policy.errors.map((item) => item.message).join(" "));
    error.details = policy.errors;
    throw error;
  }
  const value = {
    ...input,
    title: String(input.title || "").trim(),
    category: String(input.category || ""),
    description: String(input.description || "").trim(),
    price: Number(input.price),
    delivery: String(input.delivery || ""),
    turnaround: String(input.turnaround || "").trim(),
    availability: String(input.availability || ""),
    image: typeof input.image === "string" && input.image.trim() ? input.image.trim() : null,
    serviceLocation: input.serviceLocation ?? null,
    ...policy.value,
  };
  const errors = [];
  if (!CATEGORIES.includes(value.category)) errors.push({ field: "category", message: "Pilih kategori layanan yang tersedia." });
  if (value.title.length < 5 || value.title.length > 100) errors.push({ field: "title", message: "Judul layanan harus 5–100 karakter." });
  if (value.description.length < 30 || value.description.length > 1500) errors.push({ field: "description", message: "Deskripsi layanan harus 30–1500 karakter." });
  if (!Number.isSafeInteger(value.price) || value.price < 10000 || value.price > 100000000) errors.push({ field: "price", message: "Harga harus bilangan bulat IDR 10.000–100.000.000." });
  if (!["Remote", "Onsite"].includes(value.delivery)) errors.push({ field: "delivery", message: "Pilih mode Remote atau Onsite." });
  if (value.turnaround.length < 2 || value.turnaround.length > 60) errors.push({ field: "turnaround", message: "Estimasi pengerjaan harus 2–60 karakter." });
  if (!["Open", "Full-book"].includes(value.availability)) errors.push({ field: "availability", message: "Pilih status ketersediaan yang tersedia." });
  if (value.image) {
    try {
      const image = new URL(value.image);
      if (!["http:", "https:"].includes(image.protocol) || image.username || image.password || value.image.length > 2048) throw new Error();
    } catch {
      errors.push({ field: "image", message: "Gambar harus menggunakan URL HTTP atau HTTPS yang valid." });
    }
  }
  if (errors.length) {
    const error = new Error(errors.map((item) => item.message).join(" "));
    error.details = errors;
    throw error;
  }
  return value;
}

export function mapSellerService(row) {
  if (!row || typeof row.id !== "string" || typeof row.creatorId !== "string" || typeof row.title !== "string") {
    throw new Error("The seller services response has an invalid item.");
  }
  if (!Number.isSafeInteger(row.price) || typeof row.active !== "boolean" || typeof row.hidden !== "boolean") {
    throw new Error("The seller services response has invalid status or price fields.");
  }
  if (!["Open", "Full-book"].includes(row.availability)) {
    throw new Error("The seller services response has an invalid availability value.");
  }
  const policy = row.revision_policy;
  return {
    id: row.id,
    ownerUserId: typeof row.ownerUserId === "string" ? row.ownerUserId : "",
    creatorId: row.creatorId,
    title: row.title,
    category: typeof row.category === "string" ? row.category : "",
    studio: typeof row.studio === "string" ? row.studio : "",
    description: typeof row.description === "string" ? row.description : "",
    price: row.price,
    delivery: typeof row.delivery === "string" ? row.delivery : "",
    turnaround: typeof row.turnaround === "string" ? row.turnaround : "",
    availability: row.availability,
    image: typeof row.image === "string" ? row.image : "",
    images: Array.isArray(row.images) ? row.images : [],
    active: row.active,
    hidden: row.hidden,
    hiddenReason: typeof row.hiddenReason === "string" ? row.hiddenReason : "",
    moderationStatus: typeof row.moderationStatus === "string" ? row.moderationStatus : "",
    serviceLocation: row.serviceLocation && typeof row.serviceLocation === "object" ? row.serviceLocation : null,
    revisionFreeCount: Number.isSafeInteger(policy?.free_revision_count) ? policy.free_revision_count : null,
    revisionRequestWindowHours: Number.isSafeInteger(policy?.request_window_duration) ? policy.request_window_duration : null,
    revisionTerms: typeof policy?.terms === "string" ? policy.terms : "",
    revisionPolicyHash: typeof policy?.hash === "string" ? policy.hash : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

function serviceResponse(payload) {
  return mapSellerService(payload?.data);
}

export async function listSellerServices({ signal } = {}) {
  const payload = await apiRequest(`${ROOT}/mine`, { signal });
  if (!Array.isArray(payload?.data)) throw new Error("The server returned an invalid seller services response.");
  return payload.data.map(mapSellerService);
}

export async function createSellerService(input) {
  const payload = await apiRequest(ROOT, { method: "POST", body: normalizeSellerServiceInput(input) });
  return serviceResponse(payload);
}

export async function updateSellerService(id, input) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(id)}`, { method: "PATCH", body: normalizeSellerServiceInput(input) });
  return serviceResponse(payload);
}

export async function setSellerServiceActive(id, active) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(id)}/active`, { method: "PATCH", body: { active } });
  return serviceResponse(payload);
}

export async function setSellerServiceAvailability(id, availability) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { availability } });
  return serviceResponse(payload);
}

export async function deleteSellerService(id) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (typeof payload?.data?.message !== "string") throw new Error("The server could not confirm service removal.");
  return payload.data;
}

export function mapAvailabilitySlot(row) {
  if (!row || typeof row.id !== "string" || typeof row.serviceId !== "string" || typeof row.date !== "string" || typeof row.startTime !== "string" || typeof row.endTime !== "string") {
    throw new Error("The seller availability response has an invalid item.");
  }
  return {
    id: row.id,
    serviceId: row.serviceId,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    note: typeof row.note === "string" ? row.note : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

export async function listSellerAvailability(serviceId, { signal } = {}) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(serviceId)}/availability`, { signal });
  if (!Array.isArray(payload?.data)) throw new Error("The server returned an invalid availability response.");
  return payload.data.map(mapAvailabilitySlot);
}

function availabilityBody(input) {
  const body = {
    date: String(input?.date || "").trim(),
    startTime: String(input?.startTime || ""),
    endTime: String(input?.endTime || ""),
    note: typeof input?.note === "string" ? input.note.trim() : "",
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error("Pilih tanggal yang valid.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.endTime) || body.startTime >= body.endTime) {
    throw new Error("Waktu selesai harus setelah waktu mulai.");
  }
  if (body.note.length > 160) throw new Error("Catatan maksimal 160 karakter.");
  return body;
}

export async function createSellerAvailability(serviceId, input) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(serviceId)}/availability`, { method: "POST", body: availabilityBody(input) });
  return mapAvailabilitySlot(payload?.data);
}

export async function updateSellerAvailability(serviceId, slotId, input) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(serviceId)}/availability/${encodeURIComponent(slotId)}`, { method: "PATCH", body: availabilityBody(input) });
  return mapAvailabilitySlot(payload?.data);
}

export async function deleteSellerAvailability(serviceId, slotId) {
  const payload = await apiRequest(`${ROOT}/${encodeURIComponent(serviceId)}/availability/${encodeURIComponent(slotId)}`, { method: "DELETE" });
  if (typeof payload?.data?.message !== "string") throw new Error("The server could not confirm availability removal.");
}
