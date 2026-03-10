/**
 * HealthTech Expert Agent - TIER 2
 *
 * Expert sectoriel spécialisé dans:
 * - HealthTech / Digital Health
 * - MedTech / Medical Devices
 * - BioTech (early stage)
 * - Mental Health / Behavioral Health
 * - FemTech
 *
 * Standards: Big4 + Partner VC rigor
 * - Expertise FDA/CE regulatory pathways
 * - Clinical outcomes validation
 * - Reimbursement strategy assessment
 * - Provider adoption dynamics
 *
 * Cross-reference obligatoire avec Funding DB
 */

import { z } from "zod";
import type { AgentResult, EnrichedAgentContext } from "../types";
import {
  SectorExpertOutputSchema,
  type SectorExpertOutput,
  type SectorConfig,
  type SectorBenchmarkData,
} from "./base-sector-expert";
import type { SectorExpertResult, SectorExpertData } from "./types";
import {
  mapMaturity,
  mapAssessment,
  mapSeverity,
  mapCompetition,
  mapConsolidation,
  mapBarrier,
  mapCategory,
  mapPriority,
} from "./output-mapper";
import { HEALTHTECH_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// =============================================================================
// HEALTHTECH-SPECIFIC BENCHMARK DATA (Using Standards)
// =============================================================================

/**
 * Extended HealthTech benchmarks using STANDARDS (norms certaines)
 * Les percentiles et données marché sont recherchés en ligne.
 */
export const HEALTHTECH_BENCHMARKS = {
  // Core formulas and rules from standards
  unitEconomicsFormulas: HEALTHTECH_STANDARDS.unitEconomicsFormulas,
  redFlagRules: HEALTHTECH_STANDARDS.redFlagRules,
  sectorSpecificRisks: HEALTHTECH_STANDARDS.sectorRisks,
  sectorSuccessPatterns: HEALTHTECH_STANDARDS.successPatterns,
  typicalAcquirers: HEALTHTECH_STANDARDS.typicalAcquirers,

  // Primary and secondary metrics (norms only, no percentiles)
  primaryMetrics: HEALTHTECH_STANDARDS.primaryMetrics,
  secondaryMetrics: HEALTHTECH_STANDARDS.secondaryMetrics,

  // Exit multiples - to be searched online
  exitMultiples: {
    low: "4-6",
    median: "8-12",
    high: "15-20",
    topDecile: "30+",
    typicalAcquirers: HEALTHTECH_STANDARDS.typicalAcquirers,
    recentExits: [
      { company: "Livongo", acquirer: "Teladoc", multiple: "18.5x", year: 2020 },
      { company: "One Medical", acquirer: "Amazon", multiple: "6x", year: 2023 },
      { company: "Signify Health", acquirer: "CVS Health", multiple: "7x", year: 2022 },
    ],
    note: "⚠️ Rechercher en ligne: 'healthtech digital health acquisition multiples 2024' pour données actuelles",
  },

  // Helper to get formatted standards
  getFormattedStandards: (stage: string = "SEED") => {
    return getStandardsOnlyInjection("HealthTech", stage);
  },
};

// =============================================================================
// HEALTHTECH-SPECIFIC CONFIG
// =============================================================================

const HEALTHTECH_CONFIG: SectorConfig = {
  name: "HealthTech",
  emoji: "🏥",
  displayName: "HealthTech Expert",
  description:
    "Expert in healthcare technology, digital health, medical devices, telehealth, and clinical software",

  // HEALTHTECH_BENCHMARKS uses standards from sector-standards.ts
  // Cast to SectorBenchmarkData as the structures are compatible for our use case
  benchmarkData: HEALTHTECH_BENCHMARKS as unknown as SectorBenchmarkData,

  scoringWeights: {
    metricsWeight: 0.30, // Clinical outcomes, patient volume, retention
    unitEconomicsWeight: 0.25, // LTV/CAC, revenue per patient, margins
    competitiveWeight: 0.15, // vs other digital health players
    timingWeight: 0.15, // Regulatory timing, reimbursement landscape
    teamFitWeight: 0.15, // Clinical + tech expertise, regulatory experience
  },
};

// =============================================================================
// HEALTHTECH-SPECIFIC REGULATIONS DATABASE
// =============================================================================

const HEALTHTECH_REGULATIONS = {
  fda: {
    pathways: [
      {
        name: "510(k) Clearance",
        description: "Substantial equivalence to predicate device",
        timeline: "3-12 months",
        cost: "$10K-$100K",
        applicability: "Most medical devices, SaMD Class II",
      },
      {
        name: "De Novo Classification",
        description: "Novel low-to-moderate risk devices without predicate",
        timeline: "6-12 months",
        cost: "$50K-$150K",
        applicability: "New device types, AI/ML diagnostics",
      },
      {
        name: "PMA (Premarket Approval)",
        description: "Full clinical trials for high-risk devices",
        timeline: "1-3 years",
        cost: "$500K-$5M+",
        applicability: "Class III devices, life-sustaining",
      },
      {
        name: "Breakthrough Device Designation",
        description: "Expedited review for breakthrough technology",
        timeline: "Reduces review by 30-50%",
        cost: "Expedited fee",
        applicability: "Novel devices for life-threatening conditions",
      },
    ],
    samdClassification: {
      classI: "Low risk - General wellness, lifestyle",
      classII: "Moderate risk - Most digital health, diagnostics",
      classIII: "High risk - Treatment recommendations, implantables",
    },
  },
  hipaa: {
    requirements: [
      "Business Associate Agreements (BAA) with all vendors",
      "PHI encryption at rest and in transit (AES-256)",
      "Access controls and audit logging",
      "Breach notification within 60 days",
      "Employee training and policies",
      "Risk assessments annually",
    ],
    penalties: "Up to $1.5M per violation category per year",
  },
  international: {
    ceMarking: "Required for EU medical devices (MDR 2017/745)",
    gdpr: "Health data = special category, explicit consent required",
    ukca: "Post-Brexit UK equivalent of CE marking",
  },
  reimbursement: {
    cptCodes: {
      rpm: ["99453", "99454", "99457", "99458"],
      telehealth: ["99201-99215 (with GT/95 modifier)"],
      ccm: ["99490", "99491"],
      behavioralHealth: ["90832", "90834", "90837"],
    },
    valueBasedModels: [
      "Shared savings",
      "Bundled payments",
      "Capitation",
      "Outcomes-based contracts",
    ],
  },
};

// =============================================================================
// HEALTHTECH-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildHealthTechPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = HEALTHTECH_BENCHMARKS;

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // Determine stage key for benchmarks
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_") as
    | "PRE_SEED"
    | "SEED"
    | "SERIES_A"
    | "SERIES_B";

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior HealthTech Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le secteur **HealthTech/Digital Health**, avec 15+ ans d'expérience en due diligence pour des fonds Tier 1 (a]6z Bio, GV Health, Andreessen Bio, General Catalyst Health).

## TON EXPERTISE SPÉCIFIQUE

### Regulatory & Compliance
- FDA pathways: 510(k), De Novo, PMA, Breakthrough Device
- Software as Medical Device (SaMD) classification IEC 62304
- HIPAA compliance architecture et audits
- International: CE marking (MDR), UKCA, Health Canada
- State telehealth regulations et licensure

### Clinical & Outcomes
- Clinical trial design et RWE (Real-World Evidence)
- Outcome metrics validation et statistical significance
- Value-based care models et risk-sharing contracts
- Clinical workflow integration (Epic, Cerner, Meditech)
- Provider change management et adoption strategies

### Business Models HealthTech
- B2B2C (employer/payer → patient)
- Direct-to-Consumer (D2C telehealth)
- Enterprise health system sales
- Pharmacy/PBM partnerships
- Value-based contracts et outcomes guarantees

### Exit Landscape
- Strategic acquirers: UnitedHealth/Optum, CVS/Aetna, Teladoc, Pharma
- Recent M&A multiples et deal structures
- IPO window et public market comparables

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "L'adoption providers est bonne"
- ✅ "Provider adoption rate de 45% après 12 mois, P70 vs sector median de 30% (source: AMA Digital Health Survey 2024)"

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark HealthTech violée
4. **Impact quantifié**: implication business/regulatory/clinical
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: Cross-référence obligatoire
- Compare chaque métrique aux concurrents HealthTech de la Funding DB
- Valide le regulatory pathway vs deals similaires
- Positionne la valorisation vs autres digital health du même stage

---

## BENCHMARKS HEALTHTECH (Stage: ${stage})

${getStandardsOnlyInjection("HealthTech", stage)}

⚠️ **RECHERCHE EN LIGNE REQUISE**: Pour les percentiles et données de marché actuels, effectuer une recherche web avec les queries suggérées dans les standards ci-dessus.

---

## REGULATORY PATHWAYS FDA

### Device Classification
- **Class I** (Low risk): General wellness apps, lifestyle tracking
- **Class II** (Moderate risk): Most digital health, diagnostics, SaMD → **510(k) required**
- **Class III** (High risk): Treatment decisions, implantables → **PMA required**

### Pathways & Timeline
| Pathway | Timeline | Cost | Use Case |
|---------|----------|------|----------|
| 510(k) | 3-12 mois | $10K-100K | Predicate device exists |
| De Novo | 6-12 mois | $50K-150K | Novel low-moderate risk |
| PMA | 1-3 ans | $500K-5M+ | High risk, clinical trials |
| Breakthrough | -30-50% timeline | Expedited | Life-threatening condition innovation |

---

## REIMBURSEMENT CODES

### Remote Patient Monitoring (RPM)
- 99453: Initial setup & patient education ($19-21)
- 99454: Device supply with daily monitoring ($50-63/month)
- 99457: First 20 min clinical staff time ($48-51)
- 99458: Additional 20 min ($38-42)

### Chronic Care Management (CCM)
- 99490: First 20 min/month ($42-48)
- 99491: Additional 30 min ($73-83)

**Sans CPT codes = out-of-pocket only = TAM limité de 60-70%**

---

## EXIT LANDSCAPE HEALTHTECH

**Acquéreurs Typiques:**
${HEALTHTECH_STANDARDS.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Exits Récents (historique):**
- Livongo → Teladoc à 18.5x (2020)
- One Medical → Amazon à 6x (2023)
- Signify Health → CVS Health à 7x (2022)

⚠️ **EXIT MULTIPLES**: Rechercher en ligne "healthtech digital health acquisition multiples 2024" pour données actuelles.

---

## SECTOR SUCCESS PATTERNS
${HEALTHTECH_STANDARDS.successPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${HEALTHTECH_STANDARDS.sectorRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques cliniques/business**: ${HEALTHTECH_CONFIG.scoringWeights.metricsWeight * 100}%
- **Unit economics**: ${HEALTHTECH_CONFIG.scoringWeights.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel**: ${HEALTHTECH_CONFIG.scoringWeights.competitiveWeight * 100}%
- **Timing réglementaire/marché**: ${HEALTHTECH_CONFIG.scoringWeights.timingWeight * 100}%
- **Team fit (clinical + tech)**: ${HEALTHTECH_CONFIG.scoringWeights.teamFitWeight * 100}%

**Grille:**
- 80-100: Clinical outcomes prouvés, FDA cleared, CPT codes, NRR > 115%, team A+
- 60-79: Outcomes en cours validation, pathway clair, métriques P50+, pas de red flag critique
- 40-59: Outcomes préliminaires, regulatory incertain, quelques métriques sous benchmark
- 20-39: Pas d'outcomes prouvés, red flags high, unit economics faibles
- 0-19: Red flags critiques, pas de pathway FDA, economics cassés

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const previousResults = context.previousResults ?? null;

  // Extract relevant info from previous Tier 1 results (selective, not raw JSON dump)
  let tier1Insights = "";
  if (previousResults) {
    const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
    if (financialAudit?.success && financialAudit.data) {
      tier1Insights += `\n### Financial Auditor Findings:\n`;
      if (financialAudit.data.narrative?.keyInsights) {
        tier1Insights += financialAudit.data.narrative.keyInsights.join("\n- ");
      }
      if (financialAudit.data.findings) {
        tier1Insights += `\nFindings: ${JSON.stringify(financialAudit.data.findings, null, 2).slice(0, 2000)}...`;
      }
    }

    const competitiveIntel = previousResults["competitive-intel"] as { success?: boolean; data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } } } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) {
        tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      }
      if (competitiveIntel.data.findings?.competitors) {
        tier1Insights += `\nCompetitors identified: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
      }
    }

    const legalRegulatory = previousResults["legal-regulatory"] as { success?: boolean; data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } } } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) {
        tier1Insights += `Compliance areas: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      }
      if (legalRegulatory.data.findings?.regulatoryRisks) {
        tier1Insights += `\nRegulatory risks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
      }
    }

    const extractor = previousResults["document-extractor"] as { success?: boolean; data?: { extractedInfo?: Record<string, unknown> } } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) {
      tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
    }
  }

  // Funding DB data for cross-reference
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE

Tu DOIS produire un champ "dbCrossReference" dans ton output.

### Concurrents detectes dans la DB
${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun concurrent detecte dans la DB"}

### Benchmark valorisation
${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "Pas de benchmark disponible"}

### Tendance funding secteur
${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "Pas de tendance disponible"}

INSTRUCTIONS DB:
1. Chaque claim du deck concernant le marche/concurrence DOIT etre verifie vs ces donnees
2. Les concurrents DB absents du deck = RED FLAG CRITICAL
3. Positionner la valorisation vs percentiles (P25/median/P75)
4. Si le deck dit "pas de concurrent" mais la DB en trouve = RED FLAG CRITICAL`;
  }

  const userPrompt = `# ANALYSE SECTORIELLE HEALTHTECH

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "HealthTech (à confirmer)"}
**Sub-sector:** ${deal.sector ?? "À déterminer (Digital Health, MedTech, Telehealth, etc.)"}
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non spécifié"}
**Valorisation demandée:** ${deal.valuationPre != null ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non spécifiée"}
**Montant levé:** ${deal.amountRequested != null ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non spécifié"}

---

## DONNÉES EXTRAITES DU DECK
${context.extractedData ? JSON.stringify(context.extractedData, null, 2) : "Pas de données extraites disponibles"}

---

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ''}

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

---

## DONNÉES FUNDING DB (Concurrents HealthTech)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents HealthTech identifiés dans la DB:**
${dbCompetitors
  .slice(0, 15)
  .map(
    (c: {
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
      subSector?: string;
    }) =>
      `- **${c.name}**: ${c.totalFunding ? `${(c.totalFunding / 1_000_000).toFixed(1)}M€ levés` : "funding inconnu"}, ${c.lastRound ?? "stage inconnu"}, ${c.subSector ?? ""}, ${c.status ?? ""}`
  )
  .join("\n")}
`
    : "Pas de données concurrentielles HealthTech disponibles dans la DB - SIGNALER ce gap de données"
}

${
  dbBenchmarks
    ? `
**Benchmarks sectoriels de la DB:**
${JSON.stringify(dbBenchmarks, null, 2)}
`
    : ""
}

---

${fundingDbData}

---

## TA MISSION

### 1. SECTOR FIT ASSESSMENT
- Ce deal est-il vraiment HealthTech? (Digital Health, MedTech, Telehealth, BioTech?)
- Sub-sector précis: chronic care management, mental health, diagnostics, telehealth, etc.?
- Maturité du sous-secteur: emerging, growth, mature, consolidating?
- Timing d'entrée: early mover, right time, late entrant?
- Score de fit avec justification

### 2. CLINICAL OUTCOMES ANALYSIS (CRITICAL)
Pour chaque outcome claim du deck:
- L'amélioration est-elle statistiquement significative?
- La méthodologie est-elle valide (RCT, RWE, cohort study)?
- Nombre de patients dans l'étude?
- Peer-reviewed ou white paper interne?
- Compare vs outcomes claims des concurrents DB

### 3. REGULATORY PATHWAY ASSESSMENT
- Quel pathway FDA applicable? (510(k), De Novo, PMA, exempt?)
- Statut actuel: cleared, submitted, pre-submission, nothing?
- Timeline et coût estimé pour clearance?
- CE marking / international considerations?
- HIPAA compliance architecture validée?
- Risks réglementaires spécifiques?

### 4. REIMBURSEMENT STRATEGY
- CPT codes applicables?
- Statut: codes existants, sous application, aucun pathway?
- Value-based contracts en place ou en négociation?
- Impact sur TAM si pas de reimbursement?
- Compare vs strategy des concurrents qui ont réussi

### 5. METRICS vs BENCHMARKS
Pour chaque KPI disponible:
- Extrais la valeur du deal
- Compare aux benchmarks ${stage} fournis
- Calcule le percentile exact
- Assessment: exceptional → critical
- Note spécifiquement pour HealthTech pourquoi ça compte

### 6. PROVIDER ADOPTION & SALES CYCLE
- Taux d'adoption providers actuel?
- Sales cycle moyen observé?
- Intégration EHR: Epic/Cerner certifiés?
- Stratégie d'implementation et change management?
- Comparaison vs sales cycles typiques du sub-sector

### 7. RED FLAGS SECTORIELS
Applique les red flag rules HealthTech.
Pour chaque violation:
- Cite la preuve exacte
- Référence le seuil violé
- Quantifie l'impact (regulatory, commercial, clinical)
- Propose la question de validation
- Path de mitigation si le deal proceed quand même

### 8. UNIT ECONOMICS HEALTHTECH
Calcule (voir formules dans les standards ci-dessus):
- Revenue per Patient: Total Revenue / Active Patients
- Cost per Improved Outcome: Total Costs / Patients with Measurable Improvement
- Implementation ROI: (Cost Savings - Implementation Cost) / Implementation Cost
- Patient LTV: ARPU × Gross Margin × (1 / Churn Rate)
- LTV/CAC ratio: Patient LTV / Customer Acquisition Cost

### 9. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui est le leader? Métriques comparatives?
- Position vs concurrent médian
- Gap de funding vs concurrents au même stage
- Qui a réussi le regulatory et comment?

### 10. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables pour ce type de deal?
- Multiple attendu basé sur comparables?
- Timeline typique to exit?
- IPO viability?

### 11. KILLER QUESTIONS HEALTHTECH
Génère 6-8 questions spécifiques:
- Au moins 2 sur clinical outcomes / regulatory
- Au moins 2 sur reimbursement / payer strategy
- Au moins 2 sur provider adoption / sales
- Avec good answer et red flag answer pour chaque

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- Métriques sous-benchmark
- Regulatory uncertainty
- Reimbursement gaps
- Comparaison valorisation vs deals HealthTech DB
- Clinical evidence gaps

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves)
- Top 3 concerns (avec preuves)
- Implication claire pour la décision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **HEALTHTECH-SPECIFIC**: Toujours évaluer regulatory pathway, clinical outcomes, et reimbursement strategy
⚠️ **JAMAIS de phrases vagues** - Chaque point sourcé et quantifié
⚠️ **CROSS-REFERENCE** - Compare aux concurrents HealthTech de la DB
⚠️ **ACTIONNABLE** - Questions et nego ammo utilisables immédiatement
⚠️ **FDA/HIPAA** - Évalue systématiquement les risques compliance

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// AGENT EXPORT
// =============================================================================

export interface HealthTechExpertResult extends AgentResult {
  agentName: "healthtech-expert";
  data: SectorExpertOutput | null;
}

export const healthtechExpert = {
  name: "healthtech-expert" as const,
  tier: 2 as const,
  emoji: "🏥",
  displayName: "HealthTech Expert",

  // Activation condition
  activationSectors: [
    "HealthTech",
    "MedTech",
    "BioTech",
    "Healthcare",
    "Digital Health",
    "FemTech",
    "Mental Health",
    "Telehealth",
    "Health Tech",
    "Medical Device",
    "Clinical",
  ],

  // Config
  config: HEALTHTECH_CONFIG,

  // Prompt builder
  buildPrompt: buildHealthTechPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: HEALTHTECH_BENCHMARKS,

  // Regulations reference
  regulations: HEALTHTECH_REGULATIONS,

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return healthtechExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedHealthTechData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildHealthTechPrompt(context);
      // Anti-Hallucination Directive — Citation Demand (Prompt 3/5)
      const citationDemand = "\n\n## Anti-Hallucination Directive — Citation Demand\nFor every factual claim in your response:\n1. Cite a specific, verifiable source (name, publication, date)\n2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true\n3. If you are relying on general training data rather than a specific source, say so explicitly\nDo not present unverified information as established fact.\n";
      const structuredUncertainty = "\n\n## Anti-Hallucination Directive — Structured Uncertainty\nStructure your response in three clearly labelled sections:\n**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)\n**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)\n**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)\nEvery claim must be placed in one of these three categories.\nDo not present speculative claims as confident ones.\n";
      setAgentContext("healthtech-expert");

      const response = await complete(user, {
        systemPrompt: system + citationDemand + structuredUncertainty,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse JSON from response
      const parsedOutput = JSON.parse(extractFirstJSON(response.content)) as SectorExpertOutput;

      // -- Data completeness assessment & score capping --
      const completenessData = parsedOutput.dataCompleteness ?? {
        level: "partial" as const,
        availableDataPoints: 0,
        expectedDataPoints: 0,
        missingCritical: [],
        limitations: [],
      };

      const availableMetrics = (parsedOutput.metricsAnalysis ?? []).filter((m: { metricValue: unknown }) => m.metricValue !== null).length;
      const totalMetrics = (parsedOutput.metricsAnalysis ?? []).length;
      let completenessLevel = completenessData.level;
      if (totalMetrics > 0 && !parsedOutput.dataCompleteness) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = "minimal";
        else if (ratio < 0.7) completenessLevel = "partial";
        else completenessLevel = "complete";
      }

      let scoreMax = 100;
      if (completenessLevel === "minimal") scoreMax = 50;
      else if (completenessLevel === "partial") scoreMax = 70;

      const rawScore = parsedOutput.executiveSummary?.sectorScore ?? parsedOutput.sectorFit?.score ?? 0;
      const cappedScore = Math.min(rawScore, scoreMax);

      const rawFitScore = parsedOutput.sectorFit?.score ?? 0;
      const cappedFitScore = Math.min(rawFitScore, scoreMax);

      const limitations: string[] = [
        ...(completenessData.limitations ?? []),
        ...(completenessData.missingCritical ?? []).map((m: string) => `Missing critical data: ${m}`),
      ];
      if (cappedScore < rawScore) {
        limitations.push(`Score capped from ${rawScore} to ${cappedScore} due to ${completenessLevel} data completeness`);
      }

      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: "HealthTech",
        sectorMaturity: mapMaturity(parsedOutput.sectorFit?.sectorMaturity),
        keyMetrics: parsedOutput.metricsAnalysis?.map(m => ({
          metricName: m.metricName,
          value: m.percentile ?? null,
          sectorBenchmark: m.benchmark ?? { p25: 0, median: 0, p75: 0, topDecile: 0 },
          assessment: mapAssessment(m.assessment),
          sectorContext: m.sectorContext ?? "",
        })) ?? [],
        sectorRedFlags: parsedOutput.sectorRedFlags?.map(rf => ({
          flag: rf.flag,
          severity: mapSeverity(rf.severity),
          sectorReason: rf.sectorThreshold ?? "",
        })) ?? [],
        sectorOpportunities: parsedOutput.sectorOpportunities?.map(o => ({
          opportunity: o.opportunity,
          potential: o.potential as "high" | "medium" | "low",
          reasoning: o.sectorContext ?? "",
        })) ?? [],
        regulatoryEnvironment: {
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "high",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? ["FDA", "HIPAA", "CE Mark"],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 8,
          recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) ?? [],
        },
        sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
          question: q.question,
          category: q.category as "technical" | "business" | "regulatory" | "competitive" ?? "regulatory",
          priority: q.priority as "must_ask" | "should_ask" | "nice_to_have",
          expectedAnswer: q.goodAnswer ?? "",
          redFlagAnswer: q.redFlagAnswer ?? "",
        })) ?? [],
        sectorFit: {
          score: cappedFitScore,
          strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
          weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
          sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                        parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: cappedScore,
        executiveSummary: parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "healthtech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          subSector: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("subsector"))?.metricValue as string ?? null,
          regulatoryPathway: {
            fdaStatus: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations?.includes("FDA") ? "required" : "not_required",
            ceMarkStatus: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations?.includes("CE") ? "required" : "not_required",
            hipaaCompliance: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations?.includes("HIPAA") ? "required" : "not_required",
            regulatoryTimeline: null,
            approvalProbability: null,
          },
          clinicalValidation: {
            hasClincalData: parsedOutput.metricsAnalysis?.some(m => m.metricName.toLowerCase().includes("clinical")) ?? false,
            outcomeMetrics: parsedOutput.metricsAnalysis?.filter(m =>
              m.metricName.toLowerCase().includes("outcome") ||
              m.metricName.toLowerCase().includes("efficacy") ||
              m.metricName.toLowerCase().includes("patient")
            ) ?? [],
          },
          reimbursementStrategy: {
            model: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("reimbursement"))?.metricValue as string ?? null,
            payerCoverage: null,
            cptCode: null,
          },
          providerAdoption: {
            currentProviders: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("provider"))?.metricValue as number ?? null,
            adoptionRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("adoption"))?.metricValue as number ?? null,
            integrationComplexity: null,
          },
          patientMetrics: {
            activePatients: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("patient") && m.metricName.toLowerCase().includes("active"))?.metricValue as number ?? null,
            patientRetention: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("retention"))?.metricValue as number ?? null,
            patientSatisfaction: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("nps") || m.metricName.toLowerCase().includes("satisfaction"))?.metricValue as number ?? null,
          },
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          potentialAcquirers: HEALTHTECH_BENCHMARKS.typicalAcquirers ?? [],
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("regulatory") ||
            rf.flag.toLowerCase().includes("fda") ||
            rf.flag.toLowerCase().includes("reimbursement") ||
            rf.flag.toLowerCase().includes("clinical") ||
            rf.flag.toLowerCase().includes("hipaa")
          ) ?? [],
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
          dbCrossReference: parsedOutput.dbCrossReference,
          dataCompleteness: {
            level: completenessLevel,
            availableDataPoints: completenessData.availableDataPoints ?? availableMetrics,
            expectedDataPoints: completenessData.expectedDataPoints ?? totalMetrics,
            missingCritical: completenessData.missingCritical ?? [],
            limitations,
            scoreCapped: cappedScore < rawScore,
            rawScore,
            cappedScore,
          },
        },
      } as unknown as SectorExpertResult & { _extended: ExtendedHealthTechData };

    } catch (error) {
      console.error("[healthtech-expert] Execution error:", error);
      return {
        agentName: "healthtech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultHealthTechData(),
      };
    }
  },
};

// Extended data type for HealthTech Expert UI wow effect
interface ExtendedHealthTechData {
  subSector: string | null;
  regulatoryPathway: {
    fdaStatus: string;
    ceMarkStatus: string;
    hipaaCompliance: string;
    regulatoryTimeline: string | null;
    approvalProbability: number | null;
  };
  clinicalValidation: {
    hasClincalData: boolean;
    outcomeMetrics: unknown[];
  };
  reimbursementStrategy: {
    model: string | null;
    payerCoverage: string | null;
    cptCode: string | null;
  };
  providerAdoption: {
    currentProviders: number | null;
    adoptionRate: number | null;
    integrationComplexity: string | null;
  };
  patientMetrics: {
    activePatients: number | null;
    patientRetention: number | null;
    patientSatisfaction: number | null;
  };
  exitLandscape: unknown;
  potentialAcquirers: string[];
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  fullMetricsAnalysis: unknown[];
  dbCrossReference?: {
    claims: Array<{ claim: string; location: string; dbVerdict: string; evidence: string; severity?: string }>;
    hiddenCompetitors: string[];
    valuationPercentile?: number;
    competitorComparison?: unknown;
  };
  dataCompleteness?: {
    level: "complete" | "partial" | "minimal";
    availableDataPoints: number;
    expectedDataPoints: number;
    missingCritical: string[];
    limitations: string[];
    scoreCapped: boolean;
    rawScore: number;
    cappedScore: number;
  };
}

// Default data for error fallback
function getDefaultHealthTechData(): SectorExpertData {
  return {
    sectorName: "HealthTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full healthtech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["FDA", "HIPAA", "CE Mark", "GDPR"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 8,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your regulatory pathway and current FDA/CE status?",
        category: "regulatory",
        priority: "must_ask",
        expectedAnswer: "Clear pathway with timeline and milestones",
        redFlagAnswer: "No regulatory strategy or unclear requirements",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "HealthTech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default healthtechExpert;
