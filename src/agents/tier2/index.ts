/**
 * Tier 2 Sector Experts
 * Dynamic agents activated based on deal sector
 */

// Export types from types.ts (primary source for SectorExpertType, SectorExpertResult)
export * from "./types";

// Export base-sector-expert excluding types already exported from types.ts
export {
  SectorExpertOutputSchema,
  type SectorExpertOutput,
  type SectorBenchmarkData,
  type SectorConfig,
  buildSectorExpertPrompt,
  createSectorExpert,
  getDefaultSectorData,
} from "./base-sector-expert";

// Export individual sector experts
export { saasExpert } from "./saas-expert";
export { legaltechExpert } from "./legaltech-expert";
export { hrtechExpert } from "./hrtech-expert";
export { marketplaceExpert } from "./marketplace-expert";
export { fintechExpert } from "./fintech-expert";
export { healthtechExpert } from "./healthtech-expert";
export { biotechExpert } from "./biotech-expert";
export { aiExpert } from "./ai-expert";
export { deeptechExpert } from "./deeptech-expert";
export { climateExpert } from "./climate-expert";
export { hardwareExpert } from "./hardware-expert";
export { spacetechExpert } from "./spacetech-expert";
export { gamingExpert } from "./gaming-expert";
export { consumerExpert } from "./consumer-expert";
export { proptechExpert } from "./proptech-expert";
export { edtechExpert } from "./edtech-expert";
export { foodtechExpert } from "./foodtech-expert";
export { mobilityExpert } from "./mobility-expert";
export { cybersecurityExpert } from "./cybersecurity-expert";
export { creatorExpert } from "./creator-expert";
export { blockchainExpert } from "./blockchain-expert";
export { generalExpert } from "./general-expert";

// Registry of all sector experts
import { saasExpert } from "./saas-expert";
import { legaltechExpert } from "./legaltech-expert";
import { hrtechExpert } from "./hrtech-expert";
import { marketplaceExpert } from "./marketplace-expert";
import { fintechExpert } from "./fintech-expert";
import { healthtechExpert } from "./healthtech-expert";
import { biotechExpert } from "./biotech-expert";
import { aiExpert } from "./ai-expert";
import { deeptechExpert } from "./deeptech-expert";
import { climateExpert } from "./climate-expert";
import { hardwareExpert } from "./hardware-expert";
import { spacetechExpert } from "./spacetech-expert";
import { gamingExpert } from "./gaming-expert";
import { consumerExpert } from "./consumer-expert";
import { proptechExpert } from "./proptech-expert";
import { edtechExpert } from "./edtech-expert";
import { foodtechExpert } from "./foodtech-expert";
import { mobilityExpert } from "./mobility-expert";
import { cybersecurityExpert } from "./cybersecurity-expert";
import { creatorExpert } from "./creator-expert";
import { blockchainExpert } from "./blockchain-expert";
import { generalExpert } from "./general-expert";
import type { SectorExpertType, SectorExpertResult, SectorExpertData } from "./types";
import type { EnrichedAgentContext } from "../types";
import { setAgentContext } from "@/services/openrouter/router";
import { completeSectorJSON } from "./complete-sector-json";
import { SectorExpertOutputSchema, getDefaultSectorData } from "./base-sector-expert";

// Type for any sector expert
export type AnySectorExpert = {
  name: SectorExpertType;
  run: (context: EnrichedAgentContext) => Promise<SectorExpertResult>
};

// Type for experts that use buildPrompt pattern instead of run
type BuildPromptExpert = {
  name: string;
  buildPrompt: (context: EnrichedAgentContext) => { system: string; user: string };
  outputSchema?: unknown;
};

// Helper to check if expert has run method
function hasRunMethod(expert: unknown): expert is AnySectorExpert {
  return typeof expert === "object" && expert !== null && "run" in expert && typeof (expert as { run: unknown }).run === "function";
}

// Wrapper to create run method from buildPrompt
function wrapWithRun(expert: BuildPromptExpert): AnySectorExpert {
  const expertName = expert.name as SectorExpertType;

  return {
    name: expertName,
    async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
      const startTime = Date.now();

      try {
        const { system, user } = expert.buildPrompt(context);

        // Anti-Hallucination Directive — Citation Demand (Prompt 3/5)
        const citationDemand = `

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.
`;

        // Anti-Hallucination Directive — Evidence-Based Self-Audit (Prompt 4/5)
        // Phase A slice A8a — refonte selon le gate de preuve structuré
        // (D4 verrouillé). L'ancienne version demandait au LLM de
        // s'auto-évaluer sur une échelle catégorielle non sourcée,
        // contraire à la doctrine. La nouvelle version ancre l'audit sur
        // la SOLIDITÉ DES PREUVES disponibles.
        const selfAudit = `

## Anti-Hallucination Directive — Evidence-Based Self-Audit
After completing your response, perform an evidence-based self-audit:
1. Identify the 3 claims in your response that have the WEAKEST evidence backing
2. For each one, list the source (if any) and explain what alternative interpretation the available evidence could support
3. Flag any claim that relies on inference rather than direct evidence with [INFERRED]
Be ruthlessly honest. Uncertainty grounded in evidence gaps is valued, not penalised.
`;

        // Anti-Hallucination Directive — Evidence Solidity Classification (Prompt 5/5)
        // Phase A slice A8a — refonte selon le gate de preuve structuré.
        // L'ancienne version catégorisait par seuils numériques d'auto-
        // confidence — auto-évaluation non sourcée. La nouvelle version
        // catégorise par SOLIDITÉ DES PREUVES (SOURCED / INFERRED /
        // UNSOURCED), cohérent avec le pipeline evidence-first Phase A.
        const structuredUncertainty = `

## Anti-Hallucination Directive — Evidence Solidity Classification
Structure your response in three clearly labelled sections based on EVIDENCE SOLIDITY (not auto-evaluated confidence):
**SOURCED:** Claims directly backed by a citable source (document, dataset, verified fact)
**INFERRED:** Claims derived by reasoning from sourced evidence — mark the reasoning step
**UNSOURCED:** Claims drawn from general knowledge or pattern-matching without specific source backing
Every claim must be placed in one of these three categories.
Do not present unsourced or inferred claims as if they were sourced.
`;

        setAgentContext(expertName);

        // completeSectorJSON : force response_format json_object + retry adaptatif + repair JSON
        // tronqué + fallback modèle, puis Zod (fini le crash sur réponse en prose — post-mortem
        // Avekapeti). Sur Zod-fail : raw conservé, defaults appliqués en aval.
        const sectorResult = await completeSectorJSON(user, {
          systemPrompt: system + citationDemand + selfAudit + structuredUncertainty,
          complexity: "complex",
          temperature: 0.3,
        }, SectorExpertOutputSchema);

        if (!sectorResult.valid) {
          console.warn(`[${expertName}] Output validation failed (raw conservé, defaults en aval)`);
        }

        // Transform SectorExpertOutput to SectorExpertData (output large : annotations .map inline)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const output: any = sectorResult.data;
        const llmCost = sectorResult.cost;
        const sectorData: SectorExpertData = {
          sectorName: expertName.replace("-expert", ""),
          sectorMaturity: output.sectorFit?.sectorMaturity ?? "growing",
          keyMetrics: output.metricsAnalysis?.map((m: { metricName: string; percentile?: number; assessment?: string; sectorContext?: string; benchmark?: { p25: number; median: number; p75: number; topDecile: number } }) => ({
            metricName: m.metricName,
            value: m.percentile ?? null,
            sectorBenchmark: m.benchmark ?? { p25: 0, median: 0, p75: 0, topDecile: 0 },
            assessment: m.assessment ?? "average",
            sectorContext: m.sectorContext ?? "",
          })) ?? [],
          sectorRedFlags: output.sectorRedFlags?.map((rf: { flag: string; severity: string; sectorThreshold?: string }) => ({
            flag: rf.flag,
            severity: rf.severity as "critical" | "major" | "minor",
            sectorReason: rf.sectorThreshold ?? "",
          })) ?? [],
          sectorOpportunities: output.sectorOpportunities?.map((o: { opportunity: string; potential: string; sectorContext?: string }) => ({
            opportunity: o.opportunity,
            potential: o.potential as "high" | "medium" | "low",
            reasoning: o.sectorContext ?? "",
          })) ?? [],
          regulatoryEnvironment: {
            complexity: output.sectorDynamics?.regulatoryRisk?.level ?? "medium",
            keyRegulations: output.sectorDynamics?.regulatoryRisk?.keyRegulations ?? [],
            complianceRisks: [],
            upcomingChanges: output.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
          },
          sectorDynamics: {
            competitionIntensity: output.sectorDynamics?.competitionIntensity ?? "moderate",
            consolidationTrend: output.sectorDynamics?.consolidationTrend ?? "stable",
            barrierToEntry: output.sectorDynamics?.barrierToEntry ?? "medium",
          },
          sectorQuestions: output.sectorQuestions?.map((q: { question: string; priority: string }) => ({
            question: q.question,
            category: "business" as const,
            priority: q.priority as "must_ask" | "should_ask" | "nice_to_have",
            expectedAnswer: "",
            redFlagAnswer: "",
          })) ?? [],
          sectorFit: {
            score: output.sectorFit?.score ?? 0,
            strengths: [],
            weaknesses: [],
            sectorTiming: output.sectorFit?.timingAssessment === "early_mover" ? "early" : output.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
          },
          sectorScore: output.sectorFit?.score ?? 0,
          executiveSummary: output.sectorFit?.reasoning ?? "",
        };

        return {
          agentName: expertName,
          success: true,
          executionTimeMs: Date.now() - startTime,
          cost: llmCost,
          data: sectorData,
        };

      } catch (error) {
        console.error(`[${expertName}] Execution error:`, error);
        return {
          agentName: expertName,
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: 0,
          error: error instanceof Error ? error.message : "Unknown error",
          data: getDefaultSectorData(expertName) as unknown as SectorExpertData,
        };
      }
    },
  };
}

// Helper to get expert with run method
function getExpertWithRun(expert: unknown): AnySectorExpert {
  if (hasRunMethod(expert)) {
    return expert;
  }
  return wrapWithRun(expert as BuildPromptExpert);
}

// All sector experts indexed by their type (with run method ensured)
export const SECTOR_EXPERTS: Record<
  SectorExpertType,
  AnySectorExpert
> = {
  "saas-expert": getExpertWithRun(saasExpert),
  "legaltech-expert": getExpertWithRun(legaltechExpert),
  "hrtech-expert": getExpertWithRun(hrtechExpert),
  "marketplace-expert": getExpertWithRun(marketplaceExpert),
  "fintech-expert": getExpertWithRun(fintechExpert),
  "healthtech-expert": getExpertWithRun(healthtechExpert),
  "biotech-expert": getExpertWithRun(biotechExpert),
  "ai-expert": getExpertWithRun(aiExpert),
  "deeptech-expert": getExpertWithRun(deeptechExpert),
  "climate-expert": getExpertWithRun(climateExpert),
  "hardware-expert": getExpertWithRun(hardwareExpert),
  "spacetech-expert": getExpertWithRun(spacetechExpert),
  "gaming-expert": getExpertWithRun(gamingExpert),
  "consumer-expert": getExpertWithRun(consumerExpert),
  "proptech-expert": getExpertWithRun(proptechExpert),
  "edtech-expert": getExpertWithRun(edtechExpert),
  "foodtech-expert": getExpertWithRun(foodtechExpert),
  "mobility-expert": getExpertWithRun(mobilityExpert),
  "cybersecurity-expert": getExpertWithRun(cybersecurityExpert),
  "creator-expert": getExpertWithRun(creatorExpert),
  "blockchain-expert": getExpertWithRun(blockchainExpert),
  "general-expert": getExpertWithRun(generalExpert), // Fallback for uncovered sectors
};

// Shared sector patterns for matching
// NOTE: legaltech-expert comes BEFORE saas-expert to ensure LegalTech companies go to legaltech-expert
// NOTE: hrtech-expert comes BEFORE saas-expert to ensure HRTech companies go to hrtech-expert
// NOTE: ai-expert comes BEFORE deeptech-expert to ensure AI companies go to ai-expert
// NOTE: proptech-expert comes BEFORE marketplace-expert to ensure PropTech companies go to proptech-expert
// NOTE: blockchain-expert comes BEFORE fintech-expert to ensure Web3/Crypto companies go to blockchain-expert
// NOTE: biotech-expert comes BEFORE healthtech-expert to ensure Life Sciences companies go to biotech-expert
// NOTE: foodtech-expert comes BEFORE climate-expert and consumer-expert to ensure Food/AgTech companies go to foodtech-expert
// NOTE: cybersecurity-expert comes BEFORE deeptech-expert to ensure Security companies go to cybersecurity-expert
// NOTE: creator-expert comes BEFORE gaming-expert to ensure Creator Economy/Media companies go to creator-expert
const SECTOR_PATTERNS: [SectorExpertType, string[]][] = [
  ["legaltech-expert", ["legaltech", "legal tech", "law tech", "legal software", "clm", "contract lifecycle management", "legal practice management", "legal research", "e-discovery", "ediscovery", "legal ai", "legal marketplace", "legal ops", "regtech"]],
  ["hrtech-expert", ["hrtech", "hr tech", "hr software", "human resources", "people tech", "talent tech", "workforce", "wfm", "payroll", "hris", "hcm", "ats", "applicant tracking", "recruiting", "recruitment", "talent management", "talent acquisition", "benefits administration", "benefits tech", "employee engagement", "performance management", "compensation", "comp tech", "peo", "eor", "employer of record"]],
  ["saas-expert", ["saas", "b2b software", "enterprise software", "software"]],
  ["proptech-expert", ["proptech", "prop tech", "real estate tech", "real estate", "construction tech", "contech", "mortgage tech", "cre tech", "commercial real estate", "co-working", "coworking", "smart building"]],
  ["marketplace-expert", ["marketplace", "platform", "two-sided"]],
  ["blockchain-expert", ["blockchain", "web3", "crypto", "defi", "nft", "dao", "token", "cryptocurrency", "smart contract", "layer 1", "layer 2", "rwa", "decentralized"]],
  ["fintech-expert", ["fintech", "payments", "banking", "insurance", "insurtech", "lending", "wealthtech", "neobank"]],
  ["biotech-expert", ["biotech", "life sciences", "pharma", "drug discovery", "therapeutics", "biopharma", "gene therapy", "cell therapy", "biologics", "pharmaceuticals", "oncology", "immunotherapy"]],
  ["healthtech-expert", ["healthtech", "medtech", "healthcare", "digital health", "femtech", "mental health", "telehealth"]],
  ["ai-expert", ["ai", "ai/ml", "ai / machine learning", "ml", "machine learning", "llm", "genai", "generative ai", "nlp", "computer vision", "deep learning", "mlops"]],
  ["cybersecurity-expert", ["cybersecurity", "cyber", "infosec", "information security", "security software", "network security", "endpoint security", "cloud security", "application security", "appsec", "devsecops", "security", "siem", "soar", "xdr", "edr", "iam", "identity", "zero trust", "threat intelligence", "vulnerability management", "mssp", "soc"]],
  ["deeptech-expert", ["deeptech", "quantum"]],
  ["foodtech-expert", ["foodtech", "food tech", "food", "f&b", "agtech", "agritech", "alt protein", "alternative protein", "meal kit", "dark kitchen", "ghost kitchen", "vertical farming", "plant-based", "cpg food", "food & beverage"]],
  ["climate-expert", ["cleantech", "climate", "energy", "sustainability", "greentech"]],
  ["spacetech-expert", ["spacetech", "space tech", "space", "aerospace", "newspace", "new space", "satellite", "satellites", "launch", "launcher", "rocket", "earth observation", "eo", "leo", "geo", "constellation", "space infrastructure", "in-space", "orbital"]],
  ["hardware-expert", ["hardware", "iot", "robotics", "manufacturing", "industrial", "drones"]],
  ["creator-expert", ["creator economy", "creator", "influencer", "influencer marketing", "podcasting", "podcast", "newsletter", "streaming", "ugc", "user generated content", "creator tools", "creator platform", "patreon", "substack", "youtube", "tiktok", "twitch", "onlyfans", "talent management", "mcn", "multi-channel network", "digital media"]],
  ["gaming-expert", ["gaming", "esports", "metaverse", "vr", "ar", "entertainment", "media tech"]],
  ["edtech-expert", ["edtech", "ed tech", "education", "education technology", "e-learning", "online learning", "learning platform", "corporate learning", "l&d", "k-12", "higher ed"]],
  ["mobility-expert", ["mobility", "transportation", "logistics", "ridesharing", "rideshare", "micromobility", "fleet", "fleet management", "delivery", "last-mile", "last mile", "maas", "mobility as a service", "transit", "freight", "trucking", "shipping", "supply chain"]],
  ["consumer-expert", ["consumer", "d2c", "social", "e-commerce", "retail", "lifestyle"]],
];

// Helper to check if a pattern matches a sector using word boundaries
// This prevents "ai" from matching "blockchain" (blockchAIn contains "ai")
function patternMatchesSector(sector: string, pattern: string): boolean {
  // For short patterns (2-3 chars), require word boundaries
  // For longer patterns, substring match is safe
  if (pattern.length <= 3) {
    // Create regex with word boundaries: match "ai" but not "blockchain"
    // Also allow "/" as word boundary for patterns like "ai/ml"
    const regex = new RegExp(`(^|[\\s/])${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s/])`, 'i');
    return regex.test(sector);
  }
  return sector.includes(pattern);
}

// Get the appropriate sector expert for a deal
// Returns general-expert as fallback for unknown sectors when useDynamicFallback is true
export function getSectorExpertForDeal(
  sector: string | null | undefined,
  useDynamicFallback: boolean = true
): AnySectorExpert | null {
  if (!sector) return null;

  const normalizedSector = sector.toLowerCase().trim();

  // Check each expert's sector patterns
  for (const [expertType, patterns] of SECTOR_PATTERNS) {
    for (const pattern of patterns) {
      if (patternMatchesSector(normalizedSector, pattern)) {
        return SECTOR_EXPERTS[expertType];
      }
    }
  }

  // Use general-expert as fallback for uncovered sectors
  if (useDynamicFallback) {
    return SECTOR_EXPERTS["general-expert"];
  }

  return null;
}

// Get all matching sector experts (a deal might match multiple)
// If no specialized experts match and useDynamicFallback is true, returns general-expert
export function getAllSectorExpertsForDeal(
  sector: string | null | undefined,
  useDynamicFallback: boolean = true
): AnySectorExpert[] {
  if (!sector) return [];

  const normalizedSector = sector.toLowerCase().trim();
  const matches: AnySectorExpert[] = [];

  for (const [expertType, patterns] of SECTOR_PATTERNS) {
    for (const pattern of patterns) {
      if (patternMatchesSector(normalizedSector, pattern)) {
        matches.push(SECTOR_EXPERTS[expertType]);
        break; // Only add each expert once
      }
    }
  }

  // Use general-expert as fallback if no specialized expert matches
  if (matches.length === 0 && useDynamicFallback) {
    matches.push(SECTOR_EXPERTS["general-expert"]);
  }

  return matches;
}
