-- Additive booking timer, scheduled job, idempotency receipt, and notification
-- outbox foundation. This migration deliberately performs no data backfill and
-- never changes historical Booking or Payment states.

CREATE TYPE "BookingReviewJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'DELIVERED');

CREATE TABLE "BookingReviewTimer" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
  "durationMs" INTEGER NOT NULL DEFAULT 259200000,
  "deadlineAt" TIMESTAMPTZ(3),
  "remainingMs" INTEGER,
  "pausedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BookingReviewTimer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingReviewTimer_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingReviewTimer_durationMs_check" CHECK ("durationMs" = 259200000),
  CONSTRAINT "BookingReviewTimer_version_check" CHECK ("version" > 0),
  CONSTRAINT "BookingReviewTimer_remainingMs_check" CHECK ("remainingMs" IS NULL OR "remainingMs" >= 0),
  CONSTRAINT "BookingReviewTimer_state_check" CHECK (
    ("closedAt" IS NULL AND "pausedAt" IS NULL AND "remainingMs" IS NULL AND "deadlineAt" IS NOT NULL)
    OR ("closedAt" IS NULL AND "pausedAt" IS NOT NULL AND "remainingMs" IS NOT NULL AND "deadlineAt" IS NULL)
    OR ("closedAt" IS NOT NULL AND "pausedAt" IS NULL AND "remainingMs" IS NULL AND "deadlineAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "BookingReviewTimer_bookingId_key" ON "BookingReviewTimer"("bookingId");
CREATE INDEX "BookingReviewTimer_deadlineAt_closedAt_idx" ON "BookingReviewTimer"("deadlineAt", "closedAt");

CREATE TABLE "BookingReviewPauseInterval" (
  "id" TEXT NOT NULL,
  "timerId" TEXT NOT NULL,
  "openTimerId" TEXT,
  "blockerType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  "endType" TEXT,
  "startedByUserId" TEXT,
  "endedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingReviewPauseInterval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingReviewPauseInterval_timerId_fkey"
    FOREIGN KEY ("timerId") REFERENCES "BookingReviewTimer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingReviewPauseInterval_startedByUserId_fkey"
    FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingReviewPauseInterval_endedByUserId_fkey"
    FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingReviewPauseInterval_end_check" CHECK (
    ("endedAt" IS NULL AND "endType" IS NULL)
    OR ("endedAt" IS NOT NULL AND "endType" IS NOT NULL AND "endedAt" >= "startedAt")
  ),
  CONSTRAINT "BookingReviewPauseInterval_openTimer_check" CHECK (
    ("endedAt" IS NULL AND "openTimerId" = "timerId")
    OR ("endedAt" IS NOT NULL AND "openTimerId" IS NULL)
  )
);
CREATE UNIQUE INDEX "BookingReviewPauseInterval_openTimerId_key" ON "BookingReviewPauseInterval"("openTimerId");
CREATE INDEX "BookingReviewPauseInterval_timerId_startedAt_id_idx"
  ON "BookingReviewPauseInterval"("timerId", "startedAt", "id");

CREATE TABLE "BookingReviewJob" (
  "id" TEXT NOT NULL,
  "timerId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMPTZ(3),
  "timerVersion" INTEGER NOT NULL,
  "status" "BookingReviewJobStatus" NOT NULL DEFAULT 'PENDING',
  "claimToken" TEXT,
  "claimExpiresAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "BookingReviewJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingReviewJob_timerId_fkey"
    FOREIGN KEY ("timerId") REFERENCES "BookingReviewTimer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingReviewJob_claim_check" CHECK (
    ("status" = 'CLAIMED' AND "claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
    OR ("status" <> 'CLAIMED' AND "claimToken" IS NULL AND "claimExpiresAt" IS NULL)
  ),
  CONSTRAINT "BookingReviewJob_completed_check" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "BookingReviewJob_timerId_key" ON "BookingReviewJob"("timerId");
CREATE INDEX "BookingReviewJob_status_scheduledAt_id_idx" ON "BookingReviewJob"("status", "scheduledAt", "id");
CREATE INDEX "BookingReviewJob_status_claimExpiresAt_idx" ON "BookingReviewJob"("status", "claimExpiresAt");

CREATE TABLE "BookingOperationReceipt" (
  "id" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "transitionEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingOperationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingOperationReceipt_principalId_fkey"
    FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingOperationReceipt_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingOperationReceipt_transitionEventId_fkey"
    FOREIGN KEY ("transitionEventId") REFERENCES "BookingStatusEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingOperationReceipt_principalId_operation_bookingId_key"
  ON "BookingOperationReceipt"("principalId", "operation", "bookingId");
CREATE UNIQUE INDEX "BookingOperationReceipt_transitionEventId_key"
  ON "BookingOperationReceipt"("transitionEventId");

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "claimExpiresAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMPTZ(3),
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationOutbox_eventKey_key" UNIQUE ("eventKey"),
  CONSTRAINT "NotificationOutbox_claim_check" CHECK (
    ("status" = 'CLAIMED' AND "claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
    OR ("status" <> 'CLAIMED' AND "claimToken" IS NULL AND "claimExpiresAt" IS NULL)
  ),
  CONSTRAINT "NotificationOutbox_delivered_check" CHECK (
    ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL)
    OR ("status" <> 'DELIVERED' AND "deliveredAt" IS NULL)
  )
);
CREATE INDEX "NotificationOutbox_status_availableAt_id_idx"
  ON "NotificationOutbox"("status", "availableAt", "id");
CREATE INDEX "NotificationOutbox_status_claimExpiresAt_idx"
  ON "NotificationOutbox"("status", "claimExpiresAt");

ALTER TABLE "Notification" ADD COLUMN "sourceOutboxKey" TEXT;
CREATE UNIQUE INDEX "Notification_sourceOutboxKey_key" ON "Notification"("sourceOutboxKey");
