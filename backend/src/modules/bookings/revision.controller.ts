import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Prisma, RevisionStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { closeActiveDeliveryCycle, createDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { enqueueInAppNotices } from "./notification-outbox.js";
import { consumeRevisionUnit, readRevisionQuota, releaseRevisionUnit, reserveRevisionUnit, returnSystemErrorQuota } from "./revision-ledger.js";
import { reserveDisputeRevision } from "./dispute-revision-authorization.js";
import { revisionRequestCutoff } from "./revision-policy.js";
import { syncRevisionResponseClocks, isRevisionResponseClockPaused } from "./revision-response-clock.js";
import { z } from "zod";

const HOUR = 60 * 60 * 1000;
const requestSchema = z.object({ request_text: z.string().trim().min(5).max(1000) });
const responseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACCEPT"), estimate_hours: z.coerce.number().int().min(0).max(72) }),
  z.object({ action: z.literal("REJECT"), reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("REQUEST_CLARIFICATION"), clarification_text: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal("FAIL"), reason: z.string().trim().min(3).max(1000) }),
]);
const clarificationRequestSchema = z.object({ request_text: z.string().trim().min(5).max(1000) });
const clarificationResponseSchema = z.object({ response_text: z.string().trim().min(5).max(1000) });
const escalationSchema = z.object({
  trigger: z.enum(["SELLER_REJECTION", "SELLER_RESPONSE_OVERDUE", "CUSTOMER_CLARIFICATION_OVERDUE", "SELLER_ESTIMATE_OVERDUE"]),
  reason: z.string().trim().min(5).max(1000),
});
const systemErrorReturnSchema = z.object({ reason: z.string().trim().min(5).max(1000), evidence_reference: z.string().trim().min(6).max(255) });
const deliverySchema = z.object({
  delivery_note: z.string().trim().min(5).max(3000),
  evidence_urls: z.array(z.string().url().max(2048)).max(10).default([]),
}).superRefine((value, ctx) => value.evidence_urls.forEach((url, index) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) ctx.addIssue({ code: "custom", path: ["evidence_urls", index], message: "Evidence URL harus menggunakan HTTPS." });
  } catch {
    ctx.addIssue({ code: "custom", path: ["evidence_urls", index], message: "Evidence URL tidak valid." });
  }
}));

const revisionInclude = {
  clarifications: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  events: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
};

function actorId(res: Response) { return (res.locals.auth as { userId: string }).userId; }
function param(req: Request, name: string) { return typeof req.params[name] === "string" ? req.params[name] as string : ""; }
function parse<T>(schema: { safeParse(value: unknown): any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(422, "VALIDATION_FAILED", "Data revisi tidak valid.", result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  return result.data as T;
}
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function failQuota(error: unknown): never {
  const code = error instanceof Error ? error.message : "";
  if (code === "REVISION_QUOTA_EXHAUSTED") throw new HttpError(409, "REVISION_QUOTA_EXHAUSTED", "Kuota revisi gratis pada booking ini sudah habis.");
  if (code === "REVISION_POLICY_SNAPSHOT_MISSING") throw new HttpError(409, "REVISION_POLICY_SNAPSHOT_MISSING", "Booking ini tidak memiliki snapshot kebijakan revisi yang dapat diverifikasi.");
  if (code === "REVISION_RESERVATION_MISSING") throw new HttpError(409, "REVISION_RESERVATION_INVALID", "Reservasi kuota revisi tidak ditemukan atau tidak konsisten.");
  if (code === "REVISION_CONSUMED_QUOTA_MISSING") throw new HttpError(409, "REVISION_CONSUMED_QUOTA_MISSING", "Kuota konsumsi revisi yang dapat dikembalikan tidak ditemukan.");
  throw error;
}

async function lockPartyBooking(tx: Prisma.TransactionClient, bookingId: string, party: { customerId: string } | { sellerId: string }) {
  const initial = await tx.booking.findFirst({ where: { id: bookingId, ...party }, select: { id: true } });
  if (!initial) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  await lockBookingAndActiveCycle(tx, bookingId);
  const booking = await tx.booking.findFirst({ where: { id: bookingId, ...party }, select: {
    id: true, status: true, customerId: true, sellerId: true, deliveredAt: true,
    revisionPolicyHash: true, revisionPolicyVersion: true, revisionFreeCount: true,
    revisionRequestWindowDuration: true, revisionRequestWindowUnit: true, revisionRequestWindowAnchor: true,
    revisionTermsSnapshot: true, revisionPolicyAcknowledgedAt: true,
    seller: { select: { userId: true } },
  } });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  const activeDispute = await tx.dispute.findFirst({ where: { bookingId, status: { not: "DECIDED" } }, select: { id: true } });
  if (activeDispute) throw new HttpError(409, "ACTIVE_DISPUTE_BLOCKS_REVISION", "Tindakan revisi ditahan selama sengketa booking masih aktif.");
  return booking;
}

async function activeCycle(tx: Prisma.TransactionClient, bookingId: string) {
  const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true } });
  if (!cycle) throw new HttpError(409, "LEGACY_REVIEW_REQUIRED", "Pesanan ini tidak memiliki siklus pengiriman yang dapat diverifikasi.");
  return cycle;
}

async function lockRevision(tx: Prisma.TransactionClient, bookingId: string, revisionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${revisionId} AND "bookingId" = ${bookingId} FOR UPDATE`;
  const revision = await tx.revisionRequest.findFirst({ where: { id: revisionId, bookingId } });
  if (!revision) throw new HttpError(404, "REVISION_NOT_FOUND", "Permintaan revisi tidak ditemukan.");
  return revision;
}

async function assertCurrentCycle(tx: Prisma.TransactionClient, revision: { deliveryCycleId: string }, bookingId: string) {
  const cycle = await activeCycle(tx, bookingId);
  if (cycle.id !== revision.deliveryCycleId) throw new HttpError(409, "STALE_DELIVERY_CYCLE", "Permintaan revisi mengacu pada siklus pengiriman yang sudah tidak aktif.");
  return cycle;
}

async function revisionDto(tx: Prisma.TransactionClient, revisionId: string) {
  const revision = await tx.revisionRequest.findUnique({ where: { id: revisionId }, include: revisionInclude });
  if (!revision) throw new HttpError(404, "REVISION_NOT_FOUND", "Permintaan revisi tidak ditemukan.");
  const quota = await readRevisionQuota(tx, revision.bookingId);
  return {
    id: revision.id,
    booking_id: revision.bookingId,
    delivery_cycle_id: revision.deliveryCycleId,
    status: revision.status,
    request_text: revision.requestText,
    requested_at: revision.requestedAt.toISOString(),
    seller_response_deadline_at: revision.sellerResponseDeadlineAt.toISOString(),
    seller_response_clock: {
      paused_at: revision.sellerResponsePausedAt?.toISOString() ?? null,
      remaining_ms: revision.sellerResponseRemainingMs,
    },
    response_round: revision.responseRound,
    accepted_at: revision.acceptedAt?.toISOString() ?? null,
    estimated_completion_at: revision.estimatedCompletionAt?.toISOString() ?? null,
    rejected_at: revision.rejectedAt?.toISOString() ?? null,
    rejection_reason: revision.rejectionReason,
    withdrawn_at: revision.withdrawnAt?.toISOString() ?? null,
    rejection_accepted_at: revision.rejectionAcceptedAt?.toISOString() ?? null,
    delivered_at: revision.deliveredAt?.toISOString() ?? null,
    delivery_note: revision.deliveryNote,
    evidence_urls: Array.isArray(revision.deliveryEvidence) ? revision.deliveryEvidence : [],
    failed_at: revision.failedAt?.toISOString() ?? null,
    failure_reason: revision.failureReason,
    quota: quota ? { ...quota } : null,
    clarifications: revision.clarifications.map((item) => ({
      id: item.id, requester_role: item.requesterRole, requester_id: item.requesterId,
      request_text: item.requestText, status: item.status,
      response_due_at: item.responseDueAt.toISOString(), response_text: item.responseText,
      response_clock: { paused_at: item.responsePausedAt?.toISOString() ?? null, remaining_ms: item.responseRemainingMs },
      responded_by_id: item.respondedById, responded_at: item.respondedAt?.toISOString() ?? null,
      closed_at: item.closedAt?.toISOString() ?? null, created_at: item.createdAt.toISOString(),
    })),
    history: revision.events.map((event) => ({
      id: event.id, actor_user_id: event.actorUserId, event_type: event.eventType,
      from_status: event.fromStatus, to_status: event.toStatus,
      payload: event.payload, occurred_at: event.occurredAt.toISOString(),
    })),
    created_at: revision.createdAt.toISOString(),
    updated_at: revision.updatedAt.toISOString(),
  };
}

async function addRevisionEvent(tx: Prisma.TransactionClient, input: { revisionId: string; actorId: string | null; type: string; from: RevisionStatus | null; to: RevisionStatus; payload: Record<string, unknown>; at: Date }) {
  return tx.revisionEvent.create({ data: { revisionId: input.revisionId, actorUserId: input.actorId, eventType: input.type, fromStatus: input.from, toStatus: input.to, payload: input.payload as Prisma.InputJsonValue, occurredAt: input.at } });
}

async function getReceipt(tx: Prisma.TransactionClient, revisionId: string, principalId: string, operation: string, requestFingerprint: string) {
  const receipt = await tx.revisionOperationReceipt.findUnique({ where: { revisionId_principalId_operation: { revisionId, principalId, operation } } });
  if (!receipt) return false;
  if (receipt.requestFingerprint !== requestFingerprint) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Tindakan revisi yang sama dikirim dengan isi berbeda.");
  return true;
}

async function saveReceipt(tx: Prisma.TransactionClient, revisionId: string, principalId: string, operation: string, requestFingerprint: string, status: RevisionStatus) {
  await tx.revisionOperationReceipt.create({ data: { revisionId, principalId, operation, requestFingerprint, result: { revision_id: revisionId, status } as Prisma.InputJsonValue } });
}

async function enqueueRevisionNotice(tx: Prisma.TransactionClient, cycleId: string, revisionId: string, eventId: string, eventType: string, notice: { userId: string; type: "BOOKING_UPDATE" | "COMPLAINT"; title: string; body?: string | null; refId?: string | null }) {
  await enqueueInAppNotices(tx, `delivery-cycle:${cycleId}:revision:${revisionId}:${eventId}`, eventType, [{ ...notice, revision_id: revisionId }], cycleId, revisionId);
}

export async function createRevisionRequest(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const customerId = actorId(res);
  const input = parse<ReturnType<typeof requestSchema.parse>>(requestSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { customerId });
    if (booking.status !== "DELIVERED") throw new HttpError(409, "REVISION_NOT_AVAILABLE", "Revisi hanya dapat diminta selama hasil pengiriman sedang ditinjau.");
    if (!booking.revisionPolicyHash || booking.revisionFreeCount === null || !booking.revisionRequestWindowDuration) throw new HttpError(409, "REVISION_POLICY_SNAPSHOT_MISSING", "Booking ini tidak memiliki kebijakan revisi yang dapat diverifikasi.");
    const cycle = await activeCycle(tx, bookingId);
    if (cycle.status !== "REVIEW_ACTIVE" && cycle.status !== "REVIEW_PAUSED") throw new HttpError(409, "REVISION_NOT_AVAILABLE", "Siklus pengiriman ini tidak menerima permintaan revisi.");
    const current = await tx.revisionRequest.findFirst({ where: { bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (current) {
      if (current.deliveryCycleId === cycle.id && current.requestText === input.request_text) return { revision: await revisionDto(tx, current.id), created: false };
      throw new HttpError(409, "REVISION_ALREADY_ACTIVE", "Masih ada permintaan revisi aktif untuk booking ini.");
    }
    const openEscalation = await tx.revisionEscalationRequest.findFirst({ where: { bookingId, status: { in: ["OPEN", "IN_REVIEW"] } }, select: { id: true } });
    if (openEscalation) throw new HttpError(409, "REVISION_ESCALATION_OPEN", "Permintaan bantuan admin untuk booking ini masih terbuka.");
    const now = new Date();
    const disputeBlock = await tx.dispute.findFirst({ where: { bookingId, status: { not: "DECIDED" } }, select: { id: true } });
    if (disputeBlock) throw new HttpError(409, "ACTIVE_DISPUTE_BLOCKS_REVISION", "Tindakan revisi ditahan selama sengketa booking masih aktif.");
    const pendingCancellation = await tx.cancellationRequest.findFirst({ where: { bookingId, status: "PENDING" }, select: { id: true } });
    if (pendingCancellation) throw new HttpError(409, "REVISION_BLOCKED", "Permintaan revisi tidak dapat dibuat selama cancellation masih menunggu keputusan.");
    const cutoff = revisionRequestCutoff({
      deliveryAt: cycle.deliveryAt,
      policyWindowHours: booking.revisionRequestWindowDuration,
      deadlineAt: cycle.deadlineAt,
      remainingMs: cycle.status === "REVIEW_PAUSED" ? cycle.remainingMs : null,
      now,
    });
    if (cutoff === null || now.getTime() >= cutoff) throw new HttpError(409, "REVISION_WINDOW_CLOSED", "Batas pengajuan revisi pada kebijakan booking sudah berakhir.");
    const created = await tx.revisionRequest.create({ data: {
      bookingId, deliveryCycleId: cycle.id, requestText: input.request_text, status: "REQUESTED",
      requestedAt: now, sellerResponseDeadlineAt: new Date(now.getTime() + 48 * HOUR),
    } });
    let disputeAuthorizationId: string | null;
    try {
      disputeAuthorizationId = await reserveDisputeRevision(tx, { bookingId, revisionId: created.id, cycleId: cycle.id, generation: created.reservationGeneration, actorUserId: customerId, now });
    } catch (error) { failQuota(error); }
    const event = await addRevisionEvent(tx, { revisionId: created.id, actorId: customerId, type: "REQUESTED", from: null, to: "REQUESTED", payload: { text: input.request_text, policy_hash: booking.revisionPolicyHash, dispute_authorization_id: disputeAuthorizationId, customer_consent_at: disputeAuthorizationId ? now.toISOString() : null }, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, customerId);
    await enqueueRevisionNotice(tx, cycle.id, created.id, event.id, "REVISION_REQUESTED", {
      userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Permintaan revisi baru",
      body: "Buyer mengirim permintaan revisi. Kuota telah dicadangkan dan masa peninjauan pesanan dijeda.", refId: bookingId,
    });
    return { revision: await revisionDto(tx, created.id), created: true };
  });
  res.status(result.created ? 201 : 200).json({ data: result.revision });
}

export async function listCustomerRevisions(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const customerId = actorId(res);
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, customerId }, select: { id: true } });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  const rows = await prisma.revisionRequest.findMany({ where: { bookingId }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }], select: { id: true } });
  const data = await Promise.all(rows.map((row) => revisionDto(prisma as never, row.id)));
  res.status(200).json({ data });
}

export async function listSellerRevisions(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const sellerId = res.locals.sellerProfileId as string;
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, sellerId }, select: { id: true } });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  const rows = await prisma.revisionRequest.findMany({ where: { bookingId }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }], select: { id: true } });
  const data = await Promise.all(rows.map((row) => revisionDto(prisma as never, row.id)));
  res.status(200).json({ data });
}

export async function respondToRevision(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const sellerId = res.locals.sellerProfileId as string;
  const userId = actorId(res);
  const input = parse<ReturnType<typeof responseSchema.parse>>(responseSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { sellerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    const operation = input.action === "FAIL" ? "SELLER_FAIL" : `SELLER_RESPONSE_${revision.responseRound}`;
    const requestFingerprint = fingerprint(input);
    if (await getReceipt(tx, revision.id, userId, operation, requestFingerprint)) return revisionDto(tx, revision.id);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    const now = new Date();
    if (input.action === "FAIL") {
      if (revision.status !== "IN_PROGRESS") throw new HttpError(409, "REVISION_STATE_CONFLICT", "Hanya revisi yang sedang dikerjakan yang dapat dinyatakan gagal.");
      const updated = await tx.revisionRequest.update({ where: { id: revision.id }, data: { status: "FAILED", failedAt: now, failureReason: input.reason } });
      const event = await addRevisionEvent(tx, { revisionId: revision.id, actorId: userId, type: "FAILED", from: revision.status, to: updated.status, payload: { reason: input.reason, quota_remains_consumed: true }, at: now });
      await syncDeliveryCycleBlockers(tx, bookingId, now, userId);
      await saveReceipt(tx, revision.id, userId, operation, requestFingerprint, updated.status);
      await enqueueRevisionNotice(tx, cycle.id, revision.id, event.id, "REVISION_FAILED", { userId: booking.customerId, type: "BOOKING_UPDATE", title: "Seller melaporkan revisi tidak dapat diselesaikan", body: input.reason, refId: bookingId });
      return revisionDto(tx, revision.id);
    }
    if (revision.status !== "REQUESTED") throw new HttpError(409, "REVISION_STATE_CONFLICT", "Permintaan revisi ini tidak sedang menunggu jawaban seller.");
    if (await isRevisionResponseClockPaused(tx, { revisionId, clockType: "SELLER_RESPONSE" })) throw new HttpError(409, "REVISION_RESPONSE_CLOCK_PAUSED", "Jawaban seller menunggu penyelesaian bantuan admin untuk revisi ini.");
    if (now >= revision.sellerResponseDeadlineAt) throw new HttpError(409, "SELLER_RESPONSE_WINDOW_CLOSED", "Batas jawaban seller berakhir. Customer dapat meminta bantuan admin.");
    const pendingClarification = await tx.revisionClarification.findFirst({ where: { revisionId, status: "WAITING_SELLER" }, orderBy: { createdAt: "desc" } });
    if (pendingClarification) {
      const responseText = input.action === "REJECT" ? input.reason : input.action === "REQUEST_CLARIFICATION" ? input.clarification_text : "Seller accepted the revision request.";
      await tx.revisionClarification.update({ where: { id: pendingClarification.id }, data: { status: "RESPONDED", responseText, respondedById: userId, respondedAt: now } });
    }
    let nextStatus: RevisionStatus;
    let eventType: string;
    if (input.action === "ACCEPT") {
      try { await consumeRevisionUnit(tx, { bookingId, revisionId, cycleId: cycle.id, generation: revision.reservationGeneration, actorUserId: userId }); }
      catch (error) { failQuota(error); }
      nextStatus = "IN_PROGRESS";
      eventType = "ACCEPTED";
      await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: nextStatus, acceptedAt: now, estimatedCompletionAt: new Date(now.getTime() + input.estimate_hours * HOUR) } });
    } else if (input.action === "REJECT") {
      try { await releaseRevisionUnit(tx, { bookingId, revisionId, cycleId: cycle.id, generation: revision.reservationGeneration, actorUserId: userId, reason: `SELLER_REJECTION:${input.reason}` }); }
      catch (error) { failQuota(error); }
      nextStatus = "REJECTED";
      eventType = "REJECTED";
      await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: nextStatus, rejectedAt: now, rejectionReason: input.reason } });
    } else {
      nextStatus = "WAITING_CUSTOMER";
      eventType = "CLARIFICATION_REQUESTED";
      await tx.revisionClarification.create({ data: { revisionId, requesterRole: "SELLER", requesterId: userId, requestText: input.clarification_text, status: "WAITING_CUSTOMER", responseDueAt: new Date(now.getTime() + 48 * HOUR) } });
      await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: nextStatus } });
    }
    const event = await addRevisionEvent(tx, { revisionId, actorId: userId, type: eventType, from: revision.status, to: nextStatus, payload: input, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, userId);
    await saveReceipt(tx, revisionId, userId, operation, requestFingerprint, nextStatus);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, `REVISION_${eventType}`, { userId: booking.customerId, type: "BOOKING_UPDATE", title: eventType === "ACCEPTED" ? "Seller menerima revisi" : eventType === "REJECTED" ? "Seller menolak revisi" : "Seller meminta klarifikasi", body: input.action === "REJECT" ? input.reason : input.action === "REQUEST_CLARIFICATION" ? input.clarification_text : null, refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function respondToRevisionClarification(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const clarificationId = param(req, "clarification_id");
  const customerId = actorId(res);
  const input = parse<ReturnType<typeof clarificationResponseSchema.parse>>(clarificationResponseSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { customerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    await tx.$queryRaw`SELECT "id" FROM "RevisionClarification" WHERE "id" = ${clarificationId} AND "revisionId" = ${revisionId} FOR UPDATE`;
    const clarification = await tx.revisionClarification.findFirst({ where: { id: clarificationId, revisionId } });
    const operation = `CUSTOMER_CLARIFICATION_RESPONSE:${clarificationId}`;
    const requestFingerprint = fingerprint(input);
    if (await getReceipt(tx, revisionId, customerId, operation, requestFingerprint)) return revisionDto(tx, revisionId);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    if (!clarification || clarification.status !== "WAITING_CUSTOMER" || clarification.requesterRole !== "SELLER" || revision.status !== "WAITING_CUSTOMER") throw new HttpError(409, "CLARIFICATION_STATE_CONFLICT", "Klarifikasi ini tidak menunggu jawaban customer.");
    if (await isRevisionResponseClockPaused(tx, { revisionId, clockType: "CUSTOMER_CLARIFICATION", clarificationId })) throw new HttpError(409, "REVISION_RESPONSE_CLOCK_PAUSED", "Jawaban customer menunggu penyelesaian bantuan admin untuk revisi ini.");
    const now = new Date();
    if (now >= clarification.responseDueAt) throw new HttpError(409, "CLARIFICATION_WINDOW_CLOSED", "Batas jawaban klarifikasi customer berakhir. Seller dapat meminta bantuan admin.");
    await tx.revisionClarification.update({ where: { id: clarificationId }, data: { status: "RESPONDED", responseText: input.response_text, respondedById: customerId, respondedAt: now } });
    const updated = await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: "REQUESTED", responseRound: { increment: 1 }, sellerResponseDeadlineAt: new Date(now.getTime() + 48 * HOUR) } });
    const event = await addRevisionEvent(tx, { revisionId, actorId: customerId, type: "CUSTOMER_CLARIFICATION_RESPONDED", from: revision.status, to: updated.status, payload: { clarification_id: clarificationId, response_text: input.response_text }, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, customerId);
    await saveReceipt(tx, revisionId, customerId, operation, requestFingerprint, updated.status);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, "REVISION_CLARIFICATION_RESPONDED", { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Customer menjawab klarifikasi", body: "Batas jawaban seller berikutnya dimulai dari waktu respons ini.", refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function requestClarificationAfterRejection(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const customerId = actorId(res);
  const input = parse<ReturnType<typeof clarificationRequestSchema.parse>>(clarificationRequestSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { customerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    const operationRound = revision.status === "REJECTED" ? revision.responseRound : revision.responseRound - 1;
    const operation = `CUSTOMER_CLARIFY_REJECTION:${operationRound}`;
    const requestFingerprint = fingerprint(input);
    if (await getReceipt(tx, revisionId, customerId, operation, requestFingerprint)) return revisionDto(tx, revisionId);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    if (revision.status !== "REJECTED") throw new HttpError(409, "REVISION_STATE_CONFLICT", "Klarifikasi setelah penolakan hanya tersedia pada permintaan yang ditolak seller.");
    const otherActive = await tx.revisionRequest.findFirst({ where: { bookingId, id: { not: revisionId }, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, select: { id: true } });
    if (otherActive) throw new HttpError(409, "REVISION_ALREADY_ACTIVE", "Booking ini sudah memiliki permintaan revisi aktif lainnya.");
    const now = new Date();
    const generation = revision.reservationGeneration + 1;
    try { await reserveRevisionUnit(tx, { bookingId, revisionId, cycleId: cycle.id, generation, actorUserId: customerId, now }); }
    catch (error) { failQuota(error); }
    const deadline = new Date(now.getTime() + 48 * HOUR);
    await tx.revisionClarification.create({ data: { revisionId, requesterRole: "CUSTOMER", requesterId: customerId, requestText: input.request_text, status: "WAITING_SELLER", responseDueAt: deadline } });
    const updated = await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: "REQUESTED", reservationGeneration: generation, responseRound: { increment: 1 }, sellerResponseDeadlineAt: deadline } });
    const event = await addRevisionEvent(tx, { revisionId, actorId: customerId, type: "CUSTOMER_CLARIFICATION_AFTER_REJECTION", from: revision.status, to: updated.status, payload: { request_text: input.request_text, quota_reserved_again: true }, at: now });
    await syncRevisionResponseClocks(tx, revisionId, now, customerId);
    await syncDeliveryCycleBlockers(tx, bookingId, now, customerId);
    await saveReceipt(tx, revisionId, customerId, operation, requestFingerprint, updated.status);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, "REVISION_CLARIFICATION_REQUESTED", { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Customer meminta klarifikasi atas penolakan", body: "Kuota dicadangkan kembali dan seller memiliki 48 jam untuk menjawab.", refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function withdrawRevision(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const customerId = actorId(res);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { customerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    const operation = "CUSTOMER_WITHDRAW";
    const requestFingerprint = fingerprint({ action: operation });
    if (await getReceipt(tx, revisionId, customerId, operation, requestFingerprint)) return revisionDto(tx, revisionId);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    if (!["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"].includes(revision.status)) throw new HttpError(409, "REVISION_STATE_CONFLICT", "Permintaan revisi ini tidak dapat ditarik pada status saat ini.");
    const now = new Date();
    if (revision.status === "REQUESTED" || revision.status === "WAITING_CUSTOMER") {
      try { await releaseRevisionUnit(tx, { bookingId, revisionId, cycleId: cycle.id, generation: revision.reservationGeneration, actorUserId: customerId, reason: "CUSTOMER_WITHDRAWAL_BEFORE_ACCEPTANCE" }); }
      catch (error) { failQuota(error); }
    }
    await tx.revisionClarification.updateMany({ where: { revisionId, status: { in: ["WAITING_CUSTOMER", "WAITING_SELLER"] } }, data: { status: "CANCELLED", closedAt: now } });
    const updated = await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: "WITHDRAWN", withdrawnAt: now } });
    const event = await addRevisionEvent(tx, { revisionId, actorId: customerId, type: "CUSTOMER_WITHDREW", from: revision.status, to: updated.status, payload: { quota_released: revision.status !== "IN_PROGRESS", consumed_quota_restored: false }, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, customerId);
    await saveReceipt(tx, revisionId, customerId, operation, requestFingerprint, updated.status);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, "REVISION_WITHDRAWN", { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Customer menarik permintaan revisi", body: "Riwayat konsumsi kuota tetap tersimpan.", refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function acceptRevisionRejection(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const customerId = actorId(res);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { customerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    const operation = "CUSTOMER_ACCEPT_REJECTION";
    const requestFingerprint = fingerprint({ action: operation });
    if (await getReceipt(tx, revisionId, customerId, operation, requestFingerprint)) return revisionDto(tx, revisionId);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    if (revision.status !== "REJECTED") throw new HttpError(409, "REVISION_STATE_CONFLICT", "Tidak ada penolakan revisi yang menunggu keputusan customer.");
    const now = new Date();
    const updated = await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: "REJECTION_ACCEPTED", rejectionAcceptedAt: now } });
    const event = await addRevisionEvent(tx, { revisionId, actorId: customerId, type: "CUSTOMER_ACCEPTED_REJECTION", from: revision.status, to: updated.status, payload: {}, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, customerId);
    await saveReceipt(tx, revisionId, customerId, operation, requestFingerprint, updated.status);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, "REVISION_REJECTION_ACCEPTED", { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Customer menerima penolakan revisi", refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function requestRevisionAssistance(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const customerId = actorId(res);
  const sellerId = res.locals.sellerProfileId as string | undefined;
  const input = parse<ReturnType<typeof escalationSchema.parse>>(escalationSchema, req.body);
  const sellerIsRequester = input.trigger === "CUSTOMER_CLARIFICATION_OVERDUE";
  if (sellerIsRequester && !sellerId) throw new HttpError(403, "FORBIDDEN", "Hanya seller booking yang dapat meminta bantuan untuk klarifikasi customer.");
  const party = sellerIsRequester ? { sellerId: sellerId! } : { customerId };
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, party);
    const revision = await lockRevision(tx, bookingId, revisionId);
    const cycle = await assertCurrentCycle(tx, revision, bookingId);
    const now = new Date();
    if (input.trigger === "SELLER_REJECTION" && (sellerIsRequester || revision.status !== "REJECTED")) throw new HttpError(409, "ESCALATION_NOT_AVAILABLE", "Bantuan admin dapat diminta setelah seller menolak revisi.");
    if (input.trigger === "SELLER_RESPONSE_OVERDUE" && (sellerIsRequester || revision.status !== "REQUESTED" || now < revision.sellerResponseDeadlineAt)) throw new HttpError(409, "ESCALATION_NOT_AVAILABLE", "Batas jawaban seller belum berakhir atau revisi tidak menunggu jawaban.");
    if (input.trigger === "SELLER_ESTIMATE_OVERDUE" && (sellerIsRequester || revision.status !== "IN_PROGRESS" || !revision.estimatedCompletionAt || now < revision.estimatedCompletionAt)) throw new HttpError(409, "ESCALATION_NOT_AVAILABLE", "Estimasi seller belum terlambat atau revisi tidak sedang dikerjakan.");
    let pendingClarification = null;
    if (input.trigger === "CUSTOMER_CLARIFICATION_OVERDUE") {
      if (!sellerIsRequester || revision.status !== "WAITING_CUSTOMER") throw new HttpError(409, "ESCALATION_NOT_AVAILABLE", "Tidak ada klarifikasi customer yang menunggu jawaban.");
      pendingClarification = await tx.revisionClarification.findFirst({ where: { revisionId, status: "WAITING_CUSTOMER", responseDueAt: { lte: now } }, orderBy: { createdAt: "desc" } });
      if (!pendingClarification) throw new HttpError(409, "ESCALATION_NOT_AVAILABLE", "Batas jawaban klarifikasi customer belum berakhir.");
    }
    const existing = await tx.revisionEscalationRequest.findFirst({ where: { revisionId, trigger: input.trigger, status: { not: "CLOSED" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (existing) {
      if (existing.reason !== input.reason) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Permintaan bantuan admin untuk pemicu ini sudah dibuat dengan alasan berbeda.");
      return { revision: await revisionDto(tx, revisionId), created: false };
    }
    const requesterId = sellerIsRequester ? actorId(res) : customerId;
    const latestClosed = await tx.revisionEscalationRequest.findFirst({ where: { revisionId, trigger: input.trigger, status: "CLOSED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    const responseClockType = input.trigger === "SELLER_RESPONSE_OVERDUE" ? "SELLER_RESPONSE"
      : input.trigger === "CUSTOMER_CLARIFICATION_OVERDUE" ? "CUSTOMER_CLARIFICATION" : null;
    const escalation = await tx.revisionEscalationRequest.create({ data: {
      revisionId, bookingId, trigger: input.trigger, requesterId, reason: input.reason,
      createdAt: now, slaDueAt: new Date(now.getTime() + 48 * HOUR),
      responseClockType, responseClarificationId: responseClockType === "CUSTOMER_CLARIFICATION" ? pendingClarification?.id ?? null : null,
      parentAssistanceId: latestClosed?.id ?? null,
    } });
    const event = await tx.revisionEscalationEvent.create({ data: {
      assistanceId: escalation.id, actorUserId: requesterId, actorType: "USER", eventType: "CREATED",
      fromStatus: null, toStatus: "OPEN", reason: input.reason, occurredAt: now,
    } });
    await syncRevisionResponseClocks(tx, revisionId, now, requesterId);
    await addRevisionEvent(tx, { revisionId, actorId: requesterId, type: "ADMIN_ASSISTANCE_REQUESTED", from: revision.status, to: revision.status, payload: { escalation_id: escalation.id, trigger: input.trigger, reason: input.reason, clarification_id: pendingClarification?.id ?? null }, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, requesterId);
    const admins = await tx.user.findMany({ where: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { id: true } });
    const notices = admins.map((admin) => ({ userId: admin.id, type: "COMPLAINT" as const, title: "Permintaan bantuan revisi", body: input.reason, refId: escalation.id }));
    await enqueueInAppNotices(tx, `delivery-cycle:${cycle.id}:revision:${revisionId}:assistance:${event.id}`, "REVISION_ADMIN_ASSISTANCE_REQUESTED", notices.map((notice) => ({ ...notice, revision_id: revisionId })), cycle.id, revisionId);
    return { revision: await revisionDto(tx, revisionId), created: true };
  });
  res.status(result.created ? 201 : 200).json({ data: result.revision });
}

export async function deliverRevisedWork(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const revisionId = param(req, "revision_id");
  const sellerId = res.locals.sellerProfileId as string;
  const userId = actorId(res);
  const input = parse<ReturnType<typeof deliverySchema.parse>>(deliverySchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockPartyBooking(tx, bookingId, { sellerId });
    const revision = await lockRevision(tx, bookingId, revisionId);
    const operation = `SELLER_DELIVERY:${revision.reservationGeneration}`;
    const requestFingerprint = fingerprint(input);
    if (await getReceipt(tx, revision.id, userId, operation, requestFingerprint)) return revisionDto(tx, revision.id);
    const oldCycle = await assertCurrentCycle(tx, revision, bookingId);
    if (booking.status !== "DELIVERED" || revision.status !== "IN_PROGRESS") throw new HttpError(409, "REVISION_STATE_CONFLICT", "Hanya revisi yang diterima dan sedang dikerjakan yang dapat dikirim.");
    const blockers = await tx.cancellationRequest.findFirst({ where: { bookingId, status: "PENDING" }, select: { id: true } });
    const escalation = await tx.revisionEscalationRequest.findFirst({ where: { bookingId, status: { in: ["OPEN", "IN_REVIEW"] } }, select: { id: true } });
    if (blockers || escalation) throw new HttpError(409, "REVISION_BLOCKED", "Kirim revisi tidak dapat diproses selama cancellation atau bantuan admin masih aktif.");
    const now = new Date();
    const prior = await closeActiveDeliveryCycle(tx, bookingId, now, "SUPERSEDED", userId);
    if (!prior || prior.id !== oldCycle.id) throw new HttpError(409, "STALE_DELIVERY_CYCLE", "Siklus pengiriman berubah. Muat ulang pesanan.");
    await tx.booking.update({ where: { id: bookingId }, data: { deliveredAt: now } });
    const updated = await tx.revisionRequest.update({ where: { id: revisionId }, data: { status: "DELIVERED", deliveredAt: now, deliveryNote: input.delivery_note, deliveryEvidence: input.evidence_urls as Prisma.InputJsonValue } });
    const newCycle = await createDeliveryCycle(tx, bookingId, now, revisionId);
    const bookingEvent = await tx.bookingStatusEvent.create({ data: { bookingId, fromStatus: "DELIVERED", toStatus: "DELIVERED", actorUserId: userId, source: "REVISION_DELIVERY", occurredAt: now } });
    const event = await addRevisionEvent(tx, { revisionId, actorId: userId, type: "REVISED_WORK_DELIVERED", from: revision.status, to: updated.status, payload: { cycle_id: newCycle.id, note: input.delivery_note, evidence_urls: input.evidence_urls, booking_event_id: bookingEvent.id }, at: now });
    await saveReceipt(tx, revisionId, userId, operation, requestFingerprint, updated.status);
    await enqueueRevisionNotice(tx, newCycle.id, revisionId, event.id, "REVISION_DELIVERED", { userId: booking.customerId, type: "BOOKING_UPDATE", title: "Hasil revisi dikirim", body: input.delivery_note, refId: bookingId });
    return revisionDto(tx, revisionId);
  });
  res.status(200).json({ data: result });
}

export async function returnRevisionQuotaForSystemError(req: Request, res: Response) {
  const revisionId = param(req, "revision_id");
  const adminId = actorId(res);
  const input = parse<ReturnType<typeof systemErrorReturnSchema.parse>>(systemErrorReturnSchema, req.body);
  const pointer = await prisma.revisionRequest.findUnique({ where: { id: revisionId }, select: { bookingId: true } });
  if (!pointer) throw new HttpError(404, "REVISION_NOT_FOUND", "Permintaan revisi tidak ditemukan.");
  const result = await prisma.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, pointer.bookingId);
    const revision = await lockRevision(tx, pointer.bookingId, revisionId);
    const operation = `ADMIN_SYSTEM_ERROR_RETURN:${revision.reservationGeneration}`;
    const requestFingerprint = fingerprint(input);
    if (await getReceipt(tx, revisionId, adminId, operation, requestFingerprint)) return { revision: await revisionDto(tx, revisionId), replay: true };
    const returnReference = `revision:${revisionId}:reservation:${revision.reservationGeneration}:system-error-return`;
    const priorReturn = await tx.revisionQuotaLedger.findUnique({ where: { operationReference: returnReference } });
    if (priorReturn) {
      if (priorReturn.reason !== input.reason || priorReturn.evidenceReference !== input.evidence_reference) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Pengembalian kuota untuk kesalahan sistem ini sudah dicatat dengan bukti berbeda.");
      await saveReceipt(tx, revisionId, adminId, operation, requestFingerprint, revision.status);
      return { revision: await revisionDto(tx, revisionId), replay: true };
    }
    const cycle = await activeCycle(tx, pointer.bookingId);
    if (revision.deliveryCycleId !== cycle.id || !["FAILED", "WITHDRAWN"].includes(revision.status)) throw new HttpError(409, "SYSTEM_ERROR_RETURN_NOT_AVAILABLE", "Kuota hanya dapat dikembalikan pada revisi gagal atau ditarik setelah konsumsi dan masih terkait siklus saat ini.");
    try {
      await returnSystemErrorQuota(tx, { bookingId: pointer.bookingId, revisionId, cycleId: cycle.id, generation: revision.reservationGeneration, actorUserId: adminId, reason: input.reason, evidenceReference: input.evidence_reference });
    } catch (error) { failQuota(error); }
    const event = await addRevisionEvent(tx, { revisionId, actorId: adminId, type: "SYSTEM_ERROR_QUOTA_RETURNED", from: revision.status, to: revision.status, payload: { reason: input.reason, evidence_reference: input.evidence_reference }, at: new Date() });
    await saveReceipt(tx, revisionId, adminId, operation, requestFingerprint, revision.status);
    await enqueueRevisionNotice(tx, cycle.id, revisionId, event.id, "REVISION_QUOTA_RETURNED", { userId: revision.bookingId ? (await tx.booking.findUniqueOrThrow({ where: { id: pointer.bookingId }, select: { customerId: true } })).customerId : adminId, type: "BOOKING_UPDATE", title: "Kuota revisi dikembalikan setelah verifikasi kesalahan sistem", body: input.reason, refId: pointer.bookingId });
    return { revision: await revisionDto(tx, revisionId), replay: false };
  });
  res.status(result.replay ? 200 : 201).json({ data: result.revision });
}
