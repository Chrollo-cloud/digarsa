
import { validateCoordinates } from "../location/locationModel";

const STORAGE_KEY = "digarsa.demo.addresses.v1";

function readAddresses() {
  let raw;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Penyimpanan alamat tidak tersedia.");
  }

  if (!raw) return { version: 1, addresses: [] };

  try {
    const data = JSON.parse(raw);

    if (
      data.version !== 1 ||
      !Array.isArray(data.addresses) ||
      !data.addresses.every(
        (item) =>
          item &&
          typeof item.userId === "string" &&
          typeof item.updatedAt === "string",
      )
    ) {
      throw new Error();
    }

    return data;
  } catch {
    throw new Error("Data alamat demo tidak dapat dibaca.");
  }
}

function saveDatabase(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "Alamat gagal disimpan. Periksa kapasitas penyimpanan browser.",
    );
  }
}

function requiredText(value, label, min, max) {
  const result = typeof value === "string" ? value.trim() : "";

  if (result.length < min || result.length > max) {
    throw new Error(`${label} harus ${min}–${max} karakter.`);
  }

  return result;
}

export function getSavedAddress(userId) {
  if (!userId) return null;

  const data = readAddresses();

  const matches = data.addresses.filter(
    (item) => item.userId === userId,
  );

  if (matches.length > 1) {
    throw new Error("Data alamat akun memiliki duplikasi.");
  }

  return matches[0] ? { ...matches[0] } : null;
}

export function saveAddress(userId, input) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Akun pemilik alamat tidak valid.");
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Data alamat tidak valid.");
  }

  // Koordinat hanya boleh disimpan setelah persetujuan pengguna.
  const coordinates =
    input.coordinates == null
      ? null
      : validateCoordinates(input.coordinates);

  const coordinatesConsent = input.coordinatesConsent === true;

  if (coordinates && !coordinatesConsent) {
    throw new Error(
      "Setujui penyimpanan titik alamat sebelum menyimpan koordinat.",
    );
  }

  const address = {
    userId,

    label: requiredText(input.label, "Label alamat", 2, 30),

    recipientName: requiredText(
      input.recipientName,
      "Nama penerima",
      2,
      80,
    ),

    phone: requiredText(input.phone, "Nomor telepon", 7, 25),

    provinceId: requiredText(input.provinceId, "Provinsi", 1, 20),
    provinceName: requiredText(input.provinceName, "Provinsi", 2, 100),

    regencyId: requiredText(input.regencyId, "Kabupaten/kota", 1, 20),
    regencyName: requiredText(
      input.regencyName,
      "Kabupaten/kota",
      2,
      100,
    ),

    districtId: requiredText(input.districtId, "Kecamatan", 1, 25),
    districtName: requiredText(input.districtName, "Kecamatan", 2, 100),

    villageId: requiredText(input.villageId, "Kelurahan/desa", 1, 30),
    villageName: requiredText(
      input.villageName,
      "Kelurahan/desa",
      2,
      100,
    ),

    postalCode: requiredText(input.postalCode, "Kode pos", 5, 5),

    detail: requiredText(input.detail, "Detail alamat", 10, 500),

    // Simpan titik peta bersama alamat, bukan sebagai lokasi publik.
    coordinates,

    coordinatesConsent: Boolean(
      coordinates && coordinatesConsent,
    ),

    updatedAt: new Date().toISOString(),
  };

  const digits = address.phone.replace(/\D/g, "");

  if (
    !/^\+?[\d ()-]+$/.test(address.phone) ||
    digits.length < 7 ||
    digits.length > 15
  ) {
    throw new Error("Nomor telepon harus berisi 7–15 digit.");
  }

  if (!/^\d{5}$/.test(address.postalCode)) {
    throw new Error("Kode pos harus terdiri dari 5 angka.");
  }

  const data = readAddresses();

  // Satu alamat utama untuk setiap akun.
  data.addresses = data.addresses.filter(
    (item) => item.userId !== userId,
  );

  data.addresses.push(address);

  saveDatabase(data);

  return { ...address };
}

export function removeSavedAddress(userId) {
  if (!userId) throw new Error("Akun tidak valid.");

  const data = readAddresses();

  data.addresses = data.addresses.filter(
    (item) => item.userId !== userId,
  );

  saveDatabase(data);
}