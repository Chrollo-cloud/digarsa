import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { sanitizedLocation } from "../catalog/catalog.service.js";
import {
  availabilitySlotSchema,
  createMarketplaceServiceSchema,
  marketplaceServiceListSchema,
  serviceModerationSchema,
  updateServiceActiveSchema,
  updateMarketplaceServiceSchema,
  updateMarketplaceServiceStatusSchema,
  updateServiceVisibilitySchema,
} from "./service.schema.js";

function auth(res: Response) {
  return res.locals.auth as { userId: string };
}

function raiseValidation(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(400, "VALIDATION_ERROR", "Data yang dikirim tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function serviceId(req: Request) {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) throw new HttpError(400, "SERVICE_ID_REQUIRED", "ID layanan wajib diisi.");
  return id;
}

const serviceCard = {
  category: true,
  serviceImages: { orderBy: { position: "asc" as const } },
  seller: {
    select: {
      id: true, userId: true, displayName: true, category: true, city: true, image: true,
      bio: true, specialties: true, portfolioLink: true, publicLocation: true,
    },
  },
};
type ServiceWithCard = Prisma.ServiceGetPayload<{ include: typeof serviceCard }>;

function toFrontendService(row: ServiceWithCard, publicView = false) {
  const seller = row.seller;
  const serviceLocation = publicView
    ? row.delivery === "Onsite" ? sanitizedLocation(row.serviceLocation ?? seller.publicLocation) : null
    : row.serviceLocation;
  return {
    id: row.id,
    ...(!publicView ? { ownerUserId: seller.userId } : {}),
    creatorId: seller.id,
    title: row.title,
    category: row.category.name,
    studio: seller.displayName,
    price: row.price,
    availability: row.status === "FULL_BOOK" ? "Full-book" : "Open",
    delivery: row.delivery,
    turnaround: row.turnaround,
    description: row.description,
    image: row.image ?? row.serviceImages[0]?.url ?? "",
    images: row.image ? [{ src: row.image, alt: `Contoh pekerjaan ${row.title}` }] : row.serviceImages.map((image) => ({ src: image.url, alt: `Contoh pekerjaan ${row.title}` })),
    active: row.active,
    hidden: row.isHidden || row.moderationStatus !== "APPROVED",
    ...(!publicView ? { hiddenReason: row.moderationNote ?? "", moderationStatus: row.moderationStatus } : {}),
    serviceLocation,
    publicLocation: sanitizedLocation(seller.publicLocation),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    avgRating: row.avgRating,
    reviewCount: row.reviewCount,
  };
}

function jsonColumn(value: unknown) {
  return value === null ? Prisma.DbNull : value as Prisma.InputJsonValue;
}

function timeDate(value: string) {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function isSerializationConflict(error: unknown, seen = new Set<object>()): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return true;
  }

  if (typeof error !== "object" || error === null) return false;
  if (seen.has(error)) return false;
  seen.add(error);
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  if (candidate.code === "40001" || candidate.meta?.code === "40001") return true;
  return candidate.cause !== undefined
    && isSerializationConflict(candidate.cause, seen);
}

async function withAvailabilityConflictHandling<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isSerializationConflict(error)) {
      throw new HttpError(
        409,
        "AVAILABILITY_CONFLICT",
        "Jadwal berubah karena permintaan lain. Muat ulang jadwal lalu coba kembali.",
      );
    }
    throw error;
  }
}

function slotDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function slotTime(value: Date) {
  return value.toISOString().slice(11, 16);
}

function toFrontendSlot(slot: { id: string; serviceId: string; sellerId: string; date: Date; startTime: Date; endTime: Date; note: string; createdAt: Date; updatedAt: Date }, ownerUserId: string) {
  return {
    id: slot.id,
    serviceId: slot.serviceId,
    ownerUserId,
    creatorId: slot.sellerId,
    date: slotDate(slot.date),
    startTime: slotTime(slot.startTime),
    endTime: slotTime(slot.endTime),
    note: slot.note,
    createdAt: slot.createdAt.toISOString(),
    updatedAt: slot.updatedAt.toISOString(),
  };
}

export async function listCategories(_req: Request, res: Response) {
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  res.status(200).json({ data: categories.map((category) => category.name) });
}

export async function listServices(req: Request, res: Response) {
  const parsed = marketplaceServiceListSchema.safeParse(req.query);
  if (!parsed.success) raiseValidation(parsed.error);
  const { q, category, region, minPrice, maxPrice, sort, page, limit } = parsed.data;
  const where = {
    moderationStatus: "APPROVED" as const,
    isHidden: false,
    active: true,
    seller: { is: { verificationStatus: "APPROVED" as const, user: { is: { accountStatus: "ACTIVE" as const } } } },
    category: { is: { isActive: true, ...(category ? { name: category } : {}) } },
    ...(region ? { region: { contains: region, mode: "insensitive" as const } } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const orderBy = sort === "price_asc" ? { price: "asc" as const }
    : sort === "price_desc" ? { price: "desc" as const }
      : sort === "rating" ? { avgRating: "desc" as const }
        : { createdAt: "desc" as const };
  const [items, total] = await prisma.$transaction([
    prisma.service.findMany({ where, include: serviceCard, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.service.count({ where }),
  ]);
  res.status(200).json({ data: { items: items.map((item) => toFrontendService(item, true)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
}

export async function createService(req: Request, res: Response) {
  const parsed = createMarketplaceServiceSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const sellerId = res.locals.sellerProfileId as string;
  const [seller, category] = await Promise.all([
    prisma.sellerProfile.findUnique({ where: { id: sellerId }, select: { region: true } }),
    prisma.category.findUnique({ where: { name: parsed.data.category }, select: { id: true, isActive: true } }),
  ]);
  if (!seller) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");
  if (!category?.isActive) throw new HttpError(400, "INVALID_CATEGORY", "Kategori tidak tersedia.");
  const input = parsed.data;
  const service = await prisma.service.create({
    data: {
      sellerId,
      categoryId: category.id,
      title: input.title,
      description: input.description,
      price: input.price,
      delivery: input.delivery,
      turnaround: input.turnaround,
      image: input.image,
      region: seller.region,
      status: input.availability === "Full-book" ? "FULL_BOOK" : "OPEN",
      active: true,
      ...(input.serviceLocation !== undefined ? { serviceLocation: jsonColumn(input.serviceLocation) } : {}),
    },
    include: serviceCard,
  });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: "SERVICE_CREATED", targetType: "SERVICE", targetId: service.id } });
  res.status(201).json({ data: toFrontendService(service) });
}

export async function getMyServices(_req: Request, res: Response) {
  const sellerId = res.locals.sellerProfileId as string;
  const services = await prisma.service.findMany({ where: { sellerId }, include: serviceCard, orderBy: { createdAt: "desc" } });
  res.status(200).json({ data: services.map((service) => toFrontendService(service)) });
}

export async function getServiceById(req: Request, res: Response) {
  const item = await prisma.service.findFirst({
    where: {
      id: serviceId(req), moderationStatus: "APPROVED", isHidden: false, active: true,
      seller: { is: { verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } } },
      category: { is: { isActive: true } },
    },
    include: serviceCard,
  });
  if (!item) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  res.status(200).json({ data: toFrontendService(item, true) });
}

export async function updateService(req: Request, res: Response) {
  const parsed = updateMarketplaceServiceSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  const [existing, category] = await Promise.all([
    prisma.service.findUnique({ where: { id }, include: { category: { select: { id: true, name: true } } } }),
    parsed.data.category ? prisma.category.findUnique({ where: { name: parsed.data.category }, select: { id: true, isActive: true } }) : null,
  ]);
  if (!existing) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  if (existing.sellerId !== sellerId) throw new HttpError(403, "FORBIDDEN", "Anda tidak memiliki akses ke layanan ini.");
  if (parsed.data.category && !category?.isActive) throw new HttpError(400, "INVALID_CATEGORY", "Kategori tidak tersedia.");
  const contentChanged = (parsed.data.title !== undefined && parsed.data.title !== existing.title)
    || (parsed.data.description !== undefined && parsed.data.description !== existing.description)
    || (parsed.data.image !== undefined && parsed.data.image !== existing.image)
    || (parsed.data.delivery !== undefined && parsed.data.delivery !== existing.delivery)
    || (parsed.data.turnaround !== undefined && parsed.data.turnaround !== existing.turnaround)
    || (parsed.data.category !== undefined && parsed.data.category !== existing.category.name);
  const input = parsed.data;
  const updated = await prisma.service.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.category !== undefined && category ? { categoryId: category.id } : {}),
      ...(input.delivery !== undefined ? { delivery: input.delivery } : {}),
      ...(input.turnaround !== undefined ? { turnaround: input.turnaround } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.availability !== undefined ? { status: input.availability === "Full-book" ? "FULL_BOOK" : "OPEN" } : {}),
      ...(Object.hasOwn(input, "serviceLocation") ? { serviceLocation: jsonColumn(input.serviceLocation) } : {}),
      ...(contentChanged ? { moderationStatus: "PENDING", moderationNote: null, moderatedById: null, moderatedAt: null } : {}),
    },
    include: serviceCard,
  });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: "SERVICE_UPDATED", targetType: "SERVICE", targetId: id } });
  res.status(200).json({ data: toFrontendService(updated) });
}

async function ownedService(id: string, sellerId: string) {
  const service = await prisma.service.findUnique({ where: { id }, select: { id: true, sellerId: true } });
  if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  if (service.sellerId !== sellerId) throw new HttpError(403, "FORBIDDEN", "Anda tidak memiliki akses ke layanan ini.");
}

export async function updateServiceStatus(req: Request, res: Response) {
  const parsed = updateMarketplaceServiceStatusSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const availability = parsed.data.availability;
  const updated = await prisma.service.update({ where: { id }, data: { status: availability === "Full-book" || availability === "FULL_BOOK" ? "FULL_BOOK" : "OPEN" }, include: serviceCard });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: "SERVICE_AVAILABILITY_UPDATED", targetType: "SERVICE", targetId: id } });
  res.status(200).json({ data: toFrontendService(updated) });
}

export async function updateServiceVisibility(req: Request, res: Response) {
  const parsed = updateServiceVisibilitySchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const updated = await prisma.service.update({ where: { id }, data: parsed.data, include: serviceCard });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: parsed.data.isHidden ? "SERVICE_HIDDEN" : "SERVICE_UNHIDDEN", targetType: "SERVICE", targetId: id } });
  res.status(200).json({ data: toFrontendService(updated) });
}

export async function updateServiceActive(req: Request, res: Response) {
  const parsed = updateServiceActiveSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const updated = await prisma.service.update({ where: { id }, data: { active: parsed.data.active }, include: serviceCard });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: parsed.data.active ? "SERVICE_ACTIVATED" : "SERVICE_DEACTIVATED", targetType: "SERVICE", targetId: id } });
  res.status(200).json({ data: toFrontendService(updated) });
}

export async function deleteService(req: Request, res: Response) {
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const activeCount = await prisma.booking.count({ where: { serviceId: id, status: { in: ["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"] } } });
  if (activeCount > 0) throw new HttpError(409, "ACTIVE_BOOKINGS_EXIST", "Layanan masih memiliki booking aktif.");
  const bookingCount = await prisma.booking.count({ where: { serviceId: id } });
  const retainedForBookingHistory = bookingCount > 0;
  if (retainedForBookingHistory) await prisma.service.update({ where: { id }, data: { active: false } });
  else await prisma.service.delete({ where: { id } });
  await prisma.activityLog.create({ data: { userId: auth(res).userId, action: retainedForBookingHistory ? "SERVICE_DEACTIVATED" : "SERVICE_DELETED", targetType: "SERVICE", targetId: id } });
  res.status(200).json({ data: { message: retainedForBookingHistory ? "Layanan dinonaktifkan karena memiliki riwayat booking." : "Layanan berhasil dihapus." } });
}

export async function listServicesForModeration(req: Request, res: Response) {
  const status = req.query.status;
  const parsedStatus = status === undefined ? "PENDING" : status;
  if (typeof parsedStatus !== "string" || !["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(parsedStatus)) throw new HttpError(400, "VALIDATION_ERROR", "Status moderasi tidak valid.");
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "VALIDATION_ERROR", "Pagination tidak valid.");
  const where = { moderationStatus: parsedStatus as "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" };
  const [items, total] = await prisma.$transaction([
    prisma.service.findMany({ where, include: serviceCard, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.service.count({ where }),
  ]);
  res.status(200).json({ data: { items: items.map((item) => toFrontendService(item)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
}

export async function moderateService(req: Request, res: Response) {
  const parsed = serviceModerationSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const existing = await prisma.service.findUnique({ where: { id }, select: { id: true, sellerId: true } });
  if (!existing) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  const seller = await prisma.sellerProfile.findUnique({ where: { id: existing.sellerId }, select: { userId: true } });
  if (!seller) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");
  const adminId = auth(res).userId;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.service.update({ where: { id }, data: { moderationStatus: parsed.data.status, moderationNote: parsed.data.note ?? null, moderatedById: adminId, moderatedAt: new Date() }, select: { id: true, moderationStatus: true, moderationNote: true, moderatedAt: true } });
    await tx.notification.create({ data: { userId: seller.userId, type: "SERVICE_MODERATION", title: parsed.data.status === "APPROVED" ? "Layanan disetujui" : "Status layanan diperbarui", body: parsed.data.note ?? `Status moderasi layanan: ${parsed.data.status}.`, refId: id } });
    await tx.activityLog.create({ data: { userId: adminId, action: `SERVICE_MODERATION_${parsed.data.status}`, targetType: "SERVICE", targetId: id } });
    return updated;
  });
  res.status(200).json({ data: result });
}

export async function listAvailability(req: Request, res: Response) {
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const slots = await prisma.sellerAvailabilitySlot.findMany({ where: { serviceId: id, sellerId }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  res.status(200).json({ data: slots.map((slot) => toFrontendSlot(slot, auth(res).userId)) });
}

export async function createAvailability(req: Request, res: Response) {
  const parsed = availabilitySlotSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const slot = await withAvailabilityConflictHandling(() => prisma.$transaction(async (tx) => {
    const overlap = await tx.sellerAvailabilitySlot.findFirst({
      where: { serviceId: id, date, startTime: { lt: timeDate(parsed.data.endTime) }, endTime: { gt: timeDate(parsed.data.startTime) } },
      select: { id: true },
    });
    if (overlap) throw new HttpError(409, "AVAILABILITY_OVERLAP", "Jadwal bertabrakan dengan slot yang sudah dibuat.");
    return tx.sellerAvailabilitySlot.create({ data: { serviceId: id, sellerId, date, startTime: timeDate(parsed.data.startTime), endTime: timeDate(parsed.data.endTime), note: parsed.data.note } });
  }, { isolationLevel: "Serializable" }));
  res.status(201).json({ data: toFrontendSlot(slot, auth(res).userId) });
}

export async function updateAvailability(req: Request, res: Response) {
  const parsed = availabilitySlotSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const id = serviceId(req);
  const slotId = typeof req.params.slotId === "string" ? req.params.slotId : "";
  if (!slotId) throw new HttpError(400, "SLOT_ID_REQUIRED", "ID jadwal wajib diisi.");
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const slot = await withAvailabilityConflictHandling(() => prisma.$transaction(async (tx) => {
    const existing = await tx.sellerAvailabilitySlot.findFirst({ where: { id: slotId, serviceId: id, sellerId }, select: { id: true } });
    if (!existing) throw new HttpError(404, "AVAILABILITY_NOT_FOUND", "Jadwal tidak ditemukan.");
    const overlap = await tx.sellerAvailabilitySlot.findFirst({
      where: { id: { not: slotId }, serviceId: id, date, startTime: { lt: timeDate(parsed.data.endTime) }, endTime: { gt: timeDate(parsed.data.startTime) } },
      select: { id: true },
    });
    if (overlap) throw new HttpError(409, "AVAILABILITY_OVERLAP", "Jadwal bertabrakan dengan slot yang sudah dibuat.");
    return tx.sellerAvailabilitySlot.update({ where: { id: slotId }, data: { date, startTime: timeDate(parsed.data.startTime), endTime: timeDate(parsed.data.endTime), note: parsed.data.note } });
  }, { isolationLevel: "Serializable" }));
  res.status(200).json({ data: toFrontendSlot(slot, auth(res).userId) });
}

export async function removeAvailability(req: Request, res: Response) {
  const id = serviceId(req);
  const slotId = typeof req.params.slotId === "string" ? req.params.slotId : "";
  if (!slotId) throw new HttpError(400, "SLOT_ID_REQUIRED", "ID jadwal wajib diisi.");
  const sellerId = res.locals.sellerProfileId as string;
  await ownedService(id, sellerId);
  const result = await prisma.sellerAvailabilitySlot.deleteMany({ where: { id: slotId, serviceId: id, sellerId } });
  if (!result.count) throw new HttpError(404, "AVAILABILITY_NOT_FOUND", "Jadwal tidak ditemukan.");
  res.status(200).json({ data: { message: "Jadwal berhasil dihapus." } });
}
