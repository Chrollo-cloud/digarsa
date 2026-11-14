import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import {
  createCancellationEvidenceSignedUrl,
  makeCancellationEvidencePath,
  removeCancellationEvidence,
  uploadCancellationEvidence,
} from "../../lib/storage.js";
import { z } from "zod";

const requestSchema = z.object({ reason: z.string().trim().min(10).max(1000) });
const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  admin_note: z.string().trim().min(3).max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "REJECTED" && !value.admin_note) {
    ctx.addIssue({ code: "custom", path: ["admin_note"], message: "Alasan penolakan wajib diisi." });
  }
});

function userId(res: Response) { return (res.locals.auth as { userId: string }).userId; }

function parsed<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(422, "VALIDATION_FAILED", "Data pembatalan tidak valid.", result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  return result.data as T;
}

export async function requestBookingCancellation(req: Request, res: Response) {
  const customerId = userId(res);
  const bookingId = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const input = parsed<ReturnType<typeof requestSchema.parse>>(requestSchema, req.body);
  if (!req.file) throw new HttpError(422, "EVIDENCE_REQUIRED", "Lampirkan bukti untuk mengajukan pembatalan.");
  const evidencePath = makeCancellationEvidencePath(customerId, req.file);
  await uploadCancellationEvidence(evidencePath, req.file);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} AND "customerId" = ${customerId} FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, customerId }, select: { id: true, status: true, seller: { select: { userId: true } } } });
      if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
      if (!["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"].includes(booking.status)) {
        throw new HttpError(409, "CANCELLATION_NOT_ALLOWED", "Pesanan ini tidak dapat diajukan pembatalannya.");
      }
      const pending = await tx.cancellationRequest.findFirst({ where: { bookingId, status: "PENDING" }, select: { id: true } });
      if (pending) throw new HttpError(409, "CANCELLATION_ALREADY_PENDING", "Pengajuan pembatalan pesanan ini masih ditinjau.");
      const cancellation = await tx.cancellationRequest.create({ data: { bookingId, requesterId: customerId, reason: input.reason, evidencePath } });
      const admins = await tx.user.findMany({ where: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { id: true } });
      await tx.notification.createMany({ data: admins.map((admin) => ({
        userId: admin.id,
        type: "COMPLAINT" as const,
        title: "Pengajuan pembatalan pesanan",
        body: "Ada pengajuan pembatalan pesanan dengan bukti yang perlu ditinjau.",
        refId: cancellation.id,
      })) });
      await tx.notification.create({ data: {
        userId: booking.seller.userId,
        type: "BOOKING_UPDATE",
        title: "Pembatalan pesanan sedang ditinjau",
        body: "Buyer mengajukan pembatalan. Pesanan dan dana tidak berubah sampai admin meninjau bukti.",
        refId: bookingId,
      } });
      return cancellation;
    });
    res.status(201).json({ data: { id: result.id, booking_id: result.bookingId, status: result.status, created_at: result.createdAt.toISOString() } });
  } catch (error) {
    await removeCancellationEvidence(evidencePath).catch(() => undefined);
    throw error;
  }
}

export async function listCancellationRequests(_req: Request, res: Response) {
  const requests = await prisma.cancellationRequest.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
    include: {
      booking: { select: { id: true, status: true, price: true, serviceTitle: true, sellerName: true, customerId: true, seller: { select: { userId: true } } } },
      requester: { select: { id: true, name: true, email: true } },
    },
  });
  const data = await Promise.all(requests.map(async (request) => ({
    id: request.id,
    booking_id: request.bookingId,
    status: request.status,
    reason: request.reason,
    evidence_url: await createCancellationEvidenceSignedUrl(request.evidencePath),
    admin_note: request.adminNote,
    requested_at: request.createdAt.toISOString(),
    booking: request.booking,
    requester: request.requester,
  })));
  res.status(200).json({ data });
}

export async function decideCancellationRequest(req: Request, res: Response) {
  const adminId = userId(res);
  const id = typeof req.params.cancellation_id === "string" ? req.params.cancellation_id : "";
  const input = parsed<ReturnType<typeof decisionSchema.parse>>(decisionSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CancellationRequest" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.cancellationRequest.findUnique({ where: { id }, include: { booking: { include: { payment: true, seller: { select: { userId: true } } } } } });
    if (!existing) throw new HttpError(404, "CANCELLATION_NOT_FOUND", "Pengajuan pembatalan tidak ditemukan.");
    if (existing.status !== "PENDING") throw new HttpError(409, "CANCELLATION_ALREADY_REVIEWED", "Pengajuan ini sudah ditinjau.");
    const booking = existing.booking;
    if (input.status === "APPROVED") {
      if (!["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"].includes(booking.status)) {
        throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah; pembatalan tidak dapat disetujui.");
      }
      const changed = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status },
        data: { status: "CANCELLED" },
      });
      if (changed.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
      if (booking.payment?.status === "PAID") {
        await tx.payment.update({ where: { bookingId: booking.id }, data: { status: "REFUND_PENDING", payoutStatus: "HELD" } });
      }
      await tx.bookingStatusEvent.create({ data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "CANCELLED",
        actorUserId: adminId,
        source: "ADMIN_CANCELLATION_APPROVAL",
      } });
    }
    const cancellation = await tx.cancellationRequest.update({
      where: { id },
      data: { status: input.status, adminNote: input.admin_note ?? null, reviewedById: adminId, reviewedAt: new Date() },
    });
    await tx.notification.createMany({ data: [
      {
        userId: existing.requesterId,
        type: "BOOKING_UPDATE",
        title: input.status === "APPROVED" ? "Pembatalan disetujui" : "Pembatalan ditolak",
        body: input.status === "APPROVED" && booking.payment?.status === "PAID"
          ? "Pembatalan disetujui. Pengembalian dana menunggu konfirmasi penyedia pembayaran."
          : input.admin_note ?? null,
        refId: booking.id,
      },
      {
        userId: booking.seller.userId,
        type: "BOOKING_UPDATE",
        title: input.status === "APPROVED" ? "Pesanan dibatalkan" : "Pembatalan ditolak",
        body: input.admin_note ?? null,
        refId: booking.id,
      },
    ] });
    return cancellation;
  });
  res.status(200).json({ data: { id: result.id, booking_id: result.bookingId, status: result.status, admin_note: result.adminNote, reviewed_at: result.reviewedAt?.toISOString() ?? null } });
}