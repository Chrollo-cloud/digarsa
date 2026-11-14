import type { Prisma } from "../../generated/prisma/client.js";
import { remainingQuota } from "./revision-policy.js";

type Tx = Prisma.TransactionClient;

export async function readRevisionQuota(tx: Tx, bookingId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { revisionFreeCount: true, revisionPolicyHash: true } });
  if (!booking || !booking.revisionPolicyHash || booking.revisionFreeCount === null) return null;
  const totals = await tx.revisionQuotaLedger.aggregate({ where: { bookingId }, _sum: { availableDelta: true, reservedDelta: true, consumedDelta: true, expiredDelta: true } });
  return remainingQuota(booking.revisionFreeCount, {
    available: totals._sum.availableDelta,
    reserved: totals._sum.reservedDelta,
    consumed: totals._sum.consumedDelta,
    expired: totals._sum.expiredDelta,
  });
}

async function append(tx: Tx, input: {
  bookingId: string; revisionId?: string | null; deliveryCycleId?: string | null;
  operation: "RESERVE" | "CONSUME" | "RELEASE" | "EXPIRE" | "SYSTEM_ERROR_RETURN";
  availableDelta: number; reservedDelta: number; consumedDelta: number; expiredDelta: number;
  operationReference: string; actorUserId?: string | null; reason?: string | null; evidenceReference?: string | null;
}) {
  return tx.revisionQuotaLedger.create({ data: input });
}

export async function reserveRevisionUnit(tx: Tx, input: { bookingId: string; revisionId: string; cycleId: string; generation: number; actorUserId: string; now: Date }) {
  const quota = await readRevisionQuota(tx, input.bookingId);
  if (!quota) throw new Error("REVISION_POLICY_SNAPSHOT_MISSING");
  if (quota.available < 1) throw new Error("REVISION_QUOTA_EXHAUSTED");
  return append(tx, {
    bookingId: input.bookingId, revisionId: input.revisionId, deliveryCycleId: input.cycleId,
    operation: "RESERVE", availableDelta: -1, reservedDelta: 1, consumedDelta: 0, expiredDelta: 0,
    operationReference: `revision:${input.revisionId}:reservation:${input.generation}:reserve`, actorUserId: input.actorUserId,
  });
}

export async function consumeRevisionUnit(tx: Tx, input: { bookingId: string; revisionId: string; cycleId: string; generation: number; actorUserId: string }) {
  const quota = await readRevisionQuota(tx, input.bookingId);
  if (!quota || quota.reserved < 1) throw new Error("REVISION_RESERVATION_MISSING");
  return append(tx, {
    bookingId: input.bookingId, revisionId: input.revisionId, deliveryCycleId: input.cycleId,
    operation: "CONSUME", availableDelta: 0, reservedDelta: -1, consumedDelta: 1, expiredDelta: 0,
    operationReference: `revision:${input.revisionId}:reservation:${input.generation}:consume`, actorUserId: input.actorUserId,
  });
}

export async function releaseRevisionUnit(tx: Tx, input: { bookingId: string; revisionId: string; cycleId: string; generation: number; actorUserId: string; reason: string }) {
  const quota = await readRevisionQuota(tx, input.bookingId);
  if (!quota || quota.reserved < 1) throw new Error("REVISION_RESERVATION_MISSING");
  return append(tx, {
    bookingId: input.bookingId, revisionId: input.revisionId, deliveryCycleId: input.cycleId,
    operation: "RELEASE", availableDelta: 1, reservedDelta: -1, consumedDelta: 0, expiredDelta: 0,
    operationReference: `revision:${input.revisionId}:reservation:${input.generation}:release`, actorUserId: input.actorUserId, reason: input.reason,
  });
}

export async function expireUnusedRevisionQuota(tx: Tx, bookingId: string, cycleId: string, now: Date) {
  const quota = await readRevisionQuota(tx, bookingId);
  if (!quota || quota.available <= 0) return null;
  return append(tx, {
    bookingId, deliveryCycleId: cycleId, operation: "EXPIRE", availableDelta: -quota.available,
    reservedDelta: 0, consumedDelta: 0, expiredDelta: quota.available,
    operationReference: `booking:${bookingId}:quota:expire`, actorUserId: null, reason: `BOOKING_COMPLETED:${now.toISOString()}`,
  });
}

export async function returnSystemErrorQuota(tx: Tx, input: { bookingId: string; revisionId: string; cycleId: string; generation: number; actorUserId: string; reason: string; evidenceReference: string }) {
  const quota = await readRevisionQuota(tx, input.bookingId);
  if (!quota || quota.consumed < 1) throw new Error("REVISION_CONSUMED_QUOTA_MISSING");
  const consumed = await tx.revisionQuotaLedger.findUnique({ where: { operationReference: `revision:${input.revisionId}:reservation:${input.generation}:consume` }, select: { id: true } });
  if (!consumed) throw new Error("REVISION_CONSUMED_QUOTA_MISSING");
  return append(tx, {
    bookingId: input.bookingId, revisionId: input.revisionId, deliveryCycleId: input.cycleId,
    operation: "SYSTEM_ERROR_RETURN", availableDelta: 1, reservedDelta: 0, consumedDelta: -1, expiredDelta: 0,
    operationReference: `revision:${input.revisionId}:reservation:${input.generation}:system-error-return`,
    actorUserId: input.actorUserId, reason: input.reason, evidenceReference: input.evidenceReference,
  });
}
