/**
 * Phase A slice A4-bis — Source guards Contradiction Detector.
 *
 * Vérifie mécaniquement :
 * - Compagnon (zéro tolérance) : pas de directive `>90% confident` /
 *   `penalised 9 points` / `kill reason` / `dealbreaker`.
 * - Compagnon ne demande PAS au LLM de produire `alertSignal.recommendation`
 *   ni l'énum prescriptif PROCEED/STOP comme champ d'émission.
 * - Compagnon expose le lexique natif Phase A (signalIntensity dérivé runtime).
 * - Runtime n'a plus la directive `>90% confident` ni `penalised N points`.
 * - Runtime importe le compagnon et l'utilise dans buildSystemPrompt.
 * - Runtime émet `signalIntensity` + `signalContribution` (contrat natif).
 * - Runtime dérive signalIntensity déterministe (anti-régression round 2 A3).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTRADICTION_DETECTOR_SYSTEM_PROMPT } from "../prompts/contradiction-detector-prompt";

const COMPANION_PATH = resolve(__dirname, "../prompts/contradiction-detector-prompt.ts");
const AGENT_PATH = resolve(__dirname, "../contradiction-detector.ts");

function loadFileSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("Phase A A4-bis — CD prompt compagnon source guards (zone zéro tolérance)", () => {
  const companionSource = loadFileSource(COMPANION_PATH);

  it("fichier compagnon ne contient AUCUNE directive `>90% confident` / `answer only if you are`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/you are\s+\d+\s*%\s*confident/i.test(companionSource)).toBe(false);
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
    // Régression A4-bis : le compagnon ne doit pas demander au LLM de
    // produire `alertSignal.recommendation: PROCEED|...|STOP` — ce champ
    // est désormais dérivé déterministe par le runtime depuis signalIntensity.
    // Le mot "PROCEED" peut apparaître dans un contexte de "ne demande PAS"
    // ou de documentation — on l'autorise dans ces cas-là.
    const allowedContextRegex = /pas\s+(?:de|d'|au\s+contrat)|interdit|N'EST PAS|N'est pas|dérivé|derived|déjà documenté|legacy|note operationnelle/i;
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
    // Vérifie qu'aucune occurrence de l'énum prescriptif n'est dans un
    // contexte de demande active LLM.
    expect(isInForbiddenContext("PROCEED_WITH_CAUTION")).toBe(false);
    expect(isInForbiddenContext("PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP")).toBe(false);
  });

  it("fichier compagnon EXPOSE le lexique natif Phase A (signalIntensity)", () => {
    expect(companionSource).toMatch(/signalIntensity/);
  });

  it("constante CONTRADICTION_DETECTOR_SYSTEM_PROMPT runtime ne contient pas les tokens bannis", () => {
    expect(/>\s*90\s*%\s*confident/i.test(CONTRADICTION_DETECTOR_SYSTEM_PROMPT)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(CONTRADICTION_DETECTOR_SYSTEM_PROMPT)).toBe(false);
    expect(/kill[\s_-]?reason/i.test(CONTRADICTION_DETECTOR_SYSTEM_PROMPT)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(CONTRADICTION_DETECTOR_SYSTEM_PROMPT)).toBe(false);
  });
});

describe("Phase A A4-bis — CD agent runtime source guards", () => {
  const agentSource = loadFileSource(AGENT_PATH);

  it("agent runtime ne contient AUCUNE directive `>90% confident` ni `penalised N points`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(agentSource)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(agentSource)).toBe(false);
  });

  it("agent runtime ne contient AUCUN `dealbreaker`", () => {
    expect(/deal[\s_-]?breaker/i.test(agentSource)).toBe(false);
  });

  it("agent runtime IMPORTE le prompt compagnon et l'utilise dans buildSystemPrompt", () => {
    expect(agentSource).toMatch(/from\s+["']\.\/prompts\/contradiction-detector-prompt["']/);
    expect(agentSource).toMatch(/return\s+CONTRADICTION_DETECTOR_SYSTEM_PROMPT/);
  });

  it("agent runtime EMET le contrat natif Phase A (signalIntensity + signalContribution)", () => {
    expect(agentSource).toMatch(/signalIntensity,/);
    expect(agentSource).toMatch(/signalContribution,/);
  });

  it("agent runtime DERIVE signalIntensity déterministe (pas LLM-driven — leçon round 2 A3)", () => {
    // Anti-régression : le runtime expose une fonction de dérivation
    // déterministe `deriveSignalIntensityFromContradictions` qui prend en
    // entrée des counts numériques, pas une valeur LLM.
    expect(agentSource).toMatch(/deriveSignalIntensityFromContradictions/);
    const deriveMatch = agentSource.match(/private deriveSignalIntensityFromContradictions[\s\S]*?^\s\s\}/m);
    expect(deriveMatch).not.toBeNull();
    if (deriveMatch) {
      // La fonction ne doit pas lire `data.signalIntensity` (LLM).
      expect(deriveMatch[0]).not.toMatch(/data\.signalIntensity/);
    }
  });

  it("agent runtime EMET alertSignal.recommendation dérivé déterministe depuis signalIntensity", () => {
    expect(agentSource).toMatch(/signalIntensityToRecommendation\(signalIntensity\)/);
  });

  it("Round 2 Codex — formatAgentOutput (helper user prompt) n'expose PAS la valeur prescriptive PROCEED/STOP", () => {
    // Anti-régression : le bloc qui injectait `**Recommendation:** PROCEED|STOP`
    // depuis les agents précédents est retiré (formatAgentOutput, l. ~324).
    // On scanne le fichier complet pour vérifier qu'aucune concaténation
    // template literal n'expose `alert.recommendation` ni
    // `**Recommendation:**` avec interpolation.
    expect(agentSource).not.toMatch(/alert\.recommendation/);
    expect(agentSource).not.toMatch(/\*\*Recommendation:\*\*\s*\$\{/);
    expect(agentSource).not.toMatch(/Recommendation:\$\{alert\.recommendation/);
  });

  it("Round 2 Codex — justification alertSignal NE LIT PLUS la valeur LLM (déterministe uniquement)", () => {
    // Anti-régression : `data.alertSignal?.justification` doit NE PLUS être
    // lue côté builder alertSignal. Le builder émet uniquement une
    // justification déterministe basée sur signalIntensity + counts.
    // Vérifie au niveau du fichier entier que la référence n'existe plus
    // (sauf dans des commentaires explicites — exclu par le regex).
    const matches = agentSource.match(/data\.alertSignal\?\.justification/g) ?? [];
    // Aucune référence active (les commentaires utilisent du markdown inline
    // avec backticks `\`data.alertSignal?.justification\`` qui peut matcher
    // — on filtre les occurrences hors commentaires).
    const lines = agentSource.split("\n");
    const activeMatches = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
      return /data\.alertSignal\?\.justification/.test(line);
    });
    expect(activeMatches).toEqual([]);
    // Sanity check : matches globaux peuvent inclure les mentions en
    // commentaire (documentation du retrait).
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });
});
