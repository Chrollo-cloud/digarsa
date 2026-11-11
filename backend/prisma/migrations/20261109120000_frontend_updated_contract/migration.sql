-- Additive compatibility fields for the current Digarsa frontend data model.
ALTER TABLE "User"
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "discoveryLocation" JSONB;

ALTER TABLE "SellerProfile"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Branding',
  ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "image" TEXT,
  ADD COLUMN "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "portfolioLink" TEXT,
  ADD COLUMN "publicLocation" JSONB;

UPDATE "SellerProfile" SET "city" = "region" WHERE "city" = '';

ALTER TABLE "Service"
  ADD COLUMN "delivery" TEXT NOT NULL DEFAULT 'Remote',
  ADD COLUMN "turnaround" TEXT NOT NULL DEFAULT 'Belum ditentukan',
  ADD COLUMN "image" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "serviceLocation" JSONB;

CREATE TABLE "SellerAvailabilitySlot" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "startTime" TIME(0) NOT NULL,
  "endTime" TIME(0) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerAvailabilitySlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerAvailabilitySlot_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SellerAvailabilitySlot_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SellerAvailabilitySlot_sellerId_date_idx" ON "SellerAvailabilitySlot"("sellerId", "date");
CREATE INDEX "SellerAvailabilitySlot_serviceId_date_idx" ON "SellerAvailabilitySlot"("serviceId", "date");
