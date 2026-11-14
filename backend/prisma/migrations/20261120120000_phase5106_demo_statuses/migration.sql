-- Add demo-only statuses in a separate migration so PostgreSQL commits the enum values
-- before the next migration uses them in its partial index.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DEMO_PAID';
ALTER TYPE "AdditionalRevisionAgreementStatus" ADD VALUE IF NOT EXISTS 'DEMO_FUNDED';
ALTER TYPE "AdditionalRevisionAgreementStatus" ADD VALUE IF NOT EXISTS 'DEMO_IN_PROGRESS';
ALTER TYPE "AdditionalRevisionAgreementStatus" ADD VALUE IF NOT EXISTS 'DEMO_IN_REVIEW';
ALTER TYPE "AdditionalRevisionAgreementStatus" ADD VALUE IF NOT EXISTS 'DEMO_COMPLETED';
