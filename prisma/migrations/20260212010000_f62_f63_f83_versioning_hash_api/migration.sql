-- F63: Content hash for document deduplication + cache invalidation
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;

-- F62: Document versioning
ALTER TABLE "Document" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Document" ADD COLUMN "parentDocumentId" TEXT;
ALTER TABLE "Document" ADD COLUMN "isLatest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "supersededAt" TIMESTAMP(3);

-- F62: Self-referencing FK for version chain
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for F62/F63
CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");
CREATE INDEX "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");

-- F83: API Keys for public API access
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- F83: Webhooks for event notifications
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- Unique and index constraints for F83
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
CREATE INDEX "Webhook_userId_idx" ON "Webhook"("userId");

-- Foreign keys for F83
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
