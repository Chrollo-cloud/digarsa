import type { Prisma } from "../../generated/prisma/client.js";

type Tx = Prisma.TransactionClient;
const ACTIVE_ASSISTANCE = ["OPEN", "IN_REVIEW"] as const;

export function remainingResponseMilliseconds(deadlineAt: Date, now: Date) {
  const deadline = deadlineAt.getTime();
  const current = now.getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(current)) throw new RangeError("Invalid response clock timestamp");
  return Math.max(0, deadline - current);
}

export function responseDeadlineFromRemaining(now: Date, remainingMs: number) {
  if (!Number.isSafeInteger(remainingMs) || remainingMs < 0 || !Number.isFinite(now.getTime())) throw new RangeError("Invalid response clock remainder");
  return new Date(now.getTime() + remainingMs);
}

export async function syncRevisionResponseClocks(tx: Tx, revisionId: string, now: Date, actorUserId: string | null) {
  const revision = await tx.revisionRequest.findUnique({ where: { id: revisionId }, select: {
    id: true, status: true, sellerResponseDeadlineAt: true,
    sellerResponseRemainingMs: true, sellerResponsePausedAt: true,
  } });
  if (!revision) return;
  const activeAssistance = await tx.revisionEscalationRequest.findMany({
    where: { revisionId, status: { in: [...ACTIVE_ASSISTANCE] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, responseClockType: true, responseClarificationId: true },
  });

  if (revision.status === "REQUESTED") {
    const owner = activeAssistance[0];
    if (owner && !revision.sellerResponsePausedAt) {
      const remainingMs = remainingResponseMilliseconds(revision.sellerResponseDeadlineAt, now);
      await tx.revisionResponseClockPause.create({ data: {
        revisionId, assistanceId: owner.id, clockType: "SELLER_RESPONSE", pausedAt: now, remainingMs, actorUserId,
      } });
      await tx.revisionRequest.update({ where: { id: revisionId }, data: { sellerResponsePausedAt: now, sellerResponseRemainingMs: remainingMs } });
    } else if (!owner && revision.sellerResponsePausedAt) {
      const pause = await tx.revisionResponseClockPause.findFirst({
        where: { revisionId, clockType: "SELLER_RESPONSE", resume: null },
        orderBy: [{ pausedAt: "desc" }, { id: "desc" }],
      });
      if (!pause || revision.sellerResponseRemainingMs === null) throw new Error("SELLER_RESPONSE_CLOCK_PAUSE_LEDGER_INCONSISTENT");
      const deadlineAt = responseDeadlineFromRemaining(now, revision.sellerResponseRemainingMs);
      await tx.revisionResponseClockResume.create({ data: { pauseId: pause.id, resumedAt: now, restoredDeadlineAt: deadlineAt, actorUserId } });
      await tx.revisionRequest.update({ where: { id: revisionId }, data: { sellerResponseDeadlineAt: deadlineAt, sellerResponseRemainingMs: null, sellerResponsePausedAt: null } });
    }
    return;
  }

  if (revision.status !== "WAITING_CUSTOMER") return;
  const clarification = await tx.revisionClarification.findFirst({
    where: { revisionId, status: "WAITING_CUSTOMER", requesterRole: "SELLER" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, responseDueAt: true, responseRemainingMs: true, responsePausedAt: true },
  });
  if (!clarification) return;
  const owner = activeAssistance[0];
  if (owner && !clarification.responsePausedAt) {
    const remainingMs = remainingResponseMilliseconds(clarification.responseDueAt, now);
    await tx.revisionResponseClockPause.create({ data: {
      revisionId, clarificationId: clarification.id, assistanceId: owner.id,
      clockType: "CUSTOMER_CLARIFICATION", pausedAt: now, remainingMs, actorUserId,
    } });
    await tx.revisionClarification.update({ where: { id: clarification.id }, data: { responsePausedAt: now, responseRemainingMs: remainingMs } });
  } else if (!owner && clarification.responsePausedAt) {
    const pause = await tx.revisionResponseClockPause.findFirst({
      where: { revisionId, clarificationId: clarification.id, clockType: "CUSTOMER_CLARIFICATION", resume: null },
      orderBy: [{ pausedAt: "desc" }, { id: "desc" }],
    });
    if (!pause || clarification.responseRemainingMs === null) throw new Error("CUSTOMER_RESPONSE_CLOCK_PAUSE_LEDGER_INCONSISTENT");
    const deadlineAt = responseDeadlineFromRemaining(now, clarification.responseRemainingMs);
    await tx.revisionResponseClockResume.create({ data: { pauseId: pause.id, resumedAt: now, restoredDeadlineAt: deadlineAt, actorUserId } });
    await tx.revisionClarification.update({ where: { id: clarification.id }, data: { responseDueAt: deadlineAt, responseRemainingMs: null, responsePausedAt: null } });
  }
}

export function hasPausedResponseClock(input: { pausedAt: Date | null; activeAssistanceCount: number }) {
  return input.pausedAt !== null && input.activeAssistanceCount > 0;
}

export async function isRevisionResponseClockPaused(tx: Tx, input: { revisionId: string; clockType: "SELLER_RESPONSE" | "CUSTOMER_CLARIFICATION"; clarificationId?: string }) {
  const assistance = await tx.revisionEscalationRequest.findFirst({ where: {
    revisionId: input.revisionId,
    status: { in: [...ACTIVE_ASSISTANCE] },
  }, select: { id: true } });
  return Boolean(assistance);
}
