import { ADMIN_PERMISSION } from "../account/demoStore.js";

export const CUSTOMER_KEY = "digarsa.demo.customer.v1";
// Phase 7: seller-side transitions on the SAME booking records (no second orders store).
// Payment does not exist yet, so Completed is reachable from Accepted as well as Paid.
export const sellerActions = {
  accept: { from: ["Requested"], to: "Accepted", label: "diterima" },
  decline: { from: ["Requested"], to: "Declined", label: "ditolak" },
  complete: {
    from: ["Accepted", "Paid"],
    to: "Completed",
    label: "ditandai selesai",
  },
};
export const statuses = [
  "Requested",
  "Accepted",
  "Paid",
  "Completed",
  "Declined",
  "Cancelled",
];
export const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const empty = () => ({ version: 1, lists: [], bookings: [] });
const string = (value, max = 5000) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const validDate = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const requiredText = (value, label, min, max) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max)
    throw new Error(`${label} harus ${min}–${max} karakter.`);
  return result;
};
export function bookingRestriction(service, user, creator) {
  if (!service) return "Layanan tidak ditemukan.";
  if (
    user &&
    (service.creatorId === user.sellerProfileId ||
      creator?.ownerUserId === user.id)
  )
    return "Kamu tidak dapat memesan layanan sendiri.";
  if (service.availability !== "Open")
    return "Layanan ini sedang Full-book atau tidak tersedia.";
  if (!["remote", "onsite"].includes(service.delivery?.toLowerCase()))
    return "Mode pengerjaan belum didukung. Booking belum tersedia untuk layanan ini.";
  return "";
}

export function createCustomerStore({
  storage,
  currentUser,
  catalog,
  creators: people,
  randomId = () => globalThis.crypto.randomUUID(),
  today = localToday,
  now = () => new Date().toISOString(),
}) {
  const listeners = new Set();
  function raw() {
    try {
      return storage.getItem(CUSTOMER_KEY) || "";
    } catch {
      return "storage-unavailable";
    }
  }
  function read() {
    const value = raw();
    if (!value) return { data: empty(), error: "" };
    try {
      const parsed = JSON.parse(value);
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.lists) ||
        !Array.isArray(parsed.bookings)
      )
        throw new Error();
      let bad = false;
      const users = new Set();
      const lists = parsed.lists.filter((row) => {
        const valid =
          row &&
          string(row.userId, 200) &&
          !users.has(row.userId) &&
          ["favorites", "cart"].every(
            (key) =>
              Array.isArray(row[key]) &&
              row[key].every((id) => string(id, 200)) &&
              new Set(row[key]).size === row[key].length,
          );
        if (!valid) bad = true;
        else users.add(row.userId);
        return valid;
      });
      const ids = new Set();
      const bookings = parsed.bookings.filter((row) => {
        const valid =
          row &&
          [
            "id",
            "customerId",
            "serviceId",
            "creatorId",
            "serviceTitle",
            "creatorName",
          ].every((key) => string(row[key], 200)) &&
          !ids.has(row.id) &&
          statuses.includes(row.status) &&
          ["remote", "onsite"].includes(row.deliveryMode) &&
          Number.isFinite(row.estimatedPrice) &&
          row.estimatedPrice >= 0 &&
          string(row.requirements, 2000) &&
          string(row.description, 5000) &&
          typeof row.location === "string" &&
          row.location.length <= 500 &&
          typeof row.requestedDate === "string" &&
          (!row.requestedDate || validDate(row.requestedDate)) &&
          (row.deliveryMode !== "onsite" ||
            (row.requestedDate && row.location.trim().length >= 10)) &&
          string(row.createdAt, 40) &&
          Number.isFinite(Date.parse(row.createdAt));
        if (!valid) bad = true;
        else ids.add(row.id);
        return valid;
      });
      return {
        data: { version: 1, lists, bookings },
        error: bad
          ? "Sebagian data demo tidak valid dan tidak ditampilkan. Perubahan dinonaktifkan agar data lama tidak tertimpa."
          : "",
      };
    } catch {
      return {
        data: empty(),
        error:
          "Data pelanggan demo tidak dapat dibaca. Perubahan dinonaktifkan; periksa penyimpanan browser sebelum melanjutkan.",
      };
    }
  }
  function user() {
    const account = currentUser();
    if (!account?.id || !account.capabilities?.includes("buyer"))
      throw new Error("Masuk ke akun Digarsa untuk melanjutkan.");
    return account;
  }
  function sellerAccount() {
    const account = currentUser();
    if (
      !account?.id ||
      !account.capabilities?.includes("seller") ||
      !account.sellerProfileId
    )
      throw new Error("Seller Center memerlukan Seller Profile aktif.");
    return account;
  }
  function writable() {
    const state = read();
    if (state.error) throw new Error(state.error);
    return state.data;
  }
  function write(data) {
    try {
      storage.setItem(CUSTOMER_KEY, JSON.stringify(data));
    } catch {
      throw new Error(
        "Data belum tersimpan. Penyimpanan browser tidak tersedia atau penuh.",
      );
    }
    listeners.forEach((listener) => listener());
  }
  function listChange(kind, serviceId, add) {
    const account = user();
    const data = writable();
    if (add && !catalog.some((service) => service.id === serviceId))
      throw new Error("Layanan tidak ditemukan.");
    let list = data.lists.find((item) => item.userId === account.id);
    if (!list) {
      list = { userId: account.id, favorites: [], cart: [] };
      data.lists.push(list);
    }
    list[kind] = add
      ? [...new Set([...list[kind], serviceId])]
      : list[kind].filter((id) => id !== serviceId);
    write(data);
  }
  function validate(serviceId, input) {
    const account = user();
    const service = catalog.find((item) => item.id === serviceId);
    const creator = people.find((item) => item.id === service?.creatorId);
    const reason = bookingRestriction(service, account, creator);
    if (reason) throw new Error(reason);
    if (!creator || !Number.isFinite(service.price) || service.price < 0)
      throw new Error("Informasi layanan belum lengkap.");
    const deliveryMode = service.delivery.toLowerCase();
    const requestedDate =
      typeof input.requestedDate === "string" ? input.requestedDate : "";
    if (
      (deliveryMode === "onsite" || service.requiresSchedule === true) &&
      !requestedDate
    )
      throw new Error("Tanggal yang diminta wajib diisi.");
    if (requestedDate && (!validDate(requestedDate) || requestedDate < today()))
      throw new Error("Pilih tanggal hari ini atau setelahnya yang valid.");
    return {
      serviceId: service.id,
      creatorId: creator.id,
      serviceTitle: service.title,
      creatorName: creator.name,
      estimatedPrice: service.price,
      deliveryMode,
      requestedDate,
      location:
        deliveryMode === "onsite"
          ? requiredText(input.location, "Lokasi proyek", 10, 500)
          : "",
      requirements: requiredText(
        input.requirements,
        "Kebutuhan proyek",
        10,
        2000,
      ),
      description: requiredText(
        input.description,
        "Deskripsi proyek",
        20,
        5000,
      ),
    };
  }
  return {
    snapshot: raw,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view() {
      let account;
      try {
        account = currentUser();
      } catch {
        return {
          favorites: [],
          cart: [],
          bookings: [],
          error: "Sesi demo tidak dapat dibaca.",
        };
      }
      if (!account) return { favorites: [], cart: [], bookings: [], error: "" };
      const { data, error } = read();
      const list = data.lists.find((item) => item.userId === account.id);
      return {
        favorites: list?.favorites || [],
        cart: list?.cart || [],
        bookings: data.bookings
          .filter((booking) => booking.customerId === account.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        error,
      };
    },
    addFavorite(id) {
      listChange("favorites", id, true);
    },
    removeFavorite(id) {
      listChange("favorites", id, false);
    },
    addToCart(id) {
      listChange("cart", id, true);
    },
    removeFromCart(id) {
      listChange("cart", id, false);
    },
    validateBooking: validate,
    createBooking(
      serviceId,
      input,
      { confirmed = false, expectedUserId } = {},
    ) {
      const account = user();
      if (!confirmed)
        throw new Error("Tinjau dan konfirmasi permintaan terlebih dahulu.");
      if (account.id !== expectedUserId)
        throw new Error(
          "Sesi berubah. Tinjau ulang permintaan dari akun aktif.",
        );
      const details = validate(serviceId, input);
      const data = writable();
      const booking = {
        ...details,
        id: `booking-${randomId()}`,
        customerId: account.id,
        status: "Requested",
        createdAt: now(),
      };
      if (data.bookings.some((item) => item.id === booking.id))
        throw new Error("ID booking bertabrakan. Silakan coba lagi.");
      data.bookings.push(booking);
      const list = data.lists.find((item) => item.userId === account.id);
      if (list) list.cart = list.cart.filter((id) => id !== serviceId);
      write(data);
      return booking;
    },
    getBooking(id) {
      user();
      const booking = this.view().bookings.find((item) => item.id === id);
      if (!booking)
        throw new Error("Booking tidak ditemukan atau bukan milik akunmu.");
      return booking;
    },
    // --- Phase 7: Seller Center / Admin access to the same booking records ---
    // The seller identity always comes from the Phase 5 session, never from input.
    sellerView() {
      const account = sellerAccount();
      const { data, error } = read();
      return {
        bookings: data.bookings
          .filter((booking) => booking.creatorId === account.sellerProfileId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        error,
      };
    },
    respondToBooking(bookingId, action, { expectedStatus, reason } = {}) {
      const account = sellerAccount();
      const rule = sellerActions[action];
      if (!rule) throw new Error("Aksi booking tidak dikenal.");
      const data = writable();
      const booking = data.bookings.find(
        (item) =>
          item.id === bookingId && item.creatorId === account.sellerProfileId,
      );
      if (!booking)
        throw new Error(
          "Booking tidak ditemukan atau bukan untuk Seller Profile-mu.",
        );
      if (expectedStatus && booking.status !== expectedStatus)
        throw new Error(
          "Status booking sudah berubah. Muat ulang dan tinjau kembali.",
        );
      if (!rule.from.includes(booking.status))
        throw new Error(
          `Booking berstatus ${booking.status} tidak dapat ${rule.label}.`,
        );
      const note = typeof reason === "string" ? reason.trim() : "";
      if (note.length > 500)
        throw new Error("Alasan maksimal 500 karakter.");
      booking.status = rule.to;
      booking.updatedAt = now();
      if (action === "decline" && note) booking.declineReason = note;
      write(data);
      return { ...booking };
    },
    adminView() {
      const account = currentUser();
      if (!account?.permissions?.includes(ADMIN_PERMISSION))
        throw new Error("Memerlukan izin admin internal.");
      const { data, error } = read();
      return {
        bookings: [...data.bookings].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
        error,
      };
    },
  };
}
