import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_DURATION_MS, classifyLegacyDelivery, remainingReviewMs, reviewDeadlineFromLedger, syncReviewTimerBlockers } from "../src/modules/bookings/booking-timer.ts";
import { createDeliveryCycle, syncDeliveryCycleBlockers } from "../src/modules/bookings/delivery-cycle.ts";

const at = (hours: number) => new Date(Date.UTC(2025, 0, 1) + hours * 60 * 60 * 1000);

test("review duration is exactly 72 elapsed hours", () => {
  assert.equal(REVIEW_DURATION_MS, 72 * 60 * 60 * 1000);
  assert.equal(remainingReviewMs(at(0), REVIEW_DURATION_MS, [], at(24)), 48 * 60 * 60 * 1000);
});

test("closed pause intervals preserve remaining time and subtract only paused duration", () => {
  assert.equal(remainingReviewMs(at(0), REVIEW_DURATION_MS, [
    { startedAt: at(30), endedAt: at(42) },
    { startedAt: at(50), endedAt: at(56) },
  ], at(60)), 30 * 60 * 60 * 1000);
});

test("an open pause remains excluded from elapsed review time", () => {
  assert.equal(remainingReviewMs(at(0), REVIEW_DURATION_MS, [{ startedAt: at(48), endedAt: null }], at(90)), 24 * 60 * 60 * 1000);
});

test("zero remaining time clamps to zero", () => {
  assert.equal(remainingReviewMs(at(0), REVIEW_DURATION_MS, [], at(100)), 0);
});

test("deadline reconstructs from pause history, including a pause after expiry", () => {
  assert.equal(reviewDeadlineFromLedger(at(0), REVIEW_DURATION_MS, [{ startedAt: at(30), endedAt: at(42) }]).getTime(), at(84).getTime());
  assert.equal(reviewDeadlineFromLedger(at(0), REVIEW_DURATION_MS, [{ startedAt: at(80), endedAt: at(90) }]).getTime(), at(90).getTime());
});

test("invalid and overlapping pause intervals are rejected", () => {
  assert.throws(() => remainingReviewMs(at(0), REVIEW_DURATION_MS, [{ startedAt: at(30), endedAt: at(45) }, { startedAt: at(40), endedAt: at(50) }], at(60)), RangeError);
  assert.throws(() => remainingReviewMs(at(0), -1, [], at(1)), RangeError);
});

test("legacy delivered rows are classified conservatively and never auto-completed", () => {
  assert.deepEqual(classifyLegacyDelivery({ status: "DELIVERED", deliveredAt: at(0), deadlineAt: at(72) }), { category: "VALID_DELIVERY_AND_DEADLINE", autoCompletionEligible: false });
  assert.equal(classifyLegacyDelivery({ status: "DELIVERED", deliveredAt: at(0), deadlineAt: null }).category, "DERIVABLE_DEADLINE");
  assert.equal(classifyLegacyDelivery({ status: "DELIVERED", deliveredAt: null, deadlineAt: at(72) }).category, "UNSUPPORTED_DEADLINE");
  assert.equal(classifyLegacyDelivery({ status: "DELIVERED", deliveredAt: null, deadlineAt: null }).category, "NO_VERIFIABLE_DELIVERY");
  assert.equal(classifyLegacyDelivery({ status: "COMPLETED", deliveredAt: at(0), deadlineAt: at(72) }).category, "ALREADY_COMPLETED");
});

test("multiple pending cancellations produce one global pause interval", async () => {
  const timer: Record<string, any> = { id: "t1", bookingId: "b1", deliveryAt: at(0), durationMs: REVIEW_DURATION_MS, version: 1, deadlineAt: at(72), pausedAt: null, remainingMs: null, closedAt: null, pauseIntervals: [] };
  const created: any[] = [];
  const tx = {
    $queryRaw: async () => [],
    bookingReviewTimer: { findUnique: async () => ({ ...timer, pauseIntervals: [...timer.pauseIntervals] }), update: async ({ data }: any) => Object.assign(timer, data) },
    cancellationRequest: { findMany: async () => [{ id: "c1", requesterId: "u1" }, { id: "c2", requesterId: "u2" }] },
    revisionRequest: { findMany: async () => [] }, revisionEscalationRequest: { findMany: async () => [] }, dispute: { findMany: async () => [] }, disputeAppeal: { findMany: async () => [] },
    bookingReviewPauseInterval: { create: async ({ data }: any) => { const row = { id: "p1", ...data, endedAt: null }; created.push(row); timer.pauseIntervals.push(row); return row; } },
    bookingReviewJob: { findUnique: async () => ({ id: "j1" }), update: async () => undefined },
  } as never;
  await syncReviewTimerBlockers(tx, "b1", at(24));
  await syncReviewTimerBlockers(tx, "b1", at(25));
  assert.equal(created.length, 1);
  assert.equal(timer.remainingMs, 48 * 60 * 60 * 1000);
  assert.equal(timer.deadlineAt, null);
});

test("clearing the final blocker resumes with the preserved remainder", async () => {
  const interval = { id: "p1", startedAt: at(24), endedAt: null as Date | null, endType: null as string | null };
  const timer: Record<string, any> = { id: "t1", bookingId: "b1", deliveryAt: at(0), durationMs: REVIEW_DURATION_MS, version: 2, deadlineAt: null, pausedAt: at(24), remainingMs: 48 * 60 * 60 * 1000, closedAt: null, pauseIntervals: [interval] };
  const tx = {
    $queryRaw: async () => [],
    bookingReviewTimer: { findUnique: async () => ({ ...timer, pauseIntervals: [...timer.pauseIntervals] }), update: async ({ data }: any) => Object.assign(timer, data) },
    cancellationRequest: { findMany: async () => [] },
    revisionRequest: { findMany: async () => [] }, revisionEscalationRequest: { findMany: async () => [] }, dispute: { findMany: async () => [] }, disputeAppeal: { findMany: async () => [] },
    bookingReviewPauseInterval: { update: async ({ data }: any) => Object.assign(interval, data) },
    bookingReviewJob: { findUnique: async () => ({ id: "j1" }), update: async () => undefined },
  } as never;
  await syncReviewTimerBlockers(tx, "b1", at(30), "admin");
  assert.equal(interval.endedAt?.getTime(), at(30).getTime());
  assert.equal(interval.endType, "RESUMED");
  assert.equal(timer.deadlineAt.getTime(), at(78).getTime());
  assert.equal(timer.remainingMs, null);
});

test("a subsequent delivery gets a new sequence and fresh timer without changing prior cycle history", async () => {
  const rows: any[] = [];
  const jobs: any[] = [];
  const tx = {
    deliveryCycle: {
      aggregate: async () => ({ _max: { sequence: rows.at(-1)?.sequence ?? null } }),
      create: async ({ data }: any) => { const row = { id: `cycle-${rows.length + 1}`, ...data, version: 1, active: true, status: "REVIEW_ACTIVE" }; rows.push(row); return row; },
    },
    deliveryCycleJob: { create: async ({ data }: any) => { jobs.push(data); return data; } },
  } as never;
  const first = await createDeliveryCycle(tx, "b1", at(0));
  const firstSnapshot = { ...first };
  const second = await createDeliveryCycle(tx, "b1", at(100));
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.deadlineAt.getTime(), at(172).getTime());
  assert.deepEqual(first, firstSnapshot);
  assert.equal(jobs[0].deliveryCycleId, first.id);
  assert.equal(jobs[1].deliveryCycleId, second.id);
});

test("cycle pause is idempotent across overlapping blockers and resumes with the saved remainder", async () => {
  const cycle: Record<string, any> = { id: "cycle-1", deliveryAt: at(0), durationMs: REVIEW_DURATION_MS, status: "REVIEW_ACTIVE", version: 1, deadlineAt: at(72), pausedAt: null, remainingMs: null, closedAt: null, pauseIntervals: [] };
  let active = [{ id: "c1", requesterId: "u1" }, { id: "c2", requesterId: "u2" }];
  let intervalId = 0;
  const tx = {
    $queryRaw: async () => [],
    deliveryCycle: { findFirst: async () => ({ ...cycle, pauseIntervals: [...cycle.pauseIntervals] }), update: async ({ data }: any) => Object.assign(cycle, data) },
    cancellationRequest: { findMany: async () => active },
    revisionRequest: { findMany: async () => [] }, revisionEscalationRequest: { findMany: async () => [] }, dispute: { findMany: async () => [] }, disputeAppeal: { findMany: async () => [] },
    deliveryCyclePauseInterval: {
      create: async ({ data }: any) => { const row = { id: `pause-${++intervalId}`, ...data, endedAt: null, endType: null }; cycle.pauseIntervals.push(row); return row; },
      update: async ({ where, data }: any) => { const row = cycle.pauseIntervals.find((item: any) => item.id === where.id); Object.assign(row, data); return row; },
    },
    deliveryCycleJob: { updateMany: async () => ({ count: 1 }) },
  } as never;
  await syncDeliveryCycleBlockers(tx, "b1", at(24));
  await syncDeliveryCycleBlockers(tx, "b1", at(25));
  assert.equal(cycle.pauseIntervals.length, 1);
  assert.equal(cycle.remainingMs, 48 * 60 * 60 * 1000);
  active = [];
  await syncDeliveryCycleBlockers(tx, "b1", at(30));
  assert.equal(cycle.pauseIntervals[0].endedAt.getTime(), at(30).getTime());
  assert.equal(cycle.deadlineAt.getTime(), at(78).getTime());
  assert.equal(cycle.remainingMs, null);
});

test("active revision and admin assistance requests pause the review timer until every blocker clears", async () => {
  const cycle: Record<string, any> = { id: "cycle-2", deliveryAt: at(0), durationMs: REVIEW_DURATION_MS, status: "REVIEW_ACTIVE", version: 1, deadlineAt: at(72), pausedAt: null, remainingMs: null, closedAt: null, pauseIntervals: [] };
  let revisions = [{ id: "revision-1" }];
  let escalations: Array<{ id: string }> = [];
  const tx = {
    $queryRaw: async () => [],
    deliveryCycle: { findFirst: async () => ({ ...cycle, pauseIntervals: [...cycle.pauseIntervals] }), update: async ({ data }: any) => Object.assign(cycle, data) },
    cancellationRequest: { findMany: async () => [] },
    revisionRequest: { findMany: async () => revisions },
    revisionEscalationRequest: { findMany: async () => escalations }, dispute: { findMany: async () => [] }, disputeAppeal: { findMany: async () => [] },
    deliveryCyclePauseInterval: {
      create: async ({ data }: any) => { const row = { id: `pause-${cycle.pauseIntervals.length + 1}`, ...data, endedAt: null, endType: null }; cycle.pauseIntervals.push(row); return row; },
      update: async ({ where, data }: any) => { const row = cycle.pauseIntervals.find((item: any) => item.id === where.id); Object.assign(row, data); return row; },
    },
    deliveryCycleJob: { updateMany: async () => ({ count: 1 }) },
  } as never;
  await syncDeliveryCycleBlockers(tx, "b1", at(24));
  assert.equal(cycle.status, "REVIEW_PAUSED");
  revisions = [];
  escalations = [{ id: "escalation-1" }];
  await syncDeliveryCycleBlockers(tx, "b1", at(30));
  assert.equal(cycle.status, "REVIEW_PAUSED");
  escalations = [];
  await syncDeliveryCycleBlockers(tx, "b1", at(36));
  assert.equal(cycle.status, "REVIEW_ACTIVE");
  assert.equal(cycle.deadlineAt.getTime(), at(84).getTime());
});

test("dispute, appeal and assistance overlap under one global pause without double subtraction", async () => {
  const cycle: Record<string, any> = { id: "cycle-dispute", deliveryAt: at(0), durationMs: REVIEW_DURATION_MS, status: "REVIEW_ACTIVE", version: 1, deadlineAt: at(72), pausedAt: null, remainingMs: null, closedAt: null, pauseIntervals: [] };
  let disputes = [{ id: "dispute-1" }];
  let appeals: Array<{ id: string }> = [];
  let assistance: Array<{ id: string }> = [];
  const tx = {
    $queryRaw: async () => [],
    deliveryCycle: { findFirst: async () => ({ ...cycle, pauseIntervals: [...cycle.pauseIntervals] }), update: async ({ data }: any) => Object.assign(cycle, data) },
    cancellationRequest: { findMany: async () => [] }, revisionRequest: { findMany: async () => [], findFirst: async () => null },
    revisionEscalationRequest: { findMany: async () => assistance }, dispute: { findMany: async () => disputes }, disputeAppeal: { findMany: async () => appeals },
    deliveryCyclePauseInterval: {
      create: async ({ data }: any) => { const row = { id: `pause-${cycle.pauseIntervals.length + 1}`, ...data, endedAt: null, endType: null }; cycle.pauseIntervals.push(row); return row; },
      update: async ({ where, data }: any) => { const row = cycle.pauseIntervals.find((item: any) => item.id === where.id); Object.assign(row, data); return row; },
    },
    deliveryCycleJob: { updateMany: async () => ({ count: 1 }) },
  } as never;
  await syncDeliveryCycleBlockers(tx, "b1", at(24));
  assert.equal(cycle.pauseIntervals.length, 1);
  disputes = [];
  appeals = [{ id: "appeal-1" }];
  assistance = [{ id: "assistance-1" }];
  await syncDeliveryCycleBlockers(tx, "b1", at(40));
  assert.equal(cycle.pauseIntervals.length, 1);
  appeals = [];
  await syncDeliveryCycleBlockers(tx, "b1", at(50));
  assert.equal(cycle.status, "REVIEW_PAUSED");
  assistance = [];
  await syncDeliveryCycleBlockers(tx, "b1", at(60));
  assert.equal(cycle.pauseIntervals.length, 1);
  assert.equal(cycle.pauseIntervals[0].endedAt.getTime(), at(60).getTime());
  assert.equal(cycle.deadlineAt.getTime(), at(108).getTime());
  assert.equal(cycle.remainingMs, null);
});
