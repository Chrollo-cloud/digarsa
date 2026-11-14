import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { sellerApplicationSchema, updateSellerProfileSchema } from "./seller.schema.js";

function userId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function raiseValidation(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(400, "VALIDATION_ERROR", "Data yang dikirim tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function parseMultipartBody(body: Request["body"]) {
  const next = { ...body } as Record<string, unknown>;
  for (const key of ["bio", "phone", "address", "lat", "lng"]) {
    if (next[key] === "") next[key] = null;
  }
  if (typeof next.publicLocation === "string") {
    try { next.publicLocation = JSON.parse(next.publicLocation); }
    catch { throw new HttpError(400, "VALIDATION_ERROR", "Format lokasi publik tidak valid."); }
  }
  return next;
}

function frontendProfile(profile: {
  id: string; userId: string; displayName: string; category: string; city: string;
  bio: string | null; image: string | null; specialties: string[]; portfolioLink: string | null;
  publicLocation: Prisma.JsonValue; createdAt: Date;
}) {
  return {
    id: profile.id,
    ownerUserId: profile.userId,
    name: profile.displayName,
    category: profile.category,
    city: profile.city,
    bio: profile.bio ?? "",
    image: profile.image ?? "",
    specialties: profile.specialties,
    portfolioLink: profile.portfolioLink ?? "",
    publicLocation: profile.publicLocation ?? null,
    createdAt: profile.createdAt.toISOString(),
  };
}

function dbJson(value: unknown) {
  return value === null ? Prisma.DbNull : value as Prisma.InputJsonValue;
}

export async function applySeller(req: Request, res: Response) {
  const uid = userId(res);
  const parsed = sellerApplicationSchema.safeParse(parseMultipartBody(req.body));
  if (!parsed.success) raiseValidation(parsed.error);
  const input = parsed.data;
  const profileData = {
    displayName: input.name,
    category: input.category,
    city: input.city,
    region: input.city,
    bio: input.bio,
    image: input.image,
    specialties: input.specialties,
    portfolioLink: input.portfolioLink,
    ...(input.publicLocation !== undefined ? { publicLocation: dbJson(input.publicLocation) } : {}),
  };
  const existingProfile = await prisma.sellerProfile.findUnique({ where: { userId: uid } });
  let profile;
  try {
    profile = existingProfile
      ? await prisma.sellerProfile.update({ where: { id: existingProfile.id }, data: profileData })
      : await prisma.sellerProfile.create({ data: { userId: uid, ...profileData } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "SELLER_PROFILE_EXISTS", "Profil seller sudah dibuat.");
    }
    throw error;
  }
  await prisma.activityLog.create({
    data: { userId: uid, action: "SELLER_PROFILE_CREATED", targetType: "SELLER_PROFILE", targetId: profile.id },
  });
  res.status(existingProfile ? 200 : 201).json({ data: { seller: frontendProfile(profile) } });
}

export async function getMySellerProfile(_req: Request, res: Response) {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: userId(res) },
  });
  if (!profile) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil seller belum dibuat.");
  res.status(200).json({ data: { seller: frontendProfile(profile) } });
}

export async function updateMySellerProfile(req: Request, res: Response) {
  const parsed = updateSellerProfileSchema.safeParse(req.body);
  if (!parsed.success) raiseValidation(parsed.error);
  const existing = await prisma.sellerProfile.findUnique({ where: { userId: userId(res) }, select: { id: true } });
  if (!existing) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Ajukan profil seller terlebih dahulu.");
  const input = parsed.data;
  const profile = await prisma.sellerProfile.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { displayName: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.city !== undefined ? { city: input.city, region: input.city } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.specialties !== undefined ? { specialties: input.specialties } : {}),
      ...(input.portfolioLink !== undefined ? { portfolioLink: input.portfolioLink } : {}),
      ...(input.publicLocation !== undefined ? { publicLocation: dbJson(input.publicLocation) } : {}),
    },
  });
  await prisma.activityLog.create({ data: { userId: userId(res), action: "SELLER_PROFILE_UPDATED", targetType: "SELLER_PROFILE", targetId: profile.id } });
  res.status(200).json({ data: frontendProfile(profile) });
}

export async function getPublicSellerProfile(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) throw new HttpError(400, "SELLER_ID_REQUIRED", "ID seller wajib diisi.");
  const profile = await prisma.sellerProfile.findFirst({
    where: {
      id,
      verificationStatus: "APPROVED",
      user: { is: { accountStatus: "ACTIVE" } },
    },
  });
  if (!profile) throw new HttpError(404, "SELLER_PROFILE_NOT_FOUND", "Profil kreator tidak ditemukan.");
  const { ownerUserId: _privateOwnerId, ...publicProfile } = frontendProfile(profile);
  res.status(200).json({ data: publicProfile });
}

