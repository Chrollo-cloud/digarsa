import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { prisma } from "../config/prisma.js";
import type { Role } from "../generated/prisma/enums.js";

export type AuthContext = {
  userId: string;
  role: Role;
  tokenVersion: number;
};

export const authenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Periksa apakah token dikirim
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Silakan login terlebih dahulu.",
      },
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({
      error: {
        code: "SERVER_CONFIG_ERROR",
        message: "Konfigurasi JWT belum tersedia.",
      },
    });
    return;
  }

  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Token tidak valid atau sudah kedaluwarsa.",
      },
    });
    return;
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    (decoded.role !== "USER" && decoded.role !== "ADMIN") ||
    !Number.isInteger(decoded.tokenVersion)
  ) {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Token tidak valid." },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { role: true, accountStatus: true, tokenVersion: true },
  });

  if (
    !user ||
    user.accountStatus !== "ACTIVE" ||
    user.tokenVersion !== decoded.tokenVersion ||
    user.role !== decoded.role
  ) {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Sesi tidak berlaku. Silakan login kembali.",
      },
    });
    return;
  }

  res.locals.auth = {
    userId: decoded.sub,
    role: user.role,
    tokenVersion: user.tokenVersion,
  } satisfies AuthContext;
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const auth = res.locals.auth as AuthContext | undefined;
    if (!auth) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." },
      });
      return;
    }

    if (!roles.includes(auth.role)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Anda tidak memiliki akses." },
      });
      return;
    }

    next();
  };
}
