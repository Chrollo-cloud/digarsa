import {
  haversineKm,
  publicLocation,
  validateCoordinates,
} from "./locationModel.js";
const normalize = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("id-ID");
export function discoverServices({
  catalog,
  resolveSellerProfile,
  catalogError = "",
  mode = "onsite",
  query = "",
  category = "",
  city = "",
  origin = null,
  radiusKm = null,
}) {
  if (catalogError)
    throw new Error(
      "Katalog belum dapat diverifikasi. Penemuan lokasi dinonaktifkan sampai data pulih.",
    );
  if (!["onsite", "remote"].includes(mode))
    throw new Error("Pilih jenis layanan yang valid.");
  if (origin) validateCoordinates(origin);
  if (
    radiusKm !== null &&
    (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 20000)
  )
    throw new Error("Radius harus lebih dari 0 hingga 20.000 km.");
  if (radiusKm !== null && (!origin || mode === "remote"))
    throw new Error("Radius memerlukan titik pencarian untuk layanan onsite.");
  const result = [];
  for (const service of catalog) {
    if (
      service.active === false ||
      service.hidden ||
      service.availability !== "Open" ||
      service.delivery?.toLowerCase() !== mode
    )
      continue;
    const seller = resolveSellerProfile(service.creatorId);
    if (!seller || seller.id !== service.creatorId || !seller.ownerUserId)
      continue;
    if (service.ownerUserId && service.ownerUserId !== seller.ownerUserId)
      continue;
    const location =
      mode === "onsite" ? publicLocation(service.publicLocation) : null;
    const area = location?.area || seller.city || "";
    if (category && service.category !== category) continue;
    if (city && !normalize(area).includes(normalize(city))) continue;
    if (
      query &&
      !normalize(
        `${service.title} ${service.category} ${seller.name} ${area}`,
      ).includes(normalize(query))
    )
      continue;
    const coordinates =
      location?.visibility === "pin" ? location.coordinates : null;
    const distance =
      origin && coordinates ? haversineKm(origin, coordinates) : null;
    if (radiusKm !== null && (distance === null || distance > radiusKm))
      continue;
    result.push({
      ...service,
      area,
      coordinates,
      distance,
      sellerName: seller.name,
    });
  }
  return result.sort(
    (a, b) =>
      (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
      a.title.localeCompare(b.title, "id"),
  );
}
