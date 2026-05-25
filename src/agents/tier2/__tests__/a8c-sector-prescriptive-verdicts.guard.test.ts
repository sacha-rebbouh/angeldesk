/**
 * Phase A slice A8c — Source guard sectoriel + mapping tests.
 *
 * Vérifie le renommage des valeurs LLM-facing prescriptives pour les deux
 * experts sectoriels concernés (décision Codex A8 audit point 2) :
 *   - `cybersecurity-expert` : `AVOID` → `CRITICAL_SECURITY_CONCERNS`
 *   - `ai-expert` : `NOT_REAL_AI` → `AI_NATIVE_UNCONFIRMED`
 *
 * Le mapping runtime canonique vers `NOT_RECOMMENDED` reste inchangé
 * (cf. doctrine A8c : "ces valeurs restent LLM-facing/locales et
 * continuent de mapper vers NOT_RECOMMENDED côté canonique runtime").
 *
 * Tests couverts :
 *   1. **Guard source** : les valeurs prescriptives bannies (`AVOID`,
 *      `NOT_REAL_AI`) n'apparaissent plus dans le code production des
 *      deux experts en dehors de commentaires/doc explicatifs (ex.
 *      mentions "ex AVOID" dans la justification du rename). Le guard
 *      bannit les usages comme valeur d'enum ou comme énumération
 *      prompt.
 *   2. **Guard positif** : les nouvelles valeurs (`CRITICAL_SECURITY_CONCERNS`,
 *      `AI_NATIVE_UNCONFIRMED`) sont bien présentes dans schema + prompt
 *      + mapping local.
 *   3. **Mapping runtime canonique** : la dérivation
 *      `verdict.recommendation` (canonique `STRONG_FIT | GOOD_FIT |
 *      MODERATE_FIT | POOR_FIT | NOT_RECOMMENDED`) est inchangée — toute
 *      valeur sectorielle hors `STRONG_*_PLAY` / `SOLID_*_PLAY` /
 *      `*_CONCERNS` tombe dans le fallback `NOT_RECOMMENDED`.
 *
 * Les tests de mapping sont écrits comme assertions structurelles
 * (lecture du fichier source + assertions sur les branches du ternaire).
 * Pas de runtime instancié — les experts ne sont pas extends BaseAgent
 * pour la majorité et leur `transform` est privé, donc l'audit reste
 * source-level (suffisant pour A8c qui est un rename strict, sans
 * changement de logique).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const CYBER_PATH = "src/agents/tier2/cybersecurity-expert.ts";
const AI_PATH = "src/agents/tier2/ai-expert.ts";

describe("Phase A A8c — Cybersecurity expert (AVOID → CRITICAL_SECURITY_CONCERNS)", () => {
  const source = loadFile(CYBER_PATH);

  describe("1. Guard source — valeur LLM-facing prescriptive bannie", () => {
    it("ne contient AUCUN `\"AVOID\"` (valeur d'enum Zod prompt)", () => {
      // Bannit toute occurrence quoted `"AVOID"` (enum, énumération,
      // mapping, fixture). Les commentaires en prose ne sont pas couverts
      // car le pattern requiert les guillemets.
      expect(/"AVOID"/.test(source)).toBe(false);
    });

    it("ne contient AUCUN énum prompt `... / AVOID` (énumération prose dans bullet)", () => {
      // Pattern d'énumération en prose : `... / AVOID` après un slash.
      expect(/\/\s*AVOID\b/.test(source)).toBe(false);
    });
  });

  describe("2. Guard positif — nouvelles valeurs présentes", () => {
    it("contient le nouveau wording `CRITICAL_SECURITY_CONCERNS` dans le schéma Zod", () => {
      expect(/"CRITICAL_SECURITY_CONCERNS"/.test(source)).toBe(true);
    });

    it("contient `CRITICAL_SECURITY_CONCERNS` dans l'énumération prompt", () => {
      expect(/\/\s*CRITICAL_SECURITY_CONCERNS\b/.test(source)).toBe(true);
    });
  });

  describe("3. Mapping runtime canonique inchangé", () => {
    it("le ternaire de mapping conserve les 3 branches `STRONG_FIT` / `GOOD_FIT` / `MODERATE_FIT`", () => {
      expect(/"STRONG_SECURITY_PLAY"\s*\?\s*"STRONG_FIT"/.test(source)).toBe(true);
      expect(/"SOLID_SECURITY_PLAY"\s*\?\s*"GOOD_FIT"/.test(source)).toBe(true);
      expect(/"SECURITY_CONCERNS"\s*\?\s*"MODERATE_FIT"/.test(source)).toBe(true);
    });

    it("`CRITICAL_SECURITY_CONCERNS` n'a PAS de branche explicite et tombe dans le fallback `NOT_RECOMMENDED`", () => {
      // Le mapping ne doit pas avoir de branche `"CRITICAL_SECURITY_CONCERNS" ? ...`
      // (sinon ce serait une mauvaise extension du contrat canonique).
      expect(/"CRITICAL_SECURITY_CONCERNS"\s*\?/.test(source)).toBe(false);
      // Le fallback `NOT_RECOMMENDED` reste en place.
      expect(/"NOT_RECOMMENDED"/.test(source)).toBe(true);
    });
  });
});

describe("Phase A A8c — AI expert (NOT_REAL_AI → AI_NATIVE_UNCONFIRMED)", () => {
  const source = loadFile(AI_PATH);

  describe("1. Guard source — valeur LLM-facing prescriptive bannie", () => {
    it("ne contient AUCUN `\"NOT_REAL_AI\"` (valeur d'enum Zod prompt)", () => {
      expect(/"NOT_REAL_AI"/.test(source)).toBe(false);
    });

    it("ne contient AUCUN énum prompt `... / NOT_REAL_AI` (énumération prose dans bullet)", () => {
      expect(/\/\s*NOT_REAL_AI\b/.test(source)).toBe(false);
    });
  });

  describe("2. Guard positif — nouvelles valeurs présentes", () => {
    it("contient le nouveau wording `AI_NATIVE_UNCONFIRMED` dans le schéma Zod", () => {
      expect(/"AI_NATIVE_UNCONFIRMED"/.test(source)).toBe(true);
    });

    it("contient `AI_NATIVE_UNCONFIRMED` dans l'énumération prompt", () => {
      expect(/\/\s*AI_NATIVE_UNCONFIRMED\b/.test(source)).toBe(true);
    });
  });

  describe("3. Mapping runtime canonique inchangé", () => {
    it("le ternaire de mapping conserve les 3 branches `STRONG_FIT` / `GOOD_FIT` / `MODERATE_FIT`", () => {
      expect(/"STRONG_AI_PLAY"\s*\?\s*"STRONG_FIT"/.test(source)).toBe(true);
      expect(/"SOLID_AI_PLAY"\s*\?\s*"GOOD_FIT"/.test(source)).toBe(true);
      expect(/"AI_CONCERNS"\s*\?\s*"MODERATE_FIT"/.test(source)).toBe(true);
    });

    it("`AI_NATIVE_UNCONFIRMED` n'a PAS de branche explicite et tombe dans le fallback `NOT_RECOMMENDED`", () => {
      expect(/"AI_NATIVE_UNCONFIRMED"\s*\?/.test(source)).toBe(false);
      expect(/"NOT_RECOMMENDED"/.test(source)).toBe(true);
    });
  });
});

describe("Phase A A8c — Types globaux (ExtendedSectorData.aiVerdict)", () => {
  const source = loadFile("src/agents/tier2/types.ts");

  it("`aiVerdict.recommendation` enum reflète le nouveau wording", () => {
    expect(/"AI_NATIVE_UNCONFIRMED"/.test(source)).toBe(true);
  });

  it("le wording legacy `NOT_REAL_AI` n'est plus dans l'enum runtime", () => {
    // Bannit toute occurrence quoted `"NOT_REAL_AI"` dans types.ts.
    expect(/"NOT_REAL_AI"/.test(source)).toBe(false);
  });

  it("le canonique `NOT_RECOMMENDED` reste défini sur `verdict.recommendation`", () => {
    // Garde-fou : A8c NE renomme PAS le canonique `NOT_RECOMMENDED`
    // (reporté post-Phase A, cf. décision Codex A8 audit point 1).
    expect(/"NOT_RECOMMENDED"/.test(source)).toBe(true);
  });
});

describe("Phase A A8c — Simulation mapping fonctionnel (assertions logiques)", () => {
  /**
   * Mimique le ternaire de mapping runtime pour vérifier la dérivation
   * canonique cible. Ces helpers sont une copie locale des ternaires
   * `transform()` des 2 experts — toute divergence runtime / test sera
   * détectée par les assertions structurelles du describe précédent.
   */
  function mapCyberRecommendation(raw: string): string {
    return raw === "STRONG_SECURITY_PLAY"
      ? "STRONG_FIT"
      : raw === "SOLID_SECURITY_PLAY"
        ? "GOOD_FIT"
        : raw === "SECURITY_CONCERNS"
          ? "MODERATE_FIT"
          : "NOT_RECOMMENDED";
  }

  function mapAiRecommendation(raw: string): string {
    return raw === "STRONG_AI_PLAY"
      ? "STRONG_FIT"
      : raw === "SOLID_AI_PLAY"
        ? "GOOD_FIT"
        : raw === "AI_CONCERNS"
          ? "MODERATE_FIT"
          : "NOT_RECOMMENDED";
  }

  it("cybersecurity `CRITICAL_SECURITY_CONCERNS` → `NOT_RECOMMENDED` (canonique)", () => {
    expect(mapCyberRecommendation("CRITICAL_SECURITY_CONCERNS")).toBe("NOT_RECOMMENDED");
  });

  it("cybersecurity legacy `AVOID` (si LLM dégradé) → `NOT_RECOMMENDED` (fallback)", () => {
    // Sécurité : même si le LLM dégradé renvoie encore l'ancienne valeur,
    // le fallback canonique reste `NOT_RECOMMENDED` — pas de break runtime.
    expect(mapCyberRecommendation("AVOID")).toBe("NOT_RECOMMENDED");
  });

  it("ai `AI_NATIVE_UNCONFIRMED` → `NOT_RECOMMENDED` (canonique)", () => {
    expect(mapAiRecommendation("AI_NATIVE_UNCONFIRMED")).toBe("NOT_RECOMMENDED");
  });

  it("ai legacy `NOT_REAL_AI` (si LLM dégradé) → `NOT_RECOMMENDED` (fallback)", () => {
    expect(mapAiRecommendation("NOT_REAL_AI")).toBe("NOT_RECOMMENDED");
  });

  it("les 3 branches positives cybersecurity restent inchangées", () => {
    expect(mapCyberRecommendation("STRONG_SECURITY_PLAY")).toBe("STRONG_FIT");
    expect(mapCyberRecommendation("SOLID_SECURITY_PLAY")).toBe("GOOD_FIT");
    expect(mapCyberRecommendation("SECURITY_CONCERNS")).toBe("MODERATE_FIT");
  });

  it("les 3 branches positives ai restent inchangées", () => {
    expect(mapAiRecommendation("STRONG_AI_PLAY")).toBe("STRONG_FIT");
    expect(mapAiRecommendation("SOLID_AI_PLAY")).toBe("GOOD_FIT");
    expect(mapAiRecommendation("AI_CONCERNS")).toBe("MODERATE_FIT");
  });
});
