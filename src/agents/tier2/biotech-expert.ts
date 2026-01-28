/**
 * BioTech Expert Agent - TIER 2
 *
 * Expert sectoriel specialise dans:
 * - BioTech / Life Sciences
 * - Drug Discovery / Therapeutics
 * - Pharma / Biopharma
 * - Gene Therapy / Cell Therapy
 * - Diagnostics (clinical-grade)
 *
 * Standards: Big4 + Partner VC rigor
 * - FDA clinical development phases (I, II, III, NDA/BLA)
 * - Pipeline valuation (rNPV methodology)
 * - IP / Patent strategy assessment
 * - Clinical trial design & execution
 * - Regulatory pathway analysis
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
import { BIOTECH_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// =============================================================================
// BIOTECH-SPECIFIC BENCHMARK DATA (Using Standards)
// =============================================================================

/**
 * Extended BioTech benchmarks using STANDARDS (norms certaines)
 * Les percentiles et donnees marche sont recherches en ligne.
 */
export const BIOTECH_BENCHMARKS = {
  // Core formulas and rules from standards
  unitEconomicsFormulas: BIOTECH_STANDARDS.unitEconomicsFormulas,
  redFlagRules: BIOTECH_STANDARDS.redFlagRules,
  sectorSpecificRisks: BIOTECH_STANDARDS.sectorRisks,
  sectorSuccessPatterns: BIOTECH_STANDARDS.successPatterns,
  typicalAcquirers: BIOTECH_STANDARDS.typicalAcquirers,

  // Primary and secondary metrics (norms only, no percentiles)
  primaryMetrics: BIOTECH_STANDARDS.primaryMetrics,
  secondaryMetrics: BIOTECH_STANDARDS.secondaryMetrics,

  // Clinical success probabilities by phase (well-established industry data)
  clinicalSuccessRates: {
    preclinicalToPhase1: 0.10, // ~10% enter Phase I
    phase1ToPhase2: 0.50, // ~50% advance
    phase2ToPhase3: 0.30, // ~30% advance (the valley of death)
    phase3ToApproval: 0.65, // ~65% get approved
    overallPreclinicalToApproval: 0.05, // ~5% overall
    overallPhase1ToApproval: 0.10, // ~10%
    overallPhase2ToApproval: 0.25, // ~25%
    overallPhase3ToApproval: 0.60, // ~60%
    source: "FDA/BIO/Tufts CSDD clinical development success rates analysis",
  },

  // Typical trial costs by phase (ranges, not exact)
  trialCostRanges: {
    phase1: { min: 2, max: 10, unit: "$M", duration: "6-18 months" },
    phase2: { min: 10, max: 50, unit: "$M", duration: "1-3 years" },
    phase3: { min: 50, max: 300, unit: "$M", duration: "2-4 years" },
    note: "Actual costs depend on therapeutic area, endpoints, patient population",
  },

  // Exit multiples - to be searched online
  exitMultiples: {
    preclinical: "0.5-2x invested capital (high risk)",
    phase1: "1-3x (early validation)",
    phase2: "2-5x (efficacy signal)",
    phase3: "3-8x (de-risked)",
    approved: "5-15x+ (commercial asset)",
    typicalAcquirers: BIOTECH_STANDARDS.typicalAcquirers,
    recentExits: [
      { company: "Seagen", acquirer: "Pfizer", value: "$43B", year: 2023, stage: "Commercial" },
      { company: "Prometheus Biosciences", acquirer: "Merck", value: "$10.8B", year: 2023, stage: "Phase II" },
      { company: "Horizon Therapeutics", acquirer: "Amgen", value: "$27.8B", year: 2023, stage: "Commercial" },
      { company: "Karuna Therapeutics", acquirer: "Bristol-Myers Squibb", value: "$14B", year: 2024, stage: "Phase III" },
    ],
    note: "Rechercher en ligne: 'biotech M&A multiples [current year]' pour donnees actuelles",
  },

  // Helper to get formatted standards
  getFormattedStandards: (stage: string = "SEED") => {
    return getStandardsOnlyInjection("BioTech", stage);
  },
};

// =============================================================================
// BIOTECH-SPECIFIC CONFIG
// =============================================================================

const BIOTECH_CONFIG: SectorConfig = {
  name: "BioTech",
  emoji: "🧬",
  displayName: "BioTech Expert",
  description:
    "Expert in biotechnology, drug discovery, clinical development, therapeutics, and life sciences",

  benchmarkData: BIOTECH_BENCHMARKS as unknown as SectorBenchmarkData,

  scoringWeights: {
    metricsWeight: 0.25, // Clinical phase, pipeline value, success probability
    unitEconomicsWeight: 0.20, // Cash runway, burn rate, financing capacity
    competitiveWeight: 0.15, // vs other biotech, differentiation, MoA
    timingWeight: 0.20, // Clinical timeline, regulatory timing, market window
    teamFitWeight: 0.20, // Clinical/scientific expertise, prior approvals, FDA experience
  },
};

// =============================================================================
// BIOTECH-SPECIFIC REGULATORY & CLINICAL DATABASE
// =============================================================================

const BIOTECH_REGULATORY = {
  fdaPathways: {
    nda: {
      name: "New Drug Application (NDA)",
      description: "For small molecule drugs",
      timeline: "10-12 months standard review, 6 months priority",
      requirements: "Complete clinical data package, CMC, labeling",
    },
    bla: {
      name: "Biologics License Application (BLA)",
      description: "For biologics (proteins, antibodies, gene/cell therapy)",
      timeline: "10-12 months standard, 6 months priority",
      requirements: "Clinical data, manufacturing process validation",
    },
    "510k": {
      name: "510(k) Clearance",
      description: "For diagnostic devices with predicate",
      timeline: "3-12 months",
      requirements: "Substantial equivalence to predicate device",
    },
    pma: {
      name: "Premarket Approval (PMA)",
      description: "For Class III medical devices",
      timeline: "1-3 years",
      requirements: "Clinical trials demonstrating safety & efficacy",
    },
  },

  specialDesignations: [
    {
      name: "Breakthrough Therapy",
      benefit: "Intensive FDA guidance, rolling review, potential expedited approval",
      criteria: "Preliminary evidence of substantial improvement over existing therapies",
      value: "Significantly increases deal value, signals clinical differentiation",
    },
    {
      name: "Fast Track",
      benefit: "More frequent FDA meetings, rolling review",
      criteria: "Serious condition + potential to address unmet need",
      value: "Accelerates timeline by 3-6 months typically",
    },
    {
      name: "Orphan Drug",
      benefit: "7 years market exclusivity, tax credits, fee waivers",
      criteria: "Disease affecting < 200,000 patients in US",
      value: "Major commercial advantage, premium pricing accepted",
    },
    {
      name: "Priority Review",
      benefit: "6-month review instead of 10-12 months",
      criteria: "Significant improvement in safety or efficacy",
      value: "Faster time to market",
    },
    {
      name: "Accelerated Approval",
      benefit: "Approval based on surrogate endpoints",
      criteria: "Serious condition, meaningful therapeutic benefit",
      value: "Earlier approval, post-marketing confirmatory required",
    },
    {
      name: "RMAT (Regenerative Medicine Advanced Therapy)",
      benefit: "Similar to Breakthrough + additional manufacturing flexibility",
      criteria: "Regenerative medicine for serious conditions",
      value: "Key for cell/gene therapy companies",
    },
  ],

  clinicalPhases: [
    {
      phase: "Preclinical",
      purpose: "Safety, PK/PD, efficacy in animal models",
      typicalDuration: "2-4 years",
      typicalCost: "$2-10M",
      successRate: "~10% proceed to Phase I",
      keyMilestones: ["IND-enabling studies", "Toxicology", "Formulation"],
    },
    {
      phase: "Phase I",
      purpose: "Safety, dosing, PK in humans (usually healthy volunteers)",
      typicalDuration: "6-18 months",
      typicalCost: "$2-10M",
      typicalPatients: "20-100",
      successRate: "~50% proceed to Phase II",
      keyMilestones: ["First-in-human dosing", "MTD determination", "PK profile"],
    },
    {
      phase: "Phase II",
      purpose: "Efficacy signal, optimal dose, safety in patients",
      typicalDuration: "1-3 years",
      typicalCost: "$10-50M",
      typicalPatients: "100-500",
      successRate: "~30% proceed to Phase III (Valley of Death)",
      keyMilestones: ["Efficacy readout", "Dose selection", "Biomarker validation"],
    },
    {
      phase: "Phase III",
      purpose: "Confirm efficacy & safety in large population",
      typicalDuration: "2-4 years",
      typicalCost: "$50-300M+",
      typicalPatients: "1000-5000+",
      successRate: "~60-70% proceed to approval",
      keyMilestones: ["Pivotal data", "NDA/BLA filing", "FDA review"],
    },
  ],

  therapeuticAreas: {
    oncology: {
      avgCost: "Higher (complex endpoints, long trials)",
      avgTimeline: "Faster (accelerated pathways common)",
      successRate: "Lower than average (~5-8% preclinical to approval)",
      premiumMultiple: "1.5-2x other areas",
    },
    rareDisease: {
      avgCost: "Lower (smaller trials)",
      avgTimeline: "Faster (orphan designation)",
      successRate: "Higher (~15-20% Phase I to approval)",
      premiumMultiple: "Premium pricing accepted",
    },
    cns: {
      avgCost: "Higher (complex endpoints)",
      avgTimeline: "Longer (disease modification hard to measure)",
      successRate: "Lowest (~3-5% preclinical to approval)",
      premiumMultiple: "Variable, high unmet need",
    },
    infectious: {
      avgCost: "Moderate",
      avgTimeline: "Variable (outbreak-dependent)",
      successRate: "Higher (~15-20% Phase I to approval)",
      premiumMultiple: "Volume-driven pricing",
    },
    autoimmune: {
      avgCost: "Moderate to high",
      avgTimeline: "Moderate",
      successRate: "Moderate (~10-12%)",
      premiumMultiple: "Large market opportunity",
    },
  },
};

// =============================================================================
// BIOTECH-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildBioTechPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior BioTech Due Diligence Expert

Tu es un **expert sectoriel senior** specialise dans le secteur **BioTech/Life Sciences**, avec 20+ ans d'experience en due diligence pour des fonds specialises (a16z Bio, Arch Venture Partners, OrbiMed, RA Capital, Flagship Pioneering).

## TON EXPERTISE SPECIFIQUE

### Clinical Development
- Evaluation des programmes cliniques Phase I/II/III
- Design d'essais cliniques et selection d'endpoints
- Interpretation des donnees cliniques et signaux d'efficacite
- Probabilites de succes par phase et aire therapeutique
- Valley of Death Phase II: pourquoi 70% echouent

### Regulatory Affairs
- Pathways FDA: IND, NDA, BLA, 510(k), PMA
- Designations speciales: Breakthrough, Fast Track, Orphan Drug, RMAT
- Interactions FDA: Pre-IND, End-of-Phase meetings
- Regulatory risk assessment
- International: EMA, PMDA, NMPA

### Science & Platform
- Evaluation de la science sous-jacente (MoA, target validation)
- Platform technologies vs single-asset plays
- Proprietary vs licensed technology
- Competitive differentiation scientifique
- Patent landscape et freedom-to-operate

### Valuation & Economics
- Risk-adjusted NPV (rNPV) methodology
- Pipeline valuation par phase
- Partnership economics (upfront, milestones, royalties)
- Comparables transactions
- Cash runway et financing strategy

### Team Assessment
- Experience en developpement clinique
- Track record d'approbations FDA
- Reseau KOLs et investigators
- CMO/CSO credibility
- Board et advisors scientifiques

---

## STANDARDS DE QUALITE (Big4 + Partner VC)

### REGLE ABSOLUE: Chaque affirmation doit etre sourcee
- ❌ "Le programme est prometteur"
- ✅ "Phase II data shows ORR 45% (n=89), vs SOC historical 28% (p<0.01). Si confirme en Phase III, differentiation cliniquement significative."

### REGLE ABSOLUE: Chaque red flag doit avoir
1. **Severite**: critical / high / medium
2. **Preuve**: le data point exact ou observation
3. **Seuil sectoriel**: la reference biotech violee
4. **Impact quantifie**: sur timeline, probabilite, valuation
5. **Question de validation**: pour le founder/CSO
6. **Path de mitigation**: ce qui resoudrait le concern

### REGLE ABSOLUE: Cross-reference obligatoire
- Compare aux concurrents biotech de la Funding DB
- Valide le competitive landscape vs deals similaires
- Positionne la valorisation vs autres biotech du meme stade

---

## CLINICAL SUCCESS RATES (INDUSTRY DATA)

| Transition | Success Rate | Source |
|------------|--------------|--------|
| Preclinical → Phase I | ~10% | FDA/BIO/Tufts CSDD |
| Phase I → Phase II | ~50% | |
| Phase II → Phase III | ~30% | (Valley of Death) |
| Phase III → Approval | ~60-70% | |
| Overall Preclinical → Approval | ~5% | |
| Overall Phase I → Approval | ~10% | |
| Overall Phase II → Approval | ~25% | |
| Overall Phase III → Approval | ~60% | |

**Par aire therapeutique:**
- Oncology: 5-8% overall (mais accelerated pathways)
- Rare Disease: 15-20% (orphan advantages)
- CNS: 3-5% (hardest area)
- Infectious: 15-20%

---

## FDA SPECIAL DESIGNATIONS

| Designation | Benefit | Value Impact |
|-------------|---------|--------------|
| **Breakthrough Therapy** | Intensive FDA guidance, rolling review | Major value inflection (+50-100% deal value) |
| **Fast Track** | More meetings, rolling review | +3-6 months faster |
| **Orphan Drug** | 7 years exclusivity, tax credits | Premium pricing, smaller trials |
| **Priority Review** | 6 vs 10-12 month review | Faster to market |
| **Accelerated Approval** | Surrogate endpoints | Earlier approval (with confirmatory) |
| **RMAT** | For cell/gene therapy | Manufacturing flexibility |

---

## TYPICAL TRIAL COSTS & TIMELINES

| Phase | Cost Range | Duration | Patients |
|-------|------------|----------|----------|
| Preclinical | $2-10M | 2-4 years | N/A |
| Phase I | $2-10M | 6-18 months | 20-100 |
| Phase II | $10-50M | 1-3 years | 100-500 |
| Phase III | $50-300M+ | 2-4 years | 1000-5000+ |

---

## PIPELINE VALUATION (rNPV)

**Risk-adjusted NPV Formula:**
rNPV = Sum of [ (Peak Sales × Margin × Patent Life) × P(Success) × Discount Factor ]

**Typical rNPV by Phase:**
- Preclinical: $10-50M (heavily discounted)
- Phase I: $30-100M
- Phase II (positive data): $100-500M
- Phase III (positive data): $500M-2B+
- Approved: Based on actual sales potential

---

## BIOTECH SECTOR STANDARDS

${getStandardsOnlyInjection("BioTech", stage)}

---

## RED FLAG RULES BIOTECH

- **CRITICAL**: Cash runway < 12 months → Emergency financing needed
- **CRITICAL**: < 5% overall success probability → Lottery ticket
- **CRITICAL**: No IND filed for "Phase I ready" company → Execution risk
- **MAJOR**: Patent life < 8 years at expected approval → Limited commercial window
- **MAJOR**: > 90% pipeline concentration in one asset → Binary risk
- **MAJOR**: No clinical/regulatory experience on team → Execution risk
- **MAJOR**: Phase II failure history on same target → Validates skepticism
- **MEDIUM**: No Breakthrough/Orphan designation in competitive space → Differentiation question

---

## SECTOR SUCCESS PATTERNS
${BIOTECH_STANDARDS.successPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${BIOTECH_STANDARDS.sectorRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## ACQUIRERS TYPIQUES
${BIOTECH_STANDARDS.typicalAcquirers.join(", ")}

**Recent M&A (reference):**
- Seagen → Pfizer $43B (2023) - Commercial ADC platform
- Prometheus → Merck $10.8B (2023) - Phase II IBD
- Horizon → Amgen $27.8B (2023) - Commercial rare disease
- Karuna → BMS $14B (2024) - Phase III CNS

---

## SCORING METHODOLOGY

Le score sectoriel (0-100):
- **Clinical stage & data quality**: ${BIOTECH_CONFIG.scoringWeights.metricsWeight * 100}%
- **Financial runway & economics**: ${BIOTECH_CONFIG.scoringWeights.unitEconomicsWeight * 100}%
- **Competitive differentiation**: ${BIOTECH_CONFIG.scoringWeights.competitiveWeight * 100}%
- **Timing (clinical, regulatory, market)**: ${BIOTECH_CONFIG.scoringWeights.timingWeight * 100}%
- **Team (clinical/scientific expertise)**: ${BIOTECH_CONFIG.scoringWeights.teamFitWeight * 100}%

**Grille:**
- 80-100: Phase II+ positive data, differentiated MoA, FDA designation, team avec approvals, 18+ mois runway
- 60-79: Phase I/II en cours, science solide, pathway clair, team credible, financement adequat
- 40-59: Preclinical avance, science prometteuse mais non validee, risques identifies mais manageables
- 20-39: Science early, equipe incomplete, financement serre, red flags majeurs
- 0-19: Red flags critiques, science non validee, pas de pathway clair

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des donnees concretes et sourcees, jamais de placeholders.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE BIOTECH

## DEAL A ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "BioTech (a confirmer)"}
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non specifie"}
**Valorisation demandee:** ${deal.valuationPre ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non specifiee"}
**Montant leve:** ${deal.amountRequested ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non specifie"}

---

## DONNEES EXTRAITES DU DECK
${context.extractedData ? JSON.stringify(context.extractedData, null, 2) : "Pas de donnees extraites disponibles"}

---

## RESULTATS DES AGENTS TIER 1
${
  context.previousResults
    ? Object.entries(context.previousResults)
        .filter(([, v]) => (v as { success?: boolean })?.success)
        .map(([k, v]) => `### ${k}\n${JSON.stringify((v as { data?: unknown })?.data, null, 2)}`)
        .join("\n\n")
    : "Pas de resultats Tier 1 disponibles"
}

---

## DONNEES FUNDING DB (Concurrents BioTech)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents BioTech identifies dans la DB:**
${dbCompetitors
  .slice(0, 15)
  .map(
    (c: {
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
      therapeuticArea?: string;
      clinicalPhase?: string;
    }) =>
      `- **${c.name}**: ${c.totalFunding ? `${(c.totalFunding / 1_000_000).toFixed(1)}M€ leves` : "funding inconnu"}, ${c.lastRound ?? "stage inconnu"}, ${c.therapeuticArea ?? ""}, ${c.clinicalPhase ?? ""}`
  )
  .join("\n")}
`
    : "Pas de donnees concurrentielles BioTech disponibles dans la DB - SIGNALER ce gap de donnees"
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

## TA MISSION

### 1. SECTOR FIT ASSESSMENT
- Ce deal est-il vraiment BioTech? (Drug Discovery, Therapeutics, Platform, Diagnostics?)
- Aire therapeutique: Oncology, Rare Disease, CNS, Autoimmune, Infectious, etc.?
- Modalite: Small molecule, Biologic, Gene therapy, Cell therapy, etc.?
- Platform vs Single-asset play?
- Score de fit avec justification

### 2. CLINICAL PROGRAM ASSESSMENT (CRITICAL)
Pour chaque programme clinique:
- Phase actuelle (Preclinical, Phase I, II, III)?
- Donnees disponibles: quels endpoints, quelle significance?
- Quality of data: RCT, open-label, historical control?
- Probabilite de succes basee sur phase + aire therapeutique + data quality
- Timeline to next value inflection
- Compare vs programmes similaires dans la DB

### 3. PIPELINE ANALYSIS
- Lead asset: phase, data, differentiation
- Pipeline breadth: nombre d'actifs, diversification
- Platform potential: extensibility a d'autres indications
- rNPV estimate (si donnees suffisantes)
- Pipeline concentration risk

### 4. REGULATORY PATHWAY ASSESSMENT
- Pathway FDA applicable: IND, NDA, BLA, 510(k)?
- Designations: Breakthrough, Fast Track, Orphan, RMAT?
- Interactions FDA: Pre-IND, EOP meetings, FDA guidance?
- Timeline to key regulatory milestones
- Risques regulatoires specifiques

### 5. IP & PATENT ANALYSIS
- Patent portfolio: composition of matter, methods, formulation?
- Patent life remaining at expected approval
- Freedom to operate
- IP strategy vs competitors
- Exclusivity strategies (Orphan, NCE, biologics)

### 6. TEAM & SCIENTIFIC CREDIBILITY
- CSO/CMO background: prior drug approvals?
- Clinical development experience
- Scientific advisory board quality
- KOL network
- Team gaps critiques

### 7. FINANCIAL ANALYSIS
- Current cash position
- Monthly burn rate
- Cash runway (CRITICAL)
- Financing strategy (runway to next inflection?)
- Dilution analysis si raise necessaire

### 8. COMPETITIVE LANDSCAPE
- Concurrents sur meme target/MoA?
- Differentiation scientifique
- Time-to-market vs competition
- Big Pharma activity in space
- Compare vs concurrents DB

### 9. RED FLAGS BIOTECH
Applique les red flag rules biotech.
Pour chaque violation:
- Cite la preuve exacte
- Reference le seuil viole
- Quantifie l'impact (timeline, probabilite, valuation)
- Propose la question de validation
- Path de mitigation

### 10. VALUATION ASSESSMENT
- Comment la valorisation se compare aux phases similaires?
- rNPV implicite du pipeline
- Comparables transactions (M&A, licensing)
- Valorisation vs DB biotech deals

### 11. KILLER QUESTIONS BIOTECH
Genere 6-8 questions specifiques:
- Au moins 2 sur clinical data / program
- Au moins 2 sur regulatory pathway / FDA interactions
- Au moins 2 sur IP / competitive
- Au moins 2 sur team / execution capability
- Avec good answer et red flag answer

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers bases sur:
- Clinical uncertainty / phase risk
- Regulatory pathway gaps
- IP concerns
- Cash runway pressure
- Comparables transactions dans la DB

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves)
- Top 3 concerns (avec preuves)
- Key question: "What needs to be true for this to be a good investment?"
- Implication pour la decision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **BIOTECH-SPECIFIC**: Binary risk - always assess probability of total loss
⚠️ **CLINICAL DATA**: Quality > quantity. What endpoints? Statistical significance?
⚠️ **CASH RUNWAY**: CRITICAL. Can they reach next value inflection?
⚠️ **TEAM**: Prior drug approvals matter more than degrees
⚠️ **TIMELINE**: Everything takes 2x longer and costs 2x more in biotech
⚠️ **CROSS-REFERENCE**: Compare aux concurrents biotech de la DB
⚠️ **NO HYPE**: "Promising" is meaningless. What does the data actually show?

Retourne un JSON valide avec toutes les sections completees.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// AGENT EXPORT
// =============================================================================

export interface BioTechExpertResult extends AgentResult {
  agentName: "biotech-expert";
  data: SectorExpertOutput | null;
}

export const biotechExpert = {
  name: "biotech-expert" as const,
  tier: 2 as const,
  emoji: "🧬",
  displayName: "BioTech Expert",

  // Activation condition
  activationSectors: [
    "BioTech",
    "Biotech",
    "Life Sciences",
    "Pharma",
    "Drug Discovery",
    "Therapeutics",
    "Biopharma",
    "Gene Therapy",
    "Cell Therapy",
    "Biologics",
    "Pharmaceuticals",
    "Oncology",
    "Immunotherapy",
  ],

  // Config
  config: BIOTECH_CONFIG,

  // Prompt builder
  buildPrompt: buildBioTechPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: BIOTECH_BENCHMARKS,

  // Regulatory reference
  regulatory: BIOTECH_REGULATORY,

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return biotechExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedBioTechData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildBioTechPrompt(context);
      setAgentContext("biotech-expert");

      const response = await complete(user, {
        systemPrompt: system,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsedOutput = JSON.parse(jsonMatch[0]) as SectorExpertOutput;

      // Helper to map sectorMaturity
      const mapMaturity = (m?: string): "emerging" | "growing" | "mature" | "declining" => {
        if (m === "growth") return "growing";
        if (m === "emerging" || m === "mature" || m === "declining" || m === "growing") return m;
        return "emerging";
      };

      // Helper to map assessment
      const mapAssessment = (a?: string): "exceptional" | "above_average" | "average" | "below_average" | "concerning" => {
        if (a === "critical") return "concerning";
        if (a === "exceptional" || a === "above_average" || a === "average" || a === "below_average" || a === "concerning") return a;
        return "average";
      };

      // Helper to map severity
      const mapSeverity = (s?: string): "critical" | "major" | "minor" => {
        if (s === "high") return "major";
        if (s === "medium") return "minor";
        if (s === "critical" || s === "major" || s === "minor") return s;
        return "minor";
      };

      // Helper to map competition intensity
      const mapCompetition = (c?: string): "low" | "medium" | "high" | "intense" => {
        if (c === "moderate") return "medium";
        if (c === "low" || c === "medium" || c === "high" || c === "intense") return c;
        return "medium";
      };

      // Helper to map consolidation trend
      const mapConsolidation = (c?: string): "fragmenting" | "stable" | "consolidating" => {
        if (c === "winner_take_all") return "consolidating";
        if (c === "fragmenting" || c === "stable" || c === "consolidating") return c;
        return "stable";
      };

      // Helper to map barrier
      const mapBarrier = (b?: string): "low" | "medium" | "high" => {
        if (b === "very_high") return "high";
        if (b === "low" || b === "medium" || b === "high") return b;
        return "high";
      };

      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: "BioTech",
        sectorMaturity: mapMaturity(parsedOutput.sectorFit?.sectorMaturity),
        keyMetrics: parsedOutput.metricsAnalysis?.map(m => ({
          metricName: m.metricName,
          value: m.metricValue ?? m.percentile ?? null,
          sectorBenchmark: { p25: m.benchmark?.p25 ?? 0, median: m.benchmark?.median ?? 0, p75: m.benchmark?.p75 ?? 0, topDecile: m.benchmark?.topDecile ?? 0 },
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
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level === "very_high" ? "high" : (parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "high") as "low" | "medium" | "high",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? ["FDA", "EMA", "GCP", "GMP"],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 15,
          recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) ?? [],
        },
        sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
          question: q.question,
          category: (q.category === "business_model" ? "business" : q.category === "unit_economics" ? "business" : q.category) as "technical" | "business" | "regulatory" | "competitive",
          priority: (q.priority === "critical" ? "must_ask" : q.priority === "high" ? "should_ask" : "nice_to_have") as "must_ask" | "should_ask" | "nice_to_have",
          expectedAnswer: q.goodAnswer ?? "",
          redFlagAnswer: q.redFlagAnswer ?? "",
        })) ?? [],
        sectorFit: {
          score: parsedOutput.sectorFit?.score ?? 50,
          strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
          weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
          sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                        parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: parsedOutput.executiveSummary?.sectorScore ?? parsedOutput.sectorFit?.score ?? 50,
        executiveSummary: parsedOutput.executiveSummary?.verdict ?? parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "biotech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          clinicalPipeline: {
            leadAsset: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("lead") || m.metricName.toLowerCase().includes("asset"))?.metricValue as string ?? null,
            currentPhase: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("phase"))?.metricValue as string ?? null,
            indication: null,
            pipelineDepth: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("pipeline"))?.metricValue as number ?? null,
          },
          regulatoryStatus: {
            fdaDesignation: null,
            indStatus: null,
            approvalTimeline: null,
            regulatoryRisk: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "high",
          },
          clinicalTrialDesign: {
            primaryEndpoint: null,
            sampleSize: null,
            trialDuration: null,
            enrollmentStatus: null,
          },
          pipelineValuation: {
            rNPV: null,
            phaseProbabilities: null,
            peakSalesEstimate: null,
          },
          ipPortfolio: {
            patentsClaimed: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("patent"))?.metricValue as number ?? null,
            patentExpiry: null,
            freedomToOperate: null,
          },
          manufacturingReadiness: {
            cmoPartner: null,
            scaleUpStatus: null,
            cogsAtScale: null,
          },
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          potentialAcquirers: BIOTECH_BENCHMARKS.typicalAcquirers ?? [],
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("clinical") ||
            rf.flag.toLowerCase().includes("fda") ||
            rf.flag.toLowerCase().includes("trial") ||
            rf.flag.toLowerCase().includes("regulatory") ||
            rf.flag.toLowerCase().includes("ip")
          ) ?? [],
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as SectorExpertResult & { _extended: ExtendedBioTechData };

    } catch (error) {
      console.error("[biotech-expert] Execution error:", error);
      return {
        agentName: "biotech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultBioTechData(),
      };
    }
  },
};

// Extended data type for BioTech Expert UI wow effect
interface ExtendedBioTechData {
  clinicalPipeline: {
    leadAsset: string | null;
    currentPhase: string | null;
    indication: string | null;
    pipelineDepth: number | null;
  };
  regulatoryStatus: {
    fdaDesignation: string | null;
    indStatus: string | null;
    approvalTimeline: string | null;
    regulatoryRisk: string;
  };
  clinicalTrialDesign: {
    primaryEndpoint: string | null;
    sampleSize: number | null;
    trialDuration: string | null;
    enrollmentStatus: string | null;
  };
  pipelineValuation: {
    rNPV: number | null;
    phaseProbabilities: unknown;
    peakSalesEstimate: number | null;
  };
  ipPortfolio: {
    patentsClaimed: number | null;
    patentExpiry: string | null;
    freedomToOperate: string | null;
  };
  manufacturingReadiness: {
    cmoPartner: string | null;
    scaleUpStatus: string | null;
    cogsAtScale: number | null;
  };
  exitLandscape: unknown;
  potentialAcquirers: string[];
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultBioTechData(): SectorExpertData {
  return {
    sectorName: "BioTech",
    sectorMaturity: "emerging",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full biotech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "very_high",
      keyRegulations: ["FDA", "EMA", "GCP", "GMP"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 15,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your lead asset's current clinical phase and primary endpoint?",
        category: "regulatory",
        priority: "must_ask",
        expectedAnswer: "Clear phase with defined endpoints and enrollment status",
        redFlagAnswer: "Unclear clinical strategy or no IND filed",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "BioTech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default biotechExpert;
