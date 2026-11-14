import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { visibleCatalogWhere } from "../catalog/catalog.service.js";
import { createReviewSchema, reviewListQuerySchema, updateReviewSchema } from "./review.schema.js";

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function raiseValidation(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Data review tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) raiseValidation(result.error);
  return result.data as T;
}

function parseListQuery(value: unknown) {
  const result = reviewListQuerySchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Parameter pagination review tidak valid.", result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid cursor encoding");
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = value.lastIndexOf("|");
    if (separator < 1 || separator === value.length - 1) throw new Error("invalid cursor shape");
    const date = value.slice(0, separator);
    const id = value.slice(separator + 1);
    const createdAt = new Date(date);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== date) throw new Error("invalid cursor date");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor review tidak valid.");
  }
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function reviewId(req: Request) {
  const id = typeof req.params.review_id === "string" ? req.params.review_id : "";
  if (!id) throw new HttpError(404, "REVIEW_NOT_FOUND", "Review tidak ditemukan.");
  return id;
}

function averageRating(value: number | null, count: number) {
  return count === 0 || value === null ? null : Math.round(value * 100) / 100;
}

function publicReview(review: { id: string; rating: number; comment: string | null; createdAt: Date }) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.createdAt.toISOString(),
  };
}

async function refreshServiceRating(tx: Prisma.TransactionClient, serviceId: string) {
  const aggregate = await tx.review.aggregate({
    where: { serviceId, rating: { gte: 1, lte: 5 } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.service.update({
    where: { id: serviceId },
    data: {
      avgRating: averageRating(aggregate._avg.rating, aggregate._count._all) ?? 0,
      reviewCount: aggregate._count._all,
    },
  });
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createBookingReview(req: Request, res: Response) {
  const customerId = currentUserId(res);
  const bookingId = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  if (!bookingId) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  const input = parse<ReturnType<typeof createReviewSchema.parse>>(createReviewSchema, req.body);

  try {
    const review = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          customerId: true,
          serviceId: true,
          sellerId: true,
          status: true,
          service: { select: { seller: { select: { userId: true } } } },
        },
      });
      if (!booking || booking.customerId !== customerId) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
      if (booking.status !== "COMPLETED") throw new HttpError(409, "BOOKING_NOT_COMPLETED", "Review hanya dapat diberikan untuk pesanan yang selesai.");
      if (booking.service.seller.userId === customerId) throw new HttpError(422, "SELF_REVIEW_NOT_ALLOWED", "Anda tidak dapat memberi review pada layanan sendiri.");

      const existing = await tx.review.findUnique({ where: { bookingId }, select: { id: true } });
      if (existing) throw new HttpError(409, "REVIEW_ALREADY_EXISTS", "Pesanan ini sudah memiliki review.");

      await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${booking.serviceId} FOR UPDATE`;
      const created = await tx.review.create({
        data: {
          bookingId,
          serviceId: booking.serviceId,
          sellerId: booking.sellerId,
          reviewerId: customerId,
          rating: input.rating,
          comment: input.comment,
        },
        select: { id: true, rating: true, comment: true, createdAt: true, serviceId: true, sellerId: true },
      });
      await refreshServiceRating(tx, booking.serviceId);
      return created;
    });
    res.status(201).json({ data: { ...publicReview(review), service_id: review.serviceId, seller_id: review.sellerId } });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new HttpError(409, "REVIEW_ALREADY_EXISTS", "Pesanan ini sudah memiliki review.");
    throw error;
  }
}

async function listReviews(req: Request, res: Response, where: Prisma.ReviewWhereInput) {
  const query = parseListQuery(req.query);
  const cursor = decodeCursor(query.cursor);
  const cursorWhere: Prisma.ReviewWhereInput | null = cursor ? { OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] } : null;
  const validReviews: Prisma.ReviewWhereInput = { ...where, rating: { gte: 1, lte: 5 } };
  const validPageWhere: Prisma.ReviewWhereInput = cursorWhere ? { AND: [validReviews, cursorWhere] } : validReviews;
  const [rows, total, aggregate] = await prisma.$transaction([
    prisma.review.findMany({
      where: validPageWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { id: true, rating: true, comment: true, createdAt: true },
    }),
    prisma.review.count({ where: validReviews }),
    prisma.review.aggregate({ where: validReviews, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);
  res.status(200).json({
    data: pageRows.map(publicReview),
    page: { next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, has_more: hasMore, limit: query.limit },
    rating: { average: averageRating(aggregate._avg.rating, aggregate._count._all), count: total },
    total,
  });
}

export async function listServiceReviews(req: Request, res: Response) {
  const id = typeof req.params.service_id === "string" ? req.params.service_id : "";
  const service = await prisma.service.findFirst({ where: { id, ...visibleCatalogWhere }, select: { id: true } });
  if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  await listReviews(req, res, { serviceId: id });
}

export async function listSellerReviews(req: Request, res: Response) {
  const id = typeof req.params.seller_id === "string" ? req.params.seller_id : "";
  const seller = await prisma.sellerProfile.findFirst({
    where: { id, verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } },
    select: { id: true },
  });
  if (!seller) throw new HttpError(404, "SELLER_NOT_FOUND", "Profil seller tidak ditemukan.");
  await listReviews(req, res, { sellerId: id });
}

export async function listMyReviews(req: Request, res: Response) {
  const userId = currentUserId(res);
  await listReviews(req, res, { reviewerId: userId, booking: { is: { customerId: userId } } });
}

export async function getPublicReview(req: Request, res: Response) {
  const id = reviewId(req);
  const review = await prisma.review.findFirst({
    where: { id, rating: { gte: 1, lte: 5 }, service: { is: visibleCatalogWhere } },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });
  if (!review) throw new HttpError(404, "REVIEW_NOT_FOUND", "Review tidak ditemukan.");
  res.status(200).json({ data: publicReview(review) });
}

export async function updateMyReview(req: Request, res: Response) {
  const id = reviewId(req);
  const userId = currentUserId(res);
  const input = parse<ReturnType<typeof updateReviewSchema.parse>>(updateReviewSchema, req.body);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Review" WHERE "id" = ${id} AND "reviewerId" = ${userId} FOR UPDATE`;
    const existing = await tx.review.findFirst({ where: { id, reviewerId: userId }, select: { id: true, serviceId: true } });
    if (!existing) throw new HttpError(404, "REVIEW_NOT_FOUND", "Review tidak ditemukan.");
    await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${existing.serviceId} FOR UPDATE`;
    const review = await tx.review.update({ where: { id }, data: input, select: { id: true, rating: true, comment: true, createdAt: true } });
    await refreshServiceRating(tx, existing.serviceId);
    return review;
  });
  res.status(200).json({ data: publicReview(updated) });
}

export async function deleteMyReview(req: Request, res: Response) {
  const id = reviewId(req);
  const userId = currentUserId(res);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Review" WHERE "id" = ${id} AND "reviewerId" = ${userId} FOR UPDATE`;
    const existing = await tx.review.findFirst({ where: { id, reviewerId: userId }, select: { id: true, serviceId: true } });
    if (!existing) throw new HttpError(404, "REVIEW_NOT_FOUND", "Review tidak ditemukan.");
    await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${existing.serviceId} FOR UPDATE`;
    await tx.review.delete({ where: { id } });
    await refreshServiceRating(tx, existing.serviceId);
  });
  res.status(200).json({ data: { id, deleted: true } });
}
