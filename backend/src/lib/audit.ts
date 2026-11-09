import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export async function writeAuditLog(
  userId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  meta?: Prisma.InputJsonObject,
) {
  await prisma.activityLog.create({
    data: {
      userId,
      action,
      targetType,
      targetId,
      meta,
    },
  });
}