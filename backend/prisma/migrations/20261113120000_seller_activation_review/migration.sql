-- Add a separate, non-identity seller activation review workflow.
CREATE TYPE "SellerActivationReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_ACTIVATION_REVIEW';

CREATE TABLE "SellerActivationReview" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "status" "SellerActivationReviewStatus" NOT NULL DEFAULT 'PENDING',
  "activeSellerId" TEXT,
  "profileSnapshot" JSONB NOT NULL,
  "portfolioSnapshot" JSONB NOT NULL,
  "serviceOffersSnapshot" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "SellerActivationReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerActivationReview_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SellerActivationReview_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SellerActivationReview_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- A nullable unique key makes at most one pending review per seller enforceable in the database.
CREATE UNIQUE INDEX "SellerActivationReview_activeSellerId_key"
  ON "SellerActivationReview"("activeSellerId");
CREATE INDEX "SellerActivationReview_sellerId_submittedAt_id_idx"
  ON "SellerActivationReview"("sellerId", "submittedAt", "id");
CREATE INDEX "SellerActivationReview_status_submittedAt_id_idx"
  ON "SellerActivationReview"("status", "submittedAt", "id");
