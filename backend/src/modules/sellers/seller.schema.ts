import { z } from "zod";

export const sellerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Nama toko minimal 2 karakter")
    .max(100, "Nama toko maksimal 100 karakter"),

  bio: z
    .string()
    .trim()
    .max(1000, "Bio maksimal 1000 karakter")
    .optional()
    .nullable(),

  region: z
    .string()
    .trim()
    .min(2, "Wilayah minimal 2 karakter")
    .max(100, "Wilayah maksimal 100 karakter"),

  lat: z.number().min(-90).max(90).optional().nullable(),

  lng: z.number().min(-180).max(180).optional().nullable(),
});

export const updateSellerProfileSchema =
  sellerProfileSchema.partial();

export type SellerProfileInput = z.infer<
  typeof sellerProfileSchema
>;

export type UpdateSellerProfileInput = z.infer<
  typeof updateSellerProfileSchema
>;