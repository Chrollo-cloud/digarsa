-- Align names of this phase's new constraints/indexes with Prisma's generated
-- names and add the scalar one-to-one uniqueness for consumed revisions.
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_booking_fkey" TO "Dispute_bookingId_fkey";
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_cancellation_booking_fkey" TO "Dispute_bookingId_relatedCancellationId_fkey";
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_creator_fkey" TO "Dispute_createdById_fkey";
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_cycle_booking_fkey" TO "Dispute_bookingId_deliveryCycleId_fkey";
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_decision_admin_fkey" TO "Dispute_decisionById_fkey";
ALTER TABLE "Dispute" RENAME CONSTRAINT "Dispute_revision_booking_fkey" TO "Dispute_bookingId_relatedRevisionId_fkey";

ALTER TABLE "DisputeAppeal" RENAME CONSTRAINT "DisputeAppeal_appellant_fkey" TO "DisputeAppeal_appellantId_fkey";
ALTER TABLE "DisputeAppeal" RENAME CONSTRAINT "DisputeAppeal_assigner_fkey" TO "DisputeAppeal_assignedById_fkey";
ALTER TABLE "DisputeAppeal" RENAME CONSTRAINT "DisputeAppeal_dispute_fkey" TO "DisputeAppeal_disputeId_fkey";
ALTER TABLE "DisputeAppeal" RENAME CONSTRAINT "DisputeAppeal_reviewer_fkey" TO "DisputeAppeal_assignedReviewerId_fkey";
ALTER TABLE "DisputeAppealEvent" RENAME CONSTRAINT "DisputeAppealEvent_actor_fkey" TO "DisputeAppealEvent_actorUserId_fkey";
ALTER TABLE "DisputeAppealEvent" RENAME CONSTRAINT "DisputeAppealEvent_appeal_fkey" TO "DisputeAppealEvent_appealId_fkey";

ALTER TABLE "DisputeClarification" RENAME CONSTRAINT "DisputeClarification_closer_fkey" TO "DisputeClarification_closedById_fkey";
ALTER TABLE "DisputeClarification" RENAME CONSTRAINT "DisputeClarification_dispute_fkey" TO "DisputeClarification_disputeId_fkey";
ALTER TABLE "DisputeClarification" RENAME CONSTRAINT "DisputeClarification_recipient_fkey" TO "DisputeClarification_recipientUserId_fkey";
ALTER TABLE "DisputeClarification" RENAME CONSTRAINT "DisputeClarification_requester_fkey" TO "DisputeClarification_requestedById_fkey";
ALTER TABLE "DisputeClarification" RENAME CONSTRAINT "DisputeClarification_responder_fkey" TO "DisputeClarification_respondedById_fkey";
ALTER TABLE "DisputeEvent" RENAME CONSTRAINT "DisputeEvent_actor_fkey" TO "DisputeEvent_actorUserId_fkey";
ALTER TABLE "DisputeEvent" RENAME CONSTRAINT "DisputeEvent_dispute_fkey" TO "DisputeEvent_disputeId_fkey";
ALTER TABLE "DisputeEvidenceAccess" RENAME CONSTRAINT "DisputeEvidenceAccess_dispute_fkey" TO "DisputeEvidenceAccess_disputeId_fkey";
ALTER TABLE "DisputeEvidenceAccess" RENAME CONSTRAINT "DisputeEvidenceAccess_viewer_fkey" TO "DisputeEvidenceAccess_viewerId_fkey";

ALTER TABLE "DisputeMessageEvidence" RENAME CONSTRAINT "DisputeMessageEvidence_dispute_fkey" TO "DisputeMessageEvidence_disputeId_fkey";
ALTER TABLE "DisputeMessageEvidence" RENAME CONSTRAINT "DisputeMessageEvidence_linker_fkey" TO "DisputeMessageEvidence_linkedByUserId_fkey";
ALTER TABLE "DisputeMessageEvidence" RENAME CONSTRAINT "DisputeMessageEvidence_message_fkey" TO "DisputeMessageEvidence_messageId_fkey";
ALTER TABLE "DisputeReportEvidence" RENAME CONSTRAINT "DisputeReportEvidence_dispute_fkey" TO "DisputeReportEvidence_disputeId_fkey";
ALTER TABLE "DisputeReportEvidence" RENAME CONSTRAINT "DisputeReportEvidence_linker_fkey" TO "DisputeReportEvidence_linkedByUserId_fkey";
ALTER TABLE "DisputeReportEvidence" RENAME CONSTRAINT "DisputeReportEvidence_report_fkey" TO "DisputeReportEvidence_reportId_fkey";
ALTER TABLE "DisputeRevisionAuthorization" RENAME CONSTRAINT "DisputeRevisionAuthorization_cycle_fkey" TO "DisputeRevisionAuthorization_bookingId_deliveryCycleId_fkey";
ALTER TABLE "DisputeRevisionAuthorization" RENAME CONSTRAINT "DisputeRevisionAuthorization_dispute_fkey" TO "DisputeRevisionAuthorization_bookingId_disputeId_fkey";
ALTER TABLE "DisputeRevisionAuthorization" RENAME CONSTRAINT "DisputeRevisionAuthorization_revision_fkey" TO "DisputeRevisionAuthorization_bookingId_consumedRevisionId_fkey";

ALTER INDEX "DisputeRevisionAuthorization_bookingId_deliveryCycleId_status_i" RENAME TO "DisputeRevisionAuthorization_bookingId_deliveryCycleId_stat_idx";
CREATE UNIQUE INDEX "DisputeRevisionAuthorization_consumedRevisionId_key" ON "DisputeRevisionAuthorization"("consumedRevisionId");
