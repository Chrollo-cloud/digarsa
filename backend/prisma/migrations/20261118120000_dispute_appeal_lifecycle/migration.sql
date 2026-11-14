-- Additive dispute and appeal lifecycle. Existing booking, revision and report
-- records remain untouched; no payment or financial state is changed here.
CREATE TYPE "DisputeCategory" AS ENUM (
  'SERVICE_NOT_AS_DESCRIBED', 'DELIVERY_ISSUE', 'REVISION_ISSUE',
  'CANCELLATION_ISSUE', 'OTHER'
);
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'WAITING_CUSTOMER', 'WAITING_SELLER', 'DECIDED');
CREATE TYPE "DisputeNextAction" AS ENUM ('CONTINUE_BOOKING', 'RETURN_TO_REVISION', 'CANCEL_BOOKING');
CREATE TYPE "DisputeClarificationRecipient" AS ENUM ('CUSTOMER', 'SELLER');
CREATE TYPE "DisputeClarificationStatus" AS ENUM ('PENDING', 'RESPONDED', 'CLOSED_WITHOUT_RESPONSE');
CREATE TYPE "DisputeRevisionAuthorizationStatus" AS ENUM ('AVAILABLE', 'USED', 'REVOKED');
CREATE TYPE "AppealStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'DECIDED');
CREATE TYPE "AppealOutcome" AS ENUM ('UPHELD', 'MODIFIED');

ALTER TABLE "CancellationRequest"
  ADD CONSTRAINT "CancellationRequest_bookingId_id_key" UNIQUE ("bookingId", "id");

CREATE TABLE "Dispute" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "deliveryCycleId" TEXT,
  "createdById" TEXT NOT NULL,
  "category" "DisputeCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "relatedRevisionId" TEXT,
  "relatedCancellationId" TEXT,
  "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "decisionAt" TIMESTAMPTZ(3),
  "decisionById" TEXT,
  "decisionOutcome" "DisputeNextAction",
  "decisionReason" TEXT,
  "permittedNextAction" TEXT,
  "evidenceRetainUntil" TIMESTAMPTZ(3) NOT NULL,
  "legalHoldAt" TIMESTAMPTZ(3),
  "legalHoldReason" TEXT,
  CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Dispute_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_decision_admin_fkey" FOREIGN KEY ("decisionById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_cycle_booking_fkey" FOREIGN KEY ("bookingId", "deliveryCycleId") REFERENCES "DeliveryCycle"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_revision_booking_fkey" FOREIGN KEY ("bookingId", "relatedRevisionId") REFERENCES "RevisionRequest"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_cancellation_booking_fkey" FOREIGN KEY ("bookingId", "relatedCancellationId") REFERENCES "CancellationRequest"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dispute_version_check" CHECK ("version" > 0),
  CONSTRAINT "Dispute_description_check" CHECK (length(btrim("description")) BETWEEN 20 AND 5000),
  CONSTRAINT "Dispute_legal_hold_check" CHECK (("legalHoldAt" IS NULL AND "legalHoldReason" IS NULL) OR ("legalHoldAt" IS NOT NULL AND length(btrim(COALESCE("legalHoldReason", ''))) >= 5)),
  CONSTRAINT "Dispute_decision_shape_check" CHECK (
    ("status" <> 'DECIDED' AND "decisionAt" IS NULL AND "decisionById" IS NULL AND "decisionOutcome" IS NULL AND "decisionReason" IS NULL AND "permittedNextAction" IS NULL) OR
    ("status" = 'DECIDED' AND "decisionAt" IS NOT NULL AND "decisionById" IS NOT NULL AND "decisionOutcome" IS NOT NULL AND length(btrim(COALESCE("decisionReason", ''))) >= 5 AND length(btrim(COALESCE("permittedNextAction", ''))) >= 3)
  )
);
CREATE UNIQUE INDEX "Dispute_bookingId_id_key" ON "Dispute"("bookingId", "id");
CREATE INDEX "Dispute_bookingId_status_createdAt_idx" ON "Dispute"("bookingId", "status", "createdAt");
CREATE INDEX "Dispute_status_createdAt_id_idx" ON "Dispute"("status", "createdAt", "id");
CREATE INDEX "Dispute_decisionAt_idx" ON "Dispute"("decisionAt");
CREATE UNIQUE INDEX "Dispute_one_active_per_booking" ON "Dispute"("bookingId") WHERE "status" <> 'DECIDED';

CREATE TABLE "DisputeRevisionAuthorization" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "deliveryCycleId" TEXT NOT NULL,
  "status" "DisputeRevisionAuthorizationStatus" NOT NULL DEFAULT 'AVAILABLE',
  "consumedRevisionId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DisputeRevisionAuthorization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeRevisionAuthorization_dispute_fkey" FOREIGN KEY ("bookingId", "disputeId") REFERENCES "Dispute"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeRevisionAuthorization_cycle_fkey" FOREIGN KEY ("bookingId", "deliveryCycleId") REFERENCES "DeliveryCycle"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeRevisionAuthorization_revision_fkey" FOREIGN KEY ("bookingId", "consumedRevisionId") REFERENCES "RevisionRequest"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeRevisionAuthorization_shape_check" CHECK (
    ("status" = 'AVAILABLE' AND "consumedRevisionId" IS NULL AND "usedAt" IS NULL AND "revokedAt" IS NULL) OR
    ("status" = 'USED' AND "consumedRevisionId" IS NOT NULL AND "usedAt" IS NOT NULL AND "revokedAt" IS NULL) OR
    ("status" = 'REVOKED' AND "consumedRevisionId" IS NULL AND "usedAt" IS NULL AND "revokedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "DisputeRevisionAuthorization_bookingId_id_key" ON "DisputeRevisionAuthorization"("bookingId", "id");
CREATE UNIQUE INDEX "DisputeRevisionAuthorization_bookingId_consumedRevisionId_key" ON "DisputeRevisionAuthorization"("bookingId", "consumedRevisionId");
CREATE INDEX "DisputeRevisionAuthorization_bookingId_deliveryCycleId_status_idx" ON "DisputeRevisionAuthorization"("bookingId", "deliveryCycleId", "status");
CREATE UNIQUE INDEX "DisputeRevisionAuthorization_one_available_per_dispute" ON "DisputeRevisionAuthorization"("disputeId") WHERE "status" = 'AVAILABLE';

CREATE TABLE "DisputeEvent" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" "DisputeStatus",
  "toStatus" "DisputeStatus" NOT NULL,
  "reason" TEXT,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeEvent_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeEvent_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DisputeEvent_disputeId_occurredAt_id_idx" ON "DisputeEvent"("disputeId", "occurredAt", "id");

CREATE TABLE "DisputeClarification" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "recipient" "DisputeClarificationRecipient" NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "responseDueAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "DisputeClarificationStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "responseText" TEXT,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMPTZ(3),
  "closedById" TEXT,
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeClarification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeClarification_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeClarification_recipient_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeClarification_requester_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeClarification_responder_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeClarification_closer_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeClarification_version_check" CHECK ("version" > 0),
  CONSTRAINT "DisputeClarification_text_check" CHECK (length(btrim("question")) BETWEEN 5 AND 2000),
  CONSTRAINT "DisputeClarification_deadline_check" CHECK ("responseDueAt" = "requestedAt" + INTERVAL '48 hours'),
  CONSTRAINT "DisputeClarification_response_shape_check" CHECK (
    ("status" = 'PENDING' AND "responseText" IS NULL AND "respondedById" IS NULL AND "respondedAt" IS NULL AND "closedById" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'RESPONDED' AND length(btrim(COALESCE("responseText", ''))) BETWEEN 5 AND 3000 AND "respondedById" = "recipientUserId" AND "respondedAt" IS NOT NULL AND "closedById" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'CLOSED_WITHOUT_RESPONSE' AND "responseText" IS NULL AND "respondedById" IS NULL AND "respondedAt" IS NULL AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL)
  )
);
CREATE INDEX "DisputeClarification_disputeId_requestedAt_id_idx" ON "DisputeClarification"("disputeId", "requestedAt", "id");
CREATE INDEX "DisputeClarification_status_responseDueAt_idx" ON "DisputeClarification"("status", "responseDueAt");
CREATE UNIQUE INDEX "DisputeClarification_one_pending_per_dispute" ON "DisputeClarification"("disputeId") WHERE "status" = 'PENDING';

CREATE TABLE "DisputeReportEvidence" (
  "disputeId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "linkedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeReportEvidence_pkey" PRIMARY KEY ("disputeId", "reportId"),
  CONSTRAINT "DisputeReportEvidence_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeReportEvidence_report_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeReportEvidence_linker_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DisputeReportEvidence_reportId_idx" ON "DisputeReportEvidence"("reportId");

CREATE TABLE "DisputeMessageEvidence" (
  "disputeId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "linkedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeMessageEvidence_pkey" PRIMARY KEY ("disputeId", "messageId"),
  CONSTRAINT "DisputeMessageEvidence_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeMessageEvidence_message_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeMessageEvidence_linker_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DisputeMessageEvidence_messageId_idx" ON "DisputeMessageEvidence"("messageId");

CREATE TABLE "DisputeEvidenceAccess" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accessType" TEXT NOT NULL,
  CONSTRAINT "DisputeEvidenceAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeEvidenceAccess_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeEvidenceAccess_viewer_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeEvidenceAccess_type_check" CHECK ("accessType" IN ('CASE_DETAIL', 'DISPUTE_QUEUE', 'APPEAL_QUEUE'))
);
CREATE INDEX "DisputeEvidenceAccess_disputeId_occurredAt_id_idx" ON "DisputeEvidenceAccess"("disputeId", "occurredAt", "id");
CREATE INDEX "DisputeEvidenceAccess_viewerId_occurredAt_idx" ON "DisputeEvidenceAccess"("viewerId", "occurredAt");

CREATE TABLE "DisputeAppeal" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "appellantId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL,
  "submissionDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "AppealStatus" NOT NULL DEFAULT 'SUBMITTED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "assignedReviewerId" TEXT,
  "assignedById" TEXT,
  "assignmentReason" TEXT,
  "reviewStartedAt" TIMESTAMPTZ(3),
  "outcome" "AppealOutcome",
  "permittedNextAction" "DisputeNextAction",
  "resolutionReason" TEXT,
  "decidedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DisputeAppeal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeAppeal_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeAppeal_appellant_fkey" FOREIGN KEY ("appellantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeAppeal_reviewer_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeAppeal_assigner_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeAppeal_version_check" CHECK ("version" > 0),
  CONSTRAINT "DisputeAppeal_reason_check" CHECK (length(btrim("reason")) BETWEEN 5 AND 3000),
  CONSTRAINT "DisputeAppeal_deadline_check" CHECK ("submissionDeadlineAt" > "submittedAt"),
  CONSTRAINT "DisputeAppeal_lifecycle_check" CHECK (
    ("status" = 'SUBMITTED' AND "assignedReviewerId" IS NULL AND "assignedById" IS NULL AND "assignmentReason" IS NULL AND "reviewStartedAt" IS NULL AND "outcome" IS NULL AND "permittedNextAction" IS NULL AND "resolutionReason" IS NULL AND "decidedAt" IS NULL) OR
    ("status" = 'IN_REVIEW' AND "assignedReviewerId" IS NOT NULL AND "assignedById" IS NOT NULL AND length(btrim(COALESCE("assignmentReason", ''))) >= 5 AND "reviewStartedAt" IS NOT NULL AND "outcome" IS NULL AND "permittedNextAction" IS NULL AND "resolutionReason" IS NULL AND "decidedAt" IS NULL) OR
    ("status" = 'DECIDED' AND "assignedReviewerId" IS NOT NULL AND "assignedById" IS NOT NULL AND "reviewStartedAt" IS NOT NULL AND "outcome" IS NOT NULL AND "permittedNextAction" IS NOT NULL AND length(btrim(COALESCE("resolutionReason", ''))) >= 5 AND "decidedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "DisputeAppeal_disputeId_appellantId_key" ON "DisputeAppeal"("disputeId", "appellantId");
CREATE INDEX "DisputeAppeal_status_submittedAt_id_idx" ON "DisputeAppeal"("status", "submittedAt", "id");
CREATE INDEX "DisputeAppeal_assignedReviewerId_status_idx" ON "DisputeAppeal"("assignedReviewerId", "status");

CREATE TABLE "DisputeAppealEvent" (
  "id" TEXT NOT NULL,
  "appealId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" "AppealStatus",
  "toStatus" "AppealStatus" NOT NULL,
  "reason" TEXT,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeAppealEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisputeAppealEvent_appeal_fkey" FOREIGN KEY ("appealId") REFERENCES "DisputeAppeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DisputeAppealEvent_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DisputeAppealEvent_appealId_occurredAt_id_idx" ON "DisputeAppealEvent"("appealId", "occurredAt", "id");

CREATE FUNCTION "reject_dispute_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Dispute history and evidence links are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DisputeEvent_append_only" BEFORE UPDATE OR DELETE ON "DisputeEvent" FOR EACH ROW EXECUTE FUNCTION "reject_dispute_history_mutation"();
CREATE TRIGGER "DisputeReportEvidence_append_only" BEFORE UPDATE OR DELETE ON "DisputeReportEvidence" FOR EACH ROW EXECUTE FUNCTION "reject_dispute_history_mutation"();
CREATE TRIGGER "DisputeMessageEvidence_append_only" BEFORE UPDATE OR DELETE ON "DisputeMessageEvidence" FOR EACH ROW EXECUTE FUNCTION "reject_dispute_history_mutation"();
CREATE TRIGGER "DisputeEvidenceAccess_append_only" BEFORE UPDATE OR DELETE ON "DisputeEvidenceAccess" FOR EACH ROW EXECUTE FUNCTION "reject_dispute_history_mutation"();
CREATE TRIGGER "DisputeAppealEvent_append_only" BEFORE UPDATE OR DELETE ON "DisputeAppealEvent" FOR EACH ROW EXECUTE FUNCTION "reject_dispute_history_mutation"();

CREATE FUNCTION "enforce_dispute_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status" = 'OPEN' AND NEW."status" IN ('IN_REVIEW', 'WAITING_CUSTOMER', 'WAITING_SELLER', 'DECIDED')) OR
            (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('WAITING_CUSTOMER', 'WAITING_SELLER', 'DECIDED')) OR
            (OLD."status" IN ('WAITING_CUSTOMER', 'WAITING_SELLER') AND NEW."status" IN ('OPEN', 'IN_REVIEW', 'DECIDED'))) THEN
      RAISE EXCEPTION 'Invalid dispute status transition';
    END IF;
    IF NEW."version" <> OLD."version" + 1 THEN RAISE EXCEPTION 'Dispute transitions must increment version once'; END IF;
  ELSIF NEW."version" <> OLD."version" THEN
    RAISE EXCEPTION 'Dispute version cannot change without a status transition';
  END IF;
  IF NEW."bookingId" <> OLD."bookingId" OR NEW."createdById" <> OLD."createdById" OR NEW."category" <> OLD."category" OR NEW."description" <> OLD."description" OR NEW."relatedRevisionId" IS DISTINCT FROM OLD."relatedRevisionId" OR NEW."relatedCancellationId" IS DISTINCT FROM OLD."relatedCancellationId" OR NEW."deliveryCycleId" IS DISTINCT FROM OLD."deliveryCycleId" THEN
    RAISE EXCEPTION 'Dispute identity and submitted evidence are immutable';
  END IF;
  IF OLD."status" = 'DECIDED' AND (NEW."status" <> OLD."status" OR NEW."decisionAt" IS DISTINCT FROM OLD."decisionAt" OR NEW."decisionById" IS DISTINCT FROM OLD."decisionById" OR NEW."decisionOutcome" IS DISTINCT FROM OLD."decisionOutcome" OR NEW."decisionReason" IS DISTINCT FROM OLD."decisionReason" OR NEW."permittedNextAction" IS DISTINCT FROM OLD."permittedNextAction") THEN
    RAISE EXCEPTION 'Original dispute decision is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Dispute_transition_guard" BEFORE UPDATE ON "Dispute" FOR EACH ROW EXECUTE FUNCTION "enforce_dispute_transition"();

CREATE FUNCTION "enforce_dispute_clarification_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."disputeId" <> OLD."disputeId" OR NEW."recipient" <> OLD."recipient" OR NEW."recipientUserId" <> OLD."recipientUserId" OR NEW."requestedById" <> OLD."requestedById" OR NEW."question" <> OLD."question" OR NEW."requestedAt" <> OLD."requestedAt" OR NEW."responseDueAt" <> OLD."responseDueAt" THEN
    RAISE EXCEPTION 'Dispute clarification request is immutable';
  END IF;
  IF OLD."status" <> 'PENDING' OR NEW."status" NOT IN ('RESPONDED', 'CLOSED_WITHOUT_RESPONSE') OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Invalid or duplicate dispute clarification response';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DisputeClarification_transition_guard" BEFORE UPDATE ON "DisputeClarification" FOR EACH ROW EXECUTE FUNCTION "enforce_dispute_clarification_transition"();

CREATE FUNCTION "enforce_dispute_revision_authorization_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."disputeId" <> OLD."disputeId" OR NEW."bookingId" <> OLD."bookingId" OR NEW."deliveryCycleId" <> OLD."deliveryCycleId" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Dispute revision authorization identity is immutable';
  END IF;
  IF OLD."status" <> 'AVAILABLE' OR NEW."status" NOT IN ('USED', 'REVOKED') THEN
    RAISE EXCEPTION 'Dispute revision authorization may be consumed or revoked only once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DisputeRevisionAuthorization_transition_guard" BEFORE UPDATE ON "DisputeRevisionAuthorization" FOR EACH ROW EXECUTE FUNCTION "enforce_dispute_revision_authorization_transition"();

CREATE FUNCTION "enforce_appeal_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."disputeId" <> OLD."disputeId" OR NEW."appellantId" <> OLD."appellantId" OR NEW."reason" <> OLD."reason" OR NEW."submittedAt" <> OLD."submittedAt" OR NEW."submissionDeadlineAt" <> OLD."submissionDeadlineAt" THEN
    RAISE EXCEPTION 'Appeal identity and submitted evidence are immutable';
  END IF;
  IF NOT ((OLD."status" = 'SUBMITTED' AND NEW."status" = 'IN_REVIEW') OR (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'DECIDED')) OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Invalid appeal transition or version';
  END IF;
  IF OLD."status" = 'DECIDED' THEN RAISE EXCEPTION 'Appeal decision is final'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DisputeAppeal_transition_guard" BEFORE UPDATE ON "DisputeAppeal" FOR EACH ROW EXECUTE FUNCTION "enforce_appeal_transition"();
