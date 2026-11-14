import type { Prisma } from "../../generated/prisma/client.js";
import { reserveRevisionUnit } from "./revision-ledger.js";

type Tx = Prisma.TransactionClient;

/** Caller owns the Booking row lock and has created the new revision row. */
export async function reserveDisputeRevision(tx: Tx, input: {
  bookingId: string;
  cycleId: string;
  revisionId: string;
  generation: number;
  actorUserId: string;
  now: Date;
}) {
  const authorization = await tx.disputeRevisionAuthorization.findFirst({
    where: {
      bookingId: input.bookingId,
      deliveryCycleId: input.cycleId,
      status: "AVAILABLE",
      dispute: { status: "DECIDED", decisionOutcome: "RETURN_TO_REVISION" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  await reserveRevisionUnit(tx, {
    bookingId: input.bookingId,
    revisionId: input.revisionId,
    cycleId: input.cycleId,
    generation: input.generation,
    actorUserId: input.actorUserId,
    now: input.now,
  });

  if (authorization) {
    await tx.disputeRevisionAuthorization.update({
      where: { id: authorization.id, status: "AVAILABLE" },
      data: { status: "USED", consumedRevisionId: input.revisionId, usedAt: input.now },
    });
  }
  return authorization?.id ?? null;
}
