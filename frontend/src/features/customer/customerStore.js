import { ADMIN_PERMISSION } from "../account/demoStore.js";

export const CUSTOMER_KEY = "digarsa.demo.customer.v1";
// Phase 7: seller-side transitions on the SAME booking records (no second orders store).
// Individual and combined checkout share these records. Only Paid may become Completed.
export const sellerActions = {
  accept: { from: ["Requested"], to: "Accepted", label: "diterima" },
  decline: { from: ["Requested"], to: "Declined", label: "ditolak" },
  start: { from: ["Paid"], to: "In Progress", label: "mulai dikerjakan" },
  complete: {
    // Paid remains accepted for historical compatibility; the Seller UI guides
    // current orders through In Progress before completion.
    from: ["Paid", "In Progress"],
    to: "Completed",
    label: "ditandai selesai",
  },
};
export const statuses = [
  "Requested",
  "Accepted",
  "Paid",
  "In Progress",
  "Completed",
  "Declined",
  "Cancelled",
];
export const paymentStatuses = [
  "Unpaid",
  "Pending",
  "Paid",
  "Failed",
  "Expired",
  "Refunded",
];
const paymentStatusOf = (booking) =>
  booking.paymentStatus ||
  (["Paid", "In Progress", "Completed"].includes(booking.status)
    ? "Paid"
    : "Unpaid");
const publicBooking = (booking) => ({
  ...booking,
  paymentStatus: paymentStatusOf(booking),
  finalPrice: Number.isFinite(booking.finalPrice)
    ? booking.finalPrice
    : booking.estimatedPrice,
  additionalInfo: booking.additionalInfo || "",
});
export const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export const validPrice = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
const validCheckoutId = value => typeof value === "string" && /^checkout-[a-zA-Z0-9-]{1,100}$/.test(value);
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
export function bookingRestriction(service, user, creator, sellerProfile, bookingSellerId = service?.creatorId) {
  if (!service) return "Layanan tidak ditemukan.";
  if (
    user &&
    (bookingSellerId === user.sellerProfileId ||
      creator?.ownerUserId === user.id)
  )
    return "Kamu tidak dapat memesan layanan sendiri.";
  if (service.availability !== "Open")
    return "Layanan ini sedang Full-book atau tidak tersedia.";
  if (!["remote", "onsite"].includes(service.delivery?.toLowerCase()))
    return "Mode pengerjaan belum didukung. Booking belum tersedia untuk layanan ini.";
  if (!creator) return "Informasi layanan belum lengkap.";
  if (
    !sellerProfile ||
    sellerProfile.id !== bookingSellerId ||
    !sellerProfile.ownerUserId
  )
    return "Booking belum tersedia: layanan ini belum memiliki Seller Profile dengan akun pemilik yang valid.";
  if (sellerProfile.ownerUserId === user?.id)
    return "Kamu tidak dapat memesan layanan sendiri.";
  return "";
}

export function createCustomerStore({
  storage,
  currentUser,
  catalog,
  creators: people,
  resolveSellerProfile = () => null,
  resolveDemoSellerProfile = () => null,
  catalogError = () => "",
  allowDemoPayment = () => false,
  randomId = () => globalThis.crypto.randomUUID(),
  today = localToday,
  now = () => new Date().toISOString(),
}) {
  const listeners = new Set();
  function demoSeller(service) {
    if (!service) return null;
    try {
      const fixture = resolveDemoSellerProfile(service);
      if (!fixture?.id || !fixture.ownerUserId || fixture.demoFixture !== true)
        return null;
      const actual = resolveSellerProfile(fixture.id);
      return actual?.ownerUserId === fixture.ownerUserId
        ? { ...actual, demoFixture: true }
        : null;
    } catch {
      return null;
    }
  }
  function bookingSeller(service) {
    return demoSeller(service) || (service ? resolveSellerProfile(service.creatorId) : null);
  }
  function raw() {
    try {
      return storage.getItem(CUSTOMER_KEY);
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
          (!Object.hasOwn(row, "finalPrice") || row.finalPrice === null || validPrice(row.finalPrice)) &&
          (!Object.hasOwn(row, "checkoutId") || validCheckoutId(row.checkoutId)) &&
          (!Object.hasOwn(row, "checkoutServiceIds") ||
            (Array.isArray(row.checkoutServiceIds) && row.checkoutServiceIds.length > 0 &&
              row.checkoutServiceIds.length <= 20 && new Set(row.checkoutServiceIds).size === row.checkoutServiceIds.length &&
              row.checkoutServiceIds.every(id => string(id, 200)))) &&
          (!Object.hasOwn(row, "demoPayment") ||
            (row.demoPayment?.kind === "simulation" && validPrice(row.finalPrice) &&
              row.demoPayment.amount === row.finalPrice && string(row.demoPayment.id, 200) &&
              Number.isFinite(Date.parse(row.demoPayment.paidAt)) && ["Paid", "Completed"].includes(row.status))) &&
          (row.paymentStatus === undefined ||
            paymentStatuses.includes(row.paymentStatus)) &&
          (row.finalPrice === undefined ||
            row.finalPrice === null ||
            (Number.isFinite(row.finalPrice) && row.finalPrice >= 0)) &&
          (row.additionalInfo === undefined ||
            (typeof row.additionalInfo === "string" &&
              row.additionalInfo.length <= 2000)) &&
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
    const demo = demoSeller(service);
    const seller = demo || (service ? resolveSellerProfile(service.creatorId) : null);
    const creator = demo || people.find((item) => item.id === service?.creatorId);
    const reason = restriction(service, account, creator);
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
      creatorId: seller.id,
      serviceTitle: service.title,
      creatorName: seller.name,
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
  function restriction(service, account, creator) {
    try {
      const error = catalogError();
      if (error)
        return "Booking dinonaktifkan sementara karena katalog belum dapat diverifikasi. Coba muat ulang katalog.";
      return bookingRestriction(
        service,
        account,
        creator,
        bookingSeller(service),
        bookingSeller(service)?.id || service?.creatorId,
      );
    } catch {
      return "Data akun pemilik layanan belum dapat diverifikasi. Periksa penyimpanan demo lalu coba lagi.";
    }
  }
  return {
    getBookingRestriction(serviceId) {
      try {
        const service = catalog.find((row) => row.id === serviceId);
        return restriction(
          service,
          currentUser(),
          people.find((row) => row.id === service?.creatorId),
        );
      } catch {
        return "Data akun dan layanan belum dapat diverifikasi.";
      }
    },
    getBookingSellerProfile(serviceId) {
      try {
        return bookingSeller(catalog.find((row) => row.id === serviceId));
      } catch {
        return null;
      }
    },
    getDemoBookingSellerProfile(serviceId) {
      try {
        return demoSeller(catalog.find((row) => row.id === serviceId));
      } catch {
        return null;
      }
    },
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
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(publicBooking),
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
      return this.createBookings(
        [{ serviceId, input }],
        { confirmed, expectedUserId },
      )[0];
    },
    getBooking(id) {
      user();
      const booking = this.view().bookings.find((item) => item.id === id);
      if (!booking)
        throw new Error("Booking tidak ditemukan atau bukan milik akunmu.");
      return booking;
    },
    // All drafts validate before one envelope write. localStorage is not a cross-tab
    // transaction; stable checkout IDs allow read-back/retry after uncertain writes.
    submitCheckout(entries, { checkoutId, confirmed = false, expectedUserId } = {}) {
      const account = user();
      if (!confirmed || account.id !== expectedUserId)
        throw new Error("Sesi berubah atau permintaan belum dikonfirmasi. Tinjau checkout kembali.");
      if (!validCheckoutId(checkoutId) || !Array.isArray(entries) || !entries.length || entries.length > 20)
        throw new Error("Pilih 1–20 layanan dan gunakan referensi checkout yang valid.");
      const ids = entries.map(row => row?.serviceId);
      if (ids.some(id => !string(id, 200)) || new Set(ids).size !== ids.length)
        throw new Error("Pilihan layanan tidak valid atau berulang.");
      const data = writable();
      const previous = data.bookings.filter(row => row.checkoutId === checkoutId);
      if (previous.some(row => row.customerId !== account.id))
        throw new Error("Referensi checkout bukan milik akun aktif.");
      const cart = data.lists.find(row => row.userId === account.id)?.cart || [];
      const details = entries.map(({ serviceId, input }) => {
        const existing = previous.find(row => row.serviceId === serviceId);
        if (existing) {
          const expectedIds = existing.checkoutServiceIds || [];
          if (expectedIds.length !== ids.length || !ids.every(id => expectedIds.includes(id)) ||
            ["requirements", "description", "location", "requestedDate"].some(key =>
              existing[key] !== (key === "location" && existing.deliveryMode === "remote" ? "" : String(input?.[key] || "").trim())))
            throw new Error("Isi checkout berbeda dari pengajuan sebelumnya. Buka pesanan yang sudah tersimpan.");
          return existing;
        }
        if (!cart.includes(serviceId)) throw new Error("Layanan pilihan tidak ada pada keranjang akun aktif.");
        if (!input?.requestedDate) throw new Error("Tanggal yang diminta wajib diisi untuk setiap layanan checkout.");
        return { ...validate(serviceId, input || {}), id: `booking-${randomId()}`,
          customerId: account.id, status: "Requested", createdAt: now(),
          checkoutId, checkoutServiceIds: [...ids] };
      });
      if (previous.some(row => !ids.includes(row.serviceId)))
        throw new Error("Pilihan checkout berbeda dari pengajuan sebelumnya.");
      const fresh = details.filter(row => !previous.some(old => old.id === row.id));
      if (new Set(details.map(row => row.id)).size !== details.length ||
        fresh.some(row => data.bookings.some(old => old.id === row.id)))
        throw new Error("ID pesanan bertabrakan. Coba lagi dengan referensi baru.");
      if (user().id !== account.id) throw new Error("Sesi berubah. Checkout tidak disimpan.");
      if (fresh.length) {
        data.bookings.push(...fresh);
        const list = data.lists.find(row => row.userId === account.id);
        if (list) list.cart = list.cart.filter(id => !ids.includes(id));
        write(data);
      }
      return details.map(row => ({ ...row }));
    },
    confirmAcceptedPrice(bookingId, finalPrice) {
      const account = sellerAccount();
      const data = writable();
      const booking = data.bookings.find(row => row.id === bookingId && row.creatorId === account.sellerProfileId);
      if (!booking || booking.status !== "Accepted" || Object.hasOwn(booking, "finalPrice"))
        throw new Error("Harga hanya dapat dikonfirmasi untuk pesanan diterima milikmu yang belum memiliki harga akhir.");
      if (!validPrice(finalPrice)) throw new Error("Harga akhir harus rupiah bulat antara 0 dan 1 triliun.");
      booking.finalPrice = finalPrice;
      booking.updatedAt = now();
      write(data);
      return { ...booking };
    },
    simulatePayment(bookingId, { confirmed = false, expectedUserId, expectedFinalPrice } = {}) {
      const account = user();
      if (!allowDemoPayment()) throw new Error("Simulasi pembayaran tidak diaktifkan pada lingkungan ini.");
      if (!confirmed || account.id !== expectedUserId)
        throw new Error("Konfirmasi simulasi dari akun pemilik pesanan.");
      const data = writable();
      const booking = data.bookings.find(row => row.id === bookingId && row.customerId === account.id);
      if (!booking) throw new Error("Pesanan bukan milik akun aktif.");
      if (!validPrice(booking.finalPrice) || booking.finalPrice !== expectedFinalPrice)
        throw new Error("Harga akhir belum dikonfirmasi atau berubah. Tinjau kembali pesanan.");
      // Repeating an already-saved simulation returns its existing receipt.
      if (["Paid", "Completed"].includes(booking.status) && booking.demoPayment?.kind === "simulation")
        return { ...booking };
      if (booking.status !== "Accepted") throw new Error("Hanya pesanan Diterima Seller yang dapat disimulasikan pembayarannya.");
      if (!resolveSellerProfile(booking.creatorId)?.ownerUserId)
        throw new Error("Pemilik Seller Profile belum dapat diverifikasi.");
      booking.status = "Paid";
      booking.paymentStatus = "Paid";
      booking.paymentStatus = "Paid";
      booking.updatedAt = now();
      booking.demoPayment = { id: `simulation-${randomId()}`, kind: "simulation", amount: booking.finalPrice, paidAt: booking.updatedAt };
      write(data);
      return { ...booking };
    },
    // --- Phase 7: Seller Center / Admin access to the same booking records ---
    // The seller identity always comes from the Phase 5 session, never from input.
    sellerView() {
      const account = sellerAccount();
      const { data, error } = read();
      return {
        bookings: data.bookings
          .filter((booking) => booking.creatorId === account.sellerProfileId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(publicBooking),
        error,
      };
    },
    getActiveBookingCount(serviceId) {
      const account = sellerAccount();
      const { data, error } = read();
      if (error)
        throw new Error(
          `Jumlah booking aktif belum dapat diverifikasi. ${error}`,
        );
      if (
        data.bookings.some(
          (row) =>
            row.serviceId === serviceId &&
            row.creatorId !== account.sellerProfileId,
        )
      )
        throw new Error(
          "Asosiasi booking layanan belum dapat diverifikasi. Layanan tidak dihapus.",
        );
      return data.bookings.filter(
        (row) =>
          row.creatorId === account.sellerProfileId &&
          row.serviceId === serviceId &&
          ["Requested", "Accepted", "Paid", "In Progress"].includes(row.status),
      ).length;
    },
    respondToBooking(bookingId, action, { expectedStatus, reason, finalPrice } = {}) {
      const account = sellerAccount();
      const rule = Object.hasOwn(sellerActions, action)
        ? sellerActions[action]
        : null;
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
      if (note.length > 500) throw new Error("Alasan maksimal 500 karakter.");
      if (action === "accept") {
        const price = finalPrice === undefined ? booking.estimatedPrice : finalPrice;
        if (!validPrice(price)) throw new Error("Harga akhir harus rupiah bulat antara 0 dan 1 triliun.");
        booking.finalPrice = price;
      }
      booking.status = rule.to;
      booking.updatedAt = now();
      if (action === "accept") {
        // Preserve the quoted final price from the current seller action flow.
        booking.paymentStatus = "Unpaid";
      }
      if (action === "decline" && note) booking.declineReason = note;
      write(data);
      return publicBooking(booking);
    },
    beginPayment(bookingId, method, { expectedUserId } = {}) {
      const account = user();
      if (account.id !== expectedUserId)
        throw new Error("Sesi berubah. Muat ulang pesanan sebelum membayar.");
      if (!allowDemoPayment())
        throw new Error("Simulasi pembayaran tidak diaktifkan pada lingkungan ini.");
      const data = writable();
      const booking = data.bookings.find(
        (item) => item.id === bookingId && item.customerId === account.id,
      );
      if (!booking) throw new Error("Booking tidak ditemukan atau bukan milik akunmu.");
      if (booking.status !== "Accepted")
        throw new Error("Pembayaran hanya tersedia setelah Seller menerima pesanan.");
      if (!validPrice(booking.finalPrice))
        throw new Error("Harga akhir belum dikonfirmasi oleh Seller.");
      const paymentStatus = paymentStatusOf(booking);
      if (!["Unpaid", "Failed", "Expired"].includes(paymentStatus))
        throw new Error(paymentStatus === "Pending" ? "Pembayaran sedang diproses." : "Pembayaran untuk booking ini sudah selesai.");
      if (method !== "QRIS")
        throw new Error("Metode pembayaran demo yang tersedia hanya QRIS.");
      booking.paymentStatus = "Pending";
      booking.paymentMethod = method;
      booking.paymentAttemptedAt = now();
      booking.updatedAt = now();
      write(data);
      return publicBooking(booking);
    },
    createBookings(items, { confirmed = false, expectedUserId } = {}) {
      const account = user();
      if (!confirmed) throw new Error("Tinjau dan konfirmasi permintaan terlebih dahulu.");
      if (account.id !== expectedUserId)
        throw new Error("Sesi berubah. Tinjau ulang permintaan dari akun aktif.");
      if (!Array.isArray(items) || items.length < 1 || items.length > 20)
        throw new Error("Pilih 1–20 layanan untuk checkout.");
      const serviceIds = items.map((item) => item?.serviceId);
      if (new Set(serviceIds).size !== serviceIds.length)
        throw new Error("Layanan duplikat tidak dapat diajukan dua kali.");
      const details = items.map((item) => ({
        ...validate(item.serviceId, item.input || {}),
        additionalInfo: typeof item.input?.additionalInfo === "string"
          ? requiredText(item.input.additionalInfo, "Informasi tambahan", 0, 2000)
          : "",
      }));
      const data = writable();
      const createdAt = now();
      const bookings = details.map((detail) => ({
        ...detail,
        id: `booking-${randomId()}`,
        customerId: account.id,
        status: "Requested",
        paymentStatus: "Unpaid",
        finalPrice: null,
        createdAt,
      }));
      const ids = new Set(data.bookings.map((item) => item.id));
      for (const booking of bookings) {
        if (ids.has(booking.id)) throw new Error("ID booking bertabrakan. Silakan coba lagi.");
        ids.add(booking.id);
      }
      data.bookings.push(...bookings);
      const list = data.lists.find((item) => item.userId === account.id);
      if (list) list.cart = list.cart.filter((id) => !serviceIds.includes(id));
      write(data);
      return bookings.map(publicBooking);
    },
    adminView() {
      const account = currentUser();
      if (!account?.permissions?.includes(ADMIN_PERMISSION))
        throw new Error("Memerlukan izin admin internal.");
      const { data, error } = read();
      return {
        bookings: [...data.bookings]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(publicBooking),
        error,
      };
    },
  };
}
