import { createHash } from "node:crypto";

export const REVISION_WINDOW_UNIT = "ELAPSED_HOURS" as const;
export const REVISION_WINDOW_ANCHOR = "LATEST_SERVER_PERSISTED_DELIVERY" as const;
export const ALLOWED_REVISION_WINDOWS = [12, 24, 48, 72] as const;
const HOUR_MS = 60 * 60 * 1000;

export function revisionRequestCutoff(input: {
  deliveryAt: Date; policyWindowHours: number; deadlineAt: Date | null; remainingMs: number | null; now: Date;
}) {
  if (!(ALLOWED_REVISION_WINDOWS as readonly number[]).includes(input.policyWindowHours)) throw new RangeError("Unsupported revision request window");
  const deliveryMs = input.deliveryAt.getTime();
  const nowMs = input.now.getTime();
  const reviewMs = input.deadlineAt?.getTime() ?? (input.remainingMs === null ? Number.NaN : nowMs + input.remainingMs);
  if (![deliveryMs, nowMs, reviewMs].every(Number.isFinite) || deliveryMs > nowMs || reviewMs < nowMs) return null;
  return Math.min(deliveryMs + input.policyWindowHours * HOUR_MS, reviewMs);
}

export type RevisionPolicyInput = {
  revisionPolicyVersion: number;
  revisionFreeCount: number | null;
  revisionRequestWindowHours: number | null;
  revisionTerms: string | null;
};

export function revisionPolicyHash(policy: RevisionPolicyInput) {
  if (policy.revisionFreeCount === null || policy.revisionRequestWindowHours === null || policy.revisionTerms === null) return null;
  const canonical = JSON.stringify({
    version: policy.revisionPolicyVersion,
    free_revision_count: policy.revisionFreeCount,
    request_window_duration: policy.revisionRequestWindowHours,
    request_window_unit: REVISION_WINDOW_UNIT,
    request_window_anchor: REVISION_WINDOW_ANCHOR,
    terms: policy.revisionTerms,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function revisionPolicyDto(policy: RevisionPolicyInput) {
  const hash = revisionPolicyHash(policy);
  if (!hash || policy.revisionFreeCount === null || policy.revisionRequestWindowHours === null || policy.revisionTerms === null) return null;
  return {
    version: policy.revisionPolicyVersion,
    hash,
    free_revision_count: policy.revisionFreeCount,
    request_window_duration: policy.revisionRequestWindowHours,
    request_window_unit: REVISION_WINDOW_UNIT,
    request_window_anchor: REVISION_WINDOW_ANCHOR,
    terms: policy.revisionTerms,
  };
}

export function remainingQuota(snapshotCount: number, deltas: { available: number | null; reserved: number | null; consumed: number | null; expired: number | null }) {
  const available = snapshotCount + (deltas.available ?? 0);
  const reserved = deltas.reserved ?? 0;
  const consumed = deltas.consumed ?? 0;
  const expired = deltas.expired ?? 0;
  if ([available, reserved, consumed, expired].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError("Revision quota ledger is inconsistent");
  }
  if (available + reserved + consumed + expired !== snapshotCount) throw new RangeError("Revision quota ledger does not reconcile to the immutable policy snapshot");
  return { available, reserved, consumed, expired };
}
