import { z } from "zod";

const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

function validRequestDate(value: string | null) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value >= new Date().toISOString().slice(0, 10);
}

export const bookingDraftSchema = z.object({
  requirements: z.string().trim().min(10).max(2000),
  description: z.string().trim().min(20).max(5000),
  requested_date: nullableDate.default(null),
  location: z.string().trim().min(10).max(500).nullable().default(null),
}).superRefine((value, ctx) => {
  if (!validRequestDate(value.requested_date)) {
    ctx.addIssue({ code: "custom", path: ["requested_date"], message: "Tanggal harus hari ini atau setelahnya." });
  }
});

export const createBookingSchema = bookingDraftSchema.extend({
  service_id: z.string().trim().min(1).max(128),
  confirmed: z.literal(true),
  revision_policy_hash: z.string().regex(/^[0-9a-f]{64}$/),
  revision_policy_acknowledged: z.literal(true),
});

export const bookingListQuerySchema = z.object({
  status: z.enum(["Requested", "Accepted", "Paid", "Delivered", "Completed", "Declined", "Cancelled"]).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const transitionSchema = z.object({
  expected_status: z.enum(["Requested", "Accepted", "Paid", "Delivered", "Completed", "Declined", "Cancelled"]),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.expected_status === "Requested" && value.reason === "") {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Alasan penolakan tidak boleh kosong." });
  }
});

export const customerCompletionSchema = z.object({
  expected_status: z.literal("Delivered"),
});
