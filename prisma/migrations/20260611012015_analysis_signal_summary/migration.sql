-- CreateTable
CREATE TABLE "AnalysisSignalSummary" (
    "analysisId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "globalScore" DOUBLE PRECISION,
    "teamScore" DOUBLE PRECISION,
    "marketScore" DOUBLE PRECISION,
    "productScore" DOUBLE PRECISION,
    "financialsScore" DOUBLE PRECISION,
    "sector" TEXT,
    "stage" TEXT,
    "instrument" TEXT,
    "geography" TEXT,
    "description" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisSignalSummary_pkey" PRIMARY KEY ("analysisId")
);

-- CreateIndex
CREATE INDEX "AnalysisSignalSummary_dealId_idx" ON "AnalysisSignalSummary"("dealId");

-- CreateIndex
CREATE INDEX "AnalysisSignalSummary_schemaVersion_idx" ON "AnalysisSignalSummary"("schemaVersion");

-- AddForeignKey
ALTER TABLE "AnalysisSignalSummary" ADD CONSTRAINT "AnalysisSignalSummary_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

