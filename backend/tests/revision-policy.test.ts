import test from "node:test";
import assert from "node:assert/strict";
import { remainingQuota, revisionPolicyHash, revisionPolicyDto, revisionRequestCutoff } from "../src/modules/bookings/revision-policy.ts";

const policy = { revisionPolicyVersion: 1, revisionFreeCount: 2, revisionRequestWindowHours: 24, revisionTerms: "One round of reasonable changes." };

test("revision policy snapshot hash is stable and changes when any policy value changes", () => {
  const hash = revisionPolicyHash(policy);
  assert.equal(hash?.length, 64);
  assert.equal(revisionPolicyHash({ ...policy }), hash);
  assert.notEqual(revisionPolicyHash({ ...policy, revisionFreeCount: 3 }), hash);
  assert.notEqual(revisionPolicyHash({ ...policy, revisionRequestWindowHours: 48 }), hash);
  assert.notEqual(revisionPolicyHash({ ...policy, revisionTerms: "Different terms." }), hash);
  assert.notEqual(revisionPolicyHash({ ...policy, revisionPolicyVersion: 2 }), hash);
});

test("unconfigured legacy policy has no public snapshot and zero free revisions is valid", () => {
  assert.equal(revisionPolicyDto({ ...policy, revisionFreeCount: null }), null);
  const zero = revisionPolicyDto({ ...policy, revisionFreeCount: 0 });
  assert.equal(zero?.free_revision_count, 0);
  assert.deepEqual(remainingQuota(0, { available: null, reserved: null, consumed: null, expired: null }), { available: 0, reserved: 0, consumed: 0, expired: 0 });
});

test("quota ledger deltas reconcile and reject negative or over-issued balances", () => {
  assert.deepEqual(remainingQuota(2, { available: -1, reserved: 0, consumed: 1, expired: 0 }), { available: 1, reserved: 0, consumed: 1, expired: 0 });
  assert.throws(() => remainingQuota(2, { available: -3, reserved: 0, consumed: 0, expired: 0 }), RangeError);
  assert.throws(() => remainingQuota(2, { available: 0, reserved: 1, consumed: 1, expired: 1 }), /does not reconcile/);
});

test("revision request cutoff is the earlier policy or review deadline and rejects expired windows", () => {
  const deliveryAt = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-01-01T10:00:00Z");
  assert.equal(revisionRequestCutoff({ deliveryAt, policyWindowHours: 24, deadlineAt: new Date("2026-01-04T00:00:00Z"), remainingMs: null, now }), new Date("2026-01-02T00:00:00Z").getTime());
  assert.equal(revisionRequestCutoff({ deliveryAt, policyWindowHours: 72, deadlineAt: new Date("2026-01-02T00:00:00Z"), remainingMs: null, now }), new Date("2026-01-02T00:00:00Z").getTime());
  assert.equal(revisionRequestCutoff({ deliveryAt, policyWindowHours: 12, deadlineAt: new Date("2026-01-01T09:00:00Z"), remainingMs: null, now }), null);
  assert.throws(() => revisionRequestCutoff({ deliveryAt, policyWindowHours: 36, deadlineAt: new Date("2026-01-04T00:00:00Z"), remainingMs: null, now }), RangeError);
});
