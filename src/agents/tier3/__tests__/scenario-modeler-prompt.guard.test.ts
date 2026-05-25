/**
 * Phase A slice A4 — Source guards Scenario Modeler.
 *
 * Vérifie mécaniquement les invariants doctrinaux Phase A appliqués au
 * Scenario Modeler :
 *
 * Zone 1 — Fichier compagnon `prompts/scenario-modeler-prompt.ts`
 * (zéro tolérance) :
 * - Aucune directive historique de seuil d'auto-confiance.
 * - Aucun lexique prescriptif legacy ("kill reason", "dealbreaker").
 * - Présence du lexique natif Phase A (dominantScenario, signalContribution).
 * - Aucune demande au LLM de produire `signalContribution` (dérivé runtime).
 *
 * Zone 2 — Runtime Scenario `scenario-modeler.ts` :
 * - Aucune directive historique de seuil d'auto-confiance.
 * - Aucun `dealbreaker`.
 * - L'agent importe le prompt compagnon.
 * - Le runtime émet `dominantScenario` natif (D1) + `signalContribution`
 *   dérivé déterministe (LLM ne pilote pas).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCENARIO_MODELER_SYSTEM_PROMPT } from "../prompts/scenario-modeler-prompt";

const COMPANION_PATH = resolve(__dirname, "../prompts/scenario-modeler-prompt.ts");
const AGENT_PATH = resolve(__dirname, "../scenario-modeler.ts");

function loadFileSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("Phase A A4 — Scenario prompt compagnon source guards (zone zéro tolérance)", () => {
  const companionSource = loadFileSource(COMPANION_PATH);

  it("fichier compagnon ne contient AUCUNE directive `>90% confident` / `answer only if you are`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/you are\s+\d+\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/answer only if you are/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `penalised N points` (formule historique)", () => {
    expect(/penalised\s+\d+\s+points?/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN lexique `kill reason` / `killReason` / `dealbreaker`", () => {
    expect(/kill[\s_-]?reason/i.test(companionSource)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon EXPOSE le lexique natif Phase A (dominantScenario)", () => {
    expect(companionSource).toMatch(/dominantScenario/);
  });

  it("Round 2 Codex — fichier compagnon ne demande PAS au LLM les chemins legacy nested `findings.scenarios` / `findings.dominantScenario` / `findings.dominantScenarioRationale`", () => {
    // Anti-régression round 2 : runtime attend scenarios et dominantScenario
    // AU TOP-LEVEL du JSON. Le compagnon doit ne pas évoquer un chemin
    // nested `findings.*` comme contrat d'émission au LLM, sauf en cas de
    // commentaire explicite "PAS dans `findings.*`" pour l'interdiction.
    const allowedContextRegex = /pas dans|PAS dans|interdit|interdite|interne au transformer/i;
    function isInForbiddenContext(token: string): boolean {
      const indices: number[] = [];
      let pos = 0;
      while ((pos = companionSource.indexOf(token, pos)) !== -1) {
        indices.push(pos);
        pos += token.length;
      }
      return indices.some((i) => {
        const before = companionSource.slice(Math.max(0, i - 100), i);
        return !allowedContextRegex.test(before);
      });
    }

    for (const token of [
      "findings.scenarios",
      "findings.dominantScenario",
      "findings.dominantScenarioRationale",
    ]) {
      expect(isInForbiddenContext(token)).toBe(false);
    }
  });

  it("fichier compagnon ne DEMANDE PAS au LLM de produire signalContribution (dérivé runtime déterministe)", () => {
    // Le LLM ne doit pas piloter le signal — leçon round 2 A3 (riskPosture).
    // Le compagnon doit mentionner que signalContribution est dérivé runtime.
    expect(companionSource).toMatch(/NE PAS produire de signalContribution|dérivé.*runtime|orientation.*native.*dérivée déterministe/i);
  });

  it("constante SCENARIO_MODELER_SYSTEM_PROMPT runtime ne contient pas non plus les tokens bannis", () => {
    expect(/>\s*90\s*%\s*confident/i.test(SCENARIO_MODELER_SYSTEM_PROMPT)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(SCENARIO_MODELER_SYSTEM_PROMPT)).toBe(false);
    expect(/kill[\s_-]?reason/i.test(SCENARIO_MODELER_SYSTEM_PROMPT)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(SCENARIO_MODELER_SYSTEM_PROMPT)).toBe(false);
    expect(SCENARIO_MODELER_SYSTEM_PROMPT).toMatch(/dominantScenario/);
  });
});

describe("Phase A A4 — Scenario agent runtime source guards", () => {
  const agentSource = loadFileSource(AGENT_PATH);

  it("agent runtime ne contient AUCUNE directive `>90% confident` ni `penalised N points`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(agentSource)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(agentSource)).toBe(false);
  });

  it("agent runtime ne contient AUCUN `dealbreaker`", () => {
    expect(/deal[\s_-]?breaker/i.test(agentSource)).toBe(false);
  });

  it("agent runtime IMPORTE le prompt compagnon et l'utilise dans buildSystemPrompt", () => {
    expect(agentSource).toMatch(/from\s+["']\.\/prompts\/scenario-modeler-prompt["']/);
    expect(agentSource).toMatch(/return\s+SCENARIO_MODELER_SYSTEM_PROMPT/);
  });

  it("agent runtime EMET le contrat natif Phase A (dominantScenario + signalContribution)", () => {
    // Vérifie que le builder findings expose ces deux champs natifs.
    expect(agentSource).toMatch(/dominantScenario:/);
    expect(agentSource).toMatch(/signalContribution:/);
  });

  it("agent runtime DÉRIVE signalContribution déterministe (pas LLM-driven — leçon round 2 A3)", () => {
    // Anti-régression : le runtime expose une fonction de dérivation
    // déterministe `deriveSignalContributionFromScenarios` qui ne lit
    // PAS de valeur LLM `data.signalContribution`.
    expect(agentSource).toMatch(/deriveSignalContributionFromScenarios/);
    // Le code de la fonction ne doit pas lire `data.signalContribution` (LLM).
    const deriveMatch = agentSource.match(/private deriveSignalContributionFromScenarios[\s\S]*?^\s\s\}/m);
    expect(deriveMatch).not.toBeNull();
    if (deriveMatch) {
      expect(deriveMatch[0]).not.toMatch(/data\.signalContribution/);
    }
  });
});
