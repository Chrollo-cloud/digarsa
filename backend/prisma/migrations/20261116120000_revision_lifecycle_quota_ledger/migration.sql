-- Revision policy snapshots, revision cases, append-only quota ledger and
-- revision-specific clarification/escalation requests. No legacy backfill.
CREATE TYPE "RevisionStatus" AS ENUM ('REQUESTED', 'WAITING_CUSTOMER', 'IN_PROGRESS', 'REJECTED', 'WITHDRAWN', 'REJECTION_ACCEPTED', 'DELIVERED', 'FAILED');
CREATE TYPE "RevisionClarificationStatus" AS ENUM ('WAITING_CUSTOMER', 'WAITING_SELLER', 'RESPONDED', 'CANCELLED');
CREATE TYPE "RevisionClarificationRequester" AS ENUM ('CUSTOMER', 'SELLER');
CREATE TYPE "RevisionQuotaOperation" AS ENUM ('RESERVE', 'CONSUME', 'RELEASE', 'EXPIRE', 'SYSTEM_ERROR_RETURN');
CREATE TYPE "RevisionEscalationTrigger" AS ENUM ('SELLER_REJECTION', 'SELLER_RESPONSE_OVERDUE', 'CUSTOMER_CLARIFICATION_OVERDUE', 'SELLER_ESTIMATE_OVERDUE');

ALTER TABLE "Service"
  ADD COLUMN "revisionPolicyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "revisionFreeCount" INTEGER,
  ADD COLUMN "revisionRequestWindowHours" INTEGER,
  ADD COLUMN "revisionTerms" TEXT,
  ADD CONSTRAINT "Service_revision_policy_check" CHECK (
    ("revisionFreeCount" IS NULL AND "revisionRequestWindowHours" IS NULL AND "revisionTerms" IS NULL) OR
    ("revisionFreeCount" IS NOT NULL AND "revisionFreeCount" >= 0 AND
     "revisionRequestWindowHours" IS NOT NULL AND "revisionRequestWindowHours" IN (12, 24, 48, 72) AND
     "revisionTerms" IS NOT NULL AND length(btrim("revisionTerms")) > 0)
  ),
  ADD CONSTRAINT "Service_revision_policy_version_check" CHECK ("revisionPolicyVersion" > 0);

ALTER TABLE "Booking"
  ADD COLUMN "revisionPolicyVersion" INTEGER,
  ADD COLUMN "revisionPolicyHash" TEXT,
  ADD COLUMN "revisionFreeCount" INTEGER,
  ADD COLUMN "revisionRequestWindowDuration" INTEGER,
  ADD COLUMN "revisionRequestWindowUnit" TEXT,
  ADD COLUMN "revisionRequestWindowAnchor" TEXT,
  ADD COLUMN "revisionTermsSnapshot" TEXT,
  ADD COLUMN "revisionPolicyAcknowledgedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Booking_revision_policy_snapshot_check" CHECK (
    ("revisionPolicyHash" IS NULL AND "revisionPolicyVersion" IS NULL AND "revisionFreeCount" IS NULL AND "revisionRequestWindowDuration" IS NULL AND "revisionRequestWindowUnit" IS NULL AND "revisionRequestWindowAnchor" IS NULL AND "revisionTermsSnapshot" IS NULL AND "revisionPolicyAcknowledgedAt" IS NULL) OR
    ("revisionPolicyHash" IS NOT NULL AND "revisionPolicyHash" ~ '^[0-9a-f]{64}$' AND
     "revisionPolicyVersion" IS NOT NULL AND "revisionPolicyVersion" > 0 AND
     "revisionFreeCount" IS NOT NULL AND "revisionFreeCount" >= 0 AND
     "revisionRequestWindowDuration" IS NOT NULL AND "revisionRequestWindowDuration" IN (12, 24, 48, 72) AND
     "revisionRequestWindowUnit" IS NOT NULL AND "revisionRequestWindowUnit" = 'ELAPSED_HOURS' AND
     "revisionRequestWindowAnchor" IS NOT NULL AND "revisionRequestWindowAnchor" = 'LATEST_SERVER_PERSISTED_DELIVERY' AND
     "revisionTermsSnapshot" IS NOT NULL AND length(btrim("revisionTermsSnapshot")) > 0 AND
     "revisionPolicyAcknowledgedAt" IS NOT NULL)
  );

CREATE TABLE "RevisionRequest" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "deliveryCycleId" TEXT NOT NULL,
  "requestText" TEXT NOT NULL,
  "status" "RevisionStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "sellerResponseDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
  "responseRound" INTEGER NOT NULL DEFAULT 1,
  "reservationGeneration" INTEGER NOT NULL DEFAULT 1,
  "acceptedAt" TIMESTAMPTZ(3),
  "estimatedCompletionAt" TIMESTAMPTZ(3),
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "withdrawnAt" TIMESTAMPTZ(3),
  "rejectionAcceptedAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "deliveryNote" TEXT,
  "deliveryEvidence" JSONB,
  "failedAt" TIMESTAMPTZ(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RevisionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionRequest_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionRequest_cycle_fkey" FOREIGN KEY ("deliveryCycleId") REFERENCES "DeliveryCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionRequest_cycle_booking_fkey" FOREIGN KEY ("bookingId", "deliveryCycleId") REFERENCES "DeliveryCycle"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionRequest_text_check" CHECK (length(btrim("requestText")) BETWEEN 5 AND 1000),
  CONSTRAINT "RevisionRequest_round_check" CHECK ("responseRound" > 0 AND "reservationGeneration" > 0),
  CONSTRAINT "RevisionRequest_response_deadline_check" CHECK ("sellerResponseDeadlineAt" >= "requestedAt"),
  CONSTRAINT "RevisionRequest_estimate_check" CHECK ("estimatedCompletionAt" IS NULL OR ("acceptedAt" IS NOT NULL AND "estimatedCompletionAt" <= "acceptedAt" + INTERVAL '72 hours')),
  CONSTRAINT "RevisionRequest_rejected_reason_check" CHECK (("status" <> 'REJECTED') OR ("rejectedAt" IS NOT NULL AND length(btrim(COALESCE("rejectionReason", ''))) >= 3)),
  CONSTRAINT "RevisionRequest_terminal_timestamps_check" CHECK (
    ("status" <> 'WITHDRAWN' OR "withdrawnAt" IS NOT NULL) AND
    ("status" <> 'REJECTION_ACCEPTED' OR "rejectionAcceptedAt" IS NOT NULL) AND
    ("status" <> 'DELIVERED' OR "deliveredAt" IS NOT NULL) AND
    ("status" <> 'FAILED' OR ("failedAt" IS NOT NULL AND length(btrim(COALESCE("failureReason", ''))) >= 3))
  ),
  CONSTRAINT "RevisionRequest_delivery_evidence_check" CHECK (("deliveryNote" IS NULL OR length(btrim("deliveryNote")) BETWEEN 5 AND 3000) AND ("deliveryEvidence" IS NULL OR jsonb_typeof("deliveryEvidence") = 'array'))
);
CREATE UNIQUE INDEX "RevisionRequest_bookingId_id_key" ON "RevisionRequest"("bookingId", "id");
CREATE INDEX "RevisionRequest_bookingId_requestedAt_id_idx" ON "RevisionRequest"("bookingId", "requestedAt", "id");
CREATE INDEX "RevisionRequest_deliveryCycleId_status_idx" ON "RevisionRequest"("deliveryCycleId", "status");
CREATE INDEX "RevisionRequest_status_sellerResponseDeadlineAt_idx" ON "RevisionRequest"("status", "sellerResponseDeadlineAt");
CREATE UNIQUE INDEX "RevisionRequest_one_active_per_booking_key" ON "RevisionRequest"("bookingId") WHERE "status" IN ('REQUESTED', 'WAITING_CUSTOMER', 'IN_PROGRESS');

CREATE TABLE "RevisionClarification" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "requesterRole" "RevisionClarificationRequester" NOT NULL,
  "requesterId" TEXT NOT NULL,
  "requestText" TEXT NOT NULL,
  "status" "RevisionClarificationStatus" NOT NULL,
  "responseDueAt" TIMESTAMPTZ(3) NOT NULL,
  "responseText" TEXT,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionClarification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionClarification_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionClarification_request_text_check" CHECK (length(btrim("requestText")) BETWEEN 5 AND 1000),
  CONSTRAINT "RevisionClarification_response_text_check" CHECK (
    ("status" IN ('WAITING_CUSTOMER', 'WAITING_SELLER') AND "respondedAt" IS NULL AND "respondedById" IS NULL AND "responseText" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'RESPONDED' AND "respondedAt" IS NOT NULL AND "respondedById" IS NOT NULL AND length(btrim(COALESCE("responseText", ''))) BETWEEN 5 AND 1000 AND "closedAt" IS NULL) OR
    ("status" = 'CANCELLED' AND "respondedAt" IS NULL AND "respondedById" IS NULL AND "responseText" IS NULL AND "closedAt" IS NOT NULL)
  )
);
CREATE INDEX "RevisionClarification_revisionId_createdAt_id_idx" ON "RevisionClarification"("revisionId", "createdAt", "id");
CREATE INDEX "RevisionClarification_status_responseDueAt_idx" ON "RevisionClarification"("status", "responseDueAt");
CREATE UNIQUE INDEX "RevisionClarification_one_pending_per_revision_key" ON "RevisionClarification"("revisionId") WHERE "status" IN ('WAITING_CUSTOMER', 'WAITING_SELLER');

CREATE TABLE "RevisionEvent" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" "RevisionStatus",
  "toStatus" "RevisionStatus" NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionEvent_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RevisionEvent_revisionId_occurredAt_id_idx" ON "RevisionEvent"("revisionId", "occurredAt", "id");

CREATE TABLE "RevisionQuotaLedger" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "revisionId" TEXT,
  "deliveryCycleId" TEXT,
  "operation" "RevisionQuotaOperation" NOT NULL,
  "availableDelta" INTEGER NOT NULL,
  "reservedDelta" INTEGER NOT NULL,
  "consumedDelta" INTEGER NOT NULL,
  "expiredDelta" INTEGER NOT NULL,
  "operationReference" TEXT NOT NULL,
  "actorUserId" TEXT,
  "reason" TEXT,
  "evidenceReference" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionQuotaLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionQuotaLedger_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionQuotaLedger_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionQuotaLedger_cycle_booking_fkey" FOREIGN KEY ("bookingId", "deliveryCycleId") REFERENCES "DeliveryCycle"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionQuotaLedger_operationReference_key" UNIQUE ("operationReference"),
  CONSTRAINT "RevisionQuotaLedger_balance_conservation_check" CHECK ("availableDelta" + "reservedDelta" + "consumedDelta" + "expiredDelta" = 0),
  CONSTRAINT "RevisionQuotaLedger_operation_shape_check" CHECK (
    ("operation" = 'RESERVE' AND "availableDelta" = -1 AND "reservedDelta" = 1 AND "consumedDelta" = 0 AND "expiredDelta" = 0 AND "revisionId" IS NOT NULL) OR
    ("operation" = 'CONSUME' AND "availableDelta" = 0 AND "reservedDelta" = -1 AND "consumedDelta" = 1 AND "expiredDelta" = 0 AND "revisionId" IS NOT NULL) OR
    ("operation" = 'RELEASE' AND "availableDelta" = 1 AND "reservedDelta" = -1 AND "consumedDelta" = 0 AND "expiredDelta" = 0 AND "revisionId" IS NOT NULL) OR
    ("operation" = 'EXPIRE' AND "availableDelta" < 0 AND "reservedDelta" = 0 AND "consumedDelta" = 0 AND "expiredDelta" = -"availableDelta" AND "revisionId" IS NULL) OR
    ("operation" = 'SYSTEM_ERROR_RETURN' AND "availableDelta" = 1 AND "reservedDelta" = 0 AND "consumedDelta" = -1 AND "expiredDelta" = 0 AND "revisionId" IS NOT NULL AND length(btrim(COALESCE("reason", ''))) >= 5 AND length(btrim(COALESCE("evidenceReference", ''))) >= 6)
  )
);
CREATE INDEX "RevisionQuotaLedger_bookingId_createdAt_id_idx" ON "RevisionQuotaLedger"("bookingId", "createdAt", "id");
CREATE INDEX "RevisionQuotaLedger_revisionId_operation_idx" ON "RevisionQuotaLedger"("revisionId", "operation");

CREATE TABLE "RevisionOperationReceipt" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionOperationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionOperationReceipt_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionOperationReceipt_revisionId_principalId_operation_key" UNIQUE ("revisionId", "principalId", "operation")
);

CREATE TABLE "RevisionEscalationRequest" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "trigger" "RevisionEscalationTrigger" NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionEscalationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionEscalationRequest_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionEscalationRequest_revision_booking_fkey" FOREIGN KEY ("bookingId", "revisionId") REFERENCES "RevisionRequest"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionEscalationRequest_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionEscalationRequest_reason_check" CHECK (length(btrim("reason")) BETWEEN 5 AND 1000),
  CONSTRAINT "RevisionEscalationRequest_status_check" CHECK ("status" = 'OPEN'),
  CONSTRAINT "RevisionEscalationRequest_revisionId_trigger_key" UNIQUE ("revisionId", "trigger")
);
CREATE INDEX "RevisionEscalationRequest_bookingId_status_createdAt_idx" ON "RevisionEscalationRequest"("bookingId", "status", "createdAt");

ALTER TABLE "DeliveryCycle" ADD COLUMN "sourceRevisionId" TEXT;
ALTER TABLE "DeliveryCycle" ADD CONSTRAINT "DeliveryCycle_sourceRevisionId_key" UNIQUE ("sourceRevisionId");
ALTER TABLE "DeliveryCycle" ADD CONSTRAINT "DeliveryCycle_bookingId_sourceRevisionId_key" UNIQUE ("bookingId", "sourceRevisionId");
ALTER TABLE "DeliveryCycle" ADD CONSTRAINT "DeliveryCycle_sourceRevision_fkey" FOREIGN KEY ("bookingId", "sourceRevisionId") REFERENCES "RevisionRequest"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshots cannot be rewritten after booking creation. A seller policy change
-- requires one version increment in the same update.
CREATE FUNCTION "protect_revision_policy_snapshot"() RETURNS trigger AS $$
BEGIN
  IF NEW."revisionPolicyVersion" IS DISTINCT FROM OLD."revisionPolicyVersion" OR
     NEW."revisionPolicyHash" IS DISTINCT FROM OLD."revisionPolicyHash" OR
     NEW."revisionFreeCount" IS DISTINCT FROM OLD."revisionFreeCount" OR
     NEW."revisionRequestWindowDuration" IS DISTINCT FROM OLD."revisionRequestWindowDuration" OR
     NEW."revisionRequestWindowUnit" IS DISTINCT FROM OLD."revisionRequestWindowUnit" OR
     NEW."revisionRequestWindowAnchor" IS DISTINCT FROM OLD."revisionRequestWindowAnchor" OR
     NEW."revisionTermsSnapshot" IS DISTINCT FROM OLD."revisionTermsSnapshot" OR
     NEW."revisionPolicyAcknowledgedAt" IS DISTINCT FROM OLD."revisionPolicyAcknowledgedAt" THEN
    RAISE EXCEPTION 'Booking revision policy snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Booking_revision_policy_snapshot_immutable" BEFORE UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION "protect_revision_policy_snapshot"();

CREATE FUNCTION "enforce_service_revision_policy_version"() RETURNS trigger AS $$
DECLARE changed BOOLEAN;
BEGIN
  changed := NEW."revisionFreeCount" IS DISTINCT FROM OLD."revisionFreeCount" OR
    NEW."revisionRequestWindowHours" IS DISTINCT FROM OLD."revisionRequestWindowHours" OR
    NEW."revisionTerms" IS DISTINCT FROM OLD."revisionTerms";
  IF changed AND NEW."revisionPolicyVersion" <> OLD."revisionPolicyVersion" + 1 THEN
    RAISE EXCEPTION 'Revision policy changes must increment version exactly once';
  END IF;
  IF NOT changed AND NEW."revisionPolicyVersion" <> OLD."revisionPolicyVersion" THEN
    RAISE EXCEPTION 'Revision policy version cannot change without policy content';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Service_revision_policy_version" BEFORE UPDATE ON "Service" FOR EACH ROW EXECUTE FUNCTION "enforce_service_revision_policy_version"();

CREATE FUNCTION "reject_revision_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Revision audit and quota history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RevisionQuotaLedger_append_only" BEFORE UPDATE OR DELETE ON "RevisionQuotaLedger" FOR EACH ROW EXECUTE FUNCTION "reject_revision_history_mutation"();
CREATE TRIGGER "RevisionEvent_append_only" BEFORE UPDATE OR DELETE ON "RevisionEvent" FOR EACH ROW EXECUTE FUNCTION "reject_revision_history_mutation"();
CREATE TRIGGER "RevisionOperationReceipt_append_only" BEFORE UPDATE OR DELETE ON "RevisionOperationReceipt" FOR EACH ROW EXECUTE FUNCTION "reject_revision_history_mutation"();
CREATE TRIGGER "RevisionClarification_no_delete" BEFORE DELETE ON "RevisionClarification" FOR EACH ROW EXECUTE FUNCTION "reject_revision_history_mutation"();
CREATE TRIGGER "RevisionEscalationRequest_no_delete" BEFORE DELETE ON "RevisionEscalationRequest" FOR EACH ROW EXECUTE FUNCTION "reject_revision_history_mutation"();
