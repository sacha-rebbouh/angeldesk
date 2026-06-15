-- Phase B9 — Evidence Signal Resolution (user-level overlay on EvidenceHealth signals).
--
-- One row per (dealId, signalKey). The signalKey is built application-side
-- from the IDENTITY-defining fields of the panel finding (kind + subject +
-- year for contradictions, kind + documentId? for missing/freshness) so it
-- stays stable across re-runs and is insensitive to display wording. See
-- services/evidence/signal-identity.ts for the canonical builder.
--
-- We NEVER touch the underlying EvidenceSignal rows — this is a strictly
-- additive overlay (RESOLVED|IGNORED). Un-resolution = DELETE this row.

-- CreateEnum
CREATE TYPE "EvidenceSignalResolutionAction" AS ENUM ('RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "EvidenceSignalResolution" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "signalKey" VARCHAR(512) NOT NULL,
    "action" "EvidenceSignalResolutionAction" NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSignalResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSignalResolution_dealId_signalKey_key"
    ON "EvidenceSignalResolution"("dealId", "signalKey");

-- CreateIndex
CREATE INDEX "EvidenceSignalResolution_dealId_idx"
    ON "EvidenceSignalResolution"("dealId");

-- CreateIndex
CREATE INDEX "EvidenceSignalResolution_userId_idx"
    ON "EvidenceSignalResolution"("userId");

-- AddForeignKey
ALTER TABLE "EvidenceSignalResolution"
    ADD CONSTRAINT "EvidenceSignalResolution_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSignalResolution"
    ADD CONSTRAINT "EvidenceSignalResolution_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
