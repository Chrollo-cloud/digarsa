import type { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../lib/http.js";
import { isCatalogVisible, type PublicServiceRow, visibleCatalogWhere } from "./catalog.service.js";

type CartWriter = Pick<Prisma.TransactionClient, "$queryRaw" | "service" | "cartItem">;
type CartRemover = Pick<Prisma.TransactionClient, "cartItem">;

export async function addBookableCartItem(tx: CartWriter, ownerId: string, serviceId: string) {
  // Availability-changing backend paths use this same row lock, making the
  // eligibility check and cart upsert one ordered transaction.
  await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${serviceId} FOR UPDATE`;
  const service = await tx.service.findFirst({
    where: { id: serviceId, ...visibleCatalogWhere },
    select: { id: true, status: true },
  });
  if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
  if (service.status !== "OPEN") {
    throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Layanan tidak tersedia untuk menerima pesanan.");
  }

  return tx.cartItem.upsert({
    where: { userId_serviceId: { userId: ownerId, serviceId } },
    create: { userId: ownerId, serviceId },
    update: {},
  });
}

export function savedServiceAvailable(service: PublicServiceRow) {
  return isCatalogVisible(service) && service.status === "OPEN";
}

export async function deleteCartItemRow(tx: CartRemover, ownerId: string, serviceId: string) {
  await tx.cartItem.deleteMany({ where: { userId: ownerId, serviceId } });
}

