/**
 * Phase A slice A9-reste — Source guard global.
 *
 * Vérifie mécaniquement qu'aucun des fichiers in-scope A9-reste ne
 * réintroduit :
 * 1. La directive historique de seuil d'auto-confiance bannie (§ 6-bis) :
 *    `>90% confident`, `penalised N points`, `answer only if you are`,
 *    heading `Confidence Threshold`.
 * 2. L'ancienne logique d'auto-évaluation de confiance numérique (round 2
 *    Codex) :
 *    - `Rate your overall response confidence` (auto-eval HIGH/MEDIUM/LOW)
 *    - `HIGH / MEDIUM / LOW` (échelle d'auto-confidence)
 *    - `Claims where you have strong evidence and high certainty (>90%)`
 *      (ancien wording Structured Uncertainty avec seuil numérique)
 *    - `50-90%` et `<50%` (seuils numériques d'auto-confidence)
 *
 * Doctrine de remplacement (D4 verrouillé) : evidence-based self-audit +
 * evidence solidity classification (SOURCED / INFERRED / UNSOURCED) — pas
 * d'auto-évaluation numérique de confiance.
 *
 * Scope A9-reste strict (cf. brief utilisateur) :
 * - Tier 0 (5 fichiers — extraction, scoring initial, signaux d'alerte,
 *   fact-extractor, coherence-checker)
 * - Chat (1 fichier — deal-chat-agent)
 * - Orchestration HORS Board (2 fichiers — consensus-engine, reflexion)
 * - BaseAgent helpers (`base-agent.ts`) injectés via `buildFullSystemPrompt`
 *   pour tous les agents BaseAgent — round 2 Codex : ajouté au scope.
 *
 * Scope explicitement HORS A9-reste (autorisés à contenir encore les
 * patterns — relèvent d'autres slices) :
 * - Tier 1 (relève d'A7)
 * - Tier 2 (relève d'A8)
 * - Live (`src/lib/live/**`) (relève d'un slice Live dédié)
 * - Board (`src/agents/board/**`) (relève d'un slice Board dédié)
 * - Services externes (negotiation/strategist, etc.)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const A9_RESTE_INSCOPE_FILES = [
  "src/agents/document-extractor.ts",
  "src/agents/red-flag-detector.ts",
  "src/agents/deal-scorer.ts",
  "src/agents/tier0/fact-extractor.ts",
  "src/agents/tier0/deck-coherence-checker.ts",
  "src/agents/chat/deal-chat-agent.ts",
  "src/agents/orchestration/consensus-engine.ts",
  "src/agents/orchestration/reflexion.ts",
  // Round 2 Codex — BaseAgent injecte ses helpers anti-hallucination dans
  // TOUS les agents BaseAgent via buildFullSystemPrompt(). Garder ce fichier
  // dans le scope sinon la suppression locale ne suffit pas.
  "src/agents/base-agent.ts",
] as const;

const REPO_ROOT = resolve(__dirname, "../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("Phase A A9-reste — Source guard global (scope strict tier0 + chat + orchestration hors Board + BaseAgent helpers)", () => {
  for (const relPath of A9_RESTE_INSCOPE_FILES) {
    describe(relPath, () => {
      const source = loadFile(relPath);

      it("ne contient AUCUNE directive `>90% confident`", () => {
        expect(/>\s*90\s*%\s*confident/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `penalised N points` (formule historique)", () => {
        expect(/penalised\s+\d+\s+points?/i.test(source)).toBe(false);
        expect(/penalized\s+\d+\s+points?/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `answer only if you are` (formule historique de seuil)", () => {
        expect(/answer only if you are\s+\d/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN heading `Confidence Threshold` (heading historique)", () => {
        expect(/Anti-Hallucination Directive\s*[—-]\s*Confidence Threshold/i.test(source)).toBe(false);
      });

      it("Round 2 Codex — ne contient AUCUN `Rate your overall response confidence` (auto-eval bannie)", () => {
        expect(/rate your overall response confidence/i.test(source)).toBe(false);
      });

      it("Round 2 Codex — ne contient AUCUN `HIGH / MEDIUM / LOW` (échelle d'auto-confidence numérique)", () => {
        // Pattern précis avec espaces autour des `/` pour ne pas matcher
        // une URL/chemin et accepter aussi `HIGH/MEDIUM/LOW` sans espaces.
        expect(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/.test(source)).toBe(false);
      });

      it("Round 2 Codex — ne contient AUCUN `Claims where you have strong evidence and high certainty (>90%)` (ancien Structured Uncertainty)", () => {
        expect(/claims where you have strong evidence and high certainty\s*\(>?\s*90\s*%\s*\)/i.test(source)).toBe(false);
      });

      it("Round 2 Codex — ne contient AUCUN seuil numérique d'auto-confidence `50-90%`", () => {
        expect(/\b50\s*[-–]\s*90\s*%/.test(source)).toBe(false);
      });

      it("Round 2 Codex — ne contient AUCUN seuil numérique d'auto-confidence `<50%`", () => {
        expect(/<\s*50\s*%/.test(source)).toBe(false);
      });
    });
  }
});
