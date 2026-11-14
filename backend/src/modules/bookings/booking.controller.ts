import type { Request, Response } from "express";
import { BookingStatus, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../lib/http.js";
import { checkCompletionEligibility } from "./completion-eligibility.js";
import { closeActiveDeliveryCycle, createDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "./delivery-cycle.js";
import { enqueueInAppNotices } from "./notification-outbox.js";
import { createHash } from "node:crypto";
import { revisionPolicyDto, revisionPolicyHash, REVISION_WINDOW_ANCHOR, REVISION_WINDOW_UNIT } from "./revision-policy.js";
import { expireUnusedRevisionQuota } from "./revision-ledger.js";
import { priceBuyerTotal } from "../payments/pricing-policy.js";
import {
  bookingDraftSchema,
  bookingListQuerySchema,
  createBookingSchema,
  customerCompletionSchema,
  transitionSchema,
} from "./booking.schema.js";

const bookingInclude = {
  payment: { select: { status: true, payoutStatus: true, amount: true, paidAt: true, provenance: true, simulatedAt: true } },
  deliveryCycles: { where: { active: true }, select: { id: true, sequence: true, status: true, deliveryAt: true, deadlineAt: true, pausedAt: true, remainingMs: true, version: true } },
} satisfies Prisma.BookingInclude;

function currentUserId(res: Response) {
  return (res.locals.auth as { userId: string }).userId;
}

function validationError(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  throw new HttpError(422, "VALIDATION_FAILED", "Data booking tidak valid.", error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
}

function checkedBookingPrice(sellerPrice: number) {
  try {
    return priceBuyerTotal(sellerPrice);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new HttpError(422, "VALIDATION_FAILED", "Harga layanan dan biaya administrasi melebihi batas nilai yang didukung.", [
        { field: "seller_price", message: "Seller price plus the 5% administration fee must fit PostgreSQL INT columns." },
      ]);
    }
    throw error;
  }
}

function parse<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) validationError(result.error);
  return result.data as T;
}

function statusName(status: BookingStatus) {
  return status[0] + status.slice(1).toLowerCase();
}

function statusValue(status?: string) {
  return status ? status.toUpperCase() as BookingStatus : undefined;
}

function toDto(booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  return {
    id: booking.id,
    customer_user_id: booking.customerId,
    seller_profile_id: booking.sellerId,
    service_id: booking.serviceId,
    service_title: booking.serviceTitle ?? "",
    seller_name: booking.sellerName ?? "",
    estimated_price: booking.price,
    seller_price: booking.price,
    admin_fee: booking.fee,
    buyer_total: booking.total,
    pricing_policy_version: booking.pricingPolicyVersion,
    delivery_mode: (booking.deliveryMode ?? "Remote").toLowerCase(),
    requested_date: booking.scheduledDate?.toISOString().slice(0, 10) ?? null,
    location: booking.location,
    requirements: booking.requirements ?? "",
    description: booking.description ?? "",
    status: statusName(booking.status),
    created_at: booking.createdAt.toISOString(),
    updated_at: booking.updatedAt.toISOString(),
    decline_reason: booking.declineReason,
    revision_policy_snapshot: booking.revisionPolicyHash ? {
      version: booking.revisionPolicyVersion,
      hash: booking.revisionPolicyHash,
      free_revision_count: booking.revisionFreeCount,
      request_window_duration: booking.revisionRequestWindowDuration,
      request_window_unit: booking.revisionRequestWindowUnit,
      request_window_anchor: booking.revisionRequestWindowAnchor,
      terms: booking.revisionTermsSnapshot,
      acknowledged_at: booking.revisionPolicyAcknowledgedAt?.toISOString() ?? null,
    } : null,
    delivered_at: booking.deliveredAt?.toISOString() ?? null,
    completed_at: booking.completedAt?.toISOString() ?? null,
    active_delivery_cycle: booking.deliveryCycles[0] ? {
      id: booking.deliveryCycles[0].id,
      sequence: booking.deliveryCycles[0].sequence,
      status: booking.deliveryCycles[0].status,
      delivered_at: booking.deliveryCycles[0].deliveryAt.toISOString(),
      review_deadline_at: booking.deliveryCycles[0].deadlineAt?.toISOString() ?? null,
      paused_at: booking.deliveryCycles[0].pausedAt?.toISOString() ?? null,
      remaining_review_ms: booking.deliveryCycles[0].remainingMs,
      version: booking.deliveryCycles[0].version,
    } : null,
    payment: booking.payment ? {
      status: booking.payment.status,
      payout_status: booking.payment.payoutStatus,
      amount: booking.payment.amount,
      paid_at: booking.payment.paidAt?.toISOString() ?? null,
      provenance: booking.payment.provenance,
      simulated_at: booking.payment.simulatedAt?.toISOString() ?? null,
    } : null,
  };
}

async function validateBookableService(serviceId: string, userId: string) {
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      active: true,
      isHidden: false,
      status: "OPEN",
      moderationStatus: "APPROVED",
      category: { is: { isActive: true } },
      seller: { is: { verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } } },
    },
    select: {
      id: true, title: true, price: true, delivery: true, status: true,
      revisionPolicyVersion: true, revisionFreeCount: true, revisionRequestWindowHours: true, revisionTerms: true,
      sellerId: true,
      seller: { select: { displayName: true, userId: true } },
    },
  });
  if (!service) throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Layanan tidak tersedia untuk menerima pesanan.");
  if (!revisionPolicyDto(service)) throw new HttpError(409, "REVISION_POLICY_NOT_CONFIGURED", "Seller belum mengatur ketentuan revisi untuk layanan ini.");
  if (service.seller.userId === userId) throw new HttpError(422, "SELF_BOOKING", "Anda tidak dapat memesan layanan milik sendiri.");
  if (!Number.isSafeInteger(service.price) || service.price < 0) {
    throw new HttpError(503, "CATALOG_UNAVAILABLE", "Harga layanan tidak dapat diverifikasi saat ini.");
  }
  if (service.delivery !== "Remote" && service.delivery !== "Onsite") {
    throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Mode layanan belum valid untuk menerima pesanan.");
  }
  return service;
}

function validateModeBrief(delivery: string, input: { requested_date: string | null; location: string | null }) {
  if (delivery === "Onsite" && !input.requested_date) {
    throw new HttpError(422, "VALIDATION_FAILED", "Tanggal wajib diisi untuk layanan onsite.", [{ field: "requested_date", message: "Tanggal wajib diisi untuk layanan onsite." }]);
  }
  if (delivery === "Onsite" && !input.location) {
    throw new HttpError(422, "VALIDATION_FAILED", "Lokasi wajib diisi untuk layanan onsite.", [{ field: "location", message: "Lokasi wajib diisi untuk layanan onsite." }]);
  }
  return delivery === "Onsite" ? input.location : null;
}

export async function validateBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const serviceId = typeof req.params.service_id === "string" ? req.params.service_id : "";
  if (!serviceId) throw new HttpError(404, "SERVICE_NOT_BOOKABLE", "Layanan tidak tersedia untuk menerima pesanan.");
  const input = parse<ReturnType<typeof bookingDraftSchema.parse>>(bookingDraftSchema, req.body);
  const service = await validateBookableService(serviceId, userId);
  const price = checkedBookingPrice(service.price);
  validateModeBrief(service.delivery, input);
  res.status(200).json({ data: {
    valid: true,
    service_id: service.id,
    estimated_price: service.price,
    seller_price: service.price,
    admin_fee: price.adminFee,
    buyer_total: price.buyerTotal,
    pricing_policy_version: price.pricingPolicyVersion,
    delivery_mode: service.delivery.toLowerCase(),
    revision_policy: revisionPolicyDto(service),
  } });
}

export async function createBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const input = parse<ReturnType<typeof createBookingSchema.parse>>(createBookingSchema, req.body);
  const service = await validateBookableService(input.service_id, userId);
  // Reject impossible PostgreSQL INT totals before opening the booking write transaction.
  checkedBookingPrice(service.price);
  const privateLocation = validateModeBrief(service.delivery, input);
  const requestedDate = input.requested_date ? new Date(`${input.requested_date}T00:00:00.000Z`) : null;

  const booking = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${service.id} FOR UPDATE`;
    const currentService = await tx.service.findFirst({
      where: {
        id: service.id,
        active: true,
        isHidden: false,
        status: "OPEN",
        moderationStatus: "APPROVED",
        category: { is: { isActive: true } },
        seller: { is: { verificationStatus: "APPROVED", user: { is: { accountStatus: "ACTIVE" } } } },
      },
      select: {
        id: true, title: true, price: true, delivery: true, sellerId: true,
        revisionPolicyVersion: true, revisionFreeCount: true, revisionRequestWindowHours: true, revisionTerms: true,
        seller: { select: { displayName: true, userId: true } },
      },
    });
    if (!currentService || currentService.seller.userId === userId || currentService.delivery !== service.delivery) {
      throw new HttpError(409, "SERVICE_NOT_BOOKABLE", "Layanan berubah dan tidak dapat menerima pesanan.");
    }
    const priceSnapshot = checkedBookingPrice(currentService.price);
    const currentPolicy = revisionPolicyDto(currentService);
    const currentPolicyHash = revisionPolicyHash(currentService);
    if (!currentPolicy || !currentPolicyHash) throw new HttpError(409, "REVISION_POLICY_NOT_CONFIGURED", "Seller belum mengatur ketentuan revisi untuk layanan ini.");
    if (input.revision_policy_hash !== currentPolicyHash || input.revision_policy_acknowledged !== true) {
      throw new HttpError(409, "REVISION_POLICY_CHANGED", "Ketentuan revisi berubah. Tinjau kembali dan setujui sebelum mengirim booking.");
    }
    const created = await tx.booking.create({
      data: {
        serviceId: currentService.id,
        customerId: userId,
        sellerId: currentService.sellerId,
        serviceTitle: currentService.title,
        sellerName: currentService.seller.displayName,
        deliveryMode: currentService.delivery,
        requirements: input.requirements,
        description: input.description,
        location: privateLocation,
        scheduledDate: requestedDate,
        status: "REQUESTED",
        price: priceSnapshot.sellerPrice,
        fee: priceSnapshot.adminFee,
        total: priceSnapshot.buyerTotal,
        pricingPolicyVersion: priceSnapshot.pricingPolicyVersion,
        revisionPolicyVersion: currentService.revisionPolicyVersion,
        revisionPolicyHash: currentPolicyHash,
        revisionFreeCount: currentService.revisionFreeCount,
        revisionRequestWindowDuration: currentService.revisionRequestWindowHours,
        revisionRequestWindowUnit: REVISION_WINDOW_UNIT,
        revisionRequestWindowAnchor: REVISION_WINDOW_ANCHOR,
        revisionTermsSnapshot: currentService.revisionTerms,
        revisionPolicyAcknowledgedAt: new Date(),
      },
      include: bookingInclude,
    });
    await tx.bookingStatusEvent.create({ data: {
      bookingId: created.id,
      fromStatus: null,
      toStatus: "REQUESTED",
      actorUserId: userId,
      source: "CUSTOMER",
    } });
    await enqueueInAppNotices(tx, `booking:requested:${created.id}`, "BOOKING_REQUESTED", [{
      userId: currentService.seller.userId, type: "BOOKING_UPDATE", title: "Pesanan baru",
      body: `${currentService.title} menerima permintaan pesanan baru.`, refId: created.id,
    }]);
    return created;
  });
  res.status(201).json({ data: toDto(booking) });
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const [date, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(date ?? "");
    if (!date || !id || !Number.isFinite(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor daftar pesanan tidak valid.");
  }
}

async function listBookings(req: Request, res: Response, owner: { customerId: string } | { sellerId: string }) {
  const query = parse<ReturnType<typeof bookingListQuerySchema.parse>>(bookingListQuerySchema, req.query);
  const cursor = decodeCursor(query.cursor);
  const where: Prisma.BookingWhereInput = {
    ...owner,
    ...(query.status ? { status: statusValue(query.status) } : {}),
    ...(cursor ? { OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] } : {}),
  };
  const countWhere = { ...owner, ...(query.status ? { status: statusValue(query.status) } : {}) } as Prisma.BookingWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.booking.findMany({ where, include: bookingInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1 }),
    prisma.booking.count({ where: countWhere }),
  ]);
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows.at(-1);
  const nextCursor = hasMore && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") : null;
  res.status(200).json({ data: pageRows.map(toDto), page: { next_cursor: nextCursor, has_more: hasMore }, total });
}

export async function listCustomerBookings(req: Request, res: Response) {
  await listBookings(req, res, { customerId: currentUserId(res) });
}

export async function listSellerBookings(req: Request, res: Response) {
  await listBookings(req, res, { sellerId: res.locals.sellerProfileId as string });
}

async function getOwnedBooking(id: string, where: Prisma.BookingWhereInput) {
  const booking = await prisma.booking.findFirst({ where: { id, ...where }, include: bookingInclude });
  if (!booking) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
  return booking;
}

export async function getCustomerBooking(req: Request, res: Response) {
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const booking = await getOwnedBooking(id, { customerId: currentUserId(res) });
  res.status(200).json({ data: toDto(booking) });
}

export async function getSellerBooking(req: Request, res: Response) {
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const booking = await getOwnedBooking(id, { sellerId: res.locals.sellerProfileId as string });
  res.status(200).json({ data: toDto(booking) });
}

async function sellerTransition(req: Request, res: Response, action: "accept" | "decline" | "deliver") {
  const sellerId = res.locals.sellerProfileId as string;
  const userId = currentUserId(res);
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const input = parse<ReturnType<typeof transitionSchema.parse>>(transitionSchema, req.body);
  const expected = statusValue(input.expected_status)!;
  const toStatus: BookingStatus = action === "accept" ? "ACCEPTED" : action === "decline" ? "DECLINED" : "DELIVERED";
  const validExpected: BookingStatus = action === "deliver" ? "PAID" : "REQUESTED";
  if (expected !== validExpected) throw new HttpError(422, "VALIDATION_FAILED", "expected_status tidak sesuai dengan tindakan.");
  if (action === "decline" && input.reason && input.reason.length < 3) {
    throw new HttpError(422, "VALIDATION_FAILED", "Alasan penolakan harus berisi minimal 3 karakter.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, id);
    const existing = await tx.booking.findFirst({ where: { id, sellerId }, include: bookingInclude });
    if (!existing) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    const activeDispute = await tx.dispute.findFirst({ where: { bookingId: id, status: { not: "DECIDED" } }, select: { id: true } });
    if (activeDispute) throw new HttpError(409, "ACTIVE_DISPUTE_BLOCKS_BOOKING", "Tindakan pesanan ditahan selama sengketa masih aktif.");
    if (existing.status !== validExpected) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah atau tindakan ini tidak tersedia.");
    const demoPaid = process.env.NODE_ENV !== "production" && process.env.PAYMENT_DEMO_MODE === "true"
      && existing.payment?.status === "DEMO_PAID" && existing.payment.provenance === "DEMO_SIMULATION";
    if (action === "deliver" && existing.payment?.status !== "PAID" && !demoPaid) {
      throw new HttpError(409, "PAYMENT_NOT_CONFIRMED", "Pesanan belum memiliki konfirmasi pembayaran tepercaya.");
    }
    const transitionAt = new Date();
    const won = await tx.booking.updateMany({
      where: { id, sellerId, status: validExpected },
      data: {
        status: toStatus,
        declineReason: action === "decline" ? input.reason ?? null : null,
        ...(action === "deliver" ? { deliveredAt: transitionAt } : {}),
      },
    });
    if (won.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
    const event = await tx.bookingStatusEvent.create({ data: {
      bookingId: id,
      fromStatus: validExpected,
      toStatus,
      actorUserId: userId,
      source: "SELLER",
    } });
    let cycleId: string | undefined;
    if (action === "deliver") {
      const cycle = await createDeliveryCycle(tx, id, transitionAt);
      cycleId = cycle.id;
      // A cancellation request may already be pending while the booking is PAID.
      await syncDeliveryCycleBlockers(tx, id, transitionAt, userId);
    }
    await enqueueInAppNotices(tx, cycleId ? `delivery-cycle:${cycleId}:delivered:${event.id}` : `booking:${action}:${id}:${transitionAt.toISOString()}`, `BOOKING_${action.toUpperCase()}`, [{
      userId: existing.customerId,
      type: "BOOKING_UPDATE",
      title: action === "accept" ? "Pesanan diterima" : action === "decline" ? "Pesanan ditolak" : "Hasil pesanan dikirim",
      body: action === "decline" ? input.reason ?? "Seller menolak pesanan." : null,
      refId: id,
    }], cycleId);
    return tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
  });
  res.status(200).json({ data: toDto(updated) });
}

export async function acceptBooking(req: Request, res: Response) { await sellerTransition(req, res, "accept"); }
export async function declineBooking(req: Request, res: Response) { await sellerTransition(req, res, "decline"); }
export async function deliverBooking(req: Request, res: Response) { await sellerTransition(req, res, "deliver"); }

export async function completeBooking(req: Request, res: Response) {
  const userId = currentUserId(res);
  const id = typeof req.params.booking_id === "string" ? req.params.booking_id : "";
  const input = parse<ReturnType<typeof customerCompletionSchema.parse>>(customerCompletionSchema, req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const owned = await tx.booking.findFirst({ where: { id, customerId: userId }, select: { id: true } });
    if (!owned) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    const fingerprint = createHash("sha256").update(JSON.stringify({ expected_status: input.expected_status })).digest("hex");
    const eligibility = await checkCompletionEligibility(tx, id, "CUSTOMER", new Date());
    if (!eligibility.eligible) {
      if (eligibility.reason === "ACTIVE_BLOCKER") throw new HttpError(409, "BOOKING_COMPLETION_BLOCKED", "Pesanan tidak dapat diselesaikan selama ada proses yang masih aktif.");
      if (eligibility.reason === "LEGACY_REVIEW_REQUIRED") throw new HttpError(409, "LEGACY_BOOKING_REVIEW_REQUIRED", "Penyelesaian pesanan lama memerlukan pemeriksaan admin berdasarkan bukti yang tersedia.");
      if (eligibility.reason === "BOOKING_STATE") {
        const completed = await tx.booking.findFirst({ where: { id, customerId: userId, status: "COMPLETED" }, include: bookingInclude });
        if (completed) {
          const latest = await tx.deliveryCycle.findFirst({ where: { bookingId: id }, orderBy: { sequence: "desc" }, select: { id: true } });
          const receipt = latest ? await tx.deliveryCycleCompletionReceipt.findFirst({ where: { deliveryCycleId: latest.id, principalId: userId, operation: "CUSTOMER_COMPLETE" } }) : null;
          if (receipt && receipt.requestFingerprint === fingerprint) return completed;
        }
        throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
      }
      throw new HttpError(409, "BOOKING_TIMER_INVALID", "Timer peninjauan pesanan tidak valid. Pesanan ditahan untuk pemeriksaan.");
    }
    const existing = await tx.booking.findFirst({ where: { id, customerId: userId }, include: bookingInclude });
    if (!existing) throw new HttpError(404, "BOOKING_NOT_FOUND", "Pesanan tidak ditemukan.");
    if (existing.status === "COMPLETED") {
      const receipt = await tx.deliveryCycleCompletionReceipt.findFirst({ where: { deliveryCycleId: eligibility.cycle.id, principalId: userId, operation: "CUSTOMER_COMPLETE" } });
      if (receipt && receipt.requestFingerprint === fingerprint) return existing;
      throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Pesanan sudah selesai atau permintaan penyelesaiannya berbeda.");
    }
    if (existing.status !== "DELIVERED" || input.expected_status !== statusName(existing.status)) {
      throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Pesanan hanya dapat dikonfirmasi selesai setelah hasil dikirim seller.");
    }
    const transitionAt = new Date();
    const won = await tx.booking.updateMany({
      where: { id, customerId: userId, status: "DELIVERED" },
      data: { status: "COMPLETED", completedAt: transitionAt },
    });
    if (won.count !== 1) throw new HttpError(409, "BOOKING_STATE_CONFLICT", "Status pesanan sudah berubah.");
    if (existing.payment?.status === "PAID" && existing.payment.payoutStatus === "HELD") {
      await tx.payment.update({ where: { bookingId: id }, data: { payoutStatus: "ELIGIBLE" } });
    }
    const event = await tx.bookingStatusEvent.create({ data: {
      bookingId: id,
      fromStatus: "DELIVERED",
      toStatus: "COMPLETED",
      actorUserId: userId,
      source: "CUSTOMER",
    } });
    await tx.deliveryCycleCompletionReceipt.create({ data: { deliveryCycleId: eligibility.cycle.id, principalId: userId, operation: "CUSTOMER_COMPLETE", requestFingerprint: fingerprint, transitionEventId: event.id } });
    await expireUnusedRevisionQuota(tx, id, eligibility.cycle.id, transitionAt);
    await closeActiveDeliveryCycle(tx, id, transitionAt, "COMPLETED", userId);
    await enqueueInAppNotices(tx, `delivery-cycle:${eligibility.cycle.id}:completed:${event.id}`, "BOOKING_COMPLETED", [{
      userId: (await tx.sellerProfile.findUniqueOrThrow({ where: { id: existing.sellerId }, select: { userId: true } })).userId,
      type: "BOOKING_UPDATE",
      title: "Pesanan dikonfirmasi selesai",
      refId: id,
    }], eligibility.cycle.id);
    return tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
  });
  res.status(200).json({ data: toDto(updated) });
}
