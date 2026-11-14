-- Enforce simulation provenance and prevent demo transactions entering real financial records.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_demo_provenance_check" CHECK (
  ("status" = 'DEMO_PAID' AND "provenance" = 'DEMO_SIMULATION' AND "simulatedAt" IS NOT NULL AND "demoReference" IS NOT NULL)
  OR ("status" <> 'DEMO_PAID' AND "provenance" = 'REAL_PROVIDER' AND "simulatedAt" IS NULL AND "demoReference" IS NULL)
);
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_demo_provenance_check" CHECK (
  ("status" = 'DEMO_PAID' AND "provenance" = 'DEMO_SIMULATION' AND "simulatedAt" IS NOT NULL AND "provider" IS NULL AND "providerReference" IS NULL)
  OR ("status" <> 'DEMO_PAID' AND "provenance" = 'REAL_PROVIDER' AND "simulatedAt" IS NULL)
);

CREATE FUNCTION "reject_demo_financial_record"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payment_id TEXT;
  agreement_id TEXT;
BEGIN
  payment_id := COALESCE(to_jsonb(NEW)->>'paymentTransactionId', to_jsonb(OLD)->>'paymentTransactionId');
  agreement_id := COALESCE(to_jsonb(NEW)->>'additionalAgreementId', to_jsonb(OLD)->>'additionalAgreementId');
  IF (payment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "PaymentTransaction" WHERE "id" = payment_id AND "provenance" = 'DEMO_SIMULATION'
      )) OR (agreement_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "PaymentTransaction" WHERE "additionalAgreementId" = agreement_id AND "provenance" = 'DEMO_SIMULATION'
      )) THEN
    RAISE EXCEPTION 'Demo simulations cannot create real financial records';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;CREATE TRIGGER "PaymentRefund_reject_demo_simulation"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION "reject_demo_financial_record"();
CREATE TRIGGER "SellerPayout_reject_demo_simulation"
  BEFORE INSERT OR UPDATE OR DELETE ON "SellerPayout"
  FOR EACH ROW EXECUTE FUNCTION "reject_demo_financial_record"();
CREATE TRIGGER "FinancialLedgerEntry_reject_demo_simulation"
  BEFORE INSERT OR UPDATE OR DELETE ON "FinancialLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "reject_demo_financial_record"();
