import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";

export type AuthContext = {
  userId: string;
  role: "USER" | "ADMIN";
};

export const authenticate: RequestHandler = (req, res, next) => {
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

  try {
    // Memverifikasi tanda tangan dan masa berlaku token
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    // Memastikan payload memiliki identitas dan role yang valid
    if (
      typeof decoded === "string" ||
      !decoded.sub ||
      (decoded.role !== "USER" && decoded.role !== "ADMIN")
    ) {
      res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Token tidak valid.",
        },
      });
      return;
    }

    // Menyimpan identitas pengguna untuk digunakan route berikutnya
    res.locals.auth = {
      userId: decoded.sub,
      role: decoded.role,
    } satisfies AuthContext;

    next();

  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Token tidak valid atau sudah kedaluwarsa.",
      },
    });
  }
};