import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { publicServiceInclude, toPublicCreatorLocation, toPublicService, visibleCatalogWhere } from "./catalog.service.js";
import { z } from "zod";

const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  min: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  max: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  availability: z.enum(["Open", "Full-book"]).optional(),
  sort: z.enum(["editor", "price-up", "price-down", "rating"]).default("editor"),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).superRefine((value, ctx) => {
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
    ctx.addIssue({ code: "custom", path: ["max"], message: "max harus lebih besar atau sama dengan min." });
  }
});

function invalid(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Filter katalog tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) invalid(result.error);
  return result.data as T;
}

function cursorId(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    if (!value || value.length > 128) throw new Error("invalid cursor");
    return value;
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor katalog tidak valid.");
  }
}

function catalogWhere(query: ReturnType<typeof catalogQuerySchema.parse>): Prisma.ServiceWhereInput {
  const and: Prisma.ServiceWhereInput[] = [
    visibleCatalogWhere,
    {
      ...(query.category ? { category: { is: { isActive: true, name: { equals: query.category, mode: "insensitive" } } } } : {}),
      ...(query.availability ? { status: query.availability === "Open" ? "OPEN" : "FULL_BOOK" } : {}),
      ...(query.min !== undefined || query.max !== undefined ? { price: {
        ...(query.min !== undefined ? { gte: query.min } : {}),
        ...(query.max !== undefined ? { lte: query.max } : {}),
      } } : {}),
      ...(query.city ? { seller: { is: { city: { equals: query.city, mode: "insensitive" }, user: { is: { accountStatus: "ACTIVE" } } } } } : {}),
    },
  ];
  if (query.q) {
    const tokens = query.q.split(/\s+/).filter(Boolean).slice(0, 8);
    and.push({ OR: [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { category: { is: { name: { contains: query.q, mode: "insensitive" } } } },
      { seller: { is: { displayName: { contains: query.q, mode: "insensitive" } } } },
      ...(tokens.length ? [{ seller: { is: { specialties: { hasSome: tokens } } } } as Prisma.ServiceWhereInput] : []),
    ] });
  }
  return { AND: and };
}

function catalogOrder(sort: string): Prisma.ServiceOrderByWithRelationInput[] {
  if (sort === "price-up") return [{ price: "asc" }, { id: "asc" }];
  if (sort === "price-down") return [{ price: "desc" }, { id: "desc" }];
  if (sort === "rating") return [{ avgRating: "desc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

function cursorFilter(sort: string, row: { id: string; price: number; avgRating: number; createdAt: Date }): Prisma.ServiceWhereInput {
  if (sort === "price-up") return { OR: [{ price: { gt: row.price } }, { price: row.price, id: { gt: row.id } }] };
  if (sort === "price-down") return { OR: [{ price: { lt: row.price } }, { price: row.price, id: { lt: row.id } }] };
  if (sort === "rating") return { OR: [{ avgRating: { lt: row.avgRating } }, { avgRating: row.avgRating, id: { lt: row.id } }] };
  return { OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }] };
}

export async function listPublicServices(req: Request, res: Response) {
  const query = parse<ReturnType<typeof catalogQuerySchema.parse>>(catalogQuerySchema, req.query);
  const baseWhere = catalogWhere(query);
  const cursor = cursorId(query.cursor);
  let where = baseWhere;
  if (cursor) {
    const cursorRow = await prisma.service.findUnique({ where: { id: cursor }, select: { id: true, price: true, avgRating: true, createdAt: true } });
    if (!cursorRow) throw new HttpError(400, "INVALID_CURSOR", "Cursor katalog sudah tidak tersedia.");
    where = { AND: [baseWhere, cursorFilter(query.sort, cursorRow)] };
  }
  const [rows, total] = await prisma.$transaction([
    prisma.service.findMany({ where, include: publicServiceInclude, orderBy: catalogOrder(query.sort), take: query.limit + 1 }),
    prisma.service.count({ where: baseWhere }),
  ]);
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items.at(-1);
  res.status(200).json({
    data: items.map(toPublicService),
    page: { next_cursor: hasMore && last ? Buffer.from(last.id).toString("base64url") : null, has_more: hasMore },
    total,
  });
}

export async function getPublicService(req: Request, res: Response) {
  const id = typeof req.params.service_id === "string" ? req.params.service_id : "";
  const service = await prisma.service.findFirst({ where: { id, ...visibleCatalogWhere }, include: publicServiceInclude });
  if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  res.status(200).json({ data: toPublicService(service) });
}

export async function getPublicCreator(req: Request, res: Response) {
  const id = typeof req.params.seller_profile_id === "string" ? req.params.seller_profile_id : "";
  const creator = await prisma.sellerProfile.findFirst({
    where: { id, user: { is: { accountStatus: "ACTIVE" } }, services: { some: visibleCatalogWhere } },
    include: {
      services: { where: visibleCatalogWhere, include: publicServiceInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!creator) throw new HttpError(404, "CREATOR_NOT_FOUND", "Profil kreator tidak ditemukan.");
  const services = creator.services.map(toPublicService);
  const portfolio = services.flatMap((service) => service.image_url ? [{
    image: service.image_url,
    alt: service.alt,
    title: service.title,
    service_id: service.id,
  }] : []);
  res.status(200).json({ data: {
    id: creator.id,
    name: creator.displayName,
    category: creator.category,
    city: creator.city,
    bio: creator.bio ?? "",
    image_url: creator.image,
    portfolio_link: creator.portfolioLink,
    specialties: creator.specialties.length ? creator.specialties : [creator.category],
    public_location: toPublicCreatorLocation(creator.publicLocation),
    services,
    portfolio,
  } });
}

export async function getCatalogFacets(_req: Request, res: Response) {
  const [categories, creators] = await prisma.$transaction([
    prisma.category.findMany({ where: { isActive: true, services: { some: visibleCatalogWhere } }, orderBy: { name: "asc" }, select: { name: true } }),
    prisma.sellerProfile.findMany({
      where: { user: { is: { accountStatus: "ACTIVE" } }, services: { some: visibleCatalogWhere }, city: { not: "" } },
      distinct: ["city"],
      orderBy: { city: "asc" },
      select: { city: true },
    }),
  ]);
  res.status(200).json({ data: { categories: categories.map((item) => item.name), cities: creators.map((item) => item.city) } });
}