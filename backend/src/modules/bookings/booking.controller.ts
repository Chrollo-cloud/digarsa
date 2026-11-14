import type { Request, Response } from "express";
import { BookingStatus, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import {
  bookingDraftSchema,
  bookingListQuerySchema,
  createBookingSchema,
  customerCompletionSchema,
  transitionSchema,
} from "./booking.schema.js";

const bookingInclude = {
  payment: { select: { status: true, payoutStatus: true, amount: true, paidAt: true } },
} satisfies Prisma.BookingInclude;

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function validationError(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Data booking tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) validationError(result.error);
  return result.data as T;
}

function statusName(status: BookingStatus) {
  return status[0] + status.slice(1).toLowerCase();
}

function statusValue(status?: string) {
  return status ? status.toUpperCase() as BookingStatus : undefined;
}

function toDto(booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  return {
    id: booking.id,
    customer_user_id: booking.customerId,
    seller_profile_id: booking.sellerId,
    service_id: booking.serviceId,
    service_title: booking.serviceTitle ?? "",
    seller_name: booking.sellerName ?? "",
    estimated_price: booking.price,
    delivery_mode: (booking.deliveryMode ?? "Remote").toLowerCase(),
    requested_date: booking.scheduledDate?.toISOString().slice(0, 10) ?? null,
    location: booking.location,
    requirements: booking.requirements ?? "",
    description: booking.description ?? "",
    status: statusName(booking.status),
    created_at: booking.createdAt.toISOString(),
    updated_at: booking.updatedAt.toISOString(),
    decline_reason: booking.declineReason,
    delivered_at: booking.deliveredAt?.toISOString() ?? null,
    completed_at: booking.completedAt?.toISOString() ?? null,
    payment: booking.payment ? {
      status: booking.payment.status,
      payout_status: booking.payment.payoutStatus,
      amount: booking.payment.amount,
      paid_at: booking.payment.paidAt?.toISOString() ?? null,
    } : null,
  };
}

async function validateBookableService(serviceId: string, userId: string) {
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      active: true,
      isHidden: false,
      status: "OPEN",
      moderationStatus: "APPROVED",
      category: { is: { isActive: true } },
      seller: { is: { user: { is: { accountStatus: "ACTIVE" } } } },
    },
    select: {
      id: true, title: true, price: true, delivery: true, status: true,
      sellerId: true,
      seller: { select: { displayName: true, userId: true } },
    },
  });
  if (!service) throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Layanan tidak tersedia untuk menerima pesanan.");
  if (service.seller.userId === userId) throw new HttpError(422, "SELF_BOOKING", "Anda tidak dapat memesan layanan milik sendiri.");
  if (!Number.isSafeInteger(service.price) || service.price < 0) {
    throw new HttpError(503, "CATALOG_UNAVAILABLE", "Harga layanan tidak dapat diverifikasi saat ini.");
  }
  if (service.delivery !== "Remote" && service.delivery !== "Onsite") {
    throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Mode layanan belum valid untuk menerima pesanan.");
  }
  return service;
}

function validateModeBrief(delivery: string, input: { requested_date: string | null; location: string | null }) {
  if (delivery === "Onsite" && !input.requested_date) {
    throw new HttpError(422, "VALIDATION_FAILED", "Tanggal wajib diisi untuk layanan onsite.", [{ field: "requested_date", message: "Tanggal wajib diisi untuk layanan onsite." }]);
  }
  if (delivery === "Onsite" && !input.location) {
    throw new HttpError(422, "VALIDATION_FAILED", "Lokasi wajib diisi untuk layanan onsite.", [{ field: "location", message: "Lokasi wajib diisi untuk layanan onsite." }]);
  }
  return delivery === "Onsite" ? input.location : null;
}

export async function validateBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const serviceId = typeof req.params.service_id === "string" ? req.params.service_id : "";
  if (!serviceId) throw new HttpError(404, "SERVICE_NOT_BOOKABLE", "Layanan tidak tersedia untuk menerima pesanan.");
  const input = parse<ReturnType<typeof bookingDraftSchema.parse>>(bookingDraftSchema, req.body);
  const service = await validateBookableService(serviceId, userId);
  validateModeBrief(service.delivery, input);
  res.status(200).json({ data: {
    valid: true,
    service_id: service.id,
    estimated_price: service.price,
    delivery_mode: service.delivery.toLowerCase(),
  } });
}

export async function createBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const input = parse<ReturnType<typeof createBookingSchema.parse>>(createBookingSchema, req.body);
  const service = await validateBookableService(input.service_id, userId);
  const privateLocation = validateModeBrief(service.delivery, input);
  const requestedDate = input.requested_date ? new Date(`${input.requested_date}T00:00:00.000Z`) : null;

  const booking = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${service.id} FOR UPDATE`;
    const currentService = await tx.service.findFirst({
      where: {
        id: service.id,
        active: true,
        isHidden: false,
        status: "OPEN",
        moderationStatus: "APPROVED",
        category: { is: { isActive: true } },
        seller: { is: { user: { is: { accountStatus: "ACTIVE" } } } },
      },
      select: { id: true, title: true, price: true, delivery: true, sellerId: true, seller: { select: { displayName: true, userId: true } } },
    });
    if (!currentService || currentService.seller.userId === userId || currentService.delivery !== service.delivery) {
      throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Layanan berubah dan tidak dapat menerima pesanan.");
    }
    const created = await tx.booking.create({
      data: {
        serviceId: currentService.id,
        customerId: userId,
        sellerId: currentService.sellerId,
        serviceTitle: currentService.title,
        sellerName: currentService.seller.displayName,
        deliveryMode: currentService.delivery,
        requirements: input.requirements,
        description: input.description,
        location: privateLocation,
        scheduledDate: requestedDate,
        status: "REQUESTED",
        price: currentService.price,
        fee: 0,
        total: currentService.price,
      },
      include: bookingInclude,
    });
    await tx.bookingStatusEvent.create({ data: {
      bookingId: created.id,
      fromStatus: null,
      toStatus: "REQUESTED",
      actorUserId: userId,
      source: "CUSTOMER",
    } });
    await tx.notification.create({ data: {
      userId: currentService.seller.userId,
      type: "BOOKING_UPDATE",
      title: "Pesanan baru",
      body: `${currentService.title} menerima permintaan pesanan baru.`,
      refId: created.id,
    } });
    return created;
  });
  res.status(201).json({ data: toDto(booking) });
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const [date, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(date ?? "");
    if (!date || !id || !Number.isFinite(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor daftar pesanan tidak valid.");
  }
}

async function listBookings(req: Request, res: Response, owner: { customerId: string } | { sellerId: string }) {
  const query = parse<ReturnType<typeof bookingListQuerySchema.parse>>(bookingListQuerySchema, req.query);
  const cursor = decodeCursor(query.cursor);
  const where: Prisma.BookingWhereInput = {
    ...owner,
    ...(query.status ? { status: statusValue(query.status) } : {}),
    ...(cursor ? { OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] } : {}),
  };
  const countWhere = { ...owner, ...(query.status ? { status: statusValue(query.status) } : {}) } as Prisma.BookingWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.booking.findMany({ where, include: bookingInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1 }),
    prisma.booking.count({ where: countWhere }),
  ]);
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);
  const nextCursor = hasMore && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") : null;
  res.status(200).json({ data: pageRows.map(toDto), page: { next_cursor: nextCursor, has_more: hasMore }, total });
}

export async function listCustomerBookings(req: Request, res: Response) {
  await listBookings(req, res, { customerId: currentUserId(res) });
}

export async function listSellerBookings(req: Request, res: Response) {
  await listBookings(req, res, { sellerId: res.locals.sellerProfileId as string });
}

async function getOwnedBooking(id: string, where: Prisma.BookingWhereInput) {
  const booking = await prisma.booking.findFirst({ where: { id, ...where }, include: bookingInclude });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  return booking;
}

export async function getCustomerBooking(req: Request, res: Response) {
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const booking = await getOwnedBooking(id, { customerId: currentUserId(res) });
  res.status(200).json({ data: toDto(booking) });
}

export async function getSellerBooking(req: Request, res: Response) {
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const booking = await getOwnedBooking(id, { sellerId: res.locals.sellerProfileId as string });
  res.status(200).json({ data: toDto(booking) });
}

async function sellerTransition(req: Request, res: Response, action: "accept" | "decline" | "deliver") {
  const sellerId = res.locals.sellerProfileId as string;
  const userId = currentUserId(res);
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const input = parse<ReturnType<typeof transitionSchema.parse>>(transitionSchema, req.body);
  const expected = statusValue(input.expected_status)!;
  const toStatus: BookingStatus = action === "accept" ? "ACCEPTED" : action === "decline" ? "DECLINED" : "DELIVERED";
  const validExpected: BookingStatus = action === "deliver" ? "PAID" : "REQUESTED";
  if (expected !== validExpected) throw new HttpError(422, "VALIDATION_FAILED", "expected_status tidak sesuai dengan tindakan.");
  if (action === "decline" && input.reason && input.reason.length < 3) {
    throw new HttpError(422, "VALIDATION_FAILED", "Alasan penolakan harus berisi minimal 3 karakter.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, sellerId }, include: bookingInclude });
    if (!existing) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    if (existing.status !== validExpected) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah atau tindakan ini tidak tersedia.");
    if (action === "deliver" && existing.payment?.status !== "PAID") {
      throw new HttpError(409, "PAYMENT_NOT_CONFIRMED", "Pesanan belum memiliki konfirmasi pembayaran tepercaya.");
    }
    const won = await tx.booking.updateMany({
      where: { id, sellerId, status: validExpected },
      data: {
        status: toStatus,
        declineReason: action === "decline" ? input.reason ?? null : null,
        ...(action === "deliver" ? { deliveredAt: new Date() } : {}),
      },
    });
    if (won.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
    const result = await tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
    await tx.bookingStatusEvent.create({ data: {
      bookingId: id,
      fromStatus: validExpected,
      toStatus,
      actorUserId: userId,
      source: "SELLER",
    } });
    await tx.notification.create({ data: {
      userId: existing.customerId,
      type: "BOOKING_UPDATE",
      title: action === "accept" ? "Pesanan diterima" : action === "decline" ? "Pesanan ditolak" : "Hasil pesanan dikirim",
      body: action === "decline" ? input.reason ?? "Seller menolak pesanan." : null,
      refId: id,
    } });
    return result;
  });
  res.status(200).json({ data: toDto(updated) });
}

export async function acceptBooking(req: Request, res: Response) { await sellerTransition(req, res, "accept"); }
export async function declineBooking(req: Request, res: Response) { await sellerTransition(req, res, "decline"); }
export async function deliverBooking(req: Request, res: Response) { await sellerTransition(req, res, "deliver"); }

export async function completeBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const input = parse<ReturnType<typeof customerCompletionSchema.parse>>(customerCompletionSchema, req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, customerId: userId }, include: bookingInclude });
    if (!existing) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    if (existing.status !== "DELIVERED" || input.expected_status !== statusName(existing.status)) {
      throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Pesanan hanya dapat dikonfirmasi selesai setelah hasil dikirim seller.");
    }
    const won = await tx.booking.updateMany({
      where: { id, customerId: userId, status: "DELIVERED" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (won.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
    if (existing.payment?.status === "PAID" && existing.payment.payoutStatus === "HELD") {
      await tx.payment.update({ where: { bookingId: id }, data: { payoutStatus: "ELIGIBLE" } });
    }
    await tx.bookingStatusEvent.create({ data: {
      bookingId: id,
      fromStatus: "DELIVERED",
      toStatus: "COMPLETED",
      actorUserId: userId,
      source: "CUSTOMER",
    } });
    await tx.notification.create({ data: {
      userId: (await tx.sellerProfile.findUniqueOrThrow({ where: { id: existing.sellerId }, select: { userId: true } })).userId,
      type: "BOOKING_UPDATE",
      title: "Pesanan dikonfirmasi selesai",
      refId: id,
    } });
    return tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
  });
  res.status(200).json({ data: toDto(updated) });
}