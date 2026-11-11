import { Prisma } from "../../generated/prisma/client.js";

export const publicServiceInclude = {
  category: true,
  serviceImages: { orderBy: { position: "asc" as const } },
  seller: {
    select: {
      id: true,
      displayName: true,
      category: true,
      city: true,
      image: true,
      bio: true,
      specialties: true,
      portfolioLink: true,
      publicLocation: true,
      verificationStatus: true,
      user: { select: { accountStatus: true } },
    },
  },
} satisfies Prisma.ServiceInclude;

export type PublicServiceRow = Prisma.ServiceGetPayload<{ include: typeof publicServiceInclude }>;

export const visibleCatalogWhere = {
  active: true,
  isHidden: false,
  moderationStatus: "APPROVED",
  category: { is: { isActive: true } },
  seller: { is: { verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } } },
} satisfies Prisma.ServiceWhereInput;

export function sanitizedLocation(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const location = value as Record<string, Prisma.JsonValue>;
  if (location.visibility === "hidden") return null;
  if (location.visibility === "area" && typeof location.area === "string") {
    return { visibility: "area", area: location.area };
  }
  if (location.visibility === "pin" && typeof location.area === "string" && location.coordinates && typeof location.coordinates === "object" && !Array.isArray(location.coordinates)) {
    const coordinates = location.coordinates as Record<string, Prisma.JsonValue>;
    const lat = coordinates.lat;
    const lng = coordinates.lng;
    if (typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90
      && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      return { visibility: "pin", area: location.area, coordinates: { lat, lng } };
    }
  }
  return null;
}

export function isCatalogVisible(row: PublicServiceRow) {
  return row.active && !row.isHidden && row.moderationStatus === "APPROVED"
    && row.category.isActive && row.seller.verificationStatus === "APPROVED" && row.seller.user.accountStatus === "ACTIVE";
}

export function toPublicService(row: PublicServiceRow) {
  const image = row.image ?? row.serviceImages[0]?.url ?? null;
  const images = row.serviceImages.map((item) => ({ src: item.url, alt: `Contoh pekerjaan ${row.title}` }));
  if (!images.length && image) images.push({ src: image, alt: `Contoh pekerjaan ${row.title}` });
  const internalLocation = row.serviceLocation ?? row.seller.publicLocation;
  return {
    id: row.id,
    seller_profile_id: row.sellerId,
    title: row.title,
    category: row.category.name,
    description: row.description,
    price: row.price,
    delivery: row.delivery,
    turnaround: row.turnaround,
    availability: row.status === "FULL_BOOK" ? "Full-book" : "Open",
    image_url: image,
    active: row.active,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    studio: row.seller.displayName,
    city: row.seller.city,
    public_location: row.delivery === "Onsite" ? sanitizedLocation(internalLocation) : null,
    bookable: isCatalogVisible(row) && row.status === "OPEN",
    source: "seller" as const,
    alt: image ? `Contoh pekerjaan ${row.title}` : null,
    images,
    avg_rating: row.avgRating,
    review_count: row.reviewCount,
  };
}

export function toPublicCreatorLocation(value: Prisma.JsonValue | null) {
  return sanitizedLocation(value);
}
