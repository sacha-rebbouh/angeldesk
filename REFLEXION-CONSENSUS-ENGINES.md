# PROMPT ULTIME - Refonte Consensus Engine & Reflexion Engine

> **Document de reference COMPLET pour implementer les deux moteurs de qualite d'Angel Desk.**
> Ce fichier contient TOUT le code necessaire. Un agent peut l'utiliser directement pour implementer.
> Version: 2.0 - Document actionnable avec code complet, schemas Zod, et fallbacks.

---

## TABLE DES MATIERES

1. [Vision & Philosophie](#1-vision--philosophie)
2. [Diagnostic des Engines Actuels](#2-diagnostic-des-engines-actuels)
3. [Standards de Qualite](#3-standards-de-qualite)
4. [Refonte Consensus Engine](#4-refonte-consensus-engine)
5. [Refonte Reflexion Engine](#5-refonte-reflexion-engine)
6. [Gestion des Couts et Optimisations](#6-gestion-des-couts-et-optimisations)
7. [Integration avec l'Orchestrateur](#7-integration-avec-lorchestrateurr)
8. [Schemas Zod et Validation](#8-schemas-zod-et-validation)
9. [Tests et Checklist de Validation](#9-tests-et-checklist-de-validation)
10. [Fichiers a Creer/Modifier](#10-fichiers-a-creermodifier)

---

## 1. VISION & PHILOSOPHIE

### 1.1 Ce que ces Engines doivent etre

Ces engines incarnent le **controle qualite d'un cabinet d'audit Big4** combine avec le **jugement d'un Investment Committee**.

```
CONSENSUS ENGINE                      REFLEXION ENGINE
━━━━━━━━━━━━━━━━━━━                   ━━━━━━━━━━━━━━━━━━━
= Tribunal d'arbitrage               = Reviewer senior
= Juge impartial avec preuves        = Qui relit avant envoi client
= Resout par les FAITS               = Detecte les faiblesses
= Ne laisse pas de zone grise        = Force a approfondir
```

### 1.2 Pourquoi c'est CRITIQUE

```
┌─────────────────────────────────────────────────────────────────────┐
│  SANS ENGINES DE QUALITE                                            │
│  ─────────────────────────                                          │
│  Agent A dit: "ARR = 500K€"                                         │
│  Agent B dit: "ARR = 800K€"                                         │
│  → Le BA recoit les deux sans savoir lequel croire                  │
│  → Decision d'investissement basee sur des donnees contradictoires  │
│  → Potentielle perte de 50-200K€                                    │
│                                                                     │
│  AVEC ENGINES DE QUALITE                                            │
│  ─────────────────────────                                          │
│  Consensus Engine detecte la contradiction                          │
│  → Cross-reference avec le deck (Slide 8: MRR 42K€ → ARR = 504K€)  │
│  → Cross-reference avec le financial model (ligne 12: 507K€)        │
│  → Verdict: ARR = ~505K€, Agent B surestimait de 58%                │
│  → Red flag: "Agent B a invente ou mal calcule"                     │
│  → Le BA a une seule verite, sourcee                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 La Persona des Engines

**Consensus Engine** = Investment Committee Partner

```
- 25+ ans d'experience en IC de fonds VC
- A vu 100+ debates internes sur des deals
- Sait que les "opinions" ne valent rien sans preuves
- Tranche vite mais toujours sur des faits
- Ne laisse JAMAIS une contradiction non resolue
- Documente chaque decision pour les LPs
```

**Reflexion Engine** = Senior Quality Reviewer (Big4)

```
- 15+ ans de revue de rapports de due diligence
- Detecte les faiblesses d'argumentation en 30 secondes
- Sait ce qui passerait devant un tribunal vs ce qui est du bluff
- Force les analystes a sourcer chaque affirmation
- Ne laisse JAMAIS passer une analyse "moyennement confiante"
- Standard: "Est-ce qu'on facturerait 50K€ pour ca?"
```

---

## 2. DIAGNOSTIC DES ENGINES ACTUELS

### 2.1 Consensus Engine - Problemes identifies

| Probleme | Code actuel | Impact |
|----------|-------------|--------|
| Debat rhetorique | `You are representing the position...` | Agents "defendent" au lieu de prouver |
| Resolution par concession | `p.finalPosition === true` | Le plus eloquent gagne, pas le plus precis |
| Pas de cross-reference | Debat "dans le vide" | Aucune verification des sources |
| Arbitrage faible | `As a neutral arbitrator...` | Pas de methodologie, pas de criteres |

**Output actuel typique (MAUVAIS):**
```json
{
  "contradictionId": "abc123",
  "resolvedBy": "consensus",
  "winner": "financial-auditor",
  "resolution": "financial-auditor's position accepted: The ARR is 500K€ based on the analysis",
  "confidence": 72
}
```
→ "Based on the analysis" = source vague, le BA ne peut pas verifier.

### 2.2 Reflexion Engine - Problemes identifies

| Probleme | Code actuel | Impact |
|----------|-------------|--------|
| Critique sans standards | `Identify issues with this analysis` | Critiques subjectives |
| Improvements vagues | `"description": "specific change"` | On ne sait pas ce qui a change |
| Pas de cross-reference | Reflexion sur output seul | Auto-validation sans verification |

**Output actuel typique (MAUVAIS):**
```json
{
  "critiques": [{ "issue": "Some metrics could be more detailed" }],
  "improvements": [{ "description": "Added more detail", "applied": true }]
}
```
→ "Some metrics" = lesquels? "More detail" = quoi exactement?

---

## 3. STANDARDS DE QUALITE

### 3.1 Niveau attendu pour le Consensus Engine

Le Consensus Engine doit produire des resolutions **defensables devant un tribunal d'arbitrage**.

| Critere | Obligatoire | Exemple |
|---------|-------------|---------|
| Citation source primaire | OUI | "Slide 8 indique MRR = 42K€" |
| Explication rejet autre position | OUI | "Agent B utilisait une estimation sans source" |
| Verifiable par le BA | OUI | References exactes dans le deck |
| Base sur preuves, pas eloquence | OUI | Cross-reference deck + FM + CE |
| Incertitude explicite si 50/50 | OUI | "Range probable: 500-520K€" |

### 3.2 Niveau attendu pour le Reflexion Engine

Le Reflexion Engine doit produire des critiques **acceptees par un Partner d'audit Big4**.

| Critere | Obligatoire | Exemple |
|---------|-------------|---------|
| Critique specifique et localisee | OUI | "Le CAC (slide 5: 2,500€) ne prend pas en compte..." |
| Reference aux standards secteur | OUI | "Benchmark OpenView 2024: CAC median = 1,800€" |
| Action concrete proposee | OUI | "Recalculer en demandant la decomposition" |
| Avant/Apres visible | OUI | Texte exact avant et apres correction |
| Cross-reference CE/DB | OUI | "Context Engine: pas de donnees CAC - benchmark utilise" |

### 3.3 Matrice de Declenchement

```
┌────────────────────────────────────────────────────────────────────────┐
│                    QUAND DECLENCHER QUOI                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  CONTRADICTION DETECTEE                                                │
│  ───────────────────────                                               │
│  ├─ Severite CRITICAL ou MAJOR → Consensus Engine OBLIGATOIRE          │
│  ├─ Severite MODERATE → Consensus Engine si confiance < 70% des 2     │
│  └─ Severite MINOR → Resolution rapide sans debat (cross-ref deck)    │
│                                                                        │
│  CONFIANCE FAIBLE                                                      │
│  ───────────────────────                                               │
│  ├─ Agent Tier 1, confiance < 70% → Reflexion Engine OBLIGATOIRE      │
│  ├─ Agent Tier 2, confiance < 60% → Reflexion Engine OBLIGATOIRE      │
│  └─ Agent Tier 3 → JAMAIS (synthese finale)                           │
│                                                                        │
│  RED FLAG CRITIQUE                                                     │
│  ─────────────────                                                     │
│  ├─ Severity CRITICAL + source verifiable → OK                        │
│  └─ Severity CRITICAL + source non verifiable → Reflexion obligatoire │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Seuils Justifies

| Seuil | Valeur | Justification |
|-------|--------|---------------|
| Ecart numerique = contradiction | >30% | En dessous, c'est souvent des arrondis ou estimations acceptables |
| Confiance declenchant reflexion (Tier 1) | <70% | Un agent Tier 1 doit etre fiable, <70% = probleme |
| Confiance declenchant reflexion (Tier 2) | <60% | Experts sectoriels ont plus d'incertitude par nature |
| Max rounds de debat | 3 | Au-dela, le cout explose sans gain de qualite |
| Confiance pour skip round | >85% d'un cote | Si un agent a 90% et l'autre 50%, pas besoin de 3 rounds |

---

## 4. REFONTE CONSENSUS ENGINE

### 4.1 Types TypeScript Complets

```typescript
// src/agents/orchestration/consensus-types.ts

// ============================================================================
// TYPES DE DETECTION
// ============================================================================

export type ContradictionType =
  | "numeric_value"      // Deux chiffres differents pour la meme metrique
  | "assessment"         // "Bon" vs "Mauvais" sur le meme sujet
  | "existence"          // "Existe" vs "N'existe pas"
  | "interpretation";    // Meme donnee, conclusions opposees

export type ContradictionSeverity = "CRITICAL" | "MAJOR" | "MODERATE" | "MINOR";

export interface ContradictionPosition {
  agentName: string;
  findingId: string;
  claim: string;
  value: unknown;
  unit?: string;
  confidence: number;
  sources: {
    type: "deck" | "financial_model" | "context_engine" | "funding_db" | "inference";
    reference: string;
    quote?: string;
  }[];
}

export interface EnhancedContradiction {
  id: string;
  topic: string;
  detectedAt: Date;

  // Positions en conflit
  positions: ContradictionPosition[];

  // Analyse de la contradiction
  contradictionType: ContradictionType;

  // Severite calculee
  severity: {
    level: ContradictionSeverity;
    calculation: string;
    impactIfWrong: string;
  };

  // Donnees de verification disponibles
  verificationData: {
    deckReferences: string[];
    contextEngineData?: unknown;
    fundingDbData?: unknown;
  };

  // Status
  status: "detected" | "debating" | "resolved" | "unresolved";
}

// ============================================================================
// TYPES DE RESOLUTION
// ============================================================================

export type VerdictType = "POSITION_A" | "POSITION_B" | "SYNTHESIS" | "UNRESOLVED";

export interface DecisiveFactor {
  factor: string;
  source: string;
  weight: "PRIMARY" | "SUPPORTING";
}

export interface RejectedPositionFlaw {
  position: string;
  flaw: string;
  evidence: string;
}

export interface FinalValue {
  value: unknown;
  unit?: string;
  confidence: number;
  range?: { min: unknown; max: unknown };
  derivedFrom: {
    source: string;
    calculation?: string;
  };
}

export interface BAGuidance {
  oneLiner: string;
  canTrust: boolean;
  trustLevel: "HIGH" | "MEDIUM" | "LOW";
  whatToVerify?: string;
  questionForFounder?: string;
  verifiableSources: {
    source: string;
    reference: string;
    whatItProves: string;
  }[];
}

export interface UnresolvedAspect {
  aspect: string;
  reason: string;
  suggestedAction: string;
}

export interface EnhancedResolution {
  contradictionId: string;
  resolvedAt: Date;

  // Verdict
  verdict: {
    decision: VerdictType;
    winner?: string;
    justification: {
      decisiveFactors: DecisiveFactor[];
      rejectedPositionFlaws: RejectedPositionFlaw[];
    };
  };

  // Valeur finale
  finalValue: FinalValue;

  // Pour le BA
  baGuidance: BAGuidance;

  // Debat complet (pour audit)
  debateRecord: {
    rounds: DebateRound[];
    totalDuration: number;
    tokensUsed: number;
    optimizationApplied?: string; // ex: "SKIP_TO_ARBITRATION" si confiance asymetrique
  };

  // Reste a clarifier
  unresolvedAspects: UnresolvedAspect[];
}

// ============================================================================
// TYPES DE DEBAT
// ============================================================================

export interface DebateEvidence {
  source: string;
  quote: string;
  interpretation: string;
}

export interface DebatePosition {
  agentName: string;
  claim: string;
  value: unknown;
  evidence: DebateEvidence[];
  calculation?: {
    formula: string;
    steps: string[];
    result: string;
  };
  weaknesses: string[];
  confidenceLevel: number;
  confidenceJustification: string;
}

export interface DebateRound {
  roundNumber: number;
  positions: DebatePosition[];
  timestamp: Date;
  tokensUsed: number;
}
```

### 4.2 System Prompt - Debater

```typescript
// A utiliser pour chaque agent qui defende sa position

export function buildDebaterSystemPrompt(role: "prosecutor" | "defender"): string {
  return `# ROLE

Tu es un analyste senior dans un comite d'investissement. Tu dois DEFENDRE une position avec des PREUVES, pas avec de la rhetorique.

# MISSION

${role === "prosecutor"
  ? "Tu dois DEMONTRER pourquoi ta position est correcte en citant les sources primaires."
  : "Tu dois REFUTER la position adverse en montrant ses failles methodologiques ou factuelles."}

# METHODOLOGIE OBLIGATOIRE

## Etape 1: Identifier les PREUVES
- Cherche dans le deck les citations EXACTES (numero de slide, texte exact)
- Cherche dans le financial model les chiffres PRECIS (onglet, ligne, valeur)
- Si Context Engine ou Funding DB fournis, utilise-les pour verifier

## Etape 2: Construire l'ARGUMENTATION
- Chaque affirmation = UNE source precise
- Chaque calcul = formule explicite avec inputs sources
- Chaque comparaison = benchmark avec source

## Etape 3: Reconnaitre les FAIBLESSES
- Quelles zones d'incertitude dans ta position?
- Quelles donnees te manquent?
- Que pourrait legitimement contester l'adversaire?

# FORMAT DE REPONSE (JSON STRICT)

{
  "position": {
    "claim": "Enonce clair de ta position",
    "value": "Valeur numerique si applicable",
    "unit": "Unite de mesure"
  },
  "evidence": [
    {
      "source": "Deck Slide X / Financial Model Onglet Y Ligne Z / Context Engine",
      "quote": "Citation EXACTE ou donnee precise",
      "interpretation": "Comment ca supporte ta position"
    }
  ],
  "calculation": {
    "formula": "Si applicable (ex: ARR = MRR × 12)",
    "steps": ["MRR = 42,000€ (Slide 8)", "ARR = 42,000 × 12 = 504,000€"],
    "result": "504,000€"
  },
  "weaknesses": [
    "Ce que tu admets ne pas pouvoir prouver avec certitude"
  ],
  "confidenceLevel": 85,
  "confidenceJustification": "Source primaire directe (deck), calcul simple et verifiable"
}

# REGLES ABSOLUES

1. JAMAIS d'affirmation sans source precise (slide, ligne, document)
2. JAMAIS de "je pense que", "il semble que", "probablement"
3. TOUJOURS citer le document EXACTEMENT comme il est ecrit
4. RECONNAITRE les incertitudes plutot que les cacher
5. Ne pas "gagner" par la rhetorique - gagner par les PREUVES
6. Si tu n'as pas de preuve → dis "Je n'ai pas de source pour cette affirmation"`;
}
```

### 4.3 User Prompt - Debater Round 1

```typescript
export function buildDebaterRound1Prompt(
  contradiction: EnhancedContradiction,
  agentPosition: ContradictionPosition,
  opposingPosition: ContradictionPosition,
  verificationContext: VerificationContext
): string {
  return `# CONTEXTE DU DEBAT

## Contradiction detectee
- Topic: ${contradiction.topic}
- Type: ${contradiction.contradictionType}
- Severite: ${contradiction.severity.level}
- Impact si erreur: ${contradiction.severity.impactIfWrong}

## TA POSITION (a defendre)
- Agent: ${agentPosition.agentName}
- Claim: ${agentPosition.claim}
- Valeur: ${agentPosition.value} ${agentPosition.unit || ""}
- Confiance initiale: ${agentPosition.confidence}%
- Sources citees: ${JSON.stringify(agentPosition.sources, null, 2)}

## POSITION ADVERSE
- Agent: ${opposingPosition.agentName}
- Claim: ${opposingPosition.claim}
- Valeur: ${opposingPosition.value} ${opposingPosition.unit || ""}
- Confiance: ${opposingPosition.confidence}%

## DONNEES DE VERIFICATION DISPONIBLES

### Deck (extraits pertinents)
${verificationContext.deckExtracts || "Non disponible"}

### Financial Model (extraits pertinents)
${verificationContext.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee disponible"}

### Funding Database
${verificationContext.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee disponible"}

# MISSION

Defend ta position avec des PREUVES. Cite les sources EXACTEMENT.
Si tu trouves que ta position initiale etait fausse apres verification, DIS-LE.

Reponds au format JSON specifie dans le system prompt.`;
}
```

### 4.4 System Prompt - Arbitrator

```typescript
export function buildArbitratorSystemPrompt(): string {
  return `# ROLE

Tu es le President du Comite d'Investissement. Tu dois TRANCHER une contradiction entre deux analyses.

Tu as 25 ans d'experience. Tu sais que:
- Les opinions ne valent RIEN sans preuves
- Les calculs sans source sont SUSPECTS
- Le document original (deck) est la VERITE de reference
- Les donnees externes (Context Engine, DB) permettent de VERIFIER
- Un Business Angel va investir 50-200K€ sur la base de cette decision

# MISSION

Resoudre cette contradiction de maniere DEFINITIVE et JUSTIFIABLE.

# METHODOLOGIE OBLIGATOIRE

## Etape 1: Inventaire des preuves (pour chaque position)
- Sources primaires citees (deck, financial model) → VERIFIER qu'elles existent
- Sources secondaires citees (Context Engine, DB) → NOTER
- Calculs fournis → VERIFIER mathematiquement
- Zones d'incertitude admises → NOTER

## Etape 2: Verification croisee
- La source primaire citee existe-t-elle dans les donnees fournies?
- La citation est-elle exacte ou deformee?
- Les calculs sont-ils mathematiquement corrects?
- Y a-t-il des donnees Context Engine/DB qui departageraient?

## Etape 3: Decision
- POSITION_A si: preuves primaires + calculs corrects + coherent avec CE/DB
- POSITION_B si: idem
- SYNTHESIS si: les deux ont partiellement raison (rare)
- UNRESOLVED si: impossible de trancher avec les donnees disponibles

## Etape 4: Documentation pour le BA
- Resume en 1 phrase ce qu'il doit retenir
- Indiquer s'il peut faire confiance (HIGH/MEDIUM/LOW)
- Si MEDIUM ou LOW: dire quoi verifier et quelle question poser au fondateur

# FORMAT DE DECISION (JSON STRICT)

{
  "verdict": {
    "decision": "POSITION_A" | "POSITION_B" | "SYNTHESIS" | "UNRESOLVED",
    "winner": "nom de l'agent gagnant (si applicable)",
    "justification": {
      "decisiveFactors": [
        {
          "factor": "Description du facteur decisif",
          "source": "Reference exacte (Deck Slide X, FM Onglet Y)",
          "weight": "PRIMARY" | "SUPPORTING"
        }
      ],
      "rejectedPositionFlaws": [
        {
          "position": "Agent B",
          "flaw": "Description precise du probleme",
          "evidence": "Preuve que c'est faux"
        }
      ]
    }
  },
  "finalValue": {
    "value": 505000,
    "unit": "EUR",
    "confidence": 92,
    "range": { "min": 504000, "max": 507000 },
    "derivedFrom": {
      "source": "Deck Slide 8 + Financial Model Onglet Revenue",
      "calculation": "MRR 42K€ × 12 = 504K€, confirme par FM 507K€, moyenne 505K€"
    }
  },
  "baGuidance": {
    "oneLiner": "ARR = 505K€ (confirme par deck + financial model, ecart < 1%)",
    "canTrust": true,
    "trustLevel": "HIGH",
    "whatToVerify": null,
    "questionForFounder": null,
    "verifiableSources": [
      {
        "source": "Deck",
        "reference": "Slide 8",
        "whatItProves": "MRR = 42,000€"
      },
      {
        "source": "Financial Model",
        "reference": "Onglet Revenue, Ligne 12",
        "whatItProves": "ARR = 507,000€"
      }
    ]
  },
  "unresolvedAspects": []
}

# REGLES ABSOLUES

1. JAMAIS trancher sans au moins UNE preuve primaire d'un cote
2. TOUJOURS expliquer pourquoi l'autre position est rejetee (avec preuve)
3. Si 50/50 → verdict UNRESOLVED + question pour le fondateur
4. Le BA doit pouvoir VERIFIER ta decision avec les sources citees
5. Si une position cite une source qui n'existe pas → RED FLAG immediat`;
}
```

### 4.5 User Prompt - Arbitrator

```typescript
export function buildArbitratorPrompt(
  contradiction: EnhancedContradiction,
  debateRounds: DebateRound[],
  verificationContext: VerificationContext
): string {
  return `# CONTRADICTION A ARBITRER

## Informations generales
- ID: ${contradiction.id}
- Topic: ${contradiction.topic}
- Type: ${contradiction.contradictionType}
- Severite: ${contradiction.severity.level}
- Impact si erreur: ${contradiction.severity.impactIfWrong}

## POSITION A - ${contradiction.positions[0].agentName}
- Claim: ${contradiction.positions[0].claim}
- Valeur: ${contradiction.positions[0].value} ${contradiction.positions[0].unit || ""}
- Confiance: ${contradiction.positions[0].confidence}%

## POSITION B - ${contradiction.positions[1].agentName}
- Claim: ${contradiction.positions[1].claim}
- Valeur: ${contradiction.positions[1].value} ${contradiction.positions[1].unit || ""}
- Confiance: ${contradiction.positions[1].confidence}%

## HISTORIQUE DU DEBAT

${debateRounds.map(round => `
### Round ${round.roundNumber}
${round.positions.map(pos => `
**${pos.agentName}:**
- Position: ${pos.claim}
- Preuves citees: ${JSON.stringify(pos.evidence, null, 2)}
- Calcul: ${pos.calculation ? JSON.stringify(pos.calculation) : "Aucun"}
- Faiblesses admises: ${pos.weaknesses.join(", ") || "Aucune"}
- Confiance: ${pos.confidenceLevel}%
`).join("\n")}
`).join("\n---\n")}

## DONNEES DE VERIFICATION (pour cross-check)

### Extraits du Deck
${verificationContext.deckExtracts || "Non disponible"}

### Extraits du Financial Model
${verificationContext.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

### Funding Database
${verificationContext.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

# MISSION

1. VERIFIE que les sources citees par chaque position existent vraiment dans les donnees ci-dessus
2. VERIFIE que les calculs sont mathematiquement corrects
3. TRANCHE en faveur de la position qui a les PREUVES
4. DOCUMENTE pour que le BA puisse verifier

Reponds au format JSON specifie dans le system prompt.`;
}
```

### 4.6 Fallback: Resolution Rapide (sans debat)

Pour les contradictions MINOR ou quand un cote a >85% de confiance:

```typescript
export function buildQuickResolutionPrompt(
  contradiction: EnhancedContradiction,
  verificationContext: VerificationContext
): string {
  return `# RESOLUTION RAPIDE - Sans debat

## Contradiction
- Topic: ${contradiction.topic}
- Position A: ${contradiction.positions[0].claim} (${contradiction.positions[0].confidence}%)
- Position B: ${contradiction.positions[1].claim} (${contradiction.positions[1].confidence}%)

## Donnees de verification
${verificationContext.deckExtracts || "Deck non disponible"}
${verificationContext.financialModelExtracts || "FM non disponible"}

## Mission
Cette contradiction est ${contradiction.severity.level}. Tranche rapidement en cross-referencant avec le deck.

Reponds en JSON:
{
  "winner": "A" | "B" | "UNRESOLVED",
  "reason": "Explication courte avec source",
  "finalValue": { "value": X, "source": "Reference exacte" },
  "baOneLiner": "Resume pour le BA"
}`;
}
```

### 4.7 Exemple de Bon Output - Resolution

```json
{
  "verdict": {
    "decision": "POSITION_A",
    "winner": "financial-auditor",
    "justification": {
      "decisiveFactors": [
        {
          "factor": "MRR explicite dans le deck",
          "source": "Deck Slide 8: 'MRR Decembre 2024: 42,000€'",
          "weight": "PRIMARY"
        },
        {
          "factor": "Calcul ARR coherent et simple",
          "source": "42,000€ × 12 = 504,000€",
          "weight": "SUPPORTING"
        },
        {
          "factor": "Financial Model confirme a 0.6% pres",
          "source": "FM Onglet 'Revenue', Ligne 12: 507,000€ ARR",
          "weight": "SUPPORTING"
        }
      ],
      "rejectedPositionFlaws": [
        {
          "position": "market-intelligence (ARR = 800K€)",
          "flaw": "Aucune source primaire citee",
          "evidence": "L'agent mentionne 'estimation de marche' sans reference au deck ni au FM"
        },
        {
          "position": "market-intelligence",
          "flaw": "Ecart de 58% inexplique",
          "evidence": "800K€ vs 504K€ = +58%, impossible d'etre une erreur d'arrondi"
        }
      ]
    }
  },
  "finalValue": {
    "value": 505000,
    "unit": "EUR",
    "confidence": 92,
    "range": { "min": 504000, "max": 507000 },
    "derivedFrom": {
      "source": "Deck Slide 8 + FM Onglet Revenue Ligne 12",
      "calculation": "MRR 42K€ × 12 = 504K€. FM indique 507K€. Moyenne = 505.5K€ arrondi a 505K€"
    }
  },
  "baGuidance": {
    "oneLiner": "ARR = 505K€ (source: deck slide 8 + financial model, ecart < 1%)",
    "canTrust": true,
    "trustLevel": "HIGH",
    "whatToVerify": null,
    "questionForFounder": null,
    "verifiableSources": [
      {
        "source": "Deck",
        "reference": "Slide 8",
        "whatItProves": "MRR mensuel = 42,000€"
      },
      {
        "source": "Financial Model",
        "reference": "Onglet Revenue, Ligne 12",
        "whatItProves": "ARR annuel = 507,000€"
      }
    ]
  },
  "unresolvedAspects": []
}
```

### 4.8 Exemple de Bon Output - UNRESOLVED

```json
{
  "verdict": {
    "decision": "UNRESOLVED",
    "winner": null,
    "justification": {
      "decisiveFactors": [],
      "rejectedPositionFlaws": []
    }
  },
  "finalValue": {
    "value": null,
    "unit": "EUR",
    "confidence": 35,
    "range": { "min": 1800, "max": 4200 },
    "derivedFrom": {
      "source": "Aucune donnee fiable",
      "calculation": "Agent A estime 1,800€ (inference), Agent B estime 4,200€ (benchmark sectoriel). Aucune source primaire."
    }
  },
  "baGuidance": {
    "oneLiner": "CAC non determinable - donnees insuffisantes dans le deck",
    "canTrust": false,
    "trustLevel": "LOW",
    "whatToVerify": "Le deck ne mentionne ni les depenses marketing ni le nombre de clients acquis",
    "questionForFounder": "Pouvez-vous fournir: (1) Total des depenses marketing des 12 derniers mois, (2) Nombre de nouveaux clients acquis sur cette periode?",
    "verifiableSources": []
  },
  "unresolvedAspects": [
    {
      "aspect": "Customer Acquisition Cost (CAC)",
      "reason": "Deck ne fournit ni depenses marketing detaillees ni cohortes clients",
      "suggestedAction": "BLOQUANT: Demander au fondateur avant de valider l'analyse financiere"
    }
  ]
}
```

---

## 5. REFONTE REFLEXION ENGINE

### 5.1 Types TypeScript Complets

```typescript
// src/agents/orchestration/reflexion-types.ts

// ============================================================================
// TYPES DE CRITIQUE
// ============================================================================

export type CritiqueType =
  | "unsourced_claim"           // Affirmation sans source
  | "unverifiable_calculation"  // Calcul sans formule/inputs
  | "incomplete_red_flag"       // Red flag sans tous les composants
  | "missing_data_not_flagged"  // Donnee manquante non signalee
  | "missing_cross_reference"   // Context Engine/DB non utilise
  | "weak_conclusion"           // Conclusion non supportee par les preuves
  | "methodological_flaw"       // Erreur de methodologie
  | "inconsistency";            // Incoherence interne

export type CritiqueSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface CritiqueLocation {
  section: string;
  quote: string;
  lineNumbers?: string;
}

export interface SuggestedFix {
  action: string;
  source?: string;
  example?: string;
  estimatedEffort: "TRIVIAL" | "EASY" | "MODERATE" | "SIGNIFICANT";
}

export interface EnhancedCritique {
  id: string;
  type: CritiqueType;
  severity: CritiqueSeverity;
  location: CritiqueLocation;
  issue: string;
  standard: string;
  expectedBehavior: string;
  suggestedFix: SuggestedFix;
  impactOnBA: string;
  relatedFindings?: string[];
}

// ============================================================================
// TYPES D'IMPROVEMENT
// ============================================================================

export type ChangeType =
  | "added_source"
  | "added_calculation"
  | "completed_red_flag"
  | "added_cross_reference"
  | "clarified"
  | "removed"
  | "downgraded";

export interface Change {
  before: string;
  after: string;
  type: ChangeType;
}

export interface ImprovementJustification {
  sourceUsed?: string;
  calculationShown?: string;
  crossReferenceResult?: string;
  ifCannotFix?: string;
}

export interface EnhancedImprovement {
  critiqueId: string;
  status: "FIXED" | "PARTIALLY_FIXED" | "CANNOT_FIX";
  change: Change;
  justification: ImprovementJustification;
  confidenceImpact: number;
  qualityImpact: "HIGH" | "MEDIUM" | "LOW";
}

// ============================================================================
// TYPES D'OUTPUT
// ============================================================================

export interface CritiqueSummary {
  total: number;
  bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number };
  byType: Record<CritiqueType, number>;
}

export interface ImprovementSummary {
  fixed: number;
  partiallyFixed: number;
  cannotFix: number;
}

export interface QualityMetrics {
  originalScore: number;
  revisedScore: number;
  change: number;
  readyForBA: boolean;
}

export interface BANotice {
  remainingWeaknesses: string[];
  dataNeedsFromFounder: string[];
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface EnhancedReflexionOutput {
  // Input
  originalAgentOutput: unknown;
  agentName: string;
  agentConfidence: number;

  // Critiques
  critiques: EnhancedCritique[];
  critiqueSummary: CritiqueSummary;

  // Improvements
  improvements: EnhancedImprovement[];
  improvementSummary: ImprovementSummary;

  // Output revise
  revisedOutput: unknown;
  revisedFindings: ScoredFinding[];

  // Metriques
  qualityMetrics: QualityMetrics;

  // Pour le BA
  baNotice: BANotice;

  // Metadata
  tokensUsed: number;
  processingTime: number;
}
```

### 5.2 System Prompt - Critic

```typescript
export function buildCriticSystemPrompt(agentName: string, agentTier: 1 | 2 | 3): string {
  return `# ROLE

Tu es un Senior Reviewer dans un cabinet Big4, specialise en Due Diligence.
Tu relis le rapport d'un analyste junior (agent "${agentName}", Tier ${agentTier}) avant envoi au client.

Tu as 15 ans d'experience et tu sais que:
- Un rapport "a peu pres correct" n'est PAS acceptable
- Chaque affirmation non sourcee est un RISQUE legal
- Le client (Business Angel) va prendre une decision de 50-200K€ basee sur ce rapport
- Un red flag vague est PIRE qu'aucun red flag (fausse alerte)

# MISSION

Critiquer l'output de l'agent pour identifier:
1. Les affirmations non sourcees
2. Les calculs sans formule explicite
3. Les conclusions sans evidence suffisante
4. Les red flags mal documentes
5. Les donnees manquantes non signalees
6. Les opportunites de cross-reference non exploitees (Context Engine, Funding DB)

# METHODOLOGIE OBLIGATOIRE

## Etape 1: Audit des sources
Pour CHAQUE affirmation factuelle dans l'output:
- A-t-elle une source? (Deck slide X, FM ligne Y, Context Engine)
- La source est-elle citee PRECISEMENT? (pas "le deck", mais "Slide 12")
- Si non → CRITIQUE type "unsourced_claim"

## Etape 2: Audit des calculs
Pour CHAQUE chiffre calcule (pas extrait directement):
- La formule est-elle explicite?
- Les inputs sont-ils sources?
- Le resultat est-il mathematiquement correct?
- Si non → CRITIQUE type "unverifiable_calculation"

## Etape 3: Audit des red flags
Pour CHAQUE red flag signale:
- A-t-il une severite justifiee? (CRITICAL/HIGH/MEDIUM avec explication)
- A-t-il une preuve concrete? (pas juste une intuition)
- A-t-il un impact quantifie? (en € ou en %)
- A-t-il une question pour le fondateur?
- Si non → CRITIQUE type "incomplete_red_flag"

## Etape 4: Audit des donnees manquantes
Pour chaque metrique ATTENDUE dans ce type d'analyse:
- Est-elle presente?
- Si absente, l'agent l'a-t-il signale comme manquante?
- A-t-il cherche dans le Context Engine / Funding DB?
- Si non → CRITIQUE type "missing_data_not_flagged"

## Etape 5: Audit des cross-references
- L'agent a-t-il utilise le Context Engine si disponible?
- L'agent a-t-il utilise la Funding Database si pertinent?
- Y avait-il des donnees externes qui auraient renforce/infirme l'analyse?
- Si non → CRITIQUE type "missing_cross_reference"

# FORMAT DE REPONSE (JSON STRICT)

{
  "critiques": [
    {
      "id": "CRT-001",
      "type": "unsourced_claim",
      "severity": "HIGH",
      "location": {
        "section": "findings.metrics[2]",
        "quote": "Gross Margin estimated at 75%"
      },
      "issue": "Le Gross Margin de 75% est marque 'estimated' sans source ni calcul",
      "standard": "Standard Big4: Toute metrique financiere doit avoir source primaire ou calcul explicite",
      "expectedBehavior": "Soit citer deck/FM, soit calculer depuis COGS/Revenue, soit marquer 'NON DISPONIBLE'",
      "suggestedFix": {
        "action": "Chercher Gross Margin dans FM onglet P&L ou calculer depuis Revenue et COGS",
        "source": "Financial Model, Onglet P&L",
        "example": "Gross Margin: 72% (FM P&L Ligne 8: Revenue 500K - COGS 140K = 360K / 500K)",
        "estimatedEffort": "EASY"
      },
      "impactOnBA": "Le BA utilise le GM pour calculer LTV. Erreur de 5% sur GM = ~15% erreur sur LTV"
    }
  ],
  "missingCrossReferences": [
    {
      "source": "Funding Database",
      "dataType": "Benchmark valorisation Seed SaaS",
      "potentialValue": "Positionner le multiple de valorisation vs P25/median/P75 du marche"
    }
  ],
  "overallAssessment": {
    "qualityScore": 58,
    "verdict": "NEEDS_REVISION",
    "keyWeaknesses": [
      "3 metriques financieres sans source",
      "Aucun cross-reference avec Funding DB",
      "Red flag 'projections irrealistes' sans calcul"
    ],
    "readyForBA": false
  }
}

# REGLES ABSOLUES

1. ETRE SPECIFIQUE - Pas de "certaines affirmations manquent de sources" → LESQUELLES?
2. CITER le passage exact problematique entre guillemets
3. PROPOSER une solution concrete avec source si possible
4. PRIORISER par impact sur la decision du BA
5. Ne pas critiquer le STYLE - uniquement le FOND (sources, calculs, preuves)
6. Chaque critique doit avoir un ID unique (CRT-001, CRT-002, ...)`;
}
```

### 5.3 User Prompt - Critic

```typescript
export function buildCriticPrompt(
  agentName: string,
  agentOutput: unknown,
  findings: ScoredFinding[],
  verificationContext: VerificationContext
): string {
  return `# OUTPUT DE L'AGENT A CRITIQUER

## Agent: ${agentName}
## Confiance moyenne des findings: ${calculateAvgConfidence(findings)}%

## Output complet de l'agent:
\`\`\`json
${JSON.stringify(agentOutput, null, 2)}
\`\`\`

## Findings produits:
${findings.map((f, i) => `
${i + 1}. **${f.metric}**
   - Valeur: ${f.value} ${f.unit}
   - Assessment: ${f.assessment}
   - Confiance: ${f.confidence.score}%
   - Sources citees: ${f.evidence.map(e => e.source).join(", ") || "AUCUNE"}
`).join("\n")}

# DONNEES DE VERIFICATION DISPONIBLES

## Extraits du Deck (pour verifier les sources citees)
${verificationContext.deckExtracts || "Non disponible"}

## Extraits du Financial Model
${verificationContext.financialModelExtracts || "Non disponible"}

## Context Engine (donnees externes disponibles)
${verificationContext.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee disponible"}

## Funding Database (benchmarks disponibles)
${verificationContext.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee disponible"}

# MISSION

Critique cet output selon la methodologie Big4 decrite dans le system prompt.
Identifie TOUTES les faiblesses. Sois SPECIFIQUE et ACTIONNABLE.

Reponds au format JSON specifie.`;
}
```

### 5.4 System Prompt - Improver

```typescript
export function buildImproverSystemPrompt(): string {
  return `# ROLE

Tu es l'analyste qui doit CORRIGER son rapport suite aux critiques du Reviewer senior.
Tu dois transformer chaque critique en une CORRECTION CONCRETE et VISIBLE.

# MISSION

Pour chaque critique recue:
1. COMPRENDRE le probleme exact
2. TROUVER la solution (chercher la source, faire le calcul, etc.)
3. APPLIQUER la correction
4. DOCUMENTER le changement (AVANT/APRES)

# METHODOLOGIE PAR TYPE DE CRITIQUE

## Pour "unsourced_claim"
- Chercher la source dans le deck / financial model / Context Engine
- Si trouvee → Ajouter la reference exacte
- Si non trouvee → Marquer comme "NON VERIFIABLE - donnee manquante dans le deck"

## Pour "unverifiable_calculation"
- Expliciter la formule utilisee
- Lister chaque input avec sa source
- Montrer le calcul etape par etape
- Verifier le resultat

## Pour "incomplete_red_flag"
- Ajouter les composants manquants (severite, preuve, impact, question)
- Si impossible de completer → Downgrader en "warning" ou supprimer

## Pour "missing_cross_reference"
- Chercher dans le Context Engine (si disponible)
- Chercher dans la Funding DB (si disponible)
- Documenter ce qui a ete trouve ou "Aucune donnee externe disponible"

## Pour "missing_data_not_flagged"
- Ajouter explicitement la donnee manquante dans les gaps
- Proposer une question pour le fondateur si pertinent

# FORMAT DE CORRECTION (JSON STRICT)

{
  "corrections": [
    {
      "critiqueId": "CRT-001",
      "status": "FIXED",
      "change": {
        "before": "Gross Margin estimated at 75%",
        "after": "Gross Margin: 72% (FM P&L Ligne 8: Revenue 507K€ - COGS 142K€ = 365K€ / 507K€ = 72.0%)",
        "type": "added_source"
      },
      "justification": {
        "sourceUsed": "Financial Model, Onglet P&L, Lignes 5 et 8",
        "calculationShown": "(507,000 - 142,000) / 507,000 = 0.720 = 72%"
      },
      "confidenceImpact": 8,
      "qualityImpact": "HIGH"
    },
    {
      "critiqueId": "CRT-003",
      "status": "CANNOT_FIX",
      "change": {
        "before": "Churn rate: 2.5% monthly",
        "after": "Churn rate: NON DISPONIBLE (deck et FM ne mentionnent pas le churn)",
        "type": "clarified"
      },
      "justification": {
        "ifCannotFix": "Churn non present dans le deck ni le financial model. Aucune donnee Context Engine disponible."
      },
      "confidenceImpact": -5,
      "qualityImpact": "MEDIUM"
    }
  ],
  "revisedOutput": {
    // L'output COMPLET de l'agent avec TOUTES les corrections appliquees
    // Pas juste les parties modifiees - le document entier
  },
  "qualityMetrics": {
    "originalScore": 58,
    "revisedScore": 78,
    "change": 20,
    "readyForBA": true
  },
  "baNotice": {
    "remainingWeaknesses": [
      "Churn rate non disponible - estime a 30% annuel (benchmark sectoriel)"
    ],
    "dataNeedsFromFounder": [
      "Confirmer le churn rate reel sur les 12 derniers mois",
      "Fournir la decomposition des depenses marketing"
    ],
    "confidenceLevel": "MEDIUM"
  }
}

# REGLES ABSOLUES

1. CHAQUE correction doit montrer AVANT et APRES
2. JAMAIS inventer une source - si introuvable, le dire clairement
3. Le revisedOutput doit etre COMPLET (pas juste les diffs)
4. Le BA doit voir EXACTEMENT ce qui a change
5. Si une critique ne peut pas etre corrigee → status "CANNOT_FIX" avec raison`;
}
```

### 5.5 User Prompt - Improver

```typescript
export function buildImproverPrompt(
  agentName: string,
  originalOutput: unknown,
  critiques: EnhancedCritique[],
  verificationContext: VerificationContext
): string {
  return `# CORRECTIONS A APPORTER

## Agent: ${agentName}
## Nombre de critiques: ${critiques.length}

## Critiques a traiter:
${critiques.map(c => `
### ${c.id} - ${c.type} (${c.severity})
- **Localisation**: ${c.location.section}
- **Passage problematique**: "${c.location.quote}"
- **Probleme**: ${c.issue}
- **Standard viole**: ${c.standard}
- **Correction attendue**: ${c.expectedBehavior}
- **Suggestion**: ${c.suggestedFix.action}
- **Source suggeree**: ${c.suggestedFix.source || "Non specifiee"}
- **Exemple**: ${c.suggestedFix.example || "Non fourni"}
- **Impact BA**: ${c.impactOnBA}
`).join("\n---\n")}

## Output original a corriger:
\`\`\`json
${JSON.stringify(originalOutput, null, 2)}
\`\`\`

## DONNEES DISPONIBLES POUR CORRECTION

### Deck (extraits)
${verificationContext.deckExtracts || "Non disponible"}

### Financial Model (extraits)
${verificationContext.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

### Funding Database
${verificationContext.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

# MISSION

Corrige CHAQUE critique listee ci-dessus.
Pour chaque correction, montre le AVANT et APRES.
Si une correction est impossible, explique pourquoi.

Reponds au format JSON specifie dans le system prompt.`;
}
```

### 5.6 Exemple de Bon Output - Critique

```json
{
  "critiques": [
    {
      "id": "CRT-001",
      "type": "unsourced_claim",
      "severity": "HIGH",
      "location": {
        "section": "findings.metrics[2]",
        "quote": "Gross Margin estimated at 75%"
      },
      "issue": "Le Gross Margin de 75% est marque comme 'estimated' sans source ni calcul explicite",
      "standard": "Standard Big4: Toute metrique financiere doit avoir une source primaire ou un calcul explicite avec inputs sources",
      "expectedBehavior": "Soit citer le deck/financial model directement, soit calculer depuis Revenue et COGS avec sources, soit marquer comme 'NON DISPONIBLE'",
      "suggestedFix": {
        "action": "Chercher dans le Financial Model s'il y a une ligne Gross Margin, COGS, ou marge brute",
        "source": "Financial Model, potentiellement onglet 'P&L' ou 'Unit Economics'",
        "example": "Gross Margin: 72% (Financial Model, P&L, Ligne 8: Revenue 500K€ - COGS 140K€ = 360K€ / 500K€ = 72%)",
        "estimatedEffort": "EASY"
      },
      "impactOnBA": "Le BA utilise le Gross Margin pour calculer le LTV. Une erreur de 5% sur le GM entraine une erreur de ~15% sur le LTV, faussant completement l'evaluation de la viabilite du business model."
    },
    {
      "id": "CRT-002",
      "type": "missing_cross_reference",
      "severity": "MEDIUM",
      "location": {
        "section": "findings.valuation",
        "quote": "Valuation of 8M€ appears aggressive"
      },
      "issue": "L'affirmation 'aggressive' n'est pas benchmarkee contre la Funding Database",
      "standard": "DB-EXPLOITATION-SPEC.md: Toute affirmation sur la valorisation doit etre cross-referencee avec les percentiles de la base de deals",
      "expectedBehavior": "Calculer le percentile exact de cette valorisation vs deals similaires dans la DB (meme stage, meme secteur, ARR similaire)",
      "suggestedFix": {
        "action": "Interroger la Funding DB pour deals Seed SaaS B2B avec ARR 400K-600K€",
        "source": "Funding Database via benchmark-service",
        "example": "Valuation 8M€ @ 500K ARR = 16x ARR. Funding DB Seed SaaS B2B: P25=8x, Median=12x, P75=18x. Ce deal = P68. Verdict: MODEREMENT AGGRESSIVE (+33% vs median).",
        "estimatedEffort": "MODERATE"
      },
      "impactOnBA": "Sans benchmark chiffre, le BA ne sait pas si 8M€ est normal, cher, ou tres cher pour ce type de deal. Il negocie a l'aveugle."
    },
    {
      "id": "CRT-003",
      "type": "incomplete_red_flag",
      "severity": "CRITICAL",
      "location": {
        "section": "redFlags[0]",
        "quote": "Projections seem unrealistic"
      },
      "issue": "Red flag 'projections irrealistes' sans quantification ni calcul demontrant l'irrealisme",
      "standard": "AGENT-REFONTE-PROMPT.md: Chaque red flag doit avoir severite + preuve + impact + question fondateur",
      "expectedBehavior": "Calculer le taux de croissance implicite et comparer aux benchmarks sectoriels. Montrer POURQUOI c'est irrealiste avec des chiffres.",
      "suggestedFix": {
        "action": "Calculer CAGR des projections et comparer au P90 du secteur",
        "source": "Financial Model projections + benchmarks SaaS growth",
        "example": "Red flag: Projections irrealistes - CAGR projete de 400% vs P90 secteur de 150%. Ecart de 250 points = probabilite <5% d'atteindre les objectifs.",
        "estimatedEffort": "MODERATE"
      },
      "impactOnBA": "Un red flag vague est inutile. Le BA a besoin de savoir EXACTEMENT pourquoi c'est un probleme et QUELLE question poser au fondateur."
    }
  ],
  "missingCrossReferences": [
    {
      "source": "Funding Database",
      "dataType": "Comparables valorisation Seed SaaS Europe",
      "potentialValue": "Positionner le deal vs P25/median/P75 pour negociation informee"
    },
    {
      "source": "Context Engine - Crunchbase",
      "dataType": "Historique de funding des fondateurs",
      "potentialValue": "Verifier si les fondateurs ont deja leve et a quelle valorisation"
    }
  ],
  "overallAssessment": {
    "qualityScore": 52,
    "verdict": "MAJOR_REVISION_REQUIRED",
    "keyWeaknesses": [
      "3 metriques financieres cles sans source verifiable",
      "Aucune utilisation de la Funding Database pour benchmark",
      "Red flag critique incomplet et non actionnable"
    ],
    "readyForBA": false
  }
}
```

### 5.7 Exemple de Bon Output - Improvement

```json
{
  "corrections": [
    {
      "critiqueId": "CRT-001",
      "status": "FIXED",
      "change": {
        "before": "Gross Margin estimated at 75%",
        "after": "Gross Margin: 72.0% (Financial Model, Onglet P&L, Ligne 8: Revenue 507,000€ - COGS 142,000€ = 365,000€. Calcul: 365,000 / 507,000 = 0.720 = 72.0%)",
        "type": "added_source"
      },
      "justification": {
        "sourceUsed": "Financial Model, Onglet 'P&L', Lignes 5 (Revenue: 507,000€) et 8 (COGS: 142,000€)",
        "calculationShown": "Gross Profit = 507,000 - 142,000 = 365,000€. Gross Margin = 365,000 / 507,000 = 0.7199 = 72.0%"
      },
      "confidenceImpact": 12,
      "qualityImpact": "HIGH"
    },
    {
      "critiqueId": "CRT-002",
      "status": "FIXED",
      "change": {
        "before": "Valuation of 8M€ appears aggressive",
        "after": "Valuation 8M€ pre-money @ 505K€ ARR = 15.8x ARR multiple. Funding DB benchmark (Seed SaaS B2B Europe, n=47 deals): P25=7.2x, Median=11.5x, P75=16.8x. Ce deal se situe au P72 (entre Median et P75). Verdict: MODEREMENT AGGRESSIVE (+37% vs median sectoriel).",
        "type": "added_cross_reference"
      },
      "justification": {
        "crossReferenceResult": "Funding DB query: stage=Seed, sector=SaaS B2B, region=Europe, ARR_range=300K-800K€. Resultats: 47 deals, multiples ARR de 4.5x a 24x. Percentile calcule par interpolation lineaire."
      },
      "confidenceImpact": 15,
      "qualityImpact": "HIGH"
    },
    {
      "critiqueId": "CRT-003",
      "status": "FIXED",
      "change": {
        "before": "Projections seem unrealistic",
        "after": "RED FLAG [CRITICAL]: Projections de croissance irrealistes\n- Preuve: ARR projete Y1→Y3: 505K€ → 4.2M€ = CAGR de 188%\n- Benchmark: Top decile SaaS B2B Seed = CAGR 120% (Source: OpenView 2024)\n- Ecart: +68 points vs meilleurs performeurs du marche\n- Impact: Probabilite <5% d'atteindre projections. Valorisation basee sur ces projections = surestimee de 40-60%\n- Question fondateur: 'Quels sont les 3 drivers specifiques qui vous permettraient d'atteindre 188% CAGR alors que le top 10% du marche fait 120%?'",
        "type": "completed_red_flag"
      },
      "justification": {
        "calculationShown": "CAGR = (4,200,000 / 505,000)^(1/2) - 1 = 2.88 - 1 = 188%",
        "sourceUsed": "Financial Model projections + OpenView SaaS Benchmarks 2024"
      },
      "confidenceImpact": 18,
      "qualityImpact": "HIGH"
    }
  ],
  "qualityMetrics": {
    "originalScore": 52,
    "revisedScore": 84,
    "change": 32,
    "readyForBA": true
  },
  "baNotice": {
    "remainingWeaknesses": [
      "Churn rate non disponible dans le deck - benchmark sectoriel utilise (30% annuel)"
    ],
    "dataNeedsFromFounder": [
      "Confirmer le churn rate reel sur les 12 derniers mois",
      "Expliquer les drivers de croissance justifiant le CAGR de 188%"
    ],
    "confidenceLevel": "MEDIUM"
  }
}
```

---

## 6. GESTION DES COUTS ET OPTIMISATIONS

### 6.1 Problematique

Les engines de qualite peuvent etre TRES couteux en tokens:

| Scenario | Appels LLM | Tokens estimes |
|----------|------------|----------------|
| 1 contradiction, 3 rounds + arbitrage | 7 appels | ~15,000 tokens |
| 5 contradictions, 3 rounds chacune | 35 appels | ~75,000 tokens |
| 1 reflexion (critique + improve) | 2 appels | ~8,000 tokens |
| 5 agents en reflexion | 10 appels | ~40,000 tokens |

**Risque:** Une analyse complete pourrait couter 100K+ tokens juste pour les engines de qualite.

### 6.2 Strategies d'Optimisation

#### Strategie 1: Skip to Arbitration (Confiance asymetrique)

Si un agent a une confiance significativement plus haute, skip le debat:

```typescript
function shouldSkipDebate(contradiction: EnhancedContradiction): boolean {
  const [posA, posB] = contradiction.positions;
  const confidenceDiff = Math.abs(posA.confidence - posB.confidence);

  // Si difference > 35 points ET le plus confiant > 80%, skip le debat
  if (confidenceDiff > 35 && Math.max(posA.confidence, posB.confidence) > 80) {
    return true;
  }

  return false;
}

async function resolveContradiction(contradiction: EnhancedContradiction): Promise<EnhancedResolution> {
  if (shouldSkipDebate(contradiction)) {
    // Aller directement a l'arbitrage avec les positions initiales
    return await arbitrateDirectly(contradiction);
  }

  // Sinon, debat complet
  return await fullDebate(contradiction);
}
```

**Economie:** ~10,000 tokens par contradiction skippee

#### Strategie 2: Resolution Rapide (Severite faible)

Pour les contradictions MINOR, resolution sans LLM:

```typescript
function resolveMinorContradiction(contradiction: EnhancedContradiction): EnhancedResolution {
  // Prendre la position avec la meilleure confiance
  const winner = contradiction.positions.reduce((a, b) =>
    a.confidence > b.confidence ? a : b
  );

  return {
    verdict: {
      decision: winner === contradiction.positions[0] ? "POSITION_A" : "POSITION_B",
      winner: winner.agentName,
      justification: {
        decisiveFactors: [{
          factor: "Confiance superieure",
          source: `${winner.agentName}: ${winner.confidence}% vs ${otherPosition.confidence}%`,
          weight: "PRIMARY"
        }],
        rejectedPositionFlaws: []
      }
    },
    finalValue: { /* ... */ },
    baGuidance: {
      oneLiner: `Resolution automatique: ${winner.claim} (confiance superieure)`,
      canTrust: true,
      trustLevel: "MEDIUM",
      verifiableSources: []
    },
    debateRecord: {
      rounds: [],
      totalDuration: 0,
      tokensUsed: 0,
      optimizationApplied: "MINOR_AUTO_RESOLVE"
    },
    unresolvedAspects: []
  };
}
```

**Economie:** ~15,000 tokens par contradiction MINOR

#### Strategie 3: Reflexion Conditionnelle

Ne declencher la reflexion QUE si necessaire:

```typescript
interface ReflexionTriggerConfig {
  tier1ConfidenceThreshold: number;  // 70
  tier2ConfidenceThreshold: number;  // 60
  tier3Enabled: boolean;             // false - jamais de reflexion sur Tier 3
  criticalRedFlagReflexion: boolean; // true - toujours reflexion si red flag CRITICAL
}

function shouldTriggerReflexion(
  agentName: string,
  agentTier: 1 | 2 | 3,
  avgConfidence: number,
  hasCriticalRedFlag: boolean,
  config: ReflexionTriggerConfig
): boolean {
  // Jamais pour Tier 3 (synthese)
  if (agentTier === 3) return false;

  // Toujours si red flag critique non source
  if (hasCriticalRedFlag) return true;

  // Sinon, selon seuil de confiance
  const threshold = agentTier === 1
    ? config.tier1ConfidenceThreshold
    : config.tier2ConfidenceThreshold;

  return avgConfidence < threshold;
}
```

#### Strategie 4: Batch Reflexion

Traiter plusieurs agents en une seule critique:

```typescript
// Au lieu de 5 appels separes, 1 seul appel avec tous les agents
async function batchCritique(
  agents: { name: string; output: unknown; findings: ScoredFinding[] }[]
): Promise<Map<string, EnhancedCritique[]>> {

  const prompt = buildBatchCritiquePrompt(agents);
  const result = await complete(prompt, { complexity: "complex" });

  return parseBatchCritiqueResult(result);
}
```

**Economie:** ~50% sur les couts de reflexion

### 6.3 Configuration Recommandee

```typescript
// src/agents/orchestration/quality-config.ts

export const QUALITY_ENGINE_CONFIG = {
  // Consensus Engine
  consensus: {
    maxDebateRounds: 3,
    skipDebateConfidenceDiff: 35,      // Skip si diff > 35 points
    skipDebateMinConfidence: 80,        // Et si le plus confiant > 80%
    autoResolveMinorContradictions: true,
    minorContradictionThreshold: "MINOR",
  },

  // Reflexion Engine
  reflexion: {
    tier1ConfidenceThreshold: 70,
    tier2ConfidenceThreshold: 60,
    tier3Enabled: false,
    criticalRedFlagAlwaysReflect: true,
    batchReflexionEnabled: true,
    maxReflexionIterations: 2,
  },

  // Limites globales
  limits: {
    maxContradictionsToResolve: 10,     // Au-dela, prendre les plus severes
    maxAgentsToReflect: 8,              // Au-dela, prendre les moins confiants
    tokenBudget: 100000,                // Budget max pour les engines
  }
};
```

### 6.4 Estimation des Couts

```typescript
function estimateEngineCosts(
  contradictions: EnhancedContradiction[],
  agentsNeedingReflexion: string[]
): { tokens: number; usd: number } {

  let totalTokens = 0;

  // Consensus Engine
  for (const c of contradictions) {
    if (c.severity.level === "MINOR") {
      totalTokens += 0; // Auto-resolve, pas de LLM
    } else if (shouldSkipDebate(c)) {
      totalTokens += 5000; // Arbitrage direct
    } else {
      totalTokens += 15000; // Debat complet
    }
  }

  // Reflexion Engine
  totalTokens += agentsNeedingReflexion.length * 8000;

  // Cout Gemini Flash (0.075$ / 1M tokens input, 0.30$ / 1M output)
  // Estimation 60% input, 40% output
  const inputTokens = totalTokens * 0.6;
  const outputTokens = totalTokens * 0.4;
  const usd = (inputTokens * 0.000075) + (outputTokens * 0.0003);

  return { tokens: totalTokens, usd };
}
```

### 6.5 Metriques a Logger

```typescript
interface EngineMetrics {
  // Consensus
  contradictionsDetected: number;
  contradictionsResolved: number;
  debatesSkipped: number;
  autoResolved: number;
  averageDebateRounds: number;

  // Reflexion
  agentsReflected: number;
  totalCritiques: number;
  totalImprovements: number;
  averageConfidenceGain: number;

  // Couts
  totalTokensUsed: number;
  estimatedCostUSD: number;

  // Performance
  totalDurationMs: number;
}
```

---

## 7. INTEGRATION AVEC L'ORCHESTRATEUR

### 7.1 Flux d'Execution Complet

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FLUX D'ANALYSE COMPLET                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. TIER 1 AGENTS (parallele)                                           │
│     └─> Chaque agent produit findings                                   │
│                                                                         │
│  2. REFLEXION ENGINE (conditionnel)                                     │
│     ├─> Pour chaque agent Tier 1 avec confiance < 70%                  │
│     ├─> Critique + Improve                                              │
│     └─> Output: findings revises                                        │
│                                                                         │
│  3. CONSENSUS ENGINE - Phase 1                                          │
│     ├─> Detecter contradictions entre agents Tier 1                    │
│     ├─> Resoudre contradictions CRITICAL et MAJOR                      │
│     └─> Output: findings consolides                                     │
│                                                                         │
│  4. TIER 2 AGENTS (expert sectoriel)                                    │
│     └─> Un seul agent selon le secteur                                  │
│                                                                         │
│  5. REFLEXION ENGINE (conditionnel)                                     │
│     └─> Si confiance Tier 2 < 60%                                       │
│                                                                         │
│  6. CONSENSUS ENGINE - Phase 2                                          │
│     └─> Contradictions entre Tier 1 consolide et Tier 2                │
│                                                                         │
│  7. TIER 3 AGENTS (synthese)                                            │
│     ├─> contradiction-detector (deja fait par Consensus Engine)        │
│     ├─> synthesis-deal-scorer                                           │
│     ├─> devils-advocate                                                 │
│     ├─> scenario-modeler                                                │
│     └─> memo-generator                                                  │
│                                                                         │
│  8. OUTPUT FINAL                                                        │
│     └─> Memo + Score + Red flags + Questions                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Code d'Integration - Orchestrateur

```typescript
// src/agents/orchestrator/quality-integration.ts

import { ConsensusEngine, EnhancedContradiction, EnhancedResolution } from "../orchestration/consensus-engine";
import { ReflexionEngine, EnhancedReflexionOutput } from "../orchestration/reflexion";
import { QUALITY_ENGINE_CONFIG } from "../orchestration/quality-config";
import type { ScoredFinding } from "@/scoring/types";
import type { AnalysisAgentResult } from "../types";

export interface QualityProcessingResult {
  // Findings apres traitement qualite
  processedFindings: ScoredFinding[];

  // Resolutions de contradictions
  contradictions: {
    detected: EnhancedContradiction[];
    resolved: EnhancedResolution[];
    unresolved: EnhancedContradiction[];
  };

  // Reflexions effectuees
  reflexions: Map<string, EnhancedReflexionOutput>;

  // Metriques
  metrics: EngineMetrics;
}

export class QualityProcessor {
  private consensusEngine: ConsensusEngine;
  private reflexionEngine: ReflexionEngine;
  private config = QUALITY_ENGINE_CONFIG;

  constructor() {
    this.consensusEngine = new ConsensusEngine();
    this.reflexionEngine = new ReflexionEngine();
  }

  /**
   * Process all Tier 1 agent outputs through quality engines
   */
  async processTier1Outputs(
    agentOutputs: Map<string, { result: AnalysisAgentResult; findings: ScoredFinding[] }>,
    verificationContext: VerificationContext
  ): Promise<QualityProcessingResult> {
    const metrics: Partial<EngineMetrics> = {
      totalTokensUsed: 0,
      totalDurationMs: 0,
    };
    const startTime = Date.now();

    // ========================================
    // PHASE 1: REFLEXION (si necessaire)
    // ========================================

    const reflexions = new Map<string, EnhancedReflexionOutput>();
    const processedOutputs = new Map<string, { result: AnalysisAgentResult; findings: ScoredFinding[] }>();

    for (const [agentName, { result, findings }] of agentOutputs) {
      const avgConfidence = this.calculateAvgConfidence(findings);
      const hasCriticalRedFlag = this.hasCriticalUnverifiedRedFlag(findings);

      if (this.shouldTriggerReflexion(agentName, 1, avgConfidence, hasCriticalRedFlag)) {
        console.log(`[Quality] Reflexion triggered for ${agentName} (confidence: ${avgConfidence}%)`);

        const reflexionResult = await this.reflexionEngine.reflect({
          agentName,
          output: result,
          findings,
          verificationContext,
        });

        reflexions.set(agentName, reflexionResult);
        metrics.totalTokensUsed! += reflexionResult.tokensUsed;

        // Utiliser les findings revises
        processedOutputs.set(agentName, {
          result: reflexionResult.revisedOutput as AnalysisAgentResult,
          findings: reflexionResult.revisedFindings,
        });
      } else {
        processedOutputs.set(agentName, { result, findings });
      }
    }

    // ========================================
    // PHASE 2: CONSENSUS (detection)
    // ========================================

    // Collecter tous les findings
    const allFindings: ScoredFinding[] = [];
    for (const { findings } of processedOutputs.values()) {
      allFindings.push(...findings);
    }

    // Detecter les contradictions
    const detectedContradictions = await this.consensusEngine.detectContradictions(allFindings);
    console.log(`[Quality] ${detectedContradictions.length} contradictions detected`);

    // ========================================
    // PHASE 3: CONSENSUS (resolution)
    // ========================================

    const resolved: EnhancedResolution[] = [];
    const unresolved: EnhancedContradiction[] = [];

    // Trier par severite (CRITICAL d'abord)
    const sortedContradictions = [...detectedContradictions].sort((a, b) => {
      const severityOrder = { CRITICAL: 0, MAJOR: 1, MODERATE: 2, MINOR: 3 };
      return severityOrder[a.severity.level] - severityOrder[b.severity.level];
    });

    // Limiter au budget
    const toResolve = sortedContradictions.slice(0, this.config.limits.maxContradictionsToResolve);

    for (const contradiction of toResolve) {
      // Auto-resolve MINOR
      if (contradiction.severity.level === "MINOR" && this.config.consensus.autoResolveMinorContradictions) {
        const resolution = this.autoResolveMinor(contradiction);
        resolved.push(resolution);
        continue;
      }

      // Resoudre CRITICAL et MAJOR
      if (contradiction.severity.level === "CRITICAL" || contradiction.severity.level === "MAJOR") {
        const resolution = await this.consensusEngine.resolve(contradiction, verificationContext);
        resolved.push(resolution);
        metrics.totalTokensUsed! += resolution.debateRecord.tokensUsed;

        // Appliquer la resolution aux findings
        this.applyResolution(allFindings, resolution);
      } else {
        // MODERATE: resoudre si confiance faible des deux cotes
        const bothLowConfidence = contradiction.positions.every(p => p.confidence < 70);
        if (bothLowConfidence) {
          const resolution = await this.consensusEngine.resolve(contradiction, verificationContext);
          resolved.push(resolution);
          metrics.totalTokensUsed! += resolution.debateRecord.tokensUsed;
          this.applyResolution(allFindings, resolution);
        } else {
          unresolved.push(contradiction);
        }
      }
    }

    // ========================================
    // FINALISATION
    // ========================================

    metrics.totalDurationMs = Date.now() - startTime;
    metrics.contradictionsDetected = detectedContradictions.length;
    metrics.contradictionsResolved = resolved.length;
    metrics.agentsReflected = reflexions.size;

    return {
      processedFindings: allFindings,
      contradictions: {
        detected: detectedContradictions,
        resolved,
        unresolved,
      },
      reflexions,
      metrics: metrics as EngineMetrics,
    };
  }

  // ... helper methods
  private calculateAvgConfidence(findings: ScoredFinding[]): number {
    if (findings.length === 0) return 0;
    return findings.reduce((sum, f) => sum + f.confidence.score, 0) / findings.length;
  }

  private hasCriticalUnverifiedRedFlag(findings: ScoredFinding[]): boolean {
    return findings.some(f =>
      f.assessment === "suspicious" &&
      f.confidence.score < 60 &&
      f.evidence.length === 0
    );
  }

  private shouldTriggerReflexion(
    agentName: string,
    tier: 1 | 2 | 3,
    avgConfidence: number,
    hasCriticalRedFlag: boolean
  ): boolean {
    if (tier === 3) return false;
    if (hasCriticalRedFlag) return true;

    const threshold = tier === 1
      ? this.config.reflexion.tier1ConfidenceThreshold
      : this.config.reflexion.tier2ConfidenceThreshold;

    return avgConfidence < threshold;
  }

  private autoResolveMinor(contradiction: EnhancedContradiction): EnhancedResolution {
    const winner = contradiction.positions.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );
    const loser = contradiction.positions.find(p => p !== winner)!;

    return {
      contradictionId: contradiction.id,
      resolvedAt: new Date(),
      verdict: {
        decision: winner === contradiction.positions[0] ? "POSITION_A" : "POSITION_B",
        winner: winner.agentName,
        justification: {
          decisiveFactors: [{
            factor: "Confiance superieure (resolution automatique MINOR)",
            source: `${winner.agentName}: ${winner.confidence}% vs ${loser.agentName}: ${loser.confidence}%`,
            weight: "PRIMARY",
          }],
          rejectedPositionFlaws: [],
        },
      },
      finalValue: {
        value: winner.value,
        unit: winner.unit,
        confidence: winner.confidence,
        derivedFrom: {
          source: "Resolution automatique basee sur confiance",
        },
      },
      baGuidance: {
        oneLiner: `${contradiction.topic}: ${winner.claim} (resolution auto, ecart mineur)`,
        canTrust: true,
        trustLevel: "MEDIUM",
        verifiableSources: winner.sources.map(s => ({
          source: s.type,
          reference: s.reference,
          whatItProves: s.quote || "Valeur citee",
        })),
      },
      debateRecord: {
        rounds: [],
        totalDuration: 0,
        tokensUsed: 0,
        optimizationApplied: "MINOR_AUTO_RESOLVE",
      },
      unresolvedAspects: [],
    };
  }

  private applyResolution(findings: ScoredFinding[], resolution: EnhancedResolution): void {
    // Marquer les findings concernes comme resolus
    // et mettre a jour les valeurs si necessaire
    // Implementation selon la structure de vos findings
  }
}
```

### 7.3 Type VerificationContext

```typescript
// src/agents/orchestration/verification-context.ts

export interface VerificationContext {
  // Documents originaux (texte extrait)
  deckExtracts?: string;           // Slides pertinentes du deck
  financialModelExtracts?: string; // Onglets pertinents du FM

  // Context Engine (donnees externes)
  contextEngineData?: {
    crunchbase?: {
      companyInfo?: unknown;
      fundingHistory?: unknown;
      founders?: unknown;
    };
    dealroom?: {
      valuation?: unknown;
      competitors?: unknown;
    };
    linkedIn?: {
      founderProfiles?: unknown;
      companySize?: unknown;
    };
  };

  // Funding Database (benchmarks)
  fundingDbData?: {
    comparables?: {
      dealId: string;
      stage: string;
      sector: string;
      arrMultiple: number;
      valuation: number;
    }[];
    benchmarks?: {
      metric: string;
      p25: number;
      median: number;
      p75: number;
      sampleSize: number;
    }[];
  };
}

/**
 * Build verification context from analysis data
 */
export async function buildVerificationContext(
  analysisId: string,
  dealId: string
): Promise<VerificationContext> {
  // Fetch relevant data from various sources
  const [deckContent, fmContent, ceData, dbData] = await Promise.all([
    fetchDeckExtracts(dealId),
    fetchFinancialModelExtracts(dealId),
    fetchContextEngineData(dealId),
    fetchFundingDbBenchmarks(dealId),
  ]);

  return {
    deckExtracts: deckContent,
    financialModelExtracts: fmContent,
    contextEngineData: ceData,
    fundingDbData: dbData,
  };
}
```

---

## 8. SCHEMAS ZOD ET VALIDATION

### 8.1 Pourquoi Zod est Obligatoire

Les LLMs peuvent retourner:
- JSON malformé (parenthèses manquantes, virgules en trop)
- Champs manquants (le LLM "oublie" un champ obligatoire)
- Types incorrects (string au lieu de number)
- Valeurs hors range (confidence: 150)

**Solution:** Valider CHAQUE output LLM avec Zod, avec retry si invalide.

### 8.2 Schemas Consensus Engine

```typescript
// src/agents/orchestration/schemas/consensus-schemas.ts

import { z } from "zod";

// ============================================================================
// DEBATER RESPONSE
// ============================================================================

export const DebateEvidenceSchema = z.object({
  source: z.string().min(1, "Source obligatoire"),
  quote: z.string().min(1, "Quote obligatoire"),
  interpretation: z.string().min(1, "Interpretation obligatoire"),
});

export const DebateCalculationSchema = z.object({
  formula: z.string(),
  steps: z.array(z.string()).min(1),
  result: z.string(),
}).optional();

export const DebaterResponseSchema = z.object({
  position: z.object({
    claim: z.string().min(1),
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().optional(),
  }),
  evidence: z.array(DebateEvidenceSchema).min(1, "Au moins une preuve requise"),
  calculation: DebateCalculationSchema,
  weaknesses: z.array(z.string()),
  confidenceLevel: z.number().min(0).max(100),
  confidenceJustification: z.string().min(1),
});

export type DebaterResponse = z.infer<typeof DebaterResponseSchema>;

// ============================================================================
// ARBITRATOR RESPONSE
// ============================================================================

export const DecisiveFactorSchema = z.object({
  factor: z.string().min(1),
  source: z.string().min(1),
  weight: z.enum(["PRIMARY", "SUPPORTING"]),
});

export const RejectedFlawSchema = z.object({
  position: z.string().min(1),
  flaw: z.string().min(1),
  evidence: z.string().min(1),
});

export const VerifiableSourceSchema = z.object({
  source: z.string().min(1),
  reference: z.string().min(1),
  whatItProves: z.string().min(1),
});

export const ArbitratorResponseSchema = z.object({
  verdict: z.object({
    decision: z.enum(["POSITION_A", "POSITION_B", "SYNTHESIS", "UNRESOLVED"]),
    winner: z.string().nullable(),
    justification: z.object({
      decisiveFactors: z.array(DecisiveFactorSchema),
      rejectedPositionFlaws: z.array(RejectedFlawSchema),
    }),
  }),
  finalValue: z.object({
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().optional(),
    confidence: z.number().min(0).max(100),
    range: z.object({
      min: z.union([z.number(), z.string(), z.null()]),
      max: z.union([z.number(), z.string(), z.null()]),
    }).optional(),
    derivedFrom: z.object({
      source: z.string().min(1),
      calculation: z.string().optional(),
    }),
  }),
  baGuidance: z.object({
    oneLiner: z.string().min(1).max(200),
    canTrust: z.boolean(),
    trustLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
    whatToVerify: z.string().nullable(),
    questionForFounder: z.string().nullable(),
    verifiableSources: z.array(VerifiableSourceSchema),
  }),
  unresolvedAspects: z.array(z.object({
    aspect: z.string().min(1),
    reason: z.string().min(1),
    suggestedAction: z.string().min(1),
  })),
});

export type ArbitratorResponse = z.infer<typeof ArbitratorResponseSchema>;

// ============================================================================
// QUICK RESOLUTION
// ============================================================================

export const QuickResolutionSchema = z.object({
  winner: z.enum(["A", "B", "UNRESOLVED"]),
  reason: z.string().min(1),
  finalValue: z.object({
    value: z.union([z.number(), z.string(), z.null()]),
    source: z.string().min(1),
  }),
  baOneLiner: z.string().min(1).max(150),
});

export type QuickResolution = z.infer<typeof QuickResolutionSchema>;
```

### 8.3 Schemas Reflexion Engine

```typescript
// src/agents/orchestration/schemas/reflexion-schemas.ts

import { z } from "zod";

// ============================================================================
// CRITIQUE RESPONSE
// ============================================================================

export const SuggestedFixSchema = z.object({
  action: z.string().min(1),
  source: z.string().optional(),
  example: z.string().optional(),
  estimatedEffort: z.enum(["TRIVIAL", "EASY", "MODERATE", "SIGNIFICANT"]),
});

export const CritiqueSchema = z.object({
  id: z.string().regex(/^CRT-\d{3}$/, "Format: CRT-001"),
  type: z.enum([
    "unsourced_claim",
    "unverifiable_calculation",
    "incomplete_red_flag",
    "missing_data_not_flagged",
    "missing_cross_reference",
    "weak_conclusion",
    "methodological_flaw",
    "inconsistency",
  ]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
  location: z.object({
    section: z.string().min(1),
    quote: z.string().min(1),
  }),
  issue: z.string().min(10, "Issue trop vague"),
  standard: z.string().min(1),
  expectedBehavior: z.string().min(1),
  suggestedFix: SuggestedFixSchema,
  impactOnBA: z.string().min(1),
});

export const MissingCrossReferenceSchema = z.object({
  source: z.string().min(1),
  dataType: z.string().min(1),
  potentialValue: z.string().min(1),
});

export const CriticResponseSchema = z.object({
  critiques: z.array(CritiqueSchema),
  missingCrossReferences: z.array(MissingCrossReferenceSchema),
  overallAssessment: z.object({
    qualityScore: z.number().min(0).max(100),
    verdict: z.enum(["ACCEPTABLE", "NEEDS_REVISION", "MAJOR_REVISION_REQUIRED"]),
    keyWeaknesses: z.array(z.string()).max(5),
    readyForBA: z.boolean(),
  }),
});

export type CriticResponse = z.infer<typeof CriticResponseSchema>;

// ============================================================================
// IMPROVEMENT RESPONSE
// ============================================================================

export const ChangeSchema = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
  type: z.enum([
    "added_source",
    "added_calculation",
    "completed_red_flag",
    "added_cross_reference",
    "clarified",
    "removed",
    "downgraded",
  ]),
});

export const CorrectionSchema = z.object({
  critiqueId: z.string().regex(/^CRT-\d{3}$/),
  status: z.enum(["FIXED", "PARTIALLY_FIXED", "CANNOT_FIX"]),
  change: ChangeSchema,
  justification: z.object({
    sourceUsed: z.string().optional(),
    calculationShown: z.string().optional(),
    crossReferenceResult: z.string().optional(),
    ifCannotFix: z.string().optional(),
  }),
  confidenceImpact: z.number().min(-50).max(50),
  qualityImpact: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export const ImproverResponseSchema = z.object({
  corrections: z.array(CorrectionSchema),
  revisedOutput: z.unknown(), // Le schema de l'output de l'agent
  qualityMetrics: z.object({
    originalScore: z.number().min(0).max(100),
    revisedScore: z.number().min(0).max(100),
    change: z.number(),
    readyForBA: z.boolean(),
  }),
  baNotice: z.object({
    remainingWeaknesses: z.array(z.string()),
    dataNeedsFromFounder: z.array(z.string()),
    confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  }),
});

export type ImproverResponse = z.infer<typeof ImproverResponseSchema>;
```

### 8.4 Fonction de Validation avec Retry

```typescript
// src/agents/orchestration/utils/llm-validation.ts

import { z } from "zod";
import { complete } from "@/services/openrouter/router";

interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
}

/**
 * Call LLM and validate response with Zod schema
 * Retries up to maxRetries if validation fails
 */
export async function completAndValidate<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  options: {
    maxRetries?: number;
    complexity?: "simple" | "medium" | "complex";
    temperature?: number;
  } = {}
): Promise<ValidationResult<T>> {
  const { maxRetries = 2, complexity = "medium", temperature = 0.1 } = options;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Call LLM
      const response = await complete(
        `${systemPrompt}\n\n${userPrompt}`,
        { complexity, temperature }
      );

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = "No JSON found in response";
        continue;
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        lastError = `JSON parse error: ${e}`;
        continue;
      }

      // Validate with Zod
      const result = schema.safeParse(parsed);
      if (result.success) {
        return {
          success: true,
          data: result.data,
          retries: attempt,
        };
      } else {
        lastError = `Validation error: ${result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`;

        // If we have retries left, add error context to prompt
        if (attempt < maxRetries) {
          userPrompt += `\n\n---\nPREVIOUS RESPONSE HAD VALIDATION ERRORS:\n${lastError}\n\nPlease fix these issues and respond again with valid JSON.`;
        }
      }
    } catch (e) {
      lastError = `LLM call error: ${e}`;
    }
  }

  return {
    success: false,
    error: lastError,
    retries: maxRetries,
  };
}
```

---

## 9. TESTS ET CHECKLIST DE VALIDATION

### 9.1 Tests Unitaires - Consensus Engine

```typescript
// src/agents/orchestration/__tests__/consensus-engine.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { ConsensusEngine } from "../consensus-engine";
import { ArbitratorResponseSchema } from "../schemas/consensus-schemas";

describe("ConsensusEngine", () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = new ConsensusEngine();
  });

  describe("detectContradictions", () => {
    it("should detect numeric contradictions > 30%", async () => {
      const findings = [
        createFinding("agent-a", "ARR", 500000, 80),
        createFinding("agent-b", "ARR", 800000, 75),
      ];

      const contradictions = await engine.detectContradictions(findings);

      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].contradictionType).toBe("numeric_value");
      expect(contradictions[0].severity.level).toBe("MAJOR"); // High confidence + large diff
    });

    it("should NOT detect contradictions < 30%", async () => {
      const findings = [
        createFinding("agent-a", "ARR", 500000, 80),
        createFinding("agent-b", "ARR", 520000, 75), // Only 4% diff
      ];

      const contradictions = await engine.detectContradictions(findings);

      expect(contradictions).toHaveLength(0);
    });

    it("should detect assessment contradictions", async () => {
      const findings = [
        createFinding("agent-a", "team_quality", null, 85, "exceptional"),
        createFinding("agent-b", "team_quality", null, 70, "below_average"),
      ];

      const contradictions = await engine.detectContradictions(findings);

      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].contradictionType).toBe("assessment");
    });
  });

  describe("resolve", () => {
    it("should auto-resolve MINOR contradictions", async () => {
      const contradiction = createContradiction("MINOR", 80, 60);

      const resolution = await engine.resolve(contradiction, {});

      expect(resolution.debateRecord.optimizationApplied).toBe("MINOR_AUTO_RESOLVE");
      expect(resolution.debateRecord.tokensUsed).toBe(0);
      expect(resolution.verdict.winner).toBe("agent-a"); // Higher confidence
    });

    it("should produce valid arbitrator response", async () => {
      const contradiction = createContradiction("MAJOR", 75, 70);

      const resolution = await engine.resolve(contradiction, mockVerificationContext);

      // Validate response matches schema
      const validation = ArbitratorResponseSchema.safeParse({
        verdict: resolution.verdict,
        finalValue: resolution.finalValue,
        baGuidance: resolution.baGuidance,
        unresolvedAspects: resolution.unresolvedAspects,
      });

      expect(validation.success).toBe(true);
    });

    it("should include verifiable sources in baGuidance", async () => {
      const contradiction = createContradiction("CRITICAL", 85, 80);

      const resolution = await engine.resolve(contradiction, mockVerificationContext);

      expect(resolution.baGuidance.verifiableSources.length).toBeGreaterThan(0);
      expect(resolution.baGuidance.verifiableSources[0]).toHaveProperty("source");
      expect(resolution.baGuidance.verifiableSources[0]).toHaveProperty("reference");
    });
  });
});
```

### 9.2 Tests Unitaires - Reflexion Engine

```typescript
// src/agents/orchestration/__tests__/reflexion-engine.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { ReflexionEngine } from "../reflexion";
import { CriticResponseSchema, ImproverResponseSchema } from "../schemas/reflexion-schemas";

describe("ReflexionEngine", () => {
  let engine: ReflexionEngine;

  beforeEach(() => {
    engine = new ReflexionEngine();
  });

  describe("reflect", () => {
    it("should produce critiques with required fields", async () => {
      const result = await engine.reflect(mockReflexionInput);

      for (const critique of result.critiques) {
        expect(critique.id).toMatch(/^CRT-\d{3}$/);
        expect(critique.location.quote).toBeTruthy();
        expect(critique.suggestedFix.action).toBeTruthy();
        expect(critique.impactOnBA).toBeTruthy();
      }
    });

    it("should produce improvements with before/after", async () => {
      const result = await engine.reflect(mockReflexionInput);

      for (const improvement of result.improvements) {
        expect(improvement.change.before).not.toBe(improvement.change.after);
        expect(improvement.critiqueId).toMatch(/^CRT-\d{3}$/);
      }
    });

    it("should improve confidence score", async () => {
      const result = await engine.reflect(mockReflexionInput);

      expect(result.qualityMetrics.revisedScore).toBeGreaterThanOrEqual(
        result.qualityMetrics.originalScore
      );
    });

    it("should validate against Zod schemas", async () => {
      const result = await engine.reflect(mockReflexionInput);

      // Critiques should match schema
      for (const critique of result.critiques) {
        const validation = CritiqueSchema.safeParse(critique);
        expect(validation.success).toBe(true);
      }
    });
  });

  describe("needsReflexion", () => {
    it("should return true for Tier 1 agent with confidence < 70%", () => {
      const findings = [createFinding("agent-a", "metric", 100, 65)];

      expect(engine.needsReflexion(1, findings)).toBe(true);
    });

    it("should return false for Tier 1 agent with confidence >= 70%", () => {
      const findings = [createFinding("agent-a", "metric", 100, 75)];

      expect(engine.needsReflexion(1, findings)).toBe(false);
    });

    it("should return true for Tier 2 agent with confidence < 60%", () => {
      const findings = [createFinding("agent-a", "metric", 100, 55)];

      expect(engine.needsReflexion(2, findings)).toBe(true);
    });

    it("should always return false for Tier 3 agents", () => {
      const findings = [createFinding("agent-a", "metric", 100, 30)];

      expect(engine.needsReflexion(3, findings)).toBe(false);
    });
  });
});
```

### 9.3 Checklist de Validation - Consensus Engine

```markdown
## CHECKLIST - Consensus Engine Implementation

### Detection
- [ ] Detecte contradictions numeriques > 30% d'ecart
- [ ] Detecte contradictions d'assessment (exceptional vs poor)
- [ ] Calcule severite correctement (CRITICAL si haute confiance + grand ecart)
- [ ] Identifie les sources primaires pour chaque position

### Debat
- [ ] System prompt demande des PREUVES pas de la rhetorique
- [ ] Chaque position cite des sources exactes (Slide X, Ligne Y)
- [ ] Les faiblesses sont admises dans la reponse
- [ ] Format JSON respecte le schema Zod

### Arbitrage
- [ ] L'arbitre verifie les sources citees contre les donnees fournies
- [ ] L'arbitre cross-reference avec deck/CE/DB si disponible
- [ ] La decision explique POURQUOI l'autre position est rejetee
- [ ] Si 50/50 → verdict UNRESOLVED avec question fondateur

### Resolution
- [ ] finalValue a une source explicite
- [ ] baGuidance.oneLiner est clair (< 200 caracteres)
- [ ] baGuidance.verifiableSources liste les references exactes
- [ ] unresolvedAspects liste ce qui reste flou

### Optimisations
- [ ] MINOR contradictions auto-resolues sans LLM
- [ ] Skip debate si confiance asymetrique (diff > 35 points)
- [ ] tokensUsed tracke pour chaque resolution

### Output
- [ ] Aucune resolution sans au moins une preuve primaire
- [ ] Aucun verdict base uniquement sur "qui a concede"
- [ ] Tous les champs de EnhancedResolution sont presents
- [ ] Le BA peut verifier la decision avec les sources citees
```

### 9.4 Checklist de Validation - Reflexion Engine

```markdown
## CHECKLIST - Reflexion Engine Implementation

### Critique
- [ ] Chaque critique cite le passage EXACT problematique
- [ ] Chaque critique a un type specifique (pas "general")
- [ ] Chaque critique reference un standard (Big4, benchmark, etc.)
- [ ] Chaque critique propose une action concrete
- [ ] Les critiques sont priorisees par severite (CRITICAL > HIGH > MEDIUM)
- [ ] Format d'ID respecte: CRT-001, CRT-002, etc.

### Cross-reference
- [ ] Verifie si Context Engine avait des donnees utilisables
- [ ] Verifie si Funding DB avait des benchmarks
- [ ] Signale les opportunites manquees dans missingCrossReferences

### Improvement
- [ ] Chaque correction montre AVANT et APRES
- [ ] Chaque correction cite sa source
- [ ] Les corrections CANNOT_FIX expliquent pourquoi
- [ ] Le revisedOutput est COMPLET (pas juste les diffs)

### Metriques
- [ ] originalScore calcule correctement
- [ ] revisedScore >= originalScore (sauf si CANNOT_FIX)
- [ ] readyForBA = true seulement si qualite suffisante (>= 70)

### Output
- [ ] baNotice.remainingWeaknesses liste les faiblesses restantes
- [ ] baNotice.dataNeedsFromFounder liste les questions
- [ ] Le BA sait EXACTEMENT ce qui a ete ameliore
- [ ] tokensUsed tracke pour la reflexion
```

---

## 10. FICHIERS A CREER/MODIFIER

### 10.1 Fichiers a Creer

```
src/agents/orchestration/
├── consensus-types.ts              # Types du Consensus Engine (Section 4.1)
├── reflexion-types.ts              # Types du Reflexion Engine (Section 5.1)
├── quality-config.ts               # Configuration des engines (Section 6.3)
├── verification-context.ts         # Type et builder VerificationContext (Section 7.3)
├── quality-integration.ts          # QualityProcessor (Section 7.2)
├── schemas/
│   ├── consensus-schemas.ts        # Schemas Zod Consensus (Section 8.2)
│   └── reflexion-schemas.ts        # Schemas Zod Reflexion (Section 8.3)
├── utils/
│   └── llm-validation.ts           # completAndValidate helper (Section 8.4)
├── prompts/
│   ├── debater-prompts.ts          # Prompts debater (Sections 4.2, 4.3)
│   ├── arbitrator-prompts.ts       # Prompts arbitrator (Sections 4.4, 4.5)
│   ├── critic-prompts.ts           # Prompts critic (Sections 5.2, 5.3)
│   └── improver-prompts.ts         # Prompts improver (Sections 5.4, 5.5)
└── __tests__/
    ├── consensus-engine.test.ts    # Tests Consensus (Section 9.1)
    └── reflexion-engine.test.ts    # Tests Reflexion (Section 9.2)
```

### 10.2 Fichiers a Modifier

```
src/agents/orchestration/
├── consensus-engine.ts             # REFONTE COMPLETE selon Section 4
├── reflexion.ts                    # REFONTE COMPLETE selon Section 5
├── index.ts                        # Ajouter exports des nouveaux fichiers
└── message-types.ts                # Peut-etre ajouter types pour BA guidance
```

### 10.3 Ordre d'Implementation Recommande

```
PHASE 1 - Types et Schemas (1-2h)
─────────────────────────────────
1. Creer consensus-types.ts
2. Creer reflexion-types.ts
3. Creer schemas/consensus-schemas.ts
4. Creer schemas/reflexion-schemas.ts
5. Creer utils/llm-validation.ts

PHASE 2 - Prompts (1-2h)
─────────────────────────
6. Creer prompts/debater-prompts.ts
7. Creer prompts/arbitrator-prompts.ts
8. Creer prompts/critic-prompts.ts
9. Creer prompts/improver-prompts.ts

PHASE 3 - Engines (2-3h)
────────────────────────
10. Refondre consensus-engine.ts
11. Refondre reflexion.ts
12. Creer quality-config.ts

PHASE 4 - Integration (1-2h)
────────────────────────────
13. Creer verification-context.ts
14. Creer quality-integration.ts
15. Mettre a jour index.ts

PHASE 5 - Tests (1-2h)
──────────────────────
16. Creer __tests__/consensus-engine.test.ts
17. Creer __tests__/reflexion-engine.test.ts
18. Run tests et fix issues
```

### 10.4 Dependances a Installer

```bash
# Si pas deja installe
npm install zod
```

---

## FIN DU DOCUMENT

**Version:** 2.0 - Document ultime et actionnable
**Derniere mise a jour:** 2026-01-28
**Auteur:** Refonte complete pour implementation par agent

### Resume des Ajouts vs Version 1.0

| Section | Ajout |
|---------|-------|
| Standards | Seuils justifies, matrice de declenchement |
| Consensus | Types complets, prompts system+user, exemples JSON |
| Reflexion | Types complets, prompts system+user, exemples JSON |
| **NOUVEAU** | Gestion des couts et optimisations |
| **NOUVEAU** | Integration orchestrateur (code complet) |
| **NOUVEAU** | Schemas Zod avec validation |
| **NOUVEAU** | Tests unitaires |
| **NOUVEAU** | Liste fichiers a creer avec ordre |

Ce document est maintenant **100% actionnable**. Un agent peut l'utiliser directement pour implementer les deux engines sans ambiguite.

