import type { Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { closeActiveDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { closeReviewTimer } from "./booking-timer.js";
import { cancelBookingFromDispute } from "./dispute-actions.js";
import { enqueueInAppNotices } from "./notification-outbox.js";
import { appealDeadline, canReviewAppeal, clarificationDeadline, disputeActionCompatibility, disputeCategoryCompatibility, isAppealWindowOpen, isClarificationResponseOpen, nextAppealStatus, nextDisputeStatus, type DisputeCategory } from "./dispute-policy.js";
import { z } from "zod";

const disputeSchema = z.object({
  category: z.enum(["SERVICE_NOT_AS_DESCRIBED", "DELIVERY_ISSUE", "REVISION_ISSUE", "CANCELLATION_ISSUE", "OTHER"]),
  description: z.string().trim().min(20).max(5000),
  related_revision_id: z.string().min(1).max(128).optional(),
  related_cancellation_id: z.string().min(1).max(128).optional(),
});
const reviewSchema = z.object({ expected_version: z.coerce.number().int().positive(), reason: z.string().trim().min(5).max(1000) });
const clarificationSchema = z.object({ expected_version: z.coerce.number().int().positive(), recipient: z.enum(["CUSTOMER", "SELLER"]), question: z.string().trim().min(5).max(2000) });
const clarificationResponseSchema = z.object({ expected_version: z.coerce.number().int().positive(), response_text: z.string().trim().min(5).max(3000) });
const decisionSchema = z.object({
  expected_version: z.coerce.number().int().positive(),
  outcome: z.enum(["CONTINUE_BOOKING", "RETURN_TO_REVISION", "CANCEL_BOOKING"]),
  reason: z.string().trim().min(5).max(2000),
  permitted_next_action: z.string().trim().min(3).max(500),
});
const appealSchema = z.object({ reason: z.string().trim().min(5).max(3000) });
const assignmentSchema = z.object({ expected_version: z.coerce.number().int().positive(), reviewer_user_id: z.string().min(1).max(128), reason: z.string().trim().min(5).max(1000) });
const appealDecisionSchema = z.object({
  expected_version: z.coerce.number().int().positive(),
  outcome: z.enum(["UPHELD", "MODIFIED"]),
  permitted_next_action: z.enum(["CONTINUE_BOOKING", "RETURN_TO_REVISION", "CANCEL_BOOKING"]),
  reason: z.string().trim().min(5).max(2000),
});
const linkMessageSchema = z.object({ message_id: z.string().min(1).max(128) });
const linkReportSchema = z.object({ report_id: z.string().min(1).max(128) });

const disputeInclude = {
  booking: { select: { id: true, status: true, customerId: true, sellerId: true, seller: { select: { userId: true } } } },
  relatedRevision: { select: { id: true, status: true, deliveryCycleId: true } },
  relatedCancellation: { select: { id: true, status: true } },
  events: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
  clarifications: { orderBy: [{ requestedAt: "asc" as const }, { id: "asc" as const }] },
  reportEvidence: { select: { reportId: true, createdAt: true } },
  messageEvidence: { include: { message: { select: { id: true, senderId: true, body: true, createdAt: true } } }, orderBy: [{ createdAt: "asc" as const }] },
  appeals: { orderBy: [{ submittedAt: "asc" as const }, { id: "asc" as const }], select: { id: true, appellantId: true, reason: true, submittedAt: true, submissionDeadlineAt: true, status: true, version: true, assignedReviewerId: true, outcome: true, permittedNextAction: true, resolutionReason: true, decidedAt: true } },
};

function actorId(res: Response) { return (res.locals.auth as { userId: string }).userId; }
function param(req: Request, name: string) { return typeof req.params[name] === "string" ? req.params[name] as string : ""; }
function parse<T>(schema: { safeParse(value: unknown): any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(422, "VALIDATION_FAILED", "Data sengketa tidak valid.", result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  return result.data as T;
}
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function addHours(date: Date, milliseconds: number) { return new Date(date.getTime() + milliseconds); }
function dateIso(value: Date | null) { return value?.toISOString() ?? null; }

function dto(row: any, includePrivateRetention = false) {
  return {
    id: row.id, booking_id: row.bookingId, category: row.category, description: row.description,
    related_revision_id: row.relatedRevisionId, related_revision: row.relatedRevision,
    related_cancellation_id: row.relatedCancellationId, related_cancellation: row.relatedCancellation,
    delivery_cycle_id: row.deliveryCycleId, status: row.status, version: row.version,
    created_by_user_id: row.createdById, created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    decision: row.decisionAt ? { decided_at: row.decisionAt.toISOString(), decided_by_user_id: row.decisionById, outcome: row.decisionOutcome, reason: row.decisionReason, permitted_next_action: row.permittedNextAction } : null,
    evidence_retention: includePrivateRetention ? { retain_until: row.evidenceRetainUntil.toISOString(), legal_hold: row.legalHoldAt !== null, legal_hold_reason: row.legalHoldReason } : { retain_until: row.evidenceRetainUntil.toISOString(), legal_hold: row.legalHoldAt !== null },
    clarifications: row.clarifications.map((item: any) => ({ id: item.id, recipient: item.recipient, recipient_user_id: item.recipientUserId, requested_by_user_id: item.requestedById, question: item.question, requested_at: item.requestedAt.toISOString(), response_due_at: item.responseDueAt.toISOString(), status: item.status, version: item.version, response_text: item.responseText, responded_by_user_id: item.respondedById, responded_at: dateIso(item.respondedAt), closed_by_user_id: item.closedById, closed_at: dateIso(item.closedAt) })),
    linked_reports: row.reportEvidence.map((item: any) => ({ report_id: item.reportId, linked_at: item.createdAt.toISOString() })),
    related_messages: row.messageEvidence.map((item: any) => ({ id: item.message.id, sender_user_id: item.message.senderId, body: item.message.body, created_at: item.message.createdAt.toISOString() })),
    appeals: row.appeals.map((item: any) => ({ id: item.id, appellant_user_id: item.appellantId, reason: item.reason, submitted_at: item.submittedAt.toISOString(), submission_deadline_at: item.submissionDeadlineAt.toISOString(), status: item.status, version: item.version, assigned_reviewer_user_id: item.assignedReviewerId, outcome: item.outcome, permitted_next_action: item.permittedNextAction, resolution_reason: item.resolutionReason, decided_at: dateIso(item.decidedAt) })),
    history: row.events.map((event: any) => ({ id: event.id, actor_user_id: event.actorUserId, event_type: event.eventType, from_status: event.fromStatus, to_status: event.toStatus, reason: event.reason, payload: event.payload, occurred_at: event.occurredAt.toISOString() })),
  };
}

async function lockDispute(tx: Prisma.TransactionClient, disputeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Dispute" WHERE "id" = ${disputeId} FOR UPDATE`;
  const row = await tx.dispute.findUnique({ where: { id: disputeId }, include: { booking: { select: { id: true, status: true, customerId: true, sellerId: true, seller: { select: { userId: true } } } } } });
  if (!row) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
  return row;
}

async function event(tx: Prisma.TransactionClient, input: { disputeId: string; actorId: string | null; type: string; from: any; to: any; reason?: string | null; payload?: Record<string, unknown>; at: Date }) {
  return tx.disputeEvent.create({ data: { disputeId: input.disputeId, actorUserId: input.actorId, eventType: input.type, fromStatus: input.from, toStatus: input.to, reason: input.reason ?? null, payload: (input.payload ?? {}) as Prisma.InputJsonValue, occurredAt: input.at } });
}

async function fullDispute(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.dispute.findUnique({ where: { id }, include: disputeInclude });
  if (!row) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
  return row;
}

async function assertBookingParty(tx: Prisma.TransactionClient, bookingId: string, actorUserId: string, sellerProfileId?: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true, customerId: true, sellerId: true, seller: { select: { userId: true } } } });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  if (sellerProfileId) {
    if (booking.sellerId !== sellerProfileId) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  } else if (booking.customerId !== actorUserId) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  return booking;
}

async function assertPartyDispute(dispute: { booking: { customerId: string; seller: { userId: string } } }, actorUserId: string) {
  if (dispute.booking.customerId !== actorUserId && dispute.booking.seller.userId !== actorUserId) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
}

async function setRevisionAuthorization(tx: Prisma.TransactionClient, disputeId: string, bookingId: string, cycleId: string, action: string, now: Date) {
  const available = await tx.disputeRevisionAuthorization.findFirst({ where: { bookingId, status: "AVAILABLE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (available) await tx.disputeRevisionAuthorization.update({ where: { id: available.id }, data: { status: "REVOKED", revokedAt: now } });
  if (action === "RETURN_TO_REVISION") await tx.disputeRevisionAuthorization.create({ data: { disputeId, bookingId, deliveryCycleId: cycleId } });
}

async function applyNextAction(tx: Prisma.TransactionClient, disputeId: string, bookingId: string, action: string, actorId: string, reason: string, now: Date) {
  const bookingState = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  const incompatible = disputeActionCompatibility(action, bookingState?.status ?? "MISSING");
  if (incompatible) throw new HttpError(409, "DISPUTE_ACTION_NOT_AVAILABLE", incompatible);
  if (action === "CANCEL_BOOKING") return cancelBookingFromDispute(tx, { bookingId, actorId, reason, now });
  if (action === "RETURN_TO_REVISION") {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
    const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true }, select: { id: true } });
    const activeRevision = await tx.revisionRequest.findFirst({ where: { bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, select: { id: true } });
    if (booking?.status !== "DELIVERED" || !cycle || activeRevision) throw new HttpError(409, "REVISION_RETURN_NOT_AVAILABLE", "Return-to-revision requires a delivered booking, an active delivery cycle, and no active revision.");
    await setRevisionAuthorization(tx, disputeId, bookingId, cycle.id, action, now);
    return;
  }
  if (action === "CONTINUE_BOOKING") {
    await setRevisionAuthorization(tx, disputeId, bookingId, "", action, now);
    return;
  }
  throw new HttpError(422, "INVALID_DISPUTE_ACTION", "Tindakan sengketa tidak valid.");
}

export async function createDispute(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const actor = actorId(res);
  const sellerProfileId = res.locals.sellerProfileId as string | undefined;
  const input = parse<ReturnType<typeof disputeSchema.parse>>(disputeSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, bookingId);
    const booking = await assertBookingParty(tx, bookingId, actor, sellerProfileId);
    const existing = await tx.dispute.findFirst({ where: { bookingId, status: { not: "DECIDED" } }, select: { id: true } });
    if (existing) throw new HttpError(409, "ACTIVE_DISPUTE_EXISTS", "Pesanan ini sudah memiliki sengketa aktif.");
    const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId, active: true }, select: { id: true, status: true } });
    const revision = input.related_revision_id ? await tx.revisionRequest.findFirst({ where: { id: input.related_revision_id, bookingId }, select: { id: true, status: true } }) : null;
    if (input.related_revision_id && !revision) throw new HttpError(422, "DISPUTE_REFERENCE_MISMATCH", "Referensi revisi tidak ditemukan pada pesanan ini.");
    const cancellation = input.related_cancellation_id ? await tx.cancellationRequest.findFirst({ where: { id: input.related_cancellation_id, bookingId }, select: { id: true, status: true } }) : null;
    if (input.related_cancellation_id && !cancellation) throw new HttpError(422, "DISPUTE_REFERENCE_MISMATCH", "Referensi pembatalan tidak ditemukan pada pesanan ini.");
    const incompatible = disputeCategoryCompatibility(input.category as DisputeCategory, {
      bookingStatus: booking.status,
      hasActiveDeliveryCycle: Boolean(cycle), deliveryCycleStatus: cycle?.status,
      relatedRevisionId: revision?.id, relatedRevisionStatus: revision?.status,
      relatedCancellationId: cancellation?.id, relatedCancellationStatus: cancellation?.status,
    });
    if (incompatible) throw new HttpError(409, "DISPUTE_CATEGORY_STATE_CONFLICT", incompatible);
    const now = new Date();
    const staleAuthorizations = await tx.disputeRevisionAuthorization.findMany({ where: { bookingId, status: "AVAILABLE" }, select: { id: true } });
    for (const authorization of staleAuthorizations) await tx.disputeRevisionAuthorization.update({ where: { id: authorization.id }, data: { status: "REVOKED", revokedAt: now } });
    const dispute = await tx.dispute.create({ data: {
      bookingId, deliveryCycleId: cycle?.id ?? null, createdById: actor, category: input.category,
      description: input.description, relatedRevisionId: revision?.id ?? null,
      relatedCancellationId: cancellation?.id ?? null, evidenceRetainUntil: addHours(now, 2 * 365 * 24 * 60 * 60 * 1000),
    } });
    await event(tx, { disputeId: dispute.id, actorId: actor, type: "CREATED", from: null, to: "OPEN", reason: input.description, payload: { category: input.category, related_revision_id: revision?.id ?? null, related_cancellation_id: cancellation?.id ?? null, revoked_revision_authorizations: staleAuthorizations.map((item) => item.id) }, at: now });
    await syncDeliveryCycleBlockers(tx, bookingId, now, actor);
    await enqueueInAppNotices(tx, `dispute:${dispute.id}:created`, "DISPUTE_CREATED", [
      { userId: booking.customerId, type: "COMPLAINT", title: "Sengketa pesanan dibuka", refId: dispute.id },
      { userId: booking.seller.userId, type: "COMPLAINT", title: "Sengketa pesanan dibuka", refId: dispute.id },
    ], cycle?.id);
    return fullDispute(tx, dispute.id);
  });
  res.status(201).json({ data: dto(result) });
}

async function readDispute(req: Request, res: Response, adminOnly = false) {
  const id = param(req, "dispute_id");
  const actor = actorId(res);
  const row = await prisma.dispute.findUnique({ where: { id }, include: { booking: { select: { customerId: true, seller: { select: { userId: true } } } } } });
  if (!row) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
  if (!adminOnly) await assertPartyDispute(row as never, actor);
  await prisma.disputeEvidenceAccess.create({ data: { disputeId: id, viewerId: actor, accessType: "CASE_DETAIL" } });
  const detail = await prisma.dispute.findUnique({ where: { id }, include: disputeInclude });
  if (!detail) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
  res.status(200).json({ data: dto(detail, adminOnly) });
}
export async function getPartyDispute(req: Request, res: Response) { await readDispute(req, res); }
export async function getAdminDispute(req: Request, res: Response) { await readDispute(req, res, true); }

export async function listAdminDisputes(req: Request, res: Response) {
  const adminId = actorId(res);
  const statusSchema = z.enum(["OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "WAITING_SELLER", "DECIDED"]);
  const status = req.query.status === undefined ? undefined : statusSchema.safeParse(req.query.status);
  if (status && !status.success) throw new HttpError(422, "VALIDATION_FAILED", "Filter status sengketa tidak valid.");
  const rows = await prisma.$transaction(async (tx) => {
    const disputes = await tx.dispute.findMany({ where: status?.success ? { status: status.data } : { status: { not: "DECIDED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, include: disputeInclude });
    if (disputes.length) await tx.disputeEvidenceAccess.createMany({ data: disputes.map((row) => ({ disputeId: row.id, viewerId: adminId, accessType: "DISPUTE_QUEUE" })) });
    return disputes;
  });
  res.status(200).json({ data: rows.map((row) => dto(row, true)) });
}

export async function startDisputeReview(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const adminId = actorId(res); const input = parse<ReturnType<typeof reviewSchema.parse>>(reviewSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId);
    const dispute = await lockDispute(tx, id);
    if (dispute.version !== input.expected_version) throw new HttpError(409, "DISPUTE_VERSION_CONFLICT", "Sengketa telah berubah. Muat ulang sebelum melanjutkan.");
    let status: string; try { status = nextDisputeStatus(dispute.status, "START_REVIEW"); } catch { throw new HttpError(409, "DISPUTE_STATE_CONFLICT", "Sengketa tidak dapat mulai ditinjau pada status ini."); }
    const now = new Date();
    const updated = await tx.dispute.update({ where: { id }, data: { status: status as never, version: { increment: 1 }, updatedAt: now } });
    await event(tx, { disputeId: id, actorId: adminId, type: "REVIEW_STARTED", from: dispute.status, to: updated.status, reason: input.reason, at: now });
    return fullDispute(tx, id);
  });
  res.status(200).json({ data: dto(result, true) });
}

export async function requestDisputeClarification(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const adminId = actorId(res); const input = parse<ReturnType<typeof clarificationSchema.parse>>(clarificationSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId);
    const dispute = await lockDispute(tx, id);
    if (dispute.version !== input.expected_version) throw new HttpError(409, "DISPUTE_VERSION_CONFLICT", "Sengketa telah berubah. Muat ulang sebelum melanjutkan.");
    const recipientUserId = input.recipient === "CUSTOMER" ? dispute.booking.customerId : dispute.booking.seller.userId;
    const to = input.recipient === "CUSTOMER" ? "WAITING_CUSTOMER" : "WAITING_SELLER";
    let next: string; try { next = nextDisputeStatus(dispute.status, input.recipient === "CUSTOMER" ? "REQUEST_CUSTOMER" : "REQUEST_SELLER"); } catch { throw new HttpError(409, "DISPUTE_STATE_CONFLICT", "Klarifikasi hanya dapat diminta dari sengketa yang sedang ditinjau."); }
    if (next !== to) throw new HttpError(409, "DISPUTE_STATE_CONFLICT", "Status klarifikasi tidak konsisten.");
    const now = new Date(); const dueAt = clarificationDeadline(now);
    const clarification = await tx.disputeClarification.create({ data: { disputeId: id, recipient: input.recipient, recipientUserId, requestedById: adminId, question: input.question, requestedAt: now, responseDueAt: dueAt } });
    const updated = await tx.dispute.update({ where: { id }, data: { status: to as never, version: { increment: 1 }, updatedAt: now } });
    await event(tx, { disputeId: id, actorId: adminId, type: "CLARIFICATION_REQUESTED", from: dispute.status, to: updated.status, reason: input.question, payload: { clarification_id: clarification.id, recipient: input.recipient, recipient_user_id: recipientUserId, requested_at: now.toISOString(), response_due_at: dueAt.toISOString() }, at: now });
    await enqueueInAppNotices(tx, `dispute:${id}:clarification:${clarification.id}`, "DISPUTE_CLARIFICATION_REQUESTED", [{ userId: recipientUserId, type: "COMPLAINT", title: "Admin meminta klarifikasi sengketa", body: input.question, refId: id }], dispute.deliveryCycleId ?? undefined);
    return fullDispute(tx, id);
  });
  res.status(201).json({ data: dto(result, true) });
}

export async function respondToDisputeClarification(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const clarificationId = param(req, "clarification_id"); const actor = actorId(res); const input = parse<ReturnType<typeof clarificationResponseSchema.parse>>(clarificationResponseSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId); const dispute = await lockDispute(tx, id);
    await tx.$queryRaw`SELECT "id" FROM "DisputeClarification" WHERE "id" = ${clarificationId} AND "disputeId" = ${id} FOR UPDATE`;
    const clarification = await tx.disputeClarification.findFirst({ where: { id: clarificationId, disputeId: id } });
    if (!clarification) throw new HttpError(404, "DISPUTE_CLARIFICATION_NOT_FOUND", "Klarifikasi tidak ditemukan.");
    await assertPartyDispute(dispute as never, actor);
    if (clarification.recipientUserId !== actor) throw new HttpError(404, "DISPUTE_CLARIFICATION_NOT_FOUND", "Klarifikasi tidak ditemukan.");
    if (dispute.version !== input.expected_version || clarification.status !== "PENDING" || clarification.version !== 1 || dispute.status !== (clarification.recipient === "CUSTOMER" ? "WAITING_CUSTOMER" : "WAITING_SELLER")) throw new HttpError(409, "DISPUTE_CLARIFICATION_CONFLICT", "Klarifikasi telah berubah atau bukan menunggu jawaban Anda.");
    const now = new Date(); if (!isClarificationResponseOpen(clarification.responseDueAt, now)) throw new HttpError(409, "DISPUTE_CLARIFICATION_EXPIRED", "Batas klarifikasi telah berakhir; admin harus menentukan langkah berikutnya.");
    await tx.disputeClarification.update({ where: { id: clarificationId }, data: { status: "RESPONDED", version: { increment: 1 }, responseText: input.response_text, respondedById: actor, respondedAt: now } });
    const updated = await tx.dispute.update({ where: { id }, data: { status: "OPEN", version: { increment: 1 }, updatedAt: now } });
    await event(tx, { disputeId: id, actorId: actor, type: "CLARIFICATION_RESPONDED", from: dispute.status, to: updated.status, reason: input.response_text, payload: { clarification_id: clarificationId, responded_at: now.toISOString() }, at: now });
    await syncDeliveryCycleBlockers(tx, pointer.bookingId, now, actor);
    return fullDispute(tx, id);
  });
  res.status(200).json({ data: dto(result) });
}

export async function decideDispute(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const adminId = actorId(res); const input = parse<ReturnType<typeof decisionSchema.parse>>(decisionSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId); const dispute = await lockDispute(tx, id);
    if (dispute.version !== input.expected_version) throw new HttpError(409, "DISPUTE_VERSION_CONFLICT", "Sengketa telah berubah. Muat ulang sebelum memutuskan.");
    let next: string; try { next = nextDisputeStatus(dispute.status, "DECIDE"); } catch { throw new HttpError(409, "DISPUTE_STATE_CONFLICT", "Sengketa tidak dapat diputus pada status ini."); }
    const pendingClarifications = await tx.disputeClarification.findMany({ where: { disputeId: id, status: "PENDING" }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }] });
    const now = new Date();
    const bookingState = await tx.booking.findUnique({ where: { id: pointer.bookingId }, select: { status: true } });
    const incompatibleAction = disputeActionCompatibility(input.outcome, bookingState?.status ?? "MISSING");
    if (incompatibleAction) throw new HttpError(409, "DISPUTE_ACTION_NOT_AVAILABLE", incompatibleAction);
    for (const item of pendingClarifications) await tx.disputeClarification.update({ where: { id: item.id }, data: { status: "CLOSED_WITHOUT_RESPONSE", version: { increment: 1 }, closedById: adminId, closedAt: now } });
    if (input.outcome === "RETURN_TO_REVISION") {
      const booking = await tx.booking.findUnique({ where: { id: pointer.bookingId }, select: { status: true } });
      const cycle = await tx.deliveryCycle.findFirst({ where: { bookingId: pointer.bookingId, active: true }, select: { id: true } });
      const activeRevision = await tx.revisionRequest.findFirst({ where: { bookingId: pointer.bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, select: { id: true } });
      if (booking?.status !== "DELIVERED" || !cycle || activeRevision) throw new HttpError(409, "REVISION_RETURN_NOT_AVAILABLE", "Return-to-revision memerlukan booking terkirim, delivery cycle aktif, dan tanpa revisi aktif.");
    }
    if (input.outcome === "CANCEL_BOOKING") await cancelBookingFromDispute(tx, { bookingId: pointer.bookingId, actorId: adminId, reason: input.reason, now });
    const updated = await tx.dispute.update({ where: { id }, data: { status: next as never, version: { increment: 1 }, updatedAt: now, decisionAt: now, decisionById: adminId, decisionOutcome: input.outcome, decisionReason: input.reason, permittedNextAction: input.permitted_next_action } });
    const decisionEvent = await event(tx, { disputeId: id, actorId: adminId, type: "DECIDED", from: dispute.status, to: updated.status, reason: input.reason, payload: { outcome: input.outcome, permitted_next_action: input.permitted_next_action, decision_at: now.toISOString(), closed_pending_clarifications: pendingClarifications.map((item) => item.id) }, at: now });
    if (input.outcome === "RETURN_TO_REVISION") {
      const cycle = await tx.deliveryCycle.findFirstOrThrow({ where: { bookingId: pointer.bookingId, active: true }, select: { id: true } });
      await setRevisionAuthorization(tx, id, pointer.bookingId, cycle.id, input.outcome, now);
    } else await setRevisionAuthorization(tx, id, pointer.bookingId, "", input.outcome, now);
    await syncDeliveryCycleBlockers(tx, pointer.bookingId, now, adminId);
    const detail = await fullDispute(tx, id);
    await enqueueInAppNotices(tx, `dispute:${id}:decided:${decisionEvent.id}`, "DISPUTE_DECIDED", [
      { userId: dispute.booking.customerId, type: "COMPLAINT", title: "Keputusan sengketa dicatat", body: input.permitted_next_action, refId: id },
      { userId: dispute.booking.seller.userId, type: "COMPLAINT", title: "Keputusan sengketa dicatat", body: input.permitted_next_action, refId: id },
    ], dispute.deliveryCycleId ?? undefined);
    return detail;
  });
  res.status(200).json({ data: dto(result, true) });
}

export async function submitDisputeAppeal(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const actor = actorId(res); const input = parse<ReturnType<typeof appealSchema.parse>>(appealSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId); const dispute = await lockDispute(tx, id);
    await assertPartyDispute(dispute as never, actor);
    if (dispute.status !== "DECIDED" || !dispute.decisionAt || !dispute.decisionOutcome) throw new HttpError(409, "APPEAL_NOT_AVAILABLE", "Banding hanya dapat diajukan setelah keputusan admin tersimpan.");
    const now = new Date();
    if (!isAppealWindowOpen(dispute.decisionAt, now)) throw new HttpError(409, "APPEAL_WINDOW_CLOSED", "Batas pengajuan banding 48 jam telah berakhir.");
    const prior = await tx.disputeAppeal.findUnique({ where: { disputeId_appellantId: { disputeId: id, appellantId: actor } }, select: { id: true } });
    if (prior) throw new HttpError(409, "APPEAL_ALREADY_SUBMITTED", "Pihak ini telah mengajukan satu banding untuk sengketa ini.");
    const dueAt = appealDeadline(dispute.decisionAt);
    const appeal = await tx.disputeAppeal.create({ data: { disputeId: id, appellantId: actor, reason: input.reason, submittedAt: now, submissionDeadlineAt: dueAt } });
    await tx.disputeAppealEvent.create({ data: { appealId: appeal.id, actorUserId: actor, eventType: "SUBMITTED", fromStatus: null, toStatus: "SUBMITTED", reason: input.reason, payload: { submitted_at: now.toISOString(), submission_deadline_at: dueAt.toISOString() } as Prisma.InputJsonValue, occurredAt: now } });
    await syncDeliveryCycleBlockers(tx, pointer.bookingId, now, actor);
    await enqueueInAppNotices(tx, `dispute:${id}:appeal:${appeal.id}:submitted`, "DISPUTE_APPEAL_SUBMITTED", [{ userId: dispute.decisionById!, type: "COMPLAINT", title: "Banding sengketa baru", refId: appeal.id }], dispute.deliveryCycleId ?? undefined);
    return { id: appeal.id, dispute_id: id, status: appeal.status, submitted_at: now.toISOString(), submission_deadline_at: dueAt.toISOString(), version: appeal.version };
  });
  res.status(201).json({ data: result });
}

async function loadAppeal(tx: Prisma.TransactionClient, appealId: string) {
  const appeal = await tx.disputeAppeal.findUnique({ where: { id: appealId }, include: { dispute: { include: { booking: { select: { id: true, status: true, customerId: true, sellerId: true, seller: { select: { userId: true } } } } } }, events: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } } });
  if (!appeal) throw new HttpError(404, "APPEAL_NOT_FOUND", "Banding tidak ditemukan.");
  return appeal;
}

function appealDto(row: any, admin = false) {
  return { id: row.id, dispute_id: row.disputeId, booking_id: row.dispute.bookingId, appellant_user_id: row.appellantId, reason: row.reason,
    submitted_at: row.submittedAt.toISOString(), submission_deadline_at: row.submissionDeadlineAt.toISOString(), status: row.status, version: row.version,
    assigned_reviewer_user_id: row.assignedReviewerId, assigned_by_user_id: row.assignedById, assignment_reason: row.assignmentReason,
    review_started_at: dateIso(row.reviewStartedAt), outcome: row.outcome, permitted_next_action: row.permittedNextAction,
    resolution_reason: row.resolutionReason, decided_at: dateIso(row.decidedAt),
    history: row.events.map((item: any) => ({ id: item.id, actor_user_id: item.actorUserId, event_type: item.eventType, from_status: item.fromStatus, to_status: item.toStatus, reason: item.reason, payload: item.payload, occurred_at: item.occurredAt.toISOString() })),
    original_decision: { decided_at: dateIso(row.dispute.decisionAt), decided_by_user_id: row.dispute.decisionById, outcome: row.dispute.decisionOutcome, reason: row.dispute.decisionReason, permitted_next_action: row.dispute.permittedNextAction },
    ...(admin ? { booking_status: row.dispute.booking.status } : {}),
  };
}

export async function getPartyAppeal(req: Request, res: Response) {
  const id = param(req, "appeal_id"); const actor = actorId(res); const appeal = await loadAppeal(prisma as never, id);
  await assertPartyDispute(appeal.dispute as never, actor);
  await prisma.disputeEvidenceAccess.create({ data: { disputeId: appeal.disputeId, viewerId: actor, accessType: "CASE_DETAIL" } });
  res.status(200).json({ data: appealDto(appeal) });
}

export async function listAdminAppeals(_req: Request, res: Response) {
  const adminId = actorId(res);
  const rows = await prisma.$transaction(async (tx) => {
    const appeals = await tx.disputeAppeal.findMany({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } }, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], take: 100, include: { dispute: { include: { booking: { select: { id: true, status: true, customerId: true, sellerId: true, seller: { select: { userId: true } } } } } }, events: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } } });
    if (appeals.length) await tx.disputeEvidenceAccess.createMany({ data: appeals.map((row) => ({ disputeId: row.disputeId, viewerId: adminId, accessType: "APPEAL_QUEUE" })) });
    return appeals;
  });
  res.status(200).json({ data: rows.map((row) => appealDto(row, true)) });
}

export async function getAdminAppeal(req: Request, res: Response) {
  const row = await loadAppeal(prisma as never, param(req, "appeal_id"));
  await prisma.disputeEvidenceAccess.create({ data: { disputeId: row.disputeId, viewerId: actorId(res), accessType: "CASE_DETAIL" } });
  res.status(200).json({ data: appealDto(row, true) });
}

export async function assignAppealReviewer(req: Request, res: Response) {
  const appealId = param(req, "appeal_id"); const adminId = actorId(res); const input = parse<ReturnType<typeof assignmentSchema.parse>>(assignmentSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.disputeAppeal.findUnique({ where: { id: appealId }, select: { disputeId: true } });
    if (!pointer) throw new HttpError(404, "APPEAL_NOT_FOUND", "Banding tidak ditemukan.");
    const disputePointer = await tx.dispute.findUnique({ where: { id: pointer.disputeId }, select: { bookingId: true } });
    if (!disputePointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, disputePointer.bookingId); const dispute = await lockDispute(tx, pointer.disputeId);
    await tx.$queryRaw`SELECT "id" FROM "DisputeAppeal" WHERE "id" = ${appealId} FOR UPDATE`;
    const appeal = await tx.disputeAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new HttpError(404, "APPEAL_NOT_FOUND", "Banding tidak ditemukan.");
    if (appeal.version !== input.expected_version || appeal.status !== "SUBMITTED") throw new HttpError(409, "APPEAL_VERSION_CONFLICT", "Banding telah berubah atau telah ditugaskan.");
    if (!dispute.decisionById) throw new HttpError(409, "APPEAL_REVIEWER_INVALID", "Keputusan awal tidak memiliki reviewer yang dapat diverifikasi.");
    const admins = await tx.user.findMany({ where: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { id: true } });
    if (!canReviewAppeal(input.reviewer_user_id, dispute.decisionById, admins.map((item) => item.id))) throw new HttpError(409, "INDEPENDENT_REVIEWER_REQUIRED", "Reviewer harus merupakan admin aktif selain admin pembuat keputusan awal.");
    const now = new Date();
    const updated = await tx.disputeAppeal.update({ where: { id: appealId }, data: { status: nextAppealStatus(appeal.status, "ASSIGN_AND_START"), version: { increment: 1 }, assignedReviewerId: input.reviewer_user_id, assignedById: adminId, assignmentReason: input.reason, reviewStartedAt: now, updatedAt: now } });
    await tx.disputeAppealEvent.create({ data: { appealId, actorUserId: adminId, eventType: "ASSIGNED_AND_STARTED", fromStatus: appeal.status, toStatus: updated.status, reason: input.reason, payload: { reviewer_user_id: input.reviewer_user_id, original_decision_maker_user_id: dispute.decisionById } as Prisma.InputJsonValue, occurredAt: now } });
    return appealDto(await loadAppeal(tx, appealId), true);
  });
  res.status(200).json({ data: result });
}

export async function decideAppeal(req: Request, res: Response) {
  const appealId = param(req, "appeal_id"); const adminId = actorId(res); const input = parse<ReturnType<typeof appealDecisionSchema.parse>>(appealDecisionSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.disputeAppeal.findUnique({ where: { id: appealId }, select: { disputeId: true } });
    if (!pointer) throw new HttpError(404, "APPEAL_NOT_FOUND", "Banding tidak ditemukan.");
    const disputePointer = await tx.dispute.findUnique({ where: { id: pointer.disputeId }, select: { bookingId: true } });
    if (!disputePointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, disputePointer.bookingId); const dispute = await lockDispute(tx, pointer.disputeId);
    await tx.$queryRaw`SELECT "id" FROM "DisputeAppeal" WHERE "id" = ${appealId} FOR UPDATE`;
    const appeal = await tx.disputeAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new HttpError(404, "APPEAL_NOT_FOUND", "Banding tidak ditemukan.");
    if (appeal.version !== input.expected_version || appeal.status !== "IN_REVIEW") throw new HttpError(409, "APPEAL_VERSION_CONFLICT", "Banding telah berubah. Muat ulang sebelum memutuskan.");
    if (appeal.assignedReviewerId !== adminId) throw new HttpError(403, "APPEAL_REVIEWER_REQUIRED", "Hanya reviewer yang ditugaskan yang dapat memutus banding.");
    if (input.outcome === "UPHELD" && input.permitted_next_action !== dispute.decisionOutcome) throw new HttpError(422, "APPEAL_ACTION_MISMATCH", "Keputusan yang dipertahankan harus menjaga tindakan keputusan awal.");
    const now = new Date();
    if (input.outcome === "MODIFIED") await applyNextAction(tx, dispute.id, disputePointer.bookingId, input.permitted_next_action, adminId, input.reason, now);
    const updated = await tx.disputeAppeal.update({ where: { id: appealId }, data: { status: nextAppealStatus(appeal.status, "DECIDE"), version: { increment: 1 }, outcome: input.outcome, permittedNextAction: input.permitted_next_action, resolutionReason: input.reason, decidedAt: now, updatedAt: now } });
    await tx.disputeAppealEvent.create({ data: { appealId, actorUserId: adminId, eventType: "DECIDED", fromStatus: appeal.status, toStatus: updated.status, reason: input.reason, payload: { outcome: input.outcome, permitted_next_action: input.permitted_next_action, decided_at: now.toISOString() } as Prisma.InputJsonValue, occurredAt: now } });
    await syncDeliveryCycleBlockers(tx, disputePointer.bookingId, now, adminId);
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: disputePointer.bookingId }, select: { customerId: true, seller: { select: { userId: true } } } });
    await enqueueInAppNotices(tx, `dispute:${dispute.id}:appeal:${appeal.id}:decided`, "DISPUTE_APPEAL_DECIDED", [
      { userId: booking.customerId, type: "COMPLAINT", title: "Banding sengketa diputus", body: input.reason, refId: appeal.id },
      { userId: booking.seller.userId, type: "COMPLAINT", title: "Banding sengketa diputus", body: input.reason, refId: appeal.id },
    ], dispute.deliveryCycleId ?? undefined);
    return appealDto(await loadAppeal(tx, appealId), true);
  });
  res.status(200).json({ data: result });
}

export async function linkDisputeMessageEvidence(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const actor = actorId(res); const input = parse<ReturnType<typeof linkMessageSchema.parse>>(linkMessageSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId); const dispute = await lockDispute(tx, id); await assertPartyDispute(dispute as never, actor);
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: pointer.bookingId }, select: { serviceId: true, customerId: true, sellerId: true } });
    const message = await tx.message.findUnique({ where: { id: input.message_id }, include: { conversation: { select: { serviceId: true, customerId: true, sellerId: true } } } });
    if (!message || message.conversation.serviceId !== booking.serviceId || message.conversation.customerId !== booking.customerId || message.conversation.sellerId !== booking.sellerId) throw new HttpError(404, "RELATED_MESSAGE_NOT_FOUND", "Pesan tidak ditemukan pada percakapan pesanan ini.");
    await tx.disputeMessageEvidence.create({ data: { disputeId: id, messageId: message.id, linkedByUserId: actor } });
    await event(tx, { disputeId: id, actorId: actor, type: "MESSAGE_EVIDENCE_LINKED", from: dispute.status, to: dispute.status, payload: { message_id: message.id }, at: new Date() });
    return fullDispute(tx, id);
  });
  res.status(201).json({ data: dto(result) });
}

export async function linkDisputeReportEvidence(req: Request, res: Response) {
  const id = param(req, "dispute_id"); const actor = actorId(res); const input = parse<ReturnType<typeof linkReportSchema.parse>>(linkReportSchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const pointer = await tx.dispute.findUnique({ where: { id }, select: { bookingId: true } });
    if (!pointer) throw new HttpError(404, "DISPUTE_NOT_FOUND", "Sengketa tidak ditemukan.");
    await lockBookingAndActiveCycle(tx, pointer.bookingId); const dispute = await lockDispute(tx, id);
    const report = await tx.report.findUnique({ where: { id: input.report_id }, select: { id: true, bookingId: true, targetType: true, targetId: true } });
    if (!report || report.bookingId !== pointer.bookingId || (report.targetType === "BOOKING" && report.targetId !== pointer.bookingId)) throw new HttpError(404, "RELATED_REPORT_NOT_FOUND", "Laporan tidak ditemukan untuk pesanan sengketa ini.");
    await tx.disputeReportEvidence.create({ data: { disputeId: id, reportId: report.id, linkedByUserId: actor } });
    await event(tx, { disputeId: id, actorId: actor, type: "REPORT_EVIDENCE_LINKED", from: dispute.status, to: dispute.status, payload: { report_id: report.id }, at: new Date() });
    return fullDispute(tx, id);
  });
  res.status(201).json({ data: dto(result, true) });
}
