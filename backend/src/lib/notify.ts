import type { NotificationType } from "../generated/prisma/enums.js";
import { prisma } from "../config/prisma.js";

export async function notifyUser(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  refId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      refId: input.refId,
    },
  });
}