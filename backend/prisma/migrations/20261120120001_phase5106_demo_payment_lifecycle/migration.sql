-- Explicitly isolated, non-provider demo lifecycle markers. No real money or payout is created.
CREATE TYPE "PaymentProvenance" AS ENUM ('REAL_PROVIDER', 'DEMO_SIMULATION');

ALTER TABLE "Payment" ADD COLUMN "provenance" "PaymentProvenance" NOT NULL DEFAULT 'REAL_PROVIDER';
ALTER TABLE "Payment" ADD COLUMN "simulatedAt" TIMESTAMPTZ(3);
ALTER TABLE "Payment" ADD COLUMN "demoReference" TEXT;
CREATE UNIQUE INDEX "Payment_demoReference_key" ON "Payment"("demoReference");
ALTER TABLE "PaymentTransaction" ADD COLUMN "provenance" "PaymentProvenance" NOT NULL DEFAULT 'REAL_PROVIDER';
ALTER TABLE "PaymentTransaction" ADD COLUMN "simulatedAt" TIMESTAMPTZ(3);
ALTER TABLE "AdditionalRevisionAgreement" ADD COLUMN "deliveryNote" VARCHAR(4000);

-- Keep all standard and demo-funded open work protected by the one-unsettled-agreement rule.
DROP INDEX "AdditionalRevisionAgreement_one_unsettled_per_booking_key";
CREATE UNIQUE INDEX "AdditionalRevisionAgreement_one_unsettled_per_booking_key"
  ON "AdditionalRevisionAgreement"("bookingId")
  WHERE "status" IN ('AWAITING_PAYMENT', 'FUNDED', 'IN_PROGRESS', 'DELIVERED', 'IN_REVIEW', 'DISPUTED', 'CANCELLATION_PENDING', 'DEMO_FUNDED', 'DEMO_IN_PROGRESS', 'DEMO_IN_REVIEW');
