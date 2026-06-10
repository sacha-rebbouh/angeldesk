-- Additive provenance for canonical T0 facts and richer Context Engine snapshots

ALTER TABLE "ContextEngineSnapshot"
ADD COLUMN "websiteContent" JSONB,
ADD COLUMN "sources" JSONB,
ADD COLUMN "contextQuality" JSONB,
ADD COLUMN "sourceHealth" JSONB;

ALTER TABLE "FactEvent"
ADD COLUMN "truthConfidence" INTEGER,
ADD COLUMN "sourceMetadata" JSONB,
ADD COLUMN "reliability" JSONB;
