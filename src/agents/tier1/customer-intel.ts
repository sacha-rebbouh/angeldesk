import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, CustomerIntelResult, CustomerIntelData } from "../types";

/**
 * Customer Intel Agent
 *
 * Mission: Analyser la base clients et les signaux de Product-Market Fit.
 * Un BA veut savoir: "Les clients aiment-ils vraiment le produit?"
 */

interface LLMCustomerIntelResponse {
  customerProfile: {
    icp: string;
    segments: string[];
    currentCustomers?: number;
    notableCustomers: string[];
    customerQuality: string;
  };
  retentionMetrics: {
    churnRate?: number;
    netRevenueRetention?: number;
    grossRetention?: number;
    cohortTrends: string;
    assessment: string;
  };
  productMarketFit: {
    signals: string[];
    strength: string;
    evidence: string[];
  };
  customerRisks: {
    concentration: number;
    dependencyRisk: string;
    churnRisk: string;
    concerns: string[];
  };
  expansionPotential: {
    upsellOpportunity: string;
    crossSellOpportunity: string;
    virality: string;
  };
  customerScore: number;
}

export class CustomerIntelAgent extends BaseAgent<CustomerIntelData, CustomerIntelResult> {
  constructor() {
    super({
      name: "customer-intel",
      description: "Analyse la base clients et les signaux PMF",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en Customer Success et Product-Market Fit.

TON ROLE:
- Analyser le profil et la qualite de la base clients
- Evaluer les metriques de retention
- Detecter les signaux de Product-Market Fit
- Identifier les risques clients

SIGNAUX PMF POSITIFS:
- NRR > 120% (clients expandent naturellement)
- Churn < 5% (B2B SaaS)
- NPS > 50
- Referrals significatifs
- Clients logo notables et verifiables
- Feedback qualitatif enthousiaste

SIGNAUX PMF NEGATIFS:
- Churn > 10%
- Beaucoup de discounts pour closer
- Cycle de vente rallonge
- Features requests contradictoires
- Pas de referrals

CONCENTRATION CLIENT:
- Top customer > 30% revenue = CRITICAL
- Top 3 customers > 50% = HIGH risk
- Diversifie (< 10% par client) = HEALTHY

QUALITE CLIENTS:
- Enterprise logos verifiables = HIGH
- SMB anonymes = MEDIUM
- Pilots/POC uniquement = LOW

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<CustomerIntelData> {
    const dealContext = this.formatDealContext(context);
    const extractedInfo = this.getExtractedInfo(context);

    let customerSection = "";
    if (extractedInfo) {
      const customerData = {
        customers: extractedInfo.customers,
        users: extractedInfo.users,
        nrr: extractedInfo.nrr,
        churnRate: extractedInfo.churnRate,
      };
      customerSection = `\n## Donnees Clients du Deck\n${JSON.stringify(customerData, null, 2)}`;
    }

    const prompt = `Analyse la base clients et les signaux PMF:

${dealContext}
${customerSection}

Evalue la qualite clients et PMF.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "customerProfile": {
    "icp": "string (Ideal Customer Profile)",
    "segments": ["string (segments cibles)"],
    "currentCustomers": number ou null,
    "notableCustomers": ["string (logos verifiables)"],
    "customerQuality": "low|medium|high"
  },
  "retentionMetrics": {
    "churnRate": number ou null (%),
    "netRevenueRetention": number ou null (%),
    "grossRetention": number ou null (%),
    "cohortTrends": "improving|stable|declining|unknown",
    "assessment": "string"
  },
  "productMarketFit": {
    "signals": ["string (signaux PMF positifs)"],
    "strength": "weak|emerging|moderate|strong",
    "evidence": ["string (preuves concretes)"]
  },
  "customerRisks": {
    "concentration": number (% du plus gros client),
    "dependencyRisk": "low|medium|high",
    "churnRisk": "low|medium|high",
    "concerns": ["string"]
  },
  "expansionPotential": {
    "upsellOpportunity": "low|medium|high",
    "crossSellOpportunity": "low|medium|high",
    "virality": "none|low|medium|high"
  },
  "customerScore": number (0-100)
}
\`\`\`

IMPORTANT:
- "strong" PMF = NRR > 120% ET churn < 5%
- Logos non verifiables = qualite "low"
- Score < 40 si concentration > 30%`;

    const { data } = await this.llmCompleteJSON<LLMCustomerIntelResponse>(prompt);

    const validQuality = ["low", "medium", "high"];
    const validTrends = ["improving", "stable", "declining", "unknown"];
    const validStrength = ["weak", "emerging", "moderate", "strong"];
    const validRisk = ["low", "medium", "high"];
    const validVirality = ["none", "low", "medium", "high"];

    return {
      customerProfile: {
        icp: data.customerProfile?.icp ?? "Not specified",
        segments: Array.isArray(data.customerProfile?.segments)
          ? data.customerProfile.segments
          : [],
        currentCustomers: data.customerProfile?.currentCustomers,
        notableCustomers: Array.isArray(data.customerProfile?.notableCustomers)
          ? data.customerProfile.notableCustomers
          : [],
        customerQuality: validQuality.includes(data.customerProfile?.customerQuality)
          ? (data.customerProfile.customerQuality as "low" | "medium" | "high")
          : "medium",
      },
      retentionMetrics: {
        churnRate: data.retentionMetrics?.churnRate,
        netRevenueRetention: data.retentionMetrics?.netRevenueRetention,
        grossRetention: data.retentionMetrics?.grossRetention,
        cohortTrends: validTrends.includes(data.retentionMetrics?.cohortTrends)
          ? (data.retentionMetrics.cohortTrends as "improving" | "stable" | "declining" | "unknown")
          : "unknown",
        assessment: data.retentionMetrics?.assessment ?? "Donnees insuffisantes.",
      },
      productMarketFit: {
        signals: Array.isArray(data.productMarketFit?.signals)
          ? data.productMarketFit.signals
          : [],
        strength: validStrength.includes(data.productMarketFit?.strength)
          ? (data.productMarketFit.strength as "weak" | "emerging" | "moderate" | "strong")
          : "emerging",
        evidence: Array.isArray(data.productMarketFit?.evidence)
          ? data.productMarketFit.evidence
          : [],
      },
      customerRisks: {
        concentration: data.customerRisks?.concentration ?? 0,
        dependencyRisk: validRisk.includes(data.customerRisks?.dependencyRisk)
          ? (data.customerRisks.dependencyRisk as "low" | "medium" | "high")
          : "medium",
        churnRisk: validRisk.includes(data.customerRisks?.churnRisk)
          ? (data.customerRisks.churnRisk as "low" | "medium" | "high")
          : "medium",
        concerns: Array.isArray(data.customerRisks?.concerns)
          ? data.customerRisks.concerns
          : [],
      },
      expansionPotential: {
        upsellOpportunity: validRisk.includes(data.expansionPotential?.upsellOpportunity)
          ? (data.expansionPotential.upsellOpportunity as "low" | "medium" | "high")
          : "medium",
        crossSellOpportunity: validRisk.includes(data.expansionPotential?.crossSellOpportunity)
          ? (data.expansionPotential.crossSellOpportunity as "low" | "medium" | "high")
          : "medium",
        virality: validVirality.includes(data.expansionPotential?.virality)
          ? (data.expansionPotential.virality as "none" | "low" | "medium" | "high")
          : "low",
      },
      customerScore: Math.min(100, Math.max(0, data.customerScore ?? 50)),
    };
  }
}

export const customerIntel = new CustomerIntelAgent();
