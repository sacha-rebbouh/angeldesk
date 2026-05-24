/**
 * Source guard — `THESIS_ANTI_HALLUCINATION_DIRECTIVES` (Phase A slice A9-helpers, D4 verrouillé)
 *
 * Garantit que la constante doctrinale `THESIS_ANTI_HALLUCINATION_DIRECTIVES`
 * (src/agents/thesis/types.ts) ne contient plus la directive bannie
 * "Answer only if you are >90% confident" ni ses variantes (penalised 9
 * points, seuils numériques d'auto-confiance, "Rate overall confidence
 * HIGH/MEDIUM/LOW"), et qu'elle expose bien le gate de preuve structuré
 * §6-bis du plan Phase A.
 *
 * La constante est injectée dans tous les prompts thesis (thesis-extractor +
 * frameworks YC/Thiel/Angel Desk). Sa rupture est un signal que la directive
 * bannie a été ré-introduite via cette constante, ce qui contredirait
 * mécaniquement le travail d'éradication des autres slices Phase A.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { THESIS_ANTI_HALLUCINATION_DIRECTIVES } from "../types";

const SOURCE_PATH = resolve(__dirname, "../types.ts");
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

// Extrait précisément la constante depuis le source pour éviter les faux positifs
// liés à d'autres parties du fichier types.ts (commentaires d'historique inclus
// peuvent décrire ce qui a été supprimé sans le ré-introduire).
function extractDirectivesConstantBody(source: string): string {
  const match = source.match(
    /export\s+const\s+THESIS_ANTI_HALLUCINATION_DIRECTIVES\s*=\s*`([\s\S]*?)`\.trim\(\)/
  );
  if (!match) {
    throw new Error(
      "Constante THESIS_ANTI_HALLUCINATION_DIRECTIVES introuvable dans types.ts — " +
      "guard incapable de scanner."
    );
  }
  return match[1];
}

describe("types.ts — source brut entier (Phase A v12, scope guard A10)", () => {
  // Le source brut entier du fichier doit être propre des motifs bannis,
  // y compris dans les commentaires d'en-tête de la constante. La
  // reformulation des commentaires en termes non matchables ("directive
  // historique de seuil d'auto-confiance", "ancienne logique de scoring
  // de confiance") permet au guard cross-agent A10 de scanner le fichier
  // sans exception.

  it("source brut : ne contient plus `>90% confident`", () => {
    expect(SOURCE).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("source brut : ne contient plus `you are 90% confident`", () => {
    expect(SOURCE).not.toMatch(/you\s+are\s+90\s*%\s*confident/i);
  });

  it("source brut : ne contient plus `penalised 9 points`", () => {
    expect(SOURCE).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("source brut : ne contient plus de seuil numérique d'auto-confiance", () => {
    expect(SOURCE).not.toMatch(/>\s*\d{1,3}\s*%\s*confident/i);
    expect(SOURCE).not.toMatch(/confident\s+\d{1,3}\s*%/i);
  });

  it("source brut : ne contient plus les seuils historiques `50-90%` ni `<50%`", () => {
    expect(SOURCE).not.toMatch(/50\s*[-–]\s*90\s*%/);
    expect(SOURCE).not.toMatch(/<\s*50\s*%/);
  });

  it("source brut : ne contient plus `Answer only if you are`", () => {
    expect(SOURCE).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("source brut : ne contient plus l'ancien titre `Confidence Threshold` (autre que dans commentaires neutres)", () => {
    expect(SOURCE).not.toMatch(/Confidence\s+Threshold/i);
  });

  it("source brut : ne contient plus `HIGH / MEDIUM / LOW`", () => {
    expect(SOURCE).not.toMatch(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/);
  });
});

describe("THESIS_ANTI_HALLUCINATION_DIRECTIVES — corps de la constante (Phase A v12)", () => {
  const body = extractDirectivesConstantBody(SOURCE);

  it("ne contient plus la directive `>90% confident`", () => {
    expect(body).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("ne contient plus la formule `penalised 9 points`", () => {
    expect(body).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("ne contient plus de seuil numérique d'auto-confiance (>X% confident)", () => {
    expect(body).not.toMatch(/>\s*\d{1,3}\s*%\s*confident/i);
    expect(body).not.toMatch(/confident\s+\d{1,3}\s*%/i);
  });

  it("ne contient plus la phrase `Answer only if you are`", () => {
    expect(body).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("ne contient plus la consigne `Rate overall confidence HIGH / MEDIUM / LOW`", () => {
    expect(body).not.toMatch(/Rate\s+overall\s+confidence\s+HIGH/i);
    expect(body).not.toMatch(/rate\s+overall\s+confidence/i);
  });

  it("ne contient plus l'ancien titre `Confidence Threshold`", () => {
    expect(body).not.toMatch(/Confidence\s+Threshold/i);
  });

  it("ne contient plus les buckets CONFIDENT/PROBABLE/SPECULATIVE basés sur pourcentages numériques", () => {
    expect(body).not.toMatch(/CONFIDENT\s*\(\s*>?\s*\d{1,3}\s*%/i);
    expect(body).not.toMatch(/PROBABLE\s*\(\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*%/i);
    expect(body).not.toMatch(/SPECULATIVE\s*\(\s*<\s*\d{1,3}\s*%/i);
  });

  it("contient le titre cible `Evidence Gate`", () => {
    expect(body).toMatch(/Evidence\s+Gate/i);
  });

  it("contient la directive cible — Evidence-Based Assertion", () => {
    expect(body).toMatch(/Evidence-Based\s+Assertion/i);
  });

  it("contient la directive cible — Missing Evidence Handling avec marqueurs typés", () => {
    expect(body).toMatch(/Missing\s+Evidence\s+Handling/i);
    expect(body).toMatch(/unknown|missing_evidence|open_question|insufficient_data/);
  });

  it("contient la directive cible — Inference Marking", () => {
    expect(body).toMatch(/Inference\s+Marking/i);
    expect(body).toMatch(/\[INFERRED\]/);
  });

  it("contient la directive cible — Contradiction Surfacing", () => {
    expect(body).toMatch(/Contradiction\s+Surfacing/i);
  });

  it("contient la directive cible — Evidence Self-Audit (et pas auto-confiance HIGH/MEDIUM/LOW)", () => {
    expect(body).toMatch(/Evidence\s+Self-Audit/i);
  });

  it("interdit explicitement l'auto-confiance comme métrique", () => {
    expect(body).toMatch(/Auto-confidence|not the metric|not auto-confidence/i);
  });
});

describe("THESIS_ANTI_HALLUCINATION_DIRECTIVES — runtime export", () => {
  it("est exportée comme string non vide", () => {
    expect(typeof THESIS_ANTI_HALLUCINATION_DIRECTIVES).toBe("string");
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES.length).toBeGreaterThan(100);
  });

  it("ne contient pas la directive bannie `>90% confident`", () => {
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("ne contient pas `penalised 9 points`", () => {
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("contient les 5 nouvelles directives gate de preuve", () => {
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).toMatch(/Evidence-Based\s+Assertion/i);
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).toMatch(/Missing\s+Evidence\s+Handling/i);
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).toMatch(/Inference\s+Marking/i);
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).toMatch(/Contradiction\s+Surfacing/i);
    expect(THESIS_ANTI_HALLUCINATION_DIRECTIVES).toMatch(/Evidence\s+Self-Audit/i);
  });
});
