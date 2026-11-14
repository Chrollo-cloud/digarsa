import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import {
  activationReviewDecisionSchema,
  activationReviewQueueSchema,
  activationReviewSubmissionSchema,
} from "./activation-review.schema.js";
import { buildSellerActivationSnapshot } from "./activation-review.service.js";

function userId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function sellerProfileId(res: Response) {
  return res.locals.sellerProfileId as string;
}

function validationError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Data review aktivasi seller tidak valid.", issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function safeReviewDto(review: {
  id: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  withdrawnAt: Date | null;
  rejectionReason: string | null;
}) {
  return {
    id: review.id,
    status: review.status,
    submitted_at: review.submittedAt.toISOString(),
    reviewed_at: review.reviewedAt?.toISOString() ?? null,
    withdrawn_at: review.withdrawnAt?.toISOString() ?? null,
    rejection_reason: review.status === "REJECTED" ? review.rejectionReason : null,
  };
}

function adminReviewDto(review: {
  id: string;
  sellerId: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  withdrawnAt: Date | null;
  rejectionReason: string | null;
  profileSnapshot: Prisma.JsonValue;
  portfolioSnapshot: Prisma.JsonValue;
  serviceOffersSnapshot: Prisma.JsonValue;
  seller?: { displayName: string; category: string; city: string };
}) {
  return {
    id: review.id,
    seller_profile_id: review.sellerId,
    status: review.status,
    submitted_at: review.submittedAt.toISOString(),
    reviewed_at: review.reviewedAt?.toISOString() ?? null,
    withdrawn_at: review.withdrawnAt?.toISOString() ?? null,
    rejection_reason: review.rejectionReason,
    ...(review.seller ? { seller: review.seller } : {}),
    profile: review.profileSnapshot,
    portfolio: review.portfolioSnapshot,
    service_offers: review.serviceOffersSnapshot,
  };
}

export async function getMyActivationReview(_req: Request, res: Response) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerProfileId(res) },
    select: { id: true, verificationStatus: true },
  });
  if (!seller) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");

  const latest = await prisma.sellerActivationReview.findFirst({
    where: { sellerId: seller.id },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, submittedAt: true, reviewedAt: true, withdrawnAt: true, rejectionReason: true },
  });
  res.status(200).json({
    data: {
      status: latest?.status ?? (seller.verificationStatus === "APPROVED" ? "APPROVED" : "NOT_SUBMITTED"),
      review: latest ? safeReviewDto(latest) : null,
    },
  });
}

export async function submitActivationReview(req: Request, res: Response) {
  const parsed = activationReviewSubmissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) validationError(parsed.error.issues);
  void parsed;
  const ownerId = sellerProfileId(res);
  const ownerUserId = userId(res);
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${ownerId} FOR UPDATE`;
    const seller = await tx.sellerProfile.findUnique({ where: { id: ownerId }, select: { id: true, userId: true, verificationStatus: true } });
    if (!seller || seller.userId !== ownerUserId) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");
    if (seller.verificationStatus === "APPROVED") throw new HttpError(409, "SELLER_ALREADY_APPROVED", "Profil seller sudah disetujui.");

    const pending = await tx.sellerActivationReview.findFirst({ where: { activeSellerId: seller.id, status: "PENDING" }, select: { id: true } });
    if (pending) throw new HttpError(409, "ACTIVATION_REVIEW_ALREADY_PENDING", "Permintaan review aktivasi seller masih diproses.");

    const previous = await tx.sellerActivationReview.findFirst({ where: { sellerId: seller.id }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], select: { id: true } });
    const snapshot = await buildSellerActivationSnapshot(tx, seller.id);
    const review = await tx.sellerActivationReview.create({
      data: {
        sellerId: seller.id,
        submittedById: ownerUserId,
        status: "PENDING",
        activeSellerId: seller.id,
        profileSnapshot: snapshot.profileSnapshot as Prisma.InputJsonValue,
        portfolioSnapshot: snapshot.portfolioSnapshot as Prisma.InputJsonValue,
        serviceOffersSnapshot: snapshot.serviceOffersSnapshot as Prisma.InputJsonValue,
        snapshotHash: snapshot.snapshotHash,
      },
    });
    const stateChanged = await tx.sellerProfile.updateMany({
      where: { id: seller.id, verificationStatus: { in: ["PENDING", "REJECTED"] } },
      data: { verificationStatus: "PENDING" },
    });
    if (stateChanged.count !== 1) throw new HttpError(409, "SELLER_REVIEW_STATE_CONFLICT", "Status seller berubah; muat ulang sebelum mengajukan review.");

    await tx.activityLog.create({
      data: {
        userId: ownerUserId,
        action: previous ? "SELLER_ACTIVATION_REVIEW_RESUBMITTED" : "SELLER_ACTIVATION_REVIEW_SUBMITTED",
        targetType: "SELLER_ACTIVATION_REVIEW",
        targetId: review.id,
        meta: { status: "PENDING", snapshot_hash: snapshot.snapshotHash },
      },
    });
    const admins = await tx.user.findMany({ where: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { id: true } });
    await tx.notification.createMany({ data: admins.map((admin) => ({
      userId: admin.id,
      type: "SELLER_ACTIVATION_REVIEW" as const,
      title: previous ? "Pengajuan ulang aktivasi seller" : "Pengajuan aktivasi seller",
      body: "Ada profil seller yang menunggu review manual.",
      refId: review.id,
    })) });
    return review;
  });
  res.status(201).json({ data: safeReviewDto(created) });
}

export async function withdrawActivationReview(_req: Request, res: Response) {
  const sellerId = sellerProfileId(res);
  const actorId = userId(res);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${sellerId} FOR UPDATE`;
    const review = await tx.sellerActivationReview.findFirst({
      where: { activeSellerId: sellerId, status: "PENDING" },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    });
    if (!review) throw new HttpError(409, "ACTIVATION_REVIEW_NOT_PENDING", "Tidak ada permintaan review aktif untuk ditarik.");
    const now = new Date();
    const changed = await tx.sellerActivationReview.updateMany({
      where: { id: review.id, sellerId, status: "PENDING", activeSellerId: sellerId },
      data: { status: "WITHDRAWN", activeSellerId: null, withdrawnAt: now },
    });
    if (changed.count !== 1) throw new HttpError(409, "ACTIVATION_REVIEW_STATE_CONFLICT", "Status review berubah; muat ulang sebelum menarik permintaan.");
    await tx.activityLog.create({
      data: { userId: actorId, action: "SELLER_ACTIVATION_REVIEW_WITHDRAWN", targetType: "SELLER_ACTIVATION_REVIEW", targetId: review.id, meta: { from_status: "PENDING", to_status: "WITHDRAWN" } },
    });
    return { ...review, status: "WITHDRAWN", withdrawnAt: now, reviewedAt: null };
  });
  res.status(200).json({ data: safeReviewDto(result) });
}

export async function listActivationReviews(req: Request, res: Response) {
  const parsed = activationReviewQueueSchema.safeParse(req.query);
  if (!parsed.success) validationError(parsed.error.issues);
  const { page, limit } = parsed.data;
  const where = { status: "PENDING" as const, activeSellerId: { not: null } };
  const [rows, total] = await prisma.$transaction([
    prisma.sellerActivationReview.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { seller: { select: { displayName: true, category: true, city: true } } },
    }),
    prisma.sellerActivationReview.count({ where }),
  ]);
  res.status(200).json({
    data: rows.map(adminReviewDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getActivationReview(req: Request, res: Response) {
  const id = typeof req.params.review_id === "string" ? req.params.review_id : "";
  const review = await prisma.sellerActivationReview.findUnique({
    where: { id },
    include: { seller: { select: { displayName: true, category: true, city: true } } },
  });
  if (!review) throw new HttpError(404, "ACTIVATION_REVIEW_NOT_FOUND", "Review aktivasi seller tidak ditemukan.");
  res.status(200).json({ data: adminReviewDto(review) });
}

export async function decideActivationReview(req: Request, res: Response) {
  const parsed = activationReviewDecisionSchema.safeParse(req.body);
  if (!parsed.success) validationError(parsed.error.issues);
  const adminId = userId(res);
  const id = typeof req.params.review_id === "string" ? req.params.review_id : "";
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.sellerActivationReview.findUnique({ where: { id }, select: { sellerId: true } });
    if (!pointer) throw new HttpError(404, "ACTIVATION_REVIEW_NOT_FOUND", "Review aktivasi seller tidak ditemukan.");
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${pointer.sellerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "SellerActivationReview" WHERE "id" = ${id} FOR UPDATE`;
    const review = await tx.sellerActivationReview.findUnique({ where: { id }, include: { seller: { select: { id: true, userId: true, verificationStatus: true, displayName: true, category: true, city: true } } } });
    if (!review) throw new HttpError(404, "ACTIVATION_REVIEW_NOT_FOUND", "Review aktivasi seller tidak ditemukan.");
    if (review.seller.userId === adminId) throw new HttpError(403, "SELF_REVIEW_FORBIDDEN", "Admin tidak dapat memutuskan review profil seller miliknya sendiri.");
    if (review.status !== "PENDING" || review.activeSellerId !== review.sellerId) {
      throw new HttpError(409, "ACTIVATION_REVIEW_STATE_CONFLICT", "Review ini sudah tidak menunggu keputusan.");
    }
    if (review.seller.verificationStatus !== "PENDING") {
      throw new HttpError(409, "SELLER_REVIEW_STATE_CONFLICT", "Status seller berubah; review tidak dapat diputuskan.");
    }

    if (parsed.data.status === "APPROVED") {
      const currentSnapshot = await buildSellerActivationSnapshot(tx, review.sellerId);
      if (currentSnapshot.snapshotHash !== review.snapshotHash) {
        throw new HttpError(409, "ACTIVATION_REVIEW_CONTENT_CHANGED", "Profil, portfolio, atau layanan berubah setelah pengajuan. Seller perlu menarik dan mengajukan ulang agar admin menilai data terbaru.");
      }
    }

    const now = new Date();
    const nextStatus = parsed.data.status;
    const rejectionReason = parsed.data.status === "REJECTED" ? parsed.data.rejection_reason : null;
    const changed = await tx.sellerActivationReview.updateMany({
      where: { id, status: "PENDING", activeSellerId: review.sellerId },
      data: { status: nextStatus, activeSellerId: null, reviewedById: adminId, reviewedAt: now, rejectionReason },
    });
    if (changed.count !== 1) throw new HttpError(409, "ACTIVATION_REVIEW_STATE_CONFLICT", "Review ini sudah diputuskan oleh admin lain.");

    const sellerChanged = await tx.sellerProfile.updateMany({
      where: { id: review.sellerId, verificationStatus: "PENDING" },
      data: { verificationStatus: nextStatus },
    });
    if (sellerChanged.count !== 1) throw new HttpError(409, "SELLER_REVIEW_STATE_CONFLICT", "Status seller berubah; muat ulang review.");

    await tx.activityLog.create({
      data: {
        userId: adminId,
        action: `SELLER_ACTIVATION_REVIEW_${nextStatus}`,
        targetType: "SELLER_ACTIVATION_REVIEW",
        targetId: review.id,
        meta: { from_status: "PENDING", to_status: nextStatus, ...(rejectionReason ? { rejection_reason: rejectionReason } : {}) },
      },
    });
    await tx.notification.create({
      data: {
        userId: review.seller.userId,
        type: "SELLER_ACTIVATION_REVIEW",
        title: nextStatus === "APPROVED" ? "Profil seller disetujui" : "Profil seller perlu diperbaiki",
        body: nextStatus === "APPROVED" ? "Review manual profil seller Anda telah disetujui." : rejectionReason,
        refId: review.id,
      },
    });
    return tx.sellerActivationReview.findUniqueOrThrow({
      where: { id },
      include: { seller: { select: { displayName: true, category: true, city: true } } },
    });
  });
  res.status(200).json({ data: adminReviewDto(result) });
}
