import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, TeamInvestigatorResult, TeamInvestigatorData } from "../types";

/**
 * Team Investigator Agent
 *
 * Mission: Analyser le background et la composition de l'equipe fondatrice.
 * Pour un BA, la qualite de l'equipe est souvent LE facteur decisif.
 *
 * Input:
 * - Infos fondateurs du pitch deck
 * - People Graph du Context Engine (LinkedIn, ventures precedentes)
 * - Background verification data
 *
 * Output:
 * - Profil detaille de chaque fondateur
 * - Evaluation de la complementarite
 * - Red flags (turnover, conflits, manque d'experience)
 * - Questions critiques a poser
 */

interface LLMTeamInvestigatorResponse {
  founderProfiles: {
    name: string;
    role: string;
    backgroundVerified: boolean;
    keyExperience: string[];
    previousVentures: {
      name: string;
      outcome: string;
      relevance: string;
    }[];
    domainExpertise: number;
    entrepreneurialExperience: number;
    redFlags: string[];
    networkStrength: string;
  }[];
  teamComposition: {
    technicalStrength: number;
    businessStrength: number;
    complementarity: number;
    gaps: string[];
    keyHiresToMake: string[];
  };
  cofounderDynamics: {
    equitySplit: string;
    vestingInPlace: boolean;
    workingHistory: string;
    potentialConflicts: string[];
  };
  overallTeamScore: number;
  criticalQuestions: string[];
}

export class TeamInvestigatorAgent extends BaseAgent<TeamInvestigatorData, TeamInvestigatorResult> {
  constructor() {
    super({
      name: "team-investigator",
      description: "Analyse le background et la composition de l'equipe fondatrice",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en due diligence specialise dans l'evaluation des equipes fondatrices.

TON ROLE:
- Verifier le background des fondateurs
- Evaluer l'expertise domaine et entrepreneuriale
- Analyser la complementarite de l'equipe
- Identifier les red flags potentiels
- Suggerer des questions de reference check

CRITERES D'EVALUATION DES FONDATEURS:

1. EXPERIENCE ENTREPRENEURIALE (25% du score equipe)
   - Exit precedent: +30 points
   - Startup precedente (3+ ans): +20 points
   - Role C-level en startup: +15 points
   - Premier entrepreneur: 0 points (neutre)
   - Echec recent non explique: -10 points

2. EXPERTISE DOMAINE (25%)
   - Expert reconnu du secteur: +30 points
   - 5+ ans dans le domaine: +20 points
   - Experience pertinente: +10 points
   - Hors domaine: -10 points

3. COMPLEMENTARITE EQUIPE (20%)
   - CEO/CTO bien definis: +20 points
   - Skills non-overlapping: +15 points
   - Gaps critiques non couverts: -15 points
   - Solo founder sans plan de recrutement: -10 points

4. NETWORK & CREDIBILITE (15%)
   - Investisseurs de renom dans le reseau: +15 points
   - Advisors pertinents: +10 points
   - Endorsements verifiables: +5 points
   - Reseau faible: -5 points

5. RED FLAGS POTENTIELS (15%)
   - Turnover recent dans l'equipe: -15 points
   - Litiges avec anciens cofondateurs: -20 points
   - CV embellis/non verifiables: -25 points
   - Conflits d'interets: -15 points

REGLES:
- Tout claim non verifiable = red flag potentiel
- Une equipe solo < equipe complementaire (sauf si track record exceptional)
- Les ventures precedentes comptent enormement (pattern matching)
- Le vesting non en place = red flag structurel

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<TeamInvestigatorData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    // Get extracted founder info
    const extractedInfo = this.getExtractedInfo(context);
    let foundersSection = "";
    if (extractedInfo?.founders) {
      foundersSection = `\n## Fondateurs (du Pitch Deck)\n${JSON.stringify(extractedInfo.founders, null, 2)}`;
    }

    // Get founders from DB
    const deal = context.deal as unknown as { founders?: { name: string; role: string; background?: string; linkedinUrl?: string }[] };
    if (deal.founders && deal.founders.length > 0) {
      foundersSection += `\n## Fondateurs (de la DB)\n${JSON.stringify(deal.founders, null, 2)}`;
    }

    // Get People Graph from Context Engine
    let peopleGraphSection = "";
    if (context.contextEngine?.peopleGraph) {
      peopleGraphSection = `\n## Background Verifie (Context Engine)\n${JSON.stringify(context.contextEngine.peopleGraph, null, 2)}`;
    }

    const prompt = `Analyse l'equipe fondatrice de cette startup:

${dealContext}
${foundersSection}
${peopleGraphSection}
${contextEngineData}

Realise une investigation complete de l'equipe.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "founderProfiles": [
    {
      "name": "string",
      "role": "string (CEO, CTO, COO, etc.)",
      "backgroundVerified": boolean,
      "keyExperience": ["string (experiences cles verifiees)"],
      "previousVentures": [
        {
          "name": "string",
          "outcome": "success|acquihire|failure|ongoing|unknown",
          "relevance": "string (pertinence pour ce projet)"
        }
      ],
      "domainExpertise": number (0-100),
      "entrepreneurialExperience": number (0-100),
      "redFlags": ["string"],
      "networkStrength": "weak|moderate|strong"
    }
  ],
  "teamComposition": {
    "technicalStrength": number (0-100),
    "businessStrength": number (0-100),
    "complementarity": number (0-100),
    "gaps": ["string (competences manquantes critiques)"],
    "keyHiresToMake": ["string (recrutements prioritaires)"]
  },
  "cofounderDynamics": {
    "equitySplit": "string (ex: 50/50, 60/40, solo)",
    "vestingInPlace": boolean,
    "workingHistory": "string (ont-ils deja travaille ensemble?)",
    "potentialConflicts": ["string"]
  },
  "overallTeamScore": number (0-100),
  "criticalQuestions": [
    "string (questions a poser pour valider/invalider les concerns)"
  ]
}
\`\`\`

IMPORTANT:
- backgroundVerified = true uniquement si les donnees Context Engine confirment
- Les red flags doivent etre specifiques et justifies
- Les questions critiques doivent cibler les zones d'ombre
- Score < 50 si fondateur solo sans track record OU gaps critiques non adresses`;

    const { data } = await this.llmCompleteJSON<LLMTeamInvestigatorResponse>(prompt);

    // Validate and normalize
    const validOutcomes = ["success", "acquihire", "failure", "ongoing", "unknown"];
    const validNetworkStrength = ["weak", "moderate", "strong"];

    const founderProfiles = Array.isArray(data.founderProfiles)
      ? data.founderProfiles.map((f) => ({
          name: f.name ?? "Unknown",
          role: f.role ?? "Founder",
          backgroundVerified: f.backgroundVerified ?? false,
          keyExperience: Array.isArray(f.keyExperience) ? f.keyExperience : [],
          previousVentures: Array.isArray(f.previousVentures)
            ? f.previousVentures.map((v) => ({
                name: v.name ?? "Unknown",
                outcome: validOutcomes.includes(v.outcome)
                  ? (v.outcome as "success" | "acquihire" | "failure" | "ongoing" | "unknown")
                  : "unknown",
                relevance: v.relevance ?? "",
              }))
            : [],
          domainExpertise: Math.min(100, Math.max(0, f.domainExpertise ?? 50)),
          entrepreneurialExperience: Math.min(100, Math.max(0, f.entrepreneurialExperience ?? 30)),
          redFlags: Array.isArray(f.redFlags) ? f.redFlags : [],
          networkStrength: validNetworkStrength.includes(f.networkStrength)
            ? (f.networkStrength as "weak" | "moderate" | "strong")
            : "moderate",
        }))
      : [];

    const teamComposition = {
      technicalStrength: Math.min(100, Math.max(0, data.teamComposition?.technicalStrength ?? 50)),
      businessStrength: Math.min(100, Math.max(0, data.teamComposition?.businessStrength ?? 50)),
      complementarity: Math.min(100, Math.max(0, data.teamComposition?.complementarity ?? 50)),
      gaps: Array.isArray(data.teamComposition?.gaps) ? data.teamComposition.gaps : [],
      keyHiresToMake: Array.isArray(data.teamComposition?.keyHiresToMake)
        ? data.teamComposition.keyHiresToMake
        : [],
    };

    const cofounderDynamics = {
      equitySplit: data.cofounderDynamics?.equitySplit ?? "Unknown",
      vestingInPlace: data.cofounderDynamics?.vestingInPlace ?? false,
      workingHistory: data.cofounderDynamics?.workingHistory ?? "Unknown",
      potentialConflicts: Array.isArray(data.cofounderDynamics?.potentialConflicts)
        ? data.cofounderDynamics.potentialConflicts
        : [],
    };

    return {
      founderProfiles,
      teamComposition,
      cofounderDynamics,
      overallTeamScore: Math.min(100, Math.max(0, data.overallTeamScore ?? 50)),
      criticalQuestions: Array.isArray(data.criticalQuestions) ? data.criticalQuestions : [],
    };
  }
}

export const teamInvestigator = new TeamInvestigatorAgent();
