-- Additive lifecycle/clock migration. Existing assistance rows are retained,
-- assigned the approved 48-hour SLA, and receive initial audit records.
CREATE TYPE "RevisionEscalationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');
CREATE TYPE "RevisionResponseClockType" AS ENUM ('SELLER_RESPONSE', 'CUSTOMER_CLARIFICATION');
CREATE TYPE "RevisionEscalationActorType" AS ENUM ('USER', 'SYSTEM');

ALTER TABLE "RevisionRequest"
  ADD COLUMN "sellerResponseRemainingMs" INTEGER,
  ADD COLUMN "sellerResponsePausedAt" TIMESTAMPTZ(3);
ALTER TABLE "RevisionClarification"
  ADD COLUMN "responseRemainingMs" INTEGER,
  ADD COLUMN "responsePausedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "RevisionClarification_revisionId_id_key" ON "RevisionClarification"("revisionId", "id");

ALTER TABLE "RevisionEscalationRequest" DROP CONSTRAINT "RevisionEscalationRequest_status_check";
ALTER TABLE "RevisionEscalationRequest" DROP CONSTRAINT "RevisionEscalationRequest_revisionId_trigger_key";
ALTER TABLE "RevisionEscalationRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RevisionEscalationRequest" ALTER COLUMN "status" TYPE "RevisionEscalationStatus" USING "status"::"RevisionEscalationStatus";
ALTER TABLE "RevisionEscalationRequest" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "RevisionEscalationRequest"
  ADD COLUMN "responseClockType" "RevisionResponseClockType",
  ADD COLUMN "responseClarificationId" TEXT,
  ADD COLUMN "parentAssistanceId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "slaDueAt" TIMESTAMPTZ(3),
  ADD COLUMN "slaBreachedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "resolvedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedAt" TIMESTAMPTZ(3),
  ADD COLUMN "resolutionDetails" TEXT,
  ADD COLUMN "permittedNextAction" TEXT;

UPDATE "RevisionEscalationRequest"
SET "slaDueAt" = "createdAt" + INTERVAL '48 hours',
    "responseClockType" = CASE
      WHEN "trigger" = 'SELLER_RESPONSE_OVERDUE' AND EXISTS (
        SELECT 1 FROM "RevisionRequest" r WHERE r."id" = "RevisionEscalationRequest"."revisionId" AND r."status" = 'REQUESTED'
      ) THEN 'SELLER_RESPONSE'::"RevisionResponseClockType"
      WHEN "trigger" = 'CUSTOMER_CLARIFICATION_OVERDUE' AND EXISTS (
        SELECT 1 FROM "RevisionClarification" c WHERE c."revisionId" = "RevisionEscalationRequest"."revisionId" AND c."status" = 'WAITING_CUSTOMER'
      ) THEN 'CUSTOMER_CLARIFICATION'::"RevisionResponseClockType"
      ELSE NULL
    END;
UPDATE "RevisionEscalationRequest" e
SET "responseClarificationId" = (
  SELECT c."id" FROM "RevisionClarification" c
  WHERE c."revisionId" = e."revisionId" AND c."status" = 'WAITING_CUSTOMER'
  ORDER BY c."createdAt" DESC, c."id" DESC LIMIT 1
)
WHERE e."responseClockType" = 'CUSTOMER_CLARIFICATION';
ALTER TABLE "RevisionEscalationRequest" ALTER COLUMN "slaDueAt" SET NOT NULL;
ALTER TABLE "RevisionEscalationRequest"
  ADD CONSTRAINT "RevisionEscalationRequest_response_clock_target_check" CHECK (
    ("responseClockType" IS NULL AND "responseClarificationId" IS NULL) OR
    ("responseClockType" = 'SELLER_RESPONSE' AND "responseClarificationId" IS NULL) OR
    ("responseClockType" = 'CUSTOMER_CLARIFICATION' AND "responseClarificationId" IS NOT NULL)
  ),
  ADD CONSTRAINT "RevisionEscalationRequest_sla_check" CHECK ("slaDueAt" >= "createdAt"),
  ADD CONSTRAINT "RevisionEscalationRequest_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "RevisionEscalationRequest_lifecycle_check" CHECK (
    ("status" = 'OPEN' AND "resolvedAt" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'IN_REVIEW' AND "reviewStartedAt" IS NOT NULL AND "resolvedAt" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NULL AND length(btrim(COALESCE("resolutionDetails", ''))) >= 5 AND length(btrim(COALESCE("permittedNextAction", ''))) >= 3) OR
    ("status" = 'CLOSED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NOT NULL)
  );
ALTER TABLE "RevisionEscalationRequest"
  ADD CONSTRAINT "RevisionEscalationRequest_sla_duration_check" CHECK ("slaDueAt" = "createdAt" + INTERVAL '48 hours');
ALTER TABLE "RevisionEscalationRequest"
  ADD CONSTRAINT "RevisionEscalationRequest_clarification_clock_fkey"
  FOREIGN KEY ("revisionId", "responseClarificationId")
  REFERENCES "RevisionClarification"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "RevisionEscalationRequest_revisionId_id_key" ON "RevisionEscalationRequest"("revisionId", "id");
ALTER TABLE "RevisionEscalationRequest"
  ADD CONSTRAINT "RevisionEscalationRequest_parent_fkey" FOREIGN KEY ("parentAssistanceId") REFERENCES "RevisionEscalationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevisionEscalationRequest"
  ADD CONSTRAINT "RevisionEscalationRequest_parent_revision_fkey" FOREIGN KEY ("revisionId", "parentAssistanceId") REFERENCES "RevisionEscalationRequest"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "RevisionEscalationRequest_one_nonclosed_trigger_key" ON "RevisionEscalationRequest"("revisionId", "trigger") WHERE "status" <> 'CLOSED';
CREATE INDEX "RevisionEscalationRequest_revisionId_trigger_status_idx" ON "RevisionEscalationRequest"("revisionId", "trigger", "status");
CREATE INDEX "RevisionEscalationRequest_status_slaDueAt_idx" ON "RevisionEscalationRequest"("status", "slaDueAt");

CREATE TABLE "RevisionEscalationEvent" (
  "id" TEXT NOT NULL,
  "assistanceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" "RevisionEscalationActorType" NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" "RevisionEscalationStatus",
  "toStatus" "RevisionEscalationStatus" NOT NULL,
  "reason" TEXT,
  "resolutionDetails" TEXT,
  "permittedNextAction" TEXT,
  "requestFingerprint" TEXT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionEscalationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionEscalationEvent_assistance_fkey" FOREIGN KEY ("assistanceId") REFERENCES "RevisionEscalationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RevisionEscalationEvent_assistanceId_occurredAt_id_idx" ON "RevisionEscalationEvent"("assistanceId", "occurredAt", "id");

CREATE TABLE "RevisionEscalationOperationReceipt" (
  "id" TEXT NOT NULL,
  "assistanceId" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionEscalationOperationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionEscalationOperationReceipt_assistance_fkey" FOREIGN KEY ("assistanceId") REFERENCES "RevisionEscalationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionEscalationOperationReceipt_version_check" CHECK ("expectedVersion" > 0),
  CONSTRAINT "RevisionEscalationOperationReceipt_assistanceId_principalId_expectedVersion_key" UNIQUE ("assistanceId", "principalId", "expectedVersion")
);

CREATE TABLE "RevisionResponseClockPause" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "clarificationId" TEXT,
  "assistanceId" TEXT NOT NULL,
  "clockType" "RevisionResponseClockType" NOT NULL,
  "pausedAt" TIMESTAMPTZ(3) NOT NULL,
  "remainingMs" INTEGER NOT NULL,
  "actorUserId" TEXT,
  CONSTRAINT "RevisionResponseClockPause_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionResponseClockPause_revision_fkey" FOREIGN KEY ("revisionId") REFERENCES "RevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockPause_clarification_fkey" FOREIGN KEY ("clarificationId") REFERENCES "RevisionClarification"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockPause_assistance_fkey" FOREIGN KEY ("assistanceId") REFERENCES "RevisionEscalationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockPause_revision_assistance_fkey" FOREIGN KEY ("revisionId", "assistanceId") REFERENCES "RevisionEscalationRequest"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockPause_revision_clarification_fkey" FOREIGN KEY ("revisionId", "clarificationId") REFERENCES "RevisionClarification"("revisionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockPause_shape_check" CHECK (
    "remainingMs" >= 0 AND
    (("clockType" = 'SELLER_RESPONSE' AND "clarificationId" IS NULL) OR
     ("clockType" = 'CUSTOMER_CLARIFICATION' AND "clarificationId" IS NOT NULL))
  )
);
CREATE INDEX "RevisionResponseClockPause_revisionId_clockType_pausedAt_idx" ON "RevisionResponseClockPause"("revisionId", "clockType", "pausedAt");
CREATE INDEX "RevisionResponseClockPause_assistanceId_idx" ON "RevisionResponseClockPause"("assistanceId");

CREATE TABLE "RevisionResponseClockResume" (
  "id" TEXT NOT NULL,
  "pauseId" TEXT NOT NULL,
  "resumedAt" TIMESTAMPTZ(3) NOT NULL,
  "restoredDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
  "actorUserId" TEXT,
  CONSTRAINT "RevisionResponseClockResume_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionResponseClockResume_pauseId_key" UNIQUE ("pauseId"),
  CONSTRAINT "RevisionResponseClockResume_pause_fkey" FOREIGN KEY ("pauseId") REFERENCES "RevisionResponseClockPause"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionResponseClockResume_deadline_check" CHECK ("restoredDeadlineAt" >= "resumedAt")
);
CREATE INDEX "RevisionResponseClockResume_resumedAt_idx" ON "RevisionResponseClockResume"("resumedAt");

-- Keep existing OPEN requests auditable and pause only clocks that still map to
-- a current formal response state. Already-expired clocks preserve zero time.
INSERT INTO "RevisionEscalationEvent" ("id", "assistanceId", "actorUserId", "actorType", "eventType", "fromStatus", "toStatus", "reason", "occurredAt")
SELECT 'legacy-open:' || e."id", e."id", e."requesterId", 'USER', 'CREATED', NULL, 'OPEN', e."reason", e."createdAt"
FROM "RevisionEscalationRequest" e;

INSERT INTO "RevisionResponseClockPause" ("id", "revisionId", "assistanceId", "clockType", "pausedAt", "remainingMs", "actorUserId")
SELECT 'legacy-seller-pause:' || e."id", e."revisionId", e."id", 'SELLER_RESPONSE', e."createdAt",
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (r."sellerResponseDeadlineAt" - e."createdAt")) * 1000)::INTEGER), e."requesterId"
FROM "RevisionEscalationRequest" e JOIN "RevisionRequest" r ON r."id" = e."revisionId"
WHERE e."responseClockType" = 'SELLER_RESPONSE';
UPDATE "RevisionRequest" r SET "sellerResponsePausedAt" = p."pausedAt", "sellerResponseRemainingMs" = p."remainingMs"
FROM "RevisionResponseClockPause" p WHERE p."revisionId" = r."id" AND p."clockType" = 'SELLER_RESPONSE';

INSERT INTO "RevisionResponseClockPause" ("id", "revisionId", "clarificationId", "assistanceId", "clockType", "pausedAt", "remainingMs", "actorUserId")
SELECT 'legacy-customer-pause:' || e."id", e."revisionId", e."responseClarificationId", e."id", 'CUSTOMER_CLARIFICATION', e."createdAt",
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (c."responseDueAt" - e."createdAt")) * 1000)::INTEGER), e."requesterId"
FROM "RevisionEscalationRequest" e JOIN "RevisionClarification" c ON c."id" = e."responseClarificationId"
WHERE e."responseClockType" = 'CUSTOMER_CLARIFICATION';
UPDATE "RevisionClarification" c SET "responsePausedAt" = p."pausedAt", "responseRemainingMs" = p."remainingMs"
FROM "RevisionResponseClockPause" p WHERE p."clarificationId" = c."id" AND p."clockType" = 'CUSTOMER_CLARIFICATION';

CREATE FUNCTION "reject_revision_assistance_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Revision assistance and response clock history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RevisionEscalationEvent_append_only" BEFORE UPDATE OR DELETE ON "RevisionEscalationEvent" FOR EACH ROW EXECUTE FUNCTION "reject_revision_assistance_history_mutation"();
CREATE TRIGGER "RevisionEscalationOperationReceipt_append_only" BEFORE UPDATE OR DELETE ON "RevisionEscalationOperationReceipt" FOR EACH ROW EXECUTE FUNCTION "reject_revision_assistance_history_mutation"();
CREATE TRIGGER "RevisionResponseClockPause_append_only" BEFORE UPDATE OR DELETE ON "RevisionResponseClockPause" FOR EACH ROW EXECUTE FUNCTION "reject_revision_assistance_history_mutation"();
CREATE TRIGGER "RevisionResponseClockResume_append_only" BEFORE UPDATE OR DELETE ON "RevisionResponseClockResume" FOR EACH ROW EXECUTE FUNCTION "reject_revision_assistance_history_mutation"();

CREATE FUNCTION "enforce_revision_assistance_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status" = 'OPEN' AND NEW."status" = 'IN_REVIEW') OR
            (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'RESOLVED') OR
            (OLD."status" = 'RESOLVED' AND NEW."status" IN ('CLOSED', 'IN_REVIEW'))) THEN
      RAISE EXCEPTION 'Invalid revision assistance status transition';
    END IF;
    IF NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'Revision assistance transitions must increment version once';
    END IF;
  ELSIF NEW."version" <> OLD."version" THEN
    RAISE EXCEPTION 'Revision assistance version cannot change without a transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RevisionEscalationRequest_transition_guard" BEFORE UPDATE ON "RevisionEscalationRequest" FOR EACH ROW EXECUTE FUNCTION "enforce_revision_assistance_transition"();
