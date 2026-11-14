import type { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../lib/http.js";
import { closeActiveDeliveryCycle } from "./delivery-cycle.js";
import { closeReviewTimer } from "./booking-timer.js";
import { releaseRevisionUnit } from "./revision-ledger.js";

type Tx = Prisma.TransactionClient;

/** Applies only the booking lifecycle outcome; payment and payout rows are deliberately untouched. */
export async function cancelBookingFromDispute(tx: Tx, input: { bookingId: string; actorId: string; reason: string; now: Date }) {
  const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, status: true } });
  if (!booking || !["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"].includes(booking.status)) throw new HttpError(409, "DISPUTE_CANCELLATION_CONFLICT", "Status booking tidak dapat dibatalkan melalui keputusan sengketa.");
  const pendingAssistance = await tx.revisionEscalationRequest.findFirst({ where: { bookingId: input.bookingId, status: { in: ["OPEN", "IN_REVIEW"] } }, select: { id: true } });
  if (pendingAssistance) throw new HttpError(409, "ACTIVE_ADMIN_ASSISTANCE", "Bantuan admin revisi harus diselesaikan sebelum pembatalan sengketa dijalankan.");
  const activeRevisions = await tx.revisionRequest.findMany({ where: { bookingId: input.bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const revision of activeRevisions) {
    if (["REQUESTED", "WAITING_CUSTOMER"].includes(revision.status)) {
      await releaseRevisionUnit(tx, { bookingId: input.bookingId, revisionId: revision.id, cycleId: revision.deliveryCycleId, generation: revision.reservationGeneration, actorUserId: input.actorId, reason: "DISPUTE_DECISION_CANCELLED_BOOKING" });
    }
    await tx.revisionClarification.updateMany({ where: { revisionId: revision.id, status: { in: ["WAITING_CUSTOMER", "WAITING_SELLER"] } }, data: { status: "CANCELLED", closedAt: input.now } });
    await tx.revisionRequest.update({ where: { id: revision.id }, data: { status: "WITHDRAWN", withdrawnAt: input.now } });
    await tx.revisionEvent.create({ data: { revisionId: revision.id, actorUserId: input.actorId, eventType: "DISPUTE_BOOKING_CANCELLED", fromStatus: revision.status, toStatus: "WITHDRAWN", payload: { quota_reserved_released: ["REQUESTED", "WAITING_CUSTOMER"].includes(revision.status), consumed_quota_restored: false }, occurredAt: input.now } });
  }
  const won = await tx.booking.updateMany({ where: { id: input.bookingId, status: booking.status }, data: { status: "CANCELLED" } });
  if (won.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status booking berubah saat keputusan dijalankan.");
  await tx.bookingStatusEvent.create({ data: { bookingId: input.bookingId, fromStatus: booking.status, toStatus: "CANCELLED", actorUserId: input.actorId, source: "ADMIN_DISPUTE_DECISION", occurredAt: input.now } });
  const pendingCancellation = await tx.cancellationRequest.findFirst({ where: { bookingId: input.bookingId, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (pendingCancellation) await tx.cancellationRequest.update({ where: { id: pendingCancellation.id }, data: { status: "APPROVED", adminNote: `Dispute decision: ${input.reason}`, reviewedById: input.actorId, reviewedAt: input.now } });
  await closeActiveDeliveryCycle(tx, input.bookingId, input.now, "CANCELLED", input.actorId);
  await closeReviewTimer(tx, input.bookingId, input.now, "BOOKING_CANCELLED", input.actorId);
  await tx.disputeRevisionAuthorization.updateMany({ where: { bookingId: input.bookingId, status: "AVAILABLE" }, data: { status: "REVOKED", revokedAt: input.now } });
}
