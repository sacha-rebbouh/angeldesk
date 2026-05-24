/**
 * Phase A slice A8a — Source guard global Tier 2 (anti-hallucination cleanup).
 *
 * Vérifie mécaniquement qu'aucun fichier Tier 2 (base-sector-expert + index
 * + 22 experts sectoriels) ne contient :
 *
 * 1. La directive historique de seuil d'auto-confiance bannie (§ 6-bis,
 *    Codex A8 audit point 3) :
 *    - `>90% confident`, `Answer only if you are >90% confident`
 *    - `penalised N points`
 *    - heading `Confidence Threshold`
 *
 * 2. L'ancienne logique d'auto-évaluation de confiance numérique :
 *    - `Rate your overall response confidence` (auto-eval HIGH/MEDIUM/LOW)
 *    - `HIGH / MEDIUM / LOW` (échelle d'auto-confidence)
 *    - `Claims where you have strong evidence and high certainty (>90%)`
 *      (ancien wording Structured Uncertainty avec seuil numérique)
 *    - `50-90%` et `<50%` UNIQUEMENT dans le contexte Structured
 *      Uncertainty / auto-confidence (cf. décision Codex A8 audit point 5 :
 *      les seuils métier légitimes comme `Reach drop 50-90% overnight`
 *      dans creator-expert ou sector-standards doivent rester autorisés).
 *
 * Scope strict A8a : base + index + 22 experts. Ne couvre PAS sector-
 * standards.ts ni sector-benchmarks.ts ni output-mapper.ts ni
 * benchmark-injector.ts ni types.ts (pas de directives anti-hallucination
 * dans ces fichiers ; les seuils métier qu'ils contiennent restent
 * légitimes).
 *
 * Pattern dérivé du guard A7a (Tier 1) — règle invariant Phase A § 6-bis.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TIER2_FILES = [
  "src/agents/tier2/base-sector-expert.ts",
  "src/agents/tier2/index.ts",
  // 22 experts sectoriels (ordre alphabétique)
  "src/agents/tier2/ai-expert.ts",
  "src/agents/tier2/biotech-expert.ts",
  "src/agents/tier2/blockchain-expert.ts",
  "src/agents/tier2/climate-expert.ts",
  "src/agents/tier2/consumer-expert.ts",
  "src/agents/tier2/creator-expert.ts",
  "src/agents/tier2/cybersecurity-expert.ts",
  "src/agents/tier2/deeptech-expert.ts",
  "src/agents/tier2/edtech-expert.ts",
  "src/agents/tier2/fintech-expert.ts",
  "src/agents/tier2/foodtech-expert.ts",
  "src/agents/tier2/gaming-expert.ts",
  "src/agents/tier2/general-expert.ts",
  "src/agents/tier2/hardware-expert.ts",
  "src/agents/tier2/healthtech-expert.ts",
  "src/agents/tier2/hrtech-expert.ts",
  "src/agents/tier2/legaltech-expert.ts",
  "src/agents/tier2/marketplace-expert.ts",
  "src/agents/tier2/mobility-expert.ts",
  "src/agents/tier2/proptech-expert.ts",
  "src/agents/tier2/saas-expert.ts",
  "src/agents/tier2/spacetech-expert.ts",
] as const;

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

/**
 * Contexte d'auto-confidence / Structured Uncertainty.
 *
 * Sert à filtrer les vrais positifs : un seuil numérique dans un contexte
 * business légitime (ex: "Reach can drop 50-90% overnight") doit rester
 * autorisé ; un seuil numérique dans un contexte de catégorisation
 * d'auto-confidence (CONFIDENT/PROBABLE/SPECULATIVE, Claims where, etc.)
 * doit être banni.
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

describe("Phase A A8a — Source guard global Tier 2 (anti-hallucination cleanup)", () => {
  for (const relPath of TIER2_FILES) {
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

      it("ne contient AUCUN seuil `50-90%` dans le contexte Structured Uncertainty (faux positifs business autorisés)", () => {
        // Codex A8 audit point 5 : les seuils business (ex: "Reach can drop
        // 50-90% overnight" dans creator-expert / sector-standards) restent
        // autorisés. Seules les occurrences en contexte d'auto-confidence
        // sont bannies.
        const violations = findContextualViolations(source, /\b50\s*[-–]\s*90\s*%/);
        if (violations.length > 0) {
          const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
          throw new Error(`Source guard A8a — seuil \`50-90%\` dans contexte d'auto-confidence trouvé:\n${detail}`);
        }
        expect(violations).toEqual([]);
      });

      it("ne contient AUCUN seuil `<50%` dans le contexte Structured Uncertainty (faux positifs business autorisés)", () => {
        const violations = findContextualViolations(source, /<\s*50\s*%/);
        if (violations.length > 0) {
          const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
          throw new Error(`Source guard A8a — seuil \`<50%\` dans contexte d'auto-confidence trouvé:\n${detail}`);
        }
        expect(violations).toEqual([]);
      });

      it("ne contient AUCUN seuil `>90%` dans le contexte Structured Uncertainty (faux positifs business autorisés)", () => {
        const violations = findContextualViolations(source, />\s*90\s*%/);
        if (violations.length > 0) {
          const detail = violations.map((v) => `  L${v.lineNumber}: ${v.line}`).join("\n");
          throw new Error(`Source guard A8a — seuil \`>90%\` dans contexte d'auto-confidence trouvé:\n${detail}`);
        }
        expect(violations).toEqual([]);
      });
    });
  }
});
