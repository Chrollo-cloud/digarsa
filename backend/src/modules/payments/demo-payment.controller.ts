import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { isDemoPaymentEnabled, matchesDemoPaymentAmount } from "./demo-payment.js";

function actorId(res: Response) { return (res.locals.auth as { userId: string }).userId; }
function idParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(404, "NOT_FOUND", "Data tidak ditemukan.");
  return value;
}
function requireDemoMode() {
  if (!isDemoPaymentEnabled()) throw new HttpError(404, "NOT_FOUND", "Demo payment tidak tersedia.");
}
function paymentInput(body: unknown): { amount: number; currency: string } {
  if (!body || typeof body !== "object") throw new HttpError(422, "VALIDATION_FAILED", "Jumlah pembayaran tidak valid.");
  const input = body as Record<string, unknown>;
  if (!Number.isSafeInteger(input.amount) || typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new HttpError(422, "VALIDATION_FAILED", "Jumlah pembayaran tidak valid.");
  }
  return { amount: input.amount as number, currency: input.currency };
}
async function lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
}
async function assertBookingLifecycleUnblocked(tx: Prisma.TransactionClient, bookingId: string) {
  const activeDispute = await tx.dispute.findFirst({ where: { bookingId, status: { not: "DECIDED" } }, select: { id: true } });
  const pendingCancellation = await tx.cancellationRequest.findFirst({ where: { bookingId, status: "PENDING" }, select: { id: true } });
  if (activeDispute || pendingCancellation) {
    throw new HttpError(409, "BOOKING_LIFECYCLE_BLOCKED", "Tindakan demo ditahan selama sengketa atau pembatalan masih aktif.");
  }
}

export async function getDemoPaymentAvailability(_req: Request, res: Response) {
  res.json({ data: { enabled: isDemoPaymentEnabled(), label: "DEMO PAYMENT — NO REAL TRANSACTION" } });
}

export async function payBookingWithDemo(req: Request, res: Response) {
  requireDemoMode();
  const bookingId = idParam(req, "booking_id");
  const customerId = actorId(res);
  const input = paymentInput(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const booking = await tx.booking.findFirst({ where: { id: bookingId, customerId }, include: { payment: true } });
    if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    if (!matchesDemoPaymentAmount(input, { amount: booking.total, currency: "IDR" })) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "Jumlah pembayaran tidak sesuai dengan snapshot booking.");
    }
    if (booking.payment) {
      if (booking.payment.status === "DEMO_PAID" && booking.payment.provenance === "DEMO_SIMULATION") {
        return { payment: booking.payment, duplicate: true };
      }
      throw new HttpError(409, "PAYMENT_ALREADY_EXISTS", "Booking sudah memiliki pembayaran.");
    }
    if (booking.status !== "ACCEPTED") throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Demo payment hanya tersedia setelah seller menerima booking.");
    await assertBookingLifecycleUnblocked(tx, bookingId);
    const now = new Date();
    const demoReference = `DEMO-${randomUUID()}`;
    const payment = await tx.payment.create({ data: {
      bookingId, orderId: demoReference, demoReference, method: "DEMO_SIMULATION", status: "DEMO_PAID",
      payoutStatus: "HELD", amount: booking.total, paidAt: now, provenance: "DEMO_SIMULATION", simulatedAt: now,
    } });
    await tx.paymentTransaction.create({ data: {
      bookingId, orderReference: demoReference, idempotencyKey: `demo:booking:${bookingId}`,
      currency: "IDR", sellerPrice: booking.price, adminFee: booking.fee, amount: booking.total,
      status: "DEMO_PAID", provenance: "DEMO_SIMULATION", simulatedAt: now, capturedAt: now,
    } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "PAID" } });
    await tx.bookingStatusEvent.create({ data: { bookingId, fromStatus: "ACCEPTED", toStatus: "PAID", actorUserId: customerId, source: "DEMO_PAYMENT" } });
    return { payment, duplicate: false };
  });
  res.status(result.duplicate ? 200 : 201).json({ data: {
    booking_id: bookingId, status: "DEMO_PAID", provenance: "DEMO_SIMULATION", simulated_at: result.payment.simulatedAt?.toISOString() ?? null,
    amount: result.payment.amount, currency: "IDR", label: "DEMO PAYMENT — NO REAL TRANSACTION", idempotent_replay: result.duplicate,
  } });
}

export async function payAdditionalRevisionWithDemo(req: Request, res: Response) {
  requireDemoMode();
  const bookingId = idParam(req, "booking_id");
  const agreementId = idParam(req, "agreement_id");
  const customerId = actorId(res);
  const input = paymentInput(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const agreement = await tx.additionalRevisionAgreement.findFirst({ where: { id: agreementId, bookingId, customerId } });
    if (!agreement) throw new HttpError(404, "NOT_FOUND", "Agreement tidak ditemukan.");
    if (!matchesDemoPaymentAmount(input, { amount: agreement.buyerTotal, currency: "IDR" })) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "Jumlah pembayaran tidak sesuai dengan snapshot offer.");
    }
    const existing = await tx.paymentTransaction.findUnique({ where: { idempotencyKey: `demo:agreement:${agreementId}` } });
    if (existing?.status === "DEMO_PAID" && existing.provenance === "DEMO_SIMULATION") return { payment: existing, duplicate: true };
    if (agreement.status !== "AWAITING_PAYMENT") throw new HttpError(409, "AGREEMENT_STATE_CONFLICT", "Agreement tidak menunggu demo payment.");
    await assertBookingLifecycleUnblocked(tx, bookingId);
    const now = new Date();
    const payment = await tx.paymentTransaction.create({ data: {
      additionalAgreementId: agreementId, orderReference: `DEMO-${randomUUID()}`, idempotencyKey: `demo:agreement:${agreementId}`,
      currency: "IDR", sellerPrice: agreement.sellerPrice, adminFee: agreement.adminFee, amount: agreement.buyerTotal,
      status: "DEMO_PAID", provenance: "DEMO_SIMULATION", simulatedAt: now, capturedAt: now,
    } });
    await tx.additionalRevisionAgreement.update({ where: { id: agreementId }, data: { status: "DEMO_FUNDED", fundedAt: now } });
    await tx.additionalRevisionEvent.create({ data: { agreementId, actorUserId: customerId, eventType: "DEMO_PAYMENT_RECORDED", fromStatus: "AWAITING_PAYMENT", toStatus: "DEMO_FUNDED", payload: { payment_transaction_id: payment.id, provenance: "DEMO_SIMULATION", simulated_at: now.toISOString() } } });
    return { payment, duplicate: false };
  });
  res.status(result.duplicate ? 200 : 201).json({ data: {
    booking_id: bookingId, agreement_id: agreementId, status: "DEMO_PAID", provenance: "DEMO_SIMULATION",
    simulated_at: result.payment.simulatedAt?.toISOString() ?? null, amount: result.payment.amount, currency: "IDR",
    label: "DEMO PAYMENT — NO REAL TRANSACTION", idempotent_replay: result.duplicate,
  } });
}

export async function startDemoAdditionalWork(req: Request, res: Response) {
  requireDemoMode();
  const bookingId = idParam(req, "booking_id"); const agreementId = idParam(req, "agreement_id");
  const agreement = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    await assertBookingLifecycleUnblocked(tx, bookingId);
    const current = await tx.additionalRevisionAgreement.findFirst({ where: { id: agreementId, bookingId, sellerProfileId: res.locals.sellerProfileId as string, status: "DEMO_FUNDED" } });
    if (!current) throw new HttpError(409, "AGREEMENT_STATE_CONFLICT", "Demo-funded agreement tidak ditemukan.");
    const now = new Date();
    const updated = await tx.additionalRevisionAgreement.update({ where: { id: agreementId }, data: { status: "DEMO_IN_PROGRESS", startedAt: now } });
    await tx.additionalRevisionEvent.create({ data: { agreementId, actorUserId: actorId(res), eventType: "DEMO_WORK_STARTED", fromStatus: "DEMO_FUNDED", toStatus: updated.status, payload: { occurred_at: now.toISOString() } } });
    return updated;
  });
  res.json({ data: { id: agreement.id, status: agreement.status, started_at: agreement.startedAt?.toISOString() ?? null } });
}

export async function deliverDemoAdditionalWork(req: Request, res: Response) {
  requireDemoMode();
  const bookingId = idParam(req, "booking_id"); const agreementId = idParam(req, "agreement_id");
  const body = req.body as Record<string, unknown>;
  const deliveryNote = body?.delivery_note;
  if (typeof deliveryNote !== "string" || deliveryNote.trim().length < 5 || deliveryNote.length > 4000) throw new HttpError(422, "VALIDATION_FAILED", "Catatan hasil harus berisi 5 sampai 4000 karakter.");
  const result = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    await assertBookingLifecycleUnblocked(tx, bookingId);
    const current = await tx.additionalRevisionAgreement.findFirst({ where: { id: agreementId, bookingId, sellerProfileId: res.locals.sellerProfileId as string, status: "DEMO_IN_PROGRESS" } });
    if (!current) throw new HttpError(409, "AGREEMENT_STATE_CONFLICT", "Agreement demo tidak sedang dikerjakan.");
    const now = new Date(); const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const updated = await tx.additionalRevisionAgreement.update({ where: { id: agreementId }, data: { status: "DEMO_IN_REVIEW", deliveredAt: now, reviewDeadlineAt: deadline, deliveryNote: deliveryNote.trim() } });
    await tx.additionalRevisionEvent.create({ data: { agreementId, actorUserId: actorId(res), eventType: "DEMO_WORK_DELIVERED", fromStatus: current.status, toStatus: updated.status, payload: { delivered_at: now.toISOString(), review_deadline_at: deadline.toISOString() } } });
    return updated;
  });
  res.json({ data: { id: result.id, status: result.status, delivery_note: result.deliveryNote, delivered_at: result.deliveredAt?.toISOString(), review_deadline_at: result.reviewDeadlineAt?.toISOString() } });
}

export async function completeDemoAdditionalWork(req: Request, res: Response) {
  requireDemoMode();
  const bookingId = idParam(req, "booking_id"); const agreementId = idParam(req, "agreement_id"); const customerId = actorId(res);
  const result = await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    await assertBookingLifecycleUnblocked(tx, bookingId);
    const current = await tx.additionalRevisionAgreement.findFirst({ where: { id: agreementId, bookingId, customerId, status: "DEMO_IN_REVIEW" } });
    if (!current) throw new HttpError(409, "AGREEMENT_STATE_CONFLICT", "Tidak ada hasil demo yang menunggu review.");
    const now = new Date();
    if (!current.reviewDeadlineAt || current.reviewDeadlineAt <= now) throw new HttpError(409, "REVIEW_WINDOW_EXPIRED", "Masa review 72 jam telah berakhir; agreement tetap ditahan untuk penanganan manual.");
    const updated = await tx.additionalRevisionAgreement.update({ where: { id: agreementId }, data: { status: "DEMO_COMPLETED", completedAt: now } });
    await tx.additionalRevisionEvent.create({ data: { agreementId, actorUserId: customerId, eventType: "DEMO_WORK_APPROVED", fromStatus: current.status, toStatus: updated.status, payload: { completed_at: now.toISOString(), financial_entitlement_created: false } } });
    return updated;
  });
  res.json({ data: { id: result.id, status: result.status, completed_at: result.completedAt?.toISOString(), financial_entitlement_created: false } });
}
