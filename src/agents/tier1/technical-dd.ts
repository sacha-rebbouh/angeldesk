import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, TechnicalDDResult, TechnicalDDData } from "../types";

/**
 * Technical DD Agent
 *
 * Mission: Evaluer la solidite technique du produit et les risques tech.
 * Meme un BA non-tech doit comprendre si le produit tient la route.
 */

interface LLMTechnicalDDResponse {
  techStackAssessment: {
    stack: string[];
    appropriateness: string;
    scalability: string;
    concerns: string[];
  };
  technicalDebt: {
    estimated: string;
    indicators: string[];
  };
  productMaturity: {
    stage: string;
    stability: number;
    featureCompleteness: number;
  };
  technicalRisks: {
    risk: string;
    severity: string;
    mitigation?: string;
  }[];
  ipProtection: {
    hasPatents: boolean;
    patentsPending: number;
    tradeSecrets: boolean;
    openSourceRisk: string;
  };
  securityPosture: {
    assessment: string;
    concerns: string[];
  };
  technicalScore: number;
}

export class TechnicalDDAgent extends BaseAgent<TechnicalDDData, TechnicalDDResult> {
  constructor() {
    super({
      name: "technical-dd",
      description: "Evalue la solidite technique et les risques tech",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un CTO/VPE avec 15+ ans d'experience, specialise dans la due diligence technique.

TON ROLE:
- Evaluer la stack technique et son adequation
- Estimer le niveau de dette technique
- Identifier les risques techniques majeurs
- Evaluer la maturite produit et la scalabilite

EVALUATION STACK TECHNIQUE:
- Modern vs Legacy (React, Node, Go = OK; PHP5, jQuery = attention)
- Adequation au probleme (ML pour un CRUD = overkill)
- Scalabilite architecture (monolith vs microservices, DB choices)
- Vendor lock-in (AWS/GCP specifique vs portable)

INDICATEURS DETTE TECHNIQUE:
- Temps entre releases (> 2 semaines = mauvais signe early stage)
- Ratio devs/features (beaucoup de devs, peu de features = red flag)
- Nombre de bugs critiques en prod
- Documentation et tests

MATURITE PRODUIT:
- Prototype: POC, pas en prod
- MVP: Premiere version utilisable
- Beta: Utilisateurs reels, encore instable
- Production: Stable, utilisateurs payants
- Scale: Gere charge significative

RISQUES TECHNIQUES:
- Single point of failure (tech ou humain)
- Dependances critiques (APIs tierces, libs abandonnees)
- Complexite IA/ML (si applicable)
- Securite et conformite

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<TechnicalDDData> {
    const dealContext = this.formatDealContext(context);
    const extractedInfo = this.getExtractedInfo(context);

    let techSection = "";
    if (extractedInfo) {
      const techData = {
        techStack: extractedInfo.techStack,
        productDescription: extractedInfo.productDescription,
      };
      techSection = `\n## Donnees Techniques du Deck\n${JSON.stringify(techData, null, 2)}`;
    }

    const prompt = `Realise une due diligence technique de cette startup:

${dealContext}
${techSection}

Evalue la solidite technique.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "techStackAssessment": {
    "stack": ["string (technologies identifiees)"],
    "appropriateness": "poor|acceptable|good|excellent",
    "scalability": "low|medium|high",
    "concerns": ["string (concerns techniques)"]
  },
  "technicalDebt": {
    "estimated": "low|moderate|high|critical",
    "indicators": ["string (indicateurs de dette)"]
  },
  "productMaturity": {
    "stage": "prototype|mvp|beta|production|scale",
    "stability": number (0-100),
    "featureCompleteness": number (0-100)
  },
  "technicalRisks": [
    {
      "risk": "string",
      "severity": "low|medium|high",
      "mitigation": "string (optionnel)"
    }
  ],
  "ipProtection": {
    "hasPatents": boolean,
    "patentsPending": number,
    "tradeSecrets": boolean,
    "openSourceRisk": "none|low|medium|high"
  },
  "securityPosture": {
    "assessment": "poor|basic|good|excellent",
    "concerns": ["string"]
  },
  "technicalScore": number (0-100)
}
\`\`\`

IMPORTANT:
- Si peu d'infos tech, noter les lacunes comme concerns
- Un produit "production" sans stack claire = red flag
- Score bas si risques critiques non mitiges`;

    const { data } = await this.llmCompleteJSON<LLMTechnicalDDResponse>(prompt);

    const validAppropriateness = ["poor", "acceptable", "good", "excellent"];
    const validScalability = ["low", "medium", "high"];
    const validDebt = ["low", "moderate", "high", "critical"];
    const validStages = ["prototype", "mvp", "beta", "production", "scale"];
    const validSeverity = ["low", "medium", "high"];
    const validOSRisk = ["none", "low", "medium", "high"];
    const validSecurity = ["poor", "basic", "good", "excellent"];

    return {
      techStackAssessment: {
        stack: Array.isArray(data.techStackAssessment?.stack)
          ? data.techStackAssessment.stack
          : [],
        appropriateness: validAppropriateness.includes(data.techStackAssessment?.appropriateness)
          ? (data.techStackAssessment.appropriateness as "poor" | "acceptable" | "good" | "excellent")
          : "acceptable",
        scalability: validScalability.includes(data.techStackAssessment?.scalability)
          ? (data.techStackAssessment.scalability as "low" | "medium" | "high")
          : "medium",
        concerns: Array.isArray(data.techStackAssessment?.concerns)
          ? data.techStackAssessment.concerns
          : [],
      },
      technicalDebt: {
        estimated: validDebt.includes(data.technicalDebt?.estimated)
          ? (data.technicalDebt.estimated as "low" | "moderate" | "high" | "critical")
          : "moderate",
        indicators: Array.isArray(data.technicalDebt?.indicators)
          ? data.technicalDebt.indicators
          : [],
      },
      productMaturity: {
        stage: validStages.includes(data.productMaturity?.stage)
          ? (data.productMaturity.stage as "prototype" | "mvp" | "beta" | "production" | "scale")
          : "mvp",
        stability: Math.min(100, Math.max(0, data.productMaturity?.stability ?? 50)),
        featureCompleteness: Math.min(100, Math.max(0, data.productMaturity?.featureCompleteness ?? 50)),
      },
      technicalRisks: Array.isArray(data.technicalRisks)
        ? data.technicalRisks.map((r) => ({
            risk: r.risk ?? "",
            severity: validSeverity.includes(r.severity)
              ? (r.severity as "low" | "medium" | "high")
              : "medium",
            mitigation: r.mitigation,
          }))
        : [],
      ipProtection: {
        hasPatents: data.ipProtection?.hasPatents ?? false,
        patentsPending: data.ipProtection?.patentsPending ?? 0,
        tradeSecrets: data.ipProtection?.tradeSecrets ?? false,
        openSourceRisk: validOSRisk.includes(data.ipProtection?.openSourceRisk)
          ? (data.ipProtection.openSourceRisk as "none" | "low" | "medium" | "high")
          : "low",
      },
      securityPosture: {
        assessment: validSecurity.includes(data.securityPosture?.assessment)
          ? (data.securityPosture.assessment as "poor" | "basic" | "good" | "excellent")
          : "basic",
        concerns: Array.isArray(data.securityPosture?.concerns)
          ? data.securityPosture.concerns
          : [],
      },
      technicalScore: Math.min(100, Math.max(0, data.technicalScore ?? 50)),
    };
  }
}

export const technicalDD = new TechnicalDDAgent();
