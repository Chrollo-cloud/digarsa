import type { Prisma } from "../../generated/prisma/client.js";
import { randomUUID } from "node:crypto";

export const REVIEW_DURATION_MS = 72 * 60 * 60 * 1000;
export type CompletionBlockerDomain = "CANCELLATION" | "REVISION" | "DISPUTE" | "APPEAL" | "ADMIN_ESCALATION";
export const IMPLEMENTED_COMPLETION_BLOCKER_DOMAINS: readonly CompletionBlockerDomain[] = ["CANCELLATION", "REVISION", "DISPUTE", "APPEAL", "ADMIN_ESCALATION"];
export const UNSUPPORTED_COMPLETION_BLOCKER_DOMAINS: readonly CompletionBlockerDomain[] = [];

export type LegacyDeliveryClassification = "VALID_DELIVERY_AND_DEADLINE" | "DERIVABLE_DEADLINE" | "UNSUPPORTED_DEADLINE" | "NO_VERIFIABLE_DELIVERY" | "ALREADY_COMPLETED";
export function classifyLegacyDelivery(input: { status: string; deliveredAt: Date | null; deadlineAt: Date | null }) {
  if (input.status === "COMPLETED") return { category: "ALREADY_COMPLETED" as const, autoCompletionEligible: false as const };
  const delivered = input.deliveredAt?.getTime();
  const deadline = input.deadlineAt?.getTime();
  if (delivered === undefined || !Number.isFinite(delivered)) return { category: input.deadlineAt ? "UNSUPPORTED_DEADLINE" as const : "NO_VERIFIABLE_DELIVERY" as const, autoCompletionEligible: false as const };
  if (deadline !== undefined && Number.isFinite(deadline) && deadline >= delivered) return { category: "VALID_DELIVERY_AND_DEADLINE" as const, autoCompletionEligible: false as const };
  if (input.deadlineAt === null) return { category: "DERIVABLE_DEADLINE" as const, autoCompletionEligible: false as const };
  return { category: "UNSUPPORTED_DEADLINE" as const, autoCompletionEligible: false as const };
}

export function remainingReviewMs(deliveryAt: Date, durationMs: number, intervals: Array<{ startedAt: Date; endedAt: Date | null }>, now: Date) {
  const start = deliveryAt.getTime();
  const current = now.getTime();
  if (![start, current, durationMs].every(Number.isFinite) || durationMs < 0 || current < start) throw new RangeError("Invalid review timer inputs");
  let paused = 0;
  let lastEnd = start;
  for (const interval of [...intervals].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const a = interval.startedAt.getTime();
    const b = interval.endedAt?.getTime();
    if (!Number.isFinite(a) || a < start || a < lastEnd) throw new RangeError("Invalid or overlapping pause interval ledger");
    if (interval.endedAt === null) {
      paused += Math.max(0, Math.min(current, b ?? current) - a);
      lastEnd = Math.max(a, Math.min(current, b ?? current));
      continue;
    }
    if (b === undefined || !Number.isFinite(b) || b < a) throw new RangeError("Invalid or overlapping pause interval ledger");
    paused += Math.max(0, Math.min(current, b) - a);
    lastEnd = b;
  }
  return Math.max(0, durationMs - (current - start - paused));
}

/** Rebuilds an active deadline from the immutable interval ledger. A pause opened
 * after expiry has zero remainder and therefore resumes as immediately due. */
export function reviewDeadlineFromLedger(deliveryAt: Date, durationMs: number, intervals: Array<{ startedAt: Date; endedAt: Date | null }>) {
  const start = deliveryAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(durationMs) || durationMs < 0) throw new RangeError("Invalid review timer inputs");
  let deadline = start + durationMs;
  let lastEnd = start;
  for (const interval of [...intervals].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const pauseStart = interval.startedAt.getTime();
    const pauseEnd = interval.endedAt?.getTime();
    if (!Number.isFinite(pauseStart) || pauseStart < lastEnd || pauseEnd === undefined || !Number.isFinite(pauseEnd) || pauseEnd < pauseStart) throw new RangeError("Deadline reconstruction requires non-overlapping closed intervals");
    deadline = pauseStart < deadline ? deadline + (pauseEnd - pauseStart) : pauseEnd;
    lastEnd = pauseEnd;
  }
  return new Date(deadline);
}

type Tx = Prisma.TransactionClient;
type Blocker = { domain: CompletionBlockerDomain; sourceId: string; actorId: string | null };

export async function getActiveCompletionBlockers(tx: Tx, bookingId: string): Promise<Blocker[]> {
  // Booking and active cycle are already locked by every mutating caller.
  // Lock active blocker rows in stable domain/ID order before reading them.
  await tx.$queryRaw`SELECT "id" FROM "CancellationRequest" WHERE "bookingId" = ${bookingId} AND "status" = 'PENDING' ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "bookingId" = ${bookingId} AND "status" IN ('REQUESTED', 'WAITING_CUSTOMER', 'IN_PROGRESS') ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "RevisionEscalationRequest" WHERE "bookingId" = ${bookingId} AND "status" IN ('OPEN', 'IN_REVIEW') ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Dispute" WHERE "bookingId" = ${bookingId} AND "status" <> 'DECIDED' ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT appeal."id" FROM "DisputeAppeal" AS appeal JOIN "Dispute" AS dispute ON dispute."id" = appeal."disputeId" WHERE dispute."bookingId" = ${bookingId} AND appeal."status" IN ('SUBMITTED', 'IN_REVIEW') ORDER BY appeal."id" FOR UPDATE OF appeal`;
  const cancellations = await tx.cancellationRequest.findMany({
    where: { bookingId, status: "PENDING" },
    select: { id: true, requesterId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const revisions = await tx.revisionRequest.findMany({
    where: { bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const escalations = await tx.revisionEscalationRequest.findMany({
    where: { bookingId, status: { in: ["OPEN", "IN_REVIEW"] } },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const disputes = await tx.dispute.findMany({
    where: { bookingId, status: { not: "DECIDED" } },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const appeals = await tx.disputeAppeal.findMany({
    where: { dispute: { bookingId }, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
    select: { id: true },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
  });
  return [
    ...cancellations.map((row) => ({ domain: "CANCELLATION" as const, sourceId: row.id, actorId: row.requesterId })),
    ...revisions.map((row) => ({ domain: "REVISION" as const, sourceId: row.id, actorId: null })),
    ...escalations.map((row) => ({ domain: "ADMIN_ESCALATION" as const, sourceId: row.id, actorId: null })),
    ...disputes.map((row) => ({ domain: "DISPUTE" as const, sourceId: row.id, actorId: null })),
    ...appeals.map((row) => ({ domain: "APPEAL" as const, sourceId: row.id, actorId: null })),
  ];
}

async function updateJob(tx: Tx, timerId: string, timerVersion: number, scheduledAt: Date | null, enabled: boolean) {
  const job = await tx.bookingReviewJob.findUnique({ where: { timerId }, select: { id: true } });
  if (!job) return;
  await tx.bookingReviewJob.update({
    where: { timerId },
    data: enabled
      ? { status: "PENDING", scheduledAt, timerVersion, claimToken: null, claimExpiresAt: null, completedAt: null, lastError: null }
      : { status: "CANCELLED", scheduledAt: null, timerVersion, claimToken: null, claimExpiresAt: null, completedAt: null },
  });
}

export async function lockBookingAndTimer(tx: Tx, bookingId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "BookingReviewTimer" WHERE "bookingId" = ${bookingId} FOR UPDATE`;
}

/** Call only after acquiring Booking then timer row locks, in the same transaction as blocker mutation. */
export async function syncReviewTimerBlockers(tx: Tx, bookingId: string, now: Date, actorId: string | null = null) {
  const timer = await tx.bookingReviewTimer.findUnique({
    where: { bookingId },
    include: { pauseIntervals: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] } },
  });
  if (!timer || timer.closedAt) return;
  const blockers = await getActiveCompletionBlockers(tx, bookingId);
  const open = timer.pauseIntervals.find((interval) => interval.endedAt === null);
  if (blockers.length && !open) {
    const closedIntervals = timer.pauseIntervals.filter((interval) => interval.endedAt !== null);
    const remaining = remainingReviewMs(timer.deliveryAt, timer.durationMs, closedIntervals, now);
    const first = blockers[0]!;
    await tx.bookingReviewPauseInterval.create({ data: {
      timerId: timer.id, openTimerId: timer.id, blockerType: first.domain, source: first.sourceId, startedAt: now, startedByUserId: actorId ?? first.actorId,
    } });
    const version = timer.version + 1;
    await tx.bookingReviewTimer.update({ where: { id: timer.id }, data: { deadlineAt: null, pausedAt: now, remainingMs: remaining, version } });
    await updateJob(tx, timer.id, version, null, false);
  } else if (!blockers.length && open) {
    const closedIntervals = timer.pauseIntervals.filter((interval) => interval.endedAt !== null);
    const remaining = remainingReviewMs(timer.deliveryAt, timer.durationMs, closedIntervals, open.startedAt);
    await tx.bookingReviewPauseInterval.update({ where: { id: open.id }, data: { endedAt: now, openTimerId: null, endType: "RESUMED", endedByUserId: actorId } });
    const version = timer.version + 1;
    const deadlineAt = new Date(now.getTime() + remaining);
    await tx.bookingReviewTimer.update({ where: { id: timer.id }, data: { deadlineAt, pausedAt: null, remainingMs: null, version } });
    await updateJob(tx, timer.id, version, deadlineAt, true);
  }
}

export async function closeReviewTimer(tx: Tx, bookingId: string, now: Date, endType: "COMPLETED" | "BOOKING_CANCELLED", actorId: string | null = null) {
  const timer = await tx.bookingReviewTimer.findUnique({ where: { bookingId }, include: { pauseIntervals: { where: { endedAt: null } } } });
  if (!timer || timer.closedAt) return;
  const open = timer.pauseIntervals[0];
  if (open) await tx.bookingReviewPauseInterval.update({ where: { id: open.id }, data: { endedAt: now, openTimerId: null, endType, endedByUserId: actorId } });
  const version = timer.version + 1;
  await tx.bookingReviewTimer.update({ where: { id: timer.id }, data: { deadlineAt: null, pausedAt: null, remainingMs: null, closedAt: now, version } });
  await updateJob(tx, timer.id, version, null, false);
}

export async function createReviewTimer(tx: Tx, bookingId: string, deliveryAt: Date) {
  const deadlineAt = new Date(deliveryAt.getTime() + REVIEW_DURATION_MS);
  const timer = await tx.bookingReviewTimer.create({ data: { bookingId, deliveryAt, durationMs: REVIEW_DURATION_MS, deadlineAt } });
  await tx.bookingReviewJob.create({ data: { timerId: timer.id, scheduledAt: deadlineAt, timerVersion: timer.version } });
  return timer;
}

export function newClaimToken() { return randomUUID(); }
