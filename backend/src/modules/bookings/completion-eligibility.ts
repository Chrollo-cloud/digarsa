import type { Prisma } from "../../generated/prisma/client.js";
import { getActiveCompletionBlockers, reviewDeadlineFromLedger } from "./booking-timer.js";
import { lockBookingAndActiveCycle } from "./delivery-cycle.js";

type Tx = Prisma.TransactionClient;
export type CompletionMode = "CUSTOMER" | "SCHEDULER";

/** Shared authoritative eligibility. Caller holds the transaction through the state transition. */
export async function checkCompletionEligibility(tx: Tx, bookingId: string, mode: CompletionMode, now: Date, expectedGeneration?: number) {
  await lockBookingAndActiveCycle(tx, bookingId);
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true } });
  if (!booking || booking.status !== "DELIVERED") return { eligible: false as const, reason: "BOOKING_STATE" as const };
  const blockers = await getActiveCompletionBlockers(tx, bookingId);
  if (blockers.length) return { eligible: false as const, reason: "ACTIVE_BLOCKER" as const };
  const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true }, include: { pauseIntervals: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] } } });
  if (!cycle) return { eligible: false as const, reason: "LEGACY_REVIEW_REQUIRED" as const };
  if (cycle.status !== "REVIEW_ACTIVE" || cycle.closedAt || cycle.pausedAt || cycle.remainingMs !== null || !cycle.deadlineAt) return { eligible: false as const, reason: "TIMER_STATE" as const };
  try {
    const intervals = cycle.pauseIntervals.map((item) => ({ startedAt: item.startedAt, endedAt: item.endedAt }));
    if (intervals.some((item) => item.endedAt === null) || reviewDeadlineFromLedger(cycle.deliveryAt, cycle.durationMs, intervals).getTime() !== cycle.deadlineAt.getTime()) {
      return { eligible: false as const, reason: "TIMER_STATE" as const };
    }
  } catch {
    return { eligible: false as const, reason: "TIMER_STATE" as const };
  }
  if (mode === "CUSTOMER") return { eligible: true as const, cycle };
  if (expectedGeneration !== undefined && cycle.version !== expectedGeneration) return { eligible: false as const, reason: "TIMER_VERSION" as const };
  if (cycle.deadlineAt > now) return { eligible: false as const, reason: "NOT_DUE" as const };
  return { eligible: true as const, cycle };
}
