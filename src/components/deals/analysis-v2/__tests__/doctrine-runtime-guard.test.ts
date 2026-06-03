import { describe, expect, it } from "vitest";

import { AGENT_TECHNICAL_NAMES, sanitizeSourceLabel } from "../lib/presentation";
import { thesisAlertCategoryLabel } from "@/lib/ui-configs";
import { buildDecisionSectionModel, buildMemoSectionModel, buildThesisSectionModel } from "../lib/selectors";
import { HOSTILE_CATEGORIES, HOSTILE_RESULTS, HOSTILE_SOURCE_STRINGS, HOSTILE_THESIS } from "./fixtures/hostile-results";

/**
 * Guard doctrine RUNTIME (data-driven) — complète le source-scan de
 * `doctrine-guard.test.ts` (qui ne voit que les littéraux hardcodés).
 *
 * Phase 0b : on verrouille que les HELPERS neutralisent les fuites des shapes
 * de données réelles (fixture hostile). Les assertions « view-model complet
 * propre » (`buildAnalysisV2ViewModel(HOSTILE_*)`) sont activées dans les phases
 * qui câblent la sanitization dans les sélecteurs/atoms (catégories → Phase 2,
 * sources → Phase 4, mémo → Phase 7) puis consolidées au guard final.
 */

function expectNoAgentName(value: string) {
  const lower = value.toLowerCase();
  for (const name of AGENT_TECHNICAL_NAMES) {
    expect(lower, `"${value}" contient le nom d'agent "${name}"`).not.toContain(name);
  }
  expect(lower, `"${value}" contient un "*-expert"`).not.toMatch(/-expert\b/);
}

describe("doctrine runtime guard — helpers neutralisent les fuites du fixture hostile", () => {
  it("sanitizeSourceLabel nettoie toutes les sources/locations piégées", () => {
    for (const raw of HOSTILE_SOURCE_STRINGS) {
      expectNoAgentName(sanitizeSourceLabel(raw));
    }
  });

  it("thesisAlertCategoryLabel ne rend jamais l'enum brut", () => {
    for (const cat of HOSTILE_CATEGORIES) {
      const label = thesisAlertCategoryLabel(cat);
      expect(label).not.toBeNull();
      expect(label!).not.toMatch(/_/); // pas d'underscore
      expect(label!).not.toBe(cat.toUpperCase()); // pas l'enum brut
    }
  });

  // Phase 2 : le view-model thèse expose la catégorie en LABEL, jamais l'enum brut.
  it("buildThesisSectionModel.alerts[].category est un label, pas un enum brut", () => {
    const model = buildThesisSectionModel(HOSTILE_THESIS, HOSTILE_RESULTS, "full_analysis");
    expect(model.alerts.length).toBeGreaterThan(0);
    for (const alert of model.alerts) {
      if (alert.category == null) continue;
      expect(alert.category).not.toMatch(/_/);
      expect(alert.category).not.toMatch(/^[A-Z_]+$/); // pas un enum SCREAMING_CASE
    }
  });

  // Phase 4 : les risques rangés n'exposent aucun nom d'agent (source/tags/preuve)
  // et ne retombent pas sur "Risque identifié" quand du contenu existe (#5).
  it("buildDecisionSectionModel.ranks : zéro nom d'agent, pas de titre générique quand contenu existe", () => {
    const model = buildDecisionSectionModel(HOSTILE_RESULTS);
    expect(model.ranks.length).toBeGreaterThan(0);
    for (const r of model.ranks) {
      if (r.source) expectNoAgentName(r.source);
      for (const t of r.tags ?? []) expectNoAgentName(t.label);
      if (r.evidence) expectNoAgentName(r.evidence);
      if (r.description) expectNoAgentName(r.description);
      expectNoAgentName(r.title); // un title runtime peut contenir un nom d'agent → doit être scrubé
      // le red flag du fixture a un `impact` mais pas de `title` → titre dérivé, pas générique
      expect(r.title).not.toBe("Risque identifié");
    }
  });

  // Phase 4 (finding Codex) : le mémo reconstitué ne fabrique pas de provenance
  // factice ("Tier 1") ni de nom d'agent dans la source des risques critiques.
  it("buildMemoSectionModel : pas de provenance factice dans les risques critiques", () => {
    const memo = buildMemoSectionModel(HOSTILE_RESULTS);
    if (memo.kind === "reconstituted") {
      for (const r of memo.criticalRisks) {
        if (r.source) {
          expect(r.source).not.toBe("Tier 1");
          expectNoAgentName(r.source);
        }
      }
    }
  });
});
