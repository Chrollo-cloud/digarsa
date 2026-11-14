import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../lib/http.js";
import { sellerApplicationSchema } from "./seller.schema.js";

export async function buildSellerActivationSnapshot(tx: Prisma.TransactionClient, sellerId: string) {
  const seller = await tx.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      displayName: true,
      category: true,
      city: true,
      bio: true,
      image: true,
      specialties: true,
      portfolioLink: true,
      portfolioItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, description: true, imageUrl: true },
      },
      services: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          delivery: true,
          turnaround: true,
          image: true,
          status: true,
          active: true,
          category: { select: { name: true } },
        },
      },
    },
  });
  if (!seller) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");

  const profileValidation = sellerApplicationSchema.safeParse({
    name: seller.displayName,
    category: seller.category,
    city: seller.city,
    bio: seller.bio,
    ...(seller.image ? { image: seller.image } : {}),
    specialties: seller.specialties,
    ...(seller.portfolioLink ? { portfolioLink: seller.portfolioLink } : {}),
  });
  if (!profileValidation.success) {
    throw new HttpError(
      422,
      "SELLER_PROFILE_INCOMPLETE",
      "Lengkapi profil seller sesuai persyaratan profil sebelum meminta review.",
      profileValidation.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    );
  }

  for (const [index, item] of seller.portfolioItems.entries()) {
    let image: URL;
    try { image = new URL(item.imageUrl); }
    catch { throw new HttpError(422, "SELLER_PORTFOLIO_INVALID", "Perbaiki URL pada item portfolio sebelum meminta review.", [{ field: `portfolio.${index}.image_url`, message: "URL portfolio tidak valid." }]); }
    if (!["http:", "https:"].includes(image.protocol) || image.username || image.password) {
      throw new HttpError(422, "SELLER_PORTFOLIO_INVALID", "Perbaiki URL pada item portfolio sebelum meminta review.", [{ field: `portfolio.${index}.image_url`, message: "URL portfolio harus memakai HTTP atau HTTPS tanpa kredensial." }]);
    }
  }

  const profileSnapshot = {
    display_name: seller.displayName,
    category: seller.category,
    city: seller.city,
    bio: seller.bio,
    image: seller.image,
    specialties: seller.specialties,
    portfolio_link: seller.portfolioLink,
  };
  const portfolioSnapshot = seller.portfolioItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    image_url: item.imageUrl,
  }));
  const serviceOffersSnapshot = seller.services.map((service) => ({
    id: service.id,
    title: service.title,
    category: service.category.name,
    description: service.description,
    price: service.price,
    delivery: service.delivery,
    turnaround: service.turnaround,
    image: service.image,
    availability: service.status,
    active: service.active,
  }));
  const snapshot = { profile: profileSnapshot, portfolio: portfolioSnapshot, service_offers: serviceOffersSnapshot };
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  return { profileSnapshot, portfolioSnapshot, serviceOffersSnapshot, snapshotHash };
}
