-- Add booking brief snapshots and immutable status history. Existing rows remain readable.
ALTER TABLE "Booking"
  ALTER COLUMN "scheduledDate" DROP NOT NULL,
  ADD COLUMN "serviceTitle" TEXT,
  ADD COLUMN "sellerName" TEXT,
  ADD COLUMN "deliveryMode" TEXT,
  ADD COLUMN "requirements" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "location" TEXT;

CREATE TABLE "BookingStatusEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "fromStatus" "BookingStatus",
  "toStatus" "BookingStatus" NOT NULL,
  "actorUserId" TEXT,
  "source" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingStatusEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingStatusEvent_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingStatusEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BookingStatusEvent_bookingId_occurredAt_id_idx"
  ON "BookingStatusEvent"("bookingId", "occurredAt", "id");
ALTER TYPE "PayoutStatus" ADD VALUE 'ELIGIBLE';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';
CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CancellationRequest" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidencePath" TEXT NOT NULL,
  "status" "CancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CancellationRequest_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CancellationRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CancellationRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");
CREATE INDEX "CancellationRequest_bookingId_createdAt_idx" ON "CancellationRequest"("bookingId", "createdAt");
