import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, CapTableAuditResult, CapTableAuditData } from "../types";

/**
 * Cap Table Auditor Agent
 *
 * Mission: Auditer la structure du capital et les terms du round.
 * Un BA doit comprendre sa dilution future et les risques structurels.
 */

interface LLMCapTableAuditResponse {
  ownershipBreakdown: {
    founders: number;
    employees: number;
    investors: number;
    optionPool: number;
    other: number;
  };
  founderDilution: {
    currentFounderOwnership: number;
    projectedPostRound: number;
    atSeriesA?: number;
    atSeriesB?: number;
    concern: string;
  };
  investorAnalysis: {
    existingInvestors: {
      name: string;
      ownership: number;
      reputation: string;
      signalValue: string;
    }[];
    leadInvestorPresent: boolean;
    followOnCapacity: string;
  };
  roundTerms: {
    preMoneyValuation?: number;
    roundSize?: number;
    dilution: number;
    proRataRights: boolean;
    liquidationPreference: string;
    antiDilution: string;
    participatingPreferred: boolean;
    concerns: string[];
  };
  optionPoolAnalysis: {
    currentSize: number;
    adequacy: string;
    refreshNeeded: boolean;
  };
  structuralRedFlags: string[];
  capTableScore: number;
}

export class CapTableAuditorAgent extends BaseAgent<CapTableAuditData, CapTableAuditResult> {
  constructor() {
    super({
      name: "cap-table-auditor",
      description: "Audite la cap table et les terms du round",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en structuration de deals VC avec 15+ ans d'experience.

TON ROLE:
- Auditer la repartition du capital actuelle
- Projeter la dilution future des fondateurs
- Analyser les terms du round propose
- Identifier les red flags structurels

STRUCTURE CAPITAL SAINE (Seed):
- Fondateurs: 70-85%
- ESOP: 10-15%
- Investisseurs precedents: 5-15%
- Autres: < 5%

DILUTION STANDARD:
- Seed: 15-25% dilution
- Series A: 20-30% dilution
- Series B: 15-25% dilution
- A Series B, fondateurs devraient avoir > 30%

TERMS STANDARDS:
- Liquidation Preference: 1x non-participating (standard)
- Participating preferred: RED FLAG (double-dip)
- Anti-dilution: Broad-based weighted average (standard)
- Full ratchet: RED FLAG
- Pro-rata: Normal pour investisseurs
- Vesting: 4 ans cliff 1 an

RED FLAGS CAP TABLE:
- Fondateurs < 50% avant Series A
- ESOP < 10% (recrutement difficile)
- Investisseur avec > 30% avant Series A
- Clauses de controle disproportionnees
- Liquidation pref > 2x ou participating

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<CapTableAuditData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let capTableSection = "";
    if (extractedInfo) {
      const capData = {
        previousRounds: extractedInfo.previousRounds,
        valuationPre: extractedInfo.valuationPre,
        amountRaising: extractedInfo.amountRaising,
      };
      capTableSection = `\n## Donnees Cap Table du Deck\n${JSON.stringify(capData, null, 2)}`;
    }

    const prompt = `Audite la cap table et les terms de ce deal:

${dealContext}
${capTableSection}
${contextEngineData}

Analyse la structure du capital.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "ownershipBreakdown": {
    "founders": number (% actuel),
    "employees": number (%),
    "investors": number (%),
    "optionPool": number (%),
    "other": number (%)
  },
  "founderDilution": {
    "currentFounderOwnership": number (%),
    "projectedPostRound": number (% apres ce round),
    "atSeriesA": number ou null (projection),
    "atSeriesB": number ou null (projection),
    "concern": "none|moderate|significant"
  },
  "investorAnalysis": {
    "existingInvestors": [
      {
        "name": "string",
        "ownership": number (%),
        "reputation": "unknown|low|medium|high|top_tier",
        "signalValue": "string (ce que leur presence signale)"
      }
    ],
    "leadInvestorPresent": boolean,
    "followOnCapacity": "string (capacite de follow-on)"
  },
  "roundTerms": {
    "preMoneyValuation": number ou null,
    "roundSize": number ou null,
    "dilution": number (%),
    "proRataRights": boolean,
    "liquidationPreference": "string (1x non-participating, etc.)",
    "antiDilution": "string (broad-based, full ratchet, none)",
    "participatingPreferred": boolean,
    "concerns": ["string"]
  },
  "optionPoolAnalysis": {
    "currentSize": number (%),
    "adequacy": "insufficient|adequate|generous",
    "refreshNeeded": boolean
  },
  "structuralRedFlags": ["string"],
  "capTableScore": number (0-100)
}
\`\`\`

IMPORTANT:
- Si pas d'info sur les terms, indiquer "standard assumes"
- Participating preferred = red flag majeur
- Fondateurs < 50% au Seed = attention`;

    const { data } = await this.llmCompleteJSON<LLMCapTableAuditResponse>(prompt);

    const validConcerns = ["none", "moderate", "significant"];
    const validReputation = ["unknown", "low", "medium", "high", "top_tier"];
    const validAdequacy = ["insufficient", "adequate", "generous"];

    return {
      ownershipBreakdown: {
        founders: data.ownershipBreakdown?.founders ?? 70,
        employees: data.ownershipBreakdown?.employees ?? 0,
        investors: data.ownershipBreakdown?.investors ?? 20,
        optionPool: data.ownershipBreakdown?.optionPool ?? 10,
        other: data.ownershipBreakdown?.other ?? 0,
      },
      founderDilution: {
        currentFounderOwnership: data.founderDilution?.currentFounderOwnership ?? 70,
        projectedPostRound: data.founderDilution?.projectedPostRound ?? 55,
        atSeriesA: data.founderDilution?.atSeriesA,
        atSeriesB: data.founderDilution?.atSeriesB,
        concern: validConcerns.includes(data.founderDilution?.concern)
          ? (data.founderDilution.concern as "none" | "moderate" | "significant")
          : "none",
      },
      investorAnalysis: {
        existingInvestors: Array.isArray(data.investorAnalysis?.existingInvestors)
          ? data.investorAnalysis.existingInvestors.map((i) => ({
              name: i.name ?? "Unknown",
              ownership: i.ownership ?? 0,
              reputation: validReputation.includes(i.reputation)
                ? (i.reputation as "unknown" | "low" | "medium" | "high" | "top_tier")
                : "unknown",
              signalValue: i.signalValue ?? "",
            }))
          : [],
        leadInvestorPresent: data.investorAnalysis?.leadInvestorPresent ?? false,
        followOnCapacity: data.investorAnalysis?.followOnCapacity ?? "Unknown",
      },
      roundTerms: {
        preMoneyValuation: data.roundTerms?.preMoneyValuation,
        roundSize: data.roundTerms?.roundSize,
        dilution: data.roundTerms?.dilution ?? 20,
        proRataRights: data.roundTerms?.proRataRights ?? true,
        liquidationPreference: data.roundTerms?.liquidationPreference ?? "1x non-participating (assume)",
        antiDilution: data.roundTerms?.antiDilution ?? "Broad-based weighted average (assume)",
        participatingPreferred: data.roundTerms?.participatingPreferred ?? false,
        concerns: Array.isArray(data.roundTerms?.concerns) ? data.roundTerms.concerns : [],
      },
      optionPoolAnalysis: {
        currentSize: data.optionPoolAnalysis?.currentSize ?? 10,
        adequacy: validAdequacy.includes(data.optionPoolAnalysis?.adequacy)
          ? (data.optionPoolAnalysis.adequacy as "insufficient" | "adequate" | "generous")
          : "adequate",
        refreshNeeded: data.optionPoolAnalysis?.refreshNeeded ?? false,
      },
      structuralRedFlags: Array.isArray(data.structuralRedFlags) ? data.structuralRedFlags : [],
      capTableScore: Math.min(100, Math.max(0, data.capTableScore ?? 70)),
    };
  }
}

export const capTableAuditor = new CapTableAuditorAgent();
