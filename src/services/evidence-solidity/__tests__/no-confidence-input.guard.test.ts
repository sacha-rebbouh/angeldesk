/**
 * Phase A slice A6 — Source guard anti-fabrication Evidence Solidity.
 *
 * Vérifie mécaniquement que le service ne lit JAMAIS de score /
 * overallScore / confidence / confidenceLevel — invariant D2 doctrine.
 * Si un futur développeur tente de dériver evidenceSolidity depuis un
 * score d'auto-évaluation LLM, ce guard l'attrape.
 *
 * Scope : `src/services/evidence-solidity/index.ts` (zone protégée).
 *
 * Faux positifs autorisés (sources documentées) :
 * - Aucun pour l'instant. Si une mention `confidence` doit apparaître
 *   en commentaire pour expliquer ce qui est interdit, paraphraser au
 *   lieu d'écrire le mot littéral (cf. pattern A9-reste round 2).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE_PATH = resolve(__dirname, "../index.ts");

function loadSource(): string {
  return readFileSync(SERVICE_PATH, "utf-8");
}

describe("Phase A A6 — anti-fabrication source guard", () => {
  const source = loadSource();

  it("aucune référence active à `score`, `overallScore`, `confidence`, `confidenceLevel` hors commentaires", () => {
    // Filtre ligne par ligne : on ignore les commentaires (// ... ou * ...)
    // qui peuvent légitimement mentionner ces tokens pour expliquer
    // l'interdiction.
    const tokens = [
      /\bscore\b/i,
      /\boverallScore\b/i,
      /\bconfidence\b/i,
      /\bconfidenceLevel\b/i,
    ];
    const lines = source.split("\n");
    const violatingLines: { line: string; lineNumber: number; token: string }[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const trimmed = raw.trim();
      // Ignore les commentaires single-line (//) et les lignes JSDoc/*
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
      for (const token of tokens) {
        if (token.test(raw)) {
          violatingLines.push({ line: raw, lineNumber: i + 1, token: token.toString() });
        }
      }
    }

    if (violatingLines.length > 0) {
      // Message d'erreur lisible
      const detail = violatingLines
        .map((v) => `  L${v.lineNumber} (${v.token}): ${v.line.trim()}`)
        .join("\n");
      throw new Error(`Source guard A6 — référence(s) interdite(s) trouvée(s) dans le service Evidence Solidity:\n${detail}`);
    }

    expect(violatingLines).toEqual([]);
  });

  it("le typage `EvidenceSolidityInputs` n'expose AUCUN champ score/confidence (sécurité type-level)", () => {
    // Vérifie la signature exportée par lecture source. Si un futur PR
    // ajoute `score: number` à l'interface, ce regex le détecte.
    const inputsBlock = source.match(/export interface EvidenceSolidityInputs\s*\{[\s\S]*?\}/);
    expect(inputsBlock).not.toBeNull();
    if (inputsBlock) {
      expect(/\bscore\s*:/.test(inputsBlock[0])).toBe(false);
      expect(/\boverallScore\s*:/.test(inputsBlock[0])).toBe(false);
      expect(/\bconfidence\s*:/.test(inputsBlock[0])).toBe(false);
      expect(/\bconfidenceLevel\s*:/.test(inputsBlock[0])).toBe(false);
    }
  });
});
