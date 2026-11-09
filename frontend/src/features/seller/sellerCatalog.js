import { publicLocation } from "../location/locationModel.js";
// Pure mapping from seller records (Phase 5 profiles + Phase 7 services) to the
// public shapes that data/marketplace.js already uses. No browser APIs here.
const clip = (value, max) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export function buildOverlay({
  profiles = [],
  records = [],
  hiddenServiceIds = [],
  fallbackImage = "",
}) {
  const creators = profiles.map((profile) => ({
    id: profile.id,
    ownerUserId: profile.ownerUserId,
    name: profile.name,
    role: profile.category,
    city: profile.city,
    image: profile.image || fallbackImage,
    description: clip(profile.bio, 120),
    bio: profile.bio,
    skills: profile.specialties?.length
      ? profile.specialties
      : [profile.category],
    portfolioLink: profile.portfolioLink || "",
    portfolio: [],
    publicLocation: publicLocation(profile.publicLocation),
  }));
  const byId = new Map(creators.map((creator) => [creator.id, creator]));
  const services = records
    .filter((record) => record.active !== false && byId.has(record.creatorId))
    .map((record) => {
      const creator = byId.get(record.creatorId);
      const src = record.image || fallbackImage;
      const alt = `Contoh pekerjaan ${record.title}`;
      return {
        id: record.id,
        title: record.title,
        category: record.category,
        studio: creator.name,
        creatorId: record.creatorId,
        price: record.price,
        availability: record.availability,
        delivery: record.delivery,
        publicLocation:
          record.delivery === "Onsite"
            ? publicLocation(
                record.serviceLocation ??
                  creators.find((row) => row.id === record.creatorId)
                    ?.publicLocation,
              )
            : null,
        turnaround: record.turnaround,
        description: record.description,
        image: src,
        alt,
        images: [{ src, alt }],
        reviews: [],
      };
    });
  return { creators, services, hiddenServiceIds };
}
