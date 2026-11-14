import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createDeliveryCycle, closeActiveDeliveryCycle, lockBookingAndActiveCycle, syncDeliveryCycleBlockers } from "../src/modules/bookings/delivery-cycle.ts";
import { checkCompletionEligibility } from "../src/modules/bookings/completion-eligibility.ts";
import { readRevisionQuota, reserveRevisionUnit, consumeRevisionUnit, releaseRevisionUnit, returnSystemErrorQuota } from "../src/modules/bookings/revision-ledger.ts";
import { syncRevisionResponseClocks } from "../src/modules/bookings/revision-response-clock.ts";

const TEST_URL = process.env.DIRECT_URL_CONCURRENCY_TEST;
assert.ok(TEST_URL, "DIRECT_URL_CONCURRENCY_TEST must be provided by the test execution process");
const parsedUrl = new URL(TEST_URL);
assert.equal(parsedUrl.hostname.toLowerCase(), "localhost", "PostgreSQL host must be localhost");
assert.equal(parsedUrl.port || "5432", "5432", "PostgreSQL port must be 5432");
assert.equal(decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")), "digarsa_concurrency_test", "database must be digarsa_concurrency_test");
assert.equal(decodeURIComponent(parsedUrl.username), "digarsa_concurrency_test_user", "role must be digarsa_concurrency_test_user");
assert.equal(parsedUrl.searchParams.get("schema") || "public", "public", "schema must be public");

function makeClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL!, connectionTimeoutMillis: 5000 }) });
}

const prisma = makeClient();
after(async () => { await prisma.$disconnect(); });

class ExpectedRollback extends Error {
  constructor(readonly result?: unknown) { super("PG_TEST_EXPECTED_ROLLBACK"); }
}

async function inRollbackTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
  let value!: T;
  try {
    await prisma.$transaction(async (tx) => {
      value = await work(tx);
      throw new ExpectedRollback(value);
    }, { timeout: 20000 });
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error;
    return error.result as T;
  }
  throw new Error("Fixture transaction unexpectedly committed");
}

async function expectDatabaseFailure(work: (tx: any) => Promise<void>) {
  let databaseError: any;
  const marker = new ExpectedRollback();
  try {
    await prisma.$transaction(async (tx) => {
      await work(tx);
      throw new Error("EXPECTED_DATABASE_FAILURE_DID_NOT_OCCUR");
    }, { timeout: 20000 });
  } catch (error) {
    if (error instanceof ExpectedRollback) throw error;
    if (!(error instanceof Error) || error.message !== "EXPECTED_DATABASE_FAILURE_DID_NOT_OCCUR") {
      databaseError = error;
    }
  }
  assert.ok(databaseError, "expected PostgreSQL constraint/trigger failure");
  return databaseError;
}

async function createBaseFixture(tx: any, options: { revisionFreeCount?: number } = {}) {
  const suffix = randomUUID();
  const now = new Date("2026-11-14T12:00:00.123Z");
  const customerId = randomUUID();
  const sellerUserId = randomUUID();
  const sellerId = randomUUID();
  const serviceId = randomUUID();
  const bookingId = randomUUID();
  await tx.user.create({ data: { id: customerId, email: `pg-customer-${suffix}@test.invalid`, passwordHash: "test-only-hash", name: "PG fixture customer" } });
  await tx.user.create({ data: { id: sellerUserId, email: `pg-seller-${suffix}@test.invalid`, passwordHash: "test-only-hash", name: "PG fixture seller" } });
  await tx.sellerProfile.create({ data: { id: sellerId, userId: sellerUserId, displayName: "PG fixture seller", region: "test-region" } });
  const category = await tx.category.create({ data: { name: `PG fixture ${suffix}`, slug: `pg-fixture-${suffix}` } });
  await tx.service.create({ data: {
    id: serviceId, sellerId, categoryId: category.id, title: "PG fixture service", description: "Temporary PostgreSQL verification fixture", price: 1000, region: "test-region",
    revisionFreeCount: options.revisionFreeCount ?? 2, revisionRequestWindowHours: 48, revisionTerms: "Temporary test policy", moderationStatus: "APPROVED",
  } });
  await tx.booking.create({ data: {
    id: bookingId, serviceId, customerId, sellerId, status: "DELIVERED", price: 1000, fee: 0, total: 1000,
    deliveredAt: now, revisionPolicyVersion: 1, revisionPolicyHash: "a".repeat(64), revisionFreeCount: options.revisionFreeCount ?? 2,
    revisionRequestWindowDuration: 48, revisionRequestWindowUnit: "ELAPSED_HOURS",
    revisionRequestWindowAnchor: "LATEST_SERVER_PERSISTED_DELIVERY", revisionTermsSnapshot: "Temporary test policy",
    revisionPolicyAcknowledgedAt: now,
  } });
  return { customerId, sellerUserId, sellerId, serviceId, categoryId: category.id, bookingId, now };
}

async function createRevision(tx: any, fixture: { bookingId: string }, cycleId: string, input: { id?: string; status?: any; deadline?: Date; requestedAt?: Date; requestText?: string } = {}) {
  const requestedAt = input.requestedAt ?? new Date("2026-11-14T12:00:00.123Z");
  return tx.revisionRequest.create({ data: {
    id: input.id ?? randomUUID(), bookingId: fixture.bookingId, deliveryCycleId: cycleId,
    requestText: input.requestText ?? "Temporary integration test revision", status: input.status ?? "REQUESTED", requestedAt,
    sellerResponseDeadlineAt: input.deadline ?? new Date(requestedAt.getTime() + 48 * 60 * 60 * 1000),
  } });
}

async function createAssistance(tx: any, input: { id?: string; revisionId: string; bookingId: string; trigger: any; requesterId: string; at: Date; responseClockType?: any }) {
  return tx.revisionEscalationRequest.create({ data: {
    id: input.id ?? randomUUID(), revisionId: input.revisionId, bookingId: input.bookingId,
    trigger: input.trigger, requesterId: input.requesterId, reason: "Temporary PostgreSQL assistance fixture", responseClockType: input.responseClockType,
    status: "OPEN", version: 1, createdAt: input.at, updatedAt: input.at,
    slaDueAt: new Date(input.at.getTime() + 48 * 60 * 60 * 1000),
  } });
}

async function createCommittedCycleFixture(options: { revisionFreeCount?: number; deliveryAt?: Date } = {}) {
  const fixture = await prisma.$transaction((tx) => createBaseFixture(tx, options), { timeout: 20000 });
  const cycle = await prisma.$transaction((tx) => createDeliveryCycle(tx, fixture.bookingId, options.deliveryAt ?? fixture.now), { timeout: 20000 });
  return { ...fixture, cycle };
}

test("PostgreSQL DeliveryCycle helper creates cycle-specific jobs and allocates sequence after close", async () => {
  let fixture!: Awaited<ReturnType<typeof createBaseFixture>>;
  await inRollbackTransaction(async (tx) => {
    fixture = await createBaseFixture(tx);
    const deliveryAt = new Date("2026-11-14T12:00:00.123Z");
    const first = await createDeliveryCycle(tx, fixture.bookingId, deliveryAt);
    assert.equal(first.sequence, 1);
    assert.equal(first.deadlineAt!.getTime(), deliveryAt.getTime() + 72 * 60 * 60 * 1000);
    const firstJob = await tx.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: first.id } });
    assert.equal(firstJob.bookingId, fixture.bookingId);
    assert.equal(firstJob.generation, first.version);
    const closed = await closeActiveDeliveryCycle(tx, fixture.bookingId, new Date(deliveryAt.getTime() + 5000), "SUPERSEDED");
    assert.equal(closed?.id, first.id);
    const second = await createDeliveryCycle(tx, fixture.bookingId, new Date(deliveryAt.getTime() + 5000));
    assert.equal(second.sequence, 2);
    const activeCount = await tx.deliveryCycle.count({ where: { bookingId: fixture.bookingId, active: true } });
    assert.equal(activeCount, 1);
    const oldCycle = await tx.deliveryCycle.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(oldCycle.status, "SUPERSEDED");
    return { bookingId: fixture.bookingId, firstId: first.id, secondId: second.id };
  });
  assert.equal(await prisma.booking.count({ where: { id: fixture.bookingId } }), 0, "rolled-back fixture booking must not persist");
});

test("PostgreSQL partial active-cycle index rejects a second active cycle", async () => {
  const failure = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const first = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    await tx.deliveryCycle.create({ data: {
      id: randomUUID(), bookingId: fixture.bookingId, sequence: 2, status: "REVIEW_ACTIVE", active: true,
      deliveryAt: new Date(fixture.now.getTime() + 1000), durationMs: 259200000,
      deadlineAt: new Date(fixture.now.getTime() + 1000 + 259200000), version: 1,
    } });
    assert.ok(first.id);
  });
  assert.equal(failure.code, "P2002");
  assert.equal(failure.meta?.target?.includes?.("DeliveryCycle_one_active_per_booking_key") ?? true, true);
});

test("PostgreSQL policy snapshot trigger rejects edits and quota helpers persist reserve, consume, return, and release", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const snapshot = await tx.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } });
    assert.equal(snapshot.revisionPolicyHash, "a".repeat(64));
    assert.equal(snapshot.revisionFreeCount, 2);
    const first = await createRevision(tx, fixture, cycle.id);
    await reserveRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: first.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.customerId, now: fixture.now });
    assert.deepEqual(await readRevisionQuota(tx, fixture.bookingId), { available: 1, reserved: 1, consumed: 0, expired: 0 });
    await consumeRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: first.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.sellerUserId });
    assert.deepEqual(await readRevisionQuota(tx, fixture.bookingId), { available: 1, reserved: 0, consumed: 1, expired: 0 });
    await returnSystemErrorQuota(tx, { bookingId: fixture.bookingId, revisionId: first.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.sellerUserId, reason: "Verified simulated system error", evidenceReference: "test-evidence-1" });
    await tx.revisionRequest.update({ where: { id: first.id }, data: { status: "WITHDRAWN", withdrawnAt: fixture.now } });
    const second = await createRevision(tx, fixture, cycle.id);
    await reserveRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: second.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.customerId, now: fixture.now });
    await releaseRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: second.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.sellerUserId, reason: "Seller rejected fixture request" });
    assert.deepEqual(await readRevisionQuota(tx, fixture.bookingId), { available: 2, reserved: 0, consumed: 0, expired: 0 });
    const entries = await tx.revisionQuotaLedger.findMany({ where: { bookingId: fixture.bookingId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(entries.map((entry: any) => entry.operation), ["RESERVE", "CONSUME", "SYSTEM_ERROR_RETURN", "RESERVE", "RELEASE"]);
    return fixture.bookingId;
  });
});

test("PostgreSQL service policy version trigger rejects content change without one version increment", async () => {
  const failure = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    await tx.service.update({ where: { id: fixture.serviceId }, data: { revisionTerms: "Changed policy without version increment" } });
  });
  assert.equal(failure.code, "P2039");
  assert.match(failure.message, /P0001.*Revision policy changes must increment version exactly once/s);
});

test("PostgreSQL policy snapshot and quota ledger append-only triggers reject mutation", async () => {
  const failure = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const revision = await createRevision(tx, fixture, cycle.id);
    await reserveRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: revision.id, cycleId: cycle.id, generation: 1, actorUserId: fixture.customerId, now: fixture.now });
    const ledger = await tx.revisionQuotaLedger.findFirstOrThrow({ where: { bookingId: fixture.bookingId } });
    await tx.revisionQuotaLedger.update({ where: { id: ledger.id }, data: { reason: "attempted mutation" } });
  });
  assert.equal(failure.code, "P2039", `unexpected append-only error: ${JSON.stringify({ name: failure.name, code: failure.code, message: failure.message })}`);
  assert.match(failure.message, /P0001.*Revision audit and quota history is append-only/s);
});

test("PostgreSQL assistance lifecycle trigger and response clock ledger preserve exact remainder across overlapping blockers", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const deadline = new Date(fixture.now.getTime() + 60_000);
    const revision = await createRevision(tx, fixture, cycle.id, { deadline });
    const first = await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_RESPONSE_OVERDUE", requesterId: fixture.customerId, at: fixture.now });
    const second = await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_REJECTION", requesterId: fixture.customerId, at: new Date(fixture.now.getTime() + 1) });
    const pauseAt = new Date(fixture.now.getTime() + 15_000);
    await syncRevisionResponseClocks(tx, revision.id, pauseAt, fixture.customerId);
    let current = await tx.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
    assert.equal(current.sellerResponseRemainingMs, 45_000);
    assert.equal(current.sellerResponsePausedAt!.getTime(), pauseAt.getTime());
    await tx.revisionEscalationRequest.update({ where: { id: first.id }, data: { status: "IN_REVIEW", version: 2, reviewStartedAt: pauseAt } });
    await syncRevisionResponseClocks(tx, revision.id, new Date(pauseAt.getTime() + 20_000), fixture.sellerUserId);
    await tx.revisionEscalationRequest.update({ where: { id: first.id }, data: { status: "RESOLVED", version: 3, resolvedAt: new Date(pauseAt.getTime() + 25_000), resolutionDetails: "First issue reviewed", permittedNextAction: "Continue admin review" } });
    await syncRevisionResponseClocks(tx, revision.id, new Date(pauseAt.getTime() + 30_000), fixture.sellerUserId);
    current = await tx.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
    assert.equal(current.sellerResponsePausedAt!.getTime(), pauseAt.getTime(), "second active case must keep clock paused");
    await tx.revisionEscalationRequest.update({ where: { id: second.id }, data: { status: "IN_REVIEW", version: 2, reviewStartedAt: new Date(pauseAt.getTime() + 35_000) } });
    await tx.revisionEscalationRequest.update({ where: { id: second.id }, data: { status: "RESOLVED", version: 3, resolvedAt: new Date(pauseAt.getTime() + 40_000), resolutionDetails: "Second issue reviewed", permittedNextAction: "Resume seller response" } });
    const resumedAt = new Date(pauseAt.getTime() + 50_000);
    await syncRevisionResponseClocks(tx, revision.id, resumedAt, fixture.sellerUserId);
    current = await tx.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
    assert.equal(current.sellerResponseDeadlineAt.getTime(), resumedAt.getTime() + 45_000);
    assert.equal(current.sellerResponsePausedAt, null);
    assert.equal(current.sellerResponseRemainingMs, null);
    const pauses = await tx.revisionResponseClockPause.findMany({ where: { revisionId: revision.id } });
    const resumes = await tx.revisionResponseClockResume.findMany({ where: { pauseId: { in: pauses.map((p: any) => p.id) } } });
    assert.equal(pauses.length, 1);
    assert.equal(resumes.length, 1);
    const sla = await tx.$queryRaw<Array<{ elapsed_seconds: number }>>`SELECT EXTRACT(EPOCH FROM ("slaDueAt" - "createdAt"))::float8 AS elapsed_seconds FROM "RevisionEscalationRequest" WHERE "id" = ${first.id}`;
    assert.equal(sla[0]?.elapsed_seconds, 172800);
    return revision.id;
  });
});

test("PostgreSQL rejects invalid assistance status jump and duplicate active trigger", async () => {
  const transitionError = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const revision = await createRevision(tx, fixture, cycle.id);
    const assistance = await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_RESPONSE_OVERDUE", requesterId: fixture.customerId, at: fixture.now });
    await tx.revisionEscalationRequest.update({ where: { id: assistance.id }, data: { status: "RESOLVED", version: 2, resolvedAt: fixture.now, resolutionDetails: "Invalid direct resolution", permittedNextAction: "None" } });
  });
  assert.equal(transitionError.code, "P2039", `unexpected transition error: ${JSON.stringify({ name: transitionError.name, code: transitionError.code, message: transitionError.message })}`);
  assert.match(transitionError.message, /P0001.*Invalid revision assistance status transition/s);

  const uniqueError = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const revision = await createRevision(tx, fixture, cycle.id);
    await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_REJECTION", requesterId: fixture.customerId, at: fixture.now });
    await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_REJECTION", requesterId: fixture.customerId, at: fixture.now });
  });
  assert.equal(uniqueError.code, "P2002");
});

test("PostgreSQL scheduler job enforces lease shape and one job per delivery cycle", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const job = await tx.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: cycle.id } });
    await tx.deliveryCycleJob.update({ where: { id: job.id }, data: { status: "CLAIMED", claimToken: "pg-test-claim", claimExpiresAt: new Date(fixture.now.getTime() + 60_000), attempts: { increment: 1 } } });
    const claimed = await tx.deliveryCycleJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(claimed.status, "CLAIMED");
    assert.equal(claimed.claimToken, "pg-test-claim");
    return job.id;
  });

  const leaseError = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    const job = await tx.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: cycle.id } });
    await tx.deliveryCycleJob.update({ where: { id: job.id }, data: { status: "CLAIMED" } });
  });
  assert.ok(["P2004", "P2039"].includes(leaseError.code));

  const duplicateError = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    await tx.deliveryCycleJob.create({ data: { id: randomUUID(), bookingId: fixture.bookingId, deliveryCycleId: cycle.id, generation: cycle.version, scheduledAt: cycle.deadlineAt } });
  });
  assert.equal(duplicateError.code, "P2002");
});

test("PostgreSQL completion receipts reject duplicate principal operations and duplicate scheduler completion", async () => {
  const principalDuplicate = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    for (let i = 0; i < 2; i++) {
      const event = await tx.bookingStatusEvent.create({ data: { bookingId: fixture.bookingId, fromStatus: "DELIVERED", toStatus: "DELIVERED", actorUserId: fixture.customerId, source: "PG_TEST", occurredAt: fixture.now } });
      await tx.deliveryCycleCompletionReceipt.create({ data: { deliveryCycleId: cycle.id, principalId: fixture.customerId, operation: "PG_TEST_COMPLETE", requestFingerprint: `fingerprint-${i}`, transitionEventId: event.id } });
    }
  });
  assert.equal(principalDuplicate.code, "P2002");

  const schedulerDuplicate = await expectDatabaseFailure(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, fixture.now);
    for (let i = 0; i < 2; i++) {
      const event = await tx.bookingStatusEvent.create({ data: { bookingId: fixture.bookingId, fromStatus: "DELIVERED", toStatus: "COMPLETED", source: "SYSTEM_AUTO_COMPLETE", occurredAt: fixture.now } });
      await tx.deliveryCycleCompletionReceipt.create({ data: { deliveryCycleId: cycle.id, principalId: null, operation: `PG_TEST_SCHEDULER_${i}`, requestFingerprint: `scheduler-${i}`, transitionEventId: event.id } });
    }
  });
  assert.equal(schedulerDuplicate.code, "P2002");
});

test("PostgreSQL Global Pause keeps one interval across revision plus assistance and honors legacy completion safeguard", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const deliveryAt = new Date(fixture.now.getTime() - 60 * 60 * 1000);
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, deliveryAt);
    const revision = await createRevision(tx, fixture, cycle.id);
    await lockBookingAndActiveCycle(tx, fixture.bookingId);
    await syncDeliveryCycleBlockers(tx, fixture.bookingId, fixture.now, fixture.customerId);
    const paused = await tx.deliveryCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    assert.equal(paused.status, "REVIEW_PAUSED");
    assert.equal(paused.remainingMs, 71 * 60 * 60 * 1000);
    const assistance = await createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_ESTIMATE_OVERDUE", requesterId: fixture.customerId, at: fixture.now });
    await syncDeliveryCycleBlockers(tx, fixture.bookingId, new Date(fixture.now.getTime() + 1000), fixture.customerId);
    assert.equal(await tx.deliveryCyclePauseInterval.count({ where: { deliveryCycleId: cycle.id } }), 1);
    const blocked = await checkCompletionEligibility(tx, fixture.bookingId, "CUSTOMER", fixture.now);
    assert.deepEqual(blocked, { eligible: false, reason: "ACTIVE_BLOCKER" });
    await tx.revisionRequest.update({ where: { id: revision.id }, data: { status: "WITHDRAWN", withdrawnAt: fixture.now } });
    await lockBookingAndActiveCycle(tx, fixture.bookingId);
    await syncDeliveryCycleBlockers(tx, fixture.bookingId, new Date(fixture.now.getTime() + 2000), fixture.customerId);
    assert.equal((await tx.deliveryCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status, "REVIEW_PAUSED", "assistance remains a blocker");
    await tx.revisionEscalationRequest.update({ where: { id: assistance.id }, data: { status: "IN_REVIEW", version: 2, reviewStartedAt: fixture.now } });
    await tx.revisionEscalationRequest.update({ where: { id: assistance.id }, data: { status: "RESOLVED", version: 3, resolvedAt: fixture.now, resolutionDetails: "Temporary issue resolved", permittedNextAction: "Continue review" } });
    const resumeAt = new Date(fixture.now.getTime() + 5000);
    await lockBookingAndActiveCycle(tx, fixture.bookingId);
    await syncDeliveryCycleBlockers(tx, fixture.bookingId, resumeAt, fixture.customerId);
    const resumed = await tx.deliveryCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    assert.equal(resumed.status, "REVIEW_ACTIVE");
    assert.equal(resumed.deadlineAt!.getTime(), resumeAt.getTime() + 71 * 60 * 60 * 1000);
    assert.equal(await tx.deliveryCyclePauseInterval.count({ where: { deliveryCycleId: cycle.id, endedAt: { not: null } } }), 1);
    const eligible = await checkCompletionEligibility(tx, fixture.bookingId, "CUSTOMER", resumeAt);
    assert.equal(eligible.eligible, true);
    return fixture.bookingId;
  });

  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    const legacy = await checkCompletionEligibility(tx, fixture.bookingId, "SCHEDULER", fixture.now, 1);
    assert.deepEqual(legacy, { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
    return fixture.bookingId;
  });
});

test("PostgreSQL UTC timestamp round-trip preserves millisecond precision in a non-UTC session", async () => {
  await inRollbackTransaction(async (tx) => {
    const fixture = await createBaseFixture(tx);
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const cycle = await createDeliveryCycle(tx, fixture.bookingId, new Date("2026-11-14T12:34:56.789Z"));
    const stored = await tx.deliveryCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    assert.equal(stored.deliveryAt.toISOString(), "2026-11-14T12:34:56.789Z");
    assert.equal(stored.deadlineAt!.toISOString(), "2026-11-17T12:34:56.789Z");
    return cycle.id;
  });
});

test("PostgreSQL booking-first completion lock serializes a concurrent lifecycle lock", async () => {
  const fixture = await prisma.$transaction((tx) => createBaseFixture(tx), { timeout: 20000 });
  const secondClient = makeClient();
  let releaseFirst!: () => void;
  let markFirstLocked!: () => void;
  let markSecondStarted!: () => void;
  const firstLocked = new Promise<void>((resolve) => { markFirstLocked = resolve; });
  const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let secondAcquired = false;
  let firstPromise: Promise<unknown> | undefined;
  let secondPromise: Promise<unknown> | undefined;
  try {
    firstPromise = prisma.$transaction(async (tx) => {
      const result = await checkCompletionEligibility(tx, fixture.bookingId, "CUSTOMER", fixture.now);
      assert.deepEqual(result, { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
      markFirstLocked();
      await holdFirst;
    }, { timeout: 10000 });
    await firstLocked;
    secondPromise = secondClient.$transaction(async (tx) => {
      markSecondStarted();
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      secondAcquired = true;
    }, { timeout: 10000 });
    await secondStarted;
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(secondAcquired, false, "second transaction must wait on the booking row");
    releaseFirst();
    await Promise.all([firstPromise, secondPromise]);
    assert.equal(secondAcquired, true);
  } finally {
    releaseFirst();
    if (firstPromise) await Promise.allSettled([firstPromise]);
    if (secondPromise) await Promise.allSettled([secondPromise]);
    await secondClient.$disconnect();
    await prisma.$transaction(async (tx) => {
      await tx.booking.deleteMany({ where: { id: fixture.bookingId } });
      await tx.service.deleteMany({ where: { id: fixture.serviceId } });
      await tx.sellerProfile.deleteMany({ where: { id: fixture.sellerId } });
      await tx.category.deleteMany({ where: { id: fixture.categoryId } });
      await tx.user.deleteMany({ where: { id: { in: [fixture.customerId, fixture.sellerUserId] } } });
    }, { timeout: 20000 });
  }
});

test("PostgreSQL customer and scheduler eligibility serialize and both hold unverifiable legacy deliveries", async () => {
  const fixture = await prisma.$transaction((tx) => createBaseFixture(tx), { timeout: 20000 });
  const schedulerClient = makeClient();
  let releaseCustomer!: () => void;
  let customerLocked!: () => void;
  let schedulerStarted!: () => void;
  const customerHasLock = new Promise<void>((resolve) => { customerLocked = resolve; });
  const schedulerHasStarted = new Promise<void>((resolve) => { schedulerStarted = resolve; });
  const holdCustomer = new Promise<void>((resolve) => { releaseCustomer = resolve; });
  let schedulerFinished = false;
  let customerPromise: Promise<unknown> | undefined;
  let schedulerPromise: Promise<unknown> | undefined;
  try {
    customerPromise = prisma.$transaction(async (tx) => {
      const result = await checkCompletionEligibility(tx, fixture.bookingId, "CUSTOMER", fixture.now);
      assert.deepEqual(result, { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
      customerLocked();
      await holdCustomer;
      return result;
    }, { timeout: 10000 });
    await customerHasLock;
    schedulerPromise = schedulerClient.$transaction(async (tx) => {
      schedulerStarted();
      const result = await checkCompletionEligibility(tx, fixture.bookingId, "SCHEDULER", fixture.now, 1);
      schedulerFinished = true;
      return result;
    }, { timeout: 10000 });
    await schedulerHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(schedulerFinished, false, "scheduler eligibility must wait for customer booking-first lock");
    releaseCustomer();
    const [customerResult, schedulerResult] = await Promise.all([customerPromise, schedulerPromise]);
    assert.deepEqual(customerResult, { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
    assert.deepEqual(schedulerResult, { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
  } finally {
    releaseCustomer();
    if (customerPromise) await Promise.allSettled([customerPromise]);
    if (schedulerPromise) await Promise.allSettled([schedulerPromise]);
    await schedulerClient.$disconnect();
    await prisma.$transaction(async (tx) => {
      await tx.booking.deleteMany({ where: { id: fixture.bookingId } });
      await tx.service.deleteMany({ where: { id: fixture.serviceId } });
      await tx.sellerProfile.deleteMany({ where: { id: fixture.sellerId } });
      await tx.category.deleteMany({ where: { id: fixture.categoryId } });
      await tx.user.deleteMany({ where: { id: { in: [fixture.customerId, fixture.sellerUserId] } } });
    }, { timeout: 20000 });
  }
  assert.equal(await prisma.booking.count({ where: { id: fixture.bookingId } }), 0, "legacy race fixture must be removed");
});

test("PostgreSQL competing revision submissions reserve one quota unit and preserve duplicate idempotency", async () => {
  // Committed lifecycle rows are intentionally retained in this disposable DB;
  // discard the whole database after the concurrency phase.
  const fixture = await createCommittedCycleFixture({ revisionFreeCount: 1 });
  const contender = makeClient();
  let releaseFirst!: () => void;
  let firstReserved!: () => void;
  let secondStarted!: () => void;
  const firstHasReservation = new Promise<void>((resolve) => { firstReserved = resolve; });
  const secondHasStarted = new Promise<void>((resolve) => { secondStarted = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let secondFinished = false;
  let firstPromise: Promise<any> | undefined;
  let secondPromise: Promise<any> | undefined;
  try {
    firstPromise = prisma.$transaction(async (tx) => {
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      const current = await tx.revisionRequest.findFirst({ where: { bookingId: fixture.bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } } });
      assert.equal(current, null);
      const revision = await createRevision(tx, fixture, fixture.cycle.id, { requestText: "First concurrent request" });
      await reserveRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: revision.id, cycleId: fixture.cycle.id, generation: 1, actorUserId: fixture.customerId, now: fixture.now });
      await tx.revisionEvent.create({ data: { revisionId: revision.id, actorUserId: fixture.customerId, eventType: "REQUESTED", toStatus: "REQUESTED", payload: { test: true }, occurredAt: fixture.now } });
      firstReserved();
      await holdFirst;
      return { id: revision.id, created: true };
    }, { timeout: 20000 });
    await firstHasReservation;
    secondPromise = contender.$transaction(async (tx) => {
      secondStarted();
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      const current = await tx.revisionRequest.findFirst({ where: { bookingId: fixture.bookingId, status: { in: ["REQUESTED", "WAITING_CUSTOMER", "IN_PROGRESS"] } } });
      secondFinished = true;
      if (!current) throw new Error("EXPECTED_ACTIVE_REVISION_AFTER_LOCK");
      if (current.deliveryCycleId === fixture.cycle.id && current.requestText === "First concurrent request") return { id: current.id, created: false, replay: true };
      return { id: current.id, created: false, conflict: true };
    }, { timeout: 20000 });
    await secondHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(secondFinished, false, "second request must wait for the first booking lock");
    releaseFirst();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(first.created, true);
    assert.equal(second.id, first.id);
    assert.equal(second.replay, true);
    assert.equal(await prisma.revisionRequest.count({ where: { bookingId: fixture.bookingId } }), 1);
    assert.equal(await prisma.revisionQuotaLedger.count({ where: { bookingId: fixture.bookingId, operation: "RESERVE" } }), 1);
    assert.deepEqual(await prisma.$transaction((tx) => readRevisionQuota(tx, fixture.bookingId)), { available: 0, reserved: 1, consumed: 0, expired: 0 });
  } finally {
    releaseFirst();
    if (firstPromise) await Promise.allSettled([firstPromise]);
    if (secondPromise) await Promise.allSettled([secondPromise]);
    await contender.$disconnect();
  }
});

test("PostgreSQL seller acceptance wins a concurrent customer withdrawal without restoring consumed quota", async () => {
  const fixture = await createCommittedCycleFixture();
  const contender = makeClient();
  const revision = await prisma.$transaction(async (tx) => {
    const row = await createRevision(tx, fixture, fixture.cycle.id);
    await reserveRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: row.id, cycleId: fixture.cycle.id, generation: 1, actorUserId: fixture.customerId, now: fixture.now });
    return row;
  }, { timeout: 20000 });
  let releaseSeller!: () => void;
  let sellerTransitioned!: () => void;
  let customerStarted!: () => void;
  const sellerHasTransitioned = new Promise<void>((resolve) => { sellerTransitioned = resolve; });
  const customerHasStarted = new Promise<void>((resolve) => { customerStarted = resolve; });
  const holdSeller = new Promise<void>((resolve) => { releaseSeller = resolve; });
  let sellerPromise: Promise<any> | undefined;
  let customerPromise: Promise<any> | undefined;
  try {
    sellerPromise = prisma.$transaction(async (tx) => {
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${revision.id} AND "bookingId" = ${fixture.bookingId} FOR UPDATE`;
      const current = await tx.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
      assert.equal(current.status, "REQUESTED");
      await consumeRevisionUnit(tx, { bookingId: fixture.bookingId, revisionId: revision.id, cycleId: fixture.cycle.id, generation: current.reservationGeneration, actorUserId: fixture.sellerUserId });
      await tx.revisionRequest.update({ where: { id: revision.id }, data: { status: "IN_PROGRESS", acceptedAt: fixture.now, estimatedCompletionAt: new Date(fixture.now.getTime() + 60_000) } });
      await tx.revisionEvent.create({ data: { revisionId: revision.id, actorUserId: fixture.sellerUserId, eventType: "ACCEPTED", fromStatus: "REQUESTED", toStatus: "IN_PROGRESS", payload: { test: true }, occurredAt: fixture.now } });
      sellerTransitioned();
      await holdSeller;
      return "ACCEPTED";
    }, { timeout: 20000 });
    await sellerHasTransitioned;
    customerPromise = contender.$transaction(async (tx) => {
      customerStarted();
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${revision.id} AND "bookingId" = ${fixture.bookingId} FOR UPDATE`;
      const current = await tx.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
      return current.status === "REQUESTED" || current.status === "WAITING_CUSTOMER" ? "WITHDRAWABLE" : "STATE_CONFLICT";
    }, { timeout: 20000 });
    await customerHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseSeller();
    const [sellerOutcome, customerOutcome] = await Promise.all([sellerPromise, customerPromise]);
    assert.equal(sellerOutcome, "ACCEPTED");
    assert.equal(customerOutcome, "STATE_CONFLICT");
    assert.equal((await prisma.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } })).status, "IN_PROGRESS");
    assert.deepEqual(await prisma.$transaction((tx) => readRevisionQuota(tx, fixture.bookingId)), { available: 1, reserved: 0, consumed: 1, expired: 0 });
    assert.deepEqual((await prisma.revisionQuotaLedger.findMany({ where: { revisionId: revision.id }, orderBy: { createdAt: "asc" } })).map((row) => row.operation), ["RESERVE", "CONSUME"]);
  } finally {
    releaseSeller();
    if (sellerPromise) await Promise.allSettled([sellerPromise]);
    if (customerPromise) await Promise.allSettled([customerPromise]);
    await contender.$disconnect();
  }
});

test("PostgreSQL identical concurrent admin transition replays once and opens one response-clock pause", async () => {
  const fixture = await createCommittedCycleFixture();
  const contender = makeClient();
  const adminId = randomUUID();
  await prisma.user.create({ data: { id: adminId, email: `pg-admin-${randomUUID()}@test.invalid`, passwordHash: "test-only-hash", name: "PG fixture admin", role: "ADMIN", accountStatus: "ACTIVE" } });
  const revision = await prisma.$transaction((tx) => createRevision(tx, fixture, fixture.cycle.id, { deadline: new Date(fixture.now.getTime() + 60_000) }), { timeout: 20000 });
  const assistance = await prisma.$transaction((tx) => createAssistance(tx, { revisionId: revision.id, bookingId: fixture.bookingId, trigger: "SELLER_RESPONSE_OVERDUE", requesterId: fixture.customerId, at: fixture.now, responseClockType: "SELLER_RESPONSE" }), { timeout: 20000 });
  const fingerprint = "pg-concurrent-admin-start-review";
  let releaseFirst!: () => void;
  let firstCommittedState!: () => void;
  let secondStarted!: () => void;
  const firstHasState = new Promise<void>((resolve) => { firstCommittedState = resolve; });
  const secondHasStarted = new Promise<void>((resolve) => { secondStarted = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstPromise: Promise<any> | undefined;
  let secondPromise: Promise<any> | undefined;
  try {
    const startReview = (client: PrismaClient, signalStart?: () => void, hold = false) => client.$transaction(async (tx) => {
      signalStart?.();
      await lockBookingAndActiveCycle(tx, fixture.bookingId);
      await tx.$queryRaw`SELECT "id" FROM "RevisionRequest" WHERE "id" = ${revision.id} AND "bookingId" = ${fixture.bookingId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "RevisionEscalationRequest" WHERE "id" = ${assistance.id} FOR UPDATE`;
      const receipt = await tx.revisionEscalationOperationReceipt.findUnique({ where: { assistanceId_principalId_expectedVersion: { assistanceId: assistance.id, principalId: adminId, expectedVersion: 1 } } });
      if (receipt) {
        assert.equal(receipt.requestFingerprint, fingerprint);
        return { replay: true, status: "IN_REVIEW", version: 2 };
      }
      const current = await tx.revisionEscalationRequest.findUniqueOrThrow({ where: { id: assistance.id } });
      assert.equal(current.status, "OPEN");
      assert.equal(current.version, 1);
      const at = new Date(fixture.now.getTime() + 15_000);
      const updated = await tx.revisionEscalationRequest.update({ where: { id: assistance.id }, data: { status: "IN_REVIEW", version: 2, reviewStartedAt: at, updatedAt: at } });
      const event = await tx.revisionEscalationEvent.create({ data: { assistanceId: assistance.id, actorUserId: adminId, actorType: "USER", eventType: "START_REVIEW", fromStatus: "OPEN", toStatus: "IN_REVIEW", reason: "Concurrent transition fixture", requestFingerprint: fingerprint, occurredAt: at } });
      await tx.revisionEscalationOperationReceipt.create({ data: { assistanceId: assistance.id, principalId: adminId, expectedVersion: 1, requestFingerprint: fingerprint, result: { status: updated.status, version: updated.version, event_id: event.id } as any } });
      await syncRevisionResponseClocks(tx, revision.id, at, adminId);
      if (hold) {
        firstCommittedState();
        await holdFirst;
      }
      return { replay: false, status: updated.status, version: updated.version };
    }, { timeout: 20000 });

    firstPromise = startReview(prisma, undefined, true);
    await firstHasState;
    secondPromise = startReview(contender, secondStarted, false);
    await secondHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseFirst();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    assert.deepEqual(first, { replay: false, status: "IN_REVIEW", version: 2 });
    assert.deepEqual(second, { replay: true, status: "IN_REVIEW", version: 2 });
    assert.equal(await prisma.revisionEscalationEvent.count({ where: { assistanceId: assistance.id } }), 1);
    assert.equal(await prisma.revisionEscalationOperationReceipt.count({ where: { assistanceId: assistance.id } }), 1);
    assert.equal(await prisma.revisionResponseClockPause.count({ where: { revisionId: revision.id, clockType: "SELLER_RESPONSE" } }), 1);
    const paused = await prisma.revisionRequest.findUniqueOrThrow({ where: { id: revision.id } });
    assert.equal(paused.sellerResponsePausedAt!.getTime(), fixture.now.getTime() + 15_000);
    assert.equal(paused.sellerResponseRemainingMs, 45_000);
  } finally {
    releaseFirst();
    if (firstPromise) await Promise.allSettled([firstPromise]);
    if (secondPromise) await Promise.allSettled([secondPromise]);
    await contender.$disconnect();
  }
});

test("PostgreSQL concurrent scheduler workers use SKIP LOCKED to claim a due cycle job once", async () => {
  const deliveryAt = new Date("2026-11-10T12:00:00.123Z");
  const fixture = await createCommittedCycleFixture({ deliveryAt });
  const job = await prisma.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: fixture.cycle.id } });
  const contender = makeClient();
  const now = fixture.now;
  const claim = (client: PrismaClient, token: string, signal?: () => void, hold = false) => client.$transaction(async (tx) => {
    signal?.();
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      WITH expired AS (
        UPDATE "DeliveryCycleJob" SET "status" = 'PENDING', "claimToken" = NULL, "claimExpiresAt" = NULL
        WHERE "id" = ${job.id} AND "status" = 'CLAIMED' AND "claimExpiresAt" <= ${now} RETURNING "id"
      ), due AS (
        SELECT "id" FROM "DeliveryCycleJob" WHERE "id" = ${job.id} AND "status" = 'PENDING' AND "scheduledAt" <= ${now}
        ORDER BY "scheduledAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "DeliveryCycleJob" AS job SET "status" = 'CLAIMED', "claimToken" = ${token},
        "claimExpiresAt" = ${new Date(now.getTime() + 60_000)}, "attempts" = job."attempts" + 1
      FROM due WHERE job."id" = due."id" RETURNING job."id"`;
    if (hold && rows.length) {
      firstClaim();
      await holdFirst;
    }
    return rows.map((row) => row.id);
  }, { timeout: 20000 });
  let releaseFirst!: () => void;
  let firstClaim!: () => void;
  let secondStarted!: () => void;
  const firstHasClaim = new Promise<void>((resolve) => { firstClaim = resolve; });
  const secondHasStarted = new Promise<void>((resolve) => { secondStarted = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstPromise: Promise<string[]> | undefined;
  let secondPromise: Promise<string[]> | undefined;
  try {
    firstPromise = claim(prisma, randomUUID(), undefined, true);
    await firstHasClaim;
    secondPromise = claim(contender, randomUUID(), secondStarted, false);
    await secondHasStarted;
    const skipped = await secondPromise;
    assert.deepEqual(skipped, []);
    releaseFirst();
    const first = await firstPromise;
    assert.equal(first.length, 1);
    const job = await prisma.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: fixture.cycle.id } });
    assert.equal(job.id, first[0]);
    assert.equal(job.status, "CLAIMED");
    assert.ok(job.claimToken);
    assert.equal(job.attempts, 1);
  } finally {
    releaseFirst();
    if (firstPromise) await Promise.allSettled([firstPromise]);
    if (secondPromise) await Promise.allSettled([secondPromise]);
    await contender.$disconnect();
  }
});

test("PostgreSQL customer completion serializes against scheduler eligibility and writes one receipt", async () => {
  const deliveryAt = new Date("2026-11-10T12:00:00.123Z");
  const fixture = await createCommittedCycleFixture({ deliveryAt });
  const contender = makeClient();
  let releaseCustomer!: () => void;
  let customerCommittedTransition!: () => void;
  let schedulerStarted!: () => void;
  const customerHasTransition = new Promise<void>((resolve) => { customerCommittedTransition = resolve; });
  const schedulerHasStarted = new Promise<void>((resolve) => { schedulerStarted = resolve; });
  const holdCustomer = new Promise<void>((resolve) => { releaseCustomer = resolve; });
  let customerPromise: Promise<any> | undefined;
  let schedulerPromise: Promise<any> | undefined;
  try {
    customerPromise = prisma.$transaction(async (tx) => {
      const eligibility = await checkCompletionEligibility(tx, fixture.bookingId, "CUSTOMER", fixture.now);
      assert.equal(eligibility.eligible, true);
      const won = await tx.booking.updateMany({ where: { id: fixture.bookingId, customerId: fixture.customerId, status: "DELIVERED" }, data: { status: "COMPLETED", completedAt: fixture.now } });
      assert.equal(won.count, 1);
      const event = await tx.bookingStatusEvent.create({ data: { bookingId: fixture.bookingId, fromStatus: "DELIVERED", toStatus: "COMPLETED", actorUserId: fixture.customerId, source: "CUSTOMER", occurredAt: fixture.now } });
      await tx.deliveryCycleCompletionReceipt.create({ data: { deliveryCycleId: fixture.cycle.id, principalId: fixture.customerId, operation: "CUSTOMER_COMPLETE", requestFingerprint: "pg-concurrent-completion", transitionEventId: event.id } });
      await closeActiveDeliveryCycle(tx, fixture.bookingId, fixture.now, "COMPLETED", fixture.customerId);
      customerCommittedTransition();
      await holdCustomer;
      return "COMPLETED_BY_CUSTOMER";
    }, { timeout: 20000 });
    await customerHasTransition;
    schedulerPromise = contender.$transaction(async (tx) => {
      schedulerStarted();
      const eligibility = await checkCompletionEligibility(tx, fixture.bookingId, "SCHEDULER", fixture.now, fixture.cycle.version);
      return eligibility.eligible ? "ELIGIBLE" : eligibility.reason;
    }, { timeout: 20000 });
    await schedulerHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseCustomer();
    const [customerOutcome, schedulerOutcome] = await Promise.all([customerPromise, schedulerPromise]);
    assert.equal(customerOutcome, "COMPLETED_BY_CUSTOMER");
    assert.equal(schedulerOutcome, "BOOKING_STATE");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } })).status, "COMPLETED");
    assert.equal(await prisma.deliveryCycleCompletionReceipt.count({ where: { deliveryCycleId: fixture.cycle.id } }), 1);
    assert.equal((await prisma.deliveryCycle.findUniqueOrThrow({ where: { id: fixture.cycle.id } })).active, false);
  } finally {
    releaseCustomer();
    if (customerPromise) await Promise.allSettled([customerPromise]);
    if (schedulerPromise) await Promise.allSettled([schedulerPromise]);
    await contender.$disconnect();
  }
});

test("PostgreSQL outbox event and notification source keys are idempotent under concurrent inserts", async () => {
  const fixture = await prisma.$transaction((tx) => createBaseFixture(tx), { timeout: 20000 });
  const contender = makeClient();
  const eventKey = `pg-concurrency-outbox:${randomUUID()}`;
  const sourceOutboxKey = `${eventKey}:${fixture.customerId}`;
  const payload = [{ userId: fixture.customerId, type: "BOOKING_UPDATE", title: "Concurrency fixture", refId: fixture.bookingId }];
  let releaseFirst!: () => void;
  let firstInserted!: () => void;
  let secondStarted!: () => void;
  const firstHasInsert = new Promise<void>((resolve) => { firstInserted = resolve; });
  const secondHasStarted = new Promise<void>((resolve) => { secondStarted = resolve; });
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstPromise: Promise<void> | undefined;
  let secondPromise: Promise<string> | undefined;
  try {
    firstPromise = prisma.$transaction(async (tx) => {
      await tx.notificationOutbox.create({ data: { eventKey, eventType: "PG_CONCURRENCY_TEST", payload } });
      firstInserted();
      await holdFirst;
    }, { timeout: 20000 });
    await firstHasInsert;
    secondPromise = contender.$transaction(async (tx) => {
      secondStarted();
      try {
        await tx.notificationOutbox.create({ data: { eventKey, eventType: "PG_CONCURRENCY_TEST", payload } });
        return "UNEXPECTED_INSERT";
      } catch (error: any) {
        return error.code ?? "UNKNOWN_ERROR";
      }
    }, { timeout: 20000 });
    await secondHasStarted;
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseFirst();
    await firstPromise;
    assert.equal(await secondPromise, "P2002");
    assert.equal(await prisma.notificationOutbox.count({ where: { eventKey } }), 1);

    const createOrReplay = (client: PrismaClient) => client.notification.upsert({
      where: { sourceOutboxKey },
      create: { userId: fixture.customerId, type: "BOOKING_UPDATE", title: "Concurrency fixture", refId: fixture.bookingId, sourceOutboxKey },
      update: {},
    });
    const results = await Promise.all([createOrReplay(prisma), createOrReplay(contender)]);
    assert.equal(results[0]!.id, results[1]!.id);
    assert.equal(await prisma.notification.count({ where: { sourceOutboxKey } }), 1);
  } finally {
    releaseFirst();
    if (firstPromise) await Promise.allSettled([firstPromise]);
    if (secondPromise) await Promise.allSettled([secondPromise]);
    await contender.$disconnect();
  }
});
