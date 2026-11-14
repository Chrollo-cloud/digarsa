import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { priceBuyerTotal } from "../payments/pricing-policy.js";
import {
  additionalRevisionClarificationSchema,
  additionalRevisionOfferSchema,
  additionalRevisionRequestSchema,
} from "./additional-revision.schema.js";

const OFFER_TTL_MS = 48 * 60 * 60 * 1000;
const OPEN_REQUEST_STATUSES = ["OPEN", "CLARIFICATION_REQUIRED", "OFFERED"] as const;
const UNSETTLED_AGREEMENT_STATUSES = ["AWAITING_PAYMENT", "FUNDED", "IN_PROGRESS", "DELIVERED", "IN_REVIEW", "DISPUTED", "CANCELLATION_PENDING", "DEMO_FUNDED", "DEMO_IN_PROGRESS", "DEMO_IN_REVIEW"] as const;

function actorId(res: Response) { return (res.locals.auth as { userId: string }).userId; }
function sellerId(res: Response) { return res.locals.sellerProfileId as string; }
function parseInput<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, "VALIDATION_FAILED", "Data additional revision tidak valid.", parsed.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({ field: issue.path.join("."), message: issue.message })));
  return parsed.data as T;
}
function notFound(): never { throw new HttpError(404, "NOT_FOUND", "Data additional revision tidak ditemukan."); }
function param(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== "string" || !value.trim()) notFound();
  return value;
}

async function lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
}

async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) {
        if (retryable) throw new HttpError(409, "CONCURRENT_UPDATE", "This booking changed at the same time. Refresh and try again.");
        throw error;
      }
    }
  }
  throw new HttpError(409, "CONCURRENT_UPDATE", "This booking changed at the same time. Refresh and try again.");
}

function requestDto(row: any) {
  return {
    id: row.id, booking_id: row.bookingId, description: row.description, status: row.status,
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    offers: row.offers?.map((offer: any) => ({
      id: offer.id, version: offer.version, scope: offer.scope, terms: offer.terms,
      seller_price: offer.sellerPrice, admin_fee: offer.adminFee, buyer_total: offer.buyerTotal,
      pricing_policy_version: offer.pricingPolicyVersion,
      estimated_duration_hours: offer.estimatedDurationHours, status: offer.status,
      expires_at: offer.expiresAt.toISOString(), created_at: offer.createdAt.toISOString(),
    })) ?? [],
    agreement: row.agreement ? {
      id: row.agreement.id, status: row.agreement.status,
      seller_price: row.agreement.sellerPrice, admin_fee: row.agreement.adminFee,
      buyer_total: row.agreement.buyerTotal, pricing_policy_version: row.agreement.pricingPolicyVersion,
      accepted_at: row.agreement.acceptedAt.toISOString(),
      funded_at: row.agreement.fundedAt?.toISOString() ?? null,
      started_at: row.agreement.startedAt?.toISOString() ?? null,
      delivered_at: row.agreement.deliveredAt?.toISOString() ?? null,
      review_deadline_at: row.agreement.reviewDeadlineAt?.toISOString() ?? null,
      completed_at: row.agreement.completedAt?.toISOString() ?? null,
      delivery_note: row.agreement.deliveryNote ?? null,
    } : null,
    history: row.events?.map((event: any) => ({
      event_type: event.eventType, from_status: event.fromStatus, to_status: event.toStatus,
      payload: event.payload, occurred_at: event.occurredAt.toISOString(),
    })) ?? [],
  };
}

export async function createAdditionalRevisionRequest(req: Request, res: Response) {
  const bookingId = param(req, "booking_id");
  const input = parseInput<{ description: string }>(additionalRevisionRequestSchema, req.body);
  const customerId = actorId(res);
  const created = await serializableTransaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const booking = await tx.booking.findFirst({ where: { id: bookingId, customerId }, select: { id: true, status: true, sellerId: true } });
    if (!booking) notFound();
    const payment = await tx.payment.findUnique({ where: { bookingId }, select: { status: true, provenance: true } });
    const paidByDemo = process.env.NODE_ENV !== "production" && process.env.PAYMENT_DEMO_MODE === "true"
      && payment?.status === "DEMO_PAID" && payment.provenance === "DEMO_SIMULATION";
    if (!( ["PAID", "DELIVERED", "COMPLETED"] as string[]).includes(booking.status) || (payment?.status !== "PAID" && !paidByDemo)) {
      throw new HttpError(409, "BOOKING_NOT_ELIGIBLE", "Additional revision requires a paid booking in an active or completed state.");
    }
    const blocked = await tx.dispute.findFirst({ where: { bookingId, status: { not: "DECIDED" } }, select: { id: true } });
    const cancellation = await tx.cancellationRequest.findFirst({ where: { bookingId, status: "PENDING" }, select: { id: true } });
    if (blocked || cancellation) throw new HttpError(409, "BOOKING_LIFECYCLE_BLOCKED", "An active dispute or cancellation request blocks a new additional-revision request.");
    const existing = await tx.additionalRevisionRequest.findFirst({ where: { bookingId, status: { in: [...OPEN_REQUEST_STATUSES] } }, select: { id: true } });
    if (existing) throw new HttpError(409, "REQUEST_ALREADY_OPEN", "This booking already has an open additional-revision request.");
    const agreement = await tx.additionalRevisionAgreement.findFirst({ where: { bookingId, status: { in: [...UNSETTLED_AGREEMENT_STATUSES] } }, select: { id: true } });
    if (agreement) throw new HttpError(409, "AGREEMENT_ALREADY_OPEN", "This booking already has an unsettled additional-revision agreement.");
    const row = await tx.additionalRevisionRequest.create({ data: { bookingId, customerId, sellerProfileId: booking.sellerId, description: input.description } });
    await tx.additionalRevisionEvent.create({ data: { requestId: row.id, actorUserId: customerId, eventType: "REQUEST_CREATED", toStatus: "OPEN", payload: { description: input.description } } });
    return row;
  });
  res.status(201).json({ data: requestDto(created) });
}

export async function listCustomerAdditionalRevisionRequests(req: Request, res: Response) {
  const customerId = actorId(res);
  const rows = await prisma.additionalRevisionRequest.findMany({
    where: { bookingId: param(req, "booking_id"), customerId },
    include: { offers: { orderBy: { version: "asc" } }, agreement: true, events: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  res.json({ data: rows.map(requestDto) });
}

export async function listSellerAdditionalRevisionRequests(req: Request, res: Response) {
  const rows = await prisma.additionalRevisionRequest.findMany({
    where: { bookingId: param(req, "booking_id"), sellerProfileId: sellerId(res) },
    include: { offers: { orderBy: { version: "asc" } }, agreement: true, events: { orderBy: [{ occurredAt: "asc" }, { id: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  res.json({ data: rows.map(requestDto) });
}

export async function requestAdditionalRevisionClarification(req: Request, res: Response) {
  const input = parseInput<{ message: string }>(additionalRevisionClarificationSchema, req.body);
  const actor = actorId(res); const profileId = sellerId(res);
  const row = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const current = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), sellerProfileId: profileId, status: { in: [...OPEN_REQUEST_STATUSES] } } });
    if (!current) notFound();
    await tx.additionalRevisionOfferVersion.updateMany({ where: { requestId: current.id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    const updated = await tx.additionalRevisionRequest.update({ where: { id: current.id }, data: { status: "CLARIFICATION_REQUIRED", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { requestId: current.id, actorUserId: actor, eventType: "CLARIFICATION_REQUESTED", fromStatus: current.status, toStatus: updated.status, payload: { message: input.message } } });
    return updated;
  });
  res.json({ data: requestDto(row) });
}

export async function respondToAdditionalRevisionClarification(req: Request, res: Response) {
  const input = parseInput<{ message: string }>(additionalRevisionClarificationSchema, req.body);
  const actor = actorId(res);
  const row = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const current = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), customerId: actor, status: "CLARIFICATION_REQUIRED" } });
    if (!current) notFound();
    const updated = await tx.additionalRevisionRequest.update({ where: { id: current.id }, data: { status: "OPEN", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { requestId: current.id, actorUserId: actor, eventType: "CLARIFICATION_RESPONDED", fromStatus: current.status, toStatus: updated.status, payload: { message: input.message } } });
    return updated;
  });
  res.json({ data: requestDto(row) });
}

export async function rejectAdditionalRevisionRequest(req: Request, res: Response) {
  const input = parseInput<{ message: string }>(additionalRevisionClarificationSchema, req.body);
  const actor = actorId(res); const profileId = sellerId(res);
  const row = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const current = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), sellerProfileId: profileId, status: { in: [...OPEN_REQUEST_STATUSES] } } });
    if (!current) notFound();
    await tx.additionalRevisionOfferVersion.updateMany({ where: { requestId: current.id, status: "ACTIVE" }, data: { status: "REJECTED" } });
    const updated = await tx.additionalRevisionRequest.update({ where: { id: current.id }, data: { status: "REJECTED", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { requestId: current.id, actorUserId: actor, eventType: "REQUEST_REJECTED", fromStatus: current.status, toStatus: updated.status, payload: { message: input.message } } });
    return updated;
  });
  res.json({ data: requestDto(row) });
}

export async function withdrawAdditionalRevisionRequest(req: Request, res: Response) {
  const actor = actorId(res);
  const row = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const current = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), customerId: actor, status: { in: [...OPEN_REQUEST_STATUSES] } } });
    if (!current) notFound();
    await tx.additionalRevisionOfferVersion.updateMany({ where: { requestId: current.id, status: "ACTIVE" }, data: { status: "WITHDRAWN" } });
    const updated = await tx.additionalRevisionRequest.update({ where: { id: current.id }, data: { status: "WITHDRAWN", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { requestId: current.id, actorUserId: actor, eventType: "REQUEST_WITHDRAWN", fromStatus: current.status, toStatus: updated.status, payload: {} } });
    return updated;
  });
  res.json({ data: requestDto(row) });
}

export async function createAdditionalRevisionOffer(req: Request, res: Response) {
  const input = parseInput<{ scope: string; terms: string; seller_price: number; estimated_duration_hours: number }>(additionalRevisionOfferSchema, req.body);
  const profileId = sellerId(res); const actor = actorId(res); const now = new Date();
  const offer = await serializableTransaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const request = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), sellerProfileId: profileId, status: { in: [...OPEN_REQUEST_STATUSES] } } });
    if (!request) notFound();
    await tx.additionalRevisionOfferVersion.updateMany({ where: { requestId: request.id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    const version = await tx.additionalRevisionOfferVersion.count({ where: { requestId: request.id } }) + 1;
    const price = priceBuyerTotal(input.seller_price);
    const created = await tx.additionalRevisionOfferVersion.create({ data: {
      requestId: request.id, version, scope: input.scope, terms: input.terms,
      sellerPrice: price.sellerPrice, adminFee: price.adminFee, buyerTotal: price.buyerTotal,
      pricingPolicyVersion: price.pricingPolicyVersion, estimatedDurationHours: input.estimated_duration_hours,
      expiresAt: new Date(now.getTime() + OFFER_TTL_MS),
    } });
    const updated = await tx.additionalRevisionRequest.update({ where: { id: request.id }, data: { status: "OFFERED", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { requestId: request.id, actorUserId: actor, eventType: "OFFER_CREATED", fromStatus: request.status, toStatus: updated.status, payload: { offer_id: created.id, version, seller_price: price.sellerPrice, admin_fee: price.adminFee, buyer_total: price.buyerTotal, pricing_policy_version: price.pricingPolicyVersion, expires_at: created.expiresAt.toISOString() } } });
    return created;
  });
  res.status(201).json({ data: { id: offer.id, version: offer.version, scope: offer.scope, terms: offer.terms, seller_price: offer.sellerPrice, admin_fee: offer.adminFee, buyer_total: offer.buyerTotal, pricing_policy_version: offer.pricingPolicyVersion, estimated_duration_hours: offer.estimatedDurationHours, status: offer.status, expires_at: offer.expiresAt.toISOString() } });
}

export async function acceptAdditionalRevisionOffer(req: Request, res: Response) {
  const customerId = actorId(res); const now = new Date();
  const result = await serializableTransaction(async (tx) => {
    await lockBooking(tx, param(req, "booking_id"));
    const request = await tx.additionalRevisionRequest.findFirst({ where: { id: param(req, "request_id"), bookingId: param(req, "booking_id"), customerId, status: "OFFERED" } });
    if (!request) notFound();
    const offer = await tx.additionalRevisionOfferVersion.findFirst({ where: { id: param(req, "offer_id"), requestId: request.id, status: "ACTIVE" } });
    if (!offer) throw new HttpError(409, "OFFER_NOT_CURRENT", "Offer is no longer the current version.");
    if (offer.expiresAt <= now) {
      await tx.additionalRevisionOfferVersion.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
      await tx.additionalRevisionEvent.create({ data: { requestId: request.id, actorUserId: customerId, eventType: "OFFER_EXPIRED", fromStatus: "OFFERED", toStatus: "OFFERED", payload: { offer_id: offer.id, offer_version: offer.version, expired_at: now.toISOString() } } });
      return { expired: true as const };
    }
    const already = await tx.additionalRevisionAgreement.findFirst({ where: { bookingId: request.bookingId, status: { in: [...UNSETTLED_AGREEMENT_STATUSES] } }, select: { id: true } });
    if (already) throw new HttpError(409, "AGREEMENT_ALREADY_OPEN", "This booking already has an unsettled additional-revision agreement.");
    const created = await tx.additionalRevisionAgreement.create({ data: {
      bookingId: request.bookingId, requestId: request.id, offerVersionId: offer.id,
      customerId: request.customerId, sellerProfileId: request.sellerProfileId,
      scopeSnapshot: offer.scope, termsSnapshot: offer.terms, sellerPrice: offer.sellerPrice,
      adminFee: offer.adminFee, buyerTotal: offer.buyerTotal,
      pricingPolicyVersion: offer.pricingPolicyVersion,
      estimatedDurationHours: offer.estimatedDurationHours, status: "AWAITING_PAYMENT",
    } });
    await tx.additionalRevisionOfferVersion.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
    await tx.additionalRevisionRequest.update({ where: { id: request.id }, data: { status: "AGREED", version: { increment: 1 } } });
    await tx.additionalRevisionEvent.create({ data: { agreementId: created.id, actorUserId: customerId, eventType: "OFFER_ACCEPTED", fromStatus: "OFFERED", toStatus: "AWAITING_PAYMENT", payload: { offer_id: offer.id, offer_version: offer.version, accepted_at: now.toISOString() } } });
    return { expired: false as const, agreement: created };
  });
  if (result.expired) throw new HttpError(410, "OFFER_EXPIRED", "This offer has expired.");
  const agreement = result.agreement;
  res.status(201).json({ data: { id: agreement.id, booking_id: agreement.bookingId, status: agreement.status, seller_price: agreement.sellerPrice, admin_fee: agreement.adminFee, buyer_total: agreement.buyerTotal, pricing_policy_version: agreement.pricingPolicyVersion, accepted_at: agreement.acceptedAt.toISOString(), payment_available: false } });
}
