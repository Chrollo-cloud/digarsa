import { z } from "zod";

const reportTargetTypes = ["SERVICE", "USER", "MESSAGE", "REVIEW", "BOOKING"] as const;
const reportStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;

export const createReportSchema = z.object({
  target_type: z.enum(reportTargetTypes),
  target_id: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(3).max(120),
  detail: z.string().trim().min(10).max(2000).optional(),
}).strict();

export const reportListQuerySchema = z.object({
  status: z.enum(reportStatuses).optional(),
  target_type: z.enum(reportTargetTypes).optional(),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const moderateReportSchema = z.object({
  status: z.enum(reportStatuses),
  admin_note: z.string().trim().max(2000).optional(),
}).strict();
