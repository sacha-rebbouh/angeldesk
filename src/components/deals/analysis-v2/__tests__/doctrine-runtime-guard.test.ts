import { describe, expect, it } from "vitest";

import { AGENT_TECHNICAL_NAMES, sanitizeSourceLabel } from "../lib/presentation";
import { thesisAlertCategoryLabel } from "@/lib/ui-configs";
import { HOSTILE_CATEGORIES, HOSTILE_SOURCE_STRINGS } from "./fixtures/hostile-results";

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
});
