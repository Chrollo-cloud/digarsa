import { isMediaId } from "../media/mediaStore.js";
import {
  validateBuyerLocation,
  validatePublicLocation,
  publicLocation,
} from "../location/locationModel.js";
import {
  validateProfilePatch,
  validateNewPassword,
} from "./profileValidation.js";
import {
  validateAddressBook,
  validateShippingAddress,
} from "../profile/addressBookModel.js";

export const ACCOUNT_KEY = "digarsa.demo.accounts.v1";
export const ACCOUNT_REPORTS_KEY = "digarsa.demo.account-reports.v1";
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
    throw new Error(`${name} must be a valid HTTP or HTTPS URL.`);
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
      avatarMediaId: isMediaId(account.avatarMediaId) ? account.avatarMediaId : "",
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
      const email = text(input.email, "Email address", 3, 254).toLowerCase();
      if (!emailPattern.test(email))
        throw new Error("Enter a valid email address.");
      if (
        typeof input.password !== "string" ||
        input.password.length < 8 ||
        input.password.length > 128
      )
        throw new Error("Password harus 8–128 karakter.");
      const salt = hex(cryptoApi.getRandomValues(new Uint8Array(16)));
      const passwordVerifier = await verifier(input.password, salt);
      const db = read();
      if (db.accounts.some((account) => account.email === email))
        throw new Error("Email address sudah terdaftar. Silakan masuk.");
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
        throw new Error("Email address atau kata sandi tidak cocok.");
      const account = read().accounts.find((item) => item.email === email);
      if (
        !account ||
        (await verifier(password, account.salt)) !== account.passwordVerifier
      )
        throw new Error("Email address atau kata sandi tidak cocok.");
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
          "Your session changed. Reload the active account profile before saving.",
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
          "Log in untuk membaca lokasi akunmu dengan asosiasi yang valid.",
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
    getShippingAddresses() {
      const db = read();
      const account = accountForSession(db);
      if (!account)
        throw new Error("Log in to view your saved addresses.");
      if (db.accounts.filter((row) => row.id === account.id).length !== 1)
        throw new Error("The active account could not be verified.");
      return validateAddressBook(account.shippingAddresses);
    },
    saveShippingAddress(input, { expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId || db.accounts.filter((row) => row.id === account.id).length !== 1)
        throw new Error("Your session changed. Reload the active account before saving an address.");
      const addresses = validateAddressBook(account.shippingAddresses);
      const editing = typeof input?.id === "string" && input.id ? addresses.find((row) => row.id === input.id) : null;
      if (input?.id && !editing) throw new Error("This address does not belong to the active account.");
      if (!editing && addresses.length >= 30) throw new Error("You can save up to 30 addresses.");
      let address = validateShippingAddress({
        ...input,
        id: editing?.id || cryptoApi.randomUUID(),
        isPrimary: addresses.length === 0 || input.isPrimary === true,
        createdAt: editing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { requireId: true });
      let next = addresses.filter((row) => row.id !== address.id);
      if (address.isPrimary) next = next.map((row) => ({ ...row, isPrimary: false }));
      else if (!next.some((row) => row.isPrimary)) {
        address = { ...address, isPrimary: true };
      }
      next.push(address);
      account.shippingAddresses = validateAddressBook(next);
      write(db);
      return account.shippingAddresses.map((row) => ({ ...row }));
    },
    setPrimaryShippingAddress(addressId, { expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId || db.accounts.filter((row) => row.id === account.id).length !== 1)
        throw new Error("Your session changed. Reload the active account before changing your primary address.");
      const addresses = validateAddressBook(account.shippingAddresses);
      if (!addresses.some((row) => row.id === addressId))
        throw new Error("This address does not belong to the active account.");
      account.shippingAddresses = addresses.map((row) => ({ ...row, isPrimary: row.id === addressId }));
      write(db);
      return account.shippingAddresses.map((row) => ({ ...row }));
    },
    deleteShippingAddress(addressId, { expectedUserId } = {}) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId || db.accounts.filter((row) => row.id === account.id).length !== 1)
        throw new Error("Your session changed. Reload the active account before deleting an address.");
      const addresses = validateAddressBook(account.shippingAddresses);
      const removed = addresses.find((row) => row.id === addressId);
      if (!removed) throw new Error("This address does not belong to the active account.");
      const next = addresses.filter((row) => row.id !== addressId);
      if (removed.isPrimary && next.length) next[0] = { ...next[0], isPrimary: true };
      account.shippingAddresses = validateAddressBook(next);
      write(db);
      return account.shippingAddresses.map((row) => ({ ...row }));
    },
    async changePassword(
      { currentPassword, newPassword, confirmation },
      { expectedUserId } = {},
    ) {
      const db = read();
      const account = accountForSession(db);
      if (!account || account.id !== expectedUserId)
        throw new Error(
          "Sesi berubah. Log in kembali untuk mengubah kata sandi.",
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
        throw new Error("Password saat ini tidak cocok.");
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
          "Sesi atau kata sandi berubah. Log in kembali dan coba lagi.",
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
        throw new Error("Log in sebelum mengaktifkan Seller Profile.");
      if (
        account.sellerProfileId ||
        db.profiles.some((profile) => profile.ownerUserId === account.id)
      )
        throw new Error("Seller Profile is already active.");
      if (!sellerCategories.includes(input.category))
    throw new Error("Choose an available category.");
      const profile = {
        id: `creator-${cryptoApi.randomUUID()}`,
        ownerUserId: account.id,
        ...(Object.hasOwn(input, "publicLocation")
          ? { publicLocation: validatePublicLocation(input.publicLocation) }
          : {}),
        name: text(input.name, "Nama kreator", 2, 80),
        category: input.category,
        city: text(input.city, "City", 2, 80),
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
        throw new Error("This Seller Profile does not belong to the active account.");
      return { ...profile, specialties: [...profile.specialties] };
    },
    // --- Phase 7 additions (Seller Center / Admin). Additive only. ---
    // Owner edits their own Seller Profile. Owner and ID never come from input.
    updateSellerProfile(input) {
      const db = read();
      const account = accountForSession(db);
      if (!account) throw new Error("Log in sebelum mengubah Seller Profile.");
      const profile = ownedProfile(db, account);
      if (!profile) throw new Error("This account does not have a Seller Profile yet.");
      if (!sellerCategories.includes(input.category))
        throw new Error("Select a category services yang tersedia.");
      if (input.imageMediaId && !isMediaId(input.imageMediaId)) throw new Error("Referensi foto lokal tidak valid.");
      const next = {
        ...(Object.hasOwn(input, "imageMediaId") ? { imageMediaId: input.imageMediaId || "" } : {}),
        ...(Object.hasOwn(input, "publicLocation")
          ? { publicLocation: validatePublicLocation(input.publicLocation) }
          : {}),
        name: text(input.name, "Nama kreator", 2, 80),
        category: input.category,
        city: text(input.city, "City", 2, 80),
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
        owners[0].sellerProfileId !== profile.id
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
        throw new Error("Access denied.");
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
        throw new Error("Access denied.");
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
    buyerProfileForSeller(targetBuyerId) {
      const db = read();
      const seller = accountForSession(db);
      const sellerProfile = ownedProfile(db, seller);
      if (!seller || !sellerProfile || typeof targetBuyerId !== "string")
        throw new Error("Access denied.");
      let orders;
      try {
        orders = JSON.parse(storage.getItem("digarsa.demo.customer.v1") || "null");
      } catch {
        throw new Error("Buyer access could not be verified from the order records.");
      }
      if (!orders || orders.version !== 1 || !Array.isArray(orders.bookings))
        throw new Error("Buyer access could not be verified from the order records.");
      const related = orders.bookings.some((booking) =>
        booking && booking.creatorId === sellerProfile.id && booking.customerId === targetBuyerId &&
        typeof booking.id === "string" && booking.id.length > 0,
      );
      if (!related) throw new Error("This Buyer has no order associated with your Seller Profile.");
      const matches = db.accounts.filter((row) => row.id === targetBuyerId);
      if (matches.length !== 1) throw new Error("Buyer profile was not found or could not be verified.");
      const buyer = matches[0];
      let avatarUrl = "";
      if (typeof buyer.avatarUrl === "string" && buyer.avatarUrl) {
        try {
          const url = new URL(buyer.avatarUrl);
          if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) avatarUrl = url.href;
        } catch { /* Use the initials avatar for invalid legacy URLs. */ }
      }
      return {
        id: buyer.id,
        name: buyer.name,
        avatarUrl,
        avatarMediaId: isMediaId(buyer.avatarMediaId) ? buyer.avatarMediaId : "",
        bio: typeof buyer.publicBuyerBio === "string" ? buyer.publicBuyerBio : "",
        city: typeof buyer.publicBuyerCity === "string" ? buyer.publicBuyerCity : "",
        phone: buyer.sharePhoneWithSellers === true && typeof buyer.phone === "string" ? buyer.phone : "",
        joinedAt: typeof buyer.createdAt === "string" && Number.isFinite(Date.parse(buyer.createdAt)) ? buyer.createdAt : null,
        status: ["Active", "Suspended", "Pending"].includes(buyer.accountStatus) ? buyer.accountStatus : "",
      };
    },
    submitBuyerReport(targetBuyerId, bookingId, reason, details, { expectedUserId } = {}) {
      const db = read();
      const seller = accountForSession(db);
      const sellerProfile = ownedProfile(db, seller);
      if (!seller || seller.id !== expectedUserId || !sellerProfile)
        throw new Error("Only the active Seller on this account can report a Buyer.");
      if (typeof bookingId !== "string" || !bookingId || typeof targetBuyerId !== "string")
        throw new Error("A related booking and Buyer are required.");
      let orders;
      try { orders = JSON.parse(storage.getItem("digarsa.demo.customer.v1") || "null"); }
      catch { throw new Error("The order could not be verified. The report was not saved."); }
      const related = orders?.version === 1 && Array.isArray(orders.bookings) && orders.bookings.some((booking) =>
        booking?.id === bookingId && booking.creatorId === sellerProfile.id && booking.customerId === targetBuyerId,
      );
      if (!related) throw new Error("The Buyer is not associated with this Seller order.");
      if (!db.accounts.some((row) => row.id === targetBuyerId)) throw new Error("Buyer account not found.");
      const allowedReasons = ["Fraud or suspicious activity", "Harassment or inappropriate communication", "False identity or profile", "Spam or platform abuse", "Other"];
      if (!allowedReasons.includes(reason)) throw new Error("Choose a report reason.");
      const note = typeof details === "string" ? details.trim() : "";
      if (note.length < 10 || note.length > 1000) throw new Error("Report details must be 10–1,000 characters.");
      let reportData;
      try {
        reportData = JSON.parse(storage.getItem(ACCOUNT_REPORTS_KEY) || '{"version":1,"reports":[]}');
        if (reportData.version !== 1 || !Array.isArray(reportData.reports)) throw new Error();
      } catch { throw new Error("Local report storage could not be verified. Nothing was saved."); }
      const report = {
        id: `RPT-${cryptoApi.randomUUID()}`,
        reporterId: seller.id,
        targetAccountId: targetBuyerId,
        bookingId,
        reason,
        details: note,
        submittedAt: new Date().toISOString(),
      };
      reportData.reports.push(report);
      try { storage.setItem(ACCOUNT_REPORTS_KEY, JSON.stringify(reportData)); }
      catch { throw new Error("Report was not saved because browser storage is unavailable."); }
      return { id: report.id, submittedAt: report.submittedAt };
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
        };
      });
    },
  };
}

export const demoStore = createDemoStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
