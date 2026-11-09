import {
  validatePublicLocation,
  validStoredPublicLocation,
} from "../location/locationModel.js";
import { ADMIN_PERMISSION, sellerCategories } from "../account/demoStore.js";

export const SELLER_KEY = "digarsa.demo.seller.v1";
export const availabilityValues = ["Open", "Full-book"];
export const deliveryValues = ["Remote", "Onsite"];
export const activeBookingStatuses = ["Requested", "Accepted", "Paid"];

const empty = () => ({
  version: 1,
  services: [],
  schedules: [],
  moderation: {},
});
const isText = (value, max) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
function text(value, label, min, max) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max)
    throw new Error(`${label} harus ${min}–${max} karakter.`);
  return result;
}
function optionalUrl(value, label) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(`${label} harus URL http atau https yang valid.`);
  }
}
function fields(input) {
  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 10000 || price > 100000000)
    throw new Error("Harga harus bilangan bulat Rp 10.000–Rp 100.000.000.");
  if (!sellerCategories.includes(input.category))
    throw new Error("Pilih kategori layanan yang tersedia.");
  if (!deliveryValues.includes(input.delivery))
    throw new Error("Pilih mode pengerjaan Remote atau Onsite.");
  if (!availabilityValues.includes(input.availability))
    throw new Error("Pilih status ketersediaan yang valid.");
  return {
    title: text(input.title, "Judul layanan", 5, 100),
    category: input.category,
    description: text(input.description, "Deskripsi", 30, 1500),
    price,
    delivery: input.delivery,
    turnaround: text(input.turnaround, "Estimasi pengerjaan", 2, 60),
    availability: input.availability,
    image: optionalUrl(input.image, "Gambar layanan"),
    ...(Object.hasOwn(input, "serviceLocation")
      ? { serviceLocation: validatePublicLocation(input.serviceLocation) }
      : {}),
  };
}
function validService(row) {
  return (
    row &&
    ["id", "ownerUserId", "creatorId", "title", "turnaround"].every((key) =>
      isText(row[key], 200),
    ) &&
    isText(row.description, 1500) &&
    sellerCategories.includes(row.category) &&
    deliveryValues.includes(row.delivery) &&
    availabilityValues.includes(row.availability) &&
    Number.isInteger(row.price) &&
    row.price >= 0 &&
    typeof row.image === "string" &&
    typeof row.active === "boolean" &&
    validStoredPublicLocation(row.serviceLocation) &&
    isText(row.createdAt, 40)
  );
}
function validSchedule(row) {
  return (
    row &&
    ["id", "serviceId", "ownerUserId", "creatorId"].every((key) =>
      isText(row[key], 200),
    ) &&
    isDate(row.date) &&
    isTime(row.startTime) &&
    isTime(row.endTime) &&
    row.startTime < row.endTime &&
    typeof row.note === "string" &&
    row.note.length <= 160 &&
    isText(row.createdAt, 40) &&
    isText(row.updatedAt, 40)
  );
}

// Seller-owned service catalog + admin moderation flags (demo-only, localStorage).
// Orders are NOT stored here: they live in the Phase 6 booking store.
export function createSellerStore({
  storage,
  currentUser,
  baseServices = () => [],
  activeBookingCount = () => {
    throw new Error("Jumlah booking aktif belum dapat diverifikasi.");
  },
  randomId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
  today = localToday,
}) {
  const listeners = new Set();
  function raw() {
    try {
      return storage.getItem(SELLER_KEY);
    } catch {
      return "storage-unavailable";
    }
  }
  function read() {
    const value = raw();
    if (value === null) return { data: empty(), error: "" };
    try {
      const parsed = JSON.parse(value);
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.services) ||
        (parsed.schedules !== undefined && !Array.isArray(parsed.schedules)) ||
        !parsed.moderation ||
        typeof parsed.moderation !== "object" ||
        Array.isArray(parsed.moderation)
      )
        throw new Error();
      const ids = new Set();
      let bad = false;
      // Backward-compatible normalization for services saved before active status existed.
      const services = parsed.services
        .map((row) =>
          row && row.active === undefined ? { ...row, active: true } : row,
        )
        .filter((row) => {
          const ok = validService(row) && !ids.has(row.id);
          if (ok) ids.add(row.id);
          else bad = true;
          return ok;
        });
      const serviceById = new Map(
        services.map((service) => [service.id, service]),
      );
      const scheduleIds = new Set();
      const occupied = [];
      const schedules = (parsed.schedules || []).filter((row) => {
        const ok =
          validSchedule(row) &&
          !scheduleIds.has(row.id) &&
          serviceById.has(row.serviceId) &&
          serviceById.get(row.serviceId).ownerUserId === row.ownerUserId &&
          serviceById.get(row.serviceId).creatorId === row.creatorId &&
          !occupied.some(
            (other) =>
              other.serviceId === row.serviceId &&
              other.date === row.date &&
              row.startTime < other.endTime &&
              other.startTime < row.endTime,
          );
        if (ok) {
          scheduleIds.add(row.id);
          occupied.push(row);
        } else bad = true;
        return ok;
      });
      const moderation = {};
      for (const [id, entry] of Object.entries(parsed.moderation)) {
        if (entry && isText(entry.reason, 300) && isText(entry.at, 40))
          moderation[id] = entry;
        else bad = true;
      }
      return {
        data: { version: 1, services, schedules, moderation },
        error: bad
          ? "Sebagian data layanan demo tidak valid dan tidak ditampilkan. Perubahan dinonaktifkan agar data lama tidak tertimpa."
          : "",
      };
    } catch {
      return {
        data: empty(),
        error:
          "Data layanan demo tidak dapat dibaca. Perubahan dinonaktifkan; periksa penyimpanan browser sebelum melanjutkan.",
      };
    }
  }
  function writable() {
    const state = read();
    if (state.error) throw new Error(state.error);
    return state.data;
  }
  function write(data) {
    try {
      storage.setItem(SELLER_KEY, JSON.stringify(data));
    } catch {
      throw new Error(
        "Data belum tersimpan. Penyimpanan browser tidak tersedia atau penuh.",
      );
    }
    listeners.forEach((listener) => listener());
  }
  function seller() {
    const account = currentUser();
    if (
      !account?.id ||
      !account.capabilities?.includes("seller") ||
      !account.sellerProfileId
    )
      throw new Error("Seller Center memerlukan Seller Profile aktif.");
    return account;
  }
  function admin() {
    const account = currentUser();
    if (!account?.permissions?.includes(ADMIN_PERMISSION))
      throw new Error("Memerlukan izin admin internal.");
    return account;
  }
  function owned(data, account, id) {
    const service = data.services.find(
      (item) =>
        item.id === id &&
        item.ownerUserId === account.id &&
        item.creatorId === account.sellerProfileId,
    );
    if (!service)
      throw new Error("Layanan tidak ditemukan atau bukan milikmu.");
    return service;
  }
  const withModeration = (service, moderation) => ({
    ...service,
    hidden: Boolean(moderation[service.id]),
    hiddenReason: moderation[service.id]?.reason || "",
  });
  return {
    snapshot: raw,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Public: what the marketplace overlay needs. Contains no private data.
    catalogEntries() {
      const { data, error } = read();
      return {
        services: data.services,
        hiddenServiceIds: Object.keys(data.moderation),
        error,
      };
    },
    mine() {
      const account = seller();
      const { data, error } = read();
      return {
        services: data.services
          .filter(
            (item) =>
              item.ownerUserId === account.id &&
              item.creatorId === account.sellerProfileId,
          )
          .map((item) => withModeration(item, data.moderation))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        error,
      };
    },
    create(input) {
      const account = seller();
      const data = writable();
      const timestamp = now();
      const service = {
        ...fields(input),
        active: true,
        id: `service-${randomId()}`,
        ownerUserId: account.id,
        creatorId: account.sellerProfileId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (
        data.services.some((item) => item.id === service.id) ||
        baseServices().some((item) => item.id === service.id)
      )
        throw new Error("ID layanan bertabrakan. Silakan coba lagi.");
      data.services.push(service);
      write(data);
      return { ...service };
    },
    update(id, input) {
      const account = seller();
      const data = writable();
      const service = owned(data, account, id);
      Object.assign(service, fields(input), { updatedAt: now() });
      write(data);
      return { ...service };
    },
    setAvailability(id, availability) {
      const account = seller();
      if (!availabilityValues.includes(availability))
        throw new Error("Pilih status ketersediaan yang valid.");
      const data = writable();
      const service = owned(data, account, id);
      service.availability = availability;
      service.updatedAt = now();
      write(data);
      return { ...service };
    },
    setActive(id, active) {
      const account = seller();
      if (typeof active !== "boolean")
        throw new Error("Pilih status layanan aktif atau nonaktif.");
      const data = writable();
      const service = owned(data, account, id);
      service.active = active;
      service.updatedAt = now();
      write(data);
      return { ...service };
    },
    schedulesFor(id) {
      const account = seller();
      const { data, error } = read();
      owned(data, account, id);
      return {
        schedules: data.schedules
          .filter(
            (schedule) =>
              schedule.serviceId === id &&
              schedule.ownerUserId === account.id &&
              schedule.creatorId === account.sellerProfileId,
          )
          .sort((a, b) =>
            `${a.date}T${a.startTime}`.localeCompare(
              `${b.date}T${b.startTime}`,
            ),
          ),
        error,
      };
    },
    createSchedule(serviceId, input) {
      const account = seller();
      const data = writable();
      owned(data, account, serviceId);
      const date = typeof input.date === "string" ? input.date.trim() : "";
      const startTime =
        typeof input.startTime === "string" ? input.startTime : "";
      const endTime = typeof input.endTime === "string" ? input.endTime : "";
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (!isDate(date) || date < today())
        throw new Error("Pilih tanggal yang valid dan tidak di masa lalu.");
      if (!isTime(startTime) || !isTime(endTime) || startTime >= endTime)
        throw new Error("Waktu selesai harus setelah waktu mulai.");
      if (note.length > 160) throw new Error("Catatan maksimal 160 karakter.");
      const conflicts = data.schedules.some(
        (item) =>
          item.serviceId === serviceId &&
          item.date === date &&
          startTime < item.endTime &&
          item.startTime < endTime,
      );
      if (conflicts)
        throw new Error("Jadwal bertabrakan dengan slot yang sudah dibuat.");
      const timestamp = now();
      const schedule = {
        id: `availability-${randomId()}`,
        serviceId,
        ownerUserId: account.id,
        creatorId: account.sellerProfileId,
        date,
        startTime,
        endTime,
        note,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.schedules.push(schedule);
      write(data);
      return { ...schedule };
    },
    updateSchedule(serviceId, scheduleId, input) {
      const account = seller();
      const data = writable();
      owned(data, account, serviceId);
      const schedule = data.schedules.find(
        (item) =>
          item.id === scheduleId &&
          item.serviceId === serviceId &&
          item.ownerUserId === account.id &&
          item.creatorId === account.sellerProfileId,
      );
      if (!schedule)
        throw new Error("Jadwal tidak ditemukan atau bukan milikmu.");
      const date = typeof input.date === "string" ? input.date.trim() : "";
      const startTime =
        typeof input.startTime === "string" ? input.startTime : "";
      const endTime = typeof input.endTime === "string" ? input.endTime : "";
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (!isDate(date) || date < today())
        throw new Error("Pilih tanggal yang valid dan tidak di masa lalu.");
      if (!isTime(startTime) || !isTime(endTime) || startTime >= endTime)
        throw new Error("Waktu selesai harus setelah waktu mulai.");
      if (note.length > 160) throw new Error("Catatan maksimal 160 karakter.");
      const conflicts = data.schedules.some(
        (item) =>
          item.id !== scheduleId &&
          item.serviceId === serviceId &&
          item.date === date &&
          startTime < item.endTime &&
          item.startTime < endTime,
      );
      if (conflicts)
        throw new Error("Jadwal bertabrakan dengan slot yang sudah dibuat.");
      Object.assign(schedule, {
        date,
        startTime,
        endTime,
        note,
        updatedAt: now(),
      });
      write(data);
      return { ...schedule };
    },
    removeSchedule(serviceId, scheduleId) {
      const account = seller();
      const data = writable();
      owned(data, account, serviceId);
      const schedule = data.schedules.find(
        (item) =>
          item.id === scheduleId &&
          item.serviceId === serviceId &&
          item.ownerUserId === account.id &&
          item.creatorId === account.sellerProfileId,
      );
      if (!schedule)
        throw new Error("Jadwal tidak ditemukan atau bukan milikmu.");
      data.schedules = data.schedules.filter((item) => item.id !== scheduleId);
      write(data);
    },
    remove(id) {
      const account = seller();
      const data = writable();
      const service = owned(data, account, id);
      const activeCount = activeBookingCount(service.id);
      if (!Number.isSafeInteger(activeCount) || activeCount < 0)
        throw new Error(
          "Jumlah booking aktif belum dapat diverifikasi. Layanan tidak dihapus.",
        );
      if (activeCount > 0)
        throw new Error(
          "Layanan masih punya booking aktif. Selesaikan atau tolak dulu, atau ubah status menjadi Full-book.",
        );
      data.services = data.services.filter((item) => item.id !== id);
      data.schedules = data.schedules.filter((item) => item.serviceId !== id);
      delete data.moderation[id];
      write(data);
    },
    // --- Admin moderation. Separate permission; a seller account cannot call these. ---
    adminList() {
      admin();
      const { data, error } = read();
      const demo = baseServices().map((item) => ({
        id: item.id,
        title: item.title,
        creatorId: item.creatorId,
        category: item.category,
        description: item.description || "",
        price: item.price,
        image: item.image || "",
        delivery: item.delivery || "",
        turnaround: item.turnaround || "",
        availability: item.availability,
        active: item.active !== false,
        source: "demo",
        hidden: Boolean(data.moderation[item.id]),
        hiddenReason: data.moderation[item.id]?.reason || "",
        hiddenAt: data.moderation[item.id]?.at || "",
      }));
      const sellers = data.services.map((item) => ({
        id: item.id,
        title: item.title,
        creatorId: item.creatorId,
        category: item.category,
        description: item.description || "",
        price: item.price,
        image: item.image || "",
        delivery: item.delivery || "",
        turnaround: item.turnaround || "",
        availability: item.availability,
        active: item.active !== false,
        source: "seller",
        hidden: Boolean(data.moderation[item.id]),
        hiddenReason: data.moderation[item.id]?.reason || "",
        hiddenAt: data.moderation[item.id]?.at || "",
      }));
      return { services: [...demo, ...sellers], error };
    },
    moderate(id, { hidden, reason } = {}) {
      const account = admin();
      const data = writable();
      const known =
        data.services.some((item) => item.id === id) ||
        baseServices().some((item) => item.id === id);
      if (!known) throw new Error("Layanan tidak ditemukan.");
      if (hidden) {
        data.moderation[id] = {
          reason: text(reason, "Alasan moderasi", 5, 300),
          at: now(),
          by: account.id,
        };
      } else {
        delete data.moderation[id];
      }
      write(data);
    },
  };
}
