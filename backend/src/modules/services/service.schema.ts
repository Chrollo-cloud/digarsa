import { z } from "zod";
import { publicLocationSchema } from "../../lib/location.schema.js";

export const createServiceSchema = z.object({
  categoryId: z.number().int().positive(),

  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(150, "Title cannot exceed 150 characters"),

  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description cannot exceed 5000 characters"),

  price: z.number().int().positive("Price must be greater than 0"),

  dpPercent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),

  region: z
    .string()
    .trim()
    .min(2, "Region must be at least 2 characters")
    .max(100),

  lat: z.number().min(-90).max(90).optional().nullable(),

  lng: z.number().min(-180).max(180).optional().nullable(),

  maxBookingsPerDay: z.number().int().positive().default(1),
});

export const updateServiceSchema = createServiceSchema
  .omit({ categoryId: true })
  .partial();

export const updateServiceStatusSchema = z.object({
  status: z.enum(["OPEN", "FULL_BOOK"]),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;


// =====================================================
// MARKETPLACE SCHEMAS - Fitur baru
// =====================================================

const marketplaceCategorySchema = z.enum([
  "Branding",
  "Fotografi & Film",
  "Web & Digital",
  "Illustration & Motion",
]);

const imageSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => value || null)
  .refine((value) => {
    if (!value) return true;

    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Gambar harus memakai URL http atau https");

export const createMarketplaceServiceSchema = z.object({
  category: marketplaceCategorySchema,
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(30).max(1500),
  price: z.coerce.number().int().min(10_000).max(100_000_000),
  delivery: z.enum(["Remote", "Onsite"]),
  turnaround: z.string().trim().min(2).max(60),
  availability: z.enum(["Open", "Full-book"]),
  image: imageSchema.optional().default(null),
  serviceLocation: publicLocationSchema.nullable().optional(),
});

export const updateMarketplaceServiceSchema =
  createMarketplaceServiceSchema
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      "Minimal satu kolom harus diubah",
    );

export const updateMarketplaceServiceStatusSchema = z.object({
  availability: z.enum(["Open", "Full-book", "OPEN", "FULL_BOOK"]),
});

export const updateServiceVisibilitySchema = z.object({
  isHidden: z.boolean(),
});

export const updateServiceActiveSchema = z.object({
  active: z.boolean(),
});

export const marketplaceServiceListSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: marketplaceCategorySchema.optional(),
    region: z.string().trim().max(100).optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    sort: z
      .enum(["newest", "price_asc", "price_desc", "rating"])
      .default("newest"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    {
      path: ["maxPrice"],
      message: "maxPrice harus lebih besar atau sama dengan minPrice",
    },
  );

export const serviceModerationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("APPROVED"),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    status: z.enum(["REJECTED", "SUSPENDED"]),
    note: z.string().trim().min(3).max(1000),
  }),
]);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= new Date().toISOString().slice(0, 10)
    );
  }, "Pilih tanggal yang valid dan tidak di masa lalu");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const availabilitySlotSchema = z
  .object({
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    note: z.string().trim().max(160).default(""),
  })
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "Waktu selesai harus setelah waktu mulai",
  });