const keys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
const label = (value, max = 120) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error("Nama wilayah tidak valid.");
  return value.trim();
};
export function validateCoordinates(value) {
  if (
    !keys(value, ["lat", "lng"]) ||
    typeof value.lat !== "number" ||
    typeof value.lng !== "number" ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lng) > 180
  )
    throw new Error(
      "Koordinat harus berupa lintang −90–90 dan bujur −180–180 yang valid.",
    );
  return { lat: value.lat, lng: value.lng };
}
export function parseCoordinates(lat, lng) {
  if (!String(lat).trim() && !String(lng).trim()) return null;
  if (
    ![lat, lng].every(
      (value) =>
        typeof value === "string" &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()),
    )
  )
    throw new Error("Isi kedua koordinat dengan angka yang valid.");
  return validateCoordinates({ lat: Number(lat), lng: Number(lng) });
}
export function validateBuyerLocation(value) {
  if (value == null) return null;
  if (
    !keys(value, ["version", "city", "coordinates", "source", "consent"]) ||
    value.version !== 1 ||
    !["city", "manual", "geolocation"].includes(value.source) ||
    typeof value.consent !== "boolean"
  )
    throw new Error("Data lokasi akun tidak valid.");
  const city = label(value.city);
  const coordinates =
    value.coordinates === null ? null : validateCoordinates(value.coordinates);
  if (
    coordinates
      ? !value.consent || value.source === "city"
      : value.source !== "city" || value.consent || city.length < 2
  )
    throw new Error(
      "Persetujuan penyimpanan koordinat diperlukan; kota saja tidak menentukan titik peta.",
    );
  return {
    version: 1,
    city,
    coordinates,
    source: value.source,
    consent: value.consent,
  };
}
export function validatePublicLocation(value) {
  if (value == null) return null; // legacy profile/service, or service inheritance
  if (
    !keys(value, [
      "version",
      "visibility",
      "area",
      "coordinates",
      "confirmed",
    ]) ||
    value.version !== 1 ||
    !["hidden", "area", "pin"].includes(value.visibility) ||
    typeof value.confirmed !== "boolean"
  )
    throw new Error("Data lokasi publik tidak valid.");
  const area = label(value.area);
  const coordinates =
    value.coordinates === null ? null : validateCoordinates(value.coordinates);
  if (
    value.visibility === "hidden"
      ? area || coordinates || value.confirmed
      : area.length < 2 ||
        (value.visibility === "pin"
          ? !coordinates || !value.confirmed
          : coordinates || value.confirmed)
  )
    throw new Error(
      "Pilih wilayah publik dan konfirmasikan pin, atau sembunyikan koordinat.",
    );
  return {
    version: 1,
    visibility: value.visibility,
    area,
    coordinates,
    confirmed: value.confirmed,
  };
}
export function publicLocation(value) {
  const location = validatePublicLocation(value);
  return location?.visibility === "hidden" ? null : location;
}
export function validStoredPublicLocation(value) {
  try {
    validatePublicLocation(value);
    return true;
  } catch {
    return false;
  }
}
export function publicLocationFromForm(form) {
  const visibility = form.get("locationVisibility");
  if (visibility === "inherit") return null;
  return validatePublicLocation({
    version: 1,
    visibility,
    area: visibility === "hidden" ? "" : form.get("locationArea"),
    coordinates:
      visibility === "pin"
        ? parseCoordinates(form.get("locationLat"), form.get("locationLng"))
        : null,
    confirmed: visibility === "pin" && form.get("locationConfirmed") === "on",
  });
}
export function haversineKm(first, second) {
  const a = validateCoordinates(first),
    b = validateCoordinates(second);
  const radians = (degree) => (degree * Math.PI) / 180;
  const term =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, term))));
}
export function requestBrowserLocation(geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(
        new Error(
          "Geolokasi tidak tersedia. Isi kota atau koordinat secara manual.",
        ),
      );
      return;
    }
    geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve(
            validateCoordinates({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          );
        } catch (error) {
          reject(error);
        }
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Izin lokasi ditolak. Kamu tetap dapat mengisi kota atau memilih titik secara manual."
              : "Lokasi belum dapat diperoleh. Coba lagi atau isi secara manual.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}
