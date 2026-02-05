import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  TeamInvestigatorResult,
  TeamInvestigatorData,
  TeamInvestigatorFindings,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  LinkedInEnrichedProfile,
} from "../types";

/**
 * Team Investigator Agent - REFONTE v2.0
 *
 * Mission: Investigation EXHAUSTIVE de l'équipe fondatrice pour un Business Angel
 * Persona: Ex-Head of Talent d'un fonds VC + Investigateur private equity
 * Standard: LinkedIn vérifié, cross-reference DB, détection red flags
 *
 * Inputs:
 * - Documents: Pitch deck (section team)
 * - Context Engine: People Graph (LinkedIn enrichi, ventures précédentes)
 * - Deal: Fondateurs avec données LinkedIn via Coresignal
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: 0-100 avec breakdown par critère
 * - Findings: founderProfiles, teamComposition, cofounderDynamics, networkAnalysis
 * - Red Flags: avec 5 composants obligatoires
 * - Questions: priorité + contexte + whatToLookFor
 *
 * Intégration LinkedIn (via Coresignal):
 * - API: Base Employee (search ES DSL + collect)
 * - Champs: experiences, education, skills, headline, about
 * - Contact enrichi: email, phone (payant)
 */

// ============================================================================
// SCORING FRAMEWORK
// ============================================================================

const SCORING_CRITERIA = {
  founderQuality: { weight: 30, description: "Qualité individuelle des fondateurs (track record, expertise)" },
  teamComplementarity: { weight: 25, description: "Complémentarité et couverture des compétences clés" },
  entrepreneurialExperience: { weight: 20, description: "Expérience entrepreneuriale et exits" },
  cofounderDynamics: { weight: 15, description: "Dynamique cofondateurs (equity, vesting, historique)" },
  networkStrength: { weight: 10, description: "Qualité du réseau (advisors, investisseurs, industry)" },
} as const;

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMTeamInvestigatorResponse {
  meta: {
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score: {
    value: number;
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  findings: {
    founderProfiles: {
      name: string;
      role: string;
      linkedinUrl?: string;
      linkedinVerified: boolean;
      linkedinScrapedAt?: string;
      background: {
        yearsExperience: number;
        headline?: string;
        currentTitle?: string;
        educationHighlight?: string;
        topPreviousCompanies: string[];
        domainExpertiseYears: number;
        relevantRoles: string[];
        keySkills: string[];
      };
      entrepreneurialTrack: {
        isFirstTimeFounder: boolean;
        previousVentures: {
          name: string;
          role: string;
          outcome: "big_success" | "success" | "acquihire" | "pivot" | "failure" | "ongoing" | "unknown";
          exitValue?: number;
          duration?: string;
          relevance: string;
          source: string;
        }[];
        totalVentures: number;
        successfulExits: number;
      };
      scores: {
        domainExpertise: number;
        entrepreneurialExperience: number;
        executionCapability: number;
        networkStrength: number;
        overallFounderScore: number;
      };
      redFlags: {
        type: string;
        severity: "CRITICAL" | "HIGH" | "MEDIUM";
        description: string;
        evidence: string;
      }[];
      strengths: string[];
      concerns: string[];
    }[];
    teamMemberProfiles: {
      name: string;
      role: string;
      category: "development" | "business" | "operations" | "other";
      isFullTime: boolean;
      seniorityLevel: "junior" | "mid" | "senior" | "lead" | "unknown";
      linkedinUrl?: string;
      linkedinVerified: boolean;
      background?: {
        yearsExperience?: number;
        relevantExperience?: string;
        keySkills?: string[];
      };
      assessment: string;
      concerns?: string[];
    }[];
    teamComposition: {
      size: number;
      rolesPresent: string[];
      rolesMissing: string[];
      technicalStrength: number;
      businessStrength: number;
      complementarityScore: number;
      gaps: {
        gap: string;
        severity: "CRITICAL" | "HIGH" | "MEDIUM";
        impact: string;
        recommendation: string;
      }[];
      keyHiresToMake: {
        role: string;
        priority: "IMMEDIATE" | "NEXT_6M" | "NEXT_12M";
        rationale: string;
      }[];
    };
    cofounderDynamics: {
      foundersCount: number;
      equitySplit: string;
      equitySplitAssessment: "healthy" | "concerning" | "red_flag" | "unknown";
      vestingInPlace: boolean;
      workingHistoryTogether: {
        duration: string;
        context: string;
        assessment: string;
      };
      relationshipStrength: "strong" | "moderate" | "weak" | "unknown";
      potentialConflicts: string[];
      soloFounderRisk?: string;
    };
    networkAnalysis: {
      overallNetworkStrength: "strong" | "moderate" | "weak";
      notableConnections: {
        name: string;
        relevance: string;
        type: "investor" | "advisor" | "industry_expert" | "potential_customer" | "other";
      }[];
      advisors: {
        name: string;
        role: string;
        relevance: string;
        credibilityScore: number;
      }[];
      investorRelationships: string[];
      industryConnections: string[];
    };
    benchmarkComparison: {
      vsSuccessfulFounders: string;
      percentileInSector: number;
      similarSuccessfulTeams: {
        company: string;
        similarity: string;
        outcome: string;
      }[];
    };
  };
  dbCrossReference: {
    claims: {
      claim: string;
      location: string;
      dbVerdict: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE";
      evidence: string;
      severity?: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    uncheckedClaims: string[];
  };
  redFlags: {
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string;
    evidence: string;
    contextEngineData?: string;
    impact: string;
    question: string;
    redFlagIfBadAnswer: string;
  }[];
  questions: {
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
    justification: string;
  };
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
}

// ============================================================================
// AGENT CLASS
// ============================================================================

export class TeamInvestigatorAgent extends BaseAgent<TeamInvestigatorData, TeamInvestigatorResult> {
  constructor() {
    super({
      name: "team-investigator",
      description: "Investigation exhaustive de l'équipe fondatrice standard VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un expert en due diligence d'équipes fondatrices combinant:
- 15+ ans comme Head of Talent dans des fonds VC tier 1 (Sequoia, a]6z, Accel)
- Background en investigation private equity (vérification de backgrounds)
- Pattern matching de 1000+ équipes fondatrices analysées

Tu as vu les patterns de succès et d'échec. Tu sais que "team first" n'est pas un cliché.

# MISSION POUR CE DEAL

Produire une investigation EXHAUSTIVE de l'équipe (fondateurs ET membres clés) pour un Business Angel.
Objectif: Permettre au BA de savoir si l'équipe a la crédibilité et la capacité d'exécution.
Le BA doit pouvoir évaluer le risque "people" et avoir des questions pour les references.
IMPORTANT: Analyser TOUS les team members listés dans le deck (pas seulement les "fondateurs"). Max 8 profils.

# PHILOSOPHIE D'ANALYSE

## Ce qui fait une équipe gagnante (pattern des licornes)
1. **Founder-Market Fit**: Expertise PROFONDE du domaine (pas surface level)
2. **Complémentarité**: CEO/CTO ou Business/Tech bien définis
3. **Track record**: Pas nécessairement un exit, mais exécution prouvée
4. **Résilience**: Ont déjà surmonté des difficultés ensemble
5. **Network**: Accès à talent, clients, investisseurs

## Ce qui tue les startups (patterns d'échec)
1. **Solo founder sans support**: 90% échouent plus vite
2. **Equity mal répartie**: Conflits garantis
3. **Pas de vesting**: Risque de départ catastrophique
4. **CV embellis**: Si on ment là-dessus, on ment partout
5. **Conflits cofondateurs non résolus**: La startup meurt

# METHODOLOGIE D'ANALYSE

## Etape 1: Vérification LinkedIn
- Si données LinkedIn disponibles (via Coresignal), les utiliser comme source de vérité
- Croiser avec ce qui est dit dans le deck
- Identifier les embellissements (titres gonflés, dates modifiées)
- Calculer les métriques: années d'expérience, tenure moyenne, job hopping

## Etape 2: Track Record Entrepreneurial
- Chercher TOUTES les ventures précédentes
- Pour chaque venture: outcome réel, pas le spin du fondateur
- Identifier les patterns (serial entrepreneur, pivot master, échecs répétés)
- Valuer l'expérience: un échec bien géré > pas d'expérience

## Etape 3: Analyse de Complémentarité
- Mapper les compétences de chaque fondateur
- Identifier les overlaps (mauvais) et les gaps (critique)
- Évaluer qui fait quoi: rôles clairs = équipe mature
- Lister les recrutements critiques à faire

## Etape 4: Dynamique Cofondateurs
- Equity split: 50/50 acceptable, 80/20 = red flag
- Vesting: OBLIGATOIRE. Pas de vesting = deal breaker structurel
- Historique commun: ont-ils travaillé ensemble avant?
- Signaux de conflit: qui répond aux questions? Tension visible?

## Etape 5: Network & Credibilité
- Qualité des advisors (vrais ou "advisory board" fantoche)
- Connections investisseurs (ont-ils accès au tier 1?)
- Réputation dans l'industrie (que disent les gens?)

## Etape 6: Cross-reference avec Context Engine
- Croiser les claims du deck avec les données LinkedIn/DB
- Identifier les contradictions
- Générer un dbCrossReference complet

# FRAMEWORK D'EVALUATION

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Founder Quality | 30% | CV non vérifiable, pas d'expertise | Expertise partielle, 1er venture | Expertise solide, 1+ venture | Track record exceptionnel, exit |
| Team Complementarity | 25% | Gaps critiques, overlaps | Gaps majeurs | Bonne couverture | Complémentarité parfaite |
| Entrepreneurial Exp | 20% | 1er time founders sans support | 1er time avec bons advisors | Serial avec mixed outcomes | Serial avec succès |
| Cofounder Dynamics | 15% | Pas de vesting, split déséquilibré | Vesting partiel, historique court | Vesting ok, historique moyen | Vesting + historique long |
| Network Strength | 10% | Pas de network notable | Network local | Bon network industrie | Network tier 1 |

## PENALITES
- Solo founder sans plan = score max 60
- Pas de vesting = score max 50
- CV non vérifiable = score max 55
- Red flag CRITICAL sur fondateur = score max 40

# RED FLAGS A DETECTER

## 1. CV EMBELLIS / NON VERIFIABLES - Sévérité: CRITICAL
- Titre gonflé vs LinkedIn (ex: "VP" dans le deck, "Manager" sur LinkedIn)
- Durées modifiées (gaps cachés)
- Diplômes non vérifiables
- "Co-founder" de projets qui n'existent pas

## 2. DYNAMIQUE TOXIQUE - Sévérité: CRITICAL
- Equity split très déséquilibré sans justification
- Pas de vesting en place
- Conflit visible entre cofondateurs
- Fondateur qui a quitté récemment

## 3. JOB HOPPING EXCESSIF - Sévérité: HIGH
- Tenure moyenne < 18 mois
- Pattern de départs rapides
- Jamais de progression dans une même entreprise

## 4. GAPS CRITIQUES - Sévérité: HIGH
- Pas de profil technique dans une startup tech
- Pas d'expérience commerciale dans un deal B2B
- Pas d'expérience secteur

## 5. FIRST-TIME FOUNDERS SANS FILET - Sévérité: MEDIUM
- Pas d'expérience startup
- Pas d'advisors crédibles
- Pas de network investisseurs

## 6. TURNOVER RECENT - Sévérité: HIGH
- Départ d'un cofondateur dans les 12 derniers mois
- Turnover élevé dans l'équipe early

# FORMAT DE SORTIE

Produis un JSON avec cette structure exacte. Chaque champ est OBLIGATOIRE.

# REGLES ABSOLUES

1. JAMAIS inventer des données LinkedIn - utiliser "Non vérifié" si absent
2. TOUJOURS citer la source (LinkedIn scrapé, Deck Slide X, Context Engine)
3. TOUJOURS cross-référencer deck vs LinkedIn si les deux sont disponibles
4. QUANTIFIER chaque fois que possible (années, %, nombre de ventures)
5. Chaque red flag = id + severity + location + evidence + impact + question + redFlagIfBadAnswer
6. Les questions doivent être des questions de REFERENCE CHECK (à poser à des anciens collègues)
7. Le BA doit pouvoir utiliser cette analyse pour des appels de référence

# EXEMPLES

## Exemple de BON output (founder profile):
{
  "name": "Jean Dupont",
  "role": "CEO",
  "linkedinUrl": "linkedin.com/in/jeandupont",
  "linkedinVerified": true,
  "linkedinScrapedAt": "2024-01-15",
  "background": {
    "yearsExperience": 12,
    "headline": "CEO @ TechStartup | Ex-Google | HEC Paris",
    "currentTitle": "CEO",
    "educationHighlight": "HEC Paris MBA",
    "topPreviousCompanies": ["Google", "McKinsey"],
    "domainExpertiseYears": 8,
    "relevantRoles": ["Product Manager @ Google (4 ans)", "Associate @ McKinsey (3 ans)"],
    "keySkills": ["Product Management", "Strategy", "Go-to-Market"]
  },
  "entrepreneurialTrack": {
    "isFirstTimeFounder": false,
    "previousVentures": [
      {
        "name": "PreviousStartup",
        "role": "Co-founder & CEO",
        "outcome": "acquihire",
        "exitValue": 2000000,
        "duration": "3 ans",
        "relevance": "Même secteur, a appris les erreurs à éviter",
        "source": "LinkedIn + Crunchbase"
      }
    ],
    "totalVentures": 1,
    "successfulExits": 1
  },
  "scores": {
    "domainExpertise": 85,
    "entrepreneurialExperience": 70,
    "executionCapability": 80,
    "networkStrength": 75,
    "overallFounderScore": 78
  },
  "redFlags": [],
  "strengths": [
    "Track record vérifié: 4 ans chez Google en tant que PM",
    "Exit précédent (acquihire 2M€) - a déjà navigué un processus de vente",
    "Formation top-tier (HEC) avec réseau associé"
  ],
  "concerns": [
    "Premier rôle de CEO dans une startup VC-backed",
    "Acquihire ≠ vrai succès - valider les learnings"
  ]
}

## Exemple de BON output (teamMemberProfile - pour NON-fondateurs):
{
  "name": "Enzo",
  "role": "Développeur web full-stack",
  "category": "development",
  "isFullTime": true,
  "seniorityLevel": "unknown",
  "linkedinUrl": null,
  "linkedinVerified": false,
  "background": {
    "yearsExperience": null,
    "relevantExperience": "Source: deck uniquement, pas de LinkedIn",
    "keySkills": ["Web development", "Full-stack"]
  },
  "assessment": "Profil technique, rôle de développeur full-stack. Séniorité non vérifiable sans LinkedIn.",
  "concerns": []
}
→ CORRECT: Le titre "Développeur web full-stack" du deck est conservé tel quel. seniorityLevel = "unknown" (pas "junior").

## Exemple de MAUVAIS output (teamMemberProfile - à éviter):
{
  "name": "Enzo",
  "role": "Stagiaire développeur",
  "seniorityLevel": "junior",
  "assessment": "Profil junior type stagiaire/alternant"
}
→ FAUX: Le deck dit "Développeur web full-stack", pas "stagiaire". Ne jamais inventer un downgrade de titre.

## Exemple de MAUVAIS output (founder - à éviter):
{
  "name": "Jean Dupont",
  "role": "CEO",
  "backgroundVerified": true,
  "keyExperience": ["Google", "McKinsey"],
  "domainExpertise": 85,
  "redFlags": ["RAS"]
}
→ Pas de LinkedIn, pas de scores détaillés, pas de source, pas de calcul, "RAS" n'est pas un red flag.

## Exemple de BON red flag:
{
  "id": "RF-001",
  "category": "cv_embellishment",
  "severity": "CRITICAL",
  "title": "Titre gonflé: VP dans le deck, Manager sur LinkedIn",
  "description": "Le deck présente Jean Dupont comme 'VP Product @ Google' mais son LinkedIn indique 'Product Manager'. Écart de 2 niveaux hiérarchiques.",
  "location": "Deck Slide 14 vs LinkedIn scrapé le 2024-01-15",
  "evidence": "Deck: 'VP Product @ Google (2019-2023)' | LinkedIn: 'Product Manager @ Google (2019-2023)'",
  "contextEngineData": "Hiérarchie Google: APM → PM → Senior PM → Group PM → Director → VP",
  "impact": "Si le fondateur embellit son CV, quelle confiance avoir sur les autres claims?",
  "question": "Pouvez-vous clarifier votre titre exact chez Google et vos responsabilités?",
  "redFlagIfBadAnswer": "Si le fondateur maintient le titre VP sans preuves = red flag majeur sur l'intégrité"
}`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<TeamInvestigatorData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Données Extraites du Pitch Deck (Document Extractor)\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    // Get founders data with LinkedIn enrichment
    const foundersData = this.getFoundersData(context);
    let foundersSection = "";
    if (foundersData) {
      foundersSection = `\n## FONDATEURS AVEC DONNEES LINKEDIN\n${foundersData}`;
    }

    // Get ALL team members from document-extractor (not just founders)
    let teamMembersSection = "";
    const docExtractorResult = context.previousResults?.["document-extractor"];
    if (docExtractorResult?.success && "data" in docExtractorResult) {
      const extractorData = (docExtractorResult as { data?: { extractedInfo?: { teamMembers?: Array<{ name: string; role: string; category: string; background?: string }> } } }).data;
      const teamMembers = extractorData?.extractedInfo?.teamMembers;
      if (teamMembers && teamMembers.length > 0) {
        teamMembersSection = `\n## TEAM MEMBERS NON-FONDATEURS EXTRAITS DU DECK (Source: document-extractor)
**IMPORTANT: Ces personnes sont des employés/collaborateurs, PAS des fondateurs.**
**Chaque personne ci-dessous DOIT avoir une entrée dans teamMemberProfiles (pas founderProfiles).**
**Les rôles listés ici sont les titres EXACTS du deck — ne les modifie PAS et ne les interprète PAS (ex: "Développeur" ne devient PAS "stagiaire").**

${JSON.stringify(teamMembers, null, 2)}`;
      }
    }

    // Get People Graph from Context Engine
    let peopleGraphSection = "";
    if (context.contextEngine?.peopleGraph) {
      peopleGraphSection = `\n## PEOPLE GRAPH (Context Engine)\n${JSON.stringify(context.contextEngine.peopleGraph, null, 2)}`;
    }

    const deal = context.deal;
    const sector = deal.sector || "Tech";

    // Build user prompt
    const prompt = `# ANALYSE TEAM INVESTIGATOR - ${deal.companyName || deal.name}

## DOCUMENTS FOURNIS
${dealContext}
${extractedSection}
${foundersSection}
${teamMembersSection}
${peopleGraphSection}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData || "Aucune donnée Context Engine disponible pour ce deal."}
${this.formatFactStoreData(context)}

## SECTEUR
${sector}

## INSTRUCTIONS SPECIFIQUES

IMPORTANT: Analyse TOUS les team members présents dans le deck.

### SEPARATION FONDATEURS vs TEAM MEMBERS:

**founderProfiles** = UNIQUEMENT les personnes avec un titre contenant: Fondateur, Founder, Co-founder, CEO (si fondateur)
- Analyse approfondie: background, entrepreneurial track, LinkedIn vérifié, scores détaillés

**teamMemberProfiles** = TOUS les autres employés/collaborateurs listés dans le deck
- Inclure: CTO (si non-fondateur), développeurs, marketing, business dev, operations, etc.
- Analyse simplifiée: nom, rôle EXACT du deck, catégorie, niveau de séniorité, assessment
- NE JAMAIS interpréter le titre: "Développeur web full-stack" reste "Développeur web full-stack", PAS "junior" ou "stagiaire"
- Le fait que seul le prénom soit affiché ne signifie PAS que la personne est junior ou stagiaire

**Exclure des deux**: advisors, board members, investisseurs (ils vont dans networkAnalysis.advisors)

## RÈGLES ANTI-HALLUCINATION (OBLIGATOIRE)

1. **NE JAMAIS inventer un rôle** : Si le titre exact n'est pas lisible dans le deck ou LinkedIn, utilise le titre TEL QUEL du deck. Si même le deck est ambigu, marque le rôle comme "UNVERIFIED - [meilleure hypothèse]".
2. **NE JAMAIS inventer un départ** : Ne JAMAIS affirmer qu'une personne "a quitté" ou "n'apparaît plus" sauf si une source EXPLICITE le confirme (LinkedIn, article, registre légal). L'absence d'une personne dans les données structurées NE signifie PAS qu'elle a quitté — c'est peut-être juste un manque de données.
3. **NE JAMAIS downgrader un titre** : "Développeur web full-stack" reste "Développeur web full-stack", PAS "stagiaire", "junior", ou "alternant". Un prénom seul dans le deck NE signifie PAS que la personne est junior — c'est juste un choix de présentation.
4. **NE JAMAIS upgrader un titre** : "Architecte SI" reste "Architecte SI", pas "CTO". "Développeur" reste "Développeur", pas "Lead Dev".
5. **TOUS les membres visibles dans le deck doivent être analysés** : Chaque personne dans teamMembers DOIT avoir une entrée dans teamMemberProfiles. Si le deck montre 9 personnes, tu DOIS produire 9 entrées.
6. **Source OBLIGATOIRE** : Chaque affirmation sur une personne doit indiquer sa source (deck, LinkedIn, registre légal, Context Engine). Sans source = ne pas affirmer.
7. **seniorityLevel = "unknown"** par défaut : Sans LinkedIn ou expérience vérifiable, le niveau est "unknown", PAS "junior".

## ÉTAPES D'ANALYSE

1. ANALYSE chaque team member individuellement avec toutes les données disponibles
2. CROISE le deck avec LinkedIn: identifier les embellissements ou contradictions
3. CALCULE les métriques: années d'expérience, tenure moyenne, job hopping risk
4. EVALUE la complémentarité de l'équipe: gaps critiques, overlaps
5. VERIFIE la dynamique cofondateurs: equity split, vesting, historique commun
6. ANALYSE le network: advisors, investisseurs, industry connections
7. GENERE des red flags COMPLETS (5 composants obligatoires)
8. FORMULE des questions de REFERENCE CHECK (pour appeler des anciens collègues)

## OUTPUT ATTENDU

Produis une investigation complète au format JSON.
Standard: Head of Talent VC + Investigateur PE.
Chaque affirmation doit être sourcée ou marquée comme non vérifiable.
MONTRE tes calculs (années d'expérience, tenure moyenne, etc.).

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu être analysé (ex: LinkedIn non disponible)"]
  },
  "score": {
    "value": 0-100,
    "breakdown": [
      {
        "criterion": "Founder Quality",
        "weight": 30,
        "score": 0-100,
        "justification": "Pourquoi ce score - avec preuves"
      },
      {
        "criterion": "Team Complementarity",
        "weight": 25,
        "score": 0-100,
        "justification": "Pourquoi ce score - avec preuves"
      },
      {
        "criterion": "Entrepreneurial Experience",
        "weight": 20,
        "score": 0-100,
        "justification": "Pourquoi ce score - avec preuves"
      },
      {
        "criterion": "Cofounder Dynamics",
        "weight": 15,
        "score": 0-100,
        "justification": "Pourquoi ce score - avec preuves"
      },
      {
        "criterion": "Network Strength",
        "weight": 10,
        "score": 0-100,
        "justification": "Pourquoi ce score - avec preuves"
      }
    ]
  },
  "findings": {
    "founderProfiles": [
      {
        "name": "Nom complet",
        "role": "CEO|CTO|COO|CPO|etc",
        "linkedinUrl": "URL LinkedIn si disponible",
        "linkedinVerified": true|false,
        "linkedinScrapedAt": "Date du scrape si disponible",
        "background": {
          "yearsExperience": number,
          "headline": "Headline LinkedIn",
          "currentTitle": "Titre actuel",
          "educationHighlight": "Meilleur diplôme",
          "topPreviousCompanies": ["Liste des entreprises notables"],
          "domainExpertiseYears": number,
          "relevantRoles": ["Rôles pertinents avec durée"],
          "keySkills": ["Compétences clés"]
        },
        "entrepreneurialTrack": {
          "isFirstTimeFounder": true|false,
          "previousVentures": [
            {
              "name": "Nom de la venture",
              "role": "Rôle",
              "outcome": "big_success|success|acquihire|pivot|failure|ongoing|unknown",
              "exitValue": number si connu,
              "duration": "Durée",
              "relevance": "Pertinence pour ce projet",
              "source": "D'où vient cette info"
            }
          ],
          "totalVentures": number,
          "successfulExits": number
        },
        "scores": {
          "domainExpertise": 0-100,
          "entrepreneurialExperience": 0-100,
          "executionCapability": 0-100,
          "networkStrength": 0-100,
          "overallFounderScore": 0-100
        },
        "redFlags": [
          {
            "type": "cv_embellishment|job_hopping|gap|conflict|etc",
            "severity": "CRITICAL|HIGH|MEDIUM",
            "description": "Description",
            "evidence": "Preuve"
          }
        ],
        "strengths": ["Forces spécifiques avec preuves"],
        "concerns": ["Points d'attention spécifiques"]
      }
    ],
    "teamComposition": {
      "size": number,
      "rolesPresent": ["Rôles couverts"],
      "rolesMissing": ["Rôles manquants critiques"],
      "technicalStrength": 0-100,
      "businessStrength": 0-100,
      "complementarityScore": 0-100,
      "gaps": [
        {
          "gap": "Description du gap",
          "severity": "CRITICAL|HIGH|MEDIUM",
          "impact": "Impact sur l'exécution",
          "recommendation": "Comment le combler"
        }
      ],
      "keyHiresToMake": [
        {
          "role": "Rôle à recruter",
          "priority": "IMMEDIATE|NEXT_6M|NEXT_12M",
          "rationale": "Pourquoi ce recrutement"
        }
      ]
    },
    "cofounderDynamics": {
      "foundersCount": number,
      "equitySplit": "ex: 50/50, 60/40, solo",
      "equitySplitAssessment": "healthy|concerning|red_flag|unknown",
      "vestingInPlace": true|false,
      "workingHistoryTogether": {
        "duration": "Durée de collaboration",
        "context": "Dans quel contexte",
        "assessment": "Évaluation de la relation"
      },
      "relationshipStrength": "strong|moderate|weak|unknown",
      "potentialConflicts": ["Conflits potentiels identifiés"],
      "soloFounderRisk": "Si solo founder, évaluer le risque"
    },
    "networkAnalysis": {
      "overallNetworkStrength": "strong|moderate|weak",
      "notableConnections": [
        {
          "name": "Nom",
          "relevance": "Pourquoi important",
          "type": "investor|advisor|industry_expert|potential_customer|other"
        }
      ],
      "advisors": [
        {
          "name": "Nom",
          "role": "Rôle",
          "relevance": "Pertinence",
          "credibilityScore": 0-100
        }
      ],
      "investorRelationships": ["Relations investisseurs existantes"],
      "industryConnections": ["Connexions industrie"]
    },
    "benchmarkComparison": {
      "vsSuccessfulFounders": "Comparaison avec fondateurs qui ont réussi dans ce secteur",
      "percentileInSector": 0-100,
      "similarSuccessfulTeams": [
        {
          "company": "Nom de la startup",
          "similarity": "Pourquoi comparable",
          "outcome": "Ce qui s'est passé"
        }
      ]
    }
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "Ce que dit le deck",
        "location": "Slide X",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "Donnée qui confirme/infirme",
        "severity": "CRITICAL|HIGH|MEDIUM si problème"
      }
    ],
    "uncheckedClaims": ["Claims non vérifiables"]
  },
  "redFlags": [
    {
      "id": "RF-001",
      "category": "cv_embellishment|equity|vesting|turnover|gap|conflict|job_hopping|verification",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre court et percutant",
      "description": "Description détaillée",
      "location": "Où dans les documents",
      "evidence": "Citation exacte ou donnée",
      "contextEngineData": "Cross-reference si disponible",
      "impact": "Impact pour le BA",
      "question": "Question de reference check à poser",
      "redFlagIfBadAnswer": "Ce que ça révèle si mauvaise réponse"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "founder_background|team_dynamics|execution|references|verification",
      "question": "Question précise pour reference check",
      "context": "Pourquoi on pose cette question",
      "whatToLookFor": "Ce qui révèlerait un problème"
    }
  ],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "Si hasBlocker, pourquoi",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Pourquoi cette recommandation"
  },
  "narrative": {
    "oneLiner": "Résumé en 1 phrase pour le BA",
    "summary": "3-4 phrases de synthèse sur l'équipe",
    "keyInsights": ["3-5 insights majeurs sur l'équipe"],
    "forNegotiation": ["Arguments de négociation liés à l'équipe"]
  }
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMTeamInvestigatorResponse>(prompt);

    // Validate and normalize response
    return this.normalizeResponse(data);
  }

  /**
   * Extract founders data from deal with LinkedIn enrichment
   */
  private getFoundersData(context: EnrichedAgentContext): string | null {
    // Type for founders with LinkedIn enrichment
    interface FounderWithLinkedIn {
      name: string;
      role: string;
      background?: string;
      linkedinUrl?: string;
      verifiedInfo?: {
        linkedinScrapedAt?: string;
        rawLinkedInData?: LinkedInEnrichedProfile;
        highlights?: {
          yearsExperience?: number;
          educationLevel?: string;
          hasRelevantIndustryExp?: boolean;
          hasFounderExperience?: boolean;
          hasTechBackground?: boolean;
          isSerialFounder?: boolean;
          topCompanies?: string[];
          longestTenure?: number;
          averageTenure?: number;
          jobHoppingRisk?: boolean;
        };
        expertise?: {
          primaryIndustry?: string;
          primaryRole?: string;
          description?: string;
        };
        sectorFit?: { fits: boolean; explanation: string };
        redFlags?: { type: string; severity: string; message: string }[];
        questionsToAsk?: { question: string; context: string; priority: string }[];
      };
      previousVentures?: unknown;
    }

    const deal = context.deal as unknown as { founders?: FounderWithLinkedIn[] };

    if (!deal.founders || deal.founders.length === 0) {
      return null;
    }

    const foundersFormatted = deal.founders.map(f => {
      const base = {
        name: f.name,
        role: f.role,
        linkedinUrl: f.linkedinUrl,
        backgroundFromDeck: f.background,
        previousVentures: f.previousVentures,
      };

      // Add LinkedIn enrichment if available
      if (f.verifiedInfo?.linkedinScrapedAt) {
        return {
          ...base,
          linkedinEnriched: true,
          linkedinScrapedAt: f.verifiedInfo.linkedinScrapedAt,
          highlights: f.verifiedInfo.highlights,
          expertise: f.verifiedInfo.expertise,
          sectorFit: f.verifiedInfo.sectorFit,
          redFlagsFromLinkedIn: f.verifiedInfo.redFlags,
          questionsFromLinkedIn: f.verifiedInfo.questionsToAsk,
          // Include raw LinkedIn data if available (from Coresignal)
          rawLinkedInData: f.verifiedInfo.rawLinkedInData,
        };
      }

      return {
        ...base,
        linkedinEnriched: false,
        note: "LinkedIn non scrapé - données à vérifier manuellement",
      };
    });

    return JSON.stringify(foundersFormatted, null, 2);
  }

  /**
   * Normalize LLM response to match TeamInvestigatorData type
   */
  private normalizeResponse(data: LLMTeamInvestigatorResponse): TeamInvestigatorData {
    // Normalize meta
    const validCompleteness = ["complete", "partial", "minimal"] as const;
    const dataCompleteness = validCompleteness.includes(data.meta?.dataCompleteness as typeof validCompleteness[number])
      ? data.meta.dataCompleteness
      : "minimal";

    // Check if any founder has verified LinkedIn
    const hasAnyLinkedInVerified = Array.isArray(data.findings?.founderProfiles)
      && data.findings.founderProfiles.some(f => f.linkedinVerified === true);

    const baseLimitations = Array.isArray(data.meta?.limitations) ? data.meta.limitations : [];
    const limitations = !hasAnyLinkedInVerified
      ? [...baseLimitations, "Aucun profil LinkedIn verifie — scores fondes uniquement sur les claims du pitch deck."]
      : baseLimitations;

    // Cap confidence when no LinkedIn is verified
    const rawConfidence = Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50));
    const confidenceLevel = !hasAnyLinkedInVerified ? Math.min(rawConfidence, 60) : rawConfidence;

    const meta: AgentMeta = {
      agentName: "team-investigator",
      analysisDate: new Date().toISOString(),
      dataCompleteness,
      confidenceLevel,
      limitations,
    };

    // Calculate grade from score
    const scoreValue = Math.min(100, Math.max(0, data.score?.value ?? 50));
    const getGrade = (score: number): "A" | "B" | "C" | "D" | "F" => {
      if (score >= 80) return "A";
      if (score >= 65) return "B";
      if (score >= 50) return "C";
      if (score >= 35) return "D";
      return "F";
    };

    // Apply penalties
    let cappedScore = scoreValue;
    if (dataCompleteness === "minimal") {
      cappedScore = Math.min(cappedScore, 50);
    } else if (dataCompleteness === "partial") {
      cappedScore = Math.min(cappedScore, 70);
    }

    // Check for critical blockers
    const hasCriticalBlocker = data.redFlags?.some(rf => rf.severity === "CRITICAL") ?? false;
    if (hasCriticalBlocker) {
      cappedScore = Math.min(cappedScore, 40);
    }

    // Check for no vesting
    const noVesting = data.findings?.cofounderDynamics?.vestingInPlace === false;
    if (noVesting) {
      cappedScore = Math.min(cappedScore, 50);
    }

    // Cap overall score when no LinkedIn verified (CV non vérifiable = score max 55)
    if (!hasAnyLinkedInVerified) {
      cappedScore = Math.min(cappedScore, 55);
    }

    const score: AgentScore = {
      value: cappedScore,
      grade: getGrade(cappedScore),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map(b => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 20,
            score: Math.min(100, Math.max(0, b.score ?? 50)),
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize findings
    const findings = this.normalizeFindings(data.findings);

    // Normalize dbCrossReference
    const validVerdicts = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: validVerdicts.includes(c.dbVerdict as typeof validVerdicts[number])
              ? c.dbVerdict
              : "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: c.severity && validSeverities.includes(c.severity) ? c.severity : undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normalize red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, idx) => ({
          id: rf.id ?? `RF-${String(idx + 1).padStart(3, "0")}`,
          category: rf.category ?? "team",
          severity: validSeverities.includes(rf.severity as typeof validSeverities[number])
            ? rf.severity
            : "MEDIUM",
          title: rf.title ?? "Red flag détecté",
          description: rf.description ?? "",
          location: rf.location ?? "Non spécifié",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map(q => ({
          priority: validPriorities.includes(q.priority as typeof validPriorities[number])
            ? q.priority
            : "MEDIUM",
          category: q.category ?? "team",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alert signal
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;

    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? hasCriticalBlocker,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(data.alertSignal?.recommendation as typeof validRecommendations[number])
        ? data.alertSignal.recommendation
        : hasCriticalBlocker
          ? "INVESTIGATE_FURTHER"
          : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse de l'équipe fondatrice complète.",
      summary: data.narrative?.summary ?? "",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
    };

    return {
      meta,
      score,
      findings,
      dbCrossReference,
      redFlags,
      questions,
      alertSignal,
      narrative,
    };
  }

  /**
   * Normalize findings section
   */
  private normalizeFindings(findings: LLMTeamInvestigatorResponse["findings"]): TeamInvestigatorFindings {
    const validOutcomes = ["big_success", "success", "acquihire", "pivot", "failure", "ongoing", "unknown"] as const;
    const validEquityAssessments = ["healthy", "concerning", "red_flag", "unknown"] as const;
    const validRelationshipStrengths = ["strong", "moderate", "weak", "unknown"] as const;
    const validNetworkStrengths = ["strong", "moderate", "weak"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validPriorities = ["IMMEDIATE", "NEXT_6M", "NEXT_12M"] as const;
    const validConnectionTypes = ["investor", "advisor", "industry_expert", "potential_customer", "other"] as const;

    const founderProfiles = Array.isArray(findings?.founderProfiles)
      ? findings.founderProfiles.map(f => ({
          name: f.name ?? "Unknown",
          role: f.role ?? "Founder",
          linkedinUrl: f.linkedinUrl,
          linkedinVerified: f.linkedinVerified ?? false,
          linkedinScrapedAt: f.linkedinScrapedAt,
          background: {
            yearsExperience: f.background?.yearsExperience ?? 0,
            headline: f.background?.headline,
            currentTitle: f.background?.currentTitle,
            educationHighlight: f.background?.educationHighlight,
            topPreviousCompanies: Array.isArray(f.background?.topPreviousCompanies)
              ? f.background.topPreviousCompanies
              : [],
            domainExpertiseYears: f.background?.domainExpertiseYears ?? 0,
            relevantRoles: Array.isArray(f.background?.relevantRoles) ? f.background.relevantRoles : [],
            keySkills: Array.isArray(f.background?.keySkills) ? f.background.keySkills : [],
          },
          entrepreneurialTrack: {
            isFirstTimeFounder: f.entrepreneurialTrack?.isFirstTimeFounder ?? true,
            previousVentures: Array.isArray(f.entrepreneurialTrack?.previousVentures)
              ? f.entrepreneurialTrack.previousVentures.map(v => ({
                  name: v.name ?? "Unknown",
                  role: v.role ?? "Founder",
                  outcome: validOutcomes.includes(v.outcome as typeof validOutcomes[number])
                    ? v.outcome
                    : "unknown",
                  exitValue: v.exitValue,
                  duration: v.duration,
                  relevance: v.relevance ?? "",
                  source: v.source ?? "Non spécifié",
                }))
              : [],
            totalVentures: f.entrepreneurialTrack?.totalVentures ?? 0,
            successfulExits: f.entrepreneurialTrack?.successfulExits ?? 0,
          },
          scores: (() => {
            const linkedinVerified = f.linkedinVerified ?? false;
            // Cap scores when LinkedIn is not verified (deck-only analysis)
            const capScore = (val: number, defaultVal: number, cap?: number) => {
              const clamped = Math.min(100, Math.max(0, val ?? defaultVal));
              return cap !== undefined && !linkedinVerified ? Math.min(clamped, cap) : clamped;
            };
            return {
              domainExpertise: capScore(f.scores?.domainExpertise ?? 50, 50),
              entrepreneurialExperience: capScore(f.scores?.entrepreneurialExperience ?? 30, 30, 60),
              executionCapability: capScore(f.scores?.executionCapability ?? 50, 50, 70),
              networkStrength: capScore(f.scores?.networkStrength ?? 40, 40, 30),
              overallFounderScore: capScore(f.scores?.overallFounderScore ?? 45, 45, 65),
            };
          })(),
          redFlags: Array.isArray(f.redFlags)
            ? f.redFlags.map(rf => ({
                type: rf.type ?? "unknown",
                severity: validSeverities.includes(rf.severity as typeof validSeverities[number])
                  ? rf.severity
                  : "MEDIUM",
                description: rf.description ?? "",
                evidence: rf.evidence ?? "",
              }))
            : [],
          strengths: Array.isArray(f.strengths) ? f.strengths : [],
          concerns: (() => {
            const baseConcerns = Array.isArray(f.concerns) ? f.concerns : [];
            const linkedinVerified = f.linkedinVerified ?? false;
            if (!linkedinVerified) {
              const noLinkedInConcern = "Profil LinkedIn non verifie \u2014 scores bases uniquement sur le pitch deck (fiabilite limitee).";
              if (!baseConcerns.some(c => c.includes("LinkedIn"))) {
                return [noLinkedInConcern, ...baseConcerns];
              }
            }
            return baseConcerns;
          })(),
        }))
      : [];

    const teamComposition = {
      size: findings?.teamComposition?.size ?? founderProfiles.length,
      rolesPresent: Array.isArray(findings?.teamComposition?.rolesPresent)
        ? findings.teamComposition.rolesPresent
        : founderProfiles.map(f => f.role),
      rolesMissing: Array.isArray(findings?.teamComposition?.rolesMissing)
        ? findings.teamComposition.rolesMissing
        : [],
      technicalStrength: Math.min(100, Math.max(0, findings?.teamComposition?.technicalStrength ?? 50)),
      businessStrength: Math.min(100, Math.max(0, findings?.teamComposition?.businessStrength ?? 50)),
      complementarityScore: Math.min(100, Math.max(0, findings?.teamComposition?.complementarityScore ?? 50)),
      gaps: Array.isArray(findings?.teamComposition?.gaps)
        ? findings.teamComposition.gaps.map(g => ({
            gap: g.gap ?? "",
            severity: validSeverities.includes(g.severity as typeof validSeverities[number])
              ? g.severity
              : "MEDIUM",
            impact: g.impact ?? "",
            recommendation: g.recommendation ?? "",
          }))
        : [],
      keyHiresToMake: Array.isArray(findings?.teamComposition?.keyHiresToMake)
        ? findings.teamComposition.keyHiresToMake.map(h => ({
            role: h.role ?? "",
            priority: validPriorities.includes(h.priority as typeof validPriorities[number])
              ? h.priority
              : "NEXT_6M",
            rationale: h.rationale ?? "",
          }))
        : [],
    };

    const cofounderDynamics = {
      foundersCount: findings?.cofounderDynamics?.foundersCount ?? founderProfiles.length,
      equitySplit: findings?.cofounderDynamics?.equitySplit ?? "Unknown",
      equitySplitAssessment: validEquityAssessments.includes(
        findings?.cofounderDynamics?.equitySplitAssessment as typeof validEquityAssessments[number]
      )
        ? findings.cofounderDynamics.equitySplitAssessment
        : "unknown",
      vestingInPlace: findings?.cofounderDynamics?.vestingInPlace ?? false,
      workingHistoryTogether: {
        duration: findings?.cofounderDynamics?.workingHistoryTogether?.duration ?? "Unknown",
        context: findings?.cofounderDynamics?.workingHistoryTogether?.context ?? "",
        assessment: findings?.cofounderDynamics?.workingHistoryTogether?.assessment ?? "",
      },
      relationshipStrength: validRelationshipStrengths.includes(
        findings?.cofounderDynamics?.relationshipStrength as typeof validRelationshipStrengths[number]
      )
        ? findings.cofounderDynamics.relationshipStrength
        : "unknown",
      potentialConflicts: Array.isArray(findings?.cofounderDynamics?.potentialConflicts)
        ? findings.cofounderDynamics.potentialConflicts
        : [],
      soloFounderRisk: findings?.cofounderDynamics?.soloFounderRisk,
    };

    const networkAnalysis = {
      overallNetworkStrength: validNetworkStrengths.includes(
        findings?.networkAnalysis?.overallNetworkStrength as typeof validNetworkStrengths[number]
      )
        ? findings.networkAnalysis.overallNetworkStrength
        : "weak",
      notableConnections: Array.isArray(findings?.networkAnalysis?.notableConnections)
        ? findings.networkAnalysis.notableConnections.map(c => ({
            name: c.name ?? "",
            relevance: c.relevance ?? "",
            type: validConnectionTypes.includes(c.type as typeof validConnectionTypes[number])
              ? c.type
              : "other",
          }))
        : [],
      advisors: Array.isArray(findings?.networkAnalysis?.advisors)
        ? findings.networkAnalysis.advisors.map(a => ({
            name: a.name ?? "",
            role: a.role ?? "",
            relevance: a.relevance ?? "",
            credibilityScore: Math.min(100, Math.max(0, a.credibilityScore ?? 50)),
          }))
        : [],
      investorRelationships: Array.isArray(findings?.networkAnalysis?.investorRelationships)
        ? findings.networkAnalysis.investorRelationships
        : [],
      industryConnections: Array.isArray(findings?.networkAnalysis?.industryConnections)
        ? findings.networkAnalysis.industryConnections
        : [],
    };

    const benchmarkComparison = {
      vsSuccessfulFounders: findings?.benchmarkComparison?.vsSuccessfulFounders ?? "",
      percentileInSector: Math.min(100, Math.max(0, findings?.benchmarkComparison?.percentileInSector ?? 50)),
      similarSuccessfulTeams: Array.isArray(findings?.benchmarkComparison?.similarSuccessfulTeams)
        ? findings.benchmarkComparison.similarSuccessfulTeams.map(t => ({
            company: t.company ?? "",
            similarity: t.similarity ?? "",
            outcome: t.outcome ?? "",
          }))
        : [],
    };

    return {
      founderProfiles,
      teamComposition,
      cofounderDynamics,
      networkAnalysis,
      benchmarkComparison,
    };
  }
}

export const teamInvestigator = new TeamInvestigatorAgent();
