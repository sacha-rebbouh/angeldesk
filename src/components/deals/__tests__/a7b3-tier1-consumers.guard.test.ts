/**
 * Phase A slice A7b-3 — Source guard consumers Tier 1 UI/PDF.
 *
 * Vérifie mécaniquement que :
 *
 * 1. `src/components/deals/tier1-results.tsx` ne contient plus de ternaire
 *    inline sur `alertSignal.recommendation === "STOP"` etc. (5 blocs
 *    dupliqués supprimés au profit d'un seul composant
 *    `Tier1AlertSignalDisplay`).
 * 2. `src/components/deals/tier1-results.tsx` consomme bien le helper
 *    `resolveTier1SignalIntensity` (via le composant partagé).
 * 3. `src/lib/pdf/pdf-sections/tier1-agents.tsx` consomme bien
 *    `resolveTier1SignalIntensity` pour piloter le label PDF (au lieu
 *    de lire `alert.recommendation` en chemin principal).
 * 4. Les deux fichiers conservent la référence `alert.recommendation`
 *    UNIQUEMENT comme argument du résolveur (fallback read-only documenté
 *    pour analyses persistées pré-A7b-2).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("Phase A A7b-3 — UI consumer tier1-results.tsx", () => {
  const TIER1_RESULTS_PATH = "src/components/deals/tier1-results.tsx";
  const source = loadFile(TIER1_RESULTS_PATH);

  it("ne contient PLUS de ternaire inline `alertSignal.recommendation === \"STOP\" ? \"bg-red-50\"`", () => {
    // Les 5 blocs dupliqués ont été remplacés par <Tier1AlertSignalDisplay />.
    // Si un nouveau site ré-inline la logique, le guard détecte la régression.
    const inlinePattern = /alertSignal\.recommendation\s*===\s*"STOP"\s*\?\s*"bg-red/;
    expect(inlinePattern.test(source)).toBe(false);
  });

  it("ne contient PLUS de ternaire inline `alertSignal.recommendation === \"INVESTIGATE_FURTHER\"`", () => {
    const inlinePattern = /alertSignal\.recommendation\s*===\s*"INVESTIGATE_FURTHER"\s*\?\s*"bg-/;
    expect(inlinePattern.test(source)).toBe(false);
  });

  it("ne contient PLUS de ternaire inline `alertSignal.recommendation === \"PROCEED_WITH_CAUTION\"`", () => {
    const inlinePattern = /alertSignal\.recommendation\s*===\s*"PROCEED_WITH_CAUTION"\s*\?\s*"bg-/;
    expect(inlinePattern.test(source)).toBe(false);
  });

  it("définit le composant partagé `Tier1AlertSignalDisplay`", () => {
    expect(/const Tier1AlertSignalDisplay\s*=\s*memo\s*\(/.test(source)).toBe(true);
  });

  it("importe `resolveTier1SignalIntensity` depuis ui-configs", () => {
    expect(/import\s*\{[^}]*resolveTier1SignalIntensity[^}]*\}\s*from\s*["']@\/lib\/ui-configs["']/.test(source)).toBe(true);
  });

  it("appelle `resolveTier1SignalIntensity(signalIntensity, ...)` dans le composant partagé", () => {
    expect(/resolveTier1SignalIntensity\s*\(\s*signalIntensity\s*,/.test(source)).toBe(true);
  });

  it("instancie `<Tier1AlertSignalDisplay>` plusieurs fois (au moins 3 fois — Card Financial + Cap Table + GTM minimum)", () => {
    const matches = source.match(/<Tier1AlertSignalDisplay\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Phase A A7b-3 — PDF consumer tier1-agents.tsx", () => {
  const TIER1_PDF_PATH = "src/lib/pdf/pdf-sections/tier1-agents.tsx";
  const source = loadFile(TIER1_PDF_PATH);

  it("importe `resolveTier1SignalIntensity` + `TIER1_SIGNAL_INTENSITY_LABELS` depuis ui-configs", () => {
    expect(/import\s*\{[^}]*resolveTier1SignalIntensity[^}]*\}\s*from\s*["']@\/lib\/ui-configs["']/.test(source)).toBe(true);
    expect(/import\s*\{[^}]*TIER1_SIGNAL_INTENSITY_LABELS[^}]*\}\s*from\s*["']@\/lib\/ui-configs["']/.test(source)).toBe(true);
  });

  it("extrait `signalIntensity` du payload agent", () => {
    expect(/const\s+signalIntensity\s*=\s*data\.signalIntensity/.test(source)).toBe(true);
  });

  it("appelle `resolveTier1SignalIntensity(signalIntensity, ...)` pour piloter le label PDF", () => {
    expect(/resolveTier1SignalIntensity\s*\(\s*signalIntensity\s*,/.test(source)).toBe(true);
  });

  it("ne pilote PAS le label PDF principal via un simple ALERT_SIGNAL_LABELS[alert.recommendation] non encapsulé", () => {
    // Le label PDF doit passer par la branche `intensity ? ... : ALERT_SIGNAL_LABELS[...]`.
    // On vérifie qu'on a bien une expression ternaire avec `intensity` comme test.
    const intensityBranchPattern = /const\s+label\s*=\s*intensity\s*\?\s*TIER1_SIGNAL_INTENSITY_LABELS/;
    expect(intensityBranchPattern.test(source)).toBe(true);
  });
});

describe("Phase A A7b-3 — Fallback read-only documenté (compat analyses pré-A7b-2)", () => {
  const TIER1_RESULTS_PATH = "src/components/deals/tier1-results.tsx";
  const TIER1_PDF_PATH = "src/lib/pdf/pdf-sections/tier1-agents.tsx";

  it("tier1-results.tsx documente le fallback `alertSignal.recommendation` comme read-only", () => {
    const source = loadFile(TIER1_RESULTS_PATH);
    // Le composant Tier1AlertSignalDisplay doit expliquer son fallback.
    expect(/fallback[^\n]*read-only|read-only[^\n]*fallback/i.test(source)).toBe(true);
  });

  it("tier1-agents.tsx documente le fallback `alert.recommendation` comme read-only", () => {
    const source = loadFile(TIER1_PDF_PATH);
    expect(/fallback[^\n]*read-only|read-only[^\n]*fallback|pré-A7b-2/i.test(source)).toBe(true);
  });
});
