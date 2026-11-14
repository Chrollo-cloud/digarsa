import assert from "node:assert/strict";
import test from "node:test";
import { appealDeadline, canReviewAppeal, clarificationDeadline, disputeActionCompatibility, disputeCategoryCompatibility, isAppealWindowOpen, isClarificationResponseOpen, nextAppealStatus, nextDisputeStatus } from "../src/modules/bookings/dispute-policy.ts";

test("dispute categories enforce booking, delivery-cycle, revision and cancellation compatibility", () => {
  assert.match(disputeCategoryCompatibility("SERVICE_NOT_AS_DESCRIBED", { bookingStatus: "ACCEPTED", hasActiveDeliveryCycle: false })!, /paid or delivered/);
  assert.equal(disputeCategoryCompatibility("DELIVERY_ISSUE", { bookingStatus: "DELIVERED", hasActiveDeliveryCycle: true, deliveryCycleStatus: "REVIEW_PAUSED" }), null);
  assert.match(disputeCategoryCompatibility("DELIVERY_ISSUE", { bookingStatus: "DELIVERED", hasActiveDeliveryCycle: false })!, /active review cycle/);
  assert.equal(disputeCategoryCompatibility("REVISION_ISSUE", { bookingStatus: "DELIVERED", hasActiveDeliveryCycle: true, relatedRevisionId: "r1", relatedRevisionStatus: "FAILED" }), null);
  assert.match(disputeCategoryCompatibility("REVISION_ISSUE", { bookingStatus: "DELIVERED", hasActiveDeliveryCycle: true })!, /reference a revision/);
  assert.equal(disputeCategoryCompatibility("CANCELLATION_ISSUE", { bookingStatus: "PAID", hasActiveDeliveryCycle: false, relatedCancellationId: "c1", relatedCancellationStatus: "PENDING" }), null);
  assert.match(disputeCategoryCompatibility("CANCELLATION_ISSUE", { bookingStatus: "PAID", hasActiveDeliveryCycle: false })!, /pending or rejected/);
  assert.match(disputeCategoryCompatibility("OTHER", { bookingStatus: "COMPLETED", hasActiveDeliveryCycle: false })!, /non-terminal/);
});

test("clarification and appeal deadlines use persisted UTC instants and elapsed 48-hour windows", () => {
  const start = new Date("2026-02-01T03:00:00.000Z");
  assert.equal(clarificationDeadline(start).toISOString(), "2026-02-03T03:00:00.000Z");
  assert.equal(isClarificationResponseOpen(clarificationDeadline(start), new Date("2026-02-03T02:59:59.999Z")), true);
  assert.equal(isClarificationResponseOpen(clarificationDeadline(start), new Date("2026-02-03T03:00:00.000Z")), false);
  assert.equal(appealDeadline(start).toISOString(), "2026-02-03T03:00:00.000Z");
  assert.equal(isAppealWindowOpen(start, appealDeadline(start)), true);
  assert.equal(isAppealWindowOpen(start, new Date(appealDeadline(start).getTime() + 1)), false);
});

test("dispute and appeal transitions are restricted and appeal reviewer is independent", () => {
  assert.equal(nextDisputeStatus("OPEN", "REQUEST_CUSTOMER"), "WAITING_CUSTOMER");
  assert.equal(nextDisputeStatus("WAITING_SELLER", "PARTY_RESPONDED"), "OPEN");
  assert.throws(() => nextDisputeStatus("DECIDED", "START_REVIEW"), RangeError);
  assert.equal(nextAppealStatus("SUBMITTED", "ASSIGN_AND_START"), "IN_REVIEW");
  assert.equal(nextAppealStatus("IN_REVIEW", "DECIDE"), "DECIDED");
  assert.throws(() => nextAppealStatus("DECIDED", "DECIDE"), RangeError);
  assert.equal(canReviewAppeal("admin-2", "admin-1", ["admin-1", "admin-2"]), true);
  assert.equal(canReviewAppeal("admin-1", "admin-1", ["admin-1"]), false);
});

test("dispute booking actions reject terminal booking states", () => {
  for (const status of ["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"]) {
    assert.equal(disputeActionCompatibility("CONTINUE_BOOKING", status), null);
  }
  for (const status of ["COMPLETED", "CANCELLED", "REJECTED", "MISSING"]) {
    assert.match(disputeActionCompatibility("CONTINUE_BOOKING", status)!, /cannot continue/);
    assert.match(disputeActionCompatibility("CANCEL_BOOKING", status)!, /cannot continue/);
  }
  assert.match(disputeActionCompatibility("UNSUPPORTED", "DELIVERED")!, /invalid/);
});
