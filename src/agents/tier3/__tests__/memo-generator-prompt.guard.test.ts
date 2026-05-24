/**
 * Phase A slice A4 — Source guards Memo Generator.
 *
 * Vérifie mécaniquement les invariants doctrinaux Phase A appliqués au Memo :
 *
 * Zone 1 — Fichier compagnon `prompts/memo-generator-prompt.ts` (zéro tolérance) :
 * - Aucune directive historique de seuil d'auto-confiance (`>90% confident`,
 *   `penalised 9 points`).
 * - Aucun lexique prescriptif legacy de "raison-de-tuer-le-deal" /
 *   "destructeur-de-deal" (kill reason, killReason, dealbreaker).
 * - Présence du lexique natif Phase A (signalProfile, criticalRisks,
 *   orientation native).
 *
 * Zone 2 — Runtime Memo `memo-generator.ts` :
 * - Aucune directive historique de seuil d'auto-confiance.
 * - Aucun `dealbreaker`.
 * - L'agent importe le prompt compagnon et l'utilise dans `buildSystemPrompt`.
 * - L'agent émet le contrat natif Phase A (signalProfile + criticalRisks).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MEMO_GENERATOR_SYSTEM_PROMPT } from "../prompts/memo-generator-prompt";

const COMPANION_PATH = resolve(__dirname, "../prompts/memo-generator-prompt.ts");
const AGENT_PATH = resolve(__dirname, "../memo-generator.ts");

function loadFileSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("Phase A A4 — Memo prompt compagnon source guards (zone zéro tolérance)", () => {
  const companionSource = loadFileSource(COMPANION_PATH);

  it("fichier compagnon ne contient AUCUNE directive `>90% confident` / `answer only if you are`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/you are\s+\d+\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/answer only if you are/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `penalised N points` (formule historique)", () => {
    expect(/penalised\s+\d+\s+points?/i.test(companionSource)).toBe(false);
    expect(/penalized\s+\d+\s+points?/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN lexique `kill reason` / `killReason` / `dealbreaker`", () => {
    expect(/kill[\s_-]?reason/i.test(companionSource)).toBe(false);
    expect(/killreason/i.test(companionSource)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon EXPOSE le lexique natif Phase A (signalProfile, criticalRisks, orientation native)", () => {
    expect(companionSource).toMatch(/signalProfile/);
    expect(companionSource).toMatch(/criticalRisks/);
    expect(companionSource).toMatch(/very_favorable/);
    expect(companionSource).toMatch(/alert_dominant/);
  });

  it("Round 2 Codex — fichier compagnon ne demande PAS au LLM les chemins legacy nested `memo.signalProfile` / `memo.criticalRisks`", () => {
    // Anti-régression round 2 : runtime attend signalProfile et criticalRisks
    // AU TOP-LEVEL du JSON. Le compagnon doit donc ne pas évoquer un chemin
    // nested `memo.signalProfile` / `memo.criticalRisks`, sauf en cas de
    // commentaire explicite mentionnant "PAS dans" pour cette interdiction.
    // On bannit les occurrences non-précédées de "PAS dans" / "PAS DANS".
    const nestedSignalProfile = companionSource.match(/memo\.signalProfile/g) ?? [];
    const nestedCriticalRisks = companionSource.match(/memo\.criticalRisks/g) ?? [];

    // Récupère le contexte précédent (~30 chars avant) pour vérifier qu'aucune
    // occurrence n'est dans un contexte "demande au LLM" (par opposition à
    // un commentaire d'interdiction).
    const allowedContextRegex = /pas dans|PAS dans|interdit|interdite|incorrect|incorrecte/i;
    function isInForbiddenContext(token: string): boolean {
      const indices: number[] = [];
      let pos = 0;
      while ((pos = companionSource.indexOf(token, pos)) !== -1) {
        indices.push(pos);
        pos += token.length;
      }
      return indices.some((i) => {
        const before = companionSource.slice(Math.max(0, i - 80), i);
        return !allowedContextRegex.test(before);
      });
    }

    if (nestedSignalProfile.length > 0) {
      expect(isInForbiddenContext("memo.signalProfile")).toBe(false);
    }
    if (nestedCriticalRisks.length > 0) {
      expect(isInForbiddenContext("memo.criticalRisks")).toBe(false);
    }
  });

  it("constante MEMO_GENERATOR_SYSTEM_PROMPT runtime ne contient pas non plus les tokens bannis (sécurité double)", () => {
    expect(/>\s*90\s*%\s*confident/i.test(MEMO_GENERATOR_SYSTEM_PROMPT)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(MEMO_GENERATOR_SYSTEM_PROMPT)).toBe(false);
    expect(/kill[\s_-]?reason/i.test(MEMO_GENERATOR_SYSTEM_PROMPT)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(MEMO_GENERATOR_SYSTEM_PROMPT)).toBe(false);
    expect(MEMO_GENERATOR_SYSTEM_PROMPT).toMatch(/signalProfile/);
    expect(MEMO_GENERATOR_SYSTEM_PROMPT).toMatch(/criticalRisks/);
  });
});

describe("Phase A A4 — Memo agent runtime source guards", () => {
  const agentSource = loadFileSource(AGENT_PATH);

  it("agent runtime ne contient AUCUNE directive `>90% confident` ni `penalised N points`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(agentSource)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(agentSource)).toBe(false);
  });

  it("agent runtime ne contient AUCUN `dealbreaker` (sauf zone parser tolérant lecture seule)", () => {
    // Zone compat parser : la fonction `normalizeSeverity` accepte un input
    // legacy `"DEAL_BREAKER"` (uppercase, source LLM ou agent) qu'elle mappe
    // vers `severity: "CRITICAL"` natif Phase A. Cette occurrence est en
    // lecture seule, jamais émise par le runtime. Le guard exclut le pattern
    // exact uppercase + underscore et bannit toute autre variante.
    const remainingDealbreakers = agentSource.match(/deal[\s_-]?breaker/gi) ?? [];
    const offending = remainingDealbreakers.filter((m) => m !== "DEAL_BREAKER");
    expect(offending).toEqual([]);
  });

  it("agent runtime IMPORTE le prompt compagnon et l'utilise dans buildSystemPrompt", () => {
    expect(agentSource).toMatch(/from\s+["']\.\/prompts\/memo-generator-prompt["']/);
    expect(agentSource).toMatch(/return\s+MEMO_GENERATOR_SYSTEM_PROMPT/);
  });

  it("agent runtime EMET le contrat natif Phase A (signalProfile + criticalRisks)", () => {
    expect(agentSource).toMatch(/signalProfile,/);
    expect(agentSource).toMatch(/criticalRisks,/);
  });
});
