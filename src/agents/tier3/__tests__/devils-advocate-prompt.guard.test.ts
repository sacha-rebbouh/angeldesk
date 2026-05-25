/**
 * Phase A slice A3 — Source guards Devil's Advocate.
 *
 * Vérifie mécaniquement les invariants doctrinaux Phase A appliqués au DA :
 *
 * Zone 1 — Fichier compagnon `prompts/devils-advocate-prompt.ts` (zéro tolérance) :
 * - Aucune directive historique de seuil d'auto-confiance (`>90% confident`,
 *   `penalised 9 points`) — règle § 6-bis Phase A.
 * - Aucun lexique "kill reason" / "killReason" / "dealbreaker" — D1 DA-spécifique.
 * - Aucun ordre prescriptif PROCEED|STOP comme énum dans le prompt.
 * - Présence de "structural" (lexique natif).
 *
 * Zone 2 — Runtime DA `devils-advocate.ts` (zone compat parser tolérant) :
 * - Aucune émission native `findings: { killReasons: ...` (D1 verrouillé).
 * - Aucune directive historique de seuil d'auto-confiance.
 * - Aucun `dealbreaker` (sémantique prescriptive).
 * - Le parser tolérant `data.findings?.killReasons` reste autorisé en lecture
 *   seule (champ optionnel de `LLMDevilsAdvocateResponse`) — il est légitime
 *   d'apparaître comme nom de variable / clé d'objet d'entrée.
 *
 * Note : `PROCEED|STOP` reste légitime dans le runtime DA — dans le bloc
 * `alertSignal` dérivé déterministe (mapping cross-agent debt, hors scope A3).
 * Le guard ne bannit donc pas ces tokens globalement dans l'agent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEVILS_ADVOCATE_SYSTEM_PROMPT } from "../prompts/devils-advocate-prompt";

const COMPANION_PATH = resolve(__dirname, "../prompts/devils-advocate-prompt.ts");
const AGENT_PATH = resolve(__dirname, "../devils-advocate.ts");

function loadFileSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("Phase A A3 — DA prompt compagnon source guards (zone zéro tolérance)", () => {
  const companionSource = loadFileSource(COMPANION_PATH);

  it("fichier compagnon ne contient AUCUNE directive `>90% confident`", () => {
    expect(/>\s*90\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/you are\s+\d+\s*%\s*confident/i.test(companionSource)).toBe(false);
    expect(/answer only if you are/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `penalised N points` (formule historique de seuil d'auto-confiance)", () => {
    expect(/penalised\s+\d+\s+points?/i.test(companionSource)).toBe(false);
    expect(/penalized\s+\d+\s+points?/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN lexique `kill reason` / `killReason` / `kill_reason`", () => {
    expect(/kill[\s_-]?reason/i.test(companionSource)).toBe(false);
    expect(/killreason/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN `dealbreaker`", () => {
    expect(/deal[\s_-]?breaker/i.test(companionSource)).toBe(false);
  });

  it("fichier compagnon ne contient AUCUN GO/NO-GO prescriptif", () => {
    // GO/NO-GO comme tag décisionnel adressé à l'investisseur.
    expect(/\bNO[-_\s]?GO\b/i.test(companionSource)).toBe(false);
    expect(/^\s*GO\s*$/m.test(companionSource)).toBe(false);
  });

  it("fichier compagnon EXPOSE le lexique natif (structural risk / structuralRisks / riskPosture)", () => {
    expect(companionSource).toMatch(/structural\s+critical\s+risk/i);
    expect(companionSource).toMatch(/structuralRisks/);
    expect(companionSource).toMatch(/riskPosture/);
  });

  it("Round 2 Codex — fichier compagnon ne demande PAS de champ `condition` au LLM (StructuralRiskSchema A1 n'a pas ce champ)", () => {
    // Anti-régression du drift prompt/contrat round 2 : le prompt demandait
    // jusqu'à round 1 un champ "condition" (path de résolution) que
    // StructuralRiskSchema (A1) ne contient PAS. Le LLM produirait alors un
    // champ ignoré par le runtime. Désormais le prompt doit demander uniquement
    // les champs contractuels (riskId, severity, category, description,
    // evidence?, impact?, source?, question?).
    expect(/champ\s+["']?condition["']?/i.test(companionSource)).toBe(false);
    expect(/field\s+["']?condition["']?/i.test(companionSource)).toBe(false);
    // Le mot "condition" peut apparaître dans des phrases contextuelles
    // ("dans quelles conditions", etc.) mais PAS comme nom de champ JSON.
    // On vérifie que le compagnon ne le déclare pas dans la définition JSON.
    expect(/"condition"\s*:/.test(companionSource)).toBe(false);
  });

  it("constante DEVILS_ADVOCATE_SYSTEM_PROMPT runtime ne contient pas non plus les tokens bannis (sécurité double)", () => {
    expect(/>\s*90\s*%\s*confident/i.test(DEVILS_ADVOCATE_SYSTEM_PROMPT)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(DEVILS_ADVOCATE_SYSTEM_PROMPT)).toBe(false);
    expect(/kill[\s_-]?reason/i.test(DEVILS_ADVOCATE_SYSTEM_PROMPT)).toBe(false);
    expect(/deal[\s_-]?breaker/i.test(DEVILS_ADVOCATE_SYSTEM_PROMPT)).toBe(false);
    expect(DEVILS_ADVOCATE_SYSTEM_PROMPT).toMatch(/structuralRisks/);
  });
});

describe("Phase A A3 — DA agent runtime source guards (zone compat parser autorisée)", () => {
  const agentSource = loadFileSource(AGENT_PATH);

  it("agent runtime ne contient AUCUNE directive `>90% confident` ni `penalised N points`", () => {
    // Règle § 6-bis Phase A : invariant cross-agent, applicable aussi au runtime.
    expect(/>\s*90\s*%\s*confident/i.test(agentSource)).toBe(false);
    expect(/penalised\s+\d+\s+points?/i.test(agentSource)).toBe(false);
  });

  it("agent runtime ne contient AUCUN `dealbreaker` (sémantique prescriptive)", () => {
    expect(/deal[\s_-]?breaker/i.test(agentSource)).toBe(false);
  });

  it("agent runtime n'EMET PAS `findings: { killReasons:` natif (D1)", () => {
    // L'output natif construit `findings: { ..., structuralRisks, riskPosture, ... }`.
    // Si jamais une émission `killReasons` réapparait via le builder findings,
    // ce guard l'attrape. Le pattern matche une émission objet-littéral,
    // pas la déclaration de type `killReasons?: ...` (parser tolérant).
    expect(/findings\s*:\s*DevilsAdvocateFindings[\s\S]{0,400}killReasons\s*[,}]/m.test(agentSource)).toBe(false);
  });

  it("agent runtime IMPORTE le prompt compagnon et l'utilise dans buildSystemPrompt", () => {
    expect(agentSource).toMatch(/from\s+["']\.\/prompts\/devils-advocate-prompt["']/);
    expect(agentSource).toMatch(/return\s+DEVILS_ADVOCATE_SYSTEM_PROMPT/);
  });

  it("agent runtime EMET le contrat natif Phase A (structuralRisks + riskPosture + signalContribution)", () => {
    // Indices d'émission native dans le builder findings.
    expect(agentSource).toMatch(/structuralRisks,/);
    expect(agentSource).toMatch(/riskPosture,/);
    expect(agentSource).toMatch(/signalContribution,/);
  });

  it("agent runtime conserve le parser tolérant de lecture LLM dégradée (zone compat)", () => {
    // Le parser doit pouvoir lire `data.findings?.killReasons` pour mapper
    // vers structuralRisks (lecture seule, jamais émis natif).
    expect(agentSource).toMatch(/data\.findings\?\.killReasons/);
    expect(agentSource).toMatch(/legacy killReasons.*mapping to structuralRisks/i);
  });
});
