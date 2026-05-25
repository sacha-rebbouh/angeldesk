/**
 * Source guard — anti-hallucination.ts (Phase A slice A9-helpers, D4 verrouillé)
 *
 * Garantit que les directives **émises au runtime** par
 * `getFiveAntiHallucinationDirectives()` et `buildFallbackSystemPrompt()`
 * ne contiennent plus la directive bannie "Answer only if you are >90%
 * confident" ni ses variantes (penalised 9 points, seuils numériques
 * d'auto-confiance, "Rate overall confidence HIGH/MEDIUM/LOW"), et qu'elles
 * exposent bien le gate de preuve structuré §6-bis du plan Phase A.
 *
 * **Pourquoi tester le runtime et pas le source brut** : le fichier source
 * `anti-hallucination.ts` contient légitimement des commentaires d'en-tête
 * qui mentionnent les motifs bannis pour expliquer ce qui a été supprimé
 * (traçabilité doctrinale). C'est doctrinalement valide. Ce qui ne doit
 * jamais réintroduire les motifs bannis, c'est ce que le helper **émet**
 * vers les LLM en runtime.
 *
 * Ce guard est invariant Phase A. Sa rupture est un signal que la directive
 * bannie a été ré-introduite via ce helper, ce qui contredirait
 * mécaniquement le travail d'éradication des autres slices.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getFiveAntiHallucinationDirectives,
  buildFallbackSystemPrompt,
} from "../anti-hallucination";

const SOURCE_PATH = resolve(__dirname, "../anti-hallucination.ts");
const SOURCE = readFileSync(SOURCE_PATH, "utf-8");

describe("getFiveAntiHallucinationDirectives() — runtime invariant Phase A v12", () => {
  const directives = getFiveAntiHallucinationDirectives();

  it("ne contient plus la directive `>90% confident`", () => {
    expect(directives).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("ne contient plus la formule `penalised 9 points`", () => {
    expect(directives).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("ne contient plus de seuil numérique d'auto-confiance (>X% confident)", () => {
    expect(directives).not.toMatch(/>\s*\d{1,3}\s*%\s*confident/i);
    expect(directives).not.toMatch(/confident\s+\d{1,3}\s*%/i);
  });

  it("ne contient plus la phrase `Answer only if you are`", () => {
    expect(directives).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("ne contient plus la consigne `Rate your overall response confidence: HIGH / MEDIUM / LOW`", () => {
    expect(directives).not.toMatch(/Rate\s+your\s+overall\s+(response\s+)?confidence/i);
    expect(directives).not.toMatch(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/);
  });

  it("ne contient plus l'ancien titre `Confidence Threshold`", () => {
    expect(directives).not.toMatch(/Confidence\s+Threshold/i);
  });

  it("ne contient plus les buckets CONFIDENT/PROBABLE/SPECULATIVE basés sur pourcentages numériques", () => {
    expect(directives).not.toMatch(/CONFIDENT\s*\(\s*>?\s*\d{1,3}\s*%/i);
    expect(directives).not.toMatch(/PROBABLE\s*\(\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*%/i);
    expect(directives).not.toMatch(/SPECULATIVE\s*\(\s*<\s*\d{1,3}\s*%/i);
  });

  it("contient les 5 nouvelles directives gate de preuve", () => {
    expect(directives).toMatch(/Evidence-Based\s+Assertion/i);
    expect(directives).toMatch(/Missing\s+Evidence\s+Handling/i);
    expect(directives).toMatch(/Inference\s+Marking/i);
    expect(directives).toMatch(/Contradiction\s+Surfacing/i);
    expect(directives).toMatch(/Evidence\s+Self-Audit/i);
  });

  it("contient les marqueurs typés d'unknown (unknown / missing_evidence / open_question / insufficient_data)", () => {
    expect(directives).toMatch(/unknown|missing_evidence|open_question|insufficient_data/);
  });

  it("contient le marqueur [INFERRED] pour les inférences", () => {
    expect(directives).toMatch(/\[INFERRED\]/);
  });

  it("contient le marqueur [UNCERTAIN] pour les claims incertains", () => {
    expect(directives).toMatch(/\[UNCERTAIN\]/);
  });

  it("interdit explicitement l'auto-confiance comme métrique (mention `auto-confidence` ou équivalent)", () => {
    expect(directives).toMatch(/Auto-confidence|auto-confidence|not the metric|not\s+evidence/i);
  });

  it("joint les directives avec double saut de ligne (format historique préservé)", () => {
    // 5 directives → au moins 4 séparateurs "\n\n"
    const separators = directives.split("\n\n").length - 1;
    expect(separators).toBeGreaterThanOrEqual(4);
  });
});

describe("buildFallbackSystemPrompt() — runtime invariant", () => {
  it("inclut role + langue + 5 directives gate de preuve", () => {
    const prompt = buildFallbackSystemPrompt("Tu es un analyste de test.");
    expect(prompt).toMatch(/Tu es un analyste de test\./);
    expect(prompt).toMatch(/LANGUE: Francais\./);
    expect(prompt).toMatch(/Evidence-Based\s+Assertion/i);
  });

  it("ne réinjecte jamais la directive bannie en sortie runtime", () => {
    const prompt = buildFallbackSystemPrompt("Test role.");
    expect(prompt).not.toMatch(/>\s*90\s*%\s*confident/i);
    expect(prompt).not.toMatch(/penalised\s+9\s+points/i);
    expect(prompt).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
    expect(prompt).not.toMatch(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/);
  });

  it("supporte option language='en'", () => {
    const prompt = buildFallbackSystemPrompt("Test role.", { language: "en" });
    expect(prompt).toMatch(/LANGUAGE: English\./);
  });

  it("supporte option language='fr' explicite (équivalent au défaut)", () => {
    const prompt = buildFallbackSystemPrompt("Test role.", { language: "fr" });
    expect(prompt).toMatch(/LANGUE: Francais\./);
  });
});

describe("anti-hallucination.ts — source brut (Phase A v12, scope guard A10)", () => {
  // Le source brut entier du fichier helper doit être propre des motifs
  // bannis, y compris dans les commentaires. La reformulation des
  // commentaires en termes non matchables ("directive historique de seuil
  // d'auto-confiance", "ancienne logique de scoring de confiance") permet
  // au guard cross-agent A10 de scanner les helpers sans exception.

  it("source brut : ne contient plus `>90% confident`", () => {
    expect(SOURCE).not.toMatch(/>\s*90\s*%\s*confident/i);
  });

  it("source brut : ne contient plus `you are 90% confident`", () => {
    expect(SOURCE).not.toMatch(/you\s+are\s+90\s*%\s*confident/i);
  });

  it("source brut : ne contient plus `penalised 9 points`", () => {
    expect(SOURCE).not.toMatch(/penalised\s+9\s+points/i);
  });

  it("source brut : ne contient plus de seuil numérique d'auto-confiance dans aucun commentaire ni constante", () => {
    expect(SOURCE).not.toMatch(/>\s*\d{1,3}\s*%\s*confident/i);
    expect(SOURCE).not.toMatch(/confident\s+\d{1,3}\s*%/i);
  });

  it("source brut : ne contient plus les seuils historiques `50-90%` ni `<50%`", () => {
    expect(SOURCE).not.toMatch(/50\s*[-–]\s*90\s*%/);
    expect(SOURCE).not.toMatch(/<\s*50\s*%/);
  });

  it("source brut : ne contient plus la phrase `Answer only if you are`", () => {
    expect(SOURCE).not.toMatch(/Answer\s+only\s+if\s+you\s+are/i);
  });

  it("source brut : ne contient plus l'ancien titre `Confidence Threshold`", () => {
    expect(SOURCE).not.toMatch(/Confidence\s+Threshold/i);
  });

  it("source brut : ne contient plus la consigne `HIGH / MEDIUM / LOW`", () => {
    expect(SOURCE).not.toMatch(/HIGH\s*\/\s*MEDIUM\s*\/\s*LOW/);
  });

  it("déclare la constante EVIDENCE_BASED_ASSERTION", () => {
    expect(SOURCE).toMatch(/EVIDENCE_BASED_ASSERTION/);
    expect(SOURCE).toMatch(/Evidence-Based\s+Assertion/);
  });

  it("déclare la constante MISSING_EVIDENCE_HANDLING", () => {
    expect(SOURCE).toMatch(/MISSING_EVIDENCE_HANDLING/);
    expect(SOURCE).toMatch(/Missing\s+Evidence\s+Handling/);
  });

  it("déclare la constante INFERENCE_MARKING", () => {
    expect(SOURCE).toMatch(/INFERENCE_MARKING/);
    expect(SOURCE).toMatch(/Inference\s+Marking/);
  });

  it("déclare la constante CONTRADICTION_SURFACING", () => {
    expect(SOURCE).toMatch(/CONTRADICTION_SURFACING/);
    expect(SOURCE).toMatch(/Contradiction\s+Surfacing/);
  });

  it("déclare la constante SELF_AUDIT_EVIDENCE", () => {
    expect(SOURCE).toMatch(/SELF_AUDIT_EVIDENCE/);
    expect(SOURCE).toMatch(/Evidence\s+Self-Audit/);
  });

  it("ne déclare plus la constante historique CONFIDENCE_THRESHOLD", () => {
    expect(SOURCE).not.toMatch(/const\s+CONFIDENCE_THRESHOLD\s*=/);
  });

  it("expose la signature `getFiveAntiHallucinationDirectives` (compat consumers)", () => {
    expect(SOURCE).toMatch(/export\s+function\s+getFiveAntiHallucinationDirectives\s*\(\s*\)\s*:\s*string/);
  });

  it("expose la signature `buildFallbackSystemPrompt` (compat consumers)", () => {
    expect(SOURCE).toMatch(/export\s+function\s+buildFallbackSystemPrompt/);
  });
});
