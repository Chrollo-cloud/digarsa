import { z } from "zod";

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const conversationMessagePageSchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
