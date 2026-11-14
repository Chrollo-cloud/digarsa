import type { RequestHandler } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";

export const requireSellerProfile: RequestHandler = async (_req, res, next) => {
  const auth = res.locals.auth as { userId: string } | undefined;
  if (!auth) {
    next(new HttpError(401, "UNAUTHORIZED", "Silakan login terlebih dahulu."));
    return;
  }
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!profile) {
    next(new HttpError(403, "SELLER_PROFILE_REQUIRED", "Buat profil seller terlebih dahulu."));
    return;
  }
  res.locals.sellerProfileId = profile.id;
  next();
};

export const requireApprovedSeller: RequestHandler = async (_req, res, next) => {
  const auth = res.locals.auth as { userId: string } | undefined;
  if (!auth) {
    next(new HttpError(401, "UNAUTHORIZED", "Silakan login terlebih dahulu."));
    return;
  }

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, verificationStatus: true },
  });
  if (!profile) {
    next(new HttpError(403, "SELLER_PROFILE_REQUIRED", "Buat profil seller terlebih dahulu."));
    return;
  }
  if (profile.verificationStatus !== "APPROVED") {
    next(new HttpError(403, "SELLER_VERIFICATION_REQUIRED", "Verifikasi seller harus disetujui sebelum mengakses Seller Center."));
    return;
  }

  res.locals.sellerProfileId = profile.id;
  next();
};
