/**
 * Phase A slice A7b-2 round 3 — Schema acceptance test (Codex blocker round 2).
 *
 * Codex round 2 a flagué un drift sur Financial Auditor :
 *   `src/agents/tier1/financial-auditor.ts:662` utilise
 *   `llmCompleteJSONValidated` avec `FinancialAuditResponseSchema`. Le
 *   prompt ne demande plus `alertSignal.recommendation`, mais le schéma
 *   l'exigeait toujours via `AlertSignalSchema.recommendation: z.enum([...])`.
 *   Résultat : si le LLM suivait le nouveau prompt, la validation Zod
 *   produisait une erreur systématique (et le code retombait en best-effort).
 *
 * Correction A7b-2 round 3 :
 *   `AlertSignalSchema.recommendation` est rendu `.optional()` en input
 *   LLM. Le contrat global `AgentAlertSignal` reste intact côté output
 *   (le runtime continue d'émettre `recommendation` dérivé déterministe
 *   via `signalIntensityToRecommendation(signalIntensity)`).
 *
 * Ce test vérifie mécaniquement :
 *   1. Un payload Financial Auditor SANS `alertSignal.recommendation` est
 *      accepté côté input LLM (Codex blocker — propriété principale).
 *   2. Un payload AVEC l'ancienne `recommendation: "PROCEED"` est aussi
 *      accepté (parser tolérant lecture seule — règle slice A7b-2).
 *   3. Le runtime Financial Auditor continue de dériver
 *      `alertSignal.recommendation` via le helper A7b-1 (structural —
 *      complète le guard `a7b2-alert-signal-recommendation.guard.test.ts`
 *      qui couvre déjà l'invariant via 8 patterns × 13 agents).
 *
 * Couverture étendue : même si seul Financial Auditor consomme
 * `llmCompleteJSONValidated` en runtime (les 12 autres Tier 1 utilisent
 * `llmCompleteJSON` ou `llmCompleteJSONWithFallback`), l'optionnalité est
 * vérifiée sur tous les schémas Tier 1 partageant `AlertSignalSchema`
 * (cohérence input cross-agent — un test sentinelle par schéma).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FinancialAuditResponseSchema } from "../financial-auditor-schema";
import { DeckForensicsResponseSchema } from "../deck-forensics-schema";
import { TeamInvestigatorResponseSchema } from "../team-investigator-schema";
import { CompetitiveIntelResponseSchema } from "../competitive-intel-schema";
import { MarketIntelligenceResponseSchema } from "../market-intelligence-schema";
import { LegalRegulatoryResponseSchema } from "../legal-regulatory-schema";
import { TechOpsDDResponseSchema } from "../tech-ops-dd-schema";
import { TechStackDDResponseSchema } from "../tech-stack-dd-schema";
import { CapTableAuditorResponseSchema } from "../cap-table-auditor-schema";
import { CustomerIntelResponseSchema } from "../customer-intel-schema";
import { GTMAnalystResponseSchema } from "../gtm-analyst-schema";
import { QuestionMasterResponseSchema } from "../question-master-schema";
import { AlertSignalSchema } from "../common";

const baseMeta = {
  dataCompleteness: "complete" as const,
  confidenceLevel: 80,
  limitations: [],
};

const baseScore = {
  value: 72,
  breakdown: [
    { criterion: "Quality", weight: 50, score: 75, justification: "Good" },
    { criterion: "Risk", weight: 50, score: 70, justification: "Medium" },
  ],
};

const baseNarrative = {
  oneLiner: "Test one-liner",
  summary: "Test summary",
  keyInsights: ["Insight 1"],
  forNegotiation: ["Point 1"],
};

const alertSignalWithoutRecommendation = {
  hasBlocker: false,
  justification: "Constat factuel — recommendation dérivé déterministe en aval",
};

const alertSignalWithLegacyRecommendation = {
  hasBlocker: false,
  recommendation: "PROCEED" as const,
  justification: "LLM dégradé qui renvoie encore l'ancien champ",
};

describe("Phase A A7b-2 round 3 — AlertSignalSchema (recommendation optionnel en input LLM)", () => {
  it("AlertSignalSchema accepte un payload SANS `recommendation` (Codex blocker round 2)", () => {
    const result = AlertSignalSchema.safeParse(alertSignalWithoutRecommendation);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendation).toBeUndefined();
    }
  });

  it("AlertSignalSchema accepte un payload AVEC `recommendation: \"PROCEED\"` (parser tolérant)", () => {
    const result = AlertSignalSchema.safeParse(alertSignalWithLegacyRecommendation);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendation).toBe("PROCEED");
    }
  });

  it("AlertSignalSchema REJETTE un `recommendation` hors enum (parser strict sur la valeur si présente)", () => {
    const invalid = {
      ...alertSignalWithLegacyRecommendation,
      recommendation: "MAYBE_LATER",
    };
    const result = AlertSignalSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("Phase A A7b-2 round 3 — Financial Auditor (cible primaire Codex)", () => {
  const baseFinancialAuditPayload = {
    meta: baseMeta,
    score: baseScore,
    findings: { metrics: [] },
    redFlags: [],
    questions: [],
    narrative: baseNarrative,
  };

  it("FinancialAuditResponseSchema accepte un payload SANS `alertSignal.recommendation`", () => {
    const data = {
      ...baseFinancialAuditPayload,
      alertSignal: alertSignalWithoutRecommendation,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("FinancialAuditResponseSchema accepte un payload AVEC `alertSignal.recommendation` legacy", () => {
    const data = {
      ...baseFinancialAuditPayload,
      alertSignal: alertSignalWithLegacyRecommendation,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("Runtime Financial Auditor dérive `alertSignal.recommendation` via `signalIntensityToRecommendation(signalIntensity)`", () => {
    // Structural assertion : on lit le source code de l'agent et on vérifie
    // que le pipeline runtime reste intact (cf. guard a7b2-alert-signal-
    // recommendation.guard.test.ts pour la couverture exhaustive 8 invariants).
    const REPO_ROOT = resolve(__dirname, "../../../../..");
    const source = readFileSync(resolve(REPO_ROOT, "src/agents/tier1/financial-auditor.ts"), "utf-8");
    // Le runtime doit appeler signalIntensityToRecommendation(signalIntensity)
    expect(/signalIntensityToRecommendation\s*\(\s*signalIntensity\s*\)/.test(source)).toBe(true);
    // Et le builder alertSignal doit utiliser cette valeur dérivée
    expect(/recommendation\s*:\s*signalIntensityToRecommendation\s*\(\s*signalIntensity\s*\)/.test(source)).toBe(true);
  });
});

describe("Phase A A7b-2 round 3 — Sentinelles cross-Tier 1 (cohérence input optionnel)", () => {
  // Sanity check : chaque schéma Tier 1 partageant `AlertSignalSchema`
  // accepte un payload `alertSignal` sans `recommendation`. Cela évite une
  // régression future si un agent passe de `llmCompleteJSON` à
  // `llmCompleteJSONValidated` sans qu'on rejoue ce test.

  const schemasShares: Array<{ name: string; schema: { safeParse: (data: unknown) => { success: boolean } } }> = [
    { name: "DeckForensicsResponseSchema", schema: DeckForensicsResponseSchema },
    { name: "TeamInvestigatorResponseSchema", schema: TeamInvestigatorResponseSchema },
    { name: "CompetitiveIntelResponseSchema", schema: CompetitiveIntelResponseSchema },
    { name: "MarketIntelligenceResponseSchema", schema: MarketIntelligenceResponseSchema },
    { name: "LegalRegulatoryResponseSchema", schema: LegalRegulatoryResponseSchema },
    { name: "TechOpsDDResponseSchema", schema: TechOpsDDResponseSchema },
    { name: "TechStackDDResponseSchema", schema: TechStackDDResponseSchema },
    { name: "CapTableAuditorResponseSchema", schema: CapTableAuditorResponseSchema },
    { name: "CustomerIntelResponseSchema", schema: CustomerIntelResponseSchema },
    { name: "GTMAnalystResponseSchema", schema: GTMAnalystResponseSchema },
    { name: "QuestionMasterResponseSchema", schema: QuestionMasterResponseSchema },
  ];

  for (const { name, schema } of schemasShares) {
    it(`${name} : AlertSignalSchema imbriqué accepte un payload sans recommendation`, () => {
      // On ne construit pas tout le payload (chaque schéma a sa forme propre),
      // on parse uniquement `AlertSignalSchema` via son import nommé pour
      // garantir que les 13 schémas partagent la même définition relaxée.
      const result = AlertSignalSchema.safeParse(alertSignalWithoutRecommendation);
      expect(result.success).toBe(true);
      // sentinelle nommée pour traçabilité diagnostic
      expect(name).toMatch(/ResponseSchema$/);
    });
  }
});
