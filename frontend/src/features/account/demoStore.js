import {
  validateBuyerLocation,
  validatePublicLocation,
  publicLocation,
} from "../location/locationModel.js";
import {
  validateProfilePatch,
  validateNewPassword,
} from "./profileValidation.js";

export const ACCOUNT_KEY = "digarsa.demo.accounts.v1";
export const ADMIN_PERMISSION = "admin:access";
const blank = () => ({ version: 1, accounts: [], profiles: [], session: null });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const sellerCategories = [
  "Branding",
  "Fotografi & Film",
  "Web & Digital",
  "Illustration & Motion",
];

function text(value, name, min, max) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max)
    throw new Error(`${name} harus ${min}–${max} karakter.`);
  return result;
}


function optionalUrl(value, name) {
  if (value == null || value === "") return "";

  if (typeof value !== "string") {
    throw new Error(`${name} tidak valid.`);
  }

  const normalized = value.trim();

  if (!normalized) return "";

  try {
    const url = new URL(normalized);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 2048
    ) {
      throw new Error();
    }

    return url.href;
  } catch {
    throw new Error(
      `${name} harus URL http atau https yang valid.`,
    );
  }
}



function optionalProfileImage(value, name) {
  // Foto profil bersifat opsional.
  if (value == null || value === "") return "";

  if (typeof value !== "string") {
    throw new Error(`${name} tidak valid.`);
  }

  const normalized = value.trim();

  if (!normalized) return "";

  // Compressed JPEG produced by the local image upload form.
  if (normalized.startsWith("data:")) {
    const validJpeg =
      /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(
        normalized,
      );

    if (!validJpeg || normalized.length > 250_000) {
      throw new Error(
        `${name} harus berupa gambar JPEG yang valid dan maksimal 180 KB setelah kompresi.`,
      );
    }

    return normalized;
  }

  // Preserve support for existing HTTP/HTTPS image URLs.
  return optionalUrl(normalized, name);
}

const hasAdmin = (account) => account?.permissions?.includes(ADMIN_PERMISSION);
const hex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

// Demo-only credential verification. Browser storage and permissions can be altered
// by the device owner; this is NOT a server-authenticated security boundary.
export function createDemoStore(
  storage,
  cryptoApi = globalThis.crypto,
  allowDemoPasswordReset = true,
) {
  const listeners = new Set();
  const passwordResetChallenges = new Map();
  function read() {
    let raw;
    try {
      raw = storage.getItem(ACCOUNT_KEY);
    } catch {
      throw new Error(
        "Penyimpanan demo tidak dapat dibaca. Periksa pengaturan penyimpanan browser.",
      );
    }
    if (!raw) return blank();
    try {
      const db = JSON.parse(raw);
      if (
        db.version !== 1 ||
        !Array.isArray(db.accounts) ||
        !Array.isArray(db.profiles) ||
        !db.accounts.every(
          (account) =>
            account &&
            typeof account.id === "string" &&
            typeof account.name === "string" &&
            typeof account.email === "string" &&
            typeof account.salt === "string" &&
            typeof account.passwordVerifier === "string" &&
            Array.isArray(account.permissions),
        ) ||
        !db.profiles.every(
          (profile) =>
            profile &&
            typeof profile.id === "string" &&
            typeof profile.ownerUserId === "string",
        )
      )
        throw new Error();
      return db;
    } catch {
      throw new Error(
        "Data demo tidak dapat dibaca. Gunakan profil browser lain atau hapus data demo melalui pengaturan browser.",
      );
    }
  }
  function write(db) {
    try {
      storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
    } catch {
      throw new Error(
        "Penyimpanan browser tidak tersedia. Aktifkan penyimpanan lokal untuk demo ini.",
      );
    }
    listeners.forEach((listener) => listener());
  }
  function accountForSession(db) {
    const account = db.session?.token
      ? db.accounts.find((item) => item.id === db.session.userId)
      : null;
    return account && account.status !== "suspended" ? account : null;
  }
  function ownedProfile(db, account) {
    return account
      ? db.profiles.find(
          (profile) =>
            profile.id === account.sellerProfileId &&
            profile.ownerUserId === account.id,
        ) || null
      : null;
  }
  function publicUser(db, account) {
    if (!account) return null;
    const seller = ownedProfile(db, account);
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      avatarUrl: typeof account.avatarUrl === "string" ? account.avatarUrl : "",
      phone: typeof account.phone === "string" ? account.phone : "",
      birthDate: typeof account.birthDate === "string" ? account.birthDate : "",
      gender: typeof account.gender === "string" ? account.gender : "",
      createdAt:
        typeof account.createdAt === "string" &&
        Number.isFinite(Date.parse(account.createdAt))
          ? account.createdAt
          : null,
      sellerProfileId: seller?.id || null,
      capabilities: ["buyer", ...(seller ? ["seller"] : [])],
      permissions: account.permissions?.includes(ADMIN_PERMISSION)
        ? [ADMIN_PERMISSION]
        : [],
    };
  }
  async function verifier(password, salt) {
    if (!cryptoApi?.subtle)
      throw new Error(
        "Demo ini memerlukan browser dengan Web Crypto pada HTTPS atau localhost.",
      );
    const material = await cryptoApi.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    return hex(
      await cryptoApi.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
          hash: "SHA-256",
        },
        material,
        256,
      ),
    );
  }
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current() {
      const db = read();
      return publicUser(db, accountForSession(db));
    },
    async register(input) {
      const name = text(input.name, "Nama", 2, 80);
      const email = text(input.email, "Email", 3, 254).toLowerCase();
      if (!emailPattern.test(email))
        throw new Error("Masukkan email yang valid.");
      if (
        typeof input.password !== "string" ||
        input.password.length < 8 ||
        input.password.length > 128
      )
        throw new Error("Kata sandi harus 8–128 karakter.");
      const salt = hex(cryptoApi.getRandomValues(new Uint8Array(16)));
      const passwordVerifier = await verifier(input.password, salt);
      const db = read();
      if (db.accounts.some((account) => account.email === email))
        throw new Error("Email sudah terdaftar. Silakan masuk.");
      const account = {
        id: cryptoApi.randomUUID(),
        name,
        email,
        salt,
        passwordVerifier,
        permissions: [],
        sellerProfileId: null,
        createdAt: new Date().toISOString(),
      };
      db.accounts.push(account);
      db.session = { userId: account.id, token: cryptoApi.randomUUID() };
      write(db);
      return publicUser(db, account);
    },
    async login(emailInput, password) {
      const email =
        typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
      if (
        !emailPattern.test(email) ||
        typeof password !== "string" ||
        password.length > 128
      )
        throw new Error("Email atau kata sandi tidak cocok.");
      const account = read().accounts.find((item) => item.email === email);
      if (
        !account ||
        (await verifier(password, account.salt)) !== account.passwordVerifier
      )
        throw new Error("Email atau kata sandi tidak cocok.");
      const db = read();
      const latest = db.accounts.find((item) => item.id === account.id);
      if (!latest || latest.status === "suspended") throw new Error("Akun ini sedang dinonaktifkan oleh Admin Digarsa.");
      db.session = { userId: latest.id, token: cryptoApi.randomUUID() };
      write(db);
      return publicUser(db, latest);
    },
    requestPasswordReset(emailInput) {
      if (!allowDemoPasswordReset)
        throw new Error("Reset password memerlukan layanan email backend.");
      const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
      if (!emailPattern.test(email)) throw new Error("Masukkan email yang valid.");
      const account = read().accounts.find((item) => item.email === email);
      if (!account) throw new Error("Email tidak ditemukan.");
      const challengeId = cryptoApi.randomUUID();
      const code = String(cryptoApi.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0");
      const expiresAt = Date.now() + 5 * 60 * 1000;
      passwordResetChallenges.set(challengeId, {
        email, code, expiresAt, verified: false, attempts: 0,
        accountId: account.id, passwordVerifier: account.passwordVerifier,
      });
      return { challengeId, code, expiresAt };
    },
    verifyPasswordResetCode(challengeId, emailInput, code) {
      if (!allowDemoPasswordReset) throw new Error("Reset password memerlukan layanan email backend.");
      const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
      const challenge = passwordResetChallenges.get(challengeId);
      if (!challenge || challenge.email !== email) throw new Error("Kode verifikasi tidak valid.");
      if (Date.now() > challenge.expiresAt) {
        passwordResetChallenges.delete(challengeId);
        throw new Error("Kode verifikasi sudah kedaluwarsa. Kirim kode baru.");
      }
      if (challenge.attempts >= 5) {
        passwordResetChallenges.delete(challengeId);
        throw new Error("Terlalu banyak percobaan. Kirim kode baru.");
      }
      challenge.attempts += 1;
      if (typeof code !== "string" || code !== challenge.code)
        throw new Error("Kode OTP salah.");
      challenge.verified = true;
      return true;
    },
    async completePasswordReset(challengeId, emailInput, newPassword, confirmation) {
      if (!allowDemoPasswordReset) throw new Error("Reset password memerlukan layanan email backend.");
      const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
      const challenge = passwordResetChallenges.get(challengeId);
      if (!challenge || challenge.email !== email || !challenge.verified)
        throw new Error("Verifikasi kode terlebih dahulu.");
      if (Date.now() > challenge.expiresAt) {
        passwordResetChallenges.delete(challengeId);
        throw new Error("Kode verifikasi sudah kedaluwarsa. Mulai kembali.");
      }
      validateNewPassword(newPassword, confirmation);
      const salt = hex(cryptoApi.getRandomValues(new Uint8Array(16)));
      const passwordVerifier = await verifier(newPassword, salt);
      const db = read();
      const account = db.accounts.find((item) => item.id === challenge.accountId && item.email === email);
      if (!account || account.passwordVerifier !== challenge.passwordVerifier)
        throw new Error("Data akun berubah. Mulai ulang reset password.");
      account.salt = salt;
      account.passwordVerifier = passwordVerifier;
      write(db);
      passwordResetChallenges.delete(challengeId);
      return true;
    },
    updateProfile(input, { expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId)
        throw new Error(
          "Sesi berubah. Muat ulang profil akun aktif sebelum menyimpan.",
        );
      const patch = validateProfilePatch(input);
      Object.assign(account, patch);
      write(db);
      return publicUser(db, account);
    },
    // Private buyer location: resolved from the session, never a caller's account ID.
    getBuyerLocation() {
      const db = read();
      const account = accountForSession(db);
      if (
        !account ||
        db.accounts.filter((row) => row.id === account.id).length !== 1
      )
        throw new Error(
          "Masuk untuk membaca lokasi akunmu dengan asosiasi yang valid.",
        );
      return validateBuyerLocation(account.discoveryLocation);
    },
    updateBuyerLocation(input, { expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (
        !account ||
        account.id !== expectedUserId ||
        db.accounts.filter((row) => row.id === account.id).length !== 1
      )
        throw new Error("Sesi berubah. Lokasi akun lain tidak dapat diubah.");
      account.discoveryLocation = validateBuyerLocation(input);
      write(db);
      return validateBuyerLocation(account.discoveryLocation);
    },
    clearBuyerLocation({ expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (
        !account ||
        account.id !== expectedUserId ||
        db.accounts.filter((row) => row.id === account.id).length !== 1
      )
        throw new Error("Sesi berubah. Lokasi akun lain tidak dapat diubah.");
      delete account.discoveryLocation;
      write(db);
    },
    async changePassword(
      { currentPassword, newPassword, confirmation },
      { expectedUserId } = {},
    ) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId)
        throw new Error(
          "Sesi berubah. Masuk kembali untuk mengubah kata sandi.",
        );
      const sessionToken = db.session.token;
      if (
        typeof currentPassword !== "string" ||
        !currentPassword ||
        currentPassword.length > 128
      )
        throw new Error("Isi kata sandi saat ini.");
      validateNewPassword(newPassword, confirmation);
      if (
        (await verifier(currentPassword, account.salt)) !==
        account.passwordVerifier
      )
        throw new Error("Kata sandi saat ini tidak cocok.");
      if (newPassword === currentPassword)
        throw new Error("Gunakan kata sandi baru yang berbeda.");
      const salt = hex(cryptoApi.getRandomValues(new Uint8Array(16)));
      const passwordVerifier = await verifier(newPassword, salt);
      const latest = read();
      const owner = accountForSession(latest);
      if (
        !owner ||
        owner.id !== account.id ||
        latest.session.token !== sessionToken ||
        owner.passwordVerifier !== account.passwordVerifier
      )
        throw new Error(
          "Sesi atau kata sandi berubah. Masuk kembali dan coba lagi.",
        );
      owner.salt = salt;
      owner.passwordVerifier = passwordVerifier;
      write(latest);
      return publicUser(latest, owner);
    },
    logout() {
      const db = read();
      db.session = null;
      write(db);
    },
    activateSeller(input) {
  const db = read();
  const account = accountForSession(db);

  if (!account)
    throw new Error("Masuk sebelum mengaktifkan Seller Profile.");

  if (
    account.sellerProfileId ||
    db.profiles.some((profile) => profile.ownerUserId === account.id)
  )
    throw new Error("Seller Profile sudah diaktifkan.");

  if (!sellerCategories.includes(input.category))
    throw new Error("Pilih kategori layanan yang tersedia.");

  const profile = {
    id: `creator-${cryptoApi.randomUUID()}`,
    ownerUserId: account.id,

    ...(Object.hasOwn(input, "publicLocation")
      ? { publicLocation: validatePublicLocation(input.publicLocation) }
      : {}),

    name: text(input.name, "Nama kreator", 2, 80),
    category: input.category,
    city: text(input.city, "Kota", 2, 80),
    bio: text(input.bio, "Bio", 30, 500),

    image: optionalProfileImage(input.image, "Foto profil"),

    portfolioLink: optionalUrl(input.portfolioLink, "Portfolio"),

    specialties: text(input.specialties || "", "Spesialisasi", 0, 500)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  db.profiles.push(profile);
  account.sellerProfileId = profile.id;

  write(db);
  return profile;
},
    getOwnedSeller(profileId) {
      const db = read();
      const profile = ownedProfile(db, accountForSession(db));
      if (!profile || profile.id !== profileId)
        throw new Error("Seller Profile ini bukan milik akun aktif.");
      return { ...profile, specialties: [...profile.specialties] };
    },
    // --- Phase 7 additions (Seller Center / Admin). Additive only. ---
    // Owner edits their own Seller Profile. Owner and ID never come from input.
    updateSellerProfile(input) {
  const db = read();
  const account = accountForSession(db);

  if (!account)
    throw new Error("Masuk sebelum mengubah Seller Profile.");

  const profile = ownedProfile(db, account);

  if (!profile)
    throw new Error("Akun ini belum memiliki Seller Profile.");

  if (!sellerCategories.includes(input.category))
    throw new Error("Pilih kategori layanan yang tersedia.");

  const next = {
    ...(Object.hasOwn(input, "publicLocation")
      ? { publicLocation: validatePublicLocation(input.publicLocation) }
      : {}),

    name: text(input.name, "Nama kreator", 2, 80),
    category: input.category,
    city: text(input.city, "Kota", 2, 80),
    bio: text(input.bio, "Bio", 30, 500),

    // Perbaikan utama:
    image: optionalProfileImage(input.image, "Foto profil"),

    portfolioLink: optionalUrl(input.portfolioLink, "Portfolio"),

    specialties: text(input.specialties || "", "Spesialisasi", 0, 500)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  Object.assign(profile, next);

  write(db);

  return {
    ...profile,
    specialties: [...profile.specialties],
  };
},
    // Seller profiles are public marketplace data (no credentials involved).
    listSellerProfiles() {
      const db = read();
      return db.profiles.filter((profile) => db.accounts.find((account) => account.id === profile.ownerUserId)?.status !== "suspended").map((profile) => ({
        ...profile,
        specialties: [...(profile.specialties || [])],
        ...(Object.hasOwn(profile, "publicLocation")
          ? { publicLocation: publicLocation(profile.publicLocation) }
          : {}),
      }));
    },
    // Public eligibility proof: a profile must have one real owner with the same
    // activation association. Catalog/editorial metadata is not account evidence.
    getBookableSeller(profileId) {
      const db = read();
      const profiles = db.profiles.filter(
        (profile) => profile.id === profileId,
      );
      if (profiles.length !== 1) return null;
      const profile = profiles[0];
      if (
        !profile.id ||
        !profile.ownerUserId ||
        !sellerCategories.includes(profile.category) ||
        [
          [profile.name, 2, 80],
          [profile.city, 2, 80],
          [profile.bio, 30, 500],
        ].some(
          ([value, min, max]) =>
            typeof value !== "string" ||
            value.trim().length < min ||
            value.length > max,
        )
      )
        return null;
      const owners = db.accounts.filter(
        (account) => account.id === profile.ownerUserId,
      );
      if (
        owners.length !== 1 ||
        !owners[0].id ||
        owners[0].sellerProfileId !== profile.id ||
        owners[0].status === "suspended"
      )
        return null;
      return {
        ...profile,
        specialties: [...(profile.specialties || [])],
        ...(Object.hasOwn(profile, "publicLocation")
          ? { publicLocation: publicLocation(profile.publicLocation) }
          : {}),
      };
    },
    // Display names only, for sellers/admins reading booking rows.
    customerNames(ids) {
      const db = read();
      const account = accountForSession(db);
      if (!account || !(ownedProfile(db, account) || hasAdmin(account)))
        throw new Error("Akses ditolak.");
      const names = {};
      for (const id of Array.isArray(ids) ? ids : []) {
        const match = db.accounts.find((item) => item.id === id);
        if (match) names[id] = match.name;
      }
      return names;
    },
    // Minimal public identity data for authorized Seller messaging inboxes.
    // IDs are supplied from conversations already authorized by messagingStore.
    customerIdentities(ids) {
      const db = read();
      const account = accountForSession(db);
      if (!account || !(ownedProfile(db, account) || hasAdmin(account)))
        throw new Error("Akses ditolak.");
      const identities = {};
      for (const id of Array.isArray(ids) ? ids : []) {
        const match = db.accounts.find((item) => item.id === id);
        if (!match) continue;
        let avatarUrl = "";
        if (typeof match.avatarUrl === "string" && match.avatarUrl) {
          try {
            const url = new URL(match.avatarUrl);
            if (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            )
              avatarUrl = url.href;
          } catch {
            // Invalid legacy/demo avatar values use the initials fallback.
          }
        }
        identities[id] = { id: match.id, name: match.name, avatarUrl };
      }
      return identities;
    },
    // Reports are tied to real account IDs; reporter identity comes from session.
    reportAccount({ targetAccountId, targetSellerProfileId, reason, details = "" }) {
      const db = read();
      const reporter = accountForSession(db);
      if (!reporter) throw new Error("Masuk untuk melaporkan akun.");
      const target = targetAccountId
        ? db.accounts.find((item) => item.id === targetAccountId)
        : db.accounts.find((item) => item.sellerProfileId === targetSellerProfileId);
      if (!target || target.id === reporter.id) throw new Error("Akun yang dilaporkan tidak valid.");
      const allowed = ["Penipuan atau transaksi mencurigakan", "Pelecehan atau komunikasi tidak pantas", "Identitas atau profil palsu", "Spam atau penyalahgunaan platform", "Lainnya"];
      if (!allowed.includes(reason)) throw new Error("Pilih alasan laporan.");
      const note = typeof details === "string" ? details.trim().slice(0, 1000) : "";
      if (note.length < 10) throw new Error("Jelaskan laporan minimal 10 karakter.");
      db.reports ||= [];
      if (db.reports.some((row) => row.reporterId === reporter.id && row.targetAccountId === target.id && row.status === "open"))
        throw new Error("Laporan untuk akun ini masih dalam peninjauan.");
      const report = { id: cryptoApi.randomUUID(), reporterId: reporter.id, targetAccountId: target.id, reason, details: note, status: "open", createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, action: null };
      db.reports.push(report); write(db); return { ...report };
    },
    listAccountReportsForAdmin() {
      const db = read(); const admin = accountForSession(db);
      if (!admin || !hasAdmin(admin)) throw new Error("Memerlukan izin admin internal.");
      return (db.reports || []).map((row) => ({ ...row, reporter: db.accounts.find((a) => a.id === row.reporterId)?.name || "Akun tidak tersedia", target: db.accounts.find((a) => a.id === row.targetAccountId)?.name || "Akun tidak tersedia", targetEmail: db.accounts.find((a) => a.id === row.targetAccountId)?.email || "", targetStatus: db.accounts.find((a) => a.id === row.targetAccountId)?.status || "active" })).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    },
    reviewAccountReport(reportId, action) {
      const db = read(); const admin = accountForSession(db);
      if (!admin || !hasAdmin(admin)) throw new Error("Memerlukan izin admin internal.");
      if (!["dismiss", "suspend"].includes(action)) throw new Error("Tindakan laporan tidak valid.");
      const report = (db.reports || []).find((row) => row.id === reportId);
      if (!report || report.status !== "open") throw new Error("Laporan sudah ditinjau atau tidak tersedia.");
      const target = db.accounts.find((item) => item.id === report.targetAccountId);
      if (action === "suspend") {
        if (!target || hasAdmin(target)) throw new Error("Akun Admin tidak dapat dinonaktifkan dari alur laporan.");
        target.status = "suspended"; target.suspendedAt = new Date().toISOString();
        if (db.session?.userId === target.id) db.session = null;
      }
      report.status = "reviewed"; report.action = action; report.reviewedAt = new Date().toISOString(); report.reviewedBy = admin.id;
      write(db); return { ...report };
    },
    // Admin-only. Never returns salts or password verifiers.
    listAccountsForAdmin() {
      const db = read();
      const account = accountForSession(db);
      if (!account || !hasAdmin(account))
        throw new Error("Memerlukan izin admin internal.");
      return db.accounts.map((item) => {
        const profile = ownedProfile(db, item);
        return {
          id: item.id,
          name: item.name,
          email: item.email,
          createdAt:
            typeof item.createdAt === "string" &&
            Number.isFinite(Date.parse(item.createdAt))
              ? item.createdAt
              : null,
          // The unified account model grants every registered account buyer
          // capability; seller status is an additional owned profile.
          isCustomer: true,
          isSeller: Boolean(profile),
          sellerProfileId: profile?.id || null,
          sellerName: profile?.name || "",
          sellerCategory: profile?.category || "",
          sellerCity: profile?.city || "",
          isAdmin: hasAdmin(item),
          isSelf: item.id === account.id,
          status: item.status === "suspended" ? "suspended" : "active",
        };
      });
    },
  };
}

export const demoStore = createDemoStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}, globalThis.crypto, import.meta.env?.DEV === true);