import { prisma } from "../../config/prisma.js";
import { lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { enqueueInAppNotices } from "./notification-outbox.js";
import { isAssistanceSlaOverdue } from "./revision-assistance.js";
import { syncRevisionResponseClocks } from "./revision-response-clock.js";

const BATCH_SIZE = 100;

/** Records overdue admin handling without resolving or closing the assistance. */
export async function processOverdueRevisionAssistance(now = new Date()) {
  const candidates = await prisma.revisionEscalationRequest.findMany({
    where: { status: { in: ["OPEN", "IN_REVIEW"] }, slaDueAt: { lte: now }, slaBreachedAt: null },
    orderBy: [{ slaDueAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
    select: { id: true, bookingId: true, revisionId: true },
  });
  let recorded = 0;
  for (const candidate of candidates) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockBookingAndActiveCycle(tx, candidate.bookingId);
        await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${candidate.revisionId} AND "bookingId" = ${candidate.bookingId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "RevisionEscalationRequest" WHERE "id" = ${candidate.id} FOR UPDATE`;
        const assistance = await tx.revisionEscalationRequest.findUnique({ where: { id: candidate.id } });
        if (!assistance || !["OPEN", "IN_REVIEW"].includes(assistance.status) || assistance.slaBreachedAt || !isAssistanceSlaOverdue(assistance.slaDueAt, now)) return false;
        const transitioned = assistance.status === "OPEN";
        await tx.revisionEscalationRequest.update({ where: { id: assistance.id }, data: {
          status: "IN_REVIEW",
          ...(transitioned ? { reviewStartedAt: now, version: { increment: 1 } } : {}),
          slaBreachedAt: now,
          updatedAt: now,
        } });
        const event = await tx.revisionEscalationEvent.create({ data: {
          assistanceId: assistance.id, actorUserId: null, actorType: "SYSTEM", eventType: "SLA_OVERDUE",
          fromStatus: assistance.status, toStatus: "IN_REVIEW",
          reason: `ADMIN_HANDLING_SLA_EXCEEDED:${Math.max(0, now.getTime() - assistance.slaDueAt.getTime())}ms`, occurredAt: now,
        } });
        await syncRevisionResponseClocks(tx, assistance.revisionId, now, null);
        await syncDeliveryCycleBlockers(tx, assistance.bookingId, now);
        const admins = await tx.user.findMany({ where: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { id: true } });
        await enqueueInAppNotices(tx, `revision-assistance:${assistance.id}:sla-overdue:${event.id}`, "REVISION_ASSISTANCE_SLA_OVERDUE", admins.map((admin) => ({
          userId: admin.id, type: "COMPLAINT" as const, title: "Bantuan revisi melewati SLA",
          body: "Kasus tetap aktif di antrean IN_REVIEW dan belum diselesaikan otomatis.", refId: assistance.id,
        })));
        return true;
      });
      if (result) recorded++;
    } catch (error) {
      console.error("[REVISION_ASSISTANCE_SLA_ERROR]", error instanceof Error ? error.message : "Unknown error");
    }
  }
  return { checked: candidates.length, recorded };
}
