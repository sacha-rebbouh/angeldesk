-- AlterTable
ALTER TABLE "Deal" DROP COLUMN "conditionsScore",
DROP COLUMN "financialsScore",
DROP COLUMN "fundamentalsScore",
DROP COLUMN "globalScore",
DROP COLUMN "marketScore",
DROP COLUMN "productScore",
DROP COLUMN "teamScore";

-- AlterTable
ALTER TABLE "AnalysisSignalSummary" DROP COLUMN "financialsScore",
DROP COLUMN "globalScore",
DROP COLUMN "marketScore",
DROP COLUMN "productScore",
DROP COLUMN "teamScore";

-- AlterTable
ALTER TABLE "DealTermsVersion" DROP COLUMN "conditionsScore";

