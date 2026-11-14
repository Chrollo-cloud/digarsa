import { z } from "zod";
import { publicLocationSchema } from "../../lib/location.schema.js";

const categories = ["Branding", "Fotografi & Film", "Web & Digital", "Illustration & Motion"] as const;
const optionalHttpUrl = z.string().trim().max(2048).transform((value) => value || null).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, "URL harus menggunakan http atau https");
const specialtiesSchema = z.union([z.string(), z.array(z.string())]).transform((value) =>
  (Array.isArray(value) ? value : value.split(",")).map((item) => item.trim()).filter(Boolean),
).pipe(z.array(z.string().min(1).max(60)).max(15));

const profileFields = {
  name: z.string().trim().min(2).max(80),
  category: z.enum(categories),
  city: z.string().trim().min(2).max(80),
  bio: z.string().trim().min(30).max(500),
  image: optionalHttpUrl.optional(),
  specialties: specialtiesSchema.optional().default([]),
  portfolioLink: optionalHttpUrl.optional(),
  publicLocation: publicLocationSchema.nullable().optional(),
};

export const sellerApplicationSchema = z.object(profileFields);
export const sellerProfileSchema = z.object(profileFields);
export const updateSellerProfileSchema = sellerProfileSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Minimal satu kolom harus diisi",
);

export const sellerVerificationSubmissionSchema = z.object({
  nik: z.string().trim().regex(/^\d{16}$/, "NIK harus terdiri dari 16 digit."),
});

export const sellerVerificationDecisionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("APPROVED") }),
  z.object({ status: z.literal("REJECTED"), rejectionReason: z.string().trim().min(3).max(1000) }),
]);

export const verificationQueueSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
