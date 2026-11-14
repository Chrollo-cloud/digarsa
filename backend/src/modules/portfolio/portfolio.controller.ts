import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { createPortfolioItemSchema, updatePortfolioItemSchema } from "./portfolio.schema.js";

function sellerProfileId(res: Response) {
  return res.locals.sellerProfileId as string;
}

function validationError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Data portfolio tidak valid.", issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function portfolioDto(item: { id: string; title: string | null; description: string | null; imageUrl: string; createdAt: Date }) {
  return { id: item.id, title: item.title, description: item.description, image_url: item.imageUrl, created_at: item.createdAt.toISOString() };
}

export async function listMyPortfolio(_req: Request, res: Response) {
  const items = await prisma.portfolioItem.findMany({
    where: { sellerId: sellerProfileId(res) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  res.status(200).json({ data: items.map(portfolioDto) });
}

export async function createPortfolioItem(req: Request, res: Response) {
  const parsed = createPortfolioItemSchema.safeParse(req.body);
  if (!parsed.success) validationError(parsed.error.issues);
  const ownerId = sellerProfileId(res);
  const item = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${ownerId} FOR UPDATE`;
    return tx.portfolioItem.create({
      data: {
        sellerId: ownerId,
        title: parsed.data.title ?? null,
        description: parsed.data.description ?? null,
        imageUrl: parsed.data.image_url,
      },
    });
  });
  res.status(201).json({ data: portfolioDto(item) });
}

export async function updatePortfolioItem(req: Request, res: Response) {
  const parsed = updatePortfolioItemSchema.safeParse(req.body);
  if (!parsed.success) validationError(parsed.error.issues);
  const ownerId = sellerProfileId(res);
  const id = typeof req.params.item_id === "string" ? req.params.item_id : "";
  const item = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${ownerId} FOR UPDATE`;
    const existing = await tx.portfolioItem.findFirst({ where: { id, sellerId: ownerId }, select: { id: true } });
    if (!existing) throw new HttpError(404, "PORTFOLIO_ITEM_NOT_FOUND", "Item portfolio tidak ditemukan.");
    return tx.portfolioItem.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.image_url !== undefined ? { imageUrl: parsed.data.image_url } : {}),
      },
    });
  });
  res.status(200).json({ data: portfolioDto(item) });
}

export async function deletePortfolioItem(req: Request, res: Response) {
  const ownerId = sellerProfileId(res);
  const id = typeof req.params.item_id === "string" ? req.params.item_id : "";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${ownerId} FOR UPDATE`;
    const deleted = await tx.portfolioItem.deleteMany({ where: { id, sellerId: ownerId } });
    if (deleted.count !== 1) throw new HttpError(404, "PORTFOLIO_ITEM_NOT_FOUND", "Item portfolio tidak ditemukan.");
  });
  res.status(200).json({ data: { id, deleted: true } });
}
