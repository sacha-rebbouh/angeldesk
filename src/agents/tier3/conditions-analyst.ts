/**
 * CONDITIONS ANALYST AGENT - Tier 3
 *
 * Mission: Analyser les conditions d'investissement du deal en cross-referencant
 * avec TOUS les outputs Tier 1/2 + Funding DB + documents.
 *
 * Remplace le scorer deterministe (src/services/conditions-scorer/).
 * Score 0-100 sur 4 categories: Valorisation, Instrument, Protections, Gouvernance.
 *
 * Deux modes d'execution:
 * - Pipeline: pendant l'analyse complete (contexte riche)
 * - Standalone: quand le BA sauvegarde le formulaire conditions
 *
 * REGLES ABSOLUES:
 * - JAMAIS inventer de conditions non presentes dans les sources
 * - TOUJOURS citer la source (form, term sheet, deck)
 * - TOUJOURS cross-referencer avec les findings des agents
 * - Produire des conseils de negociation ACTIONNABLES et chiffres
 */

import { BaseAgent } from "../base-agent";
import { severityRank } from "@/services/red-flag-dedup";
import { CONDITIONS_ANALYST_SYSTEM_PROMPT } from "./prompts/conditions-analyst-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";
import { orientationFromAgentIntensity } from "@/services/signal-profile";
import type {
  EnrichedAgentContext,
  ConditionsAnalystData,
  ConditionsAnalystResult,
  ConditionsAnalystFindings,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  Tier3SignalIntensity,
  Tier3SignalContribution,
} from "../types";

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMConditionsResponse {
  score: {
    value: number;
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  findings: {
    termsSource: string;
    valuation: {
      assessedValue: number | null;
      percentileVsDB: number | null;
      verdict: string;
      rationale: string;
      benchmarkUsed: string;
    };
    instrument: {
      type: string | null;
      assessment: string;
      rationale: string;
      stageAppropriate: boolean;
    };
    protections: {
      overallAssessment: string;
      keyProtections: { item: string; present: boolean; assessment: string }[];
      missingCritical: string[];
    };
    governance: {
      vestingAssessment: string;
      esopAssessment: string;
      overallAssessment: string;
    };
    crossReferenceInsights: {
      insight: string;
      sourceAgent: string;
      impact: string;
    }[];
    negotiationAdvice: {
      point: string;
      priority: string;
      suggestedArgument: string;
      leverageSource: string;
    }[];
    structuredAssessment?: {
      overallStructureVerdict: string;
      trancheAssessments: {
        trancheLabel: string;
        assessment: string;
        risks: string[];
        score: number;
      }[];
      blendedEffectiveValuation: number | null;
      triggerRiskLevel: string;
    };
  };
  redFlags: {
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    evidence: string;
    impact: string;
    question: string;
  }[];
  questions: {
    id: string;
    question: string;
    priority: string;
    context: string;
    whatToLookFor: string;
  }[];
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
}

// ============================================================================
// STATIC BENCHMARKS (fallback when Funding DB insufficient)
// Source: Carta 2024, Eldorado.co, France Angels, OpenVC 2024
// ============================================================================

type DealStageKey = "PRE_SEED" | "SEED" | "SERIES_A" | "SERIES_B" | "LATER";

const STATIC_STAGE_BENCHMARKS: Record<DealStageKey, {
  valuationPreMoney: { p25: number; p50: number; p75: number; p90: number };
  dilutionPctMedian: number;
  standardInstrument: string;
}> = {
  PRE_SEED: {
    valuationPreMoney: { p25: 1_000_000, p50: 1_500_000, p75: 2_500_000, p90: 4_000_000 },
    dilutionPctMedian: 22,
    standardInstrument: "BSA-AIR",
  },
  SEED: {
    valuationPreMoney: { p25: 2_500_000, p50: 4_000_000, p75: 6_000_000, p90: 10_000_000 },
    dilutionPctMedian: 20,
    standardInstrument: "BSA-AIR",
  },
  SERIES_A: {
    valuationPreMoney: { p25: 10_000_000, p50: 15_000_000, p75: 25_000_000, p90: 40_000_000 },
    dilutionPctMedian: 20,
    standardInstrument: "Actions de preference",
  },
  SERIES_B: {
    valuationPreMoney: { p25: 30_000_000, p50: 50_000_000, p75: 80_000_000, p90: 120_000_000 },
    dilutionPctMedian: 18,
    standardInstrument: "Actions de preference",
  },
  LATER: {
    valuationPreMoney: { p25: 80_000_000, p50: 150_000_000, p75: 300_000_000, p90: 500_000_000 },
    dilutionPctMedian: 15,
    standardInstrument: "Actions de preference",
  },
};

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class ConditionsAnalystAgent extends BaseAgent<ConditionsAnalystData, ConditionsAnalystResult> {
  constructor(options?: { standaloneTimeoutMs?: number }) {
    super({
      name: "conditions-analyst",
      description: "Analyse IA des conditions d'investissement: valorisation, instrument, protections, gouvernance",
      modelComplexity: "complex",
      maxRetries: 2,
      // Pipeline: 90s (default). Standalone: caller can set a shorter timeout (e.g. 50s for Vercel)
      timeoutMs: options?.standaloneTimeoutMs ?? 90_000,
      dependencies: [],
    });
  }

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  protected buildSystemPrompt(): string {
    // Phase A slice A4-bis — System prompt extrait dans un fichier compagnon
    // (`./prompts/conditions-analyst-prompt.ts`). Les invariants doctrinaux
    // (absence de directive historique de seuil d'auto-confiance, absence
    // de lexique prescriptif legacy, alertSignal.recommendation dérivé
    // déterministe runtime depuis signalIntensity) sont verrouillés par les
    // source-guards de `__tests__/conditions-analyst-prompt.guard.test.ts`.
    return CONDITIONS_ANALYST_SYSTEM_PROMPT;
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  protected async execute(context: EnrichedAgentContext): Promise<ConditionsAnalystData> {
    this._dealStage = context.canonicalDeal.stage;

    // 1. Resoudre les sources de conditions
    const termsSource = this.resolveTermsSource(context);

    // 2. Si aucune condition disponible, retourner un resultat "no data"
    if (termsSource.type === "none") {
      return this.buildNoConditionsResult(context);
    }

    // 3. Preparer les benchmarks
    const benchmarks = this.formatBenchmarks(context);

    // 4. Construire le prompt
    const prompt = this.buildUserPrompt(context, termsSource, benchmarks);

    // 5. Appeler le LLM
    const { data } = await this.llmCompleteJSON<LLMConditionsResponse>(prompt);

    // 6. Normaliser et retourner
    return this.buildOutput(data, termsSource.type, context);
  }

  // ============================================================================
  // TERMS RESOLUTION
  // ============================================================================

  private resolveTermsSource(context: EnrichedAgentContext): {
    type: "form" | "term_sheet" | "deck" | "none";
    formData: string | null;
    termSheetText: string | null;
    deckMentions: string | null;
  } {
    // 0. Check structured deal data (multi-tranche mode)
    const hasStructuredData = context.dealStructure?.mode === "STRUCTURED"
      && context.dealStructure.tranches.length > 0;

    // 1. Check BA form data
    const terms = context.dealTerms;
    const hasFormData = hasStructuredData || (terms && (
      terms.valuationPre != null ||
      terms.amountRaised != null ||
      terms.instrumentType != null ||
      terms.liquidationPref != null ||
      terms.proRataRights != null ||
      terms.founderVesting != null ||
      (terms.customConditions != null && terms.customConditions.trim().length > 0) ||
      (terms.notes != null && terms.notes.trim().length > 0)
    ));

    let formData: string | null = null;
    if (hasFormData) {
      const parts: string[] = [];
      if (terms) parts.push(this.formatFormData(terms));
      if (hasStructuredData) parts.push(this.formatStructuredTerms(context.dealStructure!));
      formData = parts.filter(Boolean).join("\n\n");
    }

    // 2. Check for term sheet document
    let termSheetText: string | null = null;
    if (context.documents) {
      const termSheet = context.documents.find(d =>
        d.type === "TERM_SHEET" ||
        d.name.toLowerCase().includes("term sheet") ||
        d.name.toLowerCase().includes("termsheet") ||
        d.name.toLowerCase().includes("term_sheet") ||
        d.name.toLowerCase().includes("lettre d'intention") ||
        /\bloi\b/.test(d.name.toLowerCase())
      );
      if (termSheet?.extractedText) {
        termSheetText = termSheet.extractedText.substring(0, 10000);
      }
    }

    // 3. Check for conditions in deck (extractedData)
    let deckMentions: string | null = null;
    const ext = context.extractedData;
    if (ext && (ext.valuationPre != null || ext.amountRaising != null)) {
      const lines: string[] = [];
      if (ext.valuationPre != null) lines.push(`Valorisation pre-money: €${Number(ext.valuationPre).toLocaleString()}`);
      if (ext.amountRaising != null) lines.push(`Montant demande: €${Number(ext.amountRaising).toLocaleString()}`);
      if (ext.previousRounds?.length) {
        lines.push(`Rounds precedents: ${ext.previousRounds.map(r => `${r.date}: €${Number(r.amount).toLocaleString()}`).join(", ")}`);
      }
      if (lines.length > 0) {
        deckMentions = lines.join("\n");
      }
    }

    // Determine primary source
    if (formData) return { type: "form", formData, termSheetText, deckMentions };
    if (termSheetText) return { type: "term_sheet", formData, termSheetText, deckMentions };
    if (deckMentions) return { type: "deck", formData, termSheetText, deckMentions };
    return { type: "none", formData: null, termSheetText: null, deckMentions: null };
  }

  private formatFormData(terms: NonNullable<EnrichedAgentContext["dealTerms"]>): string {
    const lines: string[] = ["## CONDITIONS SAISIES PAR LE BA (source: formulaire)"];

    // Valorisation
    if (terms.valuationPre != null) lines.push(`- Valorisation pre-money: €${terms.valuationPre.toLocaleString()}`);
    if (terms.amountRaised != null) lines.push(`- Montant leve: €${terms.amountRaised.toLocaleString()}`);
    if (terms.dilutionPct != null) lines.push(`- Dilution: ${terms.dilutionPct}%`);

    // Instrument
    if (terms.instrumentType) lines.push(`- Instrument: ${terms.instrumentType}`);
    if (terms.instrumentDetails) lines.push(`- Details instrument: ${terms.instrumentDetails}`);

    // Protections
    if (terms.liquidationPref) lines.push(`- Liquidation preference: ${terms.liquidationPref}`);
    if (terms.antiDilution) lines.push(`- Anti-dilution: ${terms.antiDilution}`);
    if (terms.proRataRights != null) lines.push(`- Pro-rata rights: ${terms.proRataRights ? "OUI" : "NON"}`);
    if (terms.informationRights != null) lines.push(`- Information rights: ${terms.informationRights ? "OUI" : "NON"}`);
    if (terms.boardSeat) lines.push(`- Board seat: ${terms.boardSeat}`);

    // Gouvernance
    if (terms.founderVesting != null) lines.push(`- Founder vesting: ${terms.founderVesting ? "OUI" : "NON"}`);
    if (terms.vestingDurationMonths != null) lines.push(`- Vesting duration: ${terms.vestingDurationMonths} mois`);
    if (terms.vestingCliffMonths != null) lines.push(`- Cliff: ${terms.vestingCliffMonths} mois`);
    if (terms.esopPct != null) lines.push(`- ESOP: ${terms.esopPct}%`);
    if (terms.dragAlong != null) lines.push(`- Drag-along: ${terms.dragAlong ? "OUI" : "NON"}`);
    if (terms.tagAlong != null) lines.push(`- Tag-along: ${terms.tagAlong ? "OUI" : "NON"}`);

    // Clauses speciales
    if (terms.ratchet) lines.push(`- Ratchet: OUI (ATTENTION: clause toxique)`);
    if (terms.payToPlay) lines.push(`- Pay-to-play: OUI`);
    if (terms.milestoneTranches) lines.push(`- Milestone tranches: OUI`);
    if (terms.nonCompete) lines.push(`- Non-compete: OUI`);

    // Notes
    if (terms.customConditions) lines.push(`\nConditions supplementaires: ${terms.customConditions}`);
    if (terms.notes) lines.push(`Notes BA: ${terms.notes}`);

    return lines.join("\n");
  }

  private formatStructuredTerms(structure: NonNullable<EnrichedAgentContext["dealStructure"]>): string {
    const lines: string[] = [
      `## STRUCTURE MULTI-TRANCHE (${structure.tranches.length} tranches, total: €${structure.totalInvestment.toLocaleString()})`,
    ];

    for (const t of structure.tranches) {
      const parts: string[] = [`### ${t.label || "Tranche"} — ${t.trancheType}`];
      if (t.amount != null) parts.push(`  Montant: €${t.amount.toLocaleString()}`);
      if (t.valuationPre != null) parts.push(`  Valorisation pre-money: €${t.valuationPre.toLocaleString()}`);
      if (t.equityPct != null) parts.push(`  Equity: ${t.equityPct}%`);
      if (t.triggerType) parts.push(`  Trigger: ${t.triggerType}${t.triggerDetails ? ` — ${t.triggerDetails}` : ""}`);
      if (t.status !== "PENDING") parts.push(`  Statut: ${t.status}`);
      lines.push(parts.join("\n"));
    }

    return lines.join("\n");
  }

  // ============================================================================
  // BENCHMARKS
  // ============================================================================

  private formatBenchmarks(context: EnrichedAgentContext): string {
    const stage = this.normalizeDealStage(context.canonicalDeal.stage);
    const lines: string[] = ["## BENCHMARKS DE VALORISATION"];

    // Check Funding DB first
    const fundingCtx = context.fundingDbContext ?? context.fundingContext;
    const benchmarks = fundingCtx?.valuationBenchmarks as Record<string, unknown> | undefined;
    const similarDeals = fundingCtx?.similarDeals;

    if (benchmarks && Object.keys(benchmarks).length > 0) {
      lines.push(`Source: Funding Database`);
      lines.push(JSON.stringify(benchmarks, null, 2).substring(0, 1500));
    } else {
      // Fallback to static
      const sb = STATIC_STAGE_BENCHMARKS[stage];
      lines.push(`Source: Benchmarks statiques (Carta/Eldorado/France Angels 2024)`);
      lines.push(`Stage: ${stage}`);
      lines.push(`- P25: €${sb.valuationPreMoney.p25.toLocaleString()}`);
      lines.push(`- Mediane (P50): €${sb.valuationPreMoney.p50.toLocaleString()}`);
      lines.push(`- P75: €${sb.valuationPreMoney.p75.toLocaleString()}`);
      lines.push(`- P90: €${sb.valuationPreMoney.p90.toLocaleString()}`);
      lines.push(`- Dilution mediane: ${sb.dilutionPctMedian}%`);
      lines.push(`- Instrument standard: ${sb.standardInstrument}`);
    }

    if (similarDeals && Array.isArray(similarDeals) && similarDeals.length > 0) {
      lines.push(`\n### Deals similaires (${similarDeals.length})`);
      for (const deal of similarDeals.slice(0, 5)) {
        const d = deal as Record<string, unknown>;
        const amt = d.amount ?? d.amountUsd;
        const amtStr = typeof amt === "number" ? `€${amt.toLocaleString()}` : "montant inconnu";
        lines.push(`- ${d.companyName ?? d.name ?? "?"}: ${amtStr} (${d.stage ?? "?"}, ${d.sector ?? "?"})`);
      }
    }

    return lines.join("\n");
  }

  private normalizeDealStage(stage: string | null | undefined): DealStageKey {
    if (!stage) return "SEED";
    const upper = stage.toUpperCase().replace(/[^A-Z_]/g, "").replace(/\s+/g, "_");
    if (upper.includes("PRE")) return "PRE_SEED";
    if (upper.includes("SEED")) return "SEED";
    if (upper.includes("SERIES_A") || upper === "A") return "SERIES_A";
    if (upper.includes("SERIES_B") || upper === "B") return "SERIES_B";
    return "LATER";
  }

  // ============================================================================
  // BUILD USER PROMPT
  // ============================================================================

  private buildUserPrompt(
    context: EnrichedAgentContext,
    termsSource: { type: string; formData: string | null; termSheetText: string | null; deckMentions: string | null },
    benchmarks: string
  ): string {
    const sections: string[] = [];

    // Deal info
    sections.push(`# ANALYSE CONDITIONS - ${context.canonicalDeal.name ?? "Deal"}
Stage: ${context.canonicalDeal.stage ?? "Non specifie"}
Secteur: ${context.canonicalDeal.sector ?? "Non specifie"}`);

    // Terms data (primary source)
    if (termsSource.formData) {
      sections.push(termsSource.formData);
    }
    if (termsSource.termSheetText) {
      sections.push(`## TERM SHEET (document uploade)
${termsSource.termSheetText}`);
    }
    if (termsSource.deckMentions) {
      sections.push(`## CONDITIONS MENTIONNEES DANS LE DECK
${termsSource.deckMentions}`);
    }

    // Benchmarks
    sections.push(benchmarks);

    // Agent outputs (pipeline mode)
    const isStandalone = context.conditionsAnalystMode === "standalone";

    if (!isStandalone && context.previousResults) {
      sections.push(this.formatAgentInsights(context));
    } else if (isStandalone && context.conditionsAnalystSummary) {
      sections.push(`## RESUME DERNIERE ANALYSE (mode standalone)
${context.conditionsAnalystSummary}`);
    }

    // Output instructions
    sections.push(`## OUTPUT ATTENDU

Produis un JSON avec cette structure exacte:

\`\`\`json
{
  "score": {
    "value": 0-100,
    "breakdown": [
      { "criterion": "Valorisation", "weight": 0.35, "score": 0-100, "justification": "..." },
      { "criterion": "Instrument", "weight": 0.20, "score": 0-100, "justification": "..." },
      { "criterion": "Protections", "weight": 0.25, "score": 0-100, "justification": "..." },
      { "criterion": "Gouvernance", "weight": 0.20, "score": 0-100, "justification": "..." }
    ]
  },
  "findings": {
    "termsSource": "${termsSource.type}",
    "valuation": { "assessedValue": number|null, "percentileVsDB": 0-100|null, "verdict": "UNDERVALUED"|"FAIR"|"AGGRESSIVE"|"VERY_AGGRESSIVE", "rationale": "1-2 phrases", "benchmarkUsed": "source" },
    "instrument": { "type": "...", "assessment": "STANDARD"|"FAVORABLE"|"UNFAVORABLE"|"TOXIC", "rationale": "1-2 phrases", "stageAppropriate": true|false },
    "protections": { "overallAssessment": "STRONG"|"ADEQUATE"|"WEAK"|"NONE", "keyProtections": [{"item":"...","present":true|false,"assessment":"..."}], "missingCritical": ["..."] },
    "governance": { "vestingAssessment": "...", "esopAssessment": "...", "overallAssessment": "STRONG"|"ADEQUATE"|"WEAK"|"CONCERNING" },
    "crossReferenceInsights": [{ "insight": "...", "sourceAgent": "...", "impact": "positive"|"negative"|"neutral" }],
    "negotiationAdvice": [{ "point": "...", "priority": "CRITICAL"|"HIGH"|"MEDIUM", "suggestedArgument": "...", "leverageSource": "..." }]
  },
  "redFlags": [{ "id": "RF-CA-001", "category": "...", "severity": "CRITICAL"|"HIGH"|"MEDIUM", "title": "...", "description": "...", "evidence": "...", "impact": "...", "question": "..." }],
  "questions": [{ "id": "Q-CA-001", "question": "...", "priority": "CRITICAL"|"HIGH"|"MEDIUM", "context": "...", "whatToLookFor": "..." }],
  "narrative": { "oneLiner": "1 phrase", "summary": "3-4 phrases", "keyInsights": ["..."], "forNegotiation": ["..."] }
}
\`\`\`

**CONCISION OBLIGATOIRE:** breakdown=4 items, crossReferenceInsights MAX 5, negotiationAdvice MAX 5, redFlags MAX 5, questions MAX 5.`);

    // Structured deals: add extra section + output schema for structuredAssessment
    if (context.dealStructure?.mode === "STRUCTURED") {
      sections.push(`## DEAL STRUCTURE / MULTI-TRANCHE

Ce deal est STRUCTURE en ${context.dealStructure.tranches.length} tranche(s). En plus du scoring standard, tu dois produire un champ "structuredAssessment" dans findings:

\`\`\`json
"structuredAssessment": {
  "overallStructureVerdict": "1-2 phrases: verdict global sur la structure multi-tranche",
  "trancheAssessments": [
    { "trancheLabel": "Tranche 1", "assessment": "verdict court", "risks": ["risque 1"], "score": 0-100 }
  ],
  "blendedEffectiveValuation": number|null,
  "triggerRiskLevel": "LOW"|"MEDIUM"|"HIGH"
}
\`\`\`

POINTS D'ATTENTION MULTI-TRANCHE:
- CCA (Compte Courant d'Associe) = pret remboursable. Le BA est creancier, PAS actionnaire sur cette partie
- Actions au nominal = dilution future quasi-certaine si la boite leve
- Option conditionnelle = risque de non-exercice. Evaluer la probabilite des milestones
- Calculer la valorisation effective BLENDED (somme investie / % equity total)
- Verifier la coherence entre tranches (ex: CCA 30K + 10% nominal = valorisation implicite de 10K pour l'equity... mais option a 1M post-money)
- Les triggers (milestones, dates) sont-ils realistes et mesurables?

REGLE CRITIQUE — COMPARAISON ECONOMIQUE DES INSTRUMENTS:
- CCA avec conversion en equity au NOMINAL = cout d'acquisition tres bas (prix par action = valeur nominale, souvent quelques centimes). C'est FAVORABLE au BA.
- BSA-AIR avec cap de valorisation = cout d'acquisition plus eleve (prix par action = cap / nombre d'actions). Le cap est souvent 1M+.
- DONC: convertir un CCA-au-nominal en BSA-AIR-au-cap AUGMENTE le cout d'acquisition pour le BA. Ne JAMAIS recommander cette conversion.
- La seule raison de preferer un BSA-AIR au CCA serait des droits d'actionnaire (vote, info, liquidation pref) — mais le BA PERD en prix. Mentionner ce trade-off explicitement si tu en parles.
- Regle generale pour les conseils de negociation: chaque conseil doit REDUIRE le cout ou AUGMENTER les protections du BA. Si un conseil fait l'inverse, ne le propose PAS.`);
    }

    return sections.join("\n\n---\n\n");
  }

  // ============================================================================
  // FORMAT AGENT INSIGHTS (pipeline mode)
  // ============================================================================

  private formatAgentInsights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const lines: string[] = ["## INSIGHTS AGENTS TIER 1/2 (pour cross-reference)"];

    const relevantAgents = [
      "financial-auditor", "cap-table-auditor", "team-investigator",
      "competitive-intel", "market-intelligence", "deck-forensics",
    ];

    for (const name of relevantAgents) {
      const result = results[name];
      if (!result?.success || !("data" in result)) continue;

      const data = result.data as Record<string, unknown>;
      const agentLines: string[] = [`### ${name.toUpperCase()}`];

      // Score
      const score = data.score as { value?: number; grade?: string } | undefined;
      if (score?.value != null) {
        agentLines.push(`Score: ${score.value}/100 (${score.grade ?? "?"})`);
      }

      // Key findings (extract top-level string/number fields to avoid truncated JSON)
      if (data.findings && typeof data.findings === "object") {
        const f = data.findings as Record<string, unknown>;
        const summaryEntries: string[] = [];
        for (const [k, v] of Object.entries(f)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            summaryEntries.push(`${k}: ${String(v)}`);
          }
        }
        if (summaryEntries.length > 0) {
          agentLines.push(summaryEntries.slice(0, 15).join("\n"));
        }
      }

      // Red flags
      if (Array.isArray(data.redFlags) && data.redFlags.length > 0) {
        agentLines.push(`Red Flags (${data.redFlags.length}):`);
        const rfArr = data.redFlags as { severity?: string; title?: string }[];
        for (const rf of [...rfArr]
          .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
          .slice(0, 8)) {
          agentLines.push(`- [${rf.severity ?? "?"}] ${rf.title ?? "?"}`);
        }
        if (rfArr.length > 8) {
          agentLines.push(`- … et ${rfArr.length - 8} autres`);
        }
      }

      // Narrative
      const narrative = data.narrative as { oneLiner?: string } | undefined;
      if (narrative?.oneLiner) {
        agentLines.push(`Resume: ${narrative.oneLiner}`);
      }

      lines.push(agentLines.join("\n"));
    }

    if (lines.length === 1) {
      lines.push("Aucun output agent disponible.");
    }

    return lines.join("\n\n");
  }

  // ============================================================================
  // NO CONDITIONS RESULT
  // ============================================================================

  private buildNoConditionsResult(context: EnrichedAgentContext): ConditionsAnalystData {
    const meta: AgentMeta = {
      agentName: "conditions-analyst",
      analysisDate: new Date().toISOString(),
      dataCompleteness: "minimal",
      confidenceLevel: 0,
      limitations: ["Aucune condition d'investissement disponible (formulaire vide, pas de term sheet, pas de mention dans le deck)"],
    };

    const score: AgentScore = {
      value: 0,
      grade: "F",
      isFallback: true,
      breakdown: [
        { criterion: "Valorisation", weight: 0.35, score: 0, justification: "Conditions non disponibles" },
        { criterion: "Instrument", weight: 0.20, score: 0, justification: "Conditions non disponibles" },
        { criterion: "Protections", weight: 0.25, score: 0, justification: "Conditions non disponibles" },
        { criterion: "Gouvernance", weight: 0.20, score: 0, justification: "Conditions non disponibles" },
      ],
    };

    const findings: ConditionsAnalystFindings = {
      termsSource: "none",
      valuation: { assessedValue: null, percentileVsDB: null, verdict: "FAIR", rationale: "Pas de donnees de valorisation disponibles.", benchmarkUsed: "N/A" },
      instrument: { type: null, assessment: "STANDARD", rationale: "Pas d'instrument renseigne.", stageAppropriate: true },
      protections: { overallAssessment: "NONE", keyProtections: [], missingCritical: ["Toutes les protections sont inconnues"] },
      governance: { vestingAssessment: "Non renseigne", esopAssessment: "Non renseigne", overallAssessment: "CONCERNING" },
      crossReferenceInsights: [],
      negotiationAdvice: [],
      // Phase A slice A4-bis — Pas de conditions disponibles : signal high
      // (investigation nécessaire) avec orientation vigilance pour signaler
      // l'incertitude factuelle au consumer.
      // Phase A slice A6 round 2 — Brancher le service Evidence Solidity
      // aussi sur ce chemin fallback. Si le contexte fournit des
      // contradictions critiques exploitables (ou ledger insufficient
      // documenté), on qualifie evidenceSolidity. Sinon, reste null.
      signalIntensity: "high",
      signalContribution: this.buildFallbackSignalContribution(context),
    };

    const questions: AgentQuestion[] = [
      {
        priority: "CRITICAL",
        category: "conditions",
        question: "Quelles sont les conditions de la levee? (valorisation pre-money, instrument, montant)?",
        context: "Aucune condition n'est disponible pour l'analyse. Sans conditions, impossible d'evaluer la qualite du deal.",
        whatToLookFor: "Coherence entre la valorisation demandee et les metriques du deal (ARR, traction, equipe).",
      },
      {
        priority: "HIGH",
        category: "conditions",
        question: "Y a-t-il une term sheet disponible? Quelles protections sont prevues (liquidation pref, anti-dilution, pro-rata)?",
        context: "Les protections investisseur sont essentielles pour un BA. Sans elles, l'investissement est fait 'a l'aveugle'.",
        whatToLookFor: "Absence de pro-rata (dilution forcee), absence d'information rights, clauses toxiques (ratchet, pay-to-play).",
      },
    ];

    return {
      meta,
      score,
      findings,
      redFlags: [],
      questions,
      // Phase A slice A4-bis — `recommendation` dérivé déterministe depuis
      // findings.signalIntensity (= "high" sans données). Mapping : high →
      // INVESTIGATE_FURTHER (compat AgentAlertSignal infra, debt cross-agent).
      alertSignal: {
        hasBlocker: false,
        recommendation: "INVESTIGATE_FURTHER",
        justification: "Impossible d'evaluer les conditions sans donnees. Demander la term sheet ou remplir le formulaire.",
      },
      narrative: {
        oneLiner: "Aucune condition disponible - analyse impossible.",
        summary: "Les conditions du deal ne sont pas renseignees. Ni le formulaire, ni un term sheet, ni le deck ne contiennent d'informations sur les conditions d'investissement. L'analyse conditions est en attente.",
        keyInsights: ["Aucune condition disponible pour l'analyse"],
        forNegotiation: [],
      },
    };
  }

  // ============================================================================
  // BUILD OUTPUT
  // ============================================================================

  private buildOutput(
    data: LLMConditionsResponse,
    termsSource: "form" | "term_sheet" | "deck",
    context: EnrichedAgentContext
  ): ConditionsAnalystData {
    // Score
    const scoreValue = Math.min(100, Math.max(0, Math.round(data.score?.value ?? 50)));
    const score: AgentScore = {
      value: scoreValue,
      grade: this.getGrade(scoreValue),
      breakdown: (data.score?.breakdown ?? []).map(b => ({
        criterion: b.criterion ?? "",
        weight: b.weight ?? 0,
        score: Math.min(100, Math.max(0, Math.round(b.score ?? 0))),
        justification: b.justification ?? "",
      })),
    };

    // Meta
    const meta: AgentMeta = {
      agentName: "conditions-analyst",
      analysisDate: new Date().toISOString(),
      dataCompleteness: this.assessCompleteness(context),
      confidenceLevel: this.assessConfidence(context, termsSource),
      limitations: this.identifyLimitations(context, termsSource),
    };

    // Findings
    const findings: ConditionsAnalystFindings = {
      termsSource,
      valuation: {
        assessedValue: data.findings?.valuation?.assessedValue ?? null,
        percentileVsDB: data.findings?.valuation?.percentileVsDB != null
          ? Math.min(100, Math.max(0, data.findings.valuation.percentileVsDB))
          : null,
        verdict: this.validateValuationVerdict(data.findings?.valuation?.verdict),
        rationale: data.findings?.valuation?.rationale ?? "",
        benchmarkUsed: data.findings?.valuation?.benchmarkUsed ?? "",
      },
      instrument: {
        type: data.findings?.instrument?.type ?? null,
        assessment: this.validateInstrumentAssessment(data.findings?.instrument?.assessment),
        rationale: data.findings?.instrument?.rationale ?? "",
        stageAppropriate: data.findings?.instrument?.stageAppropriate ?? true,
      },
      protections: {
        overallAssessment: this.validateProtectionsAssessment(data.findings?.protections?.overallAssessment),
        keyProtections: (data.findings?.protections?.keyProtections ?? []).map(p => ({
          item: p.item ?? "",
          present: p.present ?? false,
          assessment: p.assessment ?? "",
        })),
        missingCritical: data.findings?.protections?.missingCritical ?? [],
      },
      governance: {
        vestingAssessment: data.findings?.governance?.vestingAssessment ?? "",
        esopAssessment: data.findings?.governance?.esopAssessment ?? "",
        overallAssessment: this.validateGovernanceAssessment(data.findings?.governance?.overallAssessment),
      },
      crossReferenceInsights: (data.findings?.crossReferenceInsights ?? []).map(i => ({
        insight: i.insight ?? "",
        sourceAgent: i.sourceAgent ?? "",
        impact: this.validateImpact(i.impact),
      })),
      negotiationAdvice: (data.findings?.negotiationAdvice ?? []).map(a => ({
        point: a.point ?? "",
        priority: this.validateSeverity(a.priority),
        suggestedArgument: a.suggestedArgument ?? "",
        leverageSource: a.leverageSource ?? "",
      })),
      // Placeholders ; recalculés ci-dessous depuis les red flags consolidés
      // (dérivation déterministe, P2 — sans score).
      signalIntensity: "low",
      signalContribution: { orientation: "contrasted", evidenceSolidity: null },
    };

    // Structured assessment (multi-tranche mode)
    if (data.findings?.structuredAssessment) {
      const sa = data.findings.structuredAssessment;
      findings.structuredAssessment = {
        overallStructureVerdict: sa.overallStructureVerdict ?? "",
        trancheAssessments: (sa.trancheAssessments ?? []).map(ta => ({
          trancheLabel: ta.trancheLabel ?? "",
          assessment: ta.assessment ?? "",
          risks: ta.risks ?? [],
          score: Math.min(100, Math.max(0, Math.round(ta.score ?? 50))),
        })),
        blendedEffectiveValuation: sa.blendedEffectiveValuation ?? null,
        triggerRiskLevel: this.validateTriggerRisk(sa.triggerRiskLevel),
      };
    }

    // Red flags
    const redFlags: AgentRedFlag[] = (data.redFlags ?? []).map((rf, i) => ({
      id: rf.id ?? `RF-CA-${String(i + 1).padStart(3, "0")}`,
      category: rf.category ?? "conditions",
      severity: this.validateSeverity(rf.severity),
      title: rf.title ?? "",
      description: rf.description ?? "",
      location: "Conditions du deal",
      evidence: rf.evidence ?? "",
      impact: rf.impact ?? "",
      question: rf.question ?? "",
      redFlagIfBadAnswer: "",
    }));

    // Questions
    const questions: AgentQuestion[] = (data.questions ?? []).map(q => ({
      priority: this.validateSeverity(q.priority),
      category: "conditions",
      question: q.question ?? "",
      context: q.context ?? "",
      whatToLookFor: q.whatToLookFor ?? "",
    }));

    // Dérivation déterministe signalIntensity + signalContribution depuis la
    // severity des red flags conditions UNIQUEMENT (P2 — sans score).
    // Anti-régression round 2 A3 : le LLM ne pilote pas (toute valeur LLM
    // est ignorée).
    const criticalRedFlags = redFlags.filter(rf => rf.severity === "CRITICAL").length;
    const highRedFlags = redFlags.filter(rf => rf.severity === "HIGH").length;
    findings.signalIntensity = this.deriveSignalIntensityFromConditions(criticalRedFlags, highRedFlags);
    findings.signalContribution = this.deriveSignalContributionFromIntensity(findings.signalIntensity);

    // Phase A slice A6 — Qualifier evidenceSolidity depuis le service
    // déterministe (D2 verrouillé : contradictory / insufficient / null,
    // jamais dérivé de score / confidence). CA n'a pas d'override : il lit
    // les contradictions cross-agent depuis previousResults.
    const solidity = buildEvidenceSolidityForContext(context);
    if (solidity.value !== null && solidity.rationale) {
      findings.signalContribution.evidenceSolidity = solidity.value;
      findings.signalContribution.evidenceSolidityRationale = solidity.rationale;
    }

    // Phase A slice A4-bis — `alertSignal.recommendation` dérivé déterministe
    // depuis signalIntensity. Le LLM ne pilote plus. Mapping :
    //   low → PROCEED, elevated → PROCEED_WITH_CAUTION,
    //   high → INVESTIGATE_FURTHER, critical → STOP.
    // Le contrat global `AgentAlertSignal` reste intact (debt cross-agent).
    const alertSignal: AgentAlertSignal = {
      hasBlocker: findings.signalIntensity === "critical" || criticalRedFlags >= 1,
      blockerReason: redFlags.find(rf => rf.severity === "CRITICAL")?.title,
      recommendation: this.signalIntensityToRecommendation(findings.signalIntensity),
      justification: data.narrative?.summary ?? `Intensité du signal: ${findings.signalIntensity} (${criticalRedFlags} red flags CRITICAL, ${highRedFlags} HIGH, score ${scoreValue}/100).`,
    };

    // Narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "",
      summary: data.narrative?.summary ?? "",
      keyInsights: data.narrative?.keyInsights ?? [],
      forNegotiation: data.narrative?.forNegotiation ?? [],
    };

    return { meta, score, findings, redFlags, questions, alertSignal, narrative };
  }

  // ============================================================================
  // VALIDATORS
  // ============================================================================

  /**
   * Phase A slice A6 round 2 — Construit le signalContribution du chemin
   * fallback `buildNoConditionsResult`. Orientation fixée à `vigilance`
   * (signal d'incertitude factuelle). evidenceSolidity qualifié via le
   * service Evidence Solidity si signaux exploitables, sinon null.
   */
  private buildFallbackSignalContribution(context: EnrichedAgentContext): Tier3SignalContribution {
    const base: Tier3SignalContribution = { orientation: "vigilance", evidenceSolidity: null };
    const solidity = buildEvidenceSolidityForContext(context);
    if (solidity.value !== null && solidity.rationale) {
      base.evidenceSolidity = solidity.value;
      base.evidenceSolidityRationale = solidity.rationale;
    }
    return base;
  }

  /**
   * Dérivation déterministe de `signalIntensity` depuis la severity des red
   * flags conditions UNIQUEMENT (chantier P2 — retrait du score `scoreValue`
   * qui escaladait l'intensité, donc l'orientation = score caché).
   *
   * Anti-régression round 2 A3 : le LLM ne pilote pas.
   *
   *   1+ red flag CRITICAL    → critical
   *   2+ red flags HIGH       → high
   *   1 red flag HIGH         → elevated
   *   sinon                   → low
   */
  private deriveSignalIntensityFromConditions(
    criticalRedFlags: number,
    highRedFlags: number,
  ): Tier3SignalIntensity {
    if (criticalRedFlags >= 1) return "critical";
    if (highRedFlags >= 2) return "high";
    if (highRedFlags >= 1) return "elevated";
    return "low";
  }

  /**
   * Dérivation déterministe de `signalContribution` depuis `signalIntensity`,
   * SANS aucun score (chantier P2 — retrait des tiebreaks `score >= 85/70/55`).
   *
   * L'orientation découle de l'intensité via le mapping per-agent partagé
   * `orientationFromAgentIntensity` (critical→alert_dominant, high→vigilance,
   * elevated→contrasted, low→favorable). `signalIntensity` étant désormais
   * piloté par les seuls red flags, `favorable` reflète l'absence de red flag
   * de conditions sur l'AXE conditions (pas une note de deal).
   *
   * D2 verrouillé : evidenceSolidity reste null ici (le service Solidité qualifie).
   */
  private deriveSignalContributionFromIntensity(
    intensity: Tier3SignalIntensity,
  ): Tier3SignalContribution {
    return {
      orientation: orientationFromAgentIntensity(intensity),
      evidenceSolidity: null,
    };
  }

  /**
   * Phase A slice A4-bis — Mapping signalIntensity → recommendation legacy
   * (conservation contrat global AgentAlertSignal, debt cross-agent).
   */
  private signalIntensityToRecommendation(
    intensity: Tier3SignalIntensity,
  ): "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP" {
    switch (intensity) {
      case "low": return "PROCEED";
      case "elevated": return "PROCEED_WITH_CAUTION";
      case "high": return "INVESTIGATE_FURTHER";
      case "critical": return "STOP";
    }
  }

  private getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
  }

  private validateSeverity(s: string | undefined): "CRITICAL" | "HIGH" | "MEDIUM" {
    const upper = (s ?? "").toUpperCase();
    if (upper === "CRITICAL") return "CRITICAL";
    if (upper === "HIGH") return "HIGH";
    return "MEDIUM";
  }

  private validateValuationVerdict(v: string | undefined): "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE" {
    const upper = (v ?? "").toUpperCase().replace(/[^A-Z_]/g, "");
    if (upper.includes("UNDER")) return "UNDERVALUED";
    if (upper.includes("VERY") || upper.includes("EXCESSIVE")) return "VERY_AGGRESSIVE";
    if (upper.includes("AGGRESSIVE") || upper.includes("HIGH")) return "AGGRESSIVE";
    return "FAIR";
  }

  private validateInstrumentAssessment(a: string | undefined): "STANDARD" | "FAVORABLE" | "UNFAVORABLE" | "TOXIC" {
    const upper = (a ?? "").toUpperCase();
    if (upper.includes("TOXIC")) return "TOXIC";
    if (upper.includes("UNFAV")) return "UNFAVORABLE";
    if (upper.includes("FAV")) return "FAVORABLE";
    return "STANDARD";
  }

  private validateProtectionsAssessment(a: string | undefined): "STRONG" | "ADEQUATE" | "WEAK" | "NONE" {
    const upper = (a ?? "").toUpperCase();
    if (upper.includes("STRONG")) return "STRONG";
    if (upper.includes("ADEQUATE") || upper.includes("CORRECT")) return "ADEQUATE";
    if (upper.includes("WEAK") || upper.includes("FAIBLE")) return "WEAK";
    return "NONE";
  }

  private validateGovernanceAssessment(a: string | undefined): "STRONG" | "ADEQUATE" | "WEAK" | "CONCERNING" {
    const upper = (a ?? "").toUpperCase();
    if (upper.includes("STRONG")) return "STRONG";
    if (upper.includes("ADEQUATE") || upper.includes("CORRECT")) return "ADEQUATE";
    if (upper.includes("WEAK") || upper.includes("FAIBLE")) return "WEAK";
    return "CONCERNING";
  }

  private validateTriggerRisk(r: string | undefined): "LOW" | "MEDIUM" | "HIGH" {
    const upper = (r ?? "").toUpperCase();
    if (upper.includes("HIGH")) return "HIGH";
    if (upper.includes("LOW")) return "LOW";
    return "MEDIUM";
  }

  private validateImpact(i: string | undefined): "positive" | "negative" | "neutral" {
    const lower = (i ?? "").toLowerCase();
    if (lower.includes("positive") || lower.includes("positif")) return "positive";
    if (lower.includes("negative") || lower.includes("negatif")) return "negative";
    return "neutral";
  }

  private assessConfidence(context: EnrichedAgentContext, termsSource: string): number {
    let confidence = 30; // Base: we have some data (otherwise buildNoConditionsResult would have been called)
    // Source quality
    if (termsSource === "form") confidence += 25;
    else if (termsSource === "term_sheet") confidence += 20;
    else if (termsSource === "deck") confidence += 10;
    // Data completeness
    const completeness = this.assessCompleteness(context);
    if (completeness === "complete") confidence += 25;
    else if (completeness === "partial") confidence += 15;
    // Pipeline mode has richer context
    if (context.conditionsAnalystMode === "pipeline" && Object.keys(context.previousResults ?? {}).length > 3) {
      confidence += 15;
    }
    // Funding DB available
    if (context.fundingDbContext || context.fundingContext) confidence += 5;
    return Math.min(100, confidence);
  }

  private assessCompleteness(context: EnrichedAgentContext): "complete" | "partial" | "minimal" {
    const terms = context.dealTerms;
    if (!terms) return "minimal";

    let filledFields = 0;
    if (terms.valuationPre != null) filledFields++;
    if (terms.instrumentType) filledFields++;
    if (terms.liquidationPref) filledFields++;
    if (terms.proRataRights != null) filledFields++;
    if (terms.founderVesting != null) filledFields++;
    if (terms.tagAlong != null) filledFields++;

    if (filledFields >= 5) return "complete";
    if (filledFields >= 2) return "partial";
    return "minimal";
  }

  private identifyLimitations(context: EnrichedAgentContext, termsSource: string): string[] {
    const limitations: string[] = [];

    if (termsSource === "deck") {
      limitations.push("Conditions extraites du deck uniquement - donnees potentiellement incompletes");
    }

    if (!context.fundingDbContext && !context.fundingContext) {
      limitations.push("Funding DB non disponible - benchmarks statiques utilises");
    }

    if (context.conditionsAnalystMode === "standalone") {
      limitations.push("Mode standalone - cross-reference limite avec les agents");
    }

    const results = context.previousResults ?? {};
    if (Object.keys(results).length === 0) {
      limitations.push("Aucun output d'agent disponible pour cross-reference");
    }

    return limitations;
  }
}

export const conditionsAnalyst = new ConditionsAnalystAgent();
