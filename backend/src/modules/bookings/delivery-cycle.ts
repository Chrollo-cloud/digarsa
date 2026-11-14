import type { Prisma } from "../../generated/prisma/client.js";
import { REVIEW_DURATION_MS, getActiveCompletionBlockers, remainingReviewMs } from "./booking-timer.js";

type Tx = Prisma.TransactionClient;

/** All callers hold the Booking row first. The active cycle is then re-read and locked. */
export async function lockBookingAndActiveCycle(tx: Tx, bookingId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "DeliveryCycle" WHERE "bookingId" = ${bookingId} AND "active" = TRUE FOR UPDATE`;
}

export async function createDeliveryCycle(tx: Tx, bookingId: string, deliveryAt: Date, sourceRevisionId?: string) {
  const latest = await tx.deliveryCycle.aggregate({ where: { bookingId }, _max: { sequence: true } });
  const sequence = (latest._max.sequence ?? 0) + 1;
  const deadlineAt = new Date(deliveryAt.getTime() + REVIEW_DURATION_MS);
  const cycle = await tx.deliveryCycle.create({ data: { bookingId, sequence, deliveryAt, durationMs: REVIEW_DURATION_MS, deadlineAt, ...(sourceRevisionId ? { sourceRevisionId } : {}) } });
  await tx.deliveryCycleJob.create({ data: { deliveryCycleId: cycle.id, bookingId, generation: cycle.version, scheduledAt: deadlineAt } });
  return cycle;
}

async function updateJob(tx: Tx, cycleId: string, generation: number, scheduledAt: Date | null, enabled: boolean) {
  await tx.deliveryCycleJob.updateMany({ where: { deliveryCycleId: cycleId }, data: enabled
    ? { status: "PENDING", scheduledAt, generation, claimToken: null, claimExpiresAt: null, completedAt: null, lastError: null }
    : { status: "CANCELLED", scheduledAt: null, generation, claimToken: null, claimExpiresAt: null, completedAt: null } });
}

/** Must run after Booking -> DeliveryCycle locks and in the blocker mutation transaction. */
export async function syncDeliveryCycleBlockers(tx: Tx, bookingId: string, now: Date, actorId: string | null = null) {
  const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true }, include: { pauseIntervals: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] } } });
  if (!cycle) return null;
  const blockers = await getActiveCompletionBlockers(tx, bookingId);
  const open = cycle.pauseIntervals.find((item) => item.endedAt === null);
  if (blockers.length && !open) {
    const closed = cycle.pauseIntervals.filter((item) => item.endedAt !== null).map((item) => ({ startedAt: item.startedAt, endedAt: item.endedAt }));
    const remaining = remainingReviewMs(cycle.deliveryAt, cycle.durationMs, closed, now);
    const blocker = blockers[0]!;
    await tx.deliveryCyclePauseInterval.create({ data: { deliveryCycleId: cycle.id, openCycleId: cycle.id, blockerType: blocker.domain, source: blocker.sourceId, startedAt: now, startedByUserId: actorId ?? blocker.actorId } });
    const version = cycle.version + 1;
    await tx.deliveryCycle.update({ where: { id: cycle.id }, data: { status: "REVIEW_PAUSED", deadlineAt: null, pausedAt: now, remainingMs: remaining, version } });
    await updateJob(tx, cycle.id, version, null, false);
  } else if (!blockers.length && open) {
    const closed = cycle.pauseIntervals.filter((item) => item.endedAt !== null).map((item) => ({ startedAt: item.startedAt, endedAt: item.endedAt }));
    const remaining = remainingReviewMs(cycle.deliveryAt, cycle.durationMs, closed, open.startedAt);
    await tx.deliveryCyclePauseInterval.update({ where: { id: open.id }, data: { endedAt: now, openCycleId: null, endType: "RESUMED", endedByUserId: actorId } });
    const version = cycle.version + 1;
    const deadlineAt = new Date(now.getTime() + remaining);
    await tx.deliveryCycle.update({ where: { id: cycle.id }, data: { status: "REVIEW_ACTIVE", deadlineAt, pausedAt: null, remainingMs: null, version } });
    await updateJob(tx, cycle.id, version, deadlineAt, true);
  }
  return cycle.id;
}

export async function closeActiveDeliveryCycle(tx: Tx, bookingId: string, now: Date, status: "COMPLETED" | "CANCELLED" | "SUPERSEDED", actorId: string | null = null) {
  const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true }, include: { pauseIntervals: { where: { endedAt: null } } } });
  if (!cycle) return null;
  const open = cycle.pauseIntervals[0];
  if (open) await tx.deliveryCyclePauseInterval.update({ where: { id: open.id }, data: { endedAt: now, openCycleId: null, endType: status, endedByUserId: actorId } });
  const version = cycle.version + 1;
  await tx.deliveryCycle.update({ where: { id: cycle.id }, data: { status, active: false, deadlineAt: null, pausedAt: null, remainingMs: null, closedAt: now, version } });
  await updateJob(tx, cycle.id, version, null, false);
  return cycle;
}
