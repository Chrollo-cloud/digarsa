import type { Request, Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { isCatalogVisible, publicServiceInclude, toPublicService, visibleCatalogWhere } from "./catalog.service.js";
import { addBookableCartItem, deleteCartItemRow, savedServiceAvailable } from "./saved-items.service.js";
import { z } from "zod";

const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const emptyBodySchema = z.object({}).strict();

function userId(res: Response) { return (res.locals.auth as { userId: string }).userId; }

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, "VALIDATION_FAILED", "Data favorit/keranjang tidak valid.", result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data as T;
}

function decodeCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const [date, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const createdAt = new Date(date ?? "");
    if (!date || !id || !Number.isFinite(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor daftar tersimpan tidak valid.");
  }
}

type SavedRow = {
  id: string;
  serviceId: string;
  createdAt: Date;
  service: NonNullable<Prisma.ServiceGetPayload<{ include: typeof publicServiceInclude }>>;
};

function savedDto(row: SavedRow) {
  const available = savedServiceAvailable(row.service);
  return {
    service_id: row.serviceId,
    service: isCatalogVisible(row.service) ? toPublicService(row.service) : null,
    available,
  };
}

async function listSaved(req: Request, res: Response, kind: "favorite" | "cart") {
  const ownerId = userId(res);
  const query = parse<ReturnType<typeof listQuerySchema.parse>>(listQuerySchema, req.query);
  const cursor = decodeCursor(query.cursor);
  const relationWhere = kind === "favorite" ? { userId: ownerId } : { userId: ownerId };
  const cursorWhere = cursor ? { OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] } : {};
  const where = { ...relationWhere, ...cursorWhere };
  const [rows, total] = await prisma.$transaction([
    kind === "favorite"
      ? prisma.favorite.findMany({ where, include: { service: { include: publicServiceInclude } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1 })
      : prisma.cartItem.findMany({ where, include: { service: { include: publicServiceInclude } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1 }),
    kind === "favorite" ? prisma.favorite.count({ where: { userId: ownerId } }) : prisma.cartItem.count({ where: { userId: ownerId } }),
  ]);
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows) as SavedRow[];
  const last = items.at(-1);
  res.status(200).json({
    data: items.map(savedDto),
    page: { next_cursor: hasMore && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") : null, has_more: hasMore },
    total,
  });
}

export async function listFavorites(req: Request, res: Response) { await listSaved(req, res, "favorite"); }
export async function listCart(req: Request, res: Response) { await listSaved(req, res, "cart"); }

async function addSaved(req: Request, res: Response, kind: "favorite" | "cart") {
  parse(emptyBodySchema, req.body ?? {});
  const ownerId = userId(res);
  const serviceId = typeof req.params.service_id === "string" ? req.params.service_id : "";
  if (kind === "favorite") {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, ...visibleCatalogWhere },
      select: { id: true },
    });
    if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
    await prisma.favorite.upsert({
      where: { userId_serviceId: { userId: ownerId, serviceId } },
      create: { userId: ownerId, serviceId },
      update: {},
    });
  } else {
    await prisma.$transaction((tx) => addBookableCartItem(tx, ownerId, serviceId));
  }
  res.status(200).json({ data: { service_id: serviceId } });
}

export async function addFavorite(req: Request, res: Response) { await addSaved(req, res, "favorite"); }
export async function addCartItem(req: Request, res: Response) { await addSaved(req, res, "cart"); }

async function removeSaved(req: Request, res: Response, kind: "favorite" | "cart") {
  const ownerId = userId(res);
  const serviceId = typeof req.params.service_id === "string" ? req.params.service_id : "";
  if (kind === "favorite") await prisma.favorite.deleteMany({ where: { userId: ownerId, serviceId } });
  else await deleteCartItemRow(prisma, ownerId, serviceId);
  res.status(204).end();
}

export async function removeFavorite(req: Request, res: Response) { await removeSaved(req, res, "favorite"); }
export async function removeCartItem(req: Request, res: Response) { await removeSaved(req, res, "cart"); }
