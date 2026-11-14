import { z } from "zod";
import { priceBuyerTotal, POSTGRES_INT_MAX } from "../payments/pricing-policy.js";

export const additionalRevisionRequestSchema = z.object({
  description: z.string().trim().min(10).max(2000),
});

export const additionalRevisionClarificationSchema = z.object({
  message: z.string().trim().min(5).max(2000),
});

export const additionalRevisionOfferSchema = z.object({
  scope: z.string().trim().min(10).max(4000),
  terms: z.string().trim().min(10).max(4000),
  seller_price: z.number().int().positive().max(POSTGRES_INT_MAX),
  estimated_duration_hours: z.number().int().positive().max(2_147_483_647),
}).superRefine((input, ctx) => {
  if (!Number.isSafeInteger(input.seller_price) || input.seller_price <= 0 || input.seller_price > POSTGRES_INT_MAX) return;
  try {
    priceBuyerTotal(input.seller_price);
  } catch {
    ctx.addIssue({
      code: "custom",
      path: ["seller_price"],
      message: "Seller price plus the 5% administration fee must fit PostgreSQL INT columns.",
    });
  }
});
