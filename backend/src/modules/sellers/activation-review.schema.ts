import { z } from "zod";

export const activationReviewSubmissionSchema = z.object({}).strict();

export const activationReviewDecisionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("APPROVED") }).strict(),
  z.object({ status: z.literal("REJECTED"), rejection_reason: z.string().trim().min(1).max(1000) }).strict(),
]);

export const activationReviewQueueSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
