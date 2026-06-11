/**
 * Phase A slice A7a — Source guard global Tier 1 (prompt cleanup uniquement).
 *
 * Vérifie mécaniquement qu'aucun des 13 agents Tier 1 ne contient :
 * 1. La directive historique de seuil d'auto-confiance bannie (§ 6-bis) :
 *    `>90% confident`, `penalised N points`, `answer only if you are`,
 *    heading `Confidence Threshold`.
 * 2. L'ancienne logique d'auto-évaluation de confiance numérique :
 *    - `Rate your overall response confidence` (auto-eval HIGH/MEDIUM/LOW)
 *    - `HIGH / MEDIUM / LOW` (échelle d'auto-confidence)
 *    - `Claims where you have strong evidence and high certainty (>90%)`
 *      (ancien wording Structured Uncertainty avec seuil numérique)
 *    - `50-90%` et `<50%` dans le contexte de Structured Uncertainty
 *
 * Scope strict A7a : `src/agents/tier1/*.ts` (13 agents). Tier 0, Chat,
 * Orchestration et BaseAgent helpers sont déjà couverts par A9-reste.
 *
 * Note `<50%` business : `financial-auditor.ts` contient légitimement la
 * mention `Gross margin <50% pour SaaS` (métrique business sectorielle).
 * Le pattern `<50%` ne matche QUE le contexte Structured Uncertainty
 * (mots-clés `Claims` / `SPECULATIVE`). Hors ce contexte, le seuil business
 * est autorisé.
 *
 * A7a est prompt-only : il ne touche PAS `alertSignal.recommendation`
 * (qui reste à A7b). Aucun guard sur `recommendation` ici.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

// Glob the Tier 1 directory so a NEW agent is guarded BY DEFAULT (vs a hardcoded
// list a contributor must remember to update). Exclusions = non-agent files only;
// adding a real exclusion is a conscious, reviewed act.
const TIER1_DIR = "src/agents/tier1";
const TIER1_EXCLUDED = new Set(["index.ts"]);
const TIER1_FILES = readdirSync(resolve(REPO_ROOT, TIER1_DIR))
  .filter(
    (file) =>
      file.endsWith(".ts") && !file.endsWith(".d.ts") && !TIER1_EXCLUDED.has(file)
  )
  .sort()
  .map((file) => `${TIER1_DIR}/${file}`);

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("Phase A A7a — Source guard global Tier 1 (prompt cleanup)", () => {
  it("globs at least the 12 known Tier 1 agents (no vacuous pass)", () => {
    expect(TIER1_FILES.length).toBeGreaterThanOrEqual(12);
  });

  for (const relPath of TIER1_FILES) {
    describe(relPath, () => {
      const source = loadFile(relPath);

      it("ne contient AUCUNE directive `>90% confident`", () => {
        expect(/>\s*90\s*%\s*confident/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `penalised N points` (formule historique)", () => {
        expect(/penalised\s+\d+\s+points?/i.test(source)).toBe(false);
        expect(/penalized\s+\d+\s+points?/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `answer only if you are` (formule historique)", () => {
        expect(/answer only if you are\s+\d/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN heading `Confidence Threshold`", () => {
        expect(/Anti-Hallucination Directive\s*[—-]\s*Confidence Threshold/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `Rate your overall response confidence` (auto-eval bannie)", () => {
        expect(/rate your overall response confidence/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN `HIGH / MEDIUM / LOW` (échelle d'auto-confidence)", () => {
        expect(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/.test(source)).toBe(false);
      });

      it("ne contient AUCUN `Claims where you have strong evidence and high certainty (>90%)` (ancien Structured Uncertainty)", () => {
        expect(/claims where you have strong evidence and high certainty\s*\(>?\s*90\s*%\s*\)/i.test(source)).toBe(false);
      });

      it("ne contient AUCUN seuil `50-90%` dans le contexte Structured Uncertainty", () => {
        // Ce seuil n'apparaît dans aucun usage business légitime des Tier 1.
        // Bannir le pattern brut.
        expect(/\b50\s*[-–]\s*90\s*%/.test(source)).toBe(false);
      });

      it("ne contient AUCUN seuil `<50%` dans le contexte Structured Uncertainty (faux positifs business autorisés)", () => {
        // Inversion logique : `<50%` est légitime business par défaut
        // (gross margin <50% pour SaaS, fondateurs <50% avant Series A,
        // burn rate, etc.). On ne bannit QUE l'occurrence dans un
        // contexte explicite de Structured Uncertainty / auto-confidence
        // (présence des signaux SPECULATIVE / Claims / pattern-matching /
        // self-audit / uncertainty / structured / overall response).
        const lines = source.split("\n");
        const violatingLines: { line: string; lineNumber: number }[] = [];

        const autoConfidenceContextRegex = /SPECULATIVE|Claims|pattern-matching|self-audit|uncertainty|structured response|overall response confidence/i;

        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          if (!/<\s*50\s*%/.test(line)) continue;
          if (autoConfidenceContextRegex.test(line)) {
            violatingLines.push({ line: line.trim(), lineNumber: i + 1 });
          }
        }

        if (violatingLines.length > 0) {
          const detail = violatingLines
            .map((v) => `  L${v.lineNumber}: ${v.line}`)
            .join("\n");
          throw new Error(`Source guard A7a — seuil \`<50%\` dans contexte d'auto-confidence trouvé:\n${detail}`);
        }
        expect(violatingLines).toEqual([]);
      });
    });
  }
});
