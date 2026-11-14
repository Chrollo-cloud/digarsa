import type { Request, Response } from "express";
import { Prisma, ReportStatus, ReportTarget } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { createReportSchema, moderateReportSchema, reportListQuerySchema } from "./report.schema.js";

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, "VALIDATION_FAILED", message, result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data as T;
}

function parseListQuery(value: unknown) {
  const result = reportListQuerySchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Parameter daftar laporan tidak valid.", result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid cursor encoding");
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = value.lastIndexOf("|");
    if (separator < 1 || separator === value.length - 1) throw new Error("invalid cursor shape");
    const date = value.slice(0, separator);
    const id = value.slice(separator + 1);
    const createdAt = new Date(date);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== date) throw new Error("invalid cursor date");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor laporan tidak valid.");
  }
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function userReportDto(report: {
  id: string; targetType: ReportTarget; targetId: string; bookingId: string | null;
  reason: string; detail: string | null; status: ReportStatus; resolvedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: report.id,
    target_type: report.targetType,
    target_id: report.targetId,
    booking_id: report.bookingId,
    reason: report.reason,
    detail: report.detail,
    status: report.status,
    resolved_at: report.resolvedAt?.toISOString() ?? null,
    created_at: report.createdAt.toISOString(),
    updated_at: report.updatedAt.toISOString(),
  };
}

function adminReportDto(report: {
  id: string; reporterId: string; targetType: ReportTarget; targetId: string; bookingId: string | null;
  reason: string; detail: string | null; status: ReportStatus; adminNote: string | null;
  resolvedById: string | null; resolvedAt: Date | null; createdAt: Date; updatedAt: Date;
  reporter?: { id: string; name: string };
}) {
  return {
    ...userReportDto(report),
    reporter_id: report.reporterId,
    ...(report.reporter ? { reporter: report.reporter } : {}),
    admin_note: report.adminNote,
    resolved_by_id: report.resolvedById,
  };
}

async function lockAndValidateTarget(
  tx: Prisma.TransactionClient,
  targetType: ReportTarget,
  targetId: string,
  reporterId: string,
) {
  switch (targetType) {
    case "SERVICE": {
      await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${targetId} FOR UPDATE`;
      const service = await tx.service.findUnique({ where: { id: targetId }, select: { seller: { select: { userId: true } } } });
      if (!service) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      if (service.seller.userId === reporterId) throw new HttpError(422, "SELF_REPORT_NOT_ALLOWED", "Anda tidak dapat melaporkan layanan milik sendiri.");
      return null;
    }
    case "USER": {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetId} FOR UPDATE`;
      const target = await tx.user.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } });
      if (!target) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      if (target.id === reporterId) throw new HttpError(422, "SELF_REPORT_NOT_ALLOWED", "Anda tidak dapat melaporkan akun sendiri.");
      return null;
    }
    case "MESSAGE": {
      await tx.$queryRaw`SELECT "id" FROM "Message" WHERE "id" = ${targetId} FOR UPDATE`;
      const target = await tx.message.findUnique({
        where: { id: targetId },
        select: {
          senderId: true,
          conversation: { select: { customerId: true, seller: { select: { userId: true } } } },
        },
      });
      if (!target) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      const isParticipant = target.conversation.customerId === reporterId || target.conversation.seller.userId === reporterId;
      if (!isParticipant) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      if (target.senderId === reporterId) throw new HttpError(422, "SELF_REPORT_NOT_ALLOWED", "Anda tidak dapat melaporkan pesan sendiri.");
      return null;
    }
    case "REVIEW": {
      await tx.$queryRaw`SELECT "id" FROM "Review" WHERE "id" = ${targetId} FOR UPDATE`;
      const target = await tx.review.findUnique({ where: { id: targetId }, select: { reviewerId: true } });
      if (!target) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      if (target.reviewerId === reporterId) throw new HttpError(422, "SELF_REPORT_NOT_ALLOWED", "Anda tidak dapat melaporkan review sendiri.");
      return null;
    }
    case "BOOKING": {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${targetId} FOR UPDATE`;
      const target = await tx.booking.findUnique({ where: { id: targetId }, select: { id: true, customerId: true, seller: { select: { userId: true } } } });
      if (!target) throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      if (target.customerId !== reporterId && target.seller.userId !== reporterId) {
        throw new HttpError(404, "REPORT_TARGET_NOT_FOUND", "Target laporan tidak ditemukan.");
      }
      return target.id;
    }
  }
}

export async function submitReport(req: Request, res: Response) {
  const reporterId = currentUserId(res);
  const input = parse<ReturnType<typeof createReportSchema.parse>>(createReportSchema, req.body, "Data laporan tidak valid.");
  const targetType = input.target_type as ReportTarget;
  const created = await prisma.$transaction(async (tx) => {
    const bookingId = await lockAndValidateTarget(tx, targetType, input.target_id, reporterId);
    const activeDuplicate = await tx.report.findFirst({
      where: {
        reporterId,
        targetType,
        targetId: input.target_id,
        status: { in: ["OPEN", "IN_REVIEW"] },
      },
      select: { id: true },
    });
    if (activeDuplicate) throw new HttpError(409, "DUPLICATE_ACTIVE_REPORT", "Laporan untuk target ini masih aktif.");
    return tx.report.create({
      data: {
        reporterId,
        targetType,
        targetId: input.target_id,
        bookingId,
        reason: input.reason,
        detail: input.detail,
      },
    });
  });
  res.status(201).json({ data: userReportDto(created) });
}

async function listReports(req: Request, res: Response, where: Prisma.ReportWhereInput, admin = false) {
  const query = parseListQuery(req.query);
  const cursor = decodeCursor(query.cursor);
  const baseWhere: Prisma.ReportWhereInput = {
    ...where,
    ...(query.status ? { status: query.status as ReportStatus } : {}),
    ...(query.target_type ? { targetType: query.target_type as ReportTarget } : {}),
  };
  const pageWhere: Prisma.ReportWhereInput = cursor ? { AND: [baseWhere, { OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] }] } : baseWhere;
  const [rows, total] = await prisma.$transaction([
    prisma.report.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(admin ? { include: { reporter: { select: { id: true, name: true } } } } : {}),
    }),
    prisma.report.count({ where: baseWhere }),
  ]);
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);
  res.status(200).json({
    data: pageRows.map((row) => admin ? adminReportDto(row) : userReportDto(row)),
    page: { next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, has_more: hasMore, limit: query.limit },
    total,
  });
}

export async function listMyReports(req: Request, res: Response) {
  await listReports(req, res, { reporterId: currentUserId(res) });
}

export async function getMyReport(req: Request, res: Response) {
  const id = typeof req.params.report_id === "string" ? req.params.report_id : "";
  const report = await prisma.report.findFirst({ where: { id, reporterId: currentUserId(res) } });
  if (!report) throw new HttpError(404, "REPORT_NOT_FOUND", "Laporan tidak ditemukan.");
  res.status(200).json({ data: userReportDto(report) });
}

export async function listAdminReports(req: Request, res: Response) {
  await listReports(req, res, {}, true);
}

async function resolveTarget(targetType: ReportTarget, targetId: string) {
  switch (targetType) {
    case "SERVICE":
      return prisma.service.findUnique({ where: { id: targetId }, select: { id: true, title: true, moderationStatus: true, isHidden: true, active: true, seller: { select: { id: true, displayName: true } } } });
    case "USER":
      return prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, role: true, accountStatus: true, deletedAt: true } });
    case "MESSAGE":
      return prisma.message.findUnique({ where: { id: targetId }, select: { id: true, body: true, sender: { select: { id: true, name: true } }, conversation: { select: { id: true, service: { select: { id: true, title: true } } } } } });
    case "REVIEW":
      return prisma.review.findUnique({ where: { id: targetId }, select: { id: true, rating: true, comment: true, createdAt: true, service: { select: { id: true, title: true } }, seller: { select: { id: true, displayName: true } } } });
    case "BOOKING":
      return prisma.booking.findUnique({ where: { id: targetId }, select: { id: true, status: true, serviceTitle: true, sellerName: true, customer: { select: { id: true, name: true } }, seller: { select: { id: true, displayName: true } } } });
  }
}

export async function getAdminReport(req: Request, res: Response) {
  const id = typeof req.params.report_id === "string" ? req.params.report_id : "";
  const report = await prisma.report.findUnique({ where: { id }, include: { reporter: { select: { id: true, name: true } } } });
  if (!report) throw new HttpError(404, "REPORT_NOT_FOUND", "Laporan tidak ditemukan.");
  const target = await resolveTarget(report.targetType, report.targetId);
  res.status(200).json({ data: { ...adminReportDto(report), target } });
}

const allowedTransitions: Record<ReportStatus, ReportStatus[]> = {
  OPEN: ["IN_REVIEW", "RESOLVED", "DISMISSED"],
  IN_REVIEW: ["RESOLVED", "DISMISSED"],
  RESOLVED: [],
  DISMISSED: [],
};

export async function moderateReport(req: Request, res: Response) {
  const adminId = currentUserId(res);
  const id = typeof req.params.report_id === "string" ? req.params.report_id : "";
  const input = parse<ReturnType<typeof moderateReportSchema.parse>>(moderateReportSchema, req.body, "Data moderasi tidak valid.");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Report" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.report.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "REPORT_NOT_FOUND", "Laporan tidak ditemukan.");
    if (!allowedTransitions[existing.status].includes(input.status as ReportStatus)) {
      throw new HttpError(409, "REPORT_STATUS_CONFLICT", `Status laporan tidak dapat berubah dari ${existing.status} ke ${input.status}.`);
    }
    const terminal = input.status === "RESOLVED" || input.status === "DISMISSED";
    const now = terminal ? new Date() : null;
    const updated = await tx.report.update({
      where: { id },
      data: {
        status: input.status as ReportStatus,
        ...(Object.hasOwn(input, "admin_note") ? { adminNote: input.admin_note ?? null } : {}),
        resolvedById: terminal ? adminId : null,
        resolvedAt: now,
      },
    });
    await tx.activityLog.create({
      data: {
        userId: adminId,
        action: `REPORT_${input.status}`,
        targetType: "REPORT",
        targetId: id,
        meta: { from_status: existing.status, to_status: input.status },
      },
    });
    return updated;
  });
  res.status(200).json({ data: adminReportDto(result) });
}
