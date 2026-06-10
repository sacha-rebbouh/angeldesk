-- P1 Composite Indexes
--
-- Ajoute 3 indexes composites pour les queries dashboards/analysis les plus frequentes.
-- Evite les full-scan sur les tables qui grandissent (Deal, RedFlag, Analysis).
--
-- Safe: CREATE INDEX IF NOT EXISTS uniquement, pas de lock long en prod Neon.

CREATE INDEX IF NOT EXISTS "Deal_userId_status_createdAt_idx"
  ON "Deal"("userId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "RedFlag_dealId_severity_idx"
  ON "RedFlag"("dealId", "severity");

CREATE INDEX IF NOT EXISTS "Analysis_dealId_status_createdAt_idx"
  ON "Analysis"("dealId", "status", "createdAt");
