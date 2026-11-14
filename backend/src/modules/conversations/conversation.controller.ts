import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { visibleCatalogWhere } from "../catalog/catalog.service.js";
import { conversationMessagePageSchema, createMessageSchema } from "./conversation.schema.js";
import { classifyMessage, safeModerationMetadata } from "./message-moderation.js";
import { moderateMessageOnce, moderateMessageWithGemini, type ModerationOutcome } from "./gemini-message-moderation.js";

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function conversationId(req: Request) {
  const id = typeof req.params.conversation_id === "string" ? req.params.conversation_id : "";
  if (!id) throw new HttpError(400, "CONVERSATION_ID_REQUIRED", "ID percakapan wajib diisi.");
  return id;
}

function parseMessage(value: unknown) {
  const result = createMessageSchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, "VALIDATION_FAILED", "Pesan tidak valid.", result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

function parseMessagePage(value: unknown) {
  const result = conversationMessagePageSchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Parameter pagination pesan tidak valid.", result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
  }
  return result.data;
}

function decodeMessageCursor(cursor: string | undefined) {
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
    throw new HttpError(400, "INVALID_CURSOR", "Cursor pesan tidak valid.");
  }
}

function encodeMessageCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

const conversationInclude = {
  service: { select: { id: true, title: true, status: true } },
  seller: { select: { id: true, userId: true, displayName: true } },
} as const;

export async function createServiceConversation(req: Request, res: Response) {
  const customerId = currentUserId(res);
  const serviceId = typeof req.params.service_id === "string" ? req.params.service_id : "";
  if (!serviceId) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${serviceId} FOR UPDATE`;
    const service = await tx.service.findFirst({
      where: { id: serviceId, ...visibleCatalogWhere },
      select: { id: true, sellerId: true, status: true, seller: { select: { userId: true } } },
    });
    if (!service) throw new HttpError(404, "SERVICE_NOT_FOUND", "Layanan tidak ditemukan.");
    if (service.status !== "OPEN") throw new HttpError(409, "SERVICE_NOT_OPEN", "Percakapan baru hanya dapat dimulai untuk layanan yang tersedia.");
    if (service.seller.userId === customerId) throw new HttpError(422, "SELF_CONVERSATION", "Anda tidak dapat memulai percakapan dengan layanan sendiri.");

    const existing = await tx.conversation.findUnique({
      where: { serviceId_customerId: { serviceId, customerId } },
      include: conversationInclude,
    });
    if (existing) return { conversation: existing, created: false };
    const conversation = await tx.conversation.create({
      data: { serviceId, customerId, sellerId: service.sellerId },
      include: conversationInclude,
    });
    return { conversation, created: true };
  });

  const { conversation } = result;
  res.status(result.created ? 201 : 200).json({ data: {
    id: conversation.id,
    service_id: conversation.serviceId,
    service_title: conversation.service.title,
    service_status: conversation.service.status,
    customer_id: conversation.customerId,
    seller_profile_id: conversation.sellerId,
    seller_name: conversation.seller.displayName,
    created_at: conversation.createdAt.toISOString(),
  } });
}

export async function listMyConversations(_req: Request, res: Response) {
  const id = currentUserId(res);
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ customerId: id }, { seller: { is: { userId: id } } }] },
    include: conversationInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  res.status(200).json({ data: conversations.map((conversation) => ({
    id: conversation.id,
    service_id: conversation.serviceId,
    service_title: conversation.service.title,
    service_status: conversation.service.status,
    customer_id: conversation.customerId,
    seller_profile_id: conversation.sellerId,
    seller_name: conversation.seller.displayName,
    created_at: conversation.createdAt.toISOString(),
  })) });
}

type ConversationMessageDatabase = typeof prisma;

type MessageModerationResultLike = ReturnType<typeof classifyMessage>;

function moderationDto(result: MessageModerationResultLike, source: "GEMINI" | "RULE_BASED") {
  return {
    ...safeModerationMetadata(result),
    source: source === "GEMINI" ? "gemini" : "rule_based",
    status: source === "GEMINI" ? "AI_COMPLETED" : "RULE_BASED_FALLBACK",
  };
}

/** Injectable handler factory keeps endpoint behavior testable without a live database. */
export function createConversationMessageHandlers(
  database: ConversationMessageDatabase = prisma,
  moderate: (body: string) => Promise<ModerationOutcome> = moderateMessageWithGemini,
) {
  async function getParticipantConversation(id: string, userId: string) {
    const conversation = await database.conversation.findFirst({
      where: { id, OR: [{ customerId: userId }, { seller: { is: { userId } } }] },
      select: { id: true },
    });
    if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");
    return conversation;
  }

  async function listConversationMessages(req: Request, res: Response) {
    const id = conversationId(req);
    await getParticipantConversation(id, currentUserId(res));
    const query = parseMessagePage(req.query);
    const cursor = decodeMessageCursor(query.cursor);
    const messages = await database.message.findMany({
      where: {
        conversationId: id,
        ...(cursor ? { OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { id: true, senderId: true, body: true, createdAt: true, isFlagged: true, flagReasons: true, flagSeverity: true, moderationSource: true },
    });
    const hasMore = messages.length > query.limit;
    const pageMessages = hasMore ? messages.slice(0, query.limit) : messages;
    const oldest = pageMessages.at(-1);
    const nextCursor = hasMore && oldest ? encodeMessageCursor(oldest.createdAt, oldest.id) : null;
    res.status(200).json({ data: pageMessages.reverse().map((message) => ({
      id: message.id,
      sender_id: message.senderId,
      body: message.body,
      created_at: message.createdAt.toISOString(),
      moderation: moderationDto({
        flagged: message.isFlagged,
        reasons: message.flagReasons as ReturnType<typeof classifyMessage>["reasons"],
        severity: message.flagSeverity,
      }, message.moderationSource === "GEMINI" ? "GEMINI" : "RULE_BASED"),
    })), page: { next_cursor: nextCursor, has_more: hasMore, limit: query.limit } });
  }

  async function sendConversationMessage(req: Request, res: Response) {
    const id = conversationId(req);
    const senderId = currentUserId(res);
    const input = parseMessage(req.body);
    const authorizedConversation = await database.conversation.findFirst({
      where: { id, OR: [{ customerId: senderId }, { seller: { is: { userId: senderId } } }] },
      select: { id: true },
    });
    if (!authorizedConversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");

    // Keep the provider call outside the transaction. It always falls back to
    // deterministic classification so a valid message can still be stored.
    let moderation: ModerationOutcome;
    try {
      moderation = await moderateMessageOnce([id, senderId], input.body, moderate);
    } catch {
      moderation = {
        result: classifyMessage(input.body),
        source: "RULE_BASED",
        status: "RULE_BASED_FALLBACK",
        fallbackReason: "PROVIDER_ERROR",
      };
    }
    const message = await database.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, OR: [{ customerId: senderId }, { seller: { is: { userId: senderId } } }] },
        select: { id: true, customerId: true, seller: { select: { userId: true } } },
      });
      if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Percakapan tidak ditemukan.");

      const created = await tx.message.create({
        data: {
          conversationId: id,
          senderId,
          body: input.body,
          isFlagged: moderation.result.flagged,
          flagReasons: moderation.result.reasons,
          flagSeverity: moderation.result.severity,
          moderationSource: moderation.source,
        },
        select: { id: true, senderId: true, body: true, createdAt: true, isFlagged: true, flagReasons: true, flagSeverity: true, moderationSource: true },
      });
      const recipientId = senderId === conversation.customerId ? conversation.seller.userId : conversation.customerId;
      if (recipientId !== senderId) {
        await tx.notification.create({
          data: {
            userId: recipientId,
            type: "NEW_MESSAGE",
            title: "Pesan baru",
            body: "Anda menerima pesan baru.",
            refId: conversation.id,
          },
        });
      }
      return created;
    });
    res.status(201).json({ data: {
      id: message.id,
      sender_id: message.senderId,
      body: message.body,
      created_at: message.createdAt.toISOString(),
      moderation: moderationDto({
        flagged: message.isFlagged,
        reasons: message.flagReasons as ReturnType<typeof classifyMessage>["reasons"],
        severity: message.flagSeverity,
      }, message.moderationSource === "GEMINI" ? "GEMINI" : "RULE_BASED"),
    } });
  }

  return { listConversationMessages, sendConversationMessage };
}

const messageHandlers = createConversationMessageHandlers();
export const listConversationMessages = messageHandlers.listConversationMessages;
export const sendConversationMessage = messageHandlers.sendConversationMessage;
