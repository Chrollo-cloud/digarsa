import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { notificationListQuerySchema } from "./notification.schema.js";

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function parseListQuery(value: unknown) {
  const result = notificationListQuerySchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Parameter daftar notifikasi tidak valid.", result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid cursor encoding");
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator < 1 || separator === decoded.length - 1) throw new Error("invalid cursor shape");
    const date = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const createdAt = new Date(date);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== date) throw new Error("invalid cursor date");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor notifikasi tidak valid.");
  }
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export async function listMyNotifications(req: Request, res: Response) {
  const userId = currentUserId(res);
  const query = parseListQuery(req.query);
  const cursor = decodeCursor(query.cursor);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(cursor ? { OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    select: { id: true, type: true, title: true, body: true, refId: true, readAt: true, createdAt: true },
  });
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  res.status(200).json({
    data: pageRows.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      ref_id: notification.refId,
      is_read: notification.readAt !== null,
      read_at: notification.readAt?.toISOString() ?? null,
      created_at: notification.createdAt.toISOString(),
    })),
    page: { next_cursor: nextCursor, has_more: hasMore, limit: query.limit },
  });
}

export async function getUnreadNotificationCount(_req: Request, res: Response) {
  const count = await prisma.notification.count({ where: { userId: currentUserId(res), readAt: null } });
  res.status(200).json({ data: { count } });
}

export async function markNotificationRead(req: Request, res: Response) {
  const userId = currentUserId(res);
  const id = typeof req.params.notification_id === "string" ? req.params.notification_id : "";
  if (!id) throw new HttpError(400, "NOTIFICATION_ID_REQUIRED", "ID notifikasi wajib diisi.");

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!existing) throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notifikasi tidak ditemukan.");
    if (existing.readAt === null) {
      const readAt = new Date();
      await tx.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt } });
    }
    const notification = await tx.notification.findFirst({ where: { id, userId }, select: { id: true, readAt: true } });
    if (!notification) throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notifikasi tidak ditemukan.");
    return notification;
  });

  res.status(200).json({ data: { id: result.id, is_read: result.readAt !== null, read_at: result.readAt?.toISOString() ?? null } });
}

export async function markAllNotificationsRead(_req: Request, res: Response) {
  const result = await prisma.notification.updateMany({
    where: { userId: currentUserId(res), readAt: null },
    data: { readAt: new Date() },
  });
  res.status(200).json({ data: { marked_read: result.count } });
}
