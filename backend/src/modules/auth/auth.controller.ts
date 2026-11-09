import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";

import { prisma } from "../../config/prisma.js";
import { createAccessToken } from "../../lib/jwt.js";

import {
  registerSchema,
  loginSchema,
} from "./auth.schema.js";

// Membuat format error validasi
function validationError(issues: {
  path: PropertyKey[];
  message: string;
}[]) {
  return issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// Memeriksa error unique constraint dari Prisma
function isUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

// REGISTER
export const register: RequestHandler = async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data registrasi tidak valid.",
        details: validationError(parsed.error.issues),
      },
    });
    return;
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    res.status(500).json({
      error: {
        code: "SERVER_CONFIG_ERROR",
        message: "Konfigurasi JWT belum tersedia.",
      },
    });
    return;
  }

  const { name, email, password, phone } = parsed.data;

  try {
    // Periksa apakah email sudah digunakan
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "Email sudah terdaftar.",
        },
      });
      return;
    }

    // Hash password sebelum disimpan
    const passwordHash = await bcrypt.hash(password, 12);

    // Simpan pengguna ke database
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        ...(phone ? { phone } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Buat JWT
    const accessToken = createAccessToken(user.id, user.role);

    res.status(201).json({
      data: {
        user,
        accessToken,
      },
    });

  } catch (error) {
    if (isUniqueError(error)) {
      res.status(409).json({
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "Email sudah terdaftar.",
        },
      });
      return;
    }

    console.error("[REGISTER ERROR]", error);

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Terjadi kesalahan pada server.",
      },
    });
  }
};

// LOGIN
export const login: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data login tidak valid.",
        details: validationError(parsed.error.issues),
      },
    });
    return;
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    res.status(500).json({
      error: {
        code: "SERVER_CONFIG_ERROR",
        message: "Konfigurasi JWT belum tersedia.",
      },
    });
    return;
  }

  const { email, password } = parsed.data;

  try {
    // Cari pengguna berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Periksa keberadaan akun dan password
    if (!user || !user.isActive) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email atau password salah.",
        },
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email atau password salah.",
        },
      });
      return;
    }

    // Buat JWT setelah login berhasil
    const accessToken = createAccessToken(user.id, user.role);

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

  } catch (error) {
    console.error("[LOGIN ERROR]", error);

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Terjadi kesalahan pada server.",
      },
    });
  }
};

export const getMe: RequestHandler = async (_req, res) => {
  const auth = res.locals.auth as
    | { userId: string; role: "USER" | "ADMIN" }
    | undefined;

  if (!auth) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Silakan login terlebih dahulu.",
      },
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: auth.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Akun tidak tersedia atau sudah dinonaktifkan.",
        },
      });
      return;
    }

    res.status(200).json({
      data: {
        user,
      },
    });

  } catch (error) {
    console.error("[GET ME ERROR]", error);

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Terjadi kesalahan pada server.",
      },
    });
  }
};