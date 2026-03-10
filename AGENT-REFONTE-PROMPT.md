# PROMPT ABSOLU - Refonte des 40 Agents (3 Tiers)

> **Document de reference pour la refonte complete des 40 agents d'Angel Desk (Tier 1, 2 et 3).**
> Ce fichier doit etre lu en entier avant de modifier un agent.
> Chaque agent doit etre refait selon ces standards - aucune exception.
> L'agent ne doit JAMAIS inventer
> L'agent doit toujours cross-checker avant d'affirmer des choses

---

## RESUME EXECUTIF - 38 AGENTS (3 TIERS)

| Tier       | Nb Agents | Role                                         | Exemples                                                                          |
| ---------- | --------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| **Tier 1** | 12        | Analyse                                      | financial-auditor, deck-forensics, team-investigator, competitive-intel...        |
| **Tier 2** | 22        | Experts sectoriels (21 secteurs + 1 general) | saas-expert, fintech-expert, blockchain-expert, general-expert...                 |
| **Tier 3** | 5         | Synthese                                     | contradiction-detector, synthesis-deal-scorer, devils-advocate, memo-generator... |

**TOTAL : 40 agents (13 Tier 1 + 22 Tier 2 + 5 Tier 3)**

- Tier 1 : Agents d'analyse qui tournent en parallele sur chaque deal
- Tier 2 : Experts sectoriels actives dynamiquement selon le secteur du deal (20 secteurs couverts + 1 general-expert fallback)
- Tier 3 : Agents de synthese qui agrègent les outputs de Tier 1 et 2

> **Liste complete en Section 11** avec fichiers et priorites.

---

## TABLE DES MATIERES

1. [Vision & Philosophie](#1-vision--philosophie)
2. [Anti-Patterns a Eliminer](#2-anti-patterns-a-eliminer)
3. [Standards de Qualite](#3-standards-de-qualite)
4. [Architecture des Prompts](#4-architecture-des-prompts)
5. [Format de Sortie](#5-format-de-sortie)
6. [Regles Absolues](#6-regles-absolues)
7. [Gestion des Donnees Manquantes](#7-gestion-des-donnees-manquantes)
8. [Exploitation de la Funding Database](#8-exploitation-de-la-funding-database)
9. [Template de Refonte](#9-template-de-refonte)
10. [Checklist de Validation](#10-checklist-de-validation)
11. [Liste des Agents a Refondre (40 agents)](#11-liste-des-agents-a-refondre-38-agents)

---

## 1. VISION & PHILOSOPHIE

### Ce que nous construisons

Angel Desk doit fournir a un Business Angel solo **la meme qualite d'analyse qu'une equipe de 5 analystes VC seniors travaillant pendant 2 jours**. En 1 heure.

Ce n'est PAS:

- Un chatbot qui resume des documents
- Un outil de scoring simpliste
- Une checklist automatisee

C'est:

- Un expert avec 20+ ans d'experience qui lit entre les lignes
- Un detective qui croise chaque claim avec des donnees externes
- Un conseiller qui dit la verite, meme desagreable
- Un partenaire qui donne des insights actionnables

### La Persona des Agents

Chaque agent incarne un **double persona**:

```
ANALYSTE BIG4 SENIOR          +          PARTNER VC EXPERIMENTE
━━━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━━━
- Methodologie rigoureuse                 - Pattern matching 20+ ans
- Citations precises                      - Instinct pour les red flags
- Checklists exhaustives                  - Focus sur les deal-breakers
- Preuves documentees                     - Insights strategiques
- Zero approximation                      - Experience des echecs
```

### Orientation BA (pas VC)

Le Business Angel:

- Est SEUL face au deal (pas d'equipe pour verifier)
- A peu de TEMPS (2-3h/semaine max pour tous ses deals)
- N'a PAS ACCES aux donnees pro (pas de PitchBook)
- Investit son PROPRE ARGENT (pas celui d'un fonds)
- A besoin d'ARGUMENTS pour negocier

Chaque output doit repondre a: **"Est-ce que ca m'aide a prendre une meilleure decision d'investissement?"**

---

## 2. ANTI-PATTERNS A ELIMINER

### 2.1 L'Analyse Superficielle

```
❌ MAUVAIS - Ce qu'on produit actuellement:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"L'equipe semble solide avec des profils complementaires.
Le CEO a de l'experience dans le secteur.
Quelques points a clarifier sur le background du CTO."

POURQUOI C'EST NUL:
- "Semble solide" = aucune preuve
- "De l'experience" = combien d'annees? Ou? Quels resultats?
- "Quelques points" = lesquels exactement?
- Zero insight actionnable
```

```
✅ BON - Ce qu'on doit produire:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"TEAM SCORE: 62/100 - MODERATE AVEC RESERVES

CEO - Marie Dupont:
├─ Experience verifiee: 8 ans chez Salesforce (2014-2022), VP Sales EMEA
├─ Track record: +340% ARR sur son scope (source: LinkedIn + article TechCrunch 2021)
├─ RED FLAG: Gap de 18 mois non explique (Jan 2022 - Juil 2023)
├─ Question a poser: 'Que s'est-il passe entre Salesforce et cette startup?'
└─ Si reponse evasive: -15 points confiance

CTO - Jean Martin:
├─ Background INVERIVIABLE - pas de LinkedIn public
├─ Claim deck: 'Ex-Google Senior Engineer' - AUCUNE preuve trouvee
├─ Recherche Crunchbase/LinkedIn: 0 resultat pour ce nom + Google
├─ RED FLAG CRITIQUE: Potentielle falsification de CV
├─ Action requise: Demander preuves d'emploi Google avant toute discussion
└─ Impact: Si faux, deal-breaker immediat

VERDICT EQUIPE: Ne pas avancer sans verification du background CTO.
Risque de fraude non negligeable."
```

Ici il y a une API qui se connecte pour analyser le LinkedIn des fondateurs.

### 2.2 L'Output Generique

```
❌ MAUVAIS:
━━━━━━━━━━

"Le marche presente des opportunites interessantes avec une croissance
attendue. La concurrence est presente mais la startup se differencie
par son approche innovante."

→ Cette phrase pourrait s'appliquer a 90% des startups.
→ Zero information specifique au deal.
→ Zero chiffre, zero source.
```

```
✅ BON:
━━━━━━

"MARCHE: EdTech B2B Europe - TIMING DEFAVORABLE

Donnees Context Engine (Dealroom + Crunchbase Q4 2024):
├─ Funding EdTech Europe: -47% YoY (312M€ vs 589M€ en 2023)
├─ Deals Seed: 23 vs 41 l'an dernier (-44%)
├─ Valorisation mediane Seed: 4.2M€ (vs 6.1M€ en 2023, -31%)

Position de CE DEAL vs marche:
├─ Valorisation demandee: 8M€ pre-money
├─ Percentile: 94eme (seulement 6% des deals au-dessus)
├─ Ecart vs mediane: +90%

Comparables directs (3 deals similaires 2024):
├─ LearnFlow: 3.8M€ pre @ 180K€ ARR (21x) - Paris
├─ SkillUp: 5.2M€ pre @ 320K€ ARR (16x) - Berlin
├─ EduStack: 4.5M€ pre @ 250K€ ARR (18x) - Londres

CE DEAL: 8M€ pre @ 150K€ ARR = 53x ARR
→ 3x plus cher que la mediane du secteur
→ Dans un marche en contraction

SIGNAL D'ALERTE: Valorisation deconnectee du marche actuel."
```

### 2.3 Le Red Flag Vague

```
❌ MAUVAIS:
━━━━━━━━━━

redFlags: [
  "Quelques inconsistances dans les projections",
  "Le marche pourrait etre plus petit que prevu",
  "L'equipe manque peut-etre d'experience"
]

→ "Quelques", "pourrait", "peut-etre" = INTERDIT
→ Aucune localisation precise
→ Aucune quantification
→ Aucun impact pour le BA
```

```
✅ BON:
━━━━━━

redFlags: [
  {
    category: "financials",
    severity: "CRITICAL",
    flag: "Projection ARR mathematiquement impossible",
    location: "Slide 12, Financial Model onglet 'Projections'",
    evidence: "ARR 2024: 150K€ → ARR 2025: 2.4M€ = +1500% YoY",
    context: "Benchmark SaaS B2B Seed: croissance moyenne 120% YoY (OpenView 2024)",
    calculation: "Pour atteindre 2.4M€, il faudrait 160 nouveaux clients a 15K€ ACV en 12 mois, soit 13/mois. Pipeline actuel: 8 prospects total.",
    impact: "Si l'investisseur base son ROI sur ces projections, il sera decu de 90%+",
    question: "Comment comptez-vous signer 13 nouveaux clients/mois avec une equipe sales de 1 personne?",
    redFlagIfBadAnswer: "Fondateur deconnecte de la realite operationnelle"
  }
]
```

### 2.4 Le Manque de Cross-Reference

```
❌ MAUVAIS:
━━━━━━━━━━

"Le fondateur indique avoir leve 500K€ precedemment pour sa premiere startup."

→ On rapporte le claim sans le verifier
→ Le Context Engine a les donnees - pourquoi ne pas croiser?
```

```
✅ BON:
━━━━━━

"VERIFICATION LEVEE PRECEDENTE:

Claim deck (Slide 3): 'Levee de 500K€ pour TechPrev en 2019'

Cross-reference Context Engine:
├─ Crunchbase: TechPrev - AUCUN RESULTAT
├─ Dealroom: TechPrev - AUCUN RESULTAT
├─ LinkedIn fondateur: Mentionne 'TechPrev 2018-2020, Founder'
├─ Societe.com: TechPrev SAS - Capital social 10K€, dissoute 2021

CONCLUSION: La levee de 500K€ n'est verifiable nulle part.
Capital social de 10K€ suggere autofinancement, pas levee externe.

RED FLAG: Potentielle exageration du track record.
Confiance claim: 15%"
```

---

## 3. STANDARDS DE QUALITE

### 3.1 Niveau d'Analyse Attendu

Chaque agent doit produire une analyse qui serait **facturee 50,000€** si faite par un cabinet de conseil.

Criteres:

- [ ] Chaque affirmation est sourcee (document, slide, Context Engine, calcul)
- [ ] Chaque chiffre est verifie ou marque comme "non verifiable"
- [ ] Chaque red flag a une severite, une preuve, et un impact quantifie
- [ ] Chaque recommandation est actionnable immediatement
- [ ] Le BA peut lire l'output a un fondateur sans avoir honte

### 3.2 Profondeur d'Investigation

```
NIVEAU SURFACE (INTERDIT)     NIVEAU ATTENDU
━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━

"Bon track record"            → 3 experiences verifiees avec outcomes
                              → Gaps identifies et questionnes
                              → Network mappe (qui le connait?)

"Marche en croissance"        → CAGR exact + source
                              → Position dans le cycle
                              → 5 deals comparables avec multiples

"Unit economics sains"        → LTV calcule avec hypotheses explicites
                              → CAC decompose par canal
                              → Payback vs benchmark stage

"Concurrence geree"           → 5+ concurrents mappes avec funding
                              → Differentiation verifiable
                              → Risque Big Tech evalue
```

### 3.3 Rigueur des Calculs

Tout calcul doit etre MONTRE, pas juste le resultat:

```
❌ "LTV/CAC ratio de 3.2x, ce qui est correct"

✅ "LTV/CAC RATIO:

Calcul LTV:
├─ ARPU mensuel: 500€ (Slide 8: '6000€/an par client')
├─ Gross Margin: 75% (estime - non fourni dans deck)
├─ Churn mensuel: 2.5% (Slide 11: '30% annuel' = 2.5%/mois)
├─ Lifetime: 1/0.025 = 40 mois
├─ LTV = 500€ x 75% x 40 = 15,000€

Calcul CAC:
├─ Depenses marketing 2024: 120K€ (Financial Model, onglet Budget)
├─ Nouveaux clients 2024: 45 (Slide 9)
├─ CAC = 120K / 45 = 2,667€

LTV/CAC = 15,000 / 2,667 = 5.6x

Benchmark Seed SaaS B2B (OpenView): 3.0x median
Position: 78eme percentile - BON

⚠️ CAVEAT: Gross Margin estime a 75%. Si reel = 60%, LTV/CAC = 4.5x
⚠️ CAVEAT: Churn base sur 1 an de data. Pattern saisonnier possible."
```

---

## 4. ARCHITECTURE DES PROMPTS

### 4.1 Structure du System Prompt

Chaque agent doit avoir un system prompt structure ainsi:

```typescript
protected buildSystemPrompt(): string {
  return `# ROLE ET EXPERTISE

Tu es [PERSONA SPECIFIQUE] avec 20+ ans d'experience.
Tu as analyse 500+ deals et vu les patterns de succes/echec.
Tu travailles avec les standards d'un cabinet Big4 + l'instinct d'un Partner VC.

# MISSION POUR CE DEAL

[MISSION SPECIFIQUE DE L'AGENT - 2-3 phrases max]

# METHODOLOGIE D'ANALYSE

## Etape 1: [Nom etape]
[Instructions detaillees]
- Point 1
- Point 2
- Point 3

## Etape 2: [Nom etape]
[...]

## Etape 3: [Nom etape]
[...]

# FRAMEWORK D'EVALUATION

[Grille de scoring ou criteres avec ponderation]

| Critere | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| [...]   | X%    | [desc]     | [desc]      | [desc]      | [desc]       |

# RED FLAGS A DETECTER

Liste exhaustive des red flags specifiques a ce domaine:
1. [Red flag 1] - Severite: CRITICAL/HIGH/MEDIUM
2. [Red flag 2] - [...]
[...]

# FORMAT DE SORTIE

[Description du JSON attendu - voir section 5]

# REGLES ABSOLUES

1. JAMAIS inventer de donnees - "Non disponible" si absent
2. TOUJOURS citer la source (Slide X, Document Y, Context Engine Z)
3. TOUJOURS croiser avec le Context Engine quand disponible
4. QUANTIFIER chaque fois que possible
5. Chaque red flag = severite + preuve + impact + question
6. Le BA doit pouvoir agir immediatement sur chaque output

# EXEMPLES

## Exemple de BON output:
[Exemple concret]

## Exemple de MAUVAIS output (a eviter):
[Contre-exemple]`;
}
```

### 4.2 Structure du User Prompt

```typescript
const prompt = `# ANALYSE [NOM AGENT] - ${dealName}

## DOCUMENTS FOURNIS
${this.formatDocuments(context)}

## DONNEES EXTRAITES (Document Extractor)
${JSON.stringify(extractedInfo, null, 2)}

## CONTEXTE EXTERNE (Context Engine)
${this.formatContextEngineData(context)}

## INSTRUCTIONS SPECIFIQUES

1. [Instruction 1 specifique au deal]
2. [Instruction 2]
3. [...]

## OUTPUT ATTENDU

Produis une analyse [DOMAINE] complete au format JSON specifie.
Rappel: Standard Big4 + instinct Partner VC.
Chaque affirmation doit etre sourcee ou marquee comme non verifiable.

\`\`\`json
{
  // Structure detaillee - voir section 5
}
\`\`\``;
```

---

## 5. FORMAT DE SORTIE

### 5.1 Structure Universelle

Chaque agent doit produire un JSON avec cette structure de base:

```typescript
interface AgentOutput {
  // === META ===
  meta: {
    agentName: string;
    analysisDate: string;
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number; // 0-100
    limitations: string[]; // Ce qui n'a pas pu etre analyse
  };

  // === SCORE PRINCIPAL ===
  score: {
    value: number; // 0-100
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };

  // === FINDINGS PRINCIPAUX ===
  // (specifique a chaque agent - voir section 5.2)

  // === RED FLAGS ===
  redFlags: {
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string; // "Slide 12" ou "Financial Model, onglet CF"
    evidence: string; // Citation exacte ou donnee
    contextEngineData?: string; // Cross-reference si disponible
    impact: string; // Pourquoi c'est un probleme pour le BA
    question: string; // Question a poser au fondateur
    redFlagIfBadAnswer: string;
  }[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: {
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string; // Pourquoi on pose cette question
    whatToLookFor: string; // Ce qui revelerait un probleme
  }[];

  // === SIGNAL D'ALERTE ===
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation:
      | "PROCEED"
      | "PROCEED_WITH_CAUTION"
      | "INVESTIGATE_FURTHER"
      | "STOP";
    justification: string;
  };

  // === RESUME NARRATIF ===
  narrative: {
    oneLiner: string; // Resume en 1 phrase
    summary: string; // 3-4 phrases
    keyInsights: string[]; // 3-5 insights majeurs
    forNegotiation: string[]; // Arguments pour negocier si on proceed
  };
}
```

### 5.2 Structures Specifiques par Agent

Chaque agent a ses propres findings. Voici les structures attendues:

#### Financial Auditor

```typescript
findings: {
  metrics: {
    metric: string;
    status: "available" | "missing" | "suspicious";
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string; // Montrer le calcul
    benchmarkP25?: number;
    benchmarkMedian?: number;
    benchmarkP75?: number;
    percentile?: number;
    source: string;
    assessment: string;
  }[];
  projections: {
    realistic: boolean;
    assumptions: string[];
    concerns: string[];
  };
  valuation: {
    requested: number;
    impliedMultiple: number;
    benchmarkMultiple: number;
    verdict: string;
    comparables: { name: string; multiple: number; source: string }[];
  };
  unitEconomics: {
    ltv: { value: number; calculation: string };
    cac: { value: number; calculation: string };
    ltvCacRatio: number;
    paybackMonths: number;
    assessment: string;
  };
};
```

#### Team Investigator

```typescript
findings: {
  founders: {
    name: string;
    role: string;
    verificationStatus: "verified" | "partial" | "unverified" | "suspicious";
    experience: {
      company: string;
      role: string;
      period: string;
      verified: boolean;
      source: string;
      relevance: string;
    }[];
    previousVentures: {
      name: string;
      outcome: string;
      verified: boolean;
      source: string;
    }[];
    redFlags: string[];
    strengths: string[];
    score: number;
  }[];
  teamDynamics: {
    complementarity: number;
    gaps: string[];
    workingHistory: string;
    equitySplit: string;
    vestingInPlace: boolean;
  };
};
```

#### Deck Forensics

```typescript
findings: {
  claims: {
    category: string;
    claim: string;
    location: string;
    status: "verified" | "unverified" | "contradicted" | "exaggerated";
    evidence: string;
    source: string;
  }
  [];
  inconsistencies: {
    description: string;
    location1: string;
    location2: string;
    quote1: string;
    quote2: string;
    severity: string;
  }
  [];
  missingInfo: {
    item: string;
    importance: string;
    impact: string;
  }
  [];
  credibilityScore: number;
}
```

#### Market Intelligence

```typescript
findings: {
  marketSize: {
    tam: {
      value: number;
      source: string;
      year: number;
    }
    sam: {
      value: number;
      source: string;
      calculation: string;
    }
    som: {
      value: number;
      source: string;
      calculation: string;
    }
    growthRate: {
      cagr: number;
      source: string;
      period: string;
    }
  }
  fundingTrends: {
    totalFunding: {
      value: number;
      period: string;
      yoyChange: number;
    }
    dealCount: {
      value: number;
      period: string;
      yoyChange: number;
    }
    averageDealSize: {
      value: number;
      percentile: number;
    }
    trend: "HEATING" | "STABLE" | "COOLING";
  }
  timing: {
    assessment: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE";
    reasoning: string;
    windowRemaining: string;
  }
}
```

#### Competitive Intel

```typescript
findings: {
  competitors: {
    name: string;
    type: "direct" | "indirect" | "potential";
    funding: { total: number; lastRound: number; stage: string };
    positioning: string;
    strengths: string[];
    weaknesses: string[];
    threatLevel: "HIGH" | "MEDIUM" | "LOW";
    source: string;
  }[];
  competitorComparison: {
    fromDeck: { mentioned: string[]; location: string };
    fromDb: { detected: string[]; directCompetitors: number };
    hiddenCompetitors: string[]; // RED FLAG si non vide
    deckAccuracy: "ACCURATE" | "INCOMPLETE" | "MISLEADING";
  };
  marketPosition: {
    differentiators: string[];
    sustainable: boolean;
    moatStrength: number;
  };
};
```

#### Exit Strategist

```typescript
findings: {
  exitScenarios: {
    type: "IPO" | "M&A" | "PE" | "SECONDARY";
    probability: "HIGH" | "MEDIUM" | "LOW";
    timeline: string;
    potentialAcquirers: string[];
    expectedMultiple: { min: number; median: number; max: number };
    comparableExits: { company: string; acquirer: string; multiple: number; year: number }[];
  }[];
  investorReturn: {
    scenario: string;
    entryValuation: number;
    exitValuation: number;
    multiple: number;
    irr: number;
  }[];
};
```

#### Tech Stack DD (split from Technical DD - Stack + Scalabilite + Dette)

```typescript
findings: {
  techStack: {
    frontend: { technologies: string[]; assessment: string; modernityScore: number };
    backend: { technologies: string[]; languages: string[]; frameworks: string[]; assessment: string };
    infrastructure: { cloud: string; containerization: boolean; cicd: string; assessment: string };
    databases: { primary: string; secondary: string[]; appropriateness: string };
    thirdPartyDependencies: { critical: { name: string; risk: string }[]; vendorLockIn: "LOW" | "MEDIUM" | "HIGH" };
    overallAssessment: "MODERN" | "ADEQUATE" | "OUTDATED" | "CONCERNING";
  };
  scalability: {
    currentArchitecture: "monolith" | "microservices" | "serverless" | "hybrid" | "unknown";
    bottlenecks: { component: string; issue: string; severity: string; estimatedCostToFix: string }[];
    readinessForGrowth: { x10: { ready: boolean; blockers: string[] }; x100: { ready: boolean; blockers: string[] } };
    scalabilityScore: number;
  };
  technicalDebt: {
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    indicators: { indicator: string; evidence: string; severity: string }[];
    estimatedCost: { toFix: string; ifIgnored: string; timeline: string };
    codeQuality: { testCoverage: string; documentation: string; codeReview: boolean };
  };
  technicalRisks: { id: string; risk: string; category: string; severity: string; impact: string }[];
  sectorBenchmark: { stackVsSector: string; debtVsSector: string; scalabilityVsSector: string };
};
```

#### Tech Ops DD (split from Technical DD - Maturite + Equipe + Secu + IP)

```typescript
findings: {
  productMaturity: {
    stage: "concept" | "prototype" | "mvp" | "beta" | "production" | "scale";
    stageEvidence: string;
    stability: { score: number; incidentFrequency: string; uptimeEstimate: string };
    featureCompleteness: { score: number; coreFeatures: { feature: string; status: string }[] };
    releaseVelocity: { frequency: string; assessment: string };
  };
  teamCapability: {
    teamSize: { current: number; breakdown: { role: string; count: number }[] };
    seniorityLevel: { assessment: "JUNIOR" | "MID" | "SENIOR" | "MIXED" | "UNKNOWN"; evidence: string };
    gaps: { gap: string; severity: string; impact: string; recommendation: string }[];
    keyPersonRisk: { exists: boolean; persons: string[]; mitigation: string };
    hiringNeeds: { role: string; priority: string; rationale: string }[];
  };
  security: {
    posture: "POOR" | "BASIC" | "GOOD" | "EXCELLENT" | "UNKNOWN";
    compliance: { gdpr: string; soc2: string; other: string[] };
    practices: { practice: string; status: string }[];
    vulnerabilities: { area: string; severity: string; description: string }[];
  };
  ipProtection: {
    patents: { granted: number; pending: number; domains: string[]; strategicValue: string };
    tradeSecrets: { exists: boolean; protected: boolean; description: string };
    openSourceRisk: { level: "NONE" | "LOW" | "MEDIUM" | "HIGH"; licenses: string[] };
    proprietaryTech: { exists: boolean; description: string; defensibility: string };
  };
  technicalRisks: { id: string; risk: string; category: string; severity: string; impact: string }[];
  sectorBenchmark: { maturityVsSector: string; teamSizeVsSector: string; securityVsSector: string };
};
```

#### Legal Regulatory

```typescript
findings: {
  compliance: {
    area: string;
    status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "UNKNOWN";
    requirements: string[];
    gaps: string[];
    risk: "HIGH" | "MEDIUM" | "LOW";
  }[];
  ipStatus: {
    patents: { count: number; status: string; value: string };
    trademarks: { count: number; status: string };
    trade_secrets: { protected: boolean; measures: string[] };
  };
  regulatoryRisks: {
    risk: string;
    probability: "HIGH" | "MEDIUM" | "LOW";
    impact: string;
    mitigation: string;
  }[];
};
```

#### GTM Analyst

```typescript
findings: {
  channels: {
    channel: string;
    contribution: number; // % of revenue
    cac: number;
    efficiency: "HIGH" | "MEDIUM" | "LOW";
    scalability: string;
  }[];
  salesMotion: {
    type: "PLG" | "SALES_LED" | "HYBRID";
    cycleLength: number; // days
    conversionRate: number;
    bottlenecks: string[];
  };
  expansion: {
    strategy: string;
    markets: string[];
    timeline: string;
    risks: string[];
  };
};
```

#### Customer Intel

```typescript
findings: {
  customerProfile: {
    segments: { name: string; size: number; value: number }[];
    idealCustomer: string;
    concentration: { top10Percent: number; risk: string };
  };
  retention: {
    grossRetention: number;
    netRetention: number;
    churnReasons: string[];
    benchmark: { median: number; percentile: number };
  };
  satisfaction: {
    nps: number;
    reviews: { source: string; rating: number; count: number }[];
    complaints: string[];
  };
};
```

#### Cap Table Auditor

```typescript
findings: {
  ownership: {
    founders: { name: string; percentage: number; vesting: string }[];
    investors: { name: string; percentage: number; rights: string[] }[];
    esop: { allocated: number; remaining: number };
  };
  dilution: {
    currentRound: number;
    projectedAtExit: number;
    founderRetention: number;
    benchmark: { median: number; assessment: string };
  };
  redFlags: {
    issue: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    impact: string;
  }[];
};
```

#### Question Master

```typescript
findings: {
  criticalQuestions: {
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string;
    triggerSource: string; // "deck_claim" | "db_gap" | "missing_data"
    expectedAnswer: string;
    redFlagIfBadAnswer: string;
  }
  [];
  negotiationPoints: {
    topic: string;
    leverage: string;
    suggestedApproach: string;
    dataSupport: string;
  }
  [];
}
```

---

### 5.3 Structures TIER 2 - Experts Sectoriels

Les experts sectoriels partagent une structure commune avec des metriques specifiques au secteur.

#### Base Sector Expert (structure commune)

```typescript
findings: {
  sectorFit: {
    alignment: number; // 0-100
    keyMetricsPresent: string[];
    keyMetricsMissing: string[];
  };
  benchmarks: {
    metric: string;
    dealValue: number;
    sectorP25: number;
    sectorMedian: number;
    sectorP75: number;
    percentile: number;
    assessment: string;
  }[];
  sectorSpecificRisks: {
    risk: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    sectorContext: string;
    mitigation: string;
  }[];
  comparables: {
    company: string;
    metric: string;
    value: number;
    outcome: string;
    source: string;
  }[];
};
```

#### SaaS Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  nrr: {
    value: number;
    benchmark: number;
    assessment: string;
  }
  magicNumber: {
    value: number;
    calculation: string;
    benchmark: number;
  }
  cacPayback: {
    months: number;
    benchmark: number;
    assessment: string;
  }
  burnMultiple: {
    value: number;
    benchmark: number;
    assessment: string;
  }
  ruleOf40: {
    value: number;
    calculation: string;
    assessment: string;
  }
}
```

#### Fintech Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  takeRate: { value: number; benchmark: number };
  tpv: { value: number; growth: number };
  regulatoryStatus: { licenses: string[]; pending: string[]; risks: string[] };
  fraudRate: { value: number; benchmark: number; trend: string };
};
```

#### Marketplace Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  gmv: {
    value: number;
    growth: number;
  }
  takeRate: {
    value: number;
    benchmark: number;
  }
  liquidityScore: {
    supply: number;
    demand: number;
    balance: string;
  }
  cohortRetention: {
    m1: number;
    m6: number;
    m12: number;
  }
}
```

#### Healthtech Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  regulatoryPath: { type: string; timeline: string; cost: string; risk: string };
  clinicalValidation: { status: string; studies: number; results: string };
  reimbursement: { strategy: string; codes: string[]; likelihood: string };
};
```

#### Deeptech Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  technologyReadiness: { trl: number; milestones: string[] };
  ipStrength: { patents: number; citations: number; defensibility: string };
  timeToMarket: { estimate: string; risks: string[]; capitalNeeded: number };
};
```

#### AI Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  // Infrastructure & Costs
  infraCosts: {
    gpuProvider: string; // AWS, GCP, Azure, Lambda Labs, etc.
    monthlyComputeCost: number;
    costPerInference: number;
    scalingModel: "linear" | "sublinear" | "superlinear";
    projectedCostAtScale: number;
  };
  // Model Architecture & Approach
  modelApproach: {
    type: "fine_tuned" | "rag" | "from_scratch" | "api_wrapper" | "hybrid";
    baseModel?: string; // GPT-4, Claude, Llama, custom, etc.
    proprietaryComponents: string[];
    moatLevel: "none" | "weak" | "moderate" | "strong";
  };
  // Technical Depth Assessment
  technicalDepth: {
    teamMLExperience: number; // years cumulative
    hasMLPhD: boolean;
    papersPublished: number;
    openSourceContributions: string[];
    previousAICompanies: string[];
  };
  // AI-Specific Metrics
  aiMetrics: {
    modelLatency: { p50: number; p99: number }; // ms
    accuracy: { metric: string; value: number; benchmark: number };
    datasetSize: number;
    datasetQuality: "proprietary" | "licensed" | "public" | "synthetic";
    evaluationMethodology: "rigorous" | "basic" | "unclear" | "none";
  };
  // Moat & Defensibility
  aiMoat: {
    dataFlywheel: boolean;
    networkEffects: boolean;
    switchingCosts: "high" | "medium" | "low";
    apiDependency: "none" | "partial" | "full"; // dependency on OpenAI/Anthropic/etc.
    reproducibility: "easy" | "medium" | "hard"; // how easy to replicate
  };
  // Red Flags Specific to AI
  aiRedFlags: {
    noMLTeam: boolean;
    justAPIWrapper: boolean;
    noProprietaryData: boolean;
    unrealisticAccuracyClaims: boolean;
    noEvaluation: boolean;
    highAPIDependency: boolean;
  };
};
```

#### Climate Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  carbonImpact: { reduction: number; methodology: string; verified: boolean };
  subsidies: { available: string[]; secured: string[]; value: number };
  regulatoryTailwinds: { policies: string[]; impact: string };
};
```

#### Consumer Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  cac: {
    value: number;
    byChannel: {
      channel: string;
      cac: number;
    }
    [];
  }
  virality: {
    kFactor: number;
    organicShare: number;
  }
  brandStrength: {
    awareness: number;
    sentiment: string;
    nps: number;
  }
}
```

#### Hardware Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  grossMargin: {
    value: number;
    target: number;
    atScale: number;
  }
  manufacturingPartner: {
    name: string;
    capacity: number;
    risk: string;
  }
  inventoryTurns: {
    value: number;
    benchmark: number;
  }
  warrantyRate: {
    value: number;
    cost: number;
  }
}
```

#### Gaming Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  cpi: {
    value: number;
    byPlatform: {
      platform: string;
      cpi: number;
    }
    [];
  }
  d1d7d30: {
    d1: number;
    d7: number;
    d30: number;
    benchmark: string;
  }
  arpdau: {
    value: number;
    benchmark: number;
  }
  whaleConcentration: {
    top1Percent: number;
    risk: string;
  }
}
```

#### Blockchain Expert (metriques additionnelles)

```typescript
sectorMetrics: {
  // Tokenomics (CRITICAL)
  tokenomics: {
    hasToken: boolean;
    tokenType: "utility" | "governance" | "security" | "hybrid" | "none";
    insiderAllocation: number; // % team + investors
    vestingSchedule: string;
    inflationRate: number;
    howeyTestRisk: "low" | "medium" | "high" | "critical";
  };
  // Protocol Economics
  protocolRevenue: {
    annualized: number;
    emissionRatio: number; // emissions / revenue
    realYield: number; // (revenue - emissions) / TVL
  };
  // Security
  smartContractSecurity: {
    auditStatus: "multiple_audits" | "single_audit" | "not_audited";
    auditors: string[];
    bugBountyActive: boolean;
    incidentHistory: { date: string; loss: number }[];
  };
  // Decentralization
  decentralization: {
    level: "fully_decentralized" | "progressive" | "centralized";
    governanceType: string;
    keyManRisk: boolean;
    top10HolderConcentration: number; // %
  };
  // Market Cyclicality
  cyclicality: {
    currentPhase: "bull" | "accumulation" | "bear" | "recovery";
    bearMarketResilience: "high" | "medium" | "low";
  };
};
```

---

### 5.4 Structures TIER 3 - Agents de Synthese

#### Contradiction Detector

```typescript
findings: {
  contradictions: {
    id: string;
    type: "INTERNAL" | "DECK_VS_DB" | "CLAIM_VS_DATA";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    statement1: {
      text: string;
      location: string;
      source: string;
    }
    statement2: {
      text: string;
      location: string;
      source: string;
    }
    analysis: string;
    implication: string;
    question: string;
  }
  [];
  consistencyScore: number;
  aggregatedDbComparison: {
    totalClaimsChecked: number;
    verified: number;
    contradicted: number;
    unverifiable: number;
  }
}
```

#### Synthesis Deal Scorer

```typescript
findings: {
  finalScore: {
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    confidence: number;
  };
  dimensionScores: {
    dimension: string;
    weight: number;
    score: number;
    keyFactors: string[];
  }[];
  marketPosition: {
    percentileVsComparables: number;
    valuationAssessment: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE";
  };
  investmentThesis: {
    bull: string[];
    bear: string[];
    keyAssumptions: string[];
  };
  recommendation: "STRONG_PASS" | "PASS" | "CONSIDER" | "INVEST" | "STRONG_INVEST";
};
```

#### Devils Advocate

```typescript
findings: {
  counterArguments: {
    thesis: string;
    counterArgument: string;
    evidence: string;
    comparableFailure: { company: string; similarity: string; outcome: string };
    probability: "HIGH" | "MEDIUM" | "LOW";
    mitigationPossible: boolean;
  }[];
  worstCaseScenario: {
    description: string;
    triggers: string[];
    probability: number;
    lossAmount: string;
  };
  killReasons: {
    reason: string;
    evidence: string;
    dealBreakerLevel: "ABSOLUTE" | "CONDITIONAL" | "CONCERN";
  }[];
};
```

#### Scenario Modeler

```typescript
findings: {
  scenarios: {
    name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC";
    probability: number;
    assumptions: string[];
    metrics: {
      year: number;
      revenue: number;
      valuation: number;
      employeeCount: number;
    }[];
    exitOutcome: { type: string; multiple: number; irr: number };
  }[];
  sensitivityAnalysis: {
    variable: string;
    baseCase: number;
    impactOnValuation: { change: number; newValuation: number }[];
  }[];
  basedOnComparables: {
    company: string;
    trajectory: string;
    relevance: string;
  }[];
};
```

#### Memo Generator

```typescript
findings: {
  executiveSummary: {
    oneLiner: string;
    recommendation: string;
    keyStrengths: string[];
    keyRisks: string[];
    verdict: string;
  };
  investmentHighlights: {
    highlight: string;
    evidence: string;
    dbComparable: string;
  }[];
  keyRisks: {
    risk: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    mitigation: string;
    residualRisk: string;
  }[];
  termsAnalysis: {
    metric: string;
    proposed: string;
    marketStandard: string;
    negotiationRoom: string;
  }[];
  nextSteps: {
    action: string;
    priority: "IMMEDIATE" | "BEFORE_TERM_SHEET" | "DURING_DD";
    owner: "INVESTOR" | "FOUNDER";
  }[];
};
```

---

## 6. REGLES ABSOLUES

### 6.1 Interdictions Formelles

```
██████████████████████████████████████████████████████████████████████████████
█                                                                            █
█   INTERDIT - VIOLATION = AGENT A REFAIRE                                  █
█                                                                            █
█   1. INVENTER des donnees ("environ 500K€", "probablement", "on estime")  █
█                                                                            █
█   2. AFFIRMER sans source ("Le marche est en croissance")                 █
█      → Toujours: "Le marche croit de X% (Source: Y)"                      █
█                                                                            █
█   3. UTILISER des termes vagues ("quelques", "plusieurs", "certains")     █
█      → Toujours quantifier: "3 red flags", "47% d'ecart"                  █
█                                                                            █
█   4. IGNORER le Context Engine quand il a des donnees                     █
█      → Toujours cross-referencer                                          █
█                                                                            █
█   5. PRODUIRE un red flag sans: severite + preuve + impact + question     █
█                                                                            █
█   6. DONNER un score sans justification decomposee                        █
█                                                                            █
█   7. OMETTRE les limitations de l'analyse                                 █
█                                                                            █
██████████████████████████████████████████████████████████████████████████████
```

### 6.2 Obligations Formelles

```
✓ OBLIGATOIRE - A VERIFIER POUR CHAQUE OUTPUT

□ Chaque chiffre cite a une source entre parentheses
□ Chaque claim du deck est marque verified/unverified/contradicted
□ Le Context Engine est utilise quand disponible pour chaque demi-sujet. C'est la reference a laquelle il faut toujours aller.
□ Les calculs sont montres, pas juste les resultats
□ Chaque red flag a les 5 composants requis
□ Le score est decompose par critere avec justification
□ Le BA peut agir immediatement (pas de "a investiguer plus tard") que ce soit un Go/No-go ou avoir les questions cles a poser au(x) fondateurs(s).
□ Le resume narratif tient en 1 paragraphe
□ Les questions pour le fondateur sont formulees de maniere non-confrontationnelle
□ Les limitations de l'analyse sont explicites
```

---

## 7. GESTION DES DONNEES MANQUANTES

### 7.1 Hierarchie de Compensation

Quand une donnee est absente du deck:

```
1. CHERCHER dans le Context Engine
   → Si trouve: utiliser avec mention "Source: Context Engine [composant]"

2. INFERER si possible (avec calcul explicite)
   → Si inferable: montrer le calcul + "Infere, a confirmer"
   → Exemple: "ARR non fourni. MRR deck = 50K€ → ARR infere = 600K€"

3. SIGNALER comme manquant
   → "Non disponible dans les documents fournis"
   → Ajouter dans limitations
   → Si critique: generer un red flag "missing_data"
```

### 7.2 Impact sur le Scoring

```
Data Completeness    Impact sur le Score
━━━━━━━━━━━━━━━━    ━━━━━━━━━━━━━━━━━━━
COMPLETE            Score normal (0-100)
PARTIAL             Score max = 70 + warning
MINIMAL             Score max = 50 + red flag "insufficient_data"
```

### 7.3 Formulation

```
❌ INTERDIT: "Les donnees ne sont pas disponibles donc je ne peux pas analyser"

✅ CORRECT:  "METRIQUES REVENUE - DATA PARTIELLE

Donnees disponibles:
├─ MRR: 52K€ (Slide 8)
├─ Croissance: Non fournie
├─ Churn: Non fourni

Donnees Context Engine: AUCUNE (startup trop early)

Donnees inferees:
├─ ARR = MRR x 12 = 624K€ (a confirmer)
├─ Croissance: Impossible a calculer sans historique

IMPACT SUR L'ANALYSE:
- Score plafonne a 60/100 (donnees insuffisantes)
- Impossible d'evaluer la trajectoire
- Question critique a poser: 'Quel etait votre MRR il y a 6 mois et 12 mois?'

RED FLAG GENERE: 'Transparence financiere insuffisante'
Severite: MEDIUM (normal pour pre-seed, problematique pour seed)"
```

---

## 8. EXPLOITATION DE LA FUNDING DATABASE

> **Reference complete**: Voir `DB-EXPLOITATION-SPEC.md` pour les details techniques.

### 8.1 Principe Fondamental

La Funding Database n'est pas qu'une liste de deals. C'est une **intelligence competitive** qui permet de:

1. **Valider les claims du deck** - Cross-reference obligatoire
2. **Detecter les concurrents** - Avant que le fondateur ne les mentionne
3. **Comparer concurrents deck vs DB** - Le fondateur est-il honnete?
4. **Benchmarker la valorisation** - Savoir si on paie trop cher
5. **Evaluer le market timing** - Le secteur est-il chaud ou froid?

### 8.2 Comparaison Concurrents Deck vs DB (CRITIQUE)

Cette analyse est **CRITIQUE** car elle revele l'honnetete et la connaissance marche du fondateur.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    MATRICE CONCURRENTS DECK vs DB                          │
├────────────────────┬───────────────────────────────────────────────────────┤
│                    │              DANS LA DB                               │
│                    │     OUI                    │     NON                  │
├────────────────────┼────────────────────────────┼──────────────────────────┤
│ DANS     │  OUI    │ ✅ COHERENT               │ 🔍 RECHERCHER EN LIGNE   │
│ LE DECK  │         │ Le fondateur connait      │ DB limitee, pas un       │
│          │         │ ses concurrents           │ red flag, chercher web   │
│          ├─────────┼────────────────────────────┼──────────────────────────┤
│          │  NON    │ 🚨 RED FLAG CRITIQUE      │ N/A                      │
│          │         │ Concurrent CACHE ou       │                          │
│          │         │ ignore par le fondateur   │                          │
└──────────┴─────────┴────────────────────────────┴──────────────────────────┘

IMPORTANT: DB limitee (~1,500 deals) - seuls les concurrents DB non mentionnes sont des red flags.
```

**Output obligatoire** (pour deck-forensics, competitive-intel, contradiction-detector):

```json
{
  "competitorComparison": {
    "fromDeck": {
      "mentioned": ["Liste des concurrents cites"],
      "claimedPositioning": "Ce que le deck pretend",
      "location": "Slide X"
    },
    "fromDb": {
      "detected": [{ "name": "...", "funding": "...", "overlap": "direct|partial|adjacent" }],
      "totalDetected": 0,
      "directCompetitors": 0
    },
    "analysis": {
      "deckAccuracy": "ACCURATE" | "INCOMPLETE" | "MISLEADING",
      "hiddenCompetitors": ["Concurrents dans DB mais PAS dans deck - RED FLAG"],
      "deckCompetitorsNotInDb": ["Concurrents du deck pas dans DB - A RECHERCHER EN LIGNE"],
      "claimsContradicted": [{ "claim": "...", "reality": "..." }]
    },
    "impactOnAnalysis": {
      "credibilityScore": -30,
      "negotiationLeverage": "Description"
    }
  }
}
```

### 8.3 Tous les Agents (39 au total)

La DB doit etre exploitee par **39 agents** repartis en 3 tiers:

#### TIER 1 - Agents d'analyse (13)

| Agent                 | Usage DB                                 | Priorite     |
| --------------------- | ---------------------------------------- | ------------ |
| `financial-auditor`   | Benchmark valo, multiples, comparables   | **CRITIQUE** |
| `deck-forensics`      | Cross-ref claims, concurrents caches     | **CRITIQUE** |
| `competitive-intel`   | Detection concurrents, mapping           | **CRITIQUE** |
| `market-intelligence` | Tendances funding, timing                | **CRITIQUE** |
| `question-master`     | Questions basees sur ecarts deck/DB      | **CRITIQUE** |
| `cap-table-auditor`   | Comparaison dilution vs deals similaires | HIGH         |
| `exit-strategist`     | Exits du secteur, multiples de sortie    | HIGH         |
| `gtm-analyst`         | Canaux d'acquisition des comparables     | MEDIUM       |
| `customer-intel`      | Taille clients, segments comparables     | MEDIUM       |
| `tech-stack-dd`       | Stacks techniques comparables            | MEDIUM       |
| `tech-ops-dd`         | Tailles equipes, maturite produit        | MEDIUM       |
| `legal-regulatory`    | Precedents legaux secteur                | LOW          |

#### TIER 2 - Experts sectoriels (21 agents: 20 secteurs + 1 general)

**Implementes (10 secteurs):**
| Agent | Usage DB | Status |
| -------------------- | ----------------------------------------- | ------------ |
| `saas-expert` | Benchmarks NRR, CAC payback, magic number | IMPL |
| `fintech-expert` | Multiples fintech, regulations | IMPL |
| `marketplace-expert` | Take rates, GMV multiples | IMPL |
| `ai-expert` | Infra costs, model approach, ML team depth| IMPL |
| `healthtech-expert` | Timelines FDA/CE, cycles | IMPL |
| `deeptech-expert` | Time to market, burn rates | IMPL |
| `climate-expert` | Subventions, deals cleantech | IMPL |
| `consumer-expert` | CAC consumer, virality | IMPL |
| `hardware-expert` | Marges, cycles production | IMPL |
| `gaming-expert` | CPI, LTV gaming | IMPL |
| `biotech-expert` | Timelines FDA, clinical trials, IP pharma | TODO |
| `edtech-expert` | CAC schools vs B2C, LTV learners | TODO |
| `proptech-expert` | Cycles immo, CapEx, regulations | TODO |
| `mobility-expert` | Unit economics fleet, regulations | TODO |
| `foodtech-expert` | Marges F&B, certifications, supply chain | TODO |
| `hrtech-expert` | CAC enterprise, payroll regulations | TODO |
| `legaltech-expert` | Compliance costs, bar regulations | TODO |
| `cybersecurity-expert` | ARR security, SOC2/ISO, threat landscape | TODO |
| `spacetech-expert` | CapEx spatial, cycles longs, regulations | TODO |
| `creator-expert` | CPM, creator LTV, platform dependency | TODO |
| `blockchain-expert` | TVL, tokenomics, smart contract security | IMPL |

**Fallback (1 agent):**
| Agent | Usage DB | Status |
| -------------------- | ----------------------------------------- | ------------ |
| `general-expert` | 100% recherche web, pas de standards | TODO |

#### TIER 3 - Agents de synthese (5)

| Agent                    | Usage DB                                   | Priorite     |
| ------------------------ | ------------------------------------------ | ------------ |
| `contradiction-detector` | Agreger TOUTES les comparaisons deck vs DB | **CRITIQUE** |
| `synthesis-deal-scorer`  | Score final avec position vs marche        | **CRITIQUE** |
| `devils-advocate`        | Comparables echecs, contre-arguments       | HIGH         |
| `scenario-modeler`       | Scenarios bases sur trajectoires reelles   | HIGH         |
| `memo-generator`         | Synthese avec contexte marche              | HIGH         |

### 8.4 Cross-Reference Obligatoire

**REGLE ABSOLUE**: Chaque claim du deck concernant le marche ou la concurrence DOIT etre confronte a la DB.

```
CLAIM DECK                              VS      DONNEES DB
─────────────────────────────────────────────────────────────────
"Pas de concurrent direct"              →       X concurrents detectes
"Marche en forte croissance"            →       Tendance reelle YoY
"Valorisation en ligne avec le marche"  →       Percentile exact (P25/50/75)
"Leader du marche"                      →       Funding comparatif
"Equipe experimentee"                   →       Track record verifiable
```

**Format dbCrossReference obligatoire**:

```json
{
  "dbCrossReference": {
    "claims": [
      {
        "claim": "Texte exact du deck",
        "location": "Slide X",
        "dbVerdict": "VERIFIED" | "CONTREDIT" | "PARTIEL" | "NON_VERIFIABLE",
        "evidence": "Donnee DB qui confirme/infirme",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM"
      }
    ],
    "uncheckedClaims": ["Claims non verifiables avec la DB"]
  }
}
```

### 8.5 Red Flags Automatiques

Generer un red flag si:

| Situation                                                 | Severite     | Red Flag                  |
| --------------------------------------------------------- | ------------ | ------------------------- |
| Claim "pas de concurrent" + DB trouve concurrents directs | **CRITICAL** | "Concurrents caches"      |
| Concurrent DIRECT dans DB mais absent du deck             | **CRITICAL** | "Omission volontaire"     |
| Claim "valorisation fair" + DB montre percentile > P80    | HIGH         | "Valorisation agressive"  |
| Claim "marche en croissance" + DB montre < -20% YoY       | HIGH         | "Timing defavorable"      |
| Claim "leader du marche" + concurrent DB avec 3x+ funding | HIGH         | "Position exageree"       |
| Track record fondateur non verifiable dans DB             | MEDIUM       | "Experience non verifiee" |

**NE PAS generer de red flag si**:

- Concurrent mentionne dans le deck n'est pas dans la DB (DB limitee → rechercher en ligne)

### 8.6 Format d'Injection dans les Prompts

Le `formatContextEngineData()` doit injecter les donnees DB ainsi:

```
## Donnees Funding Database

### Concurrents detectes
X entreprises similaires identifiees:

**[Nom]** ([match_level])
├─ Description: [...]
├─ Funding total: [...]
├─ Overlap: [direct|partial|adjacent] | Menace: [HIGH|MEDIUM|LOW]
└─ Status: [active|shutdown|acquired]

### Concurrents du deck vs DB
| Concurrent deck | Dans DB? | Analyse |
|-----------------|----------|---------|
| [Nom]           | OUI/NON  | [...]   |

Concurrents DB NON mentionnes dans le deck: [liste] → 🚨 A QUESTIONNER

### Benchmark valorisation
| Metrique | P25 | Median | P75 | CE DEAL | Percentile |
|----------|-----|--------|-----|---------|------------|
| [...]    | ... | ...    | ... | ...     | P[X]       |

Verdict: **[UNDERVALUED|FAIR|AGGRESSIVE|VERY_AGGRESSIVE]**

### Tendance marche
Tendance: **[HEATING|STABLE|COOLING]** ([X]% YoY)
```

### 8.7 Checklist DB par Agent

Avant de valider un agent refait:

```
□ L'agent utilise les donnees DB quand disponibles
□ Les claims du deck sont cross-references vs DB
□ Un dbCrossReference est produit avec verdicts
□ Un competitorComparison est produit (si applicable)
□ Les concurrents caches sont identifies (deck vs DB)
□ Les red flags DB sont generes si conditions remplies
□ Les comparables sont listes avec sources
□ Le benchmark valo inclut percentile exact
□ L'absence de donnees DB est signalee (pas ignoree)
□ Les benchmarks sectoriels specifiques sont utilises (Tier 2)
```

---

## 9. TEMPLATE DE REFONTE

### 9.1 Checklist Pre-Refonte

Avant de refaire un agent, verifier:

```
□ J'ai lu AGENT-REFONTE-PROMPT.md en entier
□ J'ai lu investor.md sections pertinentes
□ J'ai identifie les anti-patterns dans l'agent actuel
□ J'ai liste les outputs actuels qui posent probleme
□ J'ai defini les criteres de succes specifiques
```

### 9.2 Structure de l'Agent Refait

```typescript
/**
 * [NOM AGENT] - REFONTE v2.0
 *
 * Mission: [1 phrase]
 * Persona: [Expertise specifique]
 * Standard: Big4 + Partner VC
 *
 * Inputs:
 * - Documents: [types]
 * - Context Engine: [composants utilises]
 * - Dependencies: [autres agents]
 *
 * Outputs:
 * - Score: [description]
 * - Findings: [categories]
 * - Red Flags: [types detectes]
 * - Questions: [pour fondateur]
 */

export class [NomAgent]Agent extends BaseAgent<[Data], [Result]> {

  constructor() {
    super({
      name: "[nom-agent]",
      description: "[description complete]",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: [...],
    });
  }

  protected buildSystemPrompt(): string {
    // SUIVRE LA STRUCTURE SECTION 4.1
    return `...`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<[Data]> {
    // 1. Extraire et formater le contexte
    // 2. Construire le prompt utilisateur (SECTION 4.2)
    // 3. Appeler le LLM
    // 4. Valider et normaliser la reponse
    // 5. Retourner le resultat structure (SECTION 5)
  }
}
```

### 9.3 Process de Refonte

Pour chaque agent:

```
ETAPE 1: DIAGNOSTIC (5 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Lire l'agent actuel
- Identifier les anti-patterns (Section 2)
- Noter les manques vs standards (Section 3)

ETAPE 2: REDESIGN SYSTEM PROMPT (15 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Definir la persona specifique
- Ecrire la methodologie step-by-step
- Creer le framework d'evaluation
- Lister les red flags specifiques
- Ajouter exemples bon/mauvais

ETAPE 3: REDESIGN USER PROMPT (10 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Structurer l'injection de contexte
- Definir le format de sortie exact
- Ajouter instructions specifiques

ETAPE 4: IMPLEMENTATION (20 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Modifier la classe
- Adapter les types si necessaire
- Ajouter validation de sortie

ETAPE 5: VALIDATION (10 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Checklist Section 10
- Test sur deal reel si possible
```

---

## 10. CHECKLIST DE VALIDATION

### 10.1 Checklist par Agent

Avant de considerer un agent comme "refait", verifier:

```
SYSTEM PROMPT
□ Persona clairement definie (expert + experience)
□ Mission en 1-2 phrases max
□ Methodologie en etapes numerotees
□ Framework d'evaluation avec criteres et poids
□ Liste de red flags specifiques au domaine
□ Format de sortie detaille
□ Regles absolues incluses
□ Exemple de bon output
□ Exemple de mauvais output (anti-pattern)

USER PROMPT
□ Contexte deal bien formate
□ Documents injectes proprement
□ Context Engine utilise
□ Instructions specifiques claires
□ Format JSON attendu explicite

OUTPUT
□ Structure conforme a Section 5.1
□ Findings specifiques a l'agent (Section 5.2)
□ Red flags avec 5 composants
□ Questions avec contexte
□ Score decompose
□ Narratif actionnable
□ Signal d'alerte si necessaire

QUALITE
□ Aucun anti-pattern de Section 2
□ Standards Section 3 respectes
□ Regles Section 6 appliquees
□ Gestion donnees manquantes Section 7
□ Exploitation DB Section 8 (cross-reference obligatoire)
```

### 10.2 Test de Qualite

Poser ces questions sur l'output:

```
1. "Est-ce qu'un BA peut prendre une decision avec ca?"
   → Si non: output insuffisant

2. "Est-ce que chaque affirmation a une source?"
   → Si non: revoir les prompts

3. "Est-ce que les red flags sont actionnables?"
   → Si non: ajouter impact + question

4. "Est-ce qu'on pourrait montrer ca a un fondateur?"
   → Si non: revoir le ton

5. "Est-ce qu'un cabinet facturerait 5000€ pour ca?"
   → Si non: approfondir l'analyse
```

---

## 11. LISTE DES AGENTS A REFONDRE (39 AGENTS)

### 11.1 TIER 1 - Agents d'Analyse (13)

```
PRIORITE 1 - Core (critiques pour la valeur)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. financial-auditor     - Audit financier, benchmark valo
2. deck-forensics        - Verification des claims, concurrents caches
3. team-investigator     - Background equipe

PRIORITE 2 - Context (dependent du Context Engine)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. market-intelligence   - Tendances funding, timing
5. competitive-intel     - Detection concurrents, mapping
6. exit-strategist       - Exits du secteur, multiples de sortie

PRIORITE 3 - Specialized
━━━━━━━━━━━━━━━━━━━━━━━━
7. tech-stack-dd         - Stack + Scalabilite + Dette (split de technical-dd)
8. tech-ops-dd           - Maturite + Equipe + Secu + IP (split de technical-dd)
9. legal-regulatory      - Risques legaux
10. gtm-analyst          - Go-to-market, canaux acquisition
11. customer-intel       - Intelligence client, segments
12. cap-table-auditor    - Audit cap table, dilution
13. question-master      - Questions strategiques basees sur ecarts deck/DB
```

> **Note**: technical-dd a ete split en 2 agents (tech-stack-dd + tech-ops-dd) pour optimiser les couts
> et eviter les timeouts sur Haiku (limite 4096 tokens output).

### 11.2 TIER 2 - Experts Sectoriels (22 agents: 21 secteurs + 1 general)

```
IMPLEMENTES (10 secteurs)
━━━━━━━━━━━━━━━━━━━━━━━━━
13. saas-expert          - NRR, CAC payback, magic number           [IMPL]
14. fintech-expert       - Multiples fintech, regulations           [IMPL]
15. marketplace-expert   - Take rates, GMV multiples                [IMPL]
16. ai-expert            - Infra costs, model approach, ML team     [IMPL]
17. healthtech-expert    - Timelines FDA/CE, cycles                 [IMPL]
18. deeptech-expert      - Time to market, burn rates               [IMPL]
19. climate-expert       - Subventions, deals cleantech             [IMPL]
20. consumer-expert      - CAC consumer, virality                   [IMPL]
21. hardware-expert      - Marges, cycles production                [IMPL]
22. gaming-expert        - CPI, LTV gaming                          [IMPL]
23. biotech-expert       - Timelines FDA, clinical trials, IP       [IMPL]
24. edtech-expert        - CAC schools vs B2C, LTV learners         [IMPL]
25. proptech-expert      - Cycles immo, CapEx, regulations          [IMPL]
26. mobility-expert      - Unit economics fleet, regulations        [IMPL]
27. foodtech-expert      - Marges F&B, certifications               [IMPL]
28. hrtech-expert        - CAC enterprise, payroll regulations      [IMPL]
29. legaltech-expert     - Compliance costs, bar regulations        [IMPL]
30. cybersecurity-expert - ARR security, SOC2/ISO                   [IMPL]
31. spacetech-expert     - CapEx spatial, cycles longs              [IMPL]
32. creator-expert       - CPM, creator LTV, platform dependency    [IMPL]
33. blockchain-expert    - TVL, tokenomics, smart contract security [IMPL]

FALLBACK (1 agent)
━━━━━━━━━━━━━━━━━━
34. general-expert       - 100% recherche web, pas de standards     [IMPL]
```

**Note**: Pour chaque nouveau secteur, creer aussi les standards dans `sector-standards.ts`.

### 11.3 TIER 3 - Agents de Synthese (5)

```
PRIORITE CRITIQUE (synthese finale)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
35. contradiction-detector  - Agreger TOUTES les comparaisons deck vs DB
36. synthesis-deal-scorer   - Score final avec position vs marche

PRIORITE HIGH (insights avances)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
37. devils-advocate         - Comparables echecs, contre-arguments
38. scenario-modeler        - Scenarios bases sur trajectoires reelles
39. memo-generator          - Synthese avec contexte marche
```

### 11.4 Fichiers a Modifier

```
src/agents/tier1/                     TIER 1 - ANALYSE (13 agents)
├── financial-auditor.ts              [PRIORITE 1]
├── deck-forensics.ts                 [PRIORITE 1]
├── team-investigator.ts              [PRIORITE 1]
├── market-intelligence.ts            [PRIORITE 2]
├── competitive-intel.ts              [PRIORITE 2]
├── exit-strategist.ts                [PRIORITE 2]
├── tech-stack-dd.ts                  [PRIORITE 3] Stack + Scalabilite + Dette
├── tech-ops-dd.ts                    [PRIORITE 3] Maturite + Equipe + Secu + IP
├── legal-regulatory.ts               [PRIORITE 3]
├── gtm-analyst.ts                    [PRIORITE 3]
├── customer-intel.ts                 [PRIORITE 3]
├── cap-table-auditor.ts              [PRIORITE 3]
└── question-master.ts                [PRIORITE 3]

src/agents/tier2/                     TIER 2 - EXPERTS SECTORIELS (21)

Implementes (10 secteurs):
├── saas-expert.ts                    [IMPL]
├── fintech-expert.ts                 [IMPL]
├── marketplace-expert.ts             [IMPL]
├── ai-expert.ts                      [IMPL]
├── healthtech-expert.ts              [IMPL]
├── deeptech-expert.ts                [IMPL]
├── climate-expert.ts                 [IMPL]
├── consumer-expert.ts                [IMPL]
├── hardware-expert.ts                [IMPL]
└── gaming-expert.ts                  [IMPL]

A creer (10 secteurs):
├── biotech-expert.ts                 [TODO]
├── edtech-expert.ts                  [TODO]
├── proptech-expert.ts                [TODO]
├── mobility-expert.ts                [TODO]
├── foodtech-expert.ts                [TODO]
├── hrtech-expert.ts                  [TODO]
├── legaltech-expert.ts               [TODO]
├── cybersecurity-expert.ts           [TODO]
├── spacetech-expert.ts               [TODO]
├── creator-expert.ts                 [TODO]
└── blockchain-expert.ts              [IMPL] TVL, tokenomics, smart contract security

Fallback:
└── general-expert.ts                 [TODO] 100% web search

Support:
├── base-sector-expert.ts             [IMPL]
├── sector-standards.ts               [IMPL]
└── benchmark-injector.ts             [IMPL]

src/agents/tier3/                     TIER 3 - SYNTHESE
├── contradiction-detector.ts         [CRITIQUE]
├── synthesis-deal-scorer.ts          [CRITIQUE]
├── devils-advocate.ts                [HIGH]
├── scenario-modeler.ts               [HIGH]
└── memo-generator.ts                 [HIGH]
```

---

## ANNEXE: RESSOURCES

### Fichiers a Consulter

- `investor.md` - Vision produit complete
- `DB-EXPLOITATION-SPEC.md` - Specification exploitation de la Funding DB
- `dbagents.md` - Maintenance et enrichissement de la DB
- `src/agents/types.ts` - Types des agents
- `src/agents/base-agent.ts` - Classe de base
- `src/services/context-engine/types.ts` - Types Context Engine
- `src/services/context-engine/connectors/funding-db.ts` - Connecteur Funding DB

### Benchmarks de Reference

- OpenView SaaS Benchmarks 2024
- Bessemer Cloud Index
- First Round State of Startups
- Dealroom European VC Report

---

**FIN DU DOCUMENT**

_Derniere mise a jour: 2026-01-29_
_Version: 2.2 - Document complet pour les 40 agents (3 Tiers)_
_- Section 5: Structures de sortie pour les 40 agents (Tier 1 + Tier 2 + Tier 3)_
_- Section 8: Exploitation DB pour les 40 agents_
_- Section 11: Liste complete des 40 agents a refondre_
_- Ajout: blockchain-expert (Tier 2) - Expert Blockchain/Web3 pour evaluer les startups crypto/DeFi/NFT_
_- Ajout precedent: ai-expert (Tier 2) - Expert IA pour evaluer les startups AI/ML_
