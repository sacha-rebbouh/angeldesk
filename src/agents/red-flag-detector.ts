import { BaseAgent } from "./base-agent";
import type { AgentContext, RedFlagResult, DetectedRedFlag } from "./types";
import type { RedFlagCategory, RedFlagSeverity } from "@prisma/client";

interface RedFlagData {
  redFlags: DetectedRedFlag[];
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
}

interface LLMRedFlag {
  category: string;
  title: string;
  description: string;
  severity: string;
  confidenceScore: number;
  evidence: {
    type: string;
    content: string;
    source?: string;
  }[];
  questionsToAsk: string[];
  potentialMitigation?: string;
}

interface LLMResponse {
  redFlags: LLMRedFlag[];
  overallRiskLevel: string;
  summary: string;
}

export class RedFlagDetectorAgent extends BaseAgent<RedFlagData, RedFlagResult> {
  constructor() {
    super({
      name: "red-flag-detector",
      description: "Detects potential red flags and risks in a deal",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 60000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en due diligence specialise dans la detection de red flags.

TON ROLE:
- Identifier les signaux d'alerte dans un deal
- Evaluer la gravite de chaque red flag
- Fournir des preuves concretes
- Suggerer des questions a poser au fondateur

CATEGORIES DE RED FLAGS:
1. FOUNDER: Background douteux, conflits d'interets, turnover, manque d'experience, overselling
2. FINANCIAL: Metriques inconsistantes, burn rate eleve, valorisation excessive, projections irrealistes
3. MARKET: Marche trop petit, competition feroce, timing mauvais, barriers to entry faibles
4. PRODUCT: Pas de differentiation, tech risk, dependances critiques, pas de moat
5. DEAL_STRUCTURE: Terms abusifs, cap table problematique, gouvernance faible

NIVEAUX DE SEVERITE:
- CRITICAL: Dealbreaker potentiel, necessite resolution avant invest
- HIGH: Risque majeur, doit etre adresse
- MEDIUM: A surveiller, negociable
- LOW: Minor, bon a savoir

REGLES:
- Confidence score > 0.8 obligatoire pour reporter un red flag
- Toujours fournir des preuves (citations, calculs, donnees manquantes)
- Pas de faux positifs - chaque flag doit etre justifie
- Questions a poser = comment valider/invalider le red flag

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: AgentContext): Promise<RedFlagData> {
    const dealContext = this.formatDealContext(context);

    const prompt = `Analyse ce deal et detecte les red flags potentiels:

${dealContext}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "redFlags": [
    {
      "category": "FOUNDER|FINANCIAL|MARKET|PRODUCT|DEAL_STRUCTURE",
      "title": "string (court, descriptif)",
      "description": "string (explication detaillee)",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "confidenceScore": number (0-1, minimum 0.8 pour reporter),
      "evidence": [
        {
          "type": "quote|calculation|missing_info|external_data",
          "content": "string",
          "source": "string (optionnel)"
        }
      ],
      "questionsToAsk": ["string", ...],
      "potentialMitigation": "string (optionnel)"
    }
  ],
  "overallRiskLevel": "low|medium|high|critical",
  "summary": "string (synthese en 2-3 phrases)"
}
\`\`\`

IMPORTANT:
- Ne reporte QUE les red flags avec confidenceScore >= 0.8
- Chaque red flag doit avoir au moins une evidence
- overallRiskLevel = niveau du red flag le plus grave
- Si aucun red flag detecte, retourne une liste vide`;

    const { data } = await this.llmCompleteJSON<LLMResponse>(prompt);

    // Validate and normalize the response
    const validCategories: RedFlagCategory[] = ["FOUNDER", "FINANCIAL", "MARKET", "PRODUCT", "DEAL_STRUCTURE"];
    const validSeverities: RedFlagSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

    const redFlags: DetectedRedFlag[] = (data.redFlags ?? [])
      .filter((flag: LLMRedFlag) => flag.confidenceScore >= 0.8)
      .map((flag: LLMRedFlag) => ({
        category: validCategories.includes(flag.category as RedFlagCategory)
          ? (flag.category as RedFlagCategory)
          : "PRODUCT",
        title: flag.title ?? "Red flag detecte",
        description: flag.description ?? "",
        severity: validSeverities.includes(flag.severity as RedFlagSeverity)
          ? (flag.severity as RedFlagSeverity)
          : "MEDIUM",
        confidenceScore: Math.min(1, Math.max(0, flag.confidenceScore ?? 0.8)),
        evidence: Array.isArray(flag.evidence)
          ? flag.evidence.map((e) => ({
              type: (["quote", "calculation", "missing_info", "external_data"].includes(e.type)
                ? e.type
                : "quote") as "quote" | "calculation" | "missing_info" | "external_data",
              content: e.content ?? "",
              source: e.source,
            }))
          : [],
        questionsToAsk: Array.isArray(flag.questionsToAsk) ? flag.questionsToAsk : [],
        potentialMitigation: flag.potentialMitigation,
      }));

    // Determine overall risk level based on most severe flag
    let overallRiskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (redFlags.some((f) => f.severity === "CRITICAL")) {
      overallRiskLevel = "critical";
    } else if (redFlags.some((f) => f.severity === "HIGH")) {
      overallRiskLevel = "high";
    } else if (redFlags.some((f) => f.severity === "MEDIUM")) {
      overallRiskLevel = "medium";
    }

    return {
      redFlags,
      overallRiskLevel,
      summary: data.summary ?? (redFlags.length === 0
        ? "Aucun red flag majeur detecte avec un niveau de confiance suffisant."
        : `${redFlags.length} red flag(s) detecte(s), niveau de risque ${overallRiskLevel}.`),
    };
  }
}

// Export singleton instance
export const redFlagDetector = new RedFlagDetectorAgent();
