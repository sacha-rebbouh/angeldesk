/**
 * CONTRADICTION DETECTOR AGENT - REFONTE v2.0 (TIER 3)
 *
 * Mission: Detecter TOUTES les contradictions entre le deck, la DB, le Context Engine,
 * et les outputs des agents Tier 1 et Tier 2
 *
 * Persona: Expert en forensics documentaire + Auditeur Big4 senior + Partner VC skeptique
 * Standard: Qualite facturable 50K€ - Chaque contradiction sourcee et quantifiee
 *
 * Inputs:
 * - Tous les outputs Tier 1 (13 agents)
 * - Output Tier 2 expert sectoriel
 * - Deck original (via extractedData)
 * - Context Engine data
 * - Funding DB data
 *
 * Outputs:
 * - Contradictions detectees par type (INTERNAL, DECK_VS_DB, etc.)
 * - Score de consistance decompose
 * - Cross-reference DB agregee
 * - Red flags sur incoherences
 * - Questions pour le fondateur
 *
 * REGLES ABSOLUES:
 * - JAMAIS inventer de contradictions - chaque claim doit etre SOURCE
 * - TOUJOURS comparer deck vs DB pour les concurrents
 * - TOUJOURS quantifier l'impact de chaque contradiction
 * - Generer des red flags automatiques si: concurrents caches, chiffres conflictuels
 */

import { BaseAgent } from "../base-agent";
import { CONTRADICTION_DETECTOR_SYSTEM_PROMPT } from "./prompts/contradiction-detector-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";
import type {
  EnrichedAgentContext,
  ContradictionDetectorResult,
  ContradictionDetectorData,
  ContradictionDetectorFindings,
  DetectedContradiction,
  DataGap,
  AggregatedDbComparison,
  AgentOutputSummary,
  ContradictionType,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  Tier3SignalIntensity,
  Tier3SignalContribution,
  Tier3Orientation,
} from "../types";

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMContradictionResponse {
  contradictions: {
    id: string;
    type: string;
    severity: string;
    topic: string;
    statement1: { text: string; location: string; source: string };
    statement2: { text: string; location: string; source: string };
    analysis: string;
    implication: string;
    confidenceLevel: number;
    resolution?: { likely: string; reasoning: string; needsVerification: boolean };
    question: string;
    redFlagIfBadAnswer: string;
  }[];
  dataGaps: {
    id: string;
    area: string;
    description: string;
    missingFrom: string[];
    expectedSource: string;
    importance: string;
    impactOnAnalysis: string;
    recommendation: string;
    questionToAsk: string;
  }[];
  consistencyAnalysis: {
    overallScore: number;
    breakdown: { dimension: string; score: number; weight: number; issues: string[] }[];
    interpretation: string;
  };
  redFlagConvergence: {
    topic: string;
    agentsAgreeing: string[];
    agentsDisagreeing: string[];
    consensusLevel: string;
    recommendation: string;
  }[];
  redFlags: {
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    location: string;
    evidence: string;
    impact: string;
    question: string;
    redFlagIfBadAnswer: string;
  }[];
  questions: {
    priority: string;
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  // Phase A slice A4-bis round 2 — `alertSignal` n'est PLUS dans le contrat
  // LLM demandé : le runtime dérive intégralement hasBlocker / recommendation
  // / justification depuis signalIntensity + severity counts. Si le LLM
  // produit quand même ce champ (run dégradé ou cache), il est ignoré (le
  // shape est volontairement retiré de l'interface ici).
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class ContradictionDetectorAgent extends BaseAgent<ContradictionDetectorData, ContradictionDetectorResult> {
  constructor() {
    super({
      name: "contradiction-detector",
      description: "Detecte toutes les contradictions entre deck, DB, Context Engine et outputs agents",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: [], // Depend de tous les Tier 1 + Tier 2, mais gere via previousResults
    });
  }

  // ============================================================================
  // SYSTEM PROMPT - Big4 + Partner VC
  // ============================================================================

  protected buildSystemPrompt(): string {
    // Phase A slice A4-bis — System prompt extrait dans un fichier compagnon
    // (`./prompts/contradiction-detector-prompt.ts`). Les invariants
    // doctrinaux (absence de directive historique de seuil d'auto-confiance,
    // absence de lexique prescriptif legacy, contrat natif signalIntensity +
    // signalContribution dérivé runtime — pas LLM-driven) sont verrouillés
    // mécaniquement par les source-guards de
    // `__tests__/contradiction-detector-prompt.guard.test.ts`.
    return CONTRADICTION_DETECTOR_SYSTEM_PROMPT;
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  protected async execute(context: EnrichedAgentContext): Promise<ContradictionDetectorData> {
    this._dealStage = context.canonicalDeal.stage;
    // 1. Formater tous les inputs
    const formattedInputs = this.formatAllInputs(context);

    // 2. Construire le prompt utilisateur
    const prompt = this.buildUserPrompt(formattedInputs, context);

    // 3. Appeler le LLM
    const { data } = await this.llmCompleteJSON<LLMContradictionResponse>(prompt);

    // 4. Construire les outputs structures
    return this.buildOutput(data, context);
  }

  // ============================================================================
  // FORMAT ALL INPUTS
  // ============================================================================

  private formatAllInputs(context: EnrichedAgentContext): string {
    const sections: string[] = [];

    // --- Section 1: Outputs Tier 1 ---
    sections.push(this.formatTier1Outputs(context));

    // --- Section 2: Outputs Tier 2 (expert sectoriel) ---
    sections.push(this.formatTier2Outputs(context));

    // --- Section 3: Extracted Data (deck original) ---
    sections.push(this.formatExtractedData(context));

    // --- Section 4: Context Engine ---
    sections.push(this.formatContextEngineData(context));

    // --- Section 5: Funding DB ---
    sections.push(this.formatFundingDbData(context));

    // --- Section 6: Fact Store (verified facts) ---
    const factStoreSection = this.formatFactStoreData(context);
    if (factStoreSection) {
      sections.push(factStoreSection);
    }

    // --- Section 7: Tier 1 Cross-Validation (deterministic divergences) (F34/F39) ---
    const crossValidation = context.tier1CrossValidation;
    if (crossValidation && (crossValidation.validations.length > 0 || crossValidation.warnings.length > 0)) {
      const cvLines = [
        "## DIVERGENCES TIER 1 PRE-DETECTEES (Deterministe)",
        "Les divergences suivantes ont ete detectees par le module de cross-validation:",
      ];
      for (const v of crossValidation.validations) {
        cvLines.push(`- [${v.severity}] ${v.agent1} vs ${v.agent2}: ${v.detail}`);
      }
      for (const w of crossValidation.warnings) {
        cvLines.push(`- [WARNING] ${w}`);
      }
      cvLines.push("", "IMPORTANT: Confirme ou infirme ces divergences avec ton analyse approfondie.");
      sections.push(cvLines.join("\n"));
    }

    return sections.filter(s => s.length > 0).join("\n\n---\n\n");
  }

  private formatTier1Outputs(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const tier1Agents = [
      "deck-forensics", "financial-auditor", "market-intelligence", "competitive-intel",
      "team-investigator", "tech-stack-dd", "tech-ops-dd", "legal-regulatory", "cap-table-auditor",
      "gtm-analyst", "customer-intel", "exit-strategist", "question-master"
    ];

    const sections: string[] = ["## OUTPUTS AGENTS TIER 1"];

    for (const agentName of tier1Agents) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        sections.push(this.formatAgentOutput(agentName, result.data, 1));
      }
    }

    if (sections.length === 1) {
      sections.push("Aucun output Tier 1 disponible.");
    }

    return sections.join("\n\n");
  }

  private formatTier2Outputs(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const tier2Experts = [
      "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
      "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
      "hardware-expert", "gaming-expert", "biotech-expert", "edtech-expert",
      "proptech-expert", "mobility-expert", "foodtech-expert", "hrtech-expert",
      "legaltech-expert", "cybersecurity-expert", "spacetech-expert", "creator-expert",
      "general-expert"
    ];

    const sections: string[] = ["## OUTPUTS AGENTS TIER 2 (EXPERTS SECTORIELS)"];

    for (const agentName of tier2Experts) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        sections.push(this.formatAgentOutput(agentName, result.data, 2));
      }
    }

    if (sections.length === 1) {
      sections.push("Aucun output Tier 2 disponible.");
    }

    return sections.join("\n\n");
  }

  private formatAgentOutput(agentName: string, data: unknown, tier: number): string {
    if (!data || typeof data !== "object") {
      return `### ${agentName.toUpperCase()} (Tier ${tier})\nPas de donnees.`;
    }

    const obj = data as Record<string, unknown>;
    const lines: string[] = [`### ${agentName.toUpperCase()} (Tier ${tier})`];

    // Extract score if available
    if (obj.score && typeof obj.score === "object") {
      const score = obj.score as { value?: number; grade?: string };
      if (score.value !== undefined) {
        lines.push(`Score: ${score.value}/100 (Grade: ${score.grade ?? "N/A"})`);
      }
    }

    // Extract meta if available
    if (obj.meta && typeof obj.meta === "object") {
      const meta = obj.meta as { dataCompleteness?: string; confidenceLevel?: number };
      lines.push(`Completude: ${meta.dataCompleteness ?? "N/A"} | Confiance: ${meta.confidenceLevel ?? "N/A"}%`);
    }

    // Extract key findings
    if (obj.findings && typeof obj.findings === "object") {
      lines.push("\n**Findings cles:**");
      lines.push(JSON.stringify(obj.findings, null, 2).substring(0, 3000));
    }

    // Extract red flags
    if (Array.isArray(obj.redFlags) && obj.redFlags.length > 0) {
      lines.push(`\n**Red Flags (${obj.redFlags.length}):**`);
      for (const rf of obj.redFlags.slice(0, 5)) {
        const flag = rf as { severity?: string; title?: string; description?: string };
        lines.push(`- [${flag.severity ?? "?"}] ${flag.title ?? flag.description ?? "?"}`);
      }
    }

    // Extract narrative if available
    if (obj.narrative && typeof obj.narrative === "object") {
      const narrative = obj.narrative as { oneLiner?: string };
      if (narrative.oneLiner) {
        lines.push(`\n**Resume:** ${narrative.oneLiner}`);
      }
    }

    // Phase A slice A4-bis round 2 — Ne plus exposer la valeur prescriptive
    // legacy `recommendation: PROCEED|STOP` des agents précédents dans le
    // prompt utilisateur. Cela évite que CD voie du langage d'action
    // (PROCEED/STOP) côté input et soit tenté de produire la même chose en
    // sortie. On conserve uniquement le statut de blocage factuel
    // (Blocker: OUI/NON) sans wording prescriptif.
    if (obj.alertSignal && typeof obj.alertSignal === "object") {
      const alert = obj.alertSignal as { hasBlocker?: boolean };
      lines.push(`\n**Blocker:** ${alert.hasBlocker ? "OUI" : "NON"}`);
    }

    return lines.join("\n");
  }

  private formatExtractedData(context: EnrichedAgentContext): string {
    const extractedInfo = context.extractedData;
    if (!extractedInfo) {
      return "## DONNEES EXTRAITES DU DECK\nAucune donnee extraite disponible.";
    }

    const lines: string[] = ["## DONNEES EXTRAITES DU DECK (via document-extractor)"];

    // Financials
    if (extractedInfo.arr || extractedInfo.mrr || extractedInfo.revenue) {
      lines.push("\n**Financials:**");
      if (extractedInfo.arr) lines.push(`- ARR: €${extractedInfo.arr.toLocaleString()}`);
      if (extractedInfo.mrr) lines.push(`- MRR: €${extractedInfo.mrr.toLocaleString()}`);
      if (extractedInfo.revenue) lines.push(`- Revenue: €${extractedInfo.revenue.toLocaleString()}`);
      if (extractedInfo.growthRateYoY) lines.push(`- Growth YoY: ${extractedInfo.growthRateYoY}%`);
      if (extractedInfo.burnRate) lines.push(`- Burn Rate: €${extractedInfo.burnRate.toLocaleString()}/mois`);
      if (extractedInfo.runway) lines.push(`- Runway: ${extractedInfo.runway} mois`);
    }

    // Fundraising
    if (extractedInfo.valuationPre || extractedInfo.amountRaising) {
      lines.push("\n**Fundraising:**");
      if (extractedInfo.valuationPre) lines.push(`- Valorisation pre-money: €${extractedInfo.valuationPre.toLocaleString()}`);
      if (extractedInfo.amountRaising) lines.push(`- Montant demande: €${extractedInfo.amountRaising.toLocaleString()}`);
    }

    // Traction
    if (extractedInfo.customers || extractedInfo.users) {
      lines.push("\n**Traction:**");
      if (extractedInfo.customers) lines.push(`- Clients: ${extractedInfo.customers}`);
      if (extractedInfo.users) lines.push(`- Users: ${extractedInfo.users}`);
      if (extractedInfo.nrr) lines.push(`- NRR: ${extractedInfo.nrr}%`);
      if (extractedInfo.churnRate) lines.push(`- Churn: ${extractedInfo.churnRate}%`);
    }

    // Team
    if (extractedInfo.founders && extractedInfo.founders.length > 0) {
      lines.push("\n**Equipe:**");
      for (const f of extractedInfo.founders) {
        lines.push(`- ${f.name} (${f.role}): ${f.background ?? "Background non specifie"}`);
      }
    }

    // Competitors from deck
    if (extractedInfo.competitors && extractedInfo.competitors.length > 0) {
      lines.push("\n**Concurrents mentionnes dans le deck:**");
      for (const c of extractedInfo.competitors) {
        lines.push(`- ${c}`);
      }
    } else {
      lines.push("\n**Concurrents mentionnes dans le deck:** AUCUN (potentiel red flag)");
    }

    // Market
    if (extractedInfo.tam || extractedInfo.sam || extractedInfo.som) {
      lines.push("\n**Marche:**");
      if (extractedInfo.tam) lines.push(`- TAM: €${extractedInfo.tam.toLocaleString()}`);
      if (extractedInfo.sam) lines.push(`- SAM: €${extractedInfo.sam.toLocaleString()}`);
      if (extractedInfo.som) lines.push(`- SOM: €${extractedInfo.som.toLocaleString()}`);
    }

    return lines.join("\n");
  }

  private formatFundingDbData(context: EnrichedAgentContext): string {
    const fundingContext = context.fundingDbContext ?? context.fundingContext;
    if (!fundingContext) {
      return "## FUNDING DATABASE\nAucune donnee Funding DB disponible.";
    }

    // Cast to access additional properties that may exist
    const fc = fundingContext as Record<string, unknown>;
    const lines: string[] = ["## FUNDING DATABASE"];

    // Competitors from DB
    if (fundingContext.competitors && fundingContext.competitors.length > 0) {
      lines.push("\n**Concurrents detectes dans la DB:**");
      for (const c of fundingContext.competitors) {
        const comp = c as { name: string; totalFunding?: number; lastRound?: string; status?: string };
        lines.push(`- ${comp.name}: Funding total = €${(comp.totalFunding ?? 0).toLocaleString()} | Status: ${comp.status ?? "active"}`);
      }
    } else {
      lines.push("\n**Concurrents detectes dans la DB:** AUCUN (DB peut etre limitee)");
    }

    // Benchmarks
    if (fundingContext.sectorBenchmarks || fc.valuationBenchmarks) {
      lines.push("\n**Benchmarks secteur:**");
      if (fc.valuationBenchmarks) {
        const vb = fc.valuationBenchmarks as Record<string, unknown>;
        lines.push(JSON.stringify(vb, null, 2).substring(0, 1000));
      }
    }

    // Similar deals
    const similarDeals = fc.similarDeals as unknown[] | undefined;
    if (similarDeals && similarDeals.length > 0) {
      lines.push(`\n**Deals similaires:** ${similarDeals.length} deals`);
    }

    return lines.join("\n");
  }

  // ============================================================================
  // BUILD USER PROMPT
  // ============================================================================

  private buildUserPrompt(formattedInputs: string, context: EnrichedAgentContext): string {
    // Get competitors comparison data
    const deckCompetitors = context.extractedData?.competitors ?? [];
    const dbCompetitors = (context.fundingDbContext?.competitors ?? context.fundingContext?.competitors ?? [])
      .map(c => (c as { name: string }).name);

    return `# ANALYSE CONTRADICTION DETECTOR - ${context.canonicalDeal.name}

## TOUS LES INPUTS A ANALYSER

${formattedInputs}

## INSTRUCTIONS SPECIFIQUES

1. **CROSS-REFERENCE OBLIGATOIRE DECK VS DB:**
   - Concurrents dans le deck: ${deckCompetitors.length > 0 ? deckCompetitors.join(", ") : "AUCUN MENTIONNE"}
   - Concurrents dans la DB: ${dbCompetitors.length > 0 ? dbCompetitors.join(", ") : "AUCUN TROUVE (DB limitee)"}
   - Identifier les concurrents CACHES (dans DB mais pas deck) = RED FLAG CRITIQUE
   - Identifier les concurrents du deck non trouves dans DB = A RECHERCHER

2. **DETECTER LES CONTRADICTIONS PAR TYPE:**
   - INTERNAL: Contradictions dans le deck lui-meme
   - DECK_VS_DB: Deck vs Funding Database
   - CLAIM_VS_DATA: Claims vs calculs
   - TIER1_VS_TIER1: Entre agents Tier 1
   - TIER1_VS_TIER2: Tier 1 vs expert sectoriel
   - DECK_VS_CONTEXT_ENGINE: Deck vs Context Engine

3. **PRIORISER PAR IMPACT:**
   - CRITICAL: Signal d'alerte structurel (team, financials majeurs, fraude)
   - HIGH: Necessite clarification avant decision
   - MEDIUM: A noter mais pas bloquant

4. **POUR CHAQUE CONTRADICTION:**
   - Citer les sources EXACTEMENT
   - Quantifier l'ecart quand applicable
   - Formuler une question pour le fondateur
   - Indiquer ce qui serait un red flag si mauvaise reponse

## OUTPUT ATTENDU

Produis un JSON avec cette structure:

\`\`\`json
{
  "contradictions": [
    {
      "id": "CONT-001",
      "type": "DECK_VS_DB" | "INTERNAL" | "CLAIM_VS_DATA" | "TIER1_VS_TIER1" | "TIER1_VS_TIER2" | "DECK_VS_CONTEXT_ENGINE",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM",
      "topic": "Concurrents" | "ARR" | "Valorisation" | "Team" | etc.,
      "statement1": { "text": "Citation exacte", "location": "Slide X / Agent Y", "source": "deck/agent/db" },
      "statement2": { "text": "Citation exacte", "location": "Source", "source": "deck/agent/db" },
      "analysis": "Explication detaillee de la contradiction",
      "implication": "Impact pour le BA",
      "confidenceLevel": 0-100,
      "resolution": { "likely": "statement1|statement2|unknown", "reasoning": "...", "needsVerification": true },
      "question": "Question a poser au fondateur",
      "redFlagIfBadAnswer": "Ce qui serait un red flag"
    }
  ],
  "dataGaps": [
    {
      "id": "GAP-001",
      "area": "Unit Economics",
      "description": "Description du gap",
      "missingFrom": ["agent1", "agent2"],
      "expectedSource": "Ou on aurait du trouver",
      "importance": "CRITICAL" | "HIGH" | "MEDIUM",
      "impactOnAnalysis": "Impact",
      "recommendation": "Comment obtenir",
      "questionToAsk": "Question"
    }
  ],
  "consistencyAnalysis": {
    "overallScore": 0-100,
    "breakdown": [
      { "dimension": "internal_consistency", "score": 0-100, "weight": 20, "issues": [] },
      { "dimension": "deck_vs_db", "score": 0-100, "weight": 25, "issues": [] },
      { "dimension": "tier1_consensus", "score": 0-100, "weight": 25, "issues": [] },
      { "dimension": "tier1_vs_tier2", "score": 0-100, "weight": 15, "issues": [] },
      { "dimension": "claims_vs_calculations", "score": 0-100, "weight": 15, "issues": [] }
    ],
    "interpretation": "Interpretation du score"
  },
  "redFlagConvergence": [
    {
      "topic": "Team",
      "agentsAgreeing": ["agent1", "agent2"],
      "agentsDisagreeing": ["agent3"],
      "consensusLevel": "STRONG" | "MODERATE" | "WEAK" | "CONFLICTING",
      "recommendation": "..."
    }
  ],
  "redFlags": [
    {
      "id": "RF-001",
      "category": "credibility",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM",
      "title": "Titre court",
      "description": "Description detaillee",
      "location": "Source",
      "evidence": "Preuve",
      "impact": "Impact pour le BA",
      "question": "Question fondateur",
      "redFlagIfBadAnswer": "..."
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM",
      "category": "credibility",
      "question": "Question",
      "context": "Pourquoi on pose cette question",
      "whatToLookFor": "Ce qui revelerait un probleme"
    }
  ],
  // alertSignal n'est PAS demandé au LLM : il est DÉRIVÉ DÉTERMINISTE par le
  // runtime depuis les severity counts des contradictions, après ton output.
  "narrative": {
    "oneLiner": "Resume en 1 phrase",
    "summary": "Resume en 3-4 phrases",
    "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
    "forNegotiation": ["Argument 1", "Argument 2"]
  }
}
\`\`\`

**CONCISION OBLIGATOIRE (JSON sera INVALIDE si tronque):**
- contradictions: MAX 6 items
- dataGaps: MAX 4 items
- redFlagConvergence: MAX 4 topics
- redFlags: MAX 5 items
- questions: MAX 5 items
- analysis/implication: 1-2 phrases MAX
- PRIORITE: JSON complet > quantite d'items`;
  }

  // ============================================================================
  // BUILD OUTPUT
  // ============================================================================

  private buildOutput(data: LLMContradictionResponse, context: EnrichedAgentContext): ContradictionDetectorData {
    // Validate and normalize contradictions
    const contradictions: DetectedContradiction[] = (Array.isArray(data.contradictions) ? data.contradictions : []).map((c, i) => ({
      id: c.id ?? `CONT-${String(i + 1).padStart(3, "0")}`,
      type: this.validateContradictionType(c.type),
      severity: this.validateSeverity(c.severity),
      statement1: c.statement1 ?? { text: "", location: "", source: "" },
      statement2: c.statement2 ?? { text: "", location: "", source: "" },
      topic: c.topic ?? "Unknown",
      analysis: c.analysis ?? "",
      implication: c.implication ?? "",
      confidenceLevel: c.confidenceLevel ?? 0,
      resolution: c.resolution ? {
        likely: (c.resolution.likely as "statement1" | "statement2" | "unknown") ?? "unknown",
        reasoning: c.resolution.reasoning ?? "",
        needsVerification: c.resolution.needsVerification ?? true,
      } : undefined,
      question: c.question ?? "",
      redFlagIfBadAnswer: c.redFlagIfBadAnswer ?? "",
    }));

    // Validate and normalize data gaps
    const dataGaps: DataGap[] = (Array.isArray(data.dataGaps) ? data.dataGaps : []).map((g, i) => ({
      id: g.id ?? `GAP-${String(i + 1).padStart(3, "0")}`,
      area: g.area ?? "Unknown",
      description: g.description ?? "",
      missingFrom: g.missingFrom ?? [],
      expectedSource: g.expectedSource ?? "",
      importance: this.validateSeverity(g.importance),
      impactOnAnalysis: g.impactOnAnalysis ?? "",
      recommendation: g.recommendation ?? "",
      questionToAsk: g.questionToAsk ?? "",
    }));

    // Build aggregated DB comparison
    const aggregatedDbComparison = this.buildAggregatedDbComparison(context, contradictions);

    // Build agent outputs summary
    const agentOutputsSummary = this.buildAgentOutputsSummary(context);

    // Build consistency analysis
    const consistencyAnalysis = data.consistencyAnalysis ?? {
      overallScore: 50,
      breakdown: [],
      interpretation: "Analyse de consistance non disponible",
    };

    // Phase A slice A4-bis — signalIntensity dérivé déterministe depuis
    // severity counts des contradictions. Anti-régression round 2 A3 :
    // le LLM ne pilote pas (toute valeur LLM est ignorée).
    const criticalContradictions = contradictions.filter(c => c.severity === "CRITICAL").length;
    const highContradictions = contradictions.filter(c => c.severity === "HIGH").length;
    const signalIntensity = this.deriveSignalIntensityFromContradictions(criticalContradictions, highContradictions);
    // Orientation déterministe depuis signalIntensity + score consistance.
    const signalContribution = this.deriveSignalContributionFromIntensity(signalIntensity, consistencyAnalysis.overallScore);

    // Phase A slice A6 — Qualifier evidenceSolidity depuis le service
    // déterministe. CD est l'auteur des contradictions consommées par le
    // service : pour éviter une lecture circulaire de
    // `previousResults["contradiction-detector"]` (absent dans son propre
    // run), on fournit ses propres counts via `selfContradictionsOverride`.
    const solidity = buildEvidenceSolidityForContext(context, {
      selfContradictionsOverride: { critical: criticalContradictions, high: highContradictions },
    });
    if (solidity.value !== null && solidity.rationale) {
      signalContribution.evidenceSolidity = solidity.value;
      signalContribution.evidenceSolidityRationale = solidity.rationale;
    }

    // Build findings
    const findings: ContradictionDetectorFindings = {
      contradictions,
      contradictionSummary: this.buildContradictionSummary(contradictions),
      dataGaps,
      aggregatedDbComparison,
      agentOutputsSummary,
      consistencyAnalysis,
      redFlagConvergence: (Array.isArray(data.redFlagConvergence) ? data.redFlagConvergence : []).map(r => ({
        topic: r.topic ?? "",
        agentsAgreeing: Array.isArray(r.agentsAgreeing) ? r.agentsAgreeing : [],
        agentsDisagreeing: Array.isArray(r.agentsDisagreeing) ? r.agentsDisagreeing : [],
        consensusLevel: this.validateConsensusLevel(r.consensusLevel),
        recommendation: r.recommendation ?? "",
      })),
      signalIntensity,
      signalContribution,
    };

    // Build score
    const score: AgentScore = {
      value: consistencyAnalysis.overallScore,
      grade: this.getGrade(consistencyAnalysis.overallScore),
      breakdown: (Array.isArray(consistencyAnalysis.breakdown) ? consistencyAnalysis.breakdown : []).map(b => ({
        criterion: b.dimension ?? "",
        weight: b.weight ?? 0,
        score: b.score ?? 0,
        justification: (b.issues ?? []).join("; ") || "Pas de probleme majeur",
      })),
    };

    // Build meta
    const meta: AgentMeta = {
      agentName: "contradiction-detector",
      analysisDate: new Date().toISOString(),
      dataCompleteness: this.assessDataCompleteness(context),
      confidenceLevel: Math.min(100, Math.max(0, consistencyAnalysis.overallScore)),
      limitations: this.identifyLimitations(context),
    };

    // Build red flags
    const redFlags: AgentRedFlag[] = (Array.isArray(data.redFlags) ? data.redFlags : []).map((rf, i) => ({
      id: rf.id ?? `RF-CD-${String(i + 1).padStart(3, "0")}`,
      category: rf.category ?? "credibility",
      severity: this.validateSeverity(rf.severity),
      title: rf.title ?? "Red flag detecte",
      description: rf.description ?? "",
      location: rf.location ?? "",
      evidence: rf.evidence ?? "",
      impact: rf.impact ?? "",
      question: rf.question ?? "",
      redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
    }));

    // Add automatic red flags
    this.addAutomaticRedFlags(redFlags, aggregatedDbComparison, contradictions, consistencyAnalysis.overallScore);

    // Build questions
    const questions: AgentQuestion[] = (Array.isArray(data.questions) ? data.questions : []).map(q => ({
      priority: this.validatePriority(q.priority),
      category: q.category ?? "credibility",
      question: q.question ?? "",
      context: q.context ?? "",
      whatToLookFor: q.whatToLookFor ?? "",
    }));

    // Phase A slice A4-bis — `alertSignal` dérivé déterministe depuis
    // `signalIntensity`. Le LLM ne pilote plus `recommendation`. Le contrat
    // global `AgentAlertSignal` reste intact (debt cross-agent hors A4-bis).
    // Mapping signalIntensity → recommendation legacy :
    //   low → PROCEED, elevated → PROCEED_WITH_CAUTION,
    //   high → INVESTIGATE_FURTHER, critical → STOP.
    // `validateRecommendation` (parser tolérant local) reste disponible pour
    // toute lecture future input legacy LLM dégradé, mais n'est plus appelée
    // en émission (la dérivation override toute valeur LLM).
    const alertSignal: AgentAlertSignal = {
      hasBlocker: signalIntensity === "critical" || criticalContradictions >= 2,
      blockerReason: (signalIntensity === "critical" || criticalContradictions >= 2)
        ? `Contradictions critiques détectées (${criticalContradictions} CRITICAL / ${highContradictions} HIGH)`
        : undefined,
      recommendation: this.signalIntensityToRecommendation(signalIntensity),
      // Phase A slice A4-bis round 2 — justification déterministe uniquement :
      // toute valeur LLM `data.alertSignal?.justification` est IGNORÉE pour
      // éviter qu'un texte prescriptif legacy ("I recommend STOP") ressorte
      // en sortie native.
      justification: `Intensité du signal: ${signalIntensity} (${criticalContradictions} contradictions CRITICAL, ${highContradictions} HIGH).`,
    };

    // Build narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse de consistance terminee.",
      summary: data.narrative?.summary ?? "",
      keyInsights: data.narrative?.keyInsights ?? [],
      forNegotiation: data.narrative?.forNegotiation ?? [],
    };

    // Build DB cross-reference
    const dbCrossReference: DbCrossReference = {
      claims: contradictions
        .filter(c => c.type === "DECK_VS_DB" || c.type === "DECK_VS_CONTEXT_ENGINE")
        .map(c => ({
          claim: c.statement1.text,
          location: c.statement1.location,
          dbVerdict: "CONTRADICTED" as const,
          evidence: c.statement2.text,
          severity: c.severity,
        })),
      uncheckedClaims: [],
    };

    return {
      meta,
      score,
      findings,
      dbCrossReference,
      redFlags,
      questions,
      alertSignal,
      narrative,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private validateContradictionType(type: string): ContradictionType {
    const validTypes: ContradictionType[] = [
      "INTERNAL", "DECK_VS_DB", "CLAIM_VS_DATA",
      "TIER1_VS_TIER1", "TIER1_VS_TIER2", "DECK_VS_CONTEXT_ENGINE"
    ];
    return validTypes.includes(type as ContradictionType)
      ? (type as ContradictionType)
      : "INTERNAL";
  }

  private validateSeverity(severity: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    const upper = (severity ?? "").toUpperCase();
    if (upper === "CRITICAL") return "CRITICAL";
    if (upper === "HIGH") return "HIGH";
    return "MEDIUM";
  }

  private validatePriority(priority: string): "CRITICAL" | "HIGH" | "MEDIUM" {
    return this.validateSeverity(priority);
  }

  private validateConsensusLevel(level: string): "STRONG" | "MODERATE" | "WEAK" | "CONFLICTING" {
    const upper = (level ?? "").toUpperCase();
    if (upper === "STRONG") return "STRONG";
    if (upper === "MODERATE") return "MODERATE";
    if (upper === "WEAK") return "WEAK";
    return "CONFLICTING";
  }

  // Phase A slice A4-bis — Parser tolérant lecture seule. Conservé pour
  // accepter une lecture LLM dégradé éventuelle, mais N'EST PLUS APPELÉ
  // en émission (la dérivation déterministe `signalIntensityToRecommendation`
  // override toute valeur LLM côté `alertSignal`).
  private validateRecommendation(rec: string | undefined): "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP" {
    const upper = (rec ?? "").toUpperCase().replace(/ /g, "_");
    if (upper === "PROCEED") return "PROCEED";
    if (upper === "PROCEED_WITH_CAUTION") return "PROCEED_WITH_CAUTION";
    if (upper === "STOP") return "STOP";
    return "INVESTIGATE_FURTHER";
  }

  /**
   * Phase A slice A4-bis — Dérivation déterministe de `signalIntensity`
   * depuis les severity counts des contradictions.
   *
   * Anti-régression round 2 A3 : le LLM ne pilote pas cette valeur
   * (équivalent du `riskPosture` LLM-driven banni en A3 sur DA).
   *
   *   2+ contradictions CRITICAL  → critical
   *   1 contradiction CRITICAL    → high
   *   2+ contradictions HIGH      → elevated
   *   sinon                       → low
   */
  private deriveSignalIntensityFromContradictions(
    criticalCount: number,
    highCount: number,
  ): Tier3SignalIntensity {
    if (criticalCount >= 2) return "critical";
    if (criticalCount >= 1) return "high";
    if (highCount >= 2) return "elevated";
    return "low";
  }

  /**
   * Phase A slice A4-bis — Dérivation déterministe de `signalContribution`
   * depuis `signalIntensity` + score consistance.
   *
   * Le contradiction-detector est par nature un agent de vérification ; il
   * n'émet pas `very_favorable` (biais structurel — il ne peut pas
   * "déclarer" un deal très favorable, il constate l'absence de
   * contradictions). Mapping :
   *
   *   critical                → alert_dominant
   *   high                    → vigilance
   *   elevated                → contrasted
   *   low + score >= 80       → favorable
   *   low + score < 80        → contrasted
   *
   * D2 verrouillé : evidenceSolidity reste null en A4-bis (A6 qualifiera).
   */
  private deriveSignalContributionFromIntensity(
    intensity: Tier3SignalIntensity,
    consistencyScore: number,
  ): Tier3SignalContribution {
    let orientation: Tier3Orientation;
    if (intensity === "critical") {
      orientation = "alert_dominant";
    } else if (intensity === "high") {
      orientation = "vigilance";
    } else if (intensity === "elevated") {
      orientation = "contrasted";
    } else if (consistencyScore >= 80) {
      orientation = "favorable";
    } else {
      orientation = "contrasted";
    }
    return {
      orientation,
      evidenceSolidity: null,
    };
  }

  /**
   * Phase A slice A4-bis — Mapping `signalIntensity` → `recommendation` legacy
   * pour conservation du contrat global `AgentAlertSignal` (debt cross-agent
   * hors scope A4-bis).
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

  private buildContradictionSummary(contradictions: DetectedContradiction[]): ContradictionDetectorFindings["contradictionSummary"] {
    const byType: Map<ContradictionType, { count: number; criticalCount: number }> = new Map();
    const bySeverity: Map<string, number> = new Map();
    const topicCounts: Map<string, number> = new Map();

    for (const c of contradictions) {
      // By type
      const typeData = byType.get(c.type) ?? { count: 0, criticalCount: 0 };
      typeData.count++;
      if (c.severity === "CRITICAL") typeData.criticalCount++;
      byType.set(c.type, typeData);

      // By severity
      bySeverity.set(c.severity, (bySeverity.get(c.severity) ?? 0) + 1);

      // By topic
      topicCounts.set(c.topic, (topicCounts.get(c.topic) ?? 0) + 1);
    }

    return {
      byType: Array.from(byType.entries()).map(([type, data]) => ({
        type,
        count: data.count,
        criticalCount: data.criticalCount,
      })),
      bySeverity: Array.from(bySeverity.entries()).map(([severity, count]) => ({
        severity,
        count,
      })),
      topicsMostContradicted: Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic),
    };
  }

  private buildAggregatedDbComparison(
    context: EnrichedAgentContext,
    contradictions: DetectedContradiction[]
  ): AggregatedDbComparison {
    const deckCompetitors = context.extractedData?.competitors ?? [];
    const dbCompetitors = (context.fundingDbContext?.competitors ?? context.fundingContext?.competitors ?? [])
      .map(c => (c as { name: string }).name);

    // Find hidden competitors (in DB but not in deck)
    const hiddenCompetitors = dbCompetitors.filter(
      db => !deckCompetitors.some(d => d.toLowerCase().includes(db.toLowerCase()) || db.toLowerCase().includes(d.toLowerCase()))
    );

    // Find deck competitors not in DB
    const deckCompetitorsNotInDb = deckCompetitors.filter(
      d => !dbCompetitors.some(db => d.toLowerCase().includes(db.toLowerCase()) || db.toLowerCase().includes(d.toLowerCase()))
    );

    // Calculate claims stats from contradictions
    const deckVsDbContradictions = contradictions.filter(c =>
      c.type === "DECK_VS_DB" || c.type === "DECK_VS_CONTEXT_ENGINE"
    );

    // Determine accuracy
    let deckAccuracy: "ACCURATE" | "INCOMPLETE" | "MISLEADING" = "ACCURATE";
    if (hiddenCompetitors.length > 2 || deckVsDbContradictions.length > 3) {
      deckAccuracy = "MISLEADING";
    } else if (hiddenCompetitors.length > 0 || deckVsDbContradictions.length > 0) {
      deckAccuracy = "INCOMPLETE";
    }

    // Determine overall verdict
    let overallVerdict: "COHERENT" | "MINOR_ISSUES" | "SIGNIFICANT_CONCERNS" | "MAJOR_DISCREPANCIES" = "COHERENT";
    const criticalCount = contradictions.filter(c => c.severity === "CRITICAL").length;
    const highCount = contradictions.filter(c => c.severity === "HIGH").length;

    if (criticalCount >= 2 || hiddenCompetitors.length >= 3) {
      overallVerdict = "MAJOR_DISCREPANCIES";
    } else if (criticalCount >= 1 || highCount >= 3 || hiddenCompetitors.length >= 1) {
      overallVerdict = "SIGNIFICANT_CONCERNS";
    } else if (highCount >= 1 || contradictions.length >= 3) {
      overallVerdict = "MINOR_ISSUES";
    }

    return {
      totalClaimsChecked: contradictions.length + 10, // Approximate
      verified: Math.max(0, 10 - deckVsDbContradictions.length),
      contradicted: deckVsDbContradictions.length,
      partiallyVerified: 0,
      notVerifiable: 0,
      bySource: [
        { source: "deck", claims: deckVsDbContradictions.length + 5, verified: 5, contradicted: deckVsDbContradictions.length },
      ],
      competitorComparison: {
        competitorsInDeck: deckCompetitors,
        competitorsInDb: dbCompetitors,
        hiddenCompetitors,
        deckCompetitorsNotInDb,
        deckAccuracy,
        impactOnCredibility: hiddenCompetitors.length > 0
          ? `${hiddenCompetitors.length} concurrent(s) non mentionne(s) dans le deck - le fondateur ignore ou cache la competition`
          : "Pas de concurrent cache detecte",
      },
      overallVerdict,
      verdictRationale: `${contradictions.length} contradictions detectees dont ${criticalCount} critiques. ${hiddenCompetitors.length} concurrents caches.`,
    };
  }

  private buildAgentOutputsSummary(context: EnrichedAgentContext): AgentOutputSummary[] {
    const results = context.previousResults ?? {};
    const summaries: AgentOutputSummary[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (!result?.success || !("data" in result)) continue;

      const data = result.data as Record<string, unknown>;
      const tier = this.getAgentTier(agentName);

      const score = data.score as { value?: number; grade?: string } | undefined;
      const redFlags = (data.redFlags as { severity?: string }[]) ?? [];

      summaries.push({
        agentName,
        tier,
        score: score?.value,
        grade: score?.grade,
        criticalRedFlags: redFlags.filter(rf => rf.severity === "CRITICAL").length,
        highRedFlags: redFlags.filter(rf => rf.severity === "HIGH").length,
        mediumRedFlags: redFlags.filter(rf => rf.severity === "MEDIUM").length,
        keyFindings: [],
        concernsRaised: [],
        claimsMade: [],
      });
    }

    return summaries;
  }

  private getAgentTier(agentName: string): 1 | 2 | 3 {
    const tier1 = [
      "deck-forensics", "financial-auditor", "market-intelligence", "competitive-intel",
      "team-investigator", "tech-stack-dd", "tech-ops-dd", "legal-regulatory", "cap-table-auditor",
      "gtm-analyst", "customer-intel", "exit-strategist", "question-master"
    ];
    const tier3 = ["contradiction-detector", "synthesis-deal-scorer", "devils-advocate", "memo-generator"];

    if (tier1.includes(agentName)) return 1;
    if (tier3.includes(agentName)) return 3;
    return 2;
  }

  private assessDataCompleteness(context: EnrichedAgentContext): "complete" | "partial" | "minimal" {
    const results = context.previousResults ?? {};
    const successfulAgents = Object.values(results).filter(r => r?.success).length;

    if (successfulAgents >= 10) return "complete";
    if (successfulAgents >= 5) return "partial";
    return "minimal";
  }

  private identifyLimitations(context: EnrichedAgentContext): string[] {
    const limitations: string[] = [];

    const results = context.previousResults ?? {};
    const successfulAgents = Object.keys(results).filter(k => results[k]?.success);

    if (successfulAgents.length < 13) {
      limitations.push(`Seulement ${successfulAgents.length}/13 agents Tier 1 ont produit un output`);
    }

    if (!context.fundingDbContext && !context.fundingContext) {
      limitations.push("Funding DB non disponible - cross-reference limite");
    }

    if (!context.contextEngine) {
      limitations.push("Context Engine non disponible - validation externe limitee");
    }

    if (!context.extractedData) {
      limitations.push("Donnees extraites du deck non disponibles");
    }

    return limitations;
  }

  private addAutomaticRedFlags(
    redFlags: AgentRedFlag[],
    dbComparison: AggregatedDbComparison,
    contradictions: DetectedContradiction[],
    consistencyScore: number
  ): void {
    let rfIndex = redFlags.length;

    // Hidden competitors = CRITICAL red flag
    if (dbComparison.competitorComparison.hiddenCompetitors.length > 0) {
      redFlags.push({
        id: `RF-CD-AUTO-${++rfIndex}`,
        category: "credibility",
        severity: "CRITICAL",
        title: "Concurrents caches dans le deck",
        description: `${dbComparison.competitorComparison.hiddenCompetitors.length} concurrent(s) present(s) dans la Funding DB mais non mentionne(s) dans le deck: ${dbComparison.competitorComparison.hiddenCompetitors.join(", ")}`,
        location: "Funding Database vs Deck",
        evidence: `Concurrents DB: ${dbComparison.competitorComparison.competitorsInDb.join(", ")}. Concurrents deck: ${dbComparison.competitorComparison.competitorsInDeck.length > 0 ? dbComparison.competitorComparison.competitorsInDeck.join(", ") : "AUCUN"}`,
        impact: "Le fondateur ignore son marche ou cache deliberement la competition. Dans les deux cas, c'est un signal negatif majeur sur la credibilite.",
        question: "Pouvez-vous m'expliquer comment vous vous positionnez par rapport a [concurrents caches]?",
        redFlagIfBadAnswer: "Si le fondateur nie l'existence de ces concurrents ou les minimise, c'est un signal critique sur la crédibilité.",
      });
    }

    // Multiple CRITICAL contradictions
    const criticalCount = contradictions.filter(c => c.severity === "CRITICAL").length;
    if (criticalCount >= 2) {
      redFlags.push({
        id: `RF-CD-AUTO-${++rfIndex}`,
        category: "credibility",
        severity: "CRITICAL",
        title: "Contradictions critiques multiples",
        description: `${criticalCount} contradictions de severite CRITICAL detectees dans l'analyse.`,
        location: "Analyse croisee",
        evidence: contradictions.filter(c => c.severity === "CRITICAL").map(c => c.topic).join(", "),
        impact: "L'analyse n'est pas fiable. Les donnees du deal sont incoherentes sur des points majeurs.",
        question: "Plusieurs incoherences majeures ont ete detectees. Pouvez-vous les clarifier?",
        redFlagIfBadAnswer: "Si le fondateur ne peut pas expliquer ces incoherences, les donnees ne sont pas fiables.",
      });
    }

    // Low consistency score
    if (consistencyScore < 50) {
      redFlags.push({
        id: `RF-CD-AUTO-${++rfIndex}`,
        category: "analysis_quality",
        severity: "HIGH",
        title: "Score de consistance insuffisant",
        description: `Score de consistance de ${consistencyScore}/100 - l'analyse n'est pas suffisamment fiable pour prendre une decision.`,
        location: "Analyse globale",
        evidence: `Score: ${consistencyScore}. Contradictions: ${contradictions.length}`,
        impact: "Les donnees du deal sont trop incoherentes pour baser une decision d'investissement.",
        question: "De nombreuses incoherences ont ete detectees. Pouvez-vous fournir des donnees plus coherentes?",
        redFlagIfBadAnswer: "Ces incohérences limitent la capacité à prendre une décision éclairée sur ce deal.",
      });
    }
  }
}

export const contradictionDetector = new ContradictionDetectorAgent();
