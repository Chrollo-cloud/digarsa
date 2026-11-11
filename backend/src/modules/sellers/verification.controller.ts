import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { encryptNik } from "../../lib/crypto.js";
import { HttpError } from "../../lib/http.js";
import {
  createPrivateKtpSignedUrl,
  makeKtpUploadPath,
  removePrivateKtp,
  uploadPrivateKtp,
} from "../../lib/storage.js";
import {
  sellerVerificationDecisionSchema,
  sellerVerificationSubmissionSchema,
  verificationQueueSchema,
} from "./seller.schema.js";

function userId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function validationError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new HttpError(
    400,
    "VALIDATION_ERROR",
    "Data verifikasi seller tidak valid.",
    issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  );
}

export async function getMySellerVerification(_req: Request, res: Response) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: userId(res) },
    select: { id: true, verificationStatus: true },
  });
  if (!seller) {
    throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller belum dibuat.");
  }

  const verification = await prisma.sellerVerification.findFirst({
    where: { sellerId: seller.id },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      nikLast4: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });

  res.status(200).json({
    data: {
      verificationStatus: seller.verificationStatus,
      verification,
    },
  });
}

export async function submitSellerVerification(req: Request, res: Response) {
  const parsed = sellerVerificationSubmissionSchema.safeParse(req.body);
  if (!parsed.success) validationError(parsed.error.issues);
  const file = req.file;
  if (!file) {
    throw new HttpError(400, "KTP_FILE_REQUIRED", "Dokumen KTP wajib diunggah.");
  }

  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: userId(res) },
    select: { id: true, verificationStatus: true },
  });
  if (!seller) {
    throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Ajukan profil seller terlebih dahulu.");
  }
  if (seller.verificationStatus === "APPROVED") {
    throw new HttpError(409, "SELLER_ALREADY_VERIFIED", "Profil seller sudah disetujui.");
  }

  // Encrypt before uploading so missing/invalid key configuration cannot leave an orphaned file.
  const nikEncrypted = encryptNik(parsed.data.nik);
  const ktpDocumentPath = makeKtpUploadPath(userId(res), file);
  await uploadPrivateKtp(ktpDocumentPath, file);

  try {
    const verification = await prisma.$transaction(async (tx) => {
      const pending = await tx.sellerVerification.findFirst({
        where: { sellerId: seller.id, status: "PENDING" },
        select: { id: true },
      });
      if (pending) {
        throw new HttpError(409, "VERIFICATION_ALREADY_PENDING", "Pengajuan verifikasi masih menunggu pemeriksaan admin.");
      }

      const currentSeller = await tx.sellerProfile.findUnique({
        where: { id: seller.id },
        select: { verificationStatus: true },
      });
      if (!currentSeller || currentSeller.verificationStatus === "APPROVED") {
        throw new HttpError(409, "SELLER_VERIFICATION_STATE_CHANGED", "Status verifikasi seller sudah berubah.");
      }

      await tx.sellerProfile.update({
        where: { id: seller.id },
        data: { verificationStatus: "PENDING" },
      });
      const created = await tx.sellerVerification.create({
        data: {
          sellerId: seller.id,
          nikEncrypted,
          nikLast4: parsed.data.nik.slice(-4),
          ktpDocumentPath,
        },
        select: { id: true, status: true, nikLast4: true, submittedAt: true },
      });
      await tx.activityLog.create({
        data: {
          userId: userId(res),
          action: "SELLER_VERIFICATION_SUBMITTED",
          targetType: "SELLER_VERIFICATION",
          targetId: created.id,
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return res.status(201).json({
      data: { verificationStatus: "PENDING", verification },
    });
  } catch (error) {
    await removePrivateKtp(ktpDocumentPath).catch(() => undefined);
    if (error instanceof HttpError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new HttpError(409, "VERIFICATION_ALREADY_PENDING", "Pengajuan verifikasi sedang diproses.");
    }
    throw error;
  }
}

export async function listSellerVerifications(req: Request, res: Response) {
  const parsed = verificationQueueSchema.safeParse(req.query);
  if (!parsed.success) validationError(parsed.error.issues);
  const { status = "PENDING", page, limit } = parsed.data;
  const where = { status };
  const [rows, total] = await prisma.$transaction([
    prisma.sellerVerification.findMany({
      where,
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            verificationStatus: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sellerVerification.count({ where }),
  ]);

  res.status(200).json({
    data: {
      items: rows.map((row) => ({
        id: row.id,
        sellerId: row.sellerId,
        status: row.status,
        rejectionReason: row.rejectionReason,
        nikLast4: row.nikLast4,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        seller: row.seller,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
}

export async function getSellerVerificationDocument(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const verification = await prisma.sellerVerification.findUnique({
    where: { id },
    select: { id: true, ktpDocumentPath: true },
  });
  if (!verification) {
    throw new HttpError(404, "SELLER_VERIFICATION_NOT_FOUND", "Dokumen verifikasi tidak ditemukan.");
  }

  const signedUrl = await createPrivateKtpSignedUrl(verification.ktpDocumentPath);
  res.status(200).json({
    data: { verificationId: verification.id, signedUrl, expiresIn: 300 },
  });
}

export async function decideSellerVerification(req: Request, res: Response) {
  const parsed = sellerVerificationDecisionSchema.safeParse(req.body);
  if (!parsed.success) validationError(parsed.error.issues);
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const adminId = userId(res);

  const result = await prisma.$transaction(async (tx) => {
    const verification = await tx.sellerVerification.findUnique({
      where: { id },
      select: { id: true, sellerId: true, status: true },
    });
    if (!verification) {
      throw new HttpError(404, "SELLER_VERIFICATION_NOT_FOUND", "Pengajuan verifikasi tidak ditemukan.");
    }
    if (verification.status !== "PENDING") {
      throw new HttpError(409, "VERIFICATION_ALREADY_REVIEWED", "Pengajuan verifikasi sudah diperiksa.");
    }

    const reviewedAt = new Date();
    const update = await tx.sellerVerification.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: parsed.data.status,
        rejectionReason: parsed.data.status === "REJECTED" ? parsed.data.rejectionReason : null,
        reviewedById: adminId,
        reviewedAt,
      },
    });
    if (update.count !== 1) {
      throw new HttpError(409, "VERIFICATION_ALREADY_REVIEWED", "Pengajuan verifikasi sudah diperiksa.");
    }

    const sellerUpdate = await tx.sellerProfile.updateMany({
      where: { id: verification.sellerId, verificationStatus: "PENDING" },
      data: { verificationStatus: parsed.data.status },
    });
    if (sellerUpdate.count !== 1) {
      throw new HttpError(409, "SELLER_VERIFICATION_STATE_CHANGED", "Status seller sudah berubah; muat ulang antrean.");
    }

    const seller = await tx.sellerProfile.findUnique({
      where: { id: verification.sellerId },
      select: { userId: true },
    });
    if (!seller) {
      throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller tidak ditemukan.");
    }
    await tx.notification.create({
      data: {
        userId: seller.userId,
        type: "SELLER_VERIFICATION",
        title: parsed.data.status === "APPROVED" ? "Seller disetujui" : "Verifikasi seller ditolak",
        body: parsed.data.status === "REJECTED"
          ? parsed.data.rejectionReason
          : "Profil seller Anda telah disetujui dan dapat membuat layanan.",
        refId: verification.id,
      },
    });
    await tx.activityLog.create({
      data: {
        userId: adminId,
        action: `SELLER_VERIFICATION_${parsed.data.status}`,
        targetType: "SELLER_VERIFICATION",
        targetId: verification.id,
      },
    });

    return tx.sellerVerification.findUniqueOrThrow({
      where: { id },
      select: { id: true, sellerId: true, status: true, rejectionReason: true, nikLast4: true, submittedAt: true, reviewedAt: true },
    });
  });

  res.status(200).json({
    data: { verificationStatus: result.status, verification: result },
  });
}
