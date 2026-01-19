import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, GTMAnalystResult, GTMAnalystData } from "../types";

/**
 * GTM Analyst Agent
 *
 * Mission: Evaluer la strategie Go-to-Market et l'efficacite commerciale.
 * Un BA veut savoir: "Comment vont-ils acquerir et retenir des clients?"
 */

interface LLMGTMAnalystResponse {
  strategyAssessment: {
    primaryChannel: string;
    channels: string[];
    approach: string;
    clarity: number;
    appropriateness: string;
  };
  salesEfficiency: {
    salesCycle?: string;
    acv?: number;
    winRate?: number;
    pipelineCoverage?: number;
    assessment: string;
  };
  marketingEfficiency: {
    cac?: number;
    cacPayback?: number;
    channelMix: string[];
    scalability: string;
  };
  growthPotential: {
    currentGrowthRate: number;
    sustainabilityScore: number;
    growthLevers: string[];
    constraints: string[];
  };
  gtmRisks: string[];
  gtmScore: number;
}

export class GTMAnalystAgent extends BaseAgent<GTMAnalystData, GTMAnalystResult> {
  constructor() {
    super({
      name: "gtm-analyst",
      description: "Evalue la strategie Go-to-Market",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert GTM/Growth avec experience en scale-ups B2B et B2C.

TON ROLE:
- Evaluer la clarte et pertinence de la strategie GTM
- Analyser l'efficacite ventes et marketing
- Identifier les leviers de croissance et contraintes
- Detecter les risques de scaling

MODELES GTM:
1. PRODUCT-LED GROWTH (PLG)
   - Freemium, self-service, viral
   - CAC bas, time-to-value rapide
   - Exemples: Slack, Notion, Figma

2. SALES-LED GROWTH (SLG)
   - Enterprise sales, AEs, SDRs
   - High ACV (> €10K), long cycle
   - Exemples: Salesforce, Workday

3. HYBRID
   - PLG pour acquisition, sales pour enterprise
   - Land and expand
   - Exemples: Zoom, Datadog

METRIQUES CLES GTM:
- Sales cycle: SMB < 30j, Mid-market 60-90j, Enterprise > 90j
- ACV vs CAC: ACV devrait etre > 3x CAC
- Pipeline coverage: 3-4x pour forecast fiable
- Magic Number: > 0.75 = efficient

RED FLAGS GTM:
- Pas de canal clair identifie
- CAC > 12 mois de revenus
- Dependance a un seul canal
- Sales cycle trop long pour le ACV
- Pas de mouvements self-service (B2B)

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<GTMAnalystData> {
    const dealContext = this.formatDealContext(context);
    const extractedInfo = this.getExtractedInfo(context);

    let gtmSection = "";
    if (extractedInfo) {
      const gtmData = {
        cac: extractedInfo.cac,
        ltv: extractedInfo.ltv,
        customers: extractedInfo.customers,
        churnRate: extractedInfo.churnRate,
        growthRateYoY: extractedInfo.growthRateYoY,
      };
      gtmSection = `\n## Metriques GTM du Deck\n${JSON.stringify(gtmData, null, 2)}`;
    }

    const prompt = `Analyse la strategie Go-to-Market:

${dealContext}
${gtmSection}

Evalue la capacite d'execution GTM.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "strategyAssessment": {
    "primaryChannel": "string (canal principal)",
    "channels": ["string"],
    "approach": "product_led|sales_led|hybrid|unclear",
    "clarity": number (0-100, clarte de la strategie),
    "appropriateness": "poor|acceptable|good|excellent"
  },
  "salesEfficiency": {
    "salesCycle": "string (< 30j, 30-90j, > 90j)",
    "acv": number ou null (Annual Contract Value),
    "winRate": number ou null (%),
    "pipelineCoverage": number ou null (x),
    "assessment": "string"
  },
  "marketingEfficiency": {
    "cac": number ou null,
    "cacPayback": number ou null (mois),
    "channelMix": ["string (canaux marketing)"],
    "scalability": "low|medium|high"
  },
  "growthPotential": {
    "currentGrowthRate": number (%),
    "sustainabilityScore": number (0-100),
    "growthLevers": ["string"],
    "constraints": ["string"]
  },
  "gtmRisks": ["string"],
  "gtmScore": number (0-100)
}
\`\`\`

IMPORTANT:
- "unclear" = red flag majeur au Seed
- PLG sans product virality = risque
- Sales-led avec ACV < €10K = inefficient`;

    const { data } = await this.llmCompleteJSON<LLMGTMAnalystResponse>(prompt);

    const validApproaches = ["product_led", "sales_led", "hybrid", "unclear"];
    const validAppropriateness = ["poor", "acceptable", "good", "excellent"];
    const validScalability = ["low", "medium", "high"];

    return {
      strategyAssessment: {
        primaryChannel: data.strategyAssessment?.primaryChannel ?? "Not specified",
        channels: Array.isArray(data.strategyAssessment?.channels)
          ? data.strategyAssessment.channels
          : [],
        approach: validApproaches.includes(data.strategyAssessment?.approach)
          ? (data.strategyAssessment.approach as "product_led" | "sales_led" | "hybrid" | "unclear")
          : "unclear",
        clarity: Math.min(100, Math.max(0, data.strategyAssessment?.clarity ?? 50)),
        appropriateness: validAppropriateness.includes(data.strategyAssessment?.appropriateness)
          ? (data.strategyAssessment.appropriateness as "poor" | "acceptable" | "good" | "excellent")
          : "acceptable",
      },
      salesEfficiency: {
        salesCycle: data.salesEfficiency?.salesCycle,
        acv: data.salesEfficiency?.acv,
        winRate: data.salesEfficiency?.winRate,
        pipelineCoverage: data.salesEfficiency?.pipelineCoverage,
        assessment: data.salesEfficiency?.assessment ?? "Donnees insuffisantes.",
      },
      marketingEfficiency: {
        cac: data.marketingEfficiency?.cac,
        cacPayback: data.marketingEfficiency?.cacPayback,
        channelMix: Array.isArray(data.marketingEfficiency?.channelMix)
          ? data.marketingEfficiency.channelMix
          : [],
        scalability: validScalability.includes(data.marketingEfficiency?.scalability)
          ? (data.marketingEfficiency.scalability as "low" | "medium" | "high")
          : "medium",
      },
      growthPotential: {
        currentGrowthRate: data.growthPotential?.currentGrowthRate ?? 0,
        sustainabilityScore: Math.min(100, Math.max(0, data.growthPotential?.sustainabilityScore ?? 50)),
        growthLevers: Array.isArray(data.growthPotential?.growthLevers)
          ? data.growthPotential.growthLevers
          : [],
        constraints: Array.isArray(data.growthPotential?.constraints)
          ? data.growthPotential.constraints
          : [],
      },
      gtmRisks: Array.isArray(data.gtmRisks) ? data.gtmRisks : [],
      gtmScore: Math.min(100, Math.max(0, data.gtmScore ?? 50)),
    };
  }
}

export const gtmAnalyst = new GTMAnalystAgent();
