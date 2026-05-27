CREATE TABLE "ses_event_messages" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ses_event_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ses_event_messages_messageId_key" ON "ses_event_messages"("messageId");
