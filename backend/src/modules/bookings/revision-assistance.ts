import type { RevisionEscalationStatus } from "../../generated/prisma/client.js";

export type RevisionAssistanceAction = "START_REVIEW" | "RESOLVE" | "CLOSE" | "REOPEN";

export function nextRevisionAssistanceStatus(current: RevisionEscalationStatus, action: RevisionAssistanceAction): RevisionEscalationStatus {
  if (action === "START_REVIEW" && current === "OPEN") return "IN_REVIEW";
  if (action === "RESOLVE" && current === "IN_REVIEW") return "RESOLVED";
  if (action === "CLOSE" && current === "RESOLVED") return "CLOSED";
  if (action === "REOPEN" && current === "RESOLVED") return "IN_REVIEW";
  throw new RangeError(`Invalid revision assistance transition: ${current} via ${action}`);
}

export function isRevisionAssistanceActive(status: RevisionEscalationStatus) {
  return status === "OPEN" || status === "IN_REVIEW";
}

export function isAssistanceSlaOverdue(slaDueAt: Date, now: Date) {
  const due = slaDueAt.getTime();
  const current = now.getTime();
  if (!Number.isFinite(due) || !Number.isFinite(current)) throw new RangeError("Invalid assistance SLA timestamp");
  return current >= due;
}
