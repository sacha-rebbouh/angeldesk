-- ============================================================================
-- CURRENT FACTS MATERIALIZED VIEW (canonical P0 schema)
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
  "truthConfidence",
  "extractedText",
  "sourceMetadata",
  "validAt",
  "periodType",
  "periodLabel",
  reliability,
  "eventType",
  "supersedesEventId",
  "createdAt",
  "createdBy",
  reason
FROM "FactEvent"
WHERE "eventType" NOT IN ('DELETED', 'SUPERSEDED', 'PENDING_REVIEW')
ORDER BY "dealId", "factKey", "createdAt" DESC;

CREATE UNIQUE INDEX idx_current_facts_mv_deal_fact
ON current_facts_mv ("dealId", "factKey");

CREATE INDEX idx_current_facts_mv_deal
ON current_facts_mv ("dealId");

CREATE INDEX idx_current_facts_mv_category
ON current_facts_mv ("dealId", category);

CREATE OR REPLACE FUNCTION refresh_current_facts_mv()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY current_facts_mv;
END;
$$ LANGUAGE plpgsql;
