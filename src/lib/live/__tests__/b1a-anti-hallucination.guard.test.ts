/**
 * Phase B slice B1a — Source guard Live non temps réel anti-hallucination.
 *
 * Vérifie mécaniquement que les 3 fichiers Live non temps réel :
 *   - `src/lib/live/post-call-generator.ts`
 *   - `src/lib/live/post-call-reanalyzer.ts`
 *   - `src/lib/live/transcript-condenser.ts`
 *
 * Ne réintroduisent AUCUNE des directives historiques bannies (§ 6-bis
 * Phase A — D4 verrouillé) et utilisent le helper canonique
 * `getFiveAntiHallucinationDirectives()`.
 *
 * Scope strict B1a (cf. brief utilisateur) :
 * - 3 fichiers Live non temps réel UNIQUEMENT.
 * - `coaching-engine.ts` et `visual-processor.ts` (Live temps réel) sont
 *   réservés au slice B1b — hors scope.
 * - Autres fichiers Live (`auto-dismiss`, `utterance-router`, `sanitize`,
 *   `ably-server`, `context-compiler`, `monitoring`, `recall-client`,
 *   `speaker-detector`, `ui-constants`, `types`) n'ont jamais eu de bloc
 *   anti-hallucination — hors scope.
 *
 * Pattern dérivé de B2 (Board) et B3 (Negotiation).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const B1A_FILES = [
  "src/lib/live/post-call-generator.ts",
  "src/lib/live/post-call-reanalyzer.ts",
  "src/lib/live/transcript-condenser.ts",
] as const;

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

/**
 * Contexte d'auto-confidence / Structured Uncertainty.
 * Filtre les vrais positifs : un seuil numérique en contexte business
 * reste autorisé, un seuil en contexte d'auto-confidence est banni.
 */
const AUTO_CONFIDENCE_CONTEXT_REGEX =
  /SPECULATIVE|CONFIDENT:|PROBABLE:|Claims where|pattern-matching|self-audit|Structured Uncertainty|overall response confidence|Rate your overall/i;

function findContextualViolations(
  source: string,
  thresholdRegex: RegExp,
): { line: string; lineNumber: number }[] {
  const lines = source.split("\n");
  const violations: { line: string; lineNumber: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!thresholdRegex.test(line)) continue;
    if (AUTO_CONFIDENCE_CONTEXT_REGEX.test(line)) {
      violations.push({ line: line.trim(), lineNumber: i + 1 });
    }
  }
  return violations;
}

describe("Phase B B1a — Source guard Live non temps réel (anti-hallucination)", () => {
  for (const relPath of B1A_FILES) {
    describe(relPath, () => {
      const source = loadFile(relPath);

      describe("1. Tokens production bannis (zéro tolérance)", () => {
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
      });

      describe("2. Seuils numériques contextuels (faux positifs business autorisés)", () => {
        it("ne contient AUCUN seuil `50-90%` dans le contexte Structured Uncertainty", () => {
          const violations = findContextualViolations(source, /\b50\s*[-–]\s*90\s*%/);
          if (violations.length > 0) {
            const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
            throw new Error(`Source guard B1a (${relPath}) — seuil \`50-90%\` en contexte d'auto-confidence:\n${detail}`);
          }
          expect(violations).toEqual([]);
        });

        it("ne contient AUCUN seuil `<50%` dans le contexte Structured Uncertainty", () => {
          const violations = findContextualViolations(source, /<\s*50\s*%/);
          if (violations.length > 0) {
            const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
            throw new Error(`Source guard B1a (${relPath}) — seuil \`<50%\` en contexte d'auto-confidence:\n${detail}`);
          }
          expect(violations).toEqual([]);
        });

        it("ne contient AUCUN seuil `>90%` dans le contexte Structured Uncertainty", () => {
          const violations = findContextualViolations(source, />\s*90\s*%/);
          if (violations.length > 0) {
            const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
            throw new Error(`Source guard B1a (${relPath}) — seuil \`>90%\` en contexte d'auto-confidence:\n${detail}`);
          }
          expect(violations).toEqual([]);
        });
      });

      describe("3. Helper canonique Phase A v12 (single source of truth)", () => {
        it("importe `getFiveAntiHallucinationDirectives` depuis le helper canonique", () => {
          const importPattern = /import\s*\{[^}]*getFiveAntiHallucinationDirectives[^}]*\}\s*from\s*["']@\/agents\/orchestration\/prompts\/anti-hallucination["']/;
          expect(importPattern.test(source)).toBe(true);
        });

        it("appelle `getFiveAntiHallucinationDirectives()` dans le system prompt", () => {
          expect(/getFiveAntiHallucinationDirectives\s*\(\s*\)/.test(source)).toBe(true);
        });
      });
    });
  }
});
