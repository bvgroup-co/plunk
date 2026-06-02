-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SES', 'SENDGRID');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PROCESSED', 'FAILED', 'IGNORED');

-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'COMPLAINED';
ALTER TYPE "EmailStatus" ADD VALUE 'CLICKED';
ALTER TYPE "EmailStatus" ADD VALUE 'FAILED';

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'SES',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "dkimTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerDomainId" TEXT,
    "providerSubdomain" TEXT,
    "providerRecords" JSONB,
    "providerData" JSONB,
    "providerError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

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

-- Backfill SES domains from existing project identities.
INSERT INTO "domains" ("id", "domain", "email", "provider", "verified", "projectId", "createdAt", "updatedAt", "verifiedAt")
SELECT "id",
       split_part("email", '@', 2),
       "email",
       'SES',
       "verified",
       "id",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP,
       CASE WHEN "verified" THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "projects"
WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "domains_provider_providerDomainId_key" ON "domains"("provider", "providerDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "domains_projectId_domain_key" ON "domains"("projectId", "domain");

-- CreateIndex
CREATE INDEX "domains_projectId_idx" ON "domains"("projectId");

-- CreateIndex
CREATE INDEX "domains_provider_verified_idx" ON "domains"("provider", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_providerEventId_key" ON "provider_webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_emailId_idx" ON "provider_webhook_events"("emailId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_provider_createdAt_idx" ON "provider_webhook_events"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
