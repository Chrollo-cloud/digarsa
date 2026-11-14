import type { Prisma } from "../../generated/prisma/client.js";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";

type Tx = Prisma.TransactionClient;
export type InAppNotice = { userId: string; type: "BOOKING_UPDATE" | "COMPLAINT"; title: string; body?: string | null; refId?: string | null; delivery_cycle_id?: string; revision_id?: string };

export async function enqueueInAppNotices(tx: Tx, eventKey: string, eventType: string, notices: InAppNotice[], deliveryCycleId?: string, revisionId?: string) {
  if (!notices.length) return;
  const payload = notices.map((notice) => ({
    ...notice,
    ...(deliveryCycleId ? { delivery_cycle_id: deliveryCycleId } : {}),
    ...(revisionId ? { revision_id: revisionId } : {}),
  }));
  await tx.notificationOutbox.create({ data: { eventKey, eventType, payload: payload as Prisma.InputJsonValue, ...(deliveryCycleId ? { deliveryCycleId } : {}) } });
}

const CLAIM_MS = 60_000;
const BATCH_SIZE = 50;

export async function deliverPendingInAppNotices(now = new Date()) {
  const claimToken = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "NotificationOutbox" SET "status" = 'PENDING', "claimToken" = NULL, "claimExpiresAt" = NULL WHERE "status" = 'CLAIMED' AND "claimExpiresAt" <= ${now}`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "NotificationOutbox"
      WHERE "status" = 'PENDING' AND "availableAt" <= ${now}
      ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT ${BATCH_SIZE}`;
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    await tx.notificationOutbox.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "CLAIMED", claimToken, claimExpiresAt: new Date(now.getTime() + CLAIM_MS), attempts: { increment: 1 } } });
    return ids;
  });

  let delivered = 0;
  for (const id of claimed) {
    try {
      await prisma.$transaction(async (tx) => {
        const event = await tx.notificationOutbox.findFirst({ where: { id, status: "CLAIMED", claimToken } });
        if (!event) return;
        if (!Array.isArray(event.payload)) throw new Error("Outbox payload must be a notification array");
        const notices = event.payload as unknown as InAppNotice[];
        for (const notice of notices) {
          await tx.notification.upsert({
            where: { sourceOutboxKey: `${event.eventKey}:${notice.userId}` },
            create: { userId: notice.userId, type: notice.type, title: notice.title, body: notice.body ?? null, refId: notice.refId ?? null, sourceOutboxKey: `${event.eventKey}:${notice.userId}` },
            update: {},
          });
        }
        await tx.notificationOutbox.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: now, claimToken: null, claimExpiresAt: null } });
      });
      delivered++;
    } catch (error) {
      const backoff = Math.min(15 * 60_000, 1_000 * 2 ** 5);
      await prisma.notificationOutbox.updateMany({ where: { id, status: "CLAIMED", claimToken }, data: { status: "PENDING", availableAt: new Date(now.getTime() + backoff), claimToken: null, claimExpiresAt: null, lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown outbox error" } });
    }
  }
  return { claimed: claimed.length, delivered };
}
