import { z } from "zod";

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

  price: z
    .number()
    .int()
    .positive("Price must be greater than 0"),

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

  maxBookingsPerDay: z
    .number()
    .int()
    .positive()
    .default(1),
});

export const updateServiceSchema = createServiceSchema
  .omit({
    categoryId: true,
  })
  .partial();

export const updateServiceStatusSchema = z.object({
  status: z.enum(["OPEN", "FULL_BOOK"]),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
