import { z } from "zod";

// Validasi email
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());

// Validasi password
const passwordSchema = z.string().min(8, "Password minimal 8 karakter").max(128, "Password maksimal 128 karakter");

// Validasi data register
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().max(25).optional(),
});

// Validasi data login
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const patchProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(25).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  gender: z.enum(["", "Perempuan", "Laki-laki", "Tidak ingin menyebutkan"]).optional(),
  avatarUrl: z.string().max(2048).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }, "URL foto profil tidak valid").optional(),
}).superRefine((value, ctx) => {
  if (!Object.keys(value).length) {
    ctx.addIssue({ code: "custom", message: "Minimal satu kolom harus diisi" });
  }
  if (value.phone) {
    const digits = value.phone.replace(/\D/g, "");
    if (!/^[+\d ()-]+$/.test(value.phone) || digits.length < 7 || digits.length > 15) {
      ctx.addIssue({ code: "custom", message: "Nomor telepon harus berisi 7–15 digit", path: ["phone"] });
    }
  }
  if (value.birthDate) {
    const date = new Date(`${value.birthDate}T00:00:00Z`);
    const today = new Date().toISOString().slice(0, 10);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.birthDate || value.birthDate > today) {
      ctx.addIssue({ code: "custom", message: "Tanggal lahir harus valid dan bukan tanggal mendatang", path: ["birthDate"] });
    }
  }
});

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
