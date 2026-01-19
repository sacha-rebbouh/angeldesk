import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, LegalRegulatoryResult, LegalRegulatoryData } from "../types";

/**
 * Legal & Regulatory Agent
 *
 * Mission: Identifier les risques juridiques et regulatoires.
 * Fintech, Healthtech, AI = attention particuliere requise.
 */

interface LLMLegalRegulatoryResponse {
  structureAnalysis: {
    entityType: string;
    jurisdiction: string;
    appropriateness: string;
    concerns: string[];
  };
  regulatoryExposure: {
    sector: string;
    primaryRegulations: string[];
    complianceStatus: string;
    upcomingRegulations: string[];
    riskLevel: string;
  };
  ipRisks: {
    patentInfringement: string;
    copyrightIssues: string[];
    trademarkConflicts: string[];
  };
  contractualRisks: {
    keyContracts: string[];
    concerningClauses: string[];
    customerConcentrationRisk: boolean;
  };
  litigationRisk: {
    currentLitigation: boolean;
    potentialClaims: string[];
    riskLevel: string;
  };
  legalScore: number;
  criticalIssues: string[];
}

export class LegalRegulatoryAgent extends BaseAgent<LegalRegulatoryData, LegalRegulatoryResult> {
  constructor() {
    super({
      name: "legal-regulatory",
      description: "Identifie les risques juridiques et regulatoires",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un avocat M&A/VC senior specialise dans la due diligence legale de startups.

TON ROLE:
- Evaluer la structure juridique et sa pertinence
- Identifier l'exposition regulatoire (GDPR, AI Act, secteur finance, etc.)
- Detecter les risques IP, contractuels et litige
- Signaler les issues critiques qui bloquent un deal

STRUCTURE JURIDIQUE:
- SAS (France): Standard pour startups, flexible
- SARL: Moins adapte pour lever
- Delaware C-Corp: Standard US, bien pour VCs US
- Holding complexe: Attention aux raisons

REGULATIONS PAR SECTEUR:
1. FINTECH: ACPR, DSP2, AML/KYC, MiCA
2. HEALTHTECH: RGPD donnees sante, CE marking, FDA
3. AI/ML: AI Act EU, biais algorithmiques, explicabilite
4. EDTECH: Protection mineurs, donnees education
5. SAAS B2B: RGPD, cloud souverain, SOC2

RISQUES IP:
- Brevets concurrents (freedom to operate)
- Code open-source (licences virales GPL)
- Propriete du code (employes/freelances)

RED FLAGS JURIDIQUES:
- Pas de vesting en place
- Contentieux fondateurs
- Licences non-compatibles
- Non-conformite RGPD
- Structure offshore suspecte

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<LegalRegulatoryData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    const prompt = `Analyse les risques juridiques et regulatoires:

${dealContext}
${contextEngineData}

Identifie tous les risques legaux.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "structureAnalysis": {
    "entityType": "string (SAS, SARL, C-Corp, etc.)",
    "jurisdiction": "string (France, Delaware, etc.)",
    "appropriateness": "appropriate|suboptimal|concerning",
    "concerns": ["string"]
  },
  "regulatoryExposure": {
    "sector": "string",
    "primaryRegulations": ["string (regulations applicables)"],
    "complianceStatus": "unknown|non_compliant|partial|compliant",
    "upcomingRegulations": ["string (futures regulations)"],
    "riskLevel": "low|medium|high|critical"
  },
  "ipRisks": {
    "patentInfringement": "none|possible|likely",
    "copyrightIssues": ["string"],
    "trademarkConflicts": ["string"]
  },
  "contractualRisks": {
    "keyContracts": ["string (contrats critiques identifies)"],
    "concerningClauses": ["string"],
    "customerConcentrationRisk": boolean
  },
  "litigationRisk": {
    "currentLitigation": boolean,
    "potentialClaims": ["string"],
    "riskLevel": "low|medium|high"
  },
  "legalScore": number (0-100),
  "criticalIssues": ["string (issues bloquantes pour investissement)"]
}
\`\`\`

IMPORTANT:
- Fintech/Healthtech/AI = risque regulatoire eleve par defaut
- Pas d'info sur la structure = noter comme concern
- Score < 30 si issues critiques bloquantes`;

    const { data } = await this.llmCompleteJSON<LLMLegalRegulatoryResponse>(prompt);

    const validAppropriateness = ["appropriate", "suboptimal", "concerning"];
    const validCompliance = ["unknown", "non_compliant", "partial", "compliant"];
    const validRiskLevels = ["low", "medium", "high", "critical"];
    const validPatent = ["none", "possible", "likely"];
    const validLitigationRisk = ["low", "medium", "high"];

    return {
      structureAnalysis: {
        entityType: data.structureAnalysis?.entityType ?? "Unknown",
        jurisdiction: data.structureAnalysis?.jurisdiction ?? "Unknown",
        appropriateness: validAppropriateness.includes(data.structureAnalysis?.appropriateness)
          ? (data.structureAnalysis.appropriateness as "appropriate" | "suboptimal" | "concerning")
          : "appropriate",
        concerns: Array.isArray(data.structureAnalysis?.concerns)
          ? data.structureAnalysis.concerns
          : [],
      },
      regulatoryExposure: {
        sector: data.regulatoryExposure?.sector ?? context.deal.sector ?? "Unknown",
        primaryRegulations: Array.isArray(data.regulatoryExposure?.primaryRegulations)
          ? data.regulatoryExposure.primaryRegulations
          : [],
        complianceStatus: validCompliance.includes(data.regulatoryExposure?.complianceStatus)
          ? (data.regulatoryExposure.complianceStatus as "unknown" | "non_compliant" | "partial" | "compliant")
          : "unknown",
        upcomingRegulations: Array.isArray(data.regulatoryExposure?.upcomingRegulations)
          ? data.regulatoryExposure.upcomingRegulations
          : [],
        riskLevel: validRiskLevels.includes(data.regulatoryExposure?.riskLevel)
          ? (data.regulatoryExposure.riskLevel as "low" | "medium" | "high" | "critical")
          : "medium",
      },
      ipRisks: {
        patentInfringement: validPatent.includes(data.ipRisks?.patentInfringement)
          ? (data.ipRisks.patentInfringement as "none" | "possible" | "likely")
          : "none",
        copyrightIssues: Array.isArray(data.ipRisks?.copyrightIssues)
          ? data.ipRisks.copyrightIssues
          : [],
        trademarkConflicts: Array.isArray(data.ipRisks?.trademarkConflicts)
          ? data.ipRisks.trademarkConflicts
          : [],
      },
      contractualRisks: {
        keyContracts: Array.isArray(data.contractualRisks?.keyContracts)
          ? data.contractualRisks.keyContracts
          : [],
        concerningClauses: Array.isArray(data.contractualRisks?.concerningClauses)
          ? data.contractualRisks.concerningClauses
          : [],
        customerConcentrationRisk: data.contractualRisks?.customerConcentrationRisk ?? false,
      },
      litigationRisk: {
        currentLitigation: data.litigationRisk?.currentLitigation ?? false,
        potentialClaims: Array.isArray(data.litigationRisk?.potentialClaims)
          ? data.litigationRisk.potentialClaims
          : [],
        riskLevel: validLitigationRisk.includes(data.litigationRisk?.riskLevel)
          ? (data.litigationRisk.riskLevel as "low" | "medium" | "high")
          : "low",
      },
      legalScore: Math.min(100, Math.max(0, data.legalScore ?? 60)),
      criticalIssues: Array.isArray(data.criticalIssues) ? data.criticalIssues : [],
    };
  }
}

export const legalRegulatory = new LegalRegulatoryAgent();
