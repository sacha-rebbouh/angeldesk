/**
 * Phase A slice A7b-2 — Source guard global Tier 1 (alertSignal.recommendation
 * dérivé déterministe runtime, plus piloté LLM).
 *
 * Vérifie mécaniquement pour chacun des 13 agents Tier 1 :
 *
 * 1. **Prompt** : aucun JSON schema ou bullet description ne demande au LLM
 *    le champ `"recommendation"` avec l'énumération legacy
 *    `PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP`. Le LLM ne doit
 *    plus piloter ce champ — il est calculé déterministe via le helper
 *    `signalIntensityToRecommendation()` (slice A7b-1).
 *
 * 2. **Runtime** : chaque agent importe `deriveTier1SignalIntensity` et
 *    `signalIntensityToRecommendation` depuis le helper A7b-1, et appelle
 *    `signalIntensityToRecommendation(signalIntensity)` au moins une fois
 *    pour produire `alertSignal.recommendation`.
 *
 * 3. **Output natif** : chaque agent émet `signalIntensity` (typé
 *    `Tier1SignalIntensity`) dans son output (le contrat global
 *    `AgentAlertSignal` reste intact pour compat infra — 102 consumers
 *    cross-agent — debt hors A7b).
 *
 * Hors scope (autorisé) :
 * - Interfaces TS internes `LLM<X>Response` qui acceptent encore
 *   `recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | ...` en input
 *   LLM (parser tolérant lecture seule — le runtime ignore la valeur).
 * - Schémas Zod `src/agents/tier1/schemas/common.ts` qui exposent encore
 *   la legacy (compat tests).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TIER1_FILES = [
  "src/agents/tier1/cap-table-auditor.ts",
  "src/agents/tier1/competitive-intel.ts",
  "src/agents/tier1/customer-intel.ts",
  "src/agents/tier1/deck-forensics.ts",
  "src/agents/tier1/exit-strategist.ts",
  "src/agents/tier1/financial-auditor.ts",
  "src/agents/tier1/gtm-analyst.ts",
  "src/agents/tier1/legal-regulatory.ts",
  "src/agents/tier1/market-intelligence.ts",
  "src/agents/tier1/question-master.ts",
  "src/agents/tier1/team-investigator.ts",
  "src/agents/tier1/tech-ops-dd.ts",
  "src/agents/tier1/tech-stack-dd.ts",
] as const;

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("Phase A A7b-2 — Source guard Tier 1 (alertSignal.recommendation dérivé déterministe)", () => {
  for (const relPath of TIER1_FILES) {
    describe(relPath, () => {
      const source = loadFile(relPath);

      // --- 1. Prompt cleanup ---

      it("ne demande PAS au LLM `\"recommendation\": \"PROCEED|...|STOP\"` (JSON schema prompt)", () => {
        // Pattern JSON-style avec guillemets autour de la valeur.
        // Couvre les deux variantes : `"PROCEED|...|STOP"` et
        // `"PROCEED" | "..." | "STOP"`.
        const jsonPromptPattern1 = /"recommendation"\s*:\s*"PROCEED\|/;
        const jsonPromptPattern2 = /"recommendation"\s*:\s*"PROCEED"\s*\|\s*"PROCEED_WITH_CAUTION"/;
        expect(jsonPromptPattern1.test(source)).toBe(false);
        expect(jsonPromptPattern2.test(source)).toBe(false);
      });

      it("ne contient PAS de bullet de prompt `alertSignal.*recommendation` (description LLM)", () => {
        // Bullets descriptifs en prompt : `- alertSignal: hasBlocker, recommendation, ...`
        // ou `- alertSignal (hasBlocker, recommendation)`.
        const bulletPattern = /-\s*alertSignal[^\n]*recommendation/;
        expect(bulletPattern.test(source)).toBe(false);
      });

      it("ne contient AUCUNE énumération prose `PROCEED/.../STOP` ou `PROCEED, ..., STOP` (prompt descriptif)", () => {
        // Codex round 1 — faux négatifs détectés dans des descriptions prose
        // (hors JSON schema) :
        //   customer-intel.ts:382 — "Signal analytique (PROCEED/PROCEED_WITH_CAUTION/INVESTIGATE_FURTHER/STOP)"
        //   financial-auditor.ts:252 — "Signal d'alerte (PROCEED, CAUTION, INVESTIGATE, STOP)"
        // Le LLM ne doit plus voir cette énumération, même en description.
        // Patterns à bannir :
        //   - `PROCEED/PROCEED_WITH_CAUTION/INVESTIGATE_FURTHER/STOP` (slash sep)
        //   - `PROCEED, CAUTION, INVESTIGATE, STOP` (comma sep, variante courte)
        //   - `PROCEED, PROCEED_WITH_CAUTION, INVESTIGATE_FURTHER, STOP` (comma sep, variante longue)
        const slashFullPattern = /PROCEED\s*\/\s*PROCEED_WITH_CAUTION\s*\/\s*INVESTIGATE_FURTHER\s*\/\s*STOP/;
        const commaShortPattern = /PROCEED\s*,\s*CAUTION\s*,\s*INVESTIGATE\s*,\s*STOP/;
        const commaFullPattern = /PROCEED\s*,\s*PROCEED_WITH_CAUTION\s*,\s*INVESTIGATE_FURTHER\s*,\s*STOP/;
        expect(slashFullPattern.test(source)).toBe(false);
        expect(commaShortPattern.test(source)).toBe(false);
        expect(commaFullPattern.test(source)).toBe(false);
      });

      it("ne réinjecte PAS `alertSignal.recommendation` dans un prompt de synthèse (Question Master leak)", () => {
        // Codex round 1 — question-master.ts:965-967 consommait
        // `alert.recommendation` venant des autres agents Tier 1 et le
        // réinjectait dans son prompt de synthèse via `Recommendation: ...`.
        // Ce flux est interdit en A7b-2 : si un agent agrège la sortie d'un
        // autre Tier 1, il doit consommer `signalIntensity` (native,
        // déterministe), pas `alertSignal.recommendation` (legacy dérivé).
        // Le guard cible la construction de prompt qui ré-expose la legacy.
        const promptInjectionPattern = /\$\{[^}]*\.recommendation[^}]*\}/;
        expect(promptInjectionPattern.test(source)).toBe(false);
      });

      // --- 2. Runtime helper usage ---

      it("importe `deriveTier1SignalIntensity` et `signalIntensityToRecommendation` depuis le helper A7b-1", () => {
        expect(/import\s*\{[^}]*deriveTier1SignalIntensity[^}]*\}\s*from\s*["']\.\/utils\/derive-alert-signal["']/.test(source)).toBe(true);
        expect(/import\s*\{[^}]*signalIntensityToRecommendation[^}]*\}\s*from\s*["']\.\/utils\/derive-alert-signal["']/.test(source)).toBe(true);
      });

      it("appelle `signalIntensityToRecommendation(signalIntensity)` pour piloter alertSignal.recommendation", () => {
        expect(/signalIntensityToRecommendation\s*\(\s*signalIntensity\s*\)/.test(source)).toBe(true);
      });

      it("calcule `signalIntensity` via `deriveTier1SignalIntensity({ criticalCount, highCount, score })`", () => {
        expect(/deriveTier1SignalIntensity\s*\(\s*\{/.test(source)).toBe(true);
      });

      // --- 3. Native signalIntensity in output ---

      it("annote `signalIntensity` du type `Tier1SignalIntensity` (output natif)", () => {
        expect(/signalIntensity\s*:\s*Tier1SignalIntensity/.test(source)).toBe(true);
      });
    });
  }
});
