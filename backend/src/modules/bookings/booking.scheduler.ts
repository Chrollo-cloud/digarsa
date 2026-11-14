import { prisma } from "../../config/prisma.js";
import { randomUUID } from "node:crypto";
import { checkCompletionEligibility } from "./completion-eligibility.js";
import { getActiveCompletionBlockers, newClaimToken } from "./booking-timer.js";
import { closeActiveDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { deliverPendingInAppNotices, enqueueInAppNotices } from "./notification-outbox.js";
import { expireUnusedRevisionQuota } from "./revision-ledger.js";
import { processOverdueRevisionAssistance } from "./revision-assistance.scheduler.js";

const CLAIM_MS = 60_000;
const BATCH_SIZE = 50;

async function claimDueJobs(now: Date) {
  const claimToken = newClaimToken();
  const rows = await prisma.$transaction(async (tx) => {
    // Repair missing/unscheduled jobs under the same booking-first lock used by
    // lifecycle mutations. The cycle remains the authority; jobs are projections.
    const activeCycles = await tx.$queryRaw<Array<{ id: string; bookingId: string }>>`
      SELECT cycle."id", cycle."bookingId" FROM "DeliveryCycle" AS cycle
      LEFT JOIN "DeliveryCycleJob" AS job ON job."deliveryCycleId" = cycle."id"
      WHERE cycle."active" = TRUE AND (
        job."id" IS NULL OR
        (job."status" <> 'CLAIMED' AND cycle."status" = 'REVIEW_ACTIVE' AND
          (job."status" <> 'PENDING' OR job."scheduledAt" IS NULL OR job."generation" <> cycle."version")) OR
        (job."status" <> 'CLAIMED' AND cycle."status" = 'REVIEW_PAUSED' AND
          (job."status" <> 'CANCELLED' OR job."scheduledAt" IS NOT NULL OR job."generation" <> cycle."version"))
      ) ORDER BY cycle."bookingId", cycle."sequence" LIMIT 200`;
    for (const pointer of activeCycles) {
      await lockBookingAndActiveCycle(tx, pointer.bookingId);
      const cycle = await tx.deliveryCycle.findFirst({ where: { id: pointer.id, active: true } });
      if (!cycle) continue;
      const existing = await tx.deliveryCycleJob.findUnique({ where: { deliveryCycleId: cycle.id } });
      if (!existing) {
        const shouldSchedule = cycle.status === "REVIEW_ACTIVE";
        await tx.deliveryCycleJob.create({ data: {
          id: randomUUID(), deliveryCycleId: cycle.id, bookingId: cycle.bookingId, generation: cycle.version,
          status: shouldSchedule ? "PENDING" : "CANCELLED", scheduledAt: shouldSchedule ? cycle.deadlineAt : null,
        } });
      } else if (existing.status !== "CLAIMED") {
        const shouldSchedule = cycle.status === "REVIEW_ACTIVE";
        const needsRepair = shouldSchedule
          ? existing.status !== "PENDING" || existing.scheduledAt === null || existing.generation !== cycle.version
          : existing.status !== "CANCELLED" || existing.scheduledAt !== null || existing.generation !== cycle.version;
        if (needsRepair) {
          await tx.deliveryCycleJob.update({ where: { id: existing.id }, data: {
            status: shouldSchedule ? "PENDING" : "CANCELLED", scheduledAt: shouldSchedule ? cycle.deadlineAt : null,
            generation: cycle.version, claimToken: null, claimExpiresAt: null, completedAt: null,
          } });
        }
      }
    }
    return tx.$queryRaw<Array<{ id: string }>>`
    WITH expired AS (
      UPDATE "DeliveryCycleJob" SET "status" = 'PENDING', "claimToken" = NULL, "claimExpiresAt" = NULL
      WHERE "status" = 'CLAIMED' AND "claimExpiresAt" <= ${now} RETURNING "id"
    ), due AS (
      SELECT "id" FROM "DeliveryCycleJob" WHERE "status" = 'PENDING' AND "scheduledAt" <= ${now}
      ORDER BY "scheduledAt", "id" FOR UPDATE SKIP LOCKED LIMIT ${BATCH_SIZE}
    )
    UPDATE "DeliveryCycleJob" AS job SET "status" = 'CLAIMED', "claimToken" = ${claimToken},
      "claimExpiresAt" = ${new Date(now.getTime() + CLAIM_MS)}, "attempts" = job."attempts" + 1
    FROM due WHERE job."id" = due."id" RETURNING job."id"`;
  });
  return { ids: rows.map((row) => row.id), claimToken };
}

async function processClaim(jobId: string, claimToken: string, evaluationAt: Date) {
  const pointer = await prisma.deliveryCycleJob.findUnique({ where: { id: jobId }, select: { bookingId: true, deliveryCycleId: true } });
  if (!pointer) return;
  await prisma.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, pointer.bookingId);
    await tx.$queryRaw`SELECT "id" FROM "DeliveryCycleJob" WHERE "id" = ${jobId} FOR UPDATE`;
    const job = await tx.deliveryCycleJob.findFirst({ where: { id: jobId, status: "CLAIMED", claimToken } });
    if (!job) return;
    const cycle = await tx.deliveryCycle.findUnique({ where: { id: pointer.deliveryCycleId }, include: { pauseIntervals: { where: { endedAt: { not: null } }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] } } });
    if (!cycle || cycle.bookingId !== pointer.bookingId || !cycle.active || cycle.status !== "REVIEW_ACTIVE") {
      await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "CANCELLED", scheduledAt: null, claimToken: null, claimExpiresAt: null } });
      return;
    }
    const booking = await tx.booking.findUnique({ where: { id: pointer.bookingId }, select: { id: true, status: true, customerId: true, seller: { select: { userId: true } }, payment: { select: { status: true, payoutStatus: true } } } });
    if (!booking || booking.status !== "DELIVERED") {
      await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "CANCELLED", scheduledAt: null, claimToken: null, claimExpiresAt: null } });
      return;
    }
    const blockers = await getActiveCompletionBlockers(tx, booking.id);
    if (blockers.length) {
      await syncDeliveryCycleBlockers(tx, booking.id, evaluationAt);
      await tx.deliveryCycleJob.updateMany({ where: { id: jobId, status: "CLAIMED", claimToken }, data: { status: "CANCELLED", scheduledAt: null, claimToken: null, claimExpiresAt: null } });
      return;
    }
    if (job.generation !== cycle.version || !cycle.deadlineAt || cycle.deadlineAt > evaluationAt) {
      await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "PENDING", scheduledAt: cycle.deadlineAt, generation: cycle.version, claimToken: null, claimExpiresAt: null } });
      return;
    }
    const eligibility = await checkCompletionEligibility(tx, booking.id, "SCHEDULER", evaluationAt, job.generation);
    if (!eligibility.eligible) {
      await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "PENDING", scheduledAt: eligibility.reason === "NOT_DUE" ? cycle.deadlineAt : null, generation: cycle.version, claimToken: null, claimExpiresAt: null, lastError: eligibility.reason } });
      return;
    }
    const changed = await tx.booking.updateMany({ where: { id: booking.id, status: "DELIVERED" }, data: { status: "COMPLETED", completedAt: evaluationAt } });
    if (changed.count !== 1) {
      await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "CANCELLED", scheduledAt: null, claimToken: null, claimExpiresAt: null } });
      return;
    }
    if (booking.payment?.status === "PAID" && booking.payment.payoutStatus === "HELD") {
      await tx.payment.updateMany({ where: { bookingId: booking.id, status: "PAID", payoutStatus: "HELD" }, data: { payoutStatus: "ELIGIBLE" } });
    }
    const event = await tx.bookingStatusEvent.create({ data: { bookingId: booking.id, fromStatus: "DELIVERED", toStatus: "COMPLETED", actorUserId: null, source: "SYSTEM_AUTO_COMPLETE", occurredAt: evaluationAt } });
    await tx.deliveryCycleCompletionReceipt.create({ data: { deliveryCycleId: cycle.id, principalId: null, operation: "SCHEDULER_AUTO_COMPLETE", requestFingerprint: `cycle:${cycle.id}:generation:${cycle.version}`, transitionEventId: event.id } });
    await expireUnusedRevisionQuota(tx, booking.id, cycle.id, evaluationAt);
    await closeActiveDeliveryCycle(tx, booking.id, evaluationAt, "COMPLETED");
    await tx.deliveryCycleJob.update({ where: { id: jobId }, data: { status: "COMPLETED", scheduledAt: null, claimToken: null, claimExpiresAt: null, completedAt: evaluationAt, lastError: null } });
    await enqueueInAppNotices(tx, `delivery-cycle:${cycle.id}:completed:${event.id}`, "BOOKING_AUTO_COMPLETED", [
      { userId: booking.customerId, type: "BOOKING_UPDATE", title: "Pesanan selesai otomatis", body: "Masa konfirmasi telah berakhir tanpa proses yang menahan penyelesaian.", refId: booking.id },
      { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Pesanan selesai", body: "Pesanan selesai. Status ini tidak memindahkan dana.", refId: booking.id },
    ], cycle.id);
  });
}

export async function autoCompleteDeliveredBookings(requestedNow?: Date) {
  const claimTime = requestedNow ?? new Date();
  await processOverdueRevisionAssistance(claimTime).catch((error) => console.error("[REVISION_ASSISTANCE_SLA_ERROR]", error instanceof Error ? error.message : "Unknown error"));
  const claimed = await claimDueJobs(claimTime);
  let processed = 0;
  for (const id of claimed.ids) {
    const evaluationAt = requestedNow ?? new Date();
    try {
      await processClaim(id, claimed.claimToken, evaluationAt);
      processed++;
    } catch (error) {
      await prisma.deliveryCycleJob.updateMany({ where: { id, status: "CLAIMED", claimToken: claimed.claimToken }, data: {
        status: "PENDING", scheduledAt: new Date(evaluationAt.getTime() + 30_000), claimToken: null, claimExpiresAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown scheduler error",
      } }).catch(() => undefined);
      console.error("[BOOKING_SCHEDULER_JOB_ERROR]", error instanceof Error ? error.message : "Unknown error");
    }
  }
  await deliverPendingInAppNotices(claimTime).catch((error) => console.error("[BOOKING_OUTBOX_ERROR]", error instanceof Error ? error.message : "Unknown error"));
  return { claimed: claimed.ids.length, processed };
}

export function startBookingScheduler() {
  const run = () => void autoCompleteDeliveredBookings().catch((error) => {
    console.error("[BOOKING_SCHEDULER_ERROR]", error instanceof Error ? error.message : "Unknown error");
  });
  run();
  return setInterval(run, 60_000);
}
