CREATE TYPE "SesNotificationStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "ses_notifications" (
    "id" TEXT NOT NULL,
    "snsMessageId" TEXT NOT NULL,
    "status" "SesNotificationStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ses_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ses_notifications_snsMessageId_key" ON "ses_notifications"("snsMessageId");
CREATE INDEX "ses_notifications_status_idx" ON "ses_notifications"("status");
