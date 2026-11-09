export const REVIEW_KEY = "digarsa.demo.reviews.v1";
export const reviewFields = Object.freeze([
  "id",
  "booking_id",
  "service_id",
  "seller_profile_id",
  "customer_user_id",
  "reviewer_name",
  "service_title",
  "seller_name",
  "rating",
  "comment",
  "created_at",
]);
export class ReviewError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new ReviewError(code, message);
};
const id = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value);
const time = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const exact = (value, keys) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const text = (value, min, max) =>
  typeof value === "string" &&
  value === value.trim() &&
  value.length <= max &&
  value.replace(/[\s\u200B-\u200D\uFEFF]/g, "").length >= min &&
  !Array.from(value).some(
    (char) =>
      char.charCodeAt(0) === 127 ||
      (char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0))),
  );
const denied = () =>
  fail(
    "NOT_FOUND_OR_FORBIDDEN",
    "Booking atau ulasan tidak ditemukan untuk akunmu.",
  );

export function summarizeReviews(rows) {
  const total = rows.length;
  return {
    total,
    average: total
      ? rows.reduce((sum, row) => sum + row.rating, 0) / total
      : null,
    distribution: [5, 4, 3, 2, 1].map((rating) => {
      const count = rows.filter((row) => row.rating === rating).length;
      return { rating, count, percentage: total ? (count / total) * 100 : 0 };
    }),
  };
}

// Records become public only through the explicit sanitized publication projection.
const published = ({
  id,
  service_id,
  seller_profile_id,
  reviewer_name,
  service_title,
  seller_name,
  rating,
  comment,
  created_at,
  updated_at,
}) => ({
  id,
  service_id,
  seller_profile_id,
  reviewer_name,
  service_title,
  seller_name,
  rating,
  comment,
  created_at,
  ...(updated_at ? { updated_at } : {}),
  verified: true,
});

export function createReviewStore({
  storage,
  currentUser,
  listBookings,
  resolveSellerProfile,
  resolveService,
  randomId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  const listeners = new Set();
  function source(reader, ...args) {
    try {
      return reader(...args);
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      fail(
        "DEPENDENCY_UNAVAILABLE",
        "Data akun, layanan, atau booking demo belum dapat diverifikasi.",
      );
    }
  }
  function account() {
    const user = source(currentUser);
    if (!user || !id(user.id) || !user.capabilities?.includes("buyer"))
      fail("UNAUTHENTICATED", "Masuk untuk menulis ulasan.");
    return user;
  }
  function load() {
    let raw;
    try {
      raw = storage.getItem(REVIEW_KEY);
    } catch {
      fail("STORAGE_UNAVAILABLE", "Penyimpanan ulasan tidak tersedia.");
    }
    if (raw === null) return { version: 1, reviews: [] };
    let db;
    try {
      db = JSON.parse(raw);
    } catch {
      fail(
        "STORAGE_CORRUPT",
        "Data ulasan rusak. Data tidak ditimpa otomatis.",
      );
    }
    const corrupt = () =>
      fail(
        "STORAGE_CORRUPT",
        "Data ulasan rusak atau tidak kompatibel. Perubahan diblokir agar data tidak tertimpa.",
      );
    if (
      !exact(db, ["version", "reviews"]) ||
      db.version !== 1 ||
      !Array.isArray(db.reviews)
    )
      corrupt();
    const ids = new Set();
    const bookings = new Set();
    for (const row of db.reviews) {
      if (
        !exact(
          row,
          row && Object.hasOwn(row, "updated_at")
            ? [...reviewFields, "updated_at"]
            : reviewFields,
        ) ||
        (Object.hasOwn(row, "updated_at") && (!time(row.updated_at) || row.updated_at < row.created_at)) ||
        ![
          "id",
          "booking_id",
          "service_id",
          "seller_profile_id",
          "customer_user_id",
        ].every((key) => id(row[key])) ||
        !Number.isInteger(row.rating) ||
        row.rating < 1 ||
        row.rating > 5 ||
        !text(row.comment, 10, 2000) ||
        !["reviewer_name", "service_title", "seller_name"].every((key) =>
          text(row[key], 1, 200),
        ) ||
        !time(row.created_at) ||
        ids.has(row.id) ||
        bookings.has(row.booking_id)
      )
        corrupt();
      ids.add(row.id);
      bookings.add(row.booking_id);
      // Public sources can validate seller/service identity without exposing any
      // private booking records to anonymous readers. Missing services are archives.
      const profile = source(resolveSellerProfile, row.seller_profile_id);
      if (!profile)
        fail(
          "INVALID_CONTEXT",
          "Pemilik Seller Profile pada ulasan belum dapat diverifikasi.",
        );
      if (
        profile.id !== row.seller_profile_id ||
        !id(profile.owner_user_id) ||
        profile.owner_user_id === row.customer_user_id
      )
        corrupt();
      const service = source(resolveService, row.service_id);
      if (
        service &&
        (service.id !== row.service_id ||
          service.seller_profile_id !== row.seller_profile_id)
      )
        corrupt();
    }
    return db;
  }
  function save(db) {
    try {
      storage.setItem(REVIEW_KEY, JSON.stringify(db));
    } catch {
      fail(
        "STORAGE_UNAVAILABLE",
        "Ulasan belum tersimpan. Penyimpanan browser tidak tersedia atau penuh.",
      );
    }
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* Saved writes remain successful. */
      }
    });
  }
  function bookings(user) {
    const rows = source(listBookings);
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || row.customer_user_id !== user.id)
    )
      fail("DEPENDENCY_UNAVAILABLE", "Data booking tidak sesuai akun aktif.");
    return rows;
  }
  function ownedBooking(bookingId, user) {
    if (!id(bookingId)) fail("INVALID_INPUT", "ID booking tidak valid.");
    const booking = bookings(user).find((row) => row.id === bookingId);
    if (!booking) denied();
    return booking;
  }
  function association(booking, user) {
    if (
      ![
        booking.id,
        booking.service_id,
        booking.seller_profile_id,
        booking.customer_user_id,
      ].every(id) ||
      booking.customer_user_id !== user.id
    )
      denied();
    const seller = source(resolveSellerProfile, booking.seller_profile_id);
    if (
      !seller ||
      seller.id !== booking.seller_profile_id ||
      !id(seller.owner_user_id)
    )
      fail(
        "INVALID_CONTEXT",
        "Pemilik Seller Profile belum dapat diverifikasi. Kreator editorial tidak menerima ulasan terverifikasi.",
      );
    if (seller.owner_user_id === user.id || user.sellerProfileId === seller.id)
      fail("SELF_REVIEW", "Kamu tidak dapat mengulas layanan milikmu sendiri.");
    const service = source(resolveService, booking.service_id);
    if (
      service &&
      (service.id !== booking.service_id ||
        service.seller_profile_id !== booking.seller_profile_id)
    )
      fail(
        "INVALID_CONTEXT",
        "Layanan dan Seller Profile tidak cocok dengan booking.",
      );
    return seller;
  }
  function eligible(booking, db, user) {
    const review = db.reviews.find((row) => row.booking_id === booking.id);
    if (
      review &&
      (review.customer_user_id !== booking.customer_user_id ||
        review.service_id !== booking.service_id ||
        review.seller_profile_id !== booking.seller_profile_id)
    )
      fail(
        "STORAGE_CORRUPT",
        "Asosiasi ulasan dan booking tersimpan tidak cocok.",
      );
    let reason = "";
    if (booking.status !== "Completed")
      reason = "Ulasan hanya tersedia setelah booking berstatus Completed.";
    else if (review) reason = "Booking ini sudah memiliki ulasan.";
    else {
      try {
        association(booking, user);
      } catch (error) {
        if (["INVALID_CONTEXT", "SELF_REVIEW"].includes(error.code))
          reason = error.message;
        else throw error;
      }
    }
    return {
      booking: { ...booking },
      eligible: !reason,
      reason,
      review: review ? { ...review } : null,
    };
  }
  function filter(rows, input = {}) {
    if (
      !input ||
      Array.isArray(input) ||
      typeof input !== "object" ||
      Object.keys(input).some(
        (key) => !["service_id", "seller_profile_id"].includes(key),
      ) ||
      Object.values(input).some((value) => !id(value))
    )
      fail("INVALID_INPUT", "Filter ulasan tidak valid.");
    return rows.filter(
      (row) =>
        (!input.service_id || row.service_id === input.service_id) &&
        (!input.seller_profile_id ||
          row.seller_profile_id === input.seller_profile_id),
    );
  }
  function verifyOwn(row, user) {
    const booking = ownedBooking(row.booking_id, user);
    if (
      booking.status !== "Completed" ||
      row.service_id !== booking.service_id ||
      row.seller_profile_id !== booking.seller_profile_id
    )
      fail(
        "INVALID_CONTEXT",
        "Asosiasi ulasan tidak cocok dengan booking selesai.",
      );
    association(booking, user);
    return row;
  }
  const api = {
    subscribe(listener) {
      if (typeof listener !== "function")
        fail("INVALID_INPUT", "Subscriber ulasan harus berupa fungsi.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listPublic(input = {}) {
      // Public records contain no booking ID, account ID, contact info, or brief.
      return filter(load().reviews, input)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(published);
    },
    getSummary(input = {}) {
      return summarizeReviews(api.listPublic(input));
    },
    listOwn() {
      const user = account();
      return load()
        .reviews.filter((row) => row.customer_user_id === user.id)
        .map((row) => ({ ...verifyOwn(row, user) }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    listCompletedBookings() {
      const user = account();
      const db = load();
      return bookings(user)
        .filter((row) => row.status === "Completed")
        .map((row) => eligible(row, db, user));
    },
    getEligibility(booking_id) {
      const user = account();
      const db = load();
      return eligible(ownedBooking(booking_id, user), db, user);
    },
    submit(input, { expected_user_id } = {}) {
      const user = account();
      if (expected_user_id !== user.id)
        fail(
          "SESSION_CHANGED",
          "Sesi berubah. Buka kembali formulir dari akun aktif.",
        );
      if (
        !exact(input, [
          "booking_id",
          "service_id",
          "seller_profile_id",
          "rating",
          "comment",
        ]) ||
        !Number.isInteger(input.rating) ||
        input.rating < 1 ||
        input.rating > 5 ||
        typeof input.comment !== "string" ||
        !text(input.comment.trim(), 10, 2000)
      )
        fail(
          "INVALID_INPUT",
          "Pilih 1–5 bintang dan tulis ulasan 10–2000 karakter yang valid.",
        );
      const db = load();
      const booking = ownedBooking(input.booking_id, user);
      if (booking.status !== "Completed")
        fail(
          "INELIGIBLE",
          "Hanya booking Completed yang dapat diulas. Pembayaran dan penyelesaian tidak diproses di sini.",
        );
      association(booking, user);
      if (
        input.service_id !== booking.service_id ||
        input.seller_profile_id !== booking.seller_profile_id
      )
        fail(
          "INVALID_CONTEXT",
          "Layanan dan kreator harus cocok dengan booking.",
        );
      if (db.reviews.some((row) => row.booking_id === booking.id))
        fail(
          "DUPLICATE_REVIEW",
          "Satu booking hanya dapat memiliki satu ulasan.",
        );
      const created_at = source(now);
      const suffix = source(randomId);
      const reviewId = `review-${suffix}`;
      if (
        !time(created_at) ||
        !id(suffix) ||
        !id(reviewId) ||
        db.reviews.some((row) => row.id === reviewId)
      )
        fail(
          "INVALID_DEPENDENCY",
          "Waktu atau ID ulasan tidak valid. Coba lagi.",
        );
      const row = {
        id: reviewId,
        booking_id: booking.id,
        service_id: booking.service_id,
        seller_profile_id: booking.seller_profile_id,
        customer_user_id: user.id,
        reviewer_name: user.name,
        service_title: booking.service_title,
        seller_name: booking.seller_name,
        rating: input.rating,
        comment: input.comment.trim(),
        created_at,
      };
      if (
        ![row.reviewer_name, row.service_title, row.seller_name].every(
          (value) => text(value, 1, 200),
        )
      )
        fail("INVALID_CONTEXT", "Ringkasan akun atau booking tidak lengkap.");
      db.reviews.push(row);
      save(db);
      return { ...row };
    },
    update(review_id, input, { expected_user_id } = {}) {
      const user = account();
      if (expected_user_id !== user.id)
        fail("SESSION_CHANGED", "Sesi berubah. Buka kembali formulir dari akun aktif.");
      if (!id(review_id) || !exact(input, ["rating", "comment"]) ||
          !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 ||
          typeof input.comment !== "string" || !text(input.comment.trim(), 10, 2000))
        fail("INVALID_INPUT", "Pilih 1–5 bintang dan tulis ulasan 10–2000 karakter yang valid.");
      const db = load();
      const row = db.reviews.find((item) => item.id === review_id && item.customer_user_id === user.id);
      if (!row) denied();
      verifyOwn(row, user);
      const updated_at = source(now);
      if (!time(updated_at) || updated_at < (row.updated_at || row.created_at))
        fail("INVALID_DEPENDENCY", "Waktu pembaruan ulasan tidak valid. Coba lagi.");
      Object.assign(row, { rating: input.rating, comment: input.comment.trim(), updated_at });
      save(db);
      return { ...row };
    },
    getNotificationContext(review_id) {
      const user = account();
      const row = load().reviews.find(
        (row) => row.id === review_id && row.customer_user_id === user.id,
      );
      if (!row) denied();
      verifyOwn(row, user);
      return {
        id: row.id,
        customer_user_id: row.customer_user_id,
        seller_profile_id: row.seller_profile_id,
        booking_id: row.booking_id,
      };
    },
  };
  return api;
}
