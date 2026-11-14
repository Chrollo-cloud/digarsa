import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";

function userId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
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
    select: { id: true, status: true, submittedAt: true, reviewedAt: true },
  });

  res.status(200).json({
    data: {
      verificationStatus: seller.verificationStatus,
      verification,
    },
  });
}

export function identityVerificationUnavailable(_req: Request, res: Response) {
  res.status(410).json({
    error: {
      code: "IDENTITY_VERIFICATION_UNAVAILABLE",
      message: "Verifikasi seller berbasis dokumen identitas pemerintah tidak tersedia.",
    },
  });
}
