-- ============================================================================
-- CURRENT FACTS MATERIALIZED VIEW
-- ============================================================================
-- Creates a materialized view for fast current facts lookups.
--
-- To apply:
--   npx dotenv -e .env.local -- npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual_current_facts_view.sql
--
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS current_facts_mv;

CREATE MATERIALIZED VIEW current_facts_mv AS
SELECT DISTINCT ON ("dealId", "factKey")
  id,
  "dealId",
  "factKey",
  category,
  value,
  "displayValue",
  unit,
  source,
  "sourceDocumentId",
  "sourceConfidence",
  "extractedText",
  "eventType",
  "supersedesEventId",
  "createdAt",
  "createdBy",
  reason
FROM "FactEvent"
WHERE "eventType" NOT IN ('DELETED', 'SUPERSEDED')
ORDER BY "dealId", "factKey", "createdAt" DESC;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_current_facts_mv_deal_fact
ON current_facts_mv ("dealId", "factKey");

-- Index for all facts of a deal
CREATE INDEX idx_current_facts_mv_deal
ON current_facts_mv ("dealId");

-- Index for category filtering
CREATE INDEX idx_current_facts_mv_category
ON current_facts_mv ("dealId", category);

-- Function for concurrent refresh
CREATE OR REPLACE FUNCTION refresh_current_facts_mv()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY current_facts_mv;
END;
$$ LANGUAGE plpgsql;
