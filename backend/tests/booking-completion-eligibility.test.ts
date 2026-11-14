import test from "node:test";
import assert from "node:assert/strict";
import { checkCompletionEligibility } from "../src/modules/bookings/completion-eligibility.ts";

const deliveredAt = new Date("2025-12-31T00:00:00Z");
const dueAt = new Date(deliveredAt.getTime() + 72 * 60 * 60 * 1000);
function cycle(overrides: Record<string, unknown> = {}) {
  return { id: "cycle-1", bookingId: "b1", sequence: 1, active: true, status: "REVIEW_ACTIVE", deliveryAt: deliveredAt,
    durationMs: 259200000, deadlineAt: dueAt, remainingMs: null, pausedAt: null, version: 4, closedAt: null, pauseIntervals: [], ...overrides };
}
function fakeTx(options: { bookingStatus?: string | null; cancellations?: Array<{ id: string; requesterId: string }>; cycle?: Record<string, unknown> | null } = {}) {
  const locks: string[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join("")); return []; },
    booking: { findUnique: async () => options.bookingStatus === null ? null : { id: "b1", status: options.bookingStatus ?? "DELIVERED" } },
    cancellationRequest: { findMany: async () => options.cancellations ?? [] },
    revisionRequest: { findMany: async () => [] },
    revisionEscalationRequest: { findMany: async () => [] },
    dispute: { findMany: async () => [] }, disputeAppeal: { findMany: async () => [] },
    deliveryCycle: { findFirst: async () => options.cycle === undefined ? cycle() : options.cycle },
  };
  return { tx: tx as never, locks };
}

test("customer completion is allowed for a consistent active delivery cycle", async () => {
  const { tx, locks } = fakeTx();
  const result = await checkCompletionEligibility(tx, "b1", "CUSTOMER", new Date("2026-01-01T00:00:00Z"));
  assert.equal(result.eligible, true);
  assert.equal(result.cycle.id, "cycle-1");
  assert.match(locks[0]!, /Booking/);
  assert.match(locks[1]!, /DeliveryCycle/);
});

test("customer completion is blocked while cancellation is pending", async () => {
  const { tx } = fakeTx({ cancellations: [{ id: "c1", requesterId: "u1" }] });
  assert.deepEqual(await checkCompletionEligibility(tx, "b1", "CUSTOMER", new Date()), { eligible: false, reason: "ACTIVE_BLOCKER" });
});

test("scheduler requires a due cycle and current generation", async () => {
  const now = new Date(dueAt.getTime() + 1);
  assert.equal((await checkCompletionEligibility(fakeTx().tx, "b1", "SCHEDULER", now, 4)).eligible, true);
  assert.deepEqual(await checkCompletionEligibility(fakeTx().tx, "b1", "SCHEDULER", now, 3), { eligible: false, reason: "TIMER_VERSION" });
  assert.deepEqual(await checkCompletionEligibility(fakeTx().tx, "b1", "SCHEDULER", new Date(dueAt.getTime() - 1), 4), { eligible: false, reason: "NOT_DUE" });
});

test("scheduler cannot complete when cancellation becomes active", async () => {
  assert.deepEqual(await checkCompletionEligibility(fakeTx({ cancellations: [{ id: "c1", requesterId: "u1" }] }).tx, "b1", "SCHEDULER", dueAt, 4), { eligible: false, reason: "ACTIVE_BLOCKER" });
});

test("non-delivered bookings are never eligible", async () => {
  assert.deepEqual(await checkCompletionEligibility(fakeTx({ bookingStatus: "CANCELLED" }).tx, "b1", "CUSTOMER", new Date()), { eligible: false, reason: "BOOKING_STATE" });
});

test("legacy delivered bookings without a safely mapped cycle remain held", async () => {
  for (const mode of ["CUSTOMER", "SCHEDULER"] as const) {
    assert.deepEqual(await checkCompletionEligibility(fakeTx({ cycle: null }).tx, "b1", mode, dueAt, 1), { eligible: false, reason: "LEGACY_REVIEW_REQUIRED" });
  }
});

test("paused, closed, and ledger-inconsistent cycles cannot complete", async () => {
  const paused = cycle({ status: "REVIEW_PAUSED", deadlineAt: null, pausedAt: deliveredAt, remainingMs: 1000 });
  assert.deepEqual(await checkCompletionEligibility(fakeTx({ cycle: paused }).tx, "b1", "CUSTOMER", dueAt), { eligible: false, reason: "TIMER_STATE" });
  const badLedger = cycle({ deadlineAt: new Date(dueAt.getTime() + 1) });
  assert.deepEqual(await checkCompletionEligibility(fakeTx({ cycle: badLedger }).tx, "b1", "CUSTOMER", dueAt), { eligible: false, reason: "TIMER_STATE" });
});
