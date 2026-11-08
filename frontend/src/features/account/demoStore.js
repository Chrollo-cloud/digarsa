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
  if (!value?.trim()) return "";
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
    throw new Error(`${name} harus URL http atau https yang valid.`);
  }
}
const hasAdmin = (account) => account?.permissions?.includes(ADMIN_PERMISSION);
const hex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

// Demo-only credential verification. Browser storage and permissions can be altered
// by the device owner; this is NOT a server-authenticated security boundary.
export function createDemoStore(storage, cryptoApi = globalThis.crypto) {
  const listeners = new Set();
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
    return db.session?.token
      ? db.accounts.find((account) => account.id === db.session.userId)
      : null;
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
      if (!latest) throw new Error("Akun demo tidak tersedia.");
      db.session = { userId: latest.id, token: cryptoApi.randomUUID() };
      write(db);
      return publicUser(db, latest);
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
        name: text(input.name, "Nama kreator", 2, 80),
        category: input.category,
        city: text(input.city, "Kota", 2, 80),
        bio: text(input.bio, "Bio", 30, 500),
        image: optionalUrl(input.image, "Foto profil"),
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
      if (!account) throw new Error("Masuk sebelum mengubah Seller Profile.");
      const profile = ownedProfile(db, account);
      if (!profile) throw new Error("Akun ini belum memiliki Seller Profile.");
      if (!sellerCategories.includes(input.category))
        throw new Error("Pilih kategori layanan yang tersedia.");
      const next = {
        name: text(input.name, "Nama kreator", 2, 80),
        category: input.category,
        city: text(input.city, "Kota", 2, 80),
        bio: text(input.bio, "Bio", 30, 500),
        image: optionalUrl(input.image, "Foto profil"),
        portfolioLink: optionalUrl(input.portfolioLink, "Portfolio"),
        specialties: text(input.specialties || "", "Spesialisasi", 0, 500)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      Object.assign(profile, next);
      write(db);
      return { ...profile, specialties: [...profile.specialties] };
    },
    // Seller profiles are public marketplace data (no credentials involved).
    listSellerProfiles() {
      return read().profiles.map((profile) => ({
        ...profile,
        specialties: [...(profile.specialties || [])],
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
        owners[0].sellerProfileId !== profile.id
      )
        return null;
      return { ...profile, specialties: [...(profile.specialties || [])] };
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
          isSeller: Boolean(profile),
          sellerProfileId: profile?.id || null,
          sellerName: profile?.name || "",
          isAdmin: hasAdmin(item),
          isSelf: item.id === account.id,
        };
      });
    },
  };
}

export const demoStore = createDemoStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
