import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import {
  sellerProfileSchema,
  updateSellerProfileSchema,
} from "./seller.schema.js";

export async function createSellerProfile(
  req: Request,
  res: Response,
) {
  const userId = res.locals.auth.userId;

  const validation = sellerProfileSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data profil seller tidak valid.",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const existingProfile = await prisma.sellerProfile.findUnique({
    where: { userId },
  });

  if (existingProfile) {
    return res.status(409).json({
      error: {
        code: "SELLER_PROFILE_EXISTS",
        message: "Profil seller sudah dibuat.",
      },
    });
  }

  const profile = await prisma.sellerProfile.create({
    data: {
      userId,
      ...validation.data,
    },
  });

  return res.status(201).json({
    data: profile,
  });
}

export async function getMySellerProfile(
  _req: Request,
  res: Response,
) {
  const userId = res.locals.auth.userId;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    return res.status(404).json({
      error: {
        code: "SELLER_PROFILE_NOT_FOUND",
        message: "Profil seller belum dibuat.",
      },
    });
  }

  return res.status(200).json({
    data: profile,
  });
}

export async function updateMySellerProfile(
  req: Request,
  res: Response,
) {
  const userId = res.locals.auth.userId;

  const validation = updateSellerProfileSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data profil seller tidak valid.",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const existingProfile = await prisma.sellerProfile.findUnique({
    where: { userId },
  });

  if (!existingProfile) {
    return res.status(404).json({
      error: {
        code: "SELLER_PROFILE_NOT_FOUND",
        message: "Profil seller belum dibuat.",
      },
    });
  }

  const profile = await prisma.sellerProfile.update({
    where: { userId },
    data: validation.data,
  });

  return res.status(200).json({
    data: profile,
  });
}