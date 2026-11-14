
import { ADMIN_PERMISSION } from "../account/demoStore.js";

export const CUSTOMER_KEY = "digarsa.demo.customer.v1";

export const sellerActions = {
  accept: {
    from: ["Requested"],
    to: "Accepted",
    label: "diterima",
  },
  decline: {
    from: ["Requested"],
    to: "Declined",
    label: "ditolak",
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

const DELIVERY_STATUSES = [
  "NotSubmitted",
  "Submitted",
  "RevisionRequested",
  "Accepted",
  "AutoCompleted",
];

const ESCROW_STATUSES = ["HELD", "RELEASED"];

const MAX_REVISIONS = 3;
const REVIEW_HOURS = 72;
const COMMISSION_RATE = 0.05;

export const localToday = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

export const validPrice = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1e12;

const validCheckoutId = (value) =>
  typeof value === "string" &&
  /^checkout-[a-zA-Z0-9-]{1,100}$/.test(value);

const empty = () => ({
  version: 1,
  lists: [],
  bookings: [],
});

const string = (value, max = 5000) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max;

const validDate = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

const requiredText = (value, label, min, max) => {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < min || result.length > max) {
    throw new Error(`${label} harus ${min}–${max} karakter.`);
  }

  return result;
};

const makeDelivery = () => ({
  status: "NotSubmitted",
  revisionCount: 0,
  submittedAt: null,
  deadlineAt: null,
  completedAt: null,
  note: "",
  files: [],
  revisionNote: "",
  history: [],
});

const makeEscrow = (amount) => ({
  status: "HELD",
  amount,
  commission: Math.round(amount * COMMISSION_RATE),
  sellerNet: amount - Math.round(amount * COMMISSION_RATE),
  heldAt: null,
  releasedAt: null,
});

const validDelivery = (delivery) => {
  if (!delivery || typeof delivery !== "object") return false;

  if (!DELIVERY_STATUSES.includes(delivery.status)) return false;

  if (
    !Number.isInteger(delivery.revisionCount) ||
    delivery.revisionCount < 0 ||
    delivery.revisionCount > MAX_REVISIONS
  ) {
    return false;
  }

  if (
    !["submittedAt", "deadlineAt", "completedAt"].every(
      (key) =>
        delivery[key] === null ||
        (typeof delivery[key] === "string" &&
          Number.isFinite(Date.parse(delivery[key]))),
    )
  ) {
    return false;
  }

  if (
    typeof delivery.note !== "string" ||
    delivery.note.length > 3000 ||
    typeof delivery.revisionNote !== "string" ||
    delivery.revisionNote.length > 1000
  ) {
    return false;
  }

  if (!Array.isArray(delivery.files) || delivery.files.length > 20) {
    return false;
  }

  if (
    !delivery.files.every(
      (file) =>
        file &&
        typeof file.name === "string" &&
        file.name.length <= 255 &&
        (file.url === undefined ||
          (typeof file.url === "string" && file.url.length <= 2000)),
    )
  ) {
    return false;
  }

  return true;
};

const validEscrow = (escrow, finalPrice) => {
  if (!escrow || typeof escrow !== "object") return false;

  return (
    ESCROW_STATUSES.includes(escrow.status) &&
    escrow.amount === finalPrice &&
    validPrice(escrow.amount) &&
    validPrice(escrow.commission) &&
    validPrice(escrow.sellerNet) &&
    escrow.commission + escrow.sellerNet === escrow.amount &&
    (escrow.heldAt === null ||
      (typeof escrow.heldAt === "string" &&
        Number.isFinite(Date.parse(escrow.heldAt)))) &&
    (escrow.releasedAt === null ||
      (typeof escrow.releasedAt === "string" &&
        Number.isFinite(Date.parse(escrow.releasedAt))))
  );
};

export function bookingRestriction(
  service,
  user,
  creator,
  sellerProfile,
  bookingSellerId = service?.creatorId,
) {
  if (!service) return "Service not found.";

  if (
    user &&
    (bookingSellerId === user.sellerProfileId ||
      creator?.ownerUserId === user.id)
  ) {
    return "You cannot book your own service.";
  }

  if (service.availability !== "Open") {
    return "This service is fully booked or unavailable.";
  }

  if (!["remote", "onsite"].includes(service.delivery?.toLowerCase())) {
    return "Work mode belum didukung. Booking belum tersedia untuk services ini.";
  }

  if (!creator) return "Service information is incomplete.";

  if (
    !sellerProfile ||
    sellerProfile.id !== bookingSellerId ||
    !sellerProfile.ownerUserId
  ) {
    return "Booking is unavailable: this service does not have a Seller Profile with a valid owner account.";
  }

  if (sellerProfile.ownerUserId === user?.id) {
    return "You cannot book your own service.";
  }

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

      if (
        !fixture?.id ||
        !fixture.ownerUserId ||
        fixture.demoFixture !== true
      ) {
        return null;
      }

      const actual = resolveSellerProfile(fixture.id);

      return actual?.ownerUserId === fixture.ownerUserId
        ? { ...actual, demoFixture: true }
        : null;
    } catch {
      return null;
    }
  }

  function bookingSeller(service) {
    return (
      demoSeller(service) ||
      (service ? resolveSellerProfile(service.creatorId) : null)
    );
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

    if (value === null) {
      return { data: empty(), error: "" };
    }

    try {
      const parsed = JSON.parse(value);

      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.lists) ||
        !Array.isArray(parsed.bookings)
      ) {
        throw new Error();
      }

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

      const bookings = parsed.bookings
        .filter((row) => {
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
            (!Object.hasOwn(row, "finalPrice") ||
              validPrice(row.finalPrice)) &&
            (!Object.hasOwn(row, "checkoutId") ||
              validCheckoutId(row.checkoutId)) &&
            (!Object.hasOwn(row, "checkoutServiceIds") ||
              (Array.isArray(row.checkoutServiceIds) &&
                row.checkoutServiceIds.length > 0 &&
                row.checkoutServiceIds.length <= 20 &&
                new Set(row.checkoutServiceIds).size ===
                  row.checkoutServiceIds.length &&
                row.checkoutServiceIds.every((id) => string(id, 200)))) &&
            (!Object.hasOwn(row, "demoPayment") ||
              (row.demoPayment?.kind === "simulation" &&
                validPrice(row.finalPrice) &&
                row.demoPayment.amount === row.finalPrice &&
                string(row.demoPayment.id, 200) &&
                (!row.demoPayment.status ||
                  ["Unpaid", "Pending", "Paid", "Failed", "Expired"].includes(
                    row.demoPayment.status,
                  )) &&
                Number.isFinite(Date.parse(row.demoPayment.paidAt)) &&
                ["Paid", "Completed"].includes(row.status))) &&
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
            Number.isFinite(Date.parse(row.createdAt)) &&
            (!row.delivery || validDelivery(row.delivery)) &&
            (!row.escrow ||
              (validPrice(row.finalPrice) &&
                validEscrow(row.escrow, row.finalPrice)));

          if (!valid) bad = true;
          else ids.add(row.id);

          return valid;
        })
        .map((row) => ({
          ...row,
          delivery: row.delivery || makeDelivery(),
          escrow: row.escrow || null,
        }));

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

    if (!account?.id || !account.capabilities?.includes("buyer")) {
      throw new Error("Log in ke akun Digarsa untuk melanjutkan.");
    }

    return account;
  }

  function sellerAccount() {
    const account = currentUser();

    if (
      !account?.id ||
      !account.capabilities?.includes("seller") ||
      !account.sellerProfileId
    ) {
      throw new Error("Seller Center requires an active Seller Profile.");
    }

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
        "Data was not saved. Browser storage is unavailable or full.",
      );
    }

    listeners.forEach((listener) => listener());
  }

  function listChange(kind, serviceId, add) {
    const account = user();
    const data = writable();

    if (add && !catalog.some((service) => service.id === serviceId)) {
      throw new Error("Service not found.");
    }

    let list = data.lists.find((item) => item.userId === account.id);

    if (!list) {
      list = {
        userId: account.id,
        favorites: [],
        cart: [],
      };

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
    const seller =
      demo || (service ? resolveSellerProfile(service.creatorId) : null);
    const creator = demo || people.find((item) => item.id === service?.creatorId);
    const reason = restriction(service, account, creator);

    if (reason) throw new Error(reason);

    if (!creator || !Number.isFinite(service.price) || service.price < 0) {
      throw new Error("Service information is incomplete.");
    }

    const deliveryMode = service.delivery.toLowerCase();
    const requestedDate =
      typeof input.requestedDate === "string" ? input.requestedDate : "";

    if (
      (deliveryMode === "onsite" || service.requiresSchedule === true) &&
      !requestedDate
    ) {
      throw new Error("A requested date is required.");
    }

    if (requestedDate && (!validDate(requestedDate) || requestedDate < today())) {
      throw new Error("Select a date hari ini atau setelahnya yang valid.");
    }

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
        "Project requirements",
        10,
        2000,
      ),
      description: requiredText(
        input.description,
        "Project description",
        20,
        5000,
      ),
    };
  }

  function restriction(service, account, creator) {
    try {
      const error = catalogError();

      if (error) {
        return "Booking is temporarily disabled because the catalog could not be verified. Try reloading the catalog.";
      }

      const seller = bookingSeller(service);

      return bookingRestriction(
        service,
        account,
        creator,
        seller,
        seller?.id || service?.creatorId,
      );
    } catch {
      return "The service owner's account could not be verified. Check demo storage and try again.";
    }
  }

  function findSellerBooking(data, bookingId, account) {
    const booking = data.bookings.find(
      (item) =>
        item.id === bookingId &&
        item.creatorId === account.sellerProfileId,
    );

    if (!booking) {
      throw new Error(
        "Booking tidak ditemukan atau bukan untuk Seller Profile-mu.",
      );
    }

    return booking;
  }

  function findBuyerBooking(data, bookingId, account) {
    const booking = data.bookings.find(
      (item) => item.id === bookingId && item.customerId === account.id,
    );

    if (!booking) {
      throw new Error("Booking tidak ditemukan atau bukan milik akunmu.");
    }

    return booking;
  }

  function releaseEscrow(booking, timestamp) {
    if (!booking.escrow || booking.escrow.status !== "HELD") {
      throw new Error("Dana escrow tidak tersedia atau sudah pernah dicairkan.");
    }

    booking.escrow.status = "RELEASED";
    booking.escrow.releasedAt = timestamp;

    booking.delivery.completedAt = timestamp;
    booking.updatedAt = timestamp;
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
        return "Account and service data could not be verified.";
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

      if (!account) {
        return {
          favorites: [],
          cart: [],
          bookings: [],
          error: "",
        };
      }

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

      if (!confirmed) {
        throw new Error("Review dan konfirmasi permintaan terlebih dahulu.");
      }

      if (account.id !== expectedUserId) {
        throw new Error(
          "Your session changed. Review the request again from the active account.",
        );
      }

      const details = validate(serviceId, input);
      const data = writable();

      const booking = {
        ...details,
        id: `booking-${randomId()}`,
        customerId: account.id,
        status: "Requested",
        delivery: makeDelivery(),
        escrow: null,
        createdAt: now(),
      };

      if (data.bookings.some((item) => item.id === booking.id)) {
        throw new Error("Booking ID collision. Please try again.");
      }

      data.bookings.push(booking);

      const list = data.lists.find((item) => item.userId === account.id);

      if (list) {
        list.cart = list.cart.filter((id) => id !== serviceId);
      }

      write(data);

      return booking;
    },

    getBooking(id) {
      const account = user();
      const data = writable();
      const booking = findBuyerBooking(data, id, account);

      return { ...booking };
    },

    submitCheckout(
      entries,
      { checkoutId, confirmed = false, expectedUserId } = {},
    ) {
      const account = user();

      if (!confirmed || account.id !== expectedUserId) {
        throw new Error(
          "Sesi berubah atau permintaan belum dikonfirmasi. Review checkout kembali.",
        );
      }

      if (
        !validCheckoutId(checkoutId) ||
        !Array.isArray(entries) ||
        !entries.length ||
        entries.length > 20
      ) {
        throw new Error(
          "Select 1–20 services and use a valid checkout reference.",
        );
      }

      const ids = entries.map((row) => row?.serviceId);

      if (
        ids.some((id) => !string(id, 200)) ||
        new Set(ids).size !== ids.length
      ) {
        throw new Error("The selected services are invalid or duplicated.");
      }

      const data = writable();
      const previous = data.bookings.filter(
        (row) => row.checkoutId === checkoutId,
      );

      if (previous.some((row) => row.customerId !== account.id)) {
        throw new Error("Referensi checkout bukan milik akun aktif.");
      }

      const cart =
        data.lists.find((row) => row.userId === account.id)?.cart || [];

      const details = entries.map(({ serviceId, input }) => {
        const existing = previous.find(
          (row) => row.serviceId === serviceId,
        );

        if (existing) {
          const expectedIds = existing.checkoutServiceIds || [];

          if (
            expectedIds.length !== ids.length ||
            !ids.every((id) => expectedIds.includes(id)) ||
            ["requirements", "description", "location", "requestedDate"].some(
              (key) =>
                existing[key] !==
                (key === "location" && existing.deliveryMode === "remote"
                  ? ""
                  : String(input?.[key] || "").trim()),
            )
          ) {
            throw new Error(
              "Checkout details differ from the earlier request. Open the saved order.",
            );
          }

          return existing;
        }

        if (!cart.includes(serviceId)) {
          throw new Error(
            "Service pilihan tidak ada pada keranjang akun aktif.",
          );
        }

        if (!input?.requestedDate) {
          throw new Error(
            "A requested date is required for every service in checkout.",
          );
        }

        return {
          ...validate(serviceId, input || {}),
          id: `booking-${randomId()}`,
          customerId: account.id,
          status: "Requested",
          delivery: makeDelivery(),
          escrow: null,
          createdAt: now(),
          checkoutId,
          checkoutServiceIds: [...ids],
        };
      });

      if (previous.some((row) => !ids.includes(row.serviceId))) {
        throw new Error(
          "Checkout selection differs from the earlier request.",
        );
      }

      const fresh = details.filter(
        (row) => !previous.some((old) => old.id === row.id),
      );

      if (
        new Set(details.map((row) => row.id)).size !== details.length ||
        fresh.some((row) =>
          data.bookings.some((old) => old.id === row.id),
        )
      ) {
        throw new Error("Order ID collision. Try again with a new reference.");
      }

      if (user().id !== account.id) {
        throw new Error("Sesi berubah. Checkout tidak disimpan.");
      }

      if (fresh.length) {
        data.bookings.push(...fresh);

        const list = data.lists.find(
          (row) => row.userId === account.id,
        );

        if (list) {
          list.cart = list.cart.filter((id) => !ids.includes(id));
        }

        write(data);
      }

      return details.map((row) => ({ ...row }));
    },

    confirmAcceptedPrice(bookingId, finalPrice) {
      const account = sellerAccount();
      const data = writable();

      const booking = findSellerBooking(data, bookingId, account);

      if (
        booking.status !== "Accepted" ||
        Object.hasOwn(booking, "finalPrice")
      ) {
        throw new Error(
          "You can confirm the final price only for your accepted orders that do not already have one.",
        );
      }

      if (!validPrice(finalPrice)) {
        throw new Error(
          "The final price must be a whole IDR amount between 0 and 1 trillion.",
        );
      }

      booking.finalPrice = finalPrice;
      booking.updatedAt = now();

      write(data);

      return { ...booking };
    },

    simulatePayment(
      bookingId,
      {
        confirmed = false,
        expectedUserId,
        expectedFinalPrice,
        method = "QRIS (demo)",
      } = {},
    ) {
      const account = user();

      if (!allowDemoPayment()) {
        throw new Error(
          "Simulasi pembayaran tidak diaktifkan pada lingkungan ini.",
        );
      }

      if (!confirmed || account.id !== expectedUserId) {
        throw new Error(
          "Confirm the simulation with the account that owns this order.",
        );
      }

      const data = writable();
      const booking = findBuyerBooking(data, bookingId, account);

      if (!validPrice(booking.finalPrice) ||
        booking.finalPrice !== expectedFinalPrice) {
        throw new Error(
          "Harga akhir belum dikonfirmasi atau berubah. Review kembali orders.",
        );
      }

      // Pembayaran yang sudah tersimpan tidak dibuat ulang.
      if (
        booking.status === "Paid" &&
        booking.demoPayment?.status === "Paid"
      ) {
        return { ...booking };
      }

      if (booking.status !== "Accepted") {
        throw new Error(
          "Hanya orders Accepted yang dapat disimulasikan pembayarannya.",
        );
      }

      if (!resolveSellerProfile(booking.creatorId)?.ownerUserId) {
        throw new Error("Pemilik Seller Profile belum dapat diverifikasi.");
      }

      const timestamp = now();

      booking.status = "Paid";
      booking.updatedAt = timestamp;
      booking.delivery = booking.delivery || makeDelivery();

      booking.demoPayment = {
        id: `DG-${booking.id}`,
        kind: "simulation",
        status: "Paid",
        amount: booking.finalPrice,
        method: requiredText(method, "Metode pembayaran", 2, 50),
        paidAt: timestamp,
      };

      // Dana ditahan terlebih dahulu. Belum masuk saldo tersedia Seller.
      booking.escrow = {
        ...makeEscrow(booking.finalPrice),
        heldAt: timestamp,
      };

      write(data);

      return { ...booking };
    },

    // =========================================================
    // SELLER: mengirim hasil pekerjaan atau hasil revisi
    // =========================================================
    submitDelivery(
      bookingId,
      {
        note,
        files = [],
        expectedStatus,
      } = {},
    ) {
      const account = sellerAccount();
      const data = writable();
      const booking = findSellerBooking(data, bookingId, account);

      if (booking.status !== "Paid") {
        throw new Error(
          "Hasil pekerjaan hanya dapat dikirim setelah pembayaran terkonfirmasi.",
        );
      }

      if (expectedStatus && booking.delivery?.status !== expectedStatus) {
        throw new Error(
          "Status pengiriman sudah berubah. Muat ulang halaman.",
        );
      }

      const delivery = booking.delivery || makeDelivery();

      if (
        !["NotSubmitted", "RevisionRequested"].includes(delivery.status)
      ) {
        throw new Error(
          "Hasil pekerjaan sudah dikirim atau pesanan tidak dapat dikirim ulang.",
        );
      }

      if (
        delivery.status === "RevisionRequested" &&
        delivery.revisionCount >= MAX_REVISIONS
      ) {
        throw new Error(
          `Batas revisi maksimal ${MAX_REVISIONS} kali telah tercapai.`,
        );
      }

      if (!Array.isArray(files) || files.length > 20) {
        throw new Error("Maksimal 20 lampiran.");
      }

      const safeFiles = files.map((file) => {
        if (!file || typeof file !== "object") {
          throw new Error("Data lampiran tidak valid.");
        }

        return {
          name: requiredText(file.name, "Nama file", 1, 255),
          ...(typeof file.url === "string" && file.url.length <= 2000
            ? { url: file.url }
            : {}),
        };
      });

      const timestamp = now();
      const deadline = new Date(
        Date.parse(timestamp) + REVIEW_HOURS * 60 * 60 * 1000,
      ).toISOString();

      booking.delivery = {
        ...delivery,
        status: "Submitted",
        note: requiredText(note, "Catatan hasil pekerjaan", 5, 3000),
        files: safeFiles,
        submittedAt: timestamp,
        deadlineAt: deadline,
        revisionNote: "",
        history: [
          ...(delivery.history || []),
          {
            action:
              delivery.status === "RevisionRequested"
                ? "Resubmitted"
                : "Submitted",
            at: timestamp,
            note: note.trim(),
            files: safeFiles,
          },
        ],
      };

      booking.updatedAt = timestamp;

      write(data);

      return { ...booking };
    },

    // =========================================================
    // BUYER: meminta revisi hasil pekerjaan
    // =========================================================
    requestDeliveryRevision(
      bookingId,
      revisionNote,
      { expectedStatus = "Submitted" } = {},
    ) {
      const account = user();
      const data = writable();
      const booking = findBuyerBooking(data, bookingId, account);

      if (booking.status !== "Paid") {
        throw new Error(
          "Revisi hanya dapat diminta pada pesanan yang sudah dibayar.",
        );
      }

      const delivery = booking.delivery || makeDelivery();

      if (
        delivery.status !== "Submitted" ||
        delivery.status !== expectedStatus
      ) {
        throw new Error(
          "Hasil pekerjaan belum tersedia atau statusnya sudah berubah.",
        );
      }

      if (delivery.revisionCount >= MAX_REVISIONS) {
        throw new Error(
          `Batas revisi maksimal ${MAX_REVISIONS} kali telah tercapai.`,
        );
      }

      const note = requiredText(
        revisionNote,
        "Catatan revisi",
        5,
        1000,
      );

      const timestamp = now();

      booking.delivery = {
        ...delivery,
        status: "RevisionRequested",
        revisionCount: delivery.revisionCount + 1,
        revisionNote: note,
        deadlineAt: null,
        history: [
          ...(delivery.history || []),
          {
            action: "RevisionRequested",
            at: timestamp,
            note,
          },
        ],
      };

      booking.updatedAt = timestamp;

      write(data);

      return { ...booking };
    },

    // =========================================================
    // BUYER: menerima hasil pekerjaan dan melepas escrow
    // =========================================================
    acceptDelivery(bookingId, { expectedStatus = "Submitted" } = {}) {
      const account = user();
      const data = writable();
      const booking = findBuyerBooking(data, bookingId, account);

      if (booking.status !== "Paid") {
        throw new Error("Pesanan ini tidak berada dalam status pembayaran.");
      }

      const delivery = booking.delivery || makeDelivery();

      if (
        delivery.status !== "Submitted" ||
        delivery.status !== expectedStatus
      ) {
        throw new Error(
          "Hasil pekerjaan belum dikirim atau statusnya sudah berubah.",
        );
      }

      if (!booking.escrow || booking.escrow.status !== "HELD") {
        throw new Error(
          "Dana escrow tidak tersedia atau sudah pernah dicairkan.",
        );
      }

      const timestamp = now();

      booking.delivery = {
        ...delivery,
        status: "Accepted",
        deadlineAt: null,
        history: [
          ...(delivery.history || []),
          {
            action: "Accepted",
            at: timestamp,
          },
        ],
      };

      booking.status = "Completed";

      releaseEscrow(booking, timestamp);

      write(data);

      return { ...booking };
    },

    // =========================================================
    // AUTO COMPLETE: berjalan ketika fungsi dipanggil oleh aplikasi
    // =========================================================
    // Berjalan untuk Buyer pemilik order maupun Seller pemilik order, supaya
    // dana tetap cair walau Buyer tidak membuka aplikasi lagi.
    processAutoComplete() {
      const account = currentUser();

      if (!account?.id) return { completed: [], count: 0 };

      const data = writable();
      const timestamp = now();
      const currentTime = Date.parse(timestamp);
      let changed = false;
      const completed = [];

      data.bookings.forEach((booking) => {
        const owned =
          booking.customerId === account.id ||
          (account.sellerProfileId &&
            booking.creatorId === account.sellerProfileId);

        if (!owned) return;
        if (booking.status !== "Paid") return;

        const delivery = booking.delivery || makeDelivery();

        if (delivery.status !== "Submitted" || !delivery.deadlineAt) {
          return;
        }

        if (Date.parse(delivery.deadlineAt) > currentTime) {
          return;
        }

        if (!booking.escrow || booking.escrow.status !== "HELD") {
          return;
        }

        booking.delivery = {
          ...delivery,
          status: "AutoCompleted",
          deadlineAt: null,
          history: [
            ...(delivery.history || []),
            {
              action: "AutoCompleted",
              at: timestamp,
              note: "Pesanan diselesaikan otomatis setelah 72 jam tanpa tanggapan Buyer.",
            },
          ],
        };

        booking.status = "Completed";

        releaseEscrow(booking, timestamp);

        completed.push(booking.id);
        changed = true;
      });

      if (changed) {
        write(data);
      }

      return {
        completed,
        count: completed.length,
      };
    },

    // =========================================================
    // SELLER VIEW
    // =========================================================
    sellerView() {
      const account = sellerAccount();
      const { data, error } = read();

      return {
        bookings: data.bookings
          .filter(
            (booking) => booking.creatorId === account.sellerProfileId,
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        error,
      };
    },

    getActiveBookingCount(serviceId) {
      const account = sellerAccount();
      const { data, error } = read();

      if (error) {
        throw new Error(
          `The number of active bookings could not be verified. ${error}`,
        );
      }

      if (
        data.bookings.some(
          (row) =>
            row.serviceId === serviceId &&
            row.creatorId !== account.sellerProfileId,
        )
      ) {
        throw new Error(
          "Asosiasi booking services belum dapat diverifikasi. Service tidak dihapus.",
        );
      }

      return data.bookings.filter(
        (row) =>
          row.creatorId === account.sellerProfileId &&
          row.serviceId === serviceId &&
          ["Requested", "Accepted", "Paid"].includes(row.status),
      ).length;
    },

    respondToBooking(
      bookingId,
      action,
      { expectedStatus, reason, finalPrice } = {},
    ) {
      const account = sellerAccount();

      const rule = Object.hasOwn(sellerActions, action)
        ? sellerActions[action]
        : null;

      if (!rule) {
        throw new Error("Aksi booking tidak dikenal.");
      }

      const data = writable();
      const booking = findSellerBooking(data, bookingId, account);

      if (expectedStatus && booking.status !== expectedStatus) {
        throw new Error(
          "Status booking sudah berubah. Muat ulang dan tinjau kembali.",
        );
      }

      if (!rule.from.includes(booking.status)) {
        throw new Error(
          `Booking berstatus ${booking.status} tidak dapat ${rule.label}.`,
        );
      }

      const note = typeof reason === "string" ? reason.trim() : "";

      if (note.length > 500) {
        throw new Error("Alasan maksimal 500 karakter.");
      }

      if (action === "accept") {
        const price =
          finalPrice === undefined ? booking.estimatedPrice : finalPrice;

        if (!validPrice(price)) {
          throw new Error(
            "The final price must be a whole IDR amount between 0 and 1 trillion.",
          );
        }

        booking.finalPrice = price;
      }

      booking.status = rule.to;
      booking.updatedAt = now();

      if (action === "decline" && note) {
        booking.declineReason = note;
      }

      write(data);

      return { ...booking };
    },

    // =========================================================
    // ADMIN VIEW
    // =========================================================
    adminView() {
      const account = currentUser();

      if (!account?.permissions?.includes(ADMIN_PERMISSION)) {
        throw new Error("Memerlukan izin admin internal.");
      }

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