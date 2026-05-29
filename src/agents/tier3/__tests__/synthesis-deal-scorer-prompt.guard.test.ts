/**
 * Source guard — `src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts`
 * (Phase A slice A2, D4 verrouillé)
 *
 * Garantit que le prompt système SDS (extrait nominal dans fichier compagnon)
 * ne contient plus la directive bannie "Answer only if you are >90% confident"
 * ni ses variantes, et qu'il instruit le LLM en orientation native (non
 * prescriptive).
 *
 * Le source brut entier du fichier compagnon doit être propre des motifs
 * bannis, y compris dans les commentaires (cf. règle A9-helpers de
 * reformulation des commentaires en termes non matchables, étendue ici à
 * tout fichier de prompt extrait Phase A).
 *
 * Périmètre du guard : fichier compagnon uniquement. Le fichier agent SDS
 * (`synthesis-deal-scorer.ts`) reste libre de contenir `STRONG_PASS` etc.
 * dans son `actionMapping` 1557-1568 — c'est un parser tolérant de sortie
 * LLM dégradée dans le même run (lecture seule, mapping vers orientation
 * native). Aucun ancien champ émis (D1 verrouillé).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT } from "../prompts/synthesis-deal-scorer-prompt";

const SOURCE_PATH = resolve(__dirname, "../prompts/synthesis-deal-scorer-prompt.ts");
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

describe("synthesis-deal-scorer-prompt.ts — source brut (Phase A v12, scope guard A10)", () => {
  it("ne contient plus la directive `>90% confident`", () => {
    expect(SOURCE).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("ne contient plus `you are 90% confident`", () => {
    expect(SOURCE).not.toMatch(/you\s+are\s+90\s*%\s*confident/i);
  });

  it("ne contient plus `penalised 9 points`", () => {
    expect(SOURCE).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("ne contient plus de seuil numérique d'auto-confiance", () => {
    expect(SOURCE).not.toMatch(/>\s*\d{1,3}\s*%\s*confident/i);
    expect(SOURCE).not.toMatch(/confident\s+\d{1,3}\s*%/i);
  });

  it("ne contient plus la phrase `Answer only if you are`", () => {
    expect(SOURCE).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("ne contient plus l'ancien titre `Confidence Threshold` comme directive active", () => {
    // La constante elle-même ne doit pas contenir ce titre. Le commentaire
    // d'en-tête utilise "directive historique" (non matchable).
    const constMatch = SOURCE.match(
      /export\s+const\s+SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`/
    );
    expect(constMatch).not.toBeNull();
    expect(constMatch![1]).not.toMatch(/##\s*Anti-Hallucination\s+Directive\s*—\s*Confidence\s+Threshold/i);
  });
});

describe("SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT — runtime invariant (Phase A v12)", () => {
  it("ne contient plus `>90% confident` au runtime", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("ne contient plus `penalised 9 points` au runtime", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("instruit le LLM en orientation native (cf. grille §6)", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/very_favorable/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/favorable/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/contrasted/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/vigilance/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/alert_dominant/);
  });

  it("conserve la règle anti-prescriptive (TONALITE — REGLE ABSOLUE)", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/ANALYSE et GUIDE/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/ne DECIDE JAMAIS/);
  });

  it("interdit explicitement les tokens prescriptifs banni (GO / NO-GO / Dealbreaker)", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/"GO"\s*\/\s*"NO-GO"\s*\/\s*"Dealbreaker"/);
  });

  it("conserve les 6 dimensions de scoring (dimension Exit retirée — anti-oraculaire)", () => {
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/Team\(26%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/Financials\(21%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/Market\(16%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/GTM\(16%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/Product\(16%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toMatch(/Competitive\(5%\)/);
    // Doctrine anti-oraculaire : la dimension de scoring "Exit" ne doit JAMAIS revenir
    // (l'exit-strategist a été retiré du pipeline ; pas de projection multiple/IRR/exit).
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).not.toMatch(/Exit\(\d+%\)/);
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).not.toMatch(/###\s*EXIT/);
  });

  it("est une string non vide", () => {
    expect(typeof SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT).toBe("string");
    expect(SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT.length).toBeGreaterThan(1000);
  });
});

describe("synthesis-deal-scorer.ts agent file — guard A10 cross-agent partiel", () => {
  // Note Phase A : le source du fichier agent (synthesis-deal-scorer.ts)
  // contient encore `STRONG_PASS` etc. dans `actionMapping` lignes 1557-1568.
  // C'est la zone de lecture LLM dégradée (parser tolérant), pas une consigne
  // ré-émise. D1 verrouillé : aucun alias legacy en sortie.
  //
  // Le guard A10 cross-agent (à créer dans un slice ultérieur) scannera le
  // fichier agent ET le fichier compagnon. Ici on vérifie uniquement que
  // l'agent ne contient plus la DIRECTIVE BANNIE de prompt (vs le mapping
  // legacy qui reste légitime).
  const AGENT_PATH = resolve(__dirname, "../synthesis-deal-scorer.ts");
  const AGENT_SOURCE = readFileSync(AGENT_PATH, "utf-8");

  it("le fichier agent ne contient plus la directive bannie `>90% confident`", () => {
    expect(AGENT_SOURCE).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("le fichier agent ne contient plus `penalised 9 points`", () => {
    expect(AGENT_SOURCE).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("le fichier agent ne contient plus `Answer only if you are`", () => {
    expect(AGENT_SOURCE).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("le fichier agent importe bien le prompt compagnon", () => {
    expect(AGENT_SOURCE).toMatch(
      /import\s+\{\s*SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT\s*\}\s+from\s+["']\.\/prompts\/synthesis-deal-scorer-prompt["']/
    );
  });

  it("le fichier agent conserve le mapping legacy `actionMapping` (parser tolérant LLM dégradé)", () => {
    // Ces tokens DOIVENT rester dans `actionMapping` — c'est le parser de
    // lecture LLM dégradée (D1 conserve la lecture, pas l'émission).
    expect(AGENT_SOURCE).toMatch(/actionMapping/);
    expect(AGENT_SOURCE).toMatch(/"STRONG_PASS"\s*:\s*"alert_dominant"/);
    expect(AGENT_SOURCE).toMatch(/"PASS"\s*:\s*"vigilance"/);
  });
});
