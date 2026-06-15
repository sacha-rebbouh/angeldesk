/**
 * Chantier dé-scorisation P6 — Source guard STRUCTUREL (schema + types agents).
 *
 * Verrouille les acquis structurels de P5 contre toute régression :
 *
 * 1. P5-c — `prisma/schema.prisma` ne re-déclare AUCUNE des 13 colonnes de note
 *    droppées (Deal.{global,fundamentals,conditions,team,market,product,financials}Score,
 *    AnalysisSignalSummary.{global,team,market,product,financials}Score,
 *    DealTermsVersion.conditionsScore).
 * 2. P5-b — les types agents (`types.ts`, `type-modules/tier3.ts`,
 *    `tier3/synthesis-deal-scorer.ts`) ne re-portent PAS les champs de note de
 *    deal purgés : SynthesisDealScorerData.{overallScore, dimensionScores,
 *    scoreBreakdown, comparativeRanking, confidence} + ConditionsAnalystData.score.
 *
 * Ne bannit QUE les PATTERNS de note de deal — PAS tous les nombres. Les colonnes
 * observables / de qualité d'extraction (qualityScore, confidenceScore par-item,
 * similarityScore) restent autorisées, comme les commentaires documentaires qui
 * CITENT les noms droppés (ils ne matchent pas un pattern de déclaration).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../..");
const load = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), "utf-8");

/** Extrait le corps `{ ... }` d'une interface par comptage de braces (robuste aux braces imbriquées). */
function extractInterfaceBody(src: string, marker: string): string | null {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  const open = src.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

/**
 * Retire les commentaires (ligne + bloc) — les commentaires P5-b/P5-c CITENT les
 * noms/déclarations purgés pour les documenter ; seules les VRAIES déclarations de
 * champ doivent déclencher le guard.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// Noms de colonnes de note droppées en P5-c (spécifiques à la note, jamais réutilisés ailleurs).
const DROPPED_NOTE_COLUMNS = [
  "globalScore",
  "fundamentalsScore",
  "conditionsScore",
  "teamScore",
  "marketScore",
  "productScore",
  "financialsScore",
];

describe("P6 guard structurel — schema.prisma (colonnes de note droppées en P5-c)", () => {
  const schema = load("prisma/schema.prisma");

  for (const col of DROPPED_NOTE_COLUMNS) {
    it(`ne re-déclare PAS la colonne de note '${col}' (déclaration Int/Float)`, () => {
      // Une déclaration Prisma = nom + type scalaire en début de ligne. Les
      // commentaires P5-c qui CITENT ces noms (prose, « X / Y ») ne matchent pas.
      const declPattern = new RegExp(`^\\s*${col}\\s+(Int|Float)\\b`, "m");
      expect(declPattern.test(schema)).toBe(false);
    });
  }
});

describe("P6 guard structurel — SynthesisDealScorerData scoreless (3 défs, P5-b)", () => {
  const FILES = [
    "src/agents/types.ts",
    "src/agents/type-modules/tier3.ts",
    "src/agents/tier3/synthesis-deal-scorer.ts",
  ];
  const BANNED_FIELDS = [
    "overallScore",
    "dimensionScores",
    "scoreBreakdown",
    "comparativeRanking",
    "confidence", // bannir aussi `confidence:` requis, pas seulement `confidence?:`
  ];

  for (const file of FILES) {
    // Le marqueur avec l'accolade exclut le type compat `SynthesisDealScorerDataV2`.
    const raw = extractInterfaceBody(load(file), "interface SynthesisDealScorerData {");
    const body = raw === null ? null : stripComments(raw);

    it(`${file} : la déf SynthesisDealScorerData existe`, () => {
      expect(raw).not.toBeNull();
    });

    for (const field of BANNED_FIELDS) {
      it(`${file} : SynthesisDealScorerData ne re-déclare PAS le champ '${field}'`, () => {
        // Déclaration de champ = `nom?:` / `nom:` (hors commentaires déjà strippés).
        const fieldDecl = new RegExp(`\\b${field}\\??\\s*:`);
        expect(fieldDecl.test(body ?? "")).toBe(false);
      });
    }
  }
});

describe("P6 guard structurel — ConditionsAnalystData scoreless (2 défs, P5-b)", () => {
  const FILES = ["src/agents/types.ts", "src/agents/type-modules/tier3.ts"];

  for (const file of FILES) {
    const raw = extractInterfaceBody(load(file), "interface ConditionsAnalystData {");
    const body = raw === null ? null : stripComments(raw);

    it(`${file} : la déf ConditionsAnalystData existe`, () => {
      expect(raw).not.toBeNull();
    });

    it(`${file} : ConditionsAnalystData ne re-déclare PAS le champ 'score' (note de deal)`, () => {
      // Bannit le champ `score` quelle que soit son optionalité / sa forme de type
      // (score?: AgentScore, score: AgentScore, score?: AutreFormeDeNote…).
      expect(/\bscore\??\s*:/.test(body ?? "")).toBe(false);
    });
  }
});
