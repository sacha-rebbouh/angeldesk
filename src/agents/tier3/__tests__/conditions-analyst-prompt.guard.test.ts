/**
 * Phase A slice A4-bis — Source guards Conditions Analyst.
 *
 * Mêmes invariants doctrinaux que CD :
 * - Compagnon (zéro tolérance) : pas de `>90% confident` / `penalised 9` /
 *   `kill reason` / `dealbreaker`.
 * - Compagnon ne demande PAS au LLM `alertSignal.recommendation`.
 * - Compagnon expose le lexique natif (signalIntensity dérivé runtime).
 * - Runtime importe compagnon + dérive signalIntensity déterministe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONDITIONS_ANALYST_SYSTEM_PROMPT } from "../prompts/conditions-analyst-prompt";

const COMPANION_PATH = resolve(__dirname, "../prompts/conditions-analyst-prompt.ts");
const AGENT_PATH = resolve(__dirname, "../conditions-analyst.ts");

function loadFileSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("Phase A A4-bis — CA prompt compagnon source guards (zone zéro tolérance)", () => {
  const companionSource = loadFileSource(COMPANION_PATH);

  it("fichier compagnon ne contient AUCUNE directive `>90% confident` / `answer only if you are`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/answer only if you are/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `penalised N points`", () => {
    expect(/penalised\s+\d+\s+points?/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `kill reason` / `dealbreaker`", () => {
    expect(/kill[\s_-]?reason/i.test(companionSource)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne demande PAS d'énum prescriptif PROCEED/STOP comme contrat d'émission au LLM", () => {
    const allowedContextRegex = /pas\s+(?:de|d'|au\s+contrat)|interdit|N'EST PAS|N'est pas|dérivé|derived|legacy|note operationnelle|debt|hors\s+scope/i;
    function isInForbiddenContext(token: string): boolean {
      const indices: number[] = [];
      let pos = 0;
      while ((pos = companionSource.indexOf(token, pos)) !== -1) {
        indices.push(pos);
        pos += token.length;
      }
      return indices.some((i) => {
        const before = companionSource.slice(Math.max(0, i - 120), i);
        return !allowedContextRegex.test(before);
      });
    }
    expect(isInForbiddenContext("PROCEED_WITH_CAUTION")).toBe(false);
    expect(isInForbiddenContext("PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP")).toBe(false);
  });

  it("constante CONDITIONS_ANALYST_SYSTEM_PROMPT runtime ne contient pas les tokens bannis", () => {
    expect(/>\s*90\s*%\s*confident/i.test(CONDITIONS_ANALYST_SYSTEM_PROMPT)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(CONDITIONS_ANALYST_SYSTEM_PROMPT)).toBe(false);
    expect(/kill[\s_-]?reason/i.test(CONDITIONS_ANALYST_SYSTEM_PROMPT)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(CONDITIONS_ANALYST_SYSTEM_PROMPT)).toBe(false);
  });
});

describe("Phase A A4-bis — CA agent runtime source guards", () => {
  const agentSource = loadFileSource(AGENT_PATH);

  it("agent runtime ne contient AUCUNE directive `>90% confident` ni `penalised N points`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(agentSource)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(agentSource)).toBe(false);
  });

  it("agent runtime ne contient AUCUN `dealbreaker`", () => {
    expect(/deal[\s_-]?breaker/i.test(agentSource)).toBe(false);
  });

  it("agent runtime IMPORTE le prompt compagnon et l'utilise dans buildSystemPrompt", () => {
    expect(agentSource).toMatch(/from\s+["']\.\/prompts\/conditions-analyst-prompt["']/);
    expect(agentSource).toMatch(/return\s+CONDITIONS_ANALYST_SYSTEM_PROMPT/);
  });

  it("agent runtime EMET le contrat natif Phase A (signalIntensity + signalContribution)", () => {
    expect(agentSource).toMatch(/signalIntensity:/);
    expect(agentSource).toMatch(/signalContribution:/);
  });

  it("agent runtime DERIVE signalIntensity déterministe (pas LLM-driven — leçon round 2 A3)", () => {
    expect(agentSource).toMatch(/deriveSignalIntensityFromConditions/);
    const deriveMatch = agentSource.match(/private deriveSignalIntensityFromConditions[\s\S]*?^\s\s\}/m);
    expect(deriveMatch).not.toBeNull();
    if (deriveMatch) {
      expect(deriveMatch[0]).not.toMatch(/data\.signalIntensity/);
    }
  });

  it("agent runtime EMET alertSignal.recommendation dérivé déterministe depuis signalIntensity", () => {
    expect(agentSource).toMatch(/signalIntensityToRecommendation\(findings\.signalIntensity\)/);
  });
});
