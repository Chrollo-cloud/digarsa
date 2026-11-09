import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { createAccessToken } from "../../lib/jwt.js";
import { HttpError } from "../../lib/http.js";
import { writeAuditLog } from "../../lib/audit.js";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  patchProfileSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "./auth.schema.js";

type AuthLocals = { auth: { userId: string } };
const PUBLIC_USER = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  accountStatus: true,
  region: true,
  lat: true,
  lng: true,
  avatarUrl: true,
  createdAt: true,
} as const;

function validationDetails(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(500, "SERVER_CONFIG_ERROR", "Konfigurasi JWT belum tersedia.");
  }
  return secret;
}

function digest(value: string) {
  return createHash("sha256").update(`${requireJwtSecret()}:${value}`).digest("hex");
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Data yang dikirim tidak valid.",
      validationDetails(result.error.issues),
    );
  }
  return result.data as T;
}

export const register: RequestHandler = async (req, res) => {
  const input = parse<ReturnType<typeof registerSchema.parse>>(registerSchema, req.body);
  requireJwtSecret();
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        phone: input.phone,
      },
      select: PUBLIC_USER,
    });
    const accessToken = createAccessToken(user.id, user.role, 0);
    await writeAuditLog(user.id, "ACCOUNT_REGISTERED", "USER", user.id);
    res.status(201).json({ data: { user, accessToken } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "Email sudah terdaftar.");
    }
    throw error;
  }
};

export const login: RequestHandler = async (req, res) => {
  const input = parse<ReturnType<typeof loginSchema.parse>>(loginSchema, req.body);
  requireJwtSecret();
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.accountStatus !== "ACTIVE" || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email atau password salah.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken = createAccessToken(user.id, user.role, user.tokenVersion);
  await writeAuditLog(user.id, "ACCOUNT_LOGIN", "USER", user.id);
  res.status(200).json({
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken,
    },
  });
};

export const getMe: RequestHandler = async (_req, res) => {
  const { userId } = res.locals.auth as AuthLocals["auth"];
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new HttpError(401, "UNAUTHORIZED", "Akun tidak tersedia atau sudah dinonaktifkan.");
  }
  const sellerProfile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true, displayName: true, verificationStatus: true },
  });
  res.status(200).json({ data: { user: { ...user, sellerProfile } } });
};

export const updateMe: RequestHandler = async (req, res) => {
  const { userId } = res.locals.auth as AuthLocals["auth"];
  const input = parse<ReturnType<typeof patchProfileSchema.parse>>(patchProfileSchema, req.body);
  const user = await prisma.user.update({ where: { id: userId }, data: input, select: PUBLIC_USER });
  await writeAuditLog(userId, "PROFILE_UPDATED", "USER", userId);
  res.status(200).json({ data: { user } });
};

export const changePassword: RequestHandler = async (req, res) => {
  const { userId } = res.locals.auth as AuthLocals["auth"];
  const input = parse<ReturnType<typeof changePasswordSchema.parse>>(changePasswordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new HttpError(401, "INVALID_PASSWORD", "Password saat ini tidak sesuai.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, 12), tokenVersion: { increment: 1 } },
  });
  await writeAuditLog(userId, "PASSWORD_CHANGED", "USER", userId);
  res.status(200).json({ data: { message: "Password berhasil diubah. Silakan login kembali." } });
};

export const logoutAll: RequestHandler = async (_req, res) => {
  const { userId } = res.locals.auth as AuthLocals["auth"];
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  await writeAuditLog(userId, "SESSIONS_REVOKED", "USER", userId);
  res.status(200).json({ data: { message: "Semua sesi berhasil dikeluarkan." } });
};

export const deleteMe: RequestHandler = async (req, res) => {
  const { userId } = res.locals.auth as AuthLocals["auth"];
  const input = parse<ReturnType<typeof deleteAccountSchema.parse>>(deleteAccountSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_PASSWORD", "Password tidak sesuai.");
  }

  const activeBooking = await prisma.booking.findFirst({
    where: {
      OR: [{ customerId: userId }, { seller: { userId } }],
      status: { in: ["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"] },
    },
    select: { id: true },
  });
  if (activeBooking) {
    throw new HttpError(409, "ACTIVE_BOOKINGS_EXIST", "Akun belum dapat dihapus karena masih memiliki pesanan aktif.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted-${randomUUID()}@deleted.invalid`,
      name: "Akun dihapus",
      phone: null,
      region: null,
      lat: null,
      lng: null,
      avatarUrl: null,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      accountStatus: "DELETED",
      deletedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  });
  await writeAuditLog(userId, "ACCOUNT_DELETED", "USER", userId);
  res.status(200).json({ data: { message: "Akun berhasil dihapus." } });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const input = parse<ReturnType<typeof forgotPasswordSchema.parse>>(forgotPasswordSchema, req.body);
  requireJwtSecret();
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, accountStatus: true } });
  const mode = process.env.OTP_MODE ?? (process.env.NODE_ENV === "production" ? "disabled" : "simulated");
  if (mode !== "simulated" || process.env.NODE_ENV === "production") {
    throw new HttpError(503, "OTP_NOT_CONFIGURED", "Pemulihan password belum tersedia.");
  }

  let debugOtp: string | undefined;
  if (user?.accountStatus === "ACTIVE") {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await prisma.passwordReset.create({
      data: { userId: user.id, otpHash: digest(otp), expiresAt: new Date(Date.now() + 10 * 60_000), requestIp: req.ip },
    });
    debugOtp = otp;
  }

  res.status(200).json({
    data: {
      message: "Jika akun terdaftar, kode pemulihan akan dikirim.",
      ...(debugOtp ? { developmentOtp: debugOtp } : {}),
    },
  });
};

export const verifyOtp: RequestHandler = async (req, res) => {
  const input = parse<ReturnType<typeof verifyOtpSchema.parse>>(verifyOtpSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  const reset = user && await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!reset || reset.attempts >= 5 || reset.otpHash !== digest(input.otp)) {
    if (reset && reset.attempts < 5) {
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    }
    throw new HttpError(400, "INVALID_OTP", "Kode tidak valid atau sudah kedaluwarsa.");
  }

  const resetToken = randomBytes(32).toString("hex");
  await prisma.passwordReset.update({
    where: { id: reset.id },
    data: { verifiedAt: new Date(), resetTokenHash: digest(resetToken), resetTokenExpiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  res.status(200).json({ data: { resetToken } });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const input = parse<ReturnType<typeof resetPasswordSchema.parse>>(resetPasswordSchema, req.body);
  const reset = await prisma.passwordReset.findFirst({
    where: { resetTokenHash: digest(input.resetToken), resetTokenExpiresAt: { gt: new Date() }, usedAt: null, verifiedAt: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!reset) throw new HttpError(400, "INVALID_RESET_TOKEN", "Tautan pemulihan tidak valid atau sudah kedaluwarsa.");

  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(input.password, 12), tokenVersion: { increment: 1 } } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await writeAuditLog(reset.userId, "PASSWORD_RESET", "USER", reset.userId);
  res.status(200).json({ data: { message: "Password berhasil diperbarui. Silakan login kembali." } });
};
