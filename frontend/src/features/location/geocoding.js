import { validateCoordinates } from "./locationModel.js";

// OpenStreetMap Nominatim: https://operations.osmfoundation.org/policies/nominatim/
// Requests are user-initiated or debounced after a pin move, one at a time, never autocomplete.
const BASE = "https://nominatim.openstreetmap.org";
const clean = (value, max) =>
  typeof value === "string"
    ? [...value]
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const first = (...values) => values.find((v) => typeof v === "string" && v.trim()) || "";

// Maps a Nominatim `address` object to the app's address fields. Indonesian OSM tagging is
// inconsistent, so every field stays editable after autofill.
export function addressFromNominatim(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const postal = clean(String(a.postcode ?? ""), 10).match(/\d{5}/)?.[0] || "";
  return {
    province: clean(first(a.state, a.province, a.region), 80),
    regency: clean(first(a.city, a.county, a.regency, a.municipality, a.town), 80),
    district: clean(first(a.city_district, a.district, a.suburb, a.subdistrict), 80),
    postalCode: postal,
    detail: clean([a.road, a.house_number].filter(Boolean).join(" "), 200),
  };
}

export function addressQuery(address, { withDetail = true } = {}) {
  const part = (v) => (typeof v === "string" ? v.trim() : "");
  return [
    withDetail ? part(address?.detail) : "",
    part(address?.district),
    part(address?.regency),
    part(address?.province),
    part(address?.postalCode),
  ]
    .filter(Boolean)
    .join(", ");
}

async function getJson(url, { fetchImpl, signal }) {
  let response;
  try {
    response = await fetchImpl(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Layanan alamat tidak dapat dihubungi. Isi alamat secara manual.", { cause: error });
  }
  if (!response.ok)
    throw new Error("Layanan alamat sedang tidak tersedia. Isi alamat secara manual.");
  return response.json();
}

export async function reverseGeocode(point, { fetchImpl = globalThis.fetch, signal } = {}) {
  const { lat, lng } = validateCoordinates(point);
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    "accept-language": "id",
    lat: String(lat),
    lon: String(lng),
  });
  const data = await getJson(`${BASE}/reverse?${params}`, { fetchImpl, signal });
  if (!data || data.error || !data.address)
    throw new Error("Alamat untuk titik ini tidak ditemukan. Isi alamat secara manual.");
  return addressFromNominatim(data.address);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Looks up the typed address; retries once without the street detail (RT/RW, building names).
export async function searchAddress(
  address,
  { fetchImpl = globalThis.fetch, signal, wait = pause } = {},
) {
  const queries = [addressQuery(address), addressQuery(address, { withDetail: false })].filter(
    (query, index, all) => query && all.indexOf(query) === index,
  );
  if (!queries.length) throw new Error("Isi minimal kecamatan atau kota/kabupaten dulu.");
  for (const [index, query] of queries.entries()) {
    if (index) await wait(1100); // Nominatim allows at most one request per second.
    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      countrycodes: "id",
      "accept-language": "id",
      q: query,
    });
    const rows = await getJson(`${BASE}/search?${params}`, { fetchImpl, signal });
    const hit = Array.isArray(rows) ? rows[0] : null;
    if (hit) {
      const point = validateCoordinates({ lat: Number(hit.lat), lng: Number(hit.lon) });
      return { point, address: addressFromNominatim(hit.address) };
    }
  }
  throw new Error("Alamat tidak ditemukan di peta. Geser pin secara manual.");
}