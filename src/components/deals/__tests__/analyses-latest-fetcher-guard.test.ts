import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Garde anti-régression : les 3 consommateurs de la query ['analyses','latest'] DOIVENT passer par
// le fetcher auth-required partagé (`@/lib/fetch-latest-analysis` : token Clerk frais + retry skipCache
// + AuthExpiredError), JAMAIS un `fetch()` brut sur /api/deals/:id/analyses — sinon une session Clerk
// expirée (404 signed-out) fige l'UI sur un faux 0 % au lieu de proposer la reconnexion.

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), "src/components/deals", rel), "utf8");
}

const RAW_ANALYSES_FETCH = /fetch\(\s*`\/api\/deals\/\$\{dealId\}\/analyses`/;

describe("analyses.latest — fetcher auth-required partagé (anti-régression)", () => {
  it("overlay : importe le fetcher partagé, pas de fetch() brut sur /analyses", () => {
    const s = src("analysis-v2/analysis-running-overlay.tsx");
    expect(s).toMatch(/from ["']@\/lib\/fetch-latest-analysis["']/);
    expect(s).not.toMatch(RAW_ANALYSES_FETCH);
  });

  it("tracker v2 : importe le fetcher partagé, pas de fetch() brut sur /analyses", () => {
    const s = src("analysis-v2/analysis-v2-live.tsx");
    expect(s).toMatch(/from ["']@\/lib\/fetch-latest-analysis["']/);
    expect(s).not.toMatch(RAW_ANALYSES_FETCH);
  });

  it("ancien panel : route fetchLatestAnalysis via le fetcher auth-required partagé", () => {
    const s = src("analysis-panel.tsx");
    expect(s).toMatch(/from ["']@\/lib\/fetch-latest-analysis["']/);
    expect(s).toMatch(/fetchLatestAnalysisAuth\b/);
  });
});
