export const DISPUTE_ACTIVE_STATUSES = ["OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "WAITING_SELLER"] as const;
export const APPEAL_ACTIVE_STATUSES = ["SUBMITTED", "IN_REVIEW"] as const;
export const DISPUTE_CLARIFICATION_WINDOW_MS = 48 * 60 * 60 * 1000;
export const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

export type DisputeCategory = "SERVICE_NOT_AS_DESCRIBED" | "DELIVERY_ISSUE" | "REVISION_ISSUE" | "CANCELLATION_ISSUE" | "OTHER";
export type DisputeStateEvidence = {
  bookingStatus: string;
  hasActiveDeliveryCycle: boolean;
  deliveryCycleStatus?: string | null;
  relatedRevisionId?: string | null;
  relatedRevisionStatus?: string | null;
  relatedCancellationId?: string | null;
  relatedCancellationStatus?: string | null;
};

export function disputeActionCompatibility(action: string, bookingStatus: string): string | null {
  if (!["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"].includes(bookingStatus)) return `Booking status ${bookingStatus} cannot continue through a dispute outcome.`;
  if (!["CONTINUE_BOOKING", "RETURN_TO_REVISION", "CANCEL_BOOKING"].includes(action)) return "Dispute next action is invalid.";
  return null;
}

export function disputeCategoryCompatibility(category: DisputeCategory, state: DisputeStateEvidence): string | null {
  if (!["REQUESTED", "ACCEPTED", "PAID", "DELIVERED"].includes(state.bookingStatus)) return "A dispute can only be opened for a non-terminal booking.";
  if (category === "SERVICE_NOT_AS_DESCRIBED" && !["PAID", "DELIVERED"].includes(state.bookingStatus)) return "Service-description disputes require a paid or delivered booking.";
  if (category === "DELIVERY_ISSUE" && (state.bookingStatus !== "DELIVERED" || !state.hasActiveDeliveryCycle || !["REVIEW_ACTIVE", "REVIEW_PAUSED"].includes(state.deliveryCycleStatus ?? ""))) return "Delivery disputes require a delivered booking with an active review cycle.";
  if (category === "REVISION_ISSUE" && (!state.relatedRevisionId || !state.relatedRevisionStatus)) return "Revision disputes must reference a revision belonging to this booking.";
  if (category === "CANCELLATION_ISSUE" && (!state.relatedCancellationId || !["PENDING", "REJECTED"].includes(state.relatedCancellationStatus ?? ""))) return "Cancellation disputes must reference a pending or rejected cancellation request for this booking.";
  if (category === "REVISION_ISSUE" && state.relatedCancellationId) return "Revision disputes cannot use a cancellation reference.";
  if (category === "CANCELLATION_ISSUE" && state.relatedRevisionId) return "Cancellation disputes cannot use a revision reference.";
  return null;
}

export function clarificationDeadline(requestedAt: Date) {
  if (!Number.isFinite(requestedAt.getTime())) throw new RangeError("Invalid clarification request timestamp");
  return new Date(requestedAt.getTime() + DISPUTE_CLARIFICATION_WINDOW_MS);
}

export function isClarificationResponseOpen(dueAt: Date, now: Date) {
  return Number.isFinite(dueAt.getTime()) && Number.isFinite(now.getTime()) && now.getTime() < dueAt.getTime();
}

export function appealDeadline(decisionAt: Date) {
  if (!Number.isFinite(decisionAt.getTime())) throw new RangeError("Invalid dispute decision timestamp");
  return new Date(decisionAt.getTime() + APPEAL_WINDOW_MS);
}

export function isAppealWindowOpen(decisionAt: Date, now: Date) {
  return Number.isFinite(decisionAt.getTime()) && Number.isFinite(now.getTime()) && now.getTime() <= appealDeadline(decisionAt).getTime();
}

export function canReviewAppeal(reviewerId: string, decisionMakerId: string, activeAdminIds: string[]) {
  return reviewerId !== decisionMakerId && activeAdminIds.includes(reviewerId);
}

export function nextAppealStatus(current: string, action: "ASSIGN_AND_START" | "DECIDE") {
  if (current === "SUBMITTED" && action === "ASSIGN_AND_START") return "IN_REVIEW" as const;
  if (current === "IN_REVIEW" && action === "DECIDE") return "DECIDED" as const;
  throw new RangeError(`Invalid appeal transition: ${current} -> ${action}`);
}

export function nextDisputeStatus(current: string, action: "START_REVIEW" | "REQUEST_CUSTOMER" | "REQUEST_SELLER" | "PARTY_RESPONDED" | "DECIDE") {
  if (current === "OPEN" && action === "START_REVIEW") return "IN_REVIEW" as const;
  if (["OPEN", "IN_REVIEW"].includes(current) && action === "REQUEST_CUSTOMER") return "WAITING_CUSTOMER" as const;
  if (["OPEN", "IN_REVIEW"].includes(current) && action === "REQUEST_SELLER") return "WAITING_SELLER" as const;
  if (["WAITING_CUSTOMER", "WAITING_SELLER"].includes(current) && action === "PARTY_RESPONDED") return "OPEN" as const;
  if (["OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "WAITING_SELLER"].includes(current) && action === "DECIDE") return "DECIDED" as const;
  throw new RangeError(`Invalid dispute transition: ${current} -> ${action}`);
}
