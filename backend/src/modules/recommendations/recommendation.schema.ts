import { z } from "zod";

export const recommendationQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  max_budget: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["rule_based", "gemini"]).default("rule_based"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
