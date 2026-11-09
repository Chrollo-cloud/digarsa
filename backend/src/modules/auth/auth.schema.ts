import { z } from "zod";

// Validasi email
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());

// Validasi password
const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password maksimal 72 byte"
  );

// Validasi data register
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().min(8).max(20).optional(),
});

// Validasi data login
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const patchProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(8).max(20).nullable().optional(),
  region: z.string().trim().min(2).max(100).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  avatarUrl: z.url().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Minimal satu kolom harus diisi");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({ password: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const verifyOtpSchema = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) });
export const resetPasswordSchema = z.object({
  resetToken: z.string().min(32).max(256),
  password: passwordSchema,
});
