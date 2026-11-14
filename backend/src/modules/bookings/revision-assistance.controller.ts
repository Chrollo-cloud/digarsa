import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Prisma, RevisionEscalationStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { z } from "zod";
import { lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { enqueueInAppNotices } from "./notification-outbox.js";
import { nextRevisionAssistanceStatus } from "./revision-assistance.js";
import { syncRevisionResponseClocks } from "./revision-response-clock.js";

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START_REVIEW"), expected_status: z.literal("OPEN"), expected_version: z.coerce.number().int().positive(), reason: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal("RESOLVE"), expected_status: z.literal("IN_REVIEW"), expected_version: z.coerce.number().int().positive(), resolution_details: z.string().trim().min(5).max(2000), permitted_next_action: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("CLOSE"), expected_status: z.literal("RESOLVED"), expected_version: z.coerce.number().int().positive(), reason: z.string().trim().min(5).max(1000) }),
  z.object({ action: z.literal("REOPEN"), expected_status: z.literal("RESOLVED"), expected_version: z.coerce.number().int().positive(), reason: z.string().trim().min(5).max(1000) }),
]);
const statusSchema = z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]);

function actorId(res: Response) { return (res.locals.auth as { userId: string }).userId; }
function param(req: Request, name: string) { return typeof req.params[name] === "string" ? req.params[name] as string : ""; }
function requestFingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function parseTransition(value: unknown) {
  const parsed = transitionSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_FAILED", "Transisi bantuan admin tidak valid.", parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  return parsed.data;
}
function dto(row: any, now = new Date()) {
  return {
    id: row.id,
    revision_id: row.revisionId,
    booking_id: row.bookingId,
    trigger: row.trigger,
    requester_id: row.requesterId,
    reason: row.reason,
    status: row.status,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    sla_due_at: row.slaDueAt.toISOString(),
    sla_overdue: now >= row.slaDueAt && row.status !== "RESOLVED" && row.status !== "CLOSED",
    sla_breached_at: row.slaBreachedAt?.toISOString() ?? null,
    review_started_at: row.reviewStartedAt?.toISOString() ?? null,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    closed_at: row.closedAt?.toISOString() ?? null,
    resolution_details: row.resolutionDetails,
    permitted_next_action: row.permittedNextAction,
    response_clock_type: row.responseClockType,
    response_clarification_id: row.responseClarificationId,
    parent_assistance_id: row.parentAssistanceId,
    revision: row.revision,
    events: row.events?.map((event: any) => ({
      id: event.id, actor_user_id: event.actorUserId, actor_type: event.actorType,
      event_type: event.eventType, from_status: event.fromStatus, to_status: event.toStatus,
      reason: event.reason, resolution_details: event.resolutionDetails,
      permitted_next_action: event.permittedNextAction, occurred_at: event.occurredAt.toISOString(),
    })) ?? undefined,
    response_clock_pauses: row.responseClockPauses?.map((pause: any) => ({
      id: pause.id, clock_type: pause.clockType, clarification_id: pause.clarificationId,
      paused_at: pause.pausedAt.toISOString(), remaining_ms: pause.remainingMs,
      resumed_at: pause.resume?.resumedAt?.toISOString() ?? null,
      restored_deadline_at: pause.resume?.restoredDeadlineAt?.toISOString() ?? null,
    })) ?? undefined,
  };
}

const escalationInclude = {
  revision: { select: {
    id: true, status: true, requestText: true, sellerResponseDeadlineAt: true,
    sellerResponseRemainingMs: true, sellerResponsePausedAt: true, estimatedCompletionAt: true,
    clarifications: { select: { id: true, status: true, responseDueAt: true, responseRemainingMs: true, responsePausedAt: true } },
    booking: { select: { id: true, customerId: true, sellerId: true, serviceTitle: true } },
  } },
  events: { orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }] },
  responseClockPauses: { include: { resume: true }, orderBy: [{ pausedAt: "asc" as const }, { id: "asc" as const }] },
};

export async function listAdminRevisionAssistance(req: Request, res: Response) {
  const parsedStatus = req.query.status === undefined ? undefined : statusSchema.safeParse(req.query.status);
  if (parsedStatus && !parsedStatus.success) throw new HttpError(422, "VALIDATION_FAILED", "Filter status bantuan admin tidak valid.");
  const status = parsedStatus?.success ? parsedStatus.data : undefined;
  const rows = await prisma.revisionEscalationRequest.findMany({
    where: status ? { status } : { status: { in: ["OPEN", "IN_REVIEW"] } },
    orderBy: [{ slaDueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 100,
    include: escalationInclude,
  });
  const now = new Date();
  res.status(200).json({ data: rows.map((row) => dto(row, now)) });
}

export async function getAdminRevisionAssistance(req: Request, res: Response) {
  const id = param(req, "assistance_id");
  const row = await prisma.revisionEscalationRequest.findUnique({ where: { id }, include: escalationInclude });
  if (!row) throw new HttpError(404, "REVISION_ASSISTANCE_NOT_FOUND", "Permintaan bantuan admin tidak ditemukan.");
  res.status(200).json({ data: dto(row) });
}

export async function transitionAdminRevisionAssistance(req: Request, res: Response) {
  const assistanceId = param(req, "assistance_id");
  const adminId = actorId(res);
  const input = parseTransition(req.body);
  const fingerprint = requestFingerprint(input);
  const pointer = await prisma.revisionEscalationRequest.findUnique({ where: { id: assistanceId }, select: { bookingId: true, revisionId: true } });
  if (!pointer) throw new HttpError(404, "REVISION_ASSISTANCE_NOT_FOUND", "Permintaan bantuan admin tidak ditemukan.");

  const result = await prisma.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, pointer.bookingId);
    await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${pointer.revisionId} AND "bookingId" = ${pointer.bookingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "RevisionEscalationRequest" WHERE "id" = ${assistanceId} FOR UPDATE`;
    const assistance = await tx.revisionEscalationRequest.findUnique({ where: { id: assistanceId } });
    if (!assistance) throw new HttpError(404, "REVISION_ASSISTANCE_NOT_FOUND", "Permintaan bantuan admin tidak ditemukan.");

    const receipt = await tx.revisionEscalationOperationReceipt.findUnique({ where: { assistanceId_principalId_expectedVersion: { assistanceId, principalId: adminId, expectedVersion: input.expected_version } } });
    if (receipt) {
      if (receipt.requestFingerprint !== fingerprint) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Versi transisi yang sama dikirim dengan isi berbeda.");
      return { data: receipt.result, replay: true };
    }
    if (assistance.version !== input.expected_version || assistance.status !== input.expected_status) throw new HttpError(409, "REVISION_ASSISTANCE_VERSION_CONFLICT", "Permintaan bantuan admin telah berubah. Muat ulang sebelum mengambil tindakan.");

    let nextStatus: RevisionEscalationStatus;
    try { nextStatus = nextRevisionAssistanceStatus(assistance.status, input.action); }
    catch { throw new HttpError(409, "REVISION_ASSISTANCE_TRANSITION_CONFLICT", "Transisi status bantuan admin tidak diizinkan."); }
    const now = new Date();
    const patch: Prisma.RevisionEscalationRequestUpdateInput = {
      status: nextStatus,
      version: { increment: 1 },
      updatedAt: now,
      ...(!assistance.slaBreachedAt && now >= assistance.slaDueAt ? { slaBreachedAt: now } : {}),
      ...(input.action === "START_REVIEW" ? { reviewStartedAt: now } : {}),
      ...(input.action === "RESOLVE" ? { resolvedAt: now, resolutionDetails: input.resolution_details, permittedNextAction: input.permitted_next_action } : {}),
      ...(input.action === "CLOSE" ? { closedAt: now } : {}),
      ...(input.action === "REOPEN" ? { reviewStartedAt: now, resolvedAt: null, closedAt: null, resolutionDetails: null, permittedNextAction: null } : {}),
    };
    const updated = await tx.revisionEscalationRequest.update({ where: { id: assistanceId }, data: patch });
    const event = await tx.revisionEscalationEvent.create({ data: {
      assistanceId, actorUserId: adminId, actorType: "USER", eventType: input.action,
      fromStatus: assistance.status, toStatus: nextStatus,
      reason: "reason" in input ? input.reason : input.action === "RESOLVE" ? input.resolution_details : null,
      resolutionDetails: input.action === "RESOLVE" ? input.resolution_details : null,
      permittedNextAction: input.action === "RESOLVE" ? input.permitted_next_action : null,
      requestFingerprint: fingerprint, occurredAt: now,
    } });
    if (!assistance.slaBreachedAt && now >= assistance.slaDueAt) {
      await tx.revisionEscalationEvent.create({ data: {
        assistanceId, actorUserId: null, actorType: "SYSTEM", eventType: "SLA_BREACHED",
        fromStatus: nextStatus, toStatus: nextStatus,
        reason: `ADMIN_HANDLING_SLA_EXCEEDED:${Math.max(0, now.getTime() - assistance.slaDueAt.getTime())}ms`, occurredAt: now,
      } });
    }
    await tx.revisionEscalationOperationReceipt.create({ data: {
      assistanceId, principalId: adminId, expectedVersion: input.expected_version, requestFingerprint: fingerprint,
      result: { id: updated.id, revision_id: updated.revisionId, booking_id: updated.bookingId, status: updated.status, version: updated.version, event_id: event.id, sla_due_at: updated.slaDueAt.toISOString() } as Prisma.InputJsonValue,
    } });
    await syncRevisionResponseClocks(tx, pointer.revisionId, now, adminId);
    await syncDeliveryCycleBlockers(tx, pointer.bookingId, now, adminId);

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: pointer.bookingId }, select: { customerId: true, seller: { select: { userId: true } } } });
    const noticeUsers = Array.from(new Set([booking.customerId, booking.seller.userId]));
    await enqueueInAppNotices(tx, `revision-assistance:${assistanceId}:event:${event.id}`, `REVISION_ASSISTANCE_${input.action}`, noticeUsers.map((userId) => ({
      userId, type: "BOOKING_UPDATE" as const, title: "Status bantuan admin diperbarui",
      body: input.action === "RESOLVE" ? input.resolution_details : input.action === "REOPEN" ? input.reason : null,
      refId: assistanceId,
    })), undefined);
    return { data: { id: updated.id, revision_id: updated.revisionId, booking_id: updated.bookingId, status: updated.status, version: updated.version, event_id: event.id, sla_due_at: updated.slaDueAt.toISOString() }, replay: false };
  });
  res.status(200).json({ data: result.data });
}
