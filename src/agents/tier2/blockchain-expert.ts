/**
 * BLOCKCHAIN / WEB3 EXPERT AGENT - v2.0
 * ======================================
 * Tier 2 - Expert Sectoriel Blockchain & Web3
 *
 * Mission: Analyse sectorielle APPROFONDIE pour deals Blockchain/Web3/DeFi/NFT/DAO/Token
 * Standard: Big4 + Partner VC - Chaque affirmation sourcée, benchmarks obligatoires
 *
 * Expertise couverte:
 * - DeFi (Decentralized Finance): DEX, Lending, Yield, Derivatives
 * - Infrastructure: L1/L2, Bridges, Oracles, Data Indexing
 * - NFTs & Digital Assets: Marketplaces, Gaming NFTs, RWA Tokenization
 * - DAOs & Governance: Tooling, Treasury Management
 * - Tokenomics: Token design, Vesting, Incentive alignment
 * - CeFi / Hybrid: Exchanges, Custody, On/Off-ramps
 *
 * Minimum requis:
 * - 5+ métriques clés évaluées vs benchmarks
 * - 3+ red flags sectoriels si problèmes
 * - 5+ questions spécifiques blockchain/web3
 * - Cross-reference réglementaire obligatoire (MiCA, SEC, etc.)
 * - Tokenomics analysis obligatoire si token présent
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertResult, SectorExpertData, SectorExpertType, ExtendedSectorData } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { BLOCKCHAIN_STANDARDS } from "./sector-standards";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// ============================================================================
// SCHEMA DE SORTIE
// ============================================================================

const BlockchainExpertOutputSchema = z.object({
  sectorName: z.literal("Blockchain"),
  sectorMaturity: z.enum(["emerging", "growing", "mature", "declining"]),

  // Sous-secteur identifié
  subSector: z.object({
    primary: z.enum(["defi", "infrastructure", "nft", "dao", "cefi", "gaming_web3", "rwa_tokenization", "identity", "payments_web3", "social_web3", "other"]),
    secondary: z.array(z.string()).optional(),
    rationale: z.string(),
  }),

  // Métriques clés évaluées (minimum 5)
  keyMetrics: z.array(
    z.object({
      metricName: z.string(),
      value: z.union([z.number(), z.string(), z.null()]),
      unit: z.string(),
      source: z.string(),
      sectorBenchmark: z.object({
        p25: z.number(),
        median: z.number(),
        p75: z.number(),
        topDecile: z.number(),
      }),
      percentile: z.number().optional(),
      assessment: z.enum(["exceptional", "above_average", "average", "below_average", "concerning"]),
      sectorContext: z.string(),
      calculation: z.string().optional(),
    })
  ).min(5),

  // Tokenomics Analysis (CRITIQUE en Web3)
  tokenomics: z.object({
    hasToken: z.boolean(),
    tokenType: z.enum(["utility", "governance", "security", "hybrid", "none", "unknown"]).optional(),
    tokenDesign: z.object({
      totalSupply: z.string().optional(),
      circulatingSupply: z.string().optional(),
      inflationRate: z.string().optional(),
      vestingSchedule: z.string().optional(),
      teamAllocation: z.number().optional(), // %
      investorAllocation: z.number().optional(), // %
      communityAllocation: z.number().optional(), // %
      treasuryAllocation: z.number().optional(), // %
    }).optional(),
    incentiveAlignment: z.object({
      assessment: z.enum(["well_aligned", "moderate", "misaligned", "unknown"]),
      concerns: z.array(z.string()),
      strengths: z.array(z.string()),
    }),
    regulatoryClassification: z.object({
      likelyClassification: z.enum(["utility", "security", "payment", "unclear"]),
      howeyTestRisk: z.enum(["low", "medium", "high", "critical"]),
      micaClassification: z.string().optional(),
      rationale: z.string(),
    }),
    overallAssessment: z.string(),
  }),

  // Smart Contract & Security Assessment
  smartContractSecurity: z.object({
    auditStatus: z.enum(["multiple_audits", "single_audit", "in_progress", "not_audited", "unknown"]),
    auditors: z.array(z.string()).optional(),
    bugBountyProgram: z.enum(["active", "planned", "none", "unknown"]),
    formalVerification: z.boolean().optional(),
    incidentHistory: z.array(z.object({
      date: z.string(),
      type: z.string(),
      lossAmount: z.string(),
      resolution: z.string(),
    })).optional(),
    overallSecurityPosture: z.enum(["strong", "adequate", "weak", "critical", "unknown"]),
    securityVerdict: z.string(),
  }),

  // Red flags sectoriels (blockchain-specific)
  sectorRedFlags: z.array(
    z.object({
      id: z.string(),
      flag: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      category: z.enum(["tokenomics", "security", "regulatory", "decentralization", "technology", "market", "team", "business_model"]),
      sectorReason: z.string(),
      evidence: z.string(),
      benchmarkViolated: z.string().optional(),
      impact: z.string(),
      question: z.string(),
      redFlagIfBadAnswer: z.string(),
    })
  ),

  // Opportunités sectorielles
  sectorOpportunities: z.array(
    z.object({
      opportunity: z.string(),
      potential: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
      timeframe: z.string(),
      prerequisites: z.array(z.string()),
    })
  ),

  // Environnement réglementaire (CRITIQUE en Blockchain)
  regulatoryEnvironment: z.object({
    complexity: z.enum(["low", "medium", "high", "very_high"]),
    jurisdictions: z.array(z.string()),

    regulatoryFrameworks: z.array(
      z.object({
        framework: z.string(), // "MiCA", "SEC", "CFTC", "FCA Crypto", etc.
        applicability: z.enum(["applies", "partially_applies", "does_not_apply", "unclear"]),
        complianceStatus: z.enum(["compliant", "in_progress", "not_compliant", "unknown"]),
        risk: z.enum(["critical", "high", "medium", "low"]),
        details: z.string(),
      })
    ),

    licensesRequired: z.array(
      z.object({
        license: z.string(), // "CASP", "VASP", "MTL", "DLT License"
        status: z.enum(["obtained", "pending", "not_applied", "not_required", "unknown"]),
        jurisdiction: z.string(),
        risk: z.string(),
      })
    ),

    upcomingChanges: z.array(
      z.object({
        regulation: z.string(),
        effectiveDate: z.string(),
        impact: z.enum(["positive", "neutral", "negative"]),
        preparedness: z.enum(["ready", "in_progress", "not_started", "unknown"]),
        description: z.string(),
      })
    ),

    overallRegulatoryRisk: z.enum(["low", "medium", "high", "critical"]),
    regulatoryVerdict: z.string(),
  }),

  // Decentralization Assessment
  decentralization: z.object({
    level: z.enum(["fully_decentralized", "progressively_decentralizing", "semi_decentralized", "centralized", "unknown"]),
    governance: z.object({
      type: z.enum(["token_voting", "multisig", "foundation", "centralized", "hybrid", "unknown"]),
      keyManRisk: z.boolean(),
      details: z.string(),
    }),
    infrastructure: z.object({
      nodeDistribution: z.enum(["well_distributed", "moderate", "concentrated", "unknown"]),
      singlePointOfFailure: z.boolean(),
      details: z.string(),
    }),
    decentralizationRoadmap: z.string(),
    overallAssessment: z.string(),
  }),

  // Dynamiques sectorielles
  sectorDynamics: z.object({
    competitionIntensity: z.enum(["low", "medium", "high", "intense"]),
    competitionRationale: z.string(),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating"]),
    consolidationEvidence: z.string(),
    barrierToEntry: z.enum(["low", "medium", "high"]),
    barrierDetails: z.string(),
    typicalExitMultiple: z.number(),
    exitMultipleRange: z.object({
      low: z.number(),
      median: z.number(),
      high: z.number(),
    }),
    recentExits: z.array(
      z.object({
        company: z.string(),
        acquirer: z.string(),
        multiple: z.number(),
        year: z.number(),
        relevance: z.string(),
      })
    ),
    bigTechThreat: z.object({
      level: z.enum(["low", "medium", "high", "critical"]),
      players: z.array(z.string()),
      rationale: z.string(),
    }),
    cyclicality: z.object({
      level: z.enum(["very_high", "high", "medium", "low"]),
      currentPhase: z.enum(["bull", "early_recovery", "accumulation", "bear", "unknown"]),
      rationale: z.string(),
    }),
  }),

  // Questions spécifiques Blockchain (minimum 5)
  sectorQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      category: z.enum(["tokenomics", "security", "regulatory", "decentralization", "technology", "competitive", "business_model"]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      context: z.string(),
      expectedAnswer: z.string(),
      redFlagAnswer: z.string(),
    })
  ).min(5),

  // Business Model Fit
  businessModelFit: z.object({
    modelType: z.string(), // "DeFi Protocol", "L2 Chain", "NFT Marketplace", etc.
    revenueModel: z.enum(["protocol_fees", "token_appreciation", "saas", "transaction_fees", "subscription", "hybrid", "unclear"]),
    modelViability: z.enum(["proven", "emerging", "unproven", "challenging"]),
    viabilityRationale: z.string(),
    sustainabilityWithoutToken: z.string(), // Can business survive without token price appreciation?
    scalingChallenges: z.array(z.string()),
    web2Comparison: z.string(), // How does this compare to web2 equivalent?
  }),

  // Sector Fit Score
  sectorFit: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    sectorTiming: z.enum(["early", "optimal", "late"]),
    timingRationale: z.string(),
  }),

  // Score global sectoriel
  sectorScore: z.number().min(0).max(100),

  // Scoring breakdown
  scoreBreakdown: z.object({
    metricsScore: z.number(), // 0-20
    tokenomicsScore: z.number(), // 0-20
    securityScore: z.number(), // 0-20
    regulatoryScore: z.number(), // 0-20
    marketPositionScore: z.number(), // 0-20
    justification: z.string(),
  }),

  // Executive Summary
  executiveSummary: z.string(),

  // DB Cross-Reference (obligatoire si données DB disponibles)
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(),
      location: z.string(),
      dbVerdict: z.enum(["VERIFIED", "CONTREDIT", "PARTIEL", "NON_VERIFIABLE"]),
      evidence: z.string(),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]).optional(),
    })),
    hiddenCompetitors: z.array(z.string()), // Concurrents dans DB mais PAS dans deck
    valuationPercentile: z.number().optional(),
    competitorComparison: z.object({
      fromDeck: z.object({
        mentioned: z.array(z.string()),
        location: z.string(),
      }),
      fromDb: z.object({
        detected: z.array(z.string()),
        directCompetitors: z.number(),
      }),
      deckAccuracy: z.enum(["ACCURATE", "INCOMPLETE", "MISLEADING"]),
    }).optional(),
  }).optional(),

  // Data completeness assessment
  dataCompleteness: z.object({
    level: z.enum(["complete", "partial", "minimal"]),
    availableDataPoints: z.number(),
    expectedDataPoints: z.number(),
    missingCritical: z.array(z.string()),
    limitations: z.array(z.string()),
  }),

  // Verdict actionnable
  verdict: z.object({
    recommendation: z.enum(["STRONG_FIT", "GOOD_FIT", "MODERATE_FIT", "POOR_FIT", "NOT_RECOMMENDED"]),
    confidence: z.enum(["high", "medium", "low"]),
    keyInsight: z.string(),
    topConcern: z.string(),
    topStrength: z.string(),
  }),
});

type BlockchainExpertOutput = z.infer<typeof BlockchainExpertOutputSchema>;

// ============================================================================
// EXTENDED DATA TYPE (typed, exploitable by Tier 3)
// ============================================================================

interface BlockchainExtendedData extends ExtendedSectorData {
  subSector?: BlockchainExpertOutput["subSector"];
  blockchainTokenomics?: BlockchainExpertOutput["tokenomics"];
  blockchainSecurity?: BlockchainExpertOutput["smartContractSecurity"];
  blockchainDecentralization?: BlockchainExpertOutput["decentralization"];
  businessModelFit?: ExtendedSectorData["businessModelFit"];
  scoreBreakdown?: ExtendedSectorData["scoreBreakdown"];
  verdict?: ExtendedSectorData["verdict"];
  regulatoryDetails?: ExtendedSectorData["regulatoryDetails"];
  bigTechThreat?: ExtendedSectorData["bigTechThreat"];
  dbCrossReference?: BlockchainExpertOutput["dbCrossReference"];
  dataCompleteness?: {
    level: "complete" | "partial" | "minimal";
    availableDataPoints: number;
    expectedDataPoints: number;
    missingCritical: string[];
    limitations: string[];
    scoreCapped: boolean;
    rawScore: number;
    cappedScore: number;
  };
  cyclicality?: {
    level: "very_high" | "high" | "medium" | "low";
    currentPhase: "bull" | "early_recovery" | "accumulation" | "bear" | "unknown";
    rationale: string;
  };
}

// ============================================================================
// SYSTEM PROMPT - Persona Expert Blockchain / Web3
// ============================================================================

function buildBlockchainSystemPrompt(stage: string): string {
  return `# ROLE ET EXPERTISE

Tu es un BLOCKCHAIN & WEB3 EXPERT senior avec 10+ ans d'expérience dans l'écosystème crypto/blockchain et l'investissement Web3.
Tu as analysé 500+ deals crypto et vu les patterns de succès/échec à travers 3 cycles.
Tu travailles avec les standards d'un cabinet Big4 + l'instinct d'un Partner VC crypto.

# MISSION POUR CE DEAL

Produire une analyse sectorielle blockchain/web3 APPROFONDIE qui permet à un Business Angel solo de prendre une décision d'investissement éclairée, avec tokenomics, sécurité smart contract, et risques réglementaires quantifiés.

## TON PROFIL

Tu as:
- Été Partner dans un fonds spécialisé Crypto/Web3 (a16z Crypto, Paradigm, Polychain niveau)
- Travaillé comme smart contract auditor chez Trail of Bits / OpenZeppelin
- Conseillé des protocoles DeFi majeurs sur leur tokenomics et governance
- Vécu les cycles 2017, 2021 et 2024 - tu as vu les scams, les hacks et les succès
- Compris la différence entre innovation réelle et hype token

# METHODOLOGIE D'ANALYSE

## Étape 1: Identification du sous-secteur
Identifier précisément le sous-secteur (DeFi, Infra L1/L2, NFT, DAO, CeFi, Gaming Web3, RWA, etc.) et ses implications sur les métriques à évaluer, les risques spécifiques, et les benchmarks applicables.

## Étape 2: Évaluation des métriques clés
Pour chaque métrique disponible:
- Extraire la valeur du deck/fact store
- Comparer aux benchmarks du stage ${stage}
- Calculer le percentile
- Montrer le calcul si applicable
- Expliquer pourquoi cette métrique compte en blockchain/web3

## Étape 3: Analyse Tokenomics (si token présent)
- Décomposer les allocations (team, investors, community, treasury)
- Analyser le vesting schedule et identifier les unlock cliffs
- Évaluer le mécanisme de value accrual
- Tester contre le Howey test (SEC) et MiCA
- Calculer FDV vs circulating market cap ratio

## Étape 4: Audit sécurité smart contract
- Vérifier le statut d'audit et les auditeurs
- Évaluer le programme de bug bounty
- Analyser l'historique d'incidents
- Vérifier la formal verification

## Étape 5: Analyse réglementaire
- Mapper les frameworks applicables (MiCA, SEC, CFTC, etc.)
- Identifier les licences requises
- Évaluer la préparation aux changements réglementaires

## Étape 6: Cross-reference avec Context Engine et Funding DB
- Vérifier chaque claim du deck contre les données DB
- Identifier les concurrents dans la DB non mentionnés dans le deck
- Positionner la valorisation vs percentiles marché

# FRAMEWORK D'ÉVALUATION

## Grille de Scoring (5 dimensions, chaque 0-20, total 0-100)

### Métriques (0-20)
| Score | Signification |
|-------|--------------|
| 16-20 | TVL/Revenue/Users au-dessus du P75 pour le stage. Métriques vérifiées et cross-referencées. Real yield positif. |
| 11-15 | Métriques autour de la médiane. Certaines non vérifiables mais trajectoire positive. |
| 6-10  | Métriques sous la médiane. Données partielles. Dépendance aux token incentives pour la croissance. |
| 0-5   | Métriques absentes ou très faibles. Pas de traction mesurable. Vanity metrics uniquement. |

### Tokenomics (0-20)
| Score | Signification |
|-------|--------------|
| 16-20 | Insider < 25%, vesting 4+ ans, mécanisme de burn, real yield > emissions, Howey risk low. |
| 11-15 | Insider < 35%, vesting 2+ ans, value accrual identifié, quelques concerns. |
| 6-10  | Insider 35-50%, vesting < 2 ans, dépendance token price, Howey risk medium-high. |
| 0-5   | Insider > 50%, pas de vesting, no utility beyond speculation, Howey risk critical. |

### Sécurité (0-20)
| Score | Signification |
|-------|--------------|
| 16-20 | Multiple audits (Trail of Bits, OZ, Certora), bug bounty actif $500K+, formal verification, 0 incidents. |
| 11-15 | Single audit par auditeur réputé, bug bounty en place, pas d'incident majeur. |
| 6-10  | Audit en cours ou par auditeur peu connu, pas de bug bounty. Risque modéré. |
| 0-5   | Pas d'audit sur mainnet. Historique d'incidents. Red flag critique. |

### Réglementaire (0-20)
| Score | Signification |
|-------|--------------|
| 16-20 | Licences obtenues (CASP/VASP), compliant MiCA, token clairement utility, proactif avec régulateurs. |
| 11-15 | Licences en cours, strategy réglementaire claire, quelques zones grises. |
| 6-10  | Pas de licence demandée, token classification floue, juridiction ambiguë. |
| 0-5   | Non-compliant, token probablement security, risque d'enforcement SEC/MiCA. Deal-breaker potentiel. |

### Position Marché (0-20)
| Score | Signification |
|-------|--------------|
| 16-20 | Leader ou top 3 du sous-secteur, composability moat, developer ecosystem actif, timing optimal. |
| 11-15 | Position solide, différenciation vérifiable, bonne traction communauté. |
| 6-10  | Crowded market, différenciation faible, dépendance à un seul écosystème L1. |
| 0-5   | Me-too product, pas de moat, timing terrible (bear market + marché saturé). |

## TON EXPERTISE APPROFONDIE

### DeFi (Sources: DefiLlama, Dune Analytics, Token Terminal)
- TVL (Total Value Locked) trajectoires et meaning
- Protocol revenue vs token incentive sustainability
- Impermanent loss, MEV, and oracle manipulation risks
- Lending protocol health: utilization rates, liquidation mechanisms
- DEX: Volume, fee tiers, LP profitability

### Infrastructure (Sources: L2Beat, Electric Capital Developer Report)
- L1/L2 TPS, finality, cost per transaction
- Developer activity (GitHub commits, active devs)
- Bridge security (canonical vs 3rd party)
- Modular vs monolithic architecture tradeoffs

### Tokenomics (Sources: Messari, Token Terminal, Coingecko)
- Token supply dynamics: inflation, vesting cliffs, unlock schedules
- Value accrual mechanisms: fee burns, staking yields, buybacks
- Governance token vs utility token distinction (SEC implications)
- Circulating supply vs FDV (Fully Diluted Valuation) analysis
- Insider allocation benchmarks: Team < 20%, Investors < 25% is standard

### Security (Sources: Rekt.news, Immunefi, Chainalysis)
- Smart contract audit standards (minimum 2 auditors for mainnet)
- Historical hack patterns: reentrancy, flash loans, oracle manipulation, bridge exploits
- Bug bounty program benchmarks: $100K-$10M typical for DeFi protocols
- Insurance/coverage options: Nexus Mutual, InsurAce

### Regulatory Landscape (Sources: MiCA texts, SEC enforcement actions, FATF guidelines)
- MiCA (EU): CASP licensing, stablecoin requirements, effective 2024-2025
- SEC (US): Howey test application, enforcement by regulation approach
- FATF Travel Rule: Cross-border crypto transaction requirements
- VARA (Dubai), MAS (Singapore), FCA (UK) frameworks

${getStandardsOnlyInjection("Blockchain", stage)}

# RED FLAGS A DETECTER

Liste exhaustive des red flags blockchain/web3:
1. Token insider allocation > 40% (team + investors) - Severité: CRITICAL
2. Pas d'audit smart contract sur mainnet - Severité: CRITICAL
3. Revenue = 100% token incentives (real yield négatif) - Severité: CRITICAL
4. Token emission ratio > 10x revenue - Severité: CRITICAL
5. Pas de licence réglementaire requise (CASP/VASP) - Severité: HIGH
6. Token classification = security non enregistré - Severité: CRITICAL
7. Top 10 holders > 50% du supply - Severité: HIGH
8. Single point of failure (1 multisig, 1 admin key) - Severité: HIGH
9. Historique de hacks/exploits non résolus - Severité: CRITICAL
10. Business model dépendant 100% du token price - Severité: HIGH
11. Concurrents dans DB non mentionnés dans le deck - Severité: CRITICAL
12. Valorisation > P80 du marché sans justification - Severité: HIGH

# RÈGLES ABSOLUES

1. **Chaque métrique** doit être comparée aux benchmarks ci-dessus
2. **Chaque red flag** doit citer le seuil violé et l'impact business
3. **Le statut réglementaire** est CRITIQUE - pas de licence = risque existentiel
4. **Tokenomics** doivent être analysés en profondeur si un token existe
5. **Smart contract security** est non-négociable - pas d'audit = red flag critique
6. **Différencier** innovation réelle vs wrapper token sur business web2
7. **Cyclicité** du marché crypto doit être prise en compte pour le timing
8. **Les calculs** doivent être montrés, pas juste les résultats
9. **Jamais de probabilités de succès** - scores multi-dimensionnels uniquement
10. **FDV vs market cap** - toujours analyser la dilution future des tokens
11. **JAMAIS inventer de données** - "Non disponible" si absent
12. **TOUJOURS citer la source** (Slide X, Document Y, Context Engine Z, Fact Store)
13. **Cross-reference DB** obligatoire quand données disponibles

# EXEMPLES

## Exemple de BON output (extrait tokenomics):

\`\`\`json
{
  "tokenomics": {
    "hasToken": true,
    "tokenType": "governance",
    "tokenDesign": {
      "totalSupply": "1B tokens",
      "circulatingSupply": "180M (18%)",
      "inflationRate": "8% annuel via staking rewards",
      "vestingSchedule": "Team: 4 ans cliff 1 an, linear mensuel. Investors: 2 ans cliff 6 mois.",
      "teamAllocation": 22,
      "investorAllocation": 18,
      "communityAllocation": 45,
      "treasuryAllocation": 15
    },
    "incentiveAlignment": {
      "assessment": "moderate",
      "concerns": [
        "Team + investors = 40% → seuil critique exact. Unlock cliff investors dans 6 mois = pression vendeuse prévisible. Calcul: 180M * 18% = 32.4M tokens unlock Q3 2025.",
        "Pas de mécanisme de burn → inflation nette 8%/an. À FDV $200M, dilution = $16M/an pour holders."
      ],
      "strengths": [
        "Vesting team 4 ans avec cliff 1 an = engagement long terme vérifié (source: token contract on-chain)",
        "Community allocation 45% > threshold 40% = bon signal d'alignement"
      ]
    },
    "regulatoryClassification": {
      "likelyClassification": "security",
      "howeyTestRisk": "high",
      "rationale": "Token distribué via ICO avec attente de profit basée sur les efforts de l'équipe. 3/4 critères Howey remplis: (1) Investment of money ✓, (2) Common enterprise ✓, (3) Expectation of profits ✓, (4) Efforts of others ✓. Précédent SEC: LBRY (2022) = cas similaire, amende $22M. Risque d'enforcement non négligeable."
    },
    "overallAssessment": "Tokenomics à la limite du seuil critique (40% insider). Le vesting team est rassurant mais l'unlock investors Q3 2025 créera une pression vendeuse. Score tokenomics: 11/20."
  }
}
\`\`\`

## Exemple de MAUVAIS output (INTERDIT):

\`\`\`json
{
  "tokenomics": {
    "hasToken": true,
    "tokenType": "utility",
    "incentiveAlignment": {
      "assessment": "well_aligned",
      "concerns": [],
      "strengths": ["Good tokenomics"]
    },
    "regulatoryClassification": {
      "likelyClassification": "utility",
      "howeyTestRisk": "low",
      "rationale": "The token is a utility token"
    },
    "overallAssessment": "Tokenomics look good overall"
  }
}
\`\`\`
→ POURQUOI C'EST NUL:
- "Good tokenomics" = vide de sens, aucun chiffre
- Aucune source, aucun calcul montré
- Howey test "low" sans analyse des 4 critères = affirmation sans preuve
- Aucune allocation mentionnée = impossible à vérifier
- "look good overall" s'appliquerait à n'importe quel deal

## Exemple de BON output (extrait red flag):

\`\`\`json
{
  "sectorRedFlags": [
    {
      "id": "RF-BC-001",
      "flag": "Smart contracts non audités sur mainnet",
      "severity": "critical",
      "category": "security",
      "sectorReason": "En DeFi, 100% du code mainnet doit être audité. Rekt.news: $3.8B perdus en 2023 via exploits, dont 60% sur code non audité.",
      "evidence": "Aucun rapport d'audit mentionné dans le deck (vérifié slides 1-25). GitHub repo: dernier commit il y a 3 jours, tag v2.1.0 déployé sans mention d'audit.",
      "benchmarkViolated": "Smart Contract Audit Coverage: 0% vs 100% requis (standard industrie)",
      "impact": "Risque de perte totale des fonds utilisateurs. En cas de hack, perte de TVL immédiate + destruction de la réputation. Aucune assurance (Nexus Mutual) ne couvrira un protocole non audité.",
      "question": "Avez-vous fait auditer vos smart contracts? Par qui? Pouvez-vous partager le rapport?",
      "redFlagIfBadAnswer": "Si pas d'audit ou audit par une firme inconnue: deal-breaker immédiat. Budget audit standard: $50K-$200K pour DeFi."
    }
  ]
}
\`\`\`

# FORMAT DE RÉPONSE

Tu dois produire une analyse JSON structurée. Chaque section doit être sourcée et justifiée.
Chaque affirmation = source entre parenthèses.
Chaque calcul = montré étape par étape.
Chaque red flag = severity + evidence + impact + question + redFlagIfBadAnswer.
`;
}

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildBlockchainUserPrompt(
  context: EnrichedAgentContext,
  previousResults: Record<string, unknown> | null
): string {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract relevant info from previous Tier 1 results
  let tier1Insights = "";
  if (previousResults) {
    const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
    if (financialAudit?.success && financialAudit.data) {
      tier1Insights += `\n### Financial Auditor Findings:\n`;
      if (financialAudit.data.narrative?.keyInsights) {
        tier1Insights += financialAudit.data.narrative.keyInsights.join("\n- ");
      }
      if (financialAudit.data.findings) {
        tier1Insights += `\nFindings: ${JSON.stringify(financialAudit.data.findings, null, 2).slice(0, 2000)}...`;
      }
    }

    const competitiveIntel = previousResults["competitive-intel"] as { success?: boolean; data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } } } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) {
        tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      }
      if (competitiveIntel.data.findings?.competitors) {
        tier1Insights += `\nCompetitors identified: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
      }
    }

    const legalRegulatory = previousResults["legal-regulatory"] as { success?: boolean; data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } } } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) {
        tier1Insights += `Compliance areas: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      }
      if (legalRegulatory.data.findings?.regulatoryRisks) {
        tier1Insights += `\nRegulatory risks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
      }
    }

    const extractor = previousResults["document-extractor"] as { success?: boolean; data?: { extractedInfo?: Record<string, unknown> } } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) {
      tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
    }
  }

  // Context Engine data if available
  let contextEngineData = "";
  if (context.contextEngine) {
    if (context.contextEngine.dealIntelligence) {
      contextEngineData += `\n### Similar Blockchain/Web3 Deals (from Context Engine):\n`;
      contextEngineData += JSON.stringify(context.contextEngine.dealIntelligence, null, 2).slice(0, 3000);
    }
    if (context.contextEngine.competitiveLandscape) {
      contextEngineData += `\n### Competitive Landscape:\n`;
      contextEngineData += JSON.stringify(context.contextEngine.competitiveLandscape, null, 2).slice(0, 2500);
    }
  }

  // Funding DB data for cross-reference
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE

Tu DOIS produire un champ "dbCrossReference" dans ton output.

### Concurrents détectés dans la DB
${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun concurrent détecté dans la DB"}

### Benchmark valorisation
${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "Pas de benchmark disponible"}

### Tendance funding secteur
${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "Pas de tendance disponible"}

INSTRUCTIONS DB:
1. Chaque claim du deck concernant le marché/concurrence DOIT être vérifié vs ces données
2. Les concurrents DB absents du deck = RED FLAG CRITICAL "Omission volontaire"
3. Positionner la valorisation vs percentiles (P25/median/P75)
4. Si le deck dit "pas de concurrent" mais la DB en trouve = RED FLAG CRITICAL`;
  }

  return `## DEAL À ANALYSER - EXPERTISE BLOCKCHAIN / WEB3 REQUISE

### Informations de base
- **Company**: ${deal.companyName ?? deal.name}
- **Sector**: ${deal.sector ?? "Blockchain / Web3"}
- **Stage**: ${stage}
- **Geography**: ${deal.geography ?? "Unknown"}
- **ARR**: ${deal.arr != null ? `€${Number(deal.arr).toLocaleString()}` : "Not provided"}
- **Amount Raising**: ${deal.amountRequested != null ? `€${Number(deal.amountRequested).toLocaleString()}` : "Not provided"}
- **Valuation**: ${deal.valuationPre != null ? `€${Number(deal.valuationPre).toLocaleString()} pre-money` : "Not provided"}

### Documents disponibles
${context.documents?.map(d => `- ${d.name} (${d.type})`).join("\n") || "Aucun document fourni"}

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

${contextEngineData ? `## DONNÉES CONTEXT ENGINE\n${contextEngineData}` : ""}

${fundingDbData}

${context.factStoreFormatted ? `## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}` : ""}

## TA MISSION

En tant qu'expert Blockchain / Web3, tu dois produire une analyse sectorielle APPROFONDIE qui couvre:

### 1. IDENTIFICATION DU SOUS-SECTEUR
Identifie précisément le sous-secteur (DeFi, Infrastructure L1/L2, NFT, DAO tooling, CeFi, Gaming Web3, RWA tokenization, etc.) et ses implications.

### 2. ÉVALUATION DES MÉTRIQUES CLÉS (minimum 5)
Pour chaque métrique disponible:
- Compare aux benchmarks du stage ${stage}
- Calcule le percentile
- Explique pourquoi cette métrique compte en blockchain/web3
- Montre les calculs si applicable

### 3. TOKENOMICS ANALYSIS (CRITIQUE si token présent)
- Token type (utility/governance/security/hybrid)
- Supply dynamics (inflation, vesting, unlocks)
- Insider allocation vs community
- Value accrual mechanism
- Howey test risk assessment
- FDV vs circulating market cap ratio

### 4. SMART CONTRACT SECURITY
- Audit status et auditors
- Bug bounty program
- Incident history
- Formal verification status

### 5. ANALYSE RÉGLEMENTAIRE (CRITIQUE)
- Quels frameworks s'appliquent (MiCA, SEC, CFTC, etc.)?
- Licences requises (CASP, VASP, etc.)
- Token classification risk
- Upcoming regulatory changes

### 6. DECENTRALIZATION ASSESSMENT
- Governance model
- Infrastructure distribution
- Key-man risk / centralization vectors
- Progressive decentralization roadmap

### 7. RED FLAGS SECTORIELS
Applique les règles de red flag automatiques. Vérifie au minimum:
- Token insider allocation > 40%
- Pas d'audit smart contract
- Revenue = 100% token incentives
- Regulatory non-compliance
- Single point of failure

### 8. QUESTIONS SPÉCIFIQUES WEB3 (minimum 5)
Génère des questions qui sondent les risques spécifiques:
- Tokenomics sustainability
- Smart contract security
- Regulatory pathway
- Decentralization roadmap
- Business model without token

### 9. DATA COMPLETENESS
Évalue la complétude des données:
- Compte les data points disponibles vs attendus
- Liste les données critiques manquantes
- RÈGLE: Si completeness = "minimal" → score max = 50. Si "partial" → score max = 70.

### 10. DB CROSS-REFERENCE (si données DB fournies)
Pour chaque claim du deck:
- Vérifier contre les données DB (VERIFIED/CONTREDIT/PARTIEL/NON_VERIFIABLE)
- Identifier les concurrents cachés (dans DB mais pas dans deck)
- Calculer le percentile de valorisation

### 11. VERDICT ACTIONNABLE
Score 0-100 avec breakdown par dimension:
- Métriques (0-20)
- Tokenomics (0-20)
- Security (0-20)
- Réglementaire (0-20)
- Position Marché (0-20)

IMPORTANT: Le score final est CAPPÉ selon la complétude des données.

Produis ton analyse au format JSON conforme au schema.`;
}

// ============================================================================
// AGENT PRINCIPAL
// ============================================================================

export const blockchainExpert = {
  name: "blockchain-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const previousResults = context.previousResults ?? null;
      const stage = context.deal.stage ?? "SEED";

      const userPrompt = buildBlockchainUserPrompt(context, previousResults as Record<string, unknown> | null);

      setAgentContext("blockchain-expert");

      const response = await complete(userPrompt, {
        systemPrompt: buildBlockchainSystemPrompt(stage),
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: BlockchainExpertOutput;
      let parseValidationIssues: string[] = [];
      try {
        const rawJson = JSON.parse(extractFirstJSON(response.content));
        const parseResult = BlockchainExpertOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          parseValidationIssues = parseResult.error.issues.map(
            i => `${i.path.join(".")}: ${i.message}`
          );
          console.warn(`[blockchain-expert] Strict parse failed (${parseValidationIssues.length} issues): ${parseValidationIssues.slice(0, 5).join(", ")}`);
          parsedOutput = rawJson as BlockchainExpertOutput;
        }
      } catch (parseError) {
        console.error("[blockchain-expert] Parse error:", parseError);
        return {
          agentName: "blockchain-expert",
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultBlockchainData(),
        };
      }

      // ── Data completeness assessment & score capping ──
      const completenessData = parsedOutput.dataCompleteness ?? {
        level: "partial" as const,
        availableDataPoints: 0,
        expectedDataPoints: 0,
        missingCritical: [],
        limitations: [],
      };

      // Determine completeness from metrics if LLM didn't produce it
      const availableMetrics = (parsedOutput.keyMetrics ?? []).filter(m => m.value !== null).length;
      const totalMetrics = (parsedOutput.keyMetrics ?? []).length;
      let completenessLevel = completenessData.level;
      if (totalMetrics > 0 && !parsedOutput.dataCompleteness) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = "minimal";
        else if (ratio < 0.7) completenessLevel = "partial";
        else completenessLevel = "complete";
      }

      // Cap score based on completeness (Section 7.2 of AGENT-REFONTE-PROMPT)
      let scoreMax = 100;
      if (completenessLevel === "minimal") scoreMax = 50;
      else if (completenessLevel === "partial") scoreMax = 70;

      const rawScore = parsedOutput.sectorScore ?? 0;
      const cappedScore = Math.min(rawScore, scoreMax);

      // Also cap fit score
      const rawFitScore = parsedOutput.sectorFit?.score ?? 0;
      const cappedFitScore = Math.min(rawFitScore, scoreMax);

      // Build limitations list
      const limitations: string[] = [
        ...(completenessData.limitations ?? []),
        ...(completenessData.missingCritical ?? []).map(m => `Missing critical data: ${m}`),
      ];
      if (parseValidationIssues.length > 0) {
        limitations.push(`${parseValidationIssues.length} fields failed strict validation`);
      }
      if (cappedScore < rawScore) {
        limitations.push(`Score capped from ${rawScore} to ${cappedScore} due to ${completenessLevel} data completeness`);
      }

      // Transform to SectorExpertData format
      const regEnv = (parsedOutput.regulatoryEnvironment ?? {}) as Partial<BlockchainExpertOutput["regulatoryEnvironment"]>;
      const dynData = (parsedOutput.sectorDynamics ?? {}) as Partial<BlockchainExpertOutput["sectorDynamics"]>;
      const fitData = (parsedOutput.sectorFit ?? {}) as Partial<BlockchainExpertOutput["sectorFit"]>;

      const sectorData: SectorExpertData = {
        sectorName: parsedOutput.sectorName ?? "Blockchain",
        sectorMaturity: parsedOutput.sectorMaturity ?? "emerging",

        keyMetrics: (parsedOutput.keyMetrics ?? []).map(m => ({
          metricName: m.metricName,
          value: m.value,
          sectorBenchmark: m.sectorBenchmark,
          assessment: m.assessment,
          sectorContext: m.sectorContext,
        })),

        sectorRedFlags: (parsedOutput.sectorRedFlags ?? []).map(rf => ({
          flag: rf.flag,
          severity: rf.severity,
          sectorReason: rf.sectorReason,
        })),

        sectorOpportunities: (parsedOutput.sectorOpportunities ?? []).map(o => ({
          opportunity: o.opportunity,
          potential: o.potential,
          reasoning: o.reasoning,
        })),

        regulatoryEnvironment: {
          complexity: regEnv.complexity ?? "very_high" as "low" | "medium" | "high" | "very_high",
          keyRegulations: (regEnv.regulatoryFrameworks ?? []).map(f => f.framework),
          complianceRisks: (regEnv.regulatoryFrameworks ?? [])
            .filter(f => f.complianceStatus !== "compliant")
            .map(f => `${f.framework}: ${f.details}`),
          upcomingChanges: (regEnv.upcomingChanges ?? []).map(
            c => `${c.regulation} (${c.effectiveDate}): ${c.description}`
          ),
        },

        sectorDynamics: {
          competitionIntensity: dynData.competitionIntensity ?? "high",
          consolidationTrend: dynData.consolidationTrend ?? "fragmenting",
          barrierToEntry: dynData.barrierToEntry ?? "low",
          typicalExitMultiple: dynData.typicalExitMultiple ?? 0,
          recentExits: (dynData.recentExits ?? []).map(
            e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`
          ),
        },

        sectorQuestions: (parsedOutput.sectorQuestions ?? []).map(q => ({
          question: q.question,
          category: q.category as "technical" | "business" | "regulatory" | "competitive",
          priority: q.priority,
          expectedAnswer: q.expectedAnswer,
          redFlagAnswer: q.redFlagAnswer,
        })),

        sectorFit: {
          score: cappedFitScore,
          strengths: fitData.strengths ?? [],
          weaknesses: fitData.weaknesses ?? [],
          sectorTiming: fitData.sectorTiming ?? "early",
        },

        sectorScore: cappedScore,
        executiveSummary: parsedOutput.executiveSummary ?? "Analysis incomplete due to partial LLM response",
      };

      // Build typed extended data
      const extendedData: BlockchainExtendedData = {
        subSector: parsedOutput.subSector,
        blockchainTokenomics: parsedOutput.tokenomics,
        blockchainSecurity: parsedOutput.smartContractSecurity,
        blockchainDecentralization: parsedOutput.decentralization,
        businessModelFit: {
          modelType: parsedOutput.businessModelFit?.modelType ?? "",
          modelViability: parsedOutput.businessModelFit?.modelViability ?? "unproven",
          viabilityRationale: parsedOutput.businessModelFit?.viabilityRationale ?? "",
          unitEconomicsPath: parsedOutput.businessModelFit?.sustainabilityWithoutToken ?? "",
          scalingChallenges: parsedOutput.businessModelFit?.scalingChallenges ?? [],
          regulatoryPathway: "",
        },
        scoreBreakdown: {
          metricsScore: parsedOutput.scoreBreakdown?.metricsScore,
          regulatoryScore: parsedOutput.scoreBreakdown?.regulatoryScore,
          justification: parsedOutput.scoreBreakdown?.justification,
        },
        verdict: parsedOutput.verdict,
        regulatoryDetails: {
          licenses: regEnv.licensesRequired,
          overallRisk: regEnv.overallRegulatoryRisk,
          verdict: regEnv.regulatoryVerdict,
        },
        bigTechThreat: dynData.bigTechThreat,
        dbCrossReference: parsedOutput.dbCrossReference,
        dataCompleteness: {
          level: completenessLevel,
          availableDataPoints: completenessData.availableDataPoints ?? availableMetrics,
          expectedDataPoints: completenessData.expectedDataPoints ?? totalMetrics,
          missingCritical: completenessData.missingCritical ?? [],
          limitations,
          scoreCapped: cappedScore < rawScore,
          rawScore,
          cappedScore,
        },
        cyclicality: parsedOutput.sectorDynamics?.cyclicality,
      };

      return {
        agentName: "blockchain-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        _extended: extendedData,
      };

    } catch (error) {
      console.error("[blockchain-expert] Execution error:", error);
      return {
        agentName: "blockchain-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultBlockchainData(),
      };
    }
  },
};

// ============================================================================
// DEFAULT DATA (fallback)
// ============================================================================

function getDefaultBlockchainData(): SectorExpertData {
  return {
    sectorName: "Blockchain",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full blockchain/web3 sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "very_high",
      keyRegulations: ["MiCA", "SEC Howey Test", "FATF Travel Rule", "CFTC"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "fragmenting",
      barrierToEntry: "low",
      typicalExitMultiple: 8,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "Has the protocol undergone at least two independent smart contract audits?",
        category: "technical",
        priority: "must_ask",
        expectedAnswer: "Yes, with named auditors (e.g., Trail of Bits, OpenZeppelin, Certora) and published reports",
        redFlagAnswer: "No audit or single audit from unknown firm",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "early",
    },
    sectorScore: 0,
    executiveSummary: "Blockchain/Web3 sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

export default blockchainExpert;
