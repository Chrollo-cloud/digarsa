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