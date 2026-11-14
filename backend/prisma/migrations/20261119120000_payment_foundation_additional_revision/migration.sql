-- Additive payment and paid-additional-revision foundation.
-- This migration is prepared only; it must be applied only to an approved isolated test DB.

CREATE TYPE "AdditionalRevisionRequestStatus" AS ENUM (
  'OPEN', 'CLARIFICATION_REQUIRED', 'OFFERED', 'REJECTED', 'WITHDRAWN', 'AGREED', 'CLOSED'
);
CREATE TYPE "AdditionalRevisionOfferStatus" AS ENUM (
  'ACTIVE', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'WITHDRAWN'
);
CREATE TYPE "AdditionalRevisionAgreementStatus" AS ENUM (
  'AWAITING_PAYMENT', 'FUNDED', 'IN_PROGRESS', 'DELIVERED', 'IN_REVIEW', 'COMPLETED',
  'DISPUTED', 'CANCELLATION_PENDING', 'CANCELLED'
);
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED');
CREATE TYPE "SellerPayoutStatus" AS ENUM ('HELD', 'ELIGIBLE', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'REVERSED', 'COMPLIANCE_HOLD');

ALTER TABLE "Booking" ADD COLUMN "pricingPolicyVersion" VARCHAR(64);

CREATE FUNCTION "protect_booking_financial_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."price" IS DISTINCT FROM NEW."price"
     OR OLD."fee" IS DISTINCT FROM NEW."fee"
     OR OLD."total" IS DISTINCT FROM NEW."total"
     OR OLD."pricingPolicyVersion" IS DISTINCT FROM NEW."pricingPolicyVersion" THEN
    RAISE EXCEPTION 'Booking financial price snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Booking_immutable_financial_snapshot"
  BEFORE UPDATE ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION "protect_booking_financial_snapshot"();

CREATE TABLE "AdditionalRevisionRequest" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sellerProfileId" TEXT NOT NULL,
  "description" VARCHAR(2000) NOT NULL,
  "status" "AdditionalRevisionRequestStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdditionalRevisionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalRevisionRequest_version_check" CHECK ("version" > 0),
  CONSTRAINT "AdditionalRevisionRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionRequest_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdditionalRevisionRequest_bookingId_createdAt_id_idx" ON "AdditionalRevisionRequest"("bookingId", "createdAt", "id");
CREATE INDEX "AdditionalRevisionRequest_customerId_createdAt_idx" ON "AdditionalRevisionRequest"("customerId", "createdAt");
CREATE INDEX "AdditionalRevisionRequest_sellerProfileId_createdAt_idx" ON "AdditionalRevisionRequest"("sellerProfileId", "createdAt");
CREATE UNIQUE INDEX "AdditionalRevisionRequest_one_open_per_booking_key"
  ON "AdditionalRevisionRequest"("bookingId") WHERE "status" IN ('OPEN', 'CLARIFICATION_REQUIRED', 'OFFERED');

CREATE FUNCTION "validate_additional_revision_request_parties"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  booking_customer TEXT;
  booking_seller TEXT;
BEGIN
  SELECT "customerId", "sellerId" INTO booking_customer, booking_seller FROM "Booking" WHERE "id" = NEW."bookingId";
  IF booking_customer IS NULL OR booking_customer <> NEW."customerId" OR booking_seller <> NEW."sellerProfileId" THEN
    RAISE EXCEPTION 'Additional revision parties must match the parent booking';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdditionalRevisionRequest_party_consistency"
  BEFORE INSERT OR UPDATE OF "bookingId", "customerId", "sellerProfileId" ON "AdditionalRevisionRequest"
  FOR EACH ROW EXECUTE FUNCTION "validate_additional_revision_request_parties"();

CREATE TABLE "AdditionalRevisionOfferVersion" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "scope" VARCHAR(4000) NOT NULL,
  "terms" VARCHAR(4000) NOT NULL,
  "sellerPrice" INTEGER NOT NULL,
  "adminFee" INTEGER NOT NULL,
  "buyerTotal" INTEGER NOT NULL,
  "pricingPolicyVersion" VARCHAR(64) NOT NULL,
  "estimatedDurationHours" INTEGER NOT NULL,
  "status" "AdditionalRevisionOfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdditionalRevisionOfferVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalRevisionOfferVersion_price_check" CHECK (
    "sellerPrice" > 0 AND "adminFee" >= 0 AND "buyerTotal" = "sellerPrice" + "adminFee"
  ),
  CONSTRAINT "AdditionalRevisionOfferVersion_duration_check" CHECK ("estimatedDurationHours" > 0),
  CONSTRAINT "AdditionalRevisionOfferVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "AdditionalRevisionOfferVersion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AdditionalRevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdditionalRevisionOfferVersion_requestId_version_key" ON "AdditionalRevisionOfferVersion"("requestId", "version");
CREATE INDEX "AdditionalRevisionOfferVersion_requestId_status_expiresAt_idx" ON "AdditionalRevisionOfferVersion"("requestId", "status", "expiresAt");
CREATE UNIQUE INDEX "AdditionalRevisionOfferVersion_one_active_per_request_key" ON "AdditionalRevisionOfferVersion"("requestId") WHERE "status" = 'ACTIVE';

CREATE TABLE "AdditionalRevisionAgreement" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "offerVersionId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sellerProfileId" TEXT NOT NULL,
  "scopeSnapshot" VARCHAR(4000) NOT NULL,
  "termsSnapshot" VARCHAR(4000) NOT NULL,
  "sellerPrice" INTEGER NOT NULL,
  "adminFee" INTEGER NOT NULL,
  "buyerTotal" INTEGER NOT NULL,
  "pricingPolicyVersion" VARCHAR(64) NOT NULL,
  "estimatedDurationHours" INTEGER NOT NULL,
  "status" "AdditionalRevisionAgreementStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fundedAt" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "reviewDeadlineAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdditionalRevisionAgreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalRevisionAgreement_requestId_key" UNIQUE ("requestId"),
  CONSTRAINT "AdditionalRevisionAgreement_offerVersionId_key" UNIQUE ("offerVersionId"),
  CONSTRAINT "AdditionalRevisionAgreement_price_check" CHECK (
    "sellerPrice" > 0 AND "adminFee" >= 0 AND "buyerTotal" = "sellerPrice" + "adminFee"
  ),
  CONSTRAINT "AdditionalRevisionAgreement_duration_check" CHECK ("estimatedDurationHours" > 0),
  CONSTRAINT "AdditionalRevisionAgreement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionAgreement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AdditionalRevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionAgreement_offerVersionId_fkey" FOREIGN KEY ("offerVersionId") REFERENCES "AdditionalRevisionOfferVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionAgreement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionAgreement_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdditionalRevisionAgreement_bookingId_status_idx" ON "AdditionalRevisionAgreement"("bookingId", "status");
CREATE INDEX "AdditionalRevisionAgreement_customerId_createdAt_idx" ON "AdditionalRevisionAgreement"("customerId", "createdAt");
CREATE INDEX "AdditionalRevisionAgreement_sellerProfileId_createdAt_idx" ON "AdditionalRevisionAgreement"("sellerProfileId", "createdAt");
CREATE UNIQUE INDEX "AdditionalRevisionAgreement_one_unsettled_per_booking_key"
  ON "AdditionalRevisionAgreement"("bookingId")
  WHERE "status" IN ('AWAITING_PAYMENT', 'FUNDED', 'IN_PROGRESS', 'DELIVERED', 'IN_REVIEW', 'DISPUTED', 'CANCELLATION_PENDING');

CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT,
  "additionalAgreementId" TEXT,
  "orderReference" TEXT NOT NULL,
  "provider" VARCHAR(32),
  "providerReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
  "sellerPrice" INTEGER NOT NULL,
  "adminFee" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(3),
  "capturedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTransaction_orderReference_key" UNIQUE ("orderReference"),
  CONSTRAINT "PaymentTransaction_providerReference_key" UNIQUE ("providerReference"),
  CONSTRAINT "PaymentTransaction_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "PaymentTransaction_one_target_check" CHECK (num_nonnulls("bookingId", "additionalAgreementId") = 1),
  CONSTRAINT "PaymentTransaction_amount_check" CHECK ("sellerPrice" >= 0 AND "adminFee" >= 0 AND "amount" = "sellerPrice" + "adminFee" AND "amount" > 0 AND "currency" = 'IDR'),
  CONSTRAINT "PaymentTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentTransaction_additionalAgreementId_fkey" FOREIGN KEY ("additionalAgreementId") REFERENCES "AdditionalRevisionAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PaymentTransaction_bookingId_status_idx" ON "PaymentTransaction"("bookingId", "status");
CREATE INDEX "PaymentTransaction_additionalAgreementId_status_idx" ON "PaymentTransaction"("additionalAgreementId", "status");

CREATE TABLE "ProviderEventInbox" (
  "id" TEXT NOT NULL,
  "paymentTransactionId" TEXT,
  "provider" VARCHAR(32) NOT NULL,
  "providerEventId" VARCHAR(255) NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "processingStatus" VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  "safePayload" JSONB,
  CONSTRAINT "ProviderEventInbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderEventInbox_provider_providerEventId_key" UNIQUE ("provider", "providerEventId"),
  CONSTRAINT "ProviderEventInbox_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProviderEventInbox_processingStatus_receivedAt_idx" ON "ProviderEventInbox"("processingStatus", "receivedAt");

CREATE TABLE "PaymentRefund" (
  "id" TEXT NOT NULL,
  "paymentTransactionId" TEXT NOT NULL,
  "decisionReference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sellerPriceRefund" INTEGER NOT NULL,
  "adminFeeRefund" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_decisionReference_key" UNIQUE ("decisionReference"),
  CONSTRAINT "PaymentRefund_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "PaymentRefund_providerReference_key" UNIQUE ("providerReference"),
  CONSTRAINT "PaymentRefund_amount_check" CHECK ("sellerPriceRefund" >= 0 AND "adminFeeRefund" >= 0 AND "amount" = "sellerPriceRefund" + "adminFeeRefund" AND "amount" > 0),
  CONSTRAINT "PaymentRefund_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PaymentRefund_paymentTransactionId_status_idx" ON "PaymentRefund"("paymentTransactionId", "status");

CREATE TABLE "SellerPayout" (
  "id" TEXT NOT NULL,
  "paymentTransactionId" TEXT NOT NULL,
  "additionalAgreementId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
  "status" "SellerPayoutStatus" NOT NULL DEFAULT 'HELD',
  "providerReference" TEXT,
  "submittedAt" TIMESTAMPTZ(3),
  "confirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SellerPayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerPayout_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "SellerPayout_providerReference_key" UNIQUE ("providerReference"),
  CONSTRAINT "SellerPayout_amount_check" CHECK ("amount" > 0 AND "currency" = 'IDR'),
  CONSTRAINT "SellerPayout_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SellerPayout_additionalAgreementId_fkey" FOREIGN KEY ("additionalAgreementId") REFERENCES "AdditionalRevisionAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SellerPayout_paymentTransactionId_status_idx" ON "SellerPayout"("paymentTransactionId", "status");
CREATE INDEX "SellerPayout_additionalAgreementId_status_idx" ON "SellerPayout"("additionalAgreementId", "status");

CREATE TABLE "FinancialLedgerEntry" (
  "id" TEXT NOT NULL,
  "sourceType" VARCHAR(32) NOT NULL,
  "sourceId" VARCHAR(255) NOT NULL,
  "entryType" VARCHAR(48) NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
  "paymentTransactionId" TEXT,
  "refundId" TEXT,
  "additionalAgreementId" TEXT,
  "payoutId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialLedgerEntry_sourceType_sourceId_entryType_key" UNIQUE ("sourceType", "sourceId", "entryType"),
  CONSTRAINT "FinancialLedgerEntry_currency_check" CHECK ("currency" = 'IDR'),
  CONSTRAINT "FinancialLedgerEntry_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialLedgerEntry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialLedgerEntry_additionalAgreementId_fkey" FOREIGN KEY ("additionalAgreementId") REFERENCES "AdditionalRevisionAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialLedgerEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "SellerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FinancialLedgerEntry_additionalAgreementId_createdAt_idx" ON "FinancialLedgerEntry"("additionalAgreementId", "createdAt");
CREATE INDEX "FinancialLedgerEntry_paymentTransactionId_createdAt_idx" ON "FinancialLedgerEntry"("paymentTransactionId", "createdAt");
CREATE INDEX "FinancialLedgerEntry_payoutId_createdAt_idx" ON "FinancialLedgerEntry"("payoutId", "createdAt");

CREATE TABLE "AdditionalRevisionEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "agreementId" TEXT,
  "actorUserId" TEXT,
  "eventType" VARCHAR(64) NOT NULL,
  "fromStatus" VARCHAR(40),
  "toStatus" VARCHAR(40),
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdditionalRevisionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalRevisionEvent_target_check" CHECK (num_nonnulls("requestId", "agreementId") = 1),
  CONSTRAINT "AdditionalRevisionEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AdditionalRevisionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionEvent_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "AdditionalRevisionAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdditionalRevisionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AdditionalRevisionEvent_requestId_occurredAt_id_idx" ON "AdditionalRevisionEvent"("requestId", "occurredAt", "id");
CREATE INDEX "AdditionalRevisionEvent_agreementId_occurredAt_id_idx" ON "AdditionalRevisionEvent"("agreementId", "occurredAt", "id");

-- Immutable offer terms and accepted agreement snapshots; status-only transitions remain possible.
CREATE FUNCTION "protect_additional_revision_offer_terms"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."requestId" IS DISTINCT FROM NEW."requestId"
     OR OLD."version" IS DISTINCT FROM NEW."version"
     OR OLD."scope" IS DISTINCT FROM NEW."scope"
     OR OLD."terms" IS DISTINCT FROM NEW."terms"
     OR OLD."sellerPrice" IS DISTINCT FROM NEW."sellerPrice"
     OR OLD."adminFee" IS DISTINCT FROM NEW."adminFee"
     OR OLD."buyerTotal" IS DISTINCT FROM NEW."buyerTotal"
     OR OLD."pricingPolicyVersion" IS DISTINCT FROM NEW."pricingPolicyVersion"
     OR OLD."estimatedDurationHours" IS DISTINCT FROM NEW."estimatedDurationHours"
     OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Additional revision offer terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdditionalRevisionOfferVersion_immutable_terms"
  BEFORE UPDATE ON "AdditionalRevisionOfferVersion"
  FOR EACH ROW EXECUTE FUNCTION "protect_additional_revision_offer_terms"();

CREATE FUNCTION "protect_additional_revision_agreement_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."bookingId" IS DISTINCT FROM NEW."bookingId"
     OR OLD."requestId" IS DISTINCT FROM NEW."requestId"
     OR OLD."offerVersionId" IS DISTINCT FROM NEW."offerVersionId"
     OR OLD."customerId" IS DISTINCT FROM NEW."customerId"
     OR OLD."sellerProfileId" IS DISTINCT FROM NEW."sellerProfileId"
     OR OLD."scopeSnapshot" IS DISTINCT FROM NEW."scopeSnapshot"
     OR OLD."termsSnapshot" IS DISTINCT FROM NEW."termsSnapshot"
     OR OLD."sellerPrice" IS DISTINCT FROM NEW."sellerPrice"
     OR OLD."adminFee" IS DISTINCT FROM NEW."adminFee"
     OR OLD."buyerTotal" IS DISTINCT FROM NEW."buyerTotal"
     OR OLD."pricingPolicyVersion" IS DISTINCT FROM NEW."pricingPolicyVersion"
     OR OLD."estimatedDurationHours" IS DISTINCT FROM NEW."estimatedDurationHours"
     OR OLD."acceptedAt" IS DISTINCT FROM NEW."acceptedAt"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Additional revision agreement snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdditionalRevisionAgreement_immutable_snapshot"
  BEFORE UPDATE ON "AdditionalRevisionAgreement"
  FOR EACH ROW EXECUTE FUNCTION "protect_additional_revision_agreement_snapshot"();

CREATE FUNCTION "validate_additional_revision_agreement_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  request_booking TEXT;
  request_customer TEXT;
  request_seller TEXT;
  request_status "AdditionalRevisionRequestStatus";
  offer_request TEXT;
  offer_status "AdditionalRevisionOfferStatus";
  offer_expiry TIMESTAMPTZ(3);
  offer_scope VARCHAR(4000);
  offer_terms VARCHAR(4000);
  offer_seller_price INTEGER;
  offer_admin_fee INTEGER;
  offer_buyer_total INTEGER;
  offer_policy VARCHAR(64);
  offer_duration INTEGER;
BEGIN
  SELECT "bookingId", "customerId", "sellerProfileId", "status"
    INTO request_booking, request_customer, request_seller, request_status
    FROM "AdditionalRevisionRequest" WHERE "id" = NEW."requestId";
  SELECT "requestId", "status", "expiresAt", "scope", "terms", "sellerPrice", "adminFee", "buyerTotal", "pricingPolicyVersion", "estimatedDurationHours"
    INTO offer_request, offer_status, offer_expiry, offer_scope, offer_terms, offer_seller_price, offer_admin_fee, offer_buyer_total, offer_policy, offer_duration
    FROM "AdditionalRevisionOfferVersion" WHERE "id" = NEW."offerVersionId";
  IF request_booking IS NULL OR request_booking <> NEW."bookingId"
     OR request_customer <> NEW."customerId" OR request_seller <> NEW."sellerProfileId"
     OR request_status <> 'OFFERED' OR offer_status <> 'ACTIVE' OR offer_expiry <= NEW."acceptedAt"
     OR offer_request <> NEW."requestId" OR offer_scope <> NEW."scopeSnapshot"
     OR offer_terms <> NEW."termsSnapshot" OR offer_seller_price <> NEW."sellerPrice"
     OR offer_admin_fee <> NEW."adminFee" OR offer_buyer_total <> NEW."buyerTotal"
     OR offer_policy <> NEW."pricingPolicyVersion" OR offer_duration <> NEW."estimatedDurationHours" THEN
    RAISE EXCEPTION 'Additional revision agreement must match its request and accepted offer snapshot';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdditionalRevisionAgreement_source_consistency"
  BEFORE INSERT ON "AdditionalRevisionAgreement"
  FOR EACH ROW EXECUTE FUNCTION "validate_additional_revision_agreement_source"();

CREATE FUNCTION "prevent_financial_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial and lifecycle audit records are append-only';
END;
$$;
CREATE TRIGGER "FinancialLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "FinancialLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "prevent_financial_audit_mutation"();
CREATE TRIGGER "AdditionalRevisionEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AdditionalRevisionEvent"
  FOR EACH ROW EXECUTE FUNCTION "prevent_financial_audit_mutation"();
