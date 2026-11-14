-- Additive cycle-owned timer foundation. No legacy rows are backfilled: source
-- history must be classified against a real isolated database first.
CREATE TYPE "DeliveryCycleStatus" AS ENUM ('REVIEW_ACTIVE', 'REVIEW_PAUSED', 'COMPLETED', 'SUPERSEDED', 'CANCELLED');
CREATE TYPE "DeliveryCycleJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "DeliveryCycle" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "DeliveryCycleStatus" NOT NULL DEFAULT 'REVIEW_ACTIVE',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
  "durationMs" INTEGER NOT NULL DEFAULT 259200000,
  "deadlineAt" TIMESTAMPTZ(3),
  "remainingMs" INTEGER,
  "pausedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryCycle_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCycle_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "DeliveryCycle_duration_check" CHECK ("durationMs" = 259200000),
  CONSTRAINT "DeliveryCycle_version_check" CHECK ("version" > 0),
  CONSTRAINT "DeliveryCycle_remaining_check" CHECK ("remainingMs" IS NULL OR "remainingMs" >= 0),
  CONSTRAINT "DeliveryCycle_active_state_check" CHECK (
    ("active" = TRUE AND "status" IN ('REVIEW_ACTIVE', 'REVIEW_PAUSED')) OR
    ("active" = FALSE AND "status" IN ('COMPLETED', 'SUPERSEDED', 'CANCELLED'))
  ),
  CONSTRAINT "DeliveryCycle_timer_state_check" CHECK (
    ("status" = 'REVIEW_ACTIVE' AND "closedAt" IS NULL AND "pausedAt" IS NULL AND "remainingMs" IS NULL AND "deadlineAt" IS NOT NULL) OR
    ("status" = 'REVIEW_PAUSED' AND "closedAt" IS NULL AND "pausedAt" IS NOT NULL AND "remainingMs" IS NOT NULL AND "deadlineAt" IS NULL) OR
    ("status" IN ('COMPLETED', 'SUPERSEDED', 'CANCELLED') AND "closedAt" IS NOT NULL AND "pausedAt" IS NULL AND "remainingMs" IS NULL AND "deadlineAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "DeliveryCycle_bookingId_sequence_key" ON "DeliveryCycle"("bookingId", "sequence");
CREATE UNIQUE INDEX "DeliveryCycle_bookingId_id_key" ON "DeliveryCycle"("bookingId", "id");
CREATE UNIQUE INDEX "DeliveryCycle_one_active_per_booking_key" ON "DeliveryCycle"("bookingId") WHERE "active" = TRUE;
CREATE INDEX "DeliveryCycle_bookingId_active_idx" ON "DeliveryCycle"("bookingId", "active");
CREATE INDEX "DeliveryCycle_deadlineAt_active_idx" ON "DeliveryCycle"("deadlineAt", "active");

CREATE TABLE "DeliveryCyclePauseInterval" (
  "id" TEXT NOT NULL,
  "deliveryCycleId" TEXT NOT NULL,
  "openCycleId" TEXT,
  "blockerType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  "endType" TEXT,
  "startedByUserId" TEXT,
  "endedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryCyclePauseInterval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryCyclePauseInterval_cycle_fkey" FOREIGN KEY ("deliveryCycleId") REFERENCES "DeliveryCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCyclePauseInterval_starter_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCyclePauseInterval_ender_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCyclePauseInterval_end_check" CHECK (("endedAt" IS NULL AND "endType" IS NULL) OR ("endedAt" IS NOT NULL AND "endType" IS NOT NULL AND "endedAt" >= "startedAt")),
  CONSTRAINT "DeliveryCyclePauseInterval_open_check" CHECK (("endedAt" IS NULL AND "openCycleId" = "deliveryCycleId") OR ("endedAt" IS NOT NULL AND "openCycleId" IS NULL))
);
CREATE UNIQUE INDEX "DeliveryCyclePauseInterval_openCycleId_key" ON "DeliveryCyclePauseInterval"("openCycleId");
CREATE INDEX "DeliveryCyclePauseInterval_deliveryCycleId_startedAt_id_idx" ON "DeliveryCyclePauseInterval"("deliveryCycleId", "startedAt", "id");

CREATE TABLE "DeliveryCycleJob" (
  "id" TEXT NOT NULL,
  "deliveryCycleId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMPTZ(3),
  "generation" INTEGER NOT NULL,
  "status" "DeliveryCycleJobStatus" NOT NULL DEFAULT 'PENDING',
  "claimToken" TEXT,
  "claimExpiresAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeliveryCycleJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryCycleJob_cycle_booking_fkey" FOREIGN KEY ("bookingId", "deliveryCycleId") REFERENCES "DeliveryCycle"("bookingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCycleJob_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCycleJob_generation_check" CHECK ("generation" > 0),
  CONSTRAINT "DeliveryCycleJob_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "DeliveryCycleJob_claim_check" CHECK (("status" = 'CLAIMED' AND "claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL) OR ("status" <> 'CLAIMED' AND "claimToken" IS NULL AND "claimExpiresAt" IS NULL)),
  CONSTRAINT "DeliveryCycleJob_completed_check" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL))
);
CREATE UNIQUE INDEX "DeliveryCycleJob_deliveryCycleId_key" ON "DeliveryCycleJob"("deliveryCycleId");
CREATE UNIQUE INDEX "DeliveryCycleJob_bookingId_deliveryCycleId_key" ON "DeliveryCycleJob"("bookingId", "deliveryCycleId");
CREATE INDEX "DeliveryCycleJob_status_scheduledAt_id_idx" ON "DeliveryCycleJob"("status", "scheduledAt", "id");
CREATE INDEX "DeliveryCycleJob_status_claimExpiresAt_idx" ON "DeliveryCycleJob"("status", "claimExpiresAt");
CREATE INDEX "DeliveryCycleJob_bookingId_deliveryCycleId_idx" ON "DeliveryCycleJob"("bookingId", "deliveryCycleId");

CREATE TABLE "DeliveryCycleCompletionReceipt" (
  "id" TEXT NOT NULL,
  "deliveryCycleId" TEXT NOT NULL,
  "principalId" TEXT,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "transitionEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryCycleCompletionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryCycleCompletionReceipt_cycle_fkey" FOREIGN KEY ("deliveryCycleId") REFERENCES "DeliveryCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCycleCompletionReceipt_principal_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryCycleCompletionReceipt_event_fkey" FOREIGN KEY ("transitionEventId") REFERENCES "BookingStatusEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeliveryCycleCompletionReceipt_cycle_principal_operation_key" ON "DeliveryCycleCompletionReceipt"("deliveryCycleId", "principalId", "operation");
CREATE UNIQUE INDEX "DeliveryCycleCompletionReceipt_transitionEventId_key" ON "DeliveryCycleCompletionReceipt"("transitionEventId");
CREATE UNIQUE INDEX "DeliveryCycleCompletionReceipt_one_system_completion_key" ON "DeliveryCycleCompletionReceipt"("deliveryCycleId") WHERE "principalId" IS NULL;

ALTER TABLE "NotificationOutbox" ADD COLUMN "deliveryCycleId" TEXT;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_deliveryCycleId_fkey" FOREIGN KEY ("deliveryCycleId") REFERENCES "DeliveryCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NotificationOutbox_deliveryCycleId_createdAt_idx" ON "NotificationOutbox"("deliveryCycleId", "createdAt");

-- Preserve cycle identity and prevent reopening or deletion of terminal history.
CREATE FUNCTION "protect_delivery_cycle_history"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DeliveryCycle history is permanent';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."bookingId" <> OLD."bookingId" OR NEW."sequence" <> OLD."sequence"
     OR NEW."deliveryAt" <> OLD."deliveryAt" OR NEW."durationMs" <> OLD."durationMs" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'DeliveryCycle identity and delivery evidence are immutable';
  END IF;
  IF OLD."active" = FALSE THEN
    RAISE EXCEPTION 'Terminal DeliveryCycle history cannot be reopened or changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DeliveryCycle_history_immutable"
  BEFORE UPDATE OR DELETE ON "DeliveryCycle"
  FOR EACH ROW EXECUTE FUNCTION "protect_delivery_cycle_history"();

-- An open interval may be closed once; closed evidence cannot be edited or deleted.
CREATE FUNCTION "protect_delivery_cycle_pause_history"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DeliveryCycle pause history is permanent';
  END IF;
  IF OLD."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Closed DeliveryCycle pause intervals are immutable';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."deliveryCycleId" <> OLD."deliveryCycleId" OR NEW."blockerType" <> OLD."blockerType"
     OR NEW."source" <> OLD."source" OR NEW."startedAt" <> OLD."startedAt" OR NEW."startedByUserId" IS DISTINCT FROM OLD."startedByUserId" THEN
    RAISE EXCEPTION 'DeliveryCycle pause interval identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DeliveryCyclePauseInterval_history_immutable"
  BEFORE UPDATE OR DELETE ON "DeliveryCyclePauseInterval"
  FOR EACH ROW EXECUTE FUNCTION "protect_delivery_cycle_pause_history"();
