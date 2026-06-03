-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SES', 'SENDGRID');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable
ALTER TABLE "domains" ADD COLUMN "provider" "EmailProvider" NOT NULL DEFAULT 'SES',
ADD COLUMN "providerDomainId" TEXT,
ADD COLUMN "providerSubdomain" TEXT,
ADD COLUMN "providerRecords" JSONB,
ADD COLUMN "providerData" JSONB,
ADD COLUMN "providerError" TEXT,
ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Backfill verifiedAt for existing SES domains.
UPDATE "domains" SET "verifiedAt" = CURRENT_TIMESTAMP WHERE "verified" = true;

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PROCESSED',
    "error" TEXT,
    "emailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_provider_providerDomainId_key" ON "domains"("provider", "providerDomainId");

-- CreateIndex
CREATE INDEX "domains_provider_verified_idx" ON "domains"("provider", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_providerEventId_key" ON "provider_webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_emailId_idx" ON "provider_webhook_events"("emailId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_provider_createdAt_idx" ON "provider_webhook_events"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
