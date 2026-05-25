/**
 * Phase B slice B3 — Source guard Negotiation strategist anti-hallucination.
 *
 * Vérifie mécaniquement que `src/services/negotiation/strategist.ts` :
 *
 * 1. **Ne réintroduit AUCUNE** des directives historiques bannies (§ 6-bis
 *    Phase A — D4 verrouillé) :
 *    - `>90% confident`, `Answer only if you are >90% confident`
 *    - `penalised N points`
 *    - heading `Confidence Threshold`
 *    - `Rate your overall response confidence`
 *    - `HIGH / MEDIUM / LOW` (échelle d'auto-confidence)
 *    - `Claims where you have strong evidence and high certainty (>90%)`
 *    - `50-90%` / `<50%` / `>90%` dans contexte Structured Uncertainty
 *      (faux positifs business autorisés — pattern A8a contextuel).
 *
 * 2. **Importe** et **appelle** le helper canonique Phase A v12
 *    `getFiveAntiHallucinationDirectives()` depuis
 *    `src/agents/orchestration/prompts/anti-hallucination.ts`.
 *
 * Scope strict B3 (cf. brief utilisateur) :
 * - `src/services/negotiation/strategist.ts` UNIQUEMENT.
 * - `src/services/negotiation/index.ts` n'a pas de bloc anti-hallucination,
 *   hors scope.
 * - Le schéma `NegotiationStrategy` n'est pas touché ; la logique
 *   mapping/sanitize/score reste inchangée.
 *
 * Pattern dérivé du guard B2 (Board) et A9-reste (cross-target Phase A).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STRATEGIST_PATH = "src/services/negotiation/strategist.ts";
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

describe("Phase B B3 — Source guard strategist.ts (anti-hallucination)", () => {
  const source = loadFile(STRATEGIST_PATH);

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
        throw new Error(`Source guard B3 — seuil \`50-90%\` en contexte d'auto-confidence trouvé:\n${detail}`);
      }
      expect(violations).toEqual([]);
    });

    it("ne contient AUCUN seuil `<50%` dans le contexte Structured Uncertainty", () => {
      const violations = findContextualViolations(source, /<\s*50\s*%/);
      if (violations.length > 0) {
        const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
        throw new Error(`Source guard B3 — seuil \`<50%\` en contexte d'auto-confidence trouvé:\n${detail}`);
      }
      expect(violations).toEqual([]);
    });

    it("ne contient AUCUN seuil `>90%` dans le contexte Structured Uncertainty", () => {
      const violations = findContextualViolations(source, />\s*90\s*%/);
      if (violations.length > 0) {
        const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
        throw new Error(`Source guard B3 — seuil \`>90%\` en contexte d'auto-confidence trouvé:\n${detail}`);
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
