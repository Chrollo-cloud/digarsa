import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "../src/modules/bookings/delivery-cycle.ts";
import { reserveDisputeRevision } from "../src/modules/bookings/dispute-revision-authorization.ts";
import { cancelBookingFromDispute } from "../src/modules/bookings/dispute-actions.ts";
import { checkCompletionEligibility } from "../src/modules/bookings/completion-eligibility.ts";

const databaseUrl = process.env.DIRECT_URL_CONCURRENCY_TEST;
assert.ok(databaseUrl, "DIRECT_URL_CONCURRENCY_TEST must be present");
const parsed = new URL(databaseUrl);
assert.equal(parsed.hostname, "localhost");
assert.equal(parsed.port || "5432", "5432");
assert.equal(decodeURIComponent(parsed.pathname.slice(1)), "digarsa_concurrency_test");
assert.equal(decodeURIComponent(parsed.username), "digarsa_concurrency_test_user");
assert.equal(parsed.searchParams.get("schema") || "public", "public");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }) });
after(async () => db.$disconnect());
const concurrentClientA = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }) });
const concurrentClientB = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 }) });
after(async () => { await concurrentClientA.$disconnect(); await concurrentClientB.$disconnect(); });

class Rollback extends Error { constructor(readonly value?: unknown) { super("EXPECTED_FIXTURE_ROLLBACK"); } }
async function rollback<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  try {
    await db.$transaction(async (tx) => { const value = await fn(tx); throw new Rollback(value); }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof Rollback) return error.value as T;
    throw error;
  }
  throw new Error("Fixture transaction unexpectedly committed");
}
async function expectConstraintFailure(fn: (tx: any) => Promise<void>) {
  let actual: any;
  try {
    await db.$transaction(async (tx) => { await fn(tx); throw new Error("EXPECTED_CONSTRAINT_FAILURE_DID_NOT_OCCUR"); }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof Error && error.message === "EXPECTED_CONSTRAINT_FAILURE_DID_NOT_OCCUR") throw error;
    actual = error;
  }
  assert.ok(actual, "expected a database constraint/trigger failure");
  return actual;
}

async function fixture(tx: any, at = new Date("2026-11-14T12:00:00.123Z")) {
  const suffix = randomUUID();
  const customerId = randomUUID(); const sellerUserId = randomUUID(); const sellerId = randomUUID();
  const category = await tx.category.create({ data: { name: `Dispute fixture ${suffix}`, slug: `dispute-fixture-${suffix}` } });
  await tx.user.create({ data: { id: customerId, email: `dispute-customer-${suffix}@test.invalid`, passwordHash: "fixture-hash", name: "Dispute fixture customer" } });
  await tx.user.create({ data: { id: sellerUserId, email: `dispute-seller-${suffix}@test.invalid`, passwordHash: "fixture-hash", name: "Dispute fixture seller" } });
  await tx.sellerProfile.create({ data: { id: sellerId, userId: sellerUserId, displayName: "Dispute fixture seller", region: "test" } });
  const service = await tx.service.create({ data: { id: randomUUID(), sellerId, categoryId: category.id, title: "Dispute fixture", description: "Disposable lifecycle fixture", price: 1000, region: "test", revisionFreeCount: 2, revisionRequestWindowHours: 48, revisionTerms: "fixture", moderationStatus: "APPROVED" } });
  const booking = await tx.booking.create({ data: { id: randomUUID(), serviceId: service.id, customerId, sellerId, status: "DELIVERED", price: 1000, fee: 0, total: 1000, deliveredAt: at, revisionPolicyVersion: 1, revisionPolicyHash: "b".repeat(64), revisionFreeCount: 2, revisionRequestWindowDuration: 48, revisionRequestWindowUnit: "ELAPSED_HOURS", revisionRequestWindowAnchor: "LATEST_SERVER_PERSISTED_DELIVERY", revisionTermsSnapshot: "fixture", revisionPolicyAcknowledgedAt: at } });
  const cycle = await createDeliveryCycle(tx, booking.id, at);
  const dispute = await tx.dispute.create({ data: { id: randomUUID(), bookingId: booking.id, deliveryCycleId: cycle.id, createdById: customerId, category: "DELIVERY_ISSUE", description: "A sufficiently detailed fixture dispute description.", status: "OPEN", evidenceRetainUntil: new Date("2028-11-14T12:00:00.000Z") } });
  return { at, customerId, sellerUserId, booking, cycle, dispute };
}

test("PostgreSQL enforces one active dispute per booking", async () => {
  const error = await expectConstraintFailure(async (tx) => {
    const f = await fixture(tx);
    await tx.dispute.create({ data: { bookingId: f.booking.id, deliveryCycleId: f.cycle.id, createdById: f.customerId, category: "OTHER", description: "Second active fixture dispute description.", status: "OPEN", evidenceRetainUntil: new Date("2028-11-14T12:00:00Z") } });
  });
  assert.equal(error.code, "P2002");
});

test("PostgreSQL persists UTC clarification deadline", async () => {
  await rollback(async (tx) => {
    const f = await fixture(tx); const requestedAt = f.at;
    const clarification = await tx.disputeClarification.create({ data: { disputeId: f.dispute.id, recipient: "CUSTOMER", recipientUserId: f.customerId, requestedById: f.sellerUserId, question: "Please provide the requested clarification details.", requestedAt, responseDueAt: new Date(requestedAt.getTime() + 48 * 60 * 60 * 1000) } });
    assert.equal(clarification.responseDueAt.toISOString(), "2026-11-16T12:00:00.123Z");
  });
});

test("PostgreSQL enforces one appeal per party per dispute", async () => {
  const error = await expectConstraintFailure(async (tx) => {
    const f = await fixture(tx); const deadline = new Date(f.at.getTime() + 48 * 60 * 60 * 1000);
    const common = { disputeId: f.dispute.id, appellantId: f.customerId, submittedAt: f.at, submissionDeadlineAt: deadline };
    await tx.disputeAppeal.create({ data: { ...common, reason: "A sufficiently detailed appeal reason." } });
    await tx.disputeAppeal.create({ data: { ...common, reason: "Duplicate appeal fixture reason." } });
  });
  assert.equal(error.code, "P2002");
});

test("PostgreSQL dispute history is append-only", async () => {
  const error = await expectConstraintFailure(async (tx) => {
    const f = await fixture(tx);
    const event = await tx.disputeEvent.create({ data: { disputeId: f.dispute.id, actorUserId: f.customerId, eventType: "FIXTURE_CREATED", fromStatus: null, toStatus: "OPEN", reason: "fixture", payload: {}, occurredAt: f.at } });
    await tx.disputeEvent.update({ where: { id: event.id }, data: { reason: "mutated" } });
  });
  assert.match(String(error.message), /append-only/i);
});

test("PostgreSQL dispute and appeal blockers share one pause interval", async () => {
  await rollback(async (tx) => {
    const f = await fixture(tx);
    const appeal = await tx.disputeAppeal.create({ data: { disputeId: f.dispute.id, appellantId: f.customerId, reason: "A sufficiently detailed appeal reason.", submittedAt: f.at, submissionDeadlineAt: new Date(f.at.getTime() + 48 * 60 * 60 * 1000) } });
    const revision = await tx.revisionRequest.create({ data: { id: randomUUID(), bookingId: f.booking.id, deliveryCycleId: f.cycle.id, requestText: "Fixture revision", status: "REQUESTED", requestedAt: f.at, sellerResponseDeadlineAt: new Date(f.at.getTime() + 48 * 60 * 60 * 1000) } });
    await tx.revisionEscalationRequest.create({ data: { revisionId: revision.id, bookingId: f.booking.id, trigger: "SELLER_RESPONSE_OVERDUE", requesterId: f.customerId, reason: "Fixture assistance", status: "OPEN", version: 1, createdAt: f.at, updatedAt: f.at, slaDueAt: new Date(f.at.getTime() + 48 * 60 * 60 * 1000) } });
    const pausedAt = new Date(f.at.getTime() + 10_000);
    await syncDeliveryCycleBlockers(tx, f.booking.id, pausedAt, f.customerId);
    await syncDeliveryCycleBlockers(tx, f.booking.id, new Date(pausedAt.getTime() + 5_000), f.customerId);
    const cycle = await tx.deliveryCycle.findUniqueOrThrow({ where: { id: f.cycle.id }, include: { pauseIntervals: true } });
    assert.equal(cycle.status, "REVIEW_PAUSED");
    assert.equal(cycle.pauseIntervals.length, 1);
    assert.equal(cycle.pauseIntervals[0]!.blockerType, "REVISION", "the global interval records the first deterministic active blocker while all blockers coexist");
    assert.equal(cycle.remainingMs, 72 * 60 * 60 * 1000 - 10_000);
    assert.ok(appeal.id);
  });
});

test("PostgreSQL separate connections serialize competing dispute decisions", async () => {
  let f!: Awaited<ReturnType<typeof fixture>>;
  let adminId = "";
  await db.$transaction(async (tx) => {
    f = await fixture(tx, new Date(Date.now() - 5000));
    const admin = await tx.user.create({ data: { email: `dispute-concurrency-admin-${randomUUID()}@test.invalid`, passwordHash: "test-only", name: "Dispute concurrency admin", role: "ADMIN" } });
    adminId = admin.id;
  }, { timeout: 20000 });

  const pids = await Promise.all([
    concurrentClientA.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
    concurrentClientB.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
  ]);
  assert.notEqual(pids[0]![0]!.pid, pids[1]![0]!.pid, "independent clients must use distinct PostgreSQL sessions");

  let firstHasLock!: () => void;
  let releaseFirst!: () => void;
  let secondIsRacing!: () => void;
  const firstReady = new Promise<void>((resolve) => { firstHasLock = resolve; });
  const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const secondReady = new Promise<void>((resolve) => { secondIsRacing = resolve; });
  const first = concurrentClientA.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${f.booking.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Dispute" WHERE "id" = ${f.dispute.id} FOR UPDATE`;
    firstHasLock();
    await held;
    const now = new Date();
    const changed = await tx.dispute.updateMany({ where: { id: f.dispute.id, status: "OPEN", version: 1 }, data: { status: "DECIDED", version: 2, decisionAt: now, decisionById: adminId, decisionOutcome: "CONTINUE_BOOKING", decisionReason: "Connection A wins serialized decision test", permittedNextAction: "Continue", updatedAt: now } });
    if (changed.count !== 1) return "CONFLICT";
    await tx.disputeEvent.create({ data: { disputeId: f.dispute.id, actorUserId: adminId, eventType: "DECIDED", fromStatus: "OPEN", toStatus: "DECIDED", reason: "Connection A decision", payload: {}, occurredAt: now } });
    return "COMMITTED";
  }, { timeout: 20000 });
  await firstReady;
  const second = concurrentClientB.$transaction(async (tx) => {
    secondIsRacing();
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${f.booking.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Dispute" WHERE "id" = ${f.dispute.id} FOR UPDATE`;
    const current = await tx.dispute.findUniqueOrThrow({ where: { id: f.dispute.id }, select: { status: true, version: true } });
    if (current.status !== "OPEN" || current.version !== 1) return "CONFLICT";
    return "UNEXPECTEDLY_OPEN";
  }, { timeout: 20000 });
  await secondReady;
  await new Promise((resolve) => setTimeout(resolve, 100));
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["COMMITTED", "CONFLICT"]);
  assert.equal(await db.disputeEvent.count({ where: { disputeId: f.dispute.id, eventType: "DECIDED" } }), 1);
});

test("PostgreSQL separate sessions consume one dispute revision authorization and reserve quota once", async () => {
  let f!: Awaited<ReturnType<typeof fixture>>;
  let adminId = "";
  await db.$transaction(async (tx) => {
    f = await fixture(tx, new Date(Date.now() - 5000));
    const admin = await tx.user.create({ data: { email: `revision-race-admin-${randomUUID()}@test.invalid`, passwordHash: "test-only", name: "Revision race admin", role: "ADMIN" } });
    adminId = admin.id;
    const now = new Date();
    await tx.dispute.update({ where: { id: f.dispute.id }, data: { status: "DECIDED", version: 2, decisionAt: now, decisionById: adminId, decisionOutcome: "RETURN_TO_REVISION", decisionReason: "Authorize one revision", permittedNextAction: "Request within existing policy", updatedAt: now } });
    await tx.disputeEvent.create({ data: { disputeId: f.dispute.id, actorUserId: adminId, eventType: "DECIDED", fromStatus: "OPEN", toStatus: "DECIDED", reason: "Authorize one revision", payload: {}, occurredAt: now } });
    await tx.disputeRevisionAuthorization.create({ data: { disputeId: f.dispute.id, bookingId: f.booking.id, deliveryCycleId: f.cycle.id } });
  }, { timeout: 20000 });

  const pids = await Promise.all([
    concurrentClientA.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
    concurrentClientB.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
  ]);
  assert.notEqual(pids[0]![0]!.pid, pids[1]![0]!.pid, "revision contenders must be separate PostgreSQL sessions");

  let firstHasLock!: () => void;
  let secondRacing!: () => void;
  let releaseFirst!: () => void;
  const firstReady = new Promise<void>((resolve) => { firstHasLock = resolve; });
  const secondReady = new Promise<void>((resolve) => { secondRacing = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const attempt = async (client: PrismaClient, isFirst: boolean) => client.$transaction(async (tx) => {
    if (!isFirst) secondRacing();
    await lockBookingAndActiveCycle(tx, f.booking.id);
    if (isFirst) firstHasLock();
    const active = await tx.revisionRequest.findFirst({ where: { bookingId: f.booking.id, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } }, select: { id: true } });
    if (active) return "CONFLICT";
    if (isFirst) await holdFirst;
    const now = new Date();
    const revision = await tx.revisionRequest.create({ data: { bookingId: f.booking.id, deliveryCycleId: f.cycle.id, requestText: "Distinct-session authorized revision", status: "REQUESTED", requestedAt: now, sellerResponseDeadlineAt: new Date(now.getTime() + 48 * 60 * 60 * 1000) } });
    const authorizationId = await reserveDisputeRevision(tx, { bookingId: f.booking.id, cycleId: f.cycle.id, revisionId: revision.id, generation: revision.reservationGeneration, actorUserId: f.customerId, now });
    assert.ok(authorizationId);
    await tx.revisionEvent.create({ data: { revisionId: revision.id, actorUserId: f.customerId, eventType: "REQUESTED", fromStatus: null, toStatus: "REQUESTED", payload: { dispute_authorization_id: authorizationId }, occurredAt: now } });
    return "CREATED";
  }, { timeout: 20000 });

  const first = attempt(concurrentClientA, true);
  await firstReady;
  const second = attempt(concurrentClientB, false);
  await secondReady;
  await new Promise((resolve) => setTimeout(resolve, 100));
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["CREATED", "CONFLICT"]);
  const revisions = await db.revisionRequest.findMany({ where: { bookingId: f.booking.id } });
  assert.equal(revisions.length, 1);
  const authorization = await db.disputeRevisionAuthorization.findFirstOrThrow({ where: { disputeId: f.dispute.id } });
  assert.equal(authorization.status, "USED");
  assert.equal(authorization.consumedRevisionId, revisions[0]!.id);
  assert.equal(await db.disputeRevisionAuthorization.count({ where: { bookingId: f.booking.id, status: "AVAILABLE" } }), 0);
  const ledger = await db.revisionQuotaLedger.findMany({ where: { bookingId: f.booking.id } });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]!.operation, "RESERVE");
  assert.equal(ledger[0]!.availableDelta, -1);
  assert.equal(ledger[0]!.reservedDelta, 1);
  assert.equal(ledger[0]!.consumedDelta, 0);
});

test("PostgreSQL separate sessions serialize dispute cancellation against completion", async () => {
  let f!: Awaited<ReturnType<typeof fixture>>;
  let adminId = "";
  await db.$transaction(async (tx) => {
    f = await fixture(tx, new Date(Date.now() - 5000));
    const admin = await tx.user.create({ data: { email: `cancel-race-admin-${randomUUID()}@test.invalid`, passwordHash: "test-only", name: "Cancellation race admin", role: "ADMIN" } });
    adminId = admin.id;
    await tx.payment.create({ data: { bookingId: f.booking.id, orderId: `cancel-race-${randomUUID()}`, amount: f.booking.total, status: "PAID", payoutStatus: "HELD", paidAt: f.at } });
    await syncDeliveryCycleBlockers(tx, f.booking.id, new Date(f.at.getTime() + 1000), f.customerId);
  }, { timeout: 20000 });
  const paymentBefore = await db.payment.findUniqueOrThrow({ where: { bookingId: f.booking.id } });
  const pids = await Promise.all([
    concurrentClientA.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
    concurrentClientB.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
  ]);
  assert.notEqual(pids[0]![0]!.pid, pids[1]![0]!.pid, "cancellation and completion contenders must be separate PostgreSQL sessions");

  let cancellationHasLock!: () => void;
  let completionRacing!: () => void;
  let releaseCancellation!: () => void;
  const cancellationReady = new Promise<void>((resolve) => { cancellationHasLock = resolve; });
  const completionReady = new Promise<void>((resolve) => { completionRacing = resolve; });
  const holdCancellation = new Promise<void>((resolve) => { releaseCancellation = resolve; });
  const cancellation = concurrentClientA.$transaction(async (tx) => {
    await lockBookingAndActiveCycle(tx, f.booking.id);
    await tx.$queryRaw`SELECT "id" FROM "Dispute" WHERE "id" = ${f.dispute.id} FOR UPDATE`;
    cancellationHasLock();
    await holdCancellation;
    const now = new Date();
    await cancelBookingFromDispute(tx, { bookingId: f.booking.id, actorId: adminId, reason: "Concurrent lifecycle cancellation test", now });
    await tx.dispute.update({ where: { id: f.dispute.id }, data: { status: "DECIDED", version: 2, decisionAt: now, decisionById: adminId, decisionOutcome: "CANCEL_BOOKING", decisionReason: "Concurrent lifecycle cancellation test", permittedNextAction: "Cancellation applied", updatedAt: now } });
    await tx.disputeEvent.create({ data: { disputeId: f.dispute.id, actorUserId: adminId, eventType: "DECIDED", fromStatus: "OPEN", toStatus: "DECIDED", reason: "Concurrent lifecycle cancellation test", payload: { outcome: "CANCEL_BOOKING" }, occurredAt: now } });
    return "CANCELLED";
  }, { timeout: 20000 });
  await cancellationReady;
  const completion = concurrentClientB.$transaction(async (tx) => {
    completionRacing();
    const eligibility = await checkCompletionEligibility(tx, f.booking.id, "CUSTOMER", new Date());
    return eligibility.eligible ? "COMPLETED" : `BLOCKED:${eligibility.reason}`;
  }, { timeout: 20000 });
  await completionReady;
  await new Promise((resolve) => setTimeout(resolve, 100));
  releaseCancellation();
  const [cancelResult, completionResult] = await Promise.all([cancellation, completion]);
  assert.equal(cancelResult, "CANCELLED");
  assert.ok(completionResult === "BLOCKED:BOOKING_STATE" || completionResult === "BLOCKED:ACTIVE_BLOCKER");
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: f.booking.id }, select: { status: true } })).status, "CANCELLED");
  assert.equal(await db.bookingStatusEvent.count({ where: { bookingId: f.booking.id, toStatus: "CANCELLED", source: "ADMIN_DISPUTE_DECISION" } }), 1);
  assert.equal(await db.bookingStatusEvent.count({ where: { bookingId: f.booking.id, toStatus: "COMPLETED" } }), 0);
  assert.equal(await db.disputeEvent.count({ where: { disputeId: f.dispute.id, eventType: "DECIDED" } }), 1);
  const cycle = await db.deliveryCycle.findFirstOrThrow({ where: { bookingId: f.booking.id } });
  assert.equal(cycle.active, false);
  assert.equal(cycle.status, "CANCELLED");
  assert.equal(await db.deliveryCycleJob.count({ where: { deliveryCycleId: cycle.id, status: "CANCELLED" } }), 1);
  const paymentAfter = await db.payment.findUniqueOrThrow({ where: { bookingId: f.booking.id } });
  assert.deepEqual({ status: paymentAfter.status, payoutStatus: paymentAfter.payoutStatus, amount: paymentAfter.amount, paidAt: paymentAfter.paidAt }, { status: paymentBefore.status, payoutStatus: paymentBefore.payoutStatus, amount: paymentBefore.amount, paidAt: paymentBefore.paidAt });
});
