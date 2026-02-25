# Live Coaching — Spécification Complète

> **Statut** : Spécification validée (2026-02-24)
> **Auteur** : Discussion produit/tech — spec exhaustive
> **Objectif** : Permettre aux BA d'être coachés en temps réel pendant leurs calls avec les fondateurs, grâce à l'analyse IA existante d'AngelDesk.

---

## Table des matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Architecture globale](#2-architecture-globale)
3. [Pipeline détaillé (3 phases)](#3-pipeline-détaillé)
4. [UI/UX — Interface coaching](#4-uiux--interface-coaching)
5. [Stack technique (nouveaux composants)](#5-stack-technique-nouveaux-composants)
6. [Schéma base de données](#6-schéma-base-de-données)
7. [Structure des fichiers](#7-structure-des-fichiers)
8. [Routes API](#8-routes-api)
9. [Intégration avec AngelDesk existant](#9-intégration-avec-angeldesk-existant)
10. [Coûts détaillés](#10-coûts-détaillés)
11. [Sécurité](#11-sécurité)
12. [Gestion d'erreurs](#12-gestion-derreurs)
13. [Testing](#13-testing)
14. [Limites & contraintes](#14-limites--contraintes)
15. [Phases d'implémentation](#15-phases-dimplémentation)

---

## 1. Vision & Positionnement

### Le problème

Les Business Angels font des calls (Zoom, Google Meet, Microsoft Teams) avec les fondateurs des startups dans lesquelles ils envisagent d'investir. Pendant ces calls, ils sont seuls — pas d'analyste à côté pour leur souffler les bonnes questions, détecter les contradictions, ou identifier les points de négociation.

### La solution

AngelDesk a déjà fait le travail d'analyse (40 agents, 3 tiers, benchmarks, red flags, questions). Le Live Coaching utilise toute cette intelligence pour coacher le BA **en temps réel** pendant le call :

- **Suggestions contextuelles** : questions à poser basées sur ce que le fondateur dit, croisé avec l'analyse existante
- **Détection de contradictions** : le fondateur dit X, mais le deck/l'analyse dit Y
- **Nouvelles informations** : faits révélés pendant le call qui n'étaient pas dans les documents
- **Post-call intelligence** : résumé structuré, delta par rapport à l'analyse existante, questions restantes

### Le différenciateur

Ce n'est PAS un Otter.ai ou Fireflies (transcription + résumé générique). AngelDesk **comprend le deal** — il a analysé le deck, les financials, le marché, l'équipe, les concurrents. Le coaching est **contextuel et spécifique** à chaque deal.

### Positionnement produit (rappel règle N°1)

Le Live Coaching suit la même règle que tout AngelDesk : **on analyse et guide, on ne décide jamais**. Les suggestions sont analytiques ("L'analyse montre un écart de 67% sur le MRR") pas prescriptives ("Ne faites pas confiance au fondateur").

---

## 2. Architecture globale

### Principe : server-side + webapp responsive

L'architecture est **device-agnostic**. Le BA peut être sur desktop, iPad (split screen), ou téléphone (PiP). La capture audio se fait côté serveur (bot qui rejoint le meeting), le coaching s'affiche dans une webapp responsive.

```
┌──────────────────────────────────────────────────────┐
│  BA sur n'importe quel device                         │
│  (Desktop / iPad split-screen / Phone PiP)            │
│                                                        │
│  ┌────────────────┐    ┌───────────────────────────┐  │
│  │  App de visio   │    │  AngelDesk Coaching UI    │  │
│  │  (Zoom / Meet / │    │  (Webapp responsive)      │  │
│  │   Teams)        │    │                           │  │
│  │                 │    │  Onglet "Live" dans la    │  │
│  │                 │    │  page deal + bouton       │  │
│  │                 │    │  pop-out pour fenêtre     │  │
│  │                 │    │  séparée                  │  │
│  └────────────────┘    └───────────────────────────┘  │
└──────────────────────────────────────────────────────┘
         │                          ▲
         │ Bot rejoint le           │ Coaching cards
         │ meeting                  │ via Ably (realtime)
         ▼                          │
┌──────────────────────────────────────────────────────┐
│  SERVER-SIDE (Vercel + services)                      │
│                                                        │
│  ┌──────────────┐                                     │
│  │  Recall.ai   │ Bot meeting + transcription         │
│  │  ($0.65/h)   │ temps réel + diarization            │
│  └──────┬───────┘                                     │
│         │ Webhook (transcript chunks)                  │
│         ▼                                              │
│  ┌──────────────┐    ┌──────────────────────────┐     │
│  │  Utterance    │───▶│  Coaching Engine          │     │
│  │  Router       │    │  (Claude Sonnet 4.5/4.6)  │     │
│  │              │    │                           │     │
│  │  Classifie   │    │  Input:                   │     │
│  │  pertinent   │    │  • Utterance courante     │     │
│  │  vs small    │    │  • Deal Context Engine    │     │
│  │  talk        │    │  • Transcript buffer      │     │
│  └──────────────┘    │                           │     │
│                       │  Output:                  │     │
│                       │  • Coaching card           │     │
│                       └──────────┬───────────────┘     │
│                                  │                      │
│                                  ▼                      │
│                       ┌──────────────────────┐          │
│                       │  Ably (realtime)      │          │
│                       │  Publish coaching     │          │
│                       │  card → BA            │          │
│                       └──────────────────────┘          │
│                                                        │
│  ┌──────────────┐ (backup STT si qualité               │
│  │  Deepgram    │  Recall.ai insuffisante)              │
│  │  Nova-3      │                                       │
│  └──────────────┘                                      │
└──────────────────────────────────────────────────────┘
```

### Pourquoi cette architecture

| Décision | Raison |
|----------|--------|
| **Server-side (bot)** | Seule approche compatible desktop + iPad + téléphone |
| **Recall.ai** | API clé-en-main pour bot meeting. Supporte Zoom, Meet, Teams. Transcription intégrée. Standard du marché. |
| **Deepgram en backup** | Meilleure diarization que Recall.ai si besoin. Nova-3 excellent en FR/EN bilingue. |
| **Ably (pas SSE)** | Vercel = serverless = timeouts sur SSE. Ably gère reconnexion native, messages manqués, présence. Mission-critique. |
| **Claude Sonnet 4.5/4.6** | Meilleure qualité de raisonnement pour le coaching contextuel. Pas de compromis sur la qualité. |
| **Webapp (pas app native)** | Responsive = marche partout. Pas d'installation supplémentaire. Pop-out natif du navigateur. |

---

## 3. Pipeline détaillé

### Phase 1 — Pré-call (Deal Context Engine)

Le Deal Context Engine est assemblé au moment du lancement de la session. C'est le "cerveau" de l'analyste qui a déjà fait tout le travail.

**Données compilées :**

```typescript
interface DealContext {
  // Identité du deal
  dealId: string;
  companyName: string;
  sector: string;
  stage: string;

  // Résultats d'analyse existants (compilés, pas bruts)
  financialSummary: {
    keyMetrics: Record<string, number>; // MRR, ARR, runway, burn, etc.
    benchmarkPosition: string;          // vs P25/P50/P75
    redFlags: string[];
  };
  teamSummary: {
    founders: string[];
    keyStrengths: string[];
    concerns: string[];
  };
  marketSummary: {
    size: string;
    competitors: string[];
    positioning: string;
  };
  techSummary: {
    stack: string;
    maturity: string;
    concerns: string[];
  };

  // Red flags identifiés (tous tiers)
  redFlags: Array<{
    severity: string;
    description: string;
    source: string;       // Quel agent l'a détecté
    question: string;     // Question associée à poser
  }>;

  // Questions pré-générées (question-master + autres agents)
  questionsToAsk: Array<{
    question: string;
    priority: 'high' | 'medium' | 'low';
    category: string;     // financial, team, market, tech, legal
    context: string;      // Pourquoi cette question est importante
  }>;

  // Benchmarks DB
  benchmarks: {
    valuationRange: { p25: number; p50: number; p75: number };
    comparableDeals: string[];
  };

  // Tier 3 synthesis
  overallScore: number;
  signalProfile: string; // "Signaux favorables", "Vigilance requise", etc.
  keyContradictions: string[];

  // Documents uploadés (résumés, pas les fichiers complets)
  documentSummaries: Array<{
    name: string;
    type: string;
    keyClaims: string[];  // Claims vérifiables extraits du document
  }>;

  // Historique des sessions précédentes (si applicable)
  previousSessions: Array<{
    date: string;
    keyFindings: string[];
    unresolvedQuestions: string[];
  }>;
}
```

**Taille cible** : ~5000-10000 tokens. Le contexte est pré-compilé et optimisé pour être injecté dans chaque appel LLM sans dépasser les limites.

**Compilation** : Un endpoint dédié (`/api/coaching/context`) compile ce contexte à partir des données existantes en DB (résultats Tier 1/2/3, documents, sessions précédentes). Le contexte est mis en cache pour la durée de la session.

---

### Phase 2 — Pendant le call (Coaching en temps réel)

#### 2.1 Flow de transcription

```
Recall.ai bot (dans le meeting)
    │
    │ Audio capturé en continu
    │
    ▼
Recall.ai STT (transcription temps réel)
    │
    │ Transcript chunks (avec speaker ID + timestamps)
    │ Envoyés via webhook à notre API
    │
    ▼
POST /api/live-sessions/[id]/webhook
    │
    │ Chunk format:
    │ {
    │   speaker: "Jean Dupont",
    │   text: "Notre MRR actuel est de 50K€...",
    │   timestamp: 1234567890,
    │   is_final: true
    │ }
    │
    ▼
Utterance Router (classification)
```

#### 2.2 Utterance Router

Le router classifie chaque utterance pour décider si elle mérite un appel au Coaching Engine.

```typescript
interface UtteranceClassification {
  type:
    | 'financial_claim'      // Chiffre, métrique, projection
    | 'competitive_claim'    // Mention de concurrents
    | 'team_info'            // Info sur l'équipe
    | 'market_claim'         // Claim sur le marché
    | 'tech_claim'           // Claim technique
    | 'strategy_reveal'      // Stratégie, pivot, plan
    | 'negotiation_point'    // Valorisation, termes, conditions
    | 'question_response'    // Réponse à une question du BA
    | 'small_talk'           // Ignoré — pas d'appel LLM
    | 'filler';              // Ignoré — "oui", "exactement", etc.

  shouldTriggerCoaching: boolean;
  priority: 'high' | 'medium' | 'low';
}
```

**Implémentation** : Le router peut être :
- Un LLM léger (Haiku) pour la classification rapide (~200ms)
- Ou un système hybride : regex/keywords pour les cas évidents + Haiku pour les cas ambigus
- L'objectif est de filtrer ~40% du contenu (small talk, fillers) pour ne pas spammer le Coaching Engine

**Speakers ciblés** :
- **Fondateur / Co-fondateur** : analyse complète, toutes les utterances pertinentes sont routées
- **BA** : utilisé pour détecter si une question suggérée a été posée (auto-dismiss des cartes)
- **Autres participants** : transcrits mais pas de coaching spécifique, sauf si contenu informatif

#### 2.3 Coaching Engine

Le coeur du système. Claude Sonnet 4.5/4.6 reçoit l'utterance + le contexte et génère une coaching card.

**System prompt du Coaching Engine :**

```
Tu es l'analyste IA silencieux d'un Business Angel pendant un call avec un fondateur.
Tu as déjà analysé ce deal en profondeur. Voici tout ce que tu sais :

[DEAL CONTEXT — injecté dynamiquement]

Ton rôle :
1. Écouter ce que le fondateur dit
2. Croiser avec ton analyse existante
3. Suggérer des questions pertinentes, détecter des contradictions, noter les nouvelles infos
4. Tes suggestions doivent être COURTES (2-3 phrases max), ACTIONNABLES, et CONTEXTUELLES

Règles :
- Ton analytique, jamais prescriptif (règle N°1 AngelDesk)
- Chaque suggestion doit être liée à quelque chose de spécifique dit par le fondateur
- Ne pas répéter une suggestion déjà faite (tu as l'historique des suggestions précédentes)
- Ne pas suggérer sur du small talk ou des sujets non pertinents pour l'investissement
- Les questions suggérées doivent être formulées naturellement, comme si le BA les posait spontanément
- Priorité haute = le fondateur vient de dire quelque chose qui contredit l'analyse ou qui est un red flag
- Priorité moyenne = opportunité de creuser un sujet important
- Priorité basse = nouvelle info à noter

Format de réponse (JSON strict) :
{
  "shouldRespond": boolean,       // false si rien de pertinent à dire
  "type": "question" | "contradiction" | "new_info" | "negotiation",
  "priority": "high" | "medium" | "low",
  "content": "Texte de la suggestion (2-3 phrases max)",
  "reference": "Quelle partie de l'analyse existante est concernée",
  "suggestedQuestion": "Question formulée naturellement (optionnel)"
}
```

**Input du Coaching Engine (chaque appel) :**

```typescript
{
  systemPrompt: COACHING_SYSTEM_PROMPT,
  dealContext: compiledDealContext,          // ~5000-8000 tokens
  recentTranscript: last5Utterances,        // ~500-1000 tokens (buffer glissant)
  currentUtterance: {                        // ~100-300 tokens
    speaker: "Fondateur",
    text: "Notre MRR actuel est de 50K€...",
    classification: "financial_claim"
  },
  previousSuggestions: lastNSuggestions,    // ~500 tokens (éviter les doublons)
  addressedTopics: topicsAlreadyCovered     // ~200 tokens
}
```

**Output** : coaching card en JSON, streamée vers le client via Ably.

**Latence cible** : <3 secondes entre la fin de phrase du fondateur et l'apparition de la suggestion sur l'écran du BA.

Décomposition :
- Recall.ai transcription : ~300ms
- Webhook delivery : ~100ms
- Utterance Router : ~200-500ms
- Coaching Engine (Sonnet) : ~1500-2500ms
- Ably publish + delivery : ~100ms
- **Total : ~2.2-3.5 secondes**

#### 2.4 Auto-détection des sujets abordés

Le système écoute aussi les utterances du BA pour détecter quand une question suggérée a été posée.

**Mécanisme** :
1. Le BA pose une question (détectée dans la transcription)
2. Le système compare sémantiquement avec les suggestions actives
3. Si match → la carte se grise avec "✓ Abordé"
4. La réponse du fondateur est associée à la suggestion pour le post-call report

Ceci est fait par le même LLM (ou par un appel Haiku léger dédié à la détection).

#### 2.5 Transcript buffer management

Le transcript complet est stocké en DB (table `session_transcript_chunks`), mais le LLM ne reçoit qu'un **buffer glissant** des 5 dernières utterances significatives pour garder le contexte conversationnel sans exploser les tokens.

Le buffer se gère ainsi :
- Small talk et fillers ne sont PAS inclus dans le buffer envoyé au LLM
- Le buffer avance au fur et à mesure
- Le deal context (pré-compilé) reste constant pendant toute la session

---

### Phase 3 — Post-call

#### 3.1 Déclenchement

Quand le BA clique "Terminer session" :
1. Le bot Recall.ai quitte le meeting
2. La transcription finale est récupérée (complète, avec timestamps et speakers)
3. Le Post-Call Generator se lance

#### 3.2 Post-Call Generator

Un appel LLM (Sonnet) avec la transcription complète + le deal context pour générer :

```typescript
interface PostCallReport {
  // Résumé exécutif (3-5 phrases)
  executiveSummary: string;

  // Points clés discutés
  keyPoints: Array<{
    topic: string;
    summary: string;
    speakerQuotes: string[];   // Citations exactes
  }>;

  // CTAs et next steps mentionnés
  actionItems: Array<{
    description: string;
    owner: 'ba' | 'founder' | 'shared';
    deadline?: string;
  }>;

  // Nouvelles informations (absentes de l'analyse existante)
  newInformation: Array<{
    fact: string;
    impact: string;           // Impact sur l'analyse
    agentsAffected: string[]; // Quels agents devraient être re-run
  }>;

  // Contradictions détectées (deck/analyse vs ce qui a été dit)
  contradictions: Array<{
    claimInDeck: string;
    claimInCall: string;
    severity: 'high' | 'medium' | 'low';
  }>;

  // Questions posées et réponses obtenues
  questionsAsked: Array<{
    question: string;
    answer: string;
    wasFromCoaching: boolean;  // Suggestion du coaching ou initiative du BA
  }>;

  // Questions restantes (non abordées)
  remainingQuestions: string[];

  // Score de confiance mis à jour
  confidenceDelta: {
    before: number;  // Confiance avant le call (basée sur les docs)
    after: number;   // Confiance après le call (plus de data)
    reason: string;
  };

  // Statistiques de la session
  sessionStats: {
    duration: number;          // minutes
    totalUtterances: number;
    coachingCardsGenerated: number;
    coachingCardsAddressed: number;
    topicsChecklist: { total: number; covered: number };
  };
}
```

#### 3.3 Document auto-généré

Le rapport est converti en document Markdown et automatiquement :
1. Stocké dans la table `session_summaries`
2. Créé comme document rattaché au deal (table `documents`)
3. Nomenclature : `Call-[YYYY-MM-DD]-[NomStartup]-[Durée]min.md`

Exemple :
```markdown
# Compte-rendu de call — StartupXYZ
**Date** : 24 février 2026 | **Durée** : 47 min | **Participants** : Jean Dupont (Fondateur), Marie Martin (BA)

## Résumé exécutif
[...]

## Points clés
### 1. MRR et croissance
[...]

## Nouvelles informations
- Pivot marketplace prévu Q2 2026 (absent du deck)
- [...]

## Contradictions avec l'analyse
- MRR annoncé : 50K€ vs deck : 30K€ (écart 67%)
- [...]

## Questions posées
- [...]

## Questions restantes à poser
- [...]

## Actions à suivre
- [...]
```

#### 3.4 Re-analyse post-call

Après le post-call report, le BA a deux options :

**Option 1 — Delta Report (automatique)** :
- Affiché immédiatement après le call
- Montre ce qui a changé : nouvelles infos, contradictions, questions résolues
- Pas de re-run d'agents

**Option 2 — Re-analyse ciblée (sur demande du BA)** :
- Le call-analyzer identifie quels agents sont impactés par les nouvelles données
- Seuls les agents impactés sont re-run (~2-5 agents au lieu de 40)
- Puis le Tier 3 (synthèse/scoring) est re-run car les inputs ont changé
- Coût : ~$1-2, durée : ~1-2 min
- Le BA voit les résultats mis à jour avec un badge "Mis à jour post-call"

**Option 3 — Full re-run (sur demande explicite)** :
- Re-run de tous les 40 agents avec les données enrichies
- Plus coûteux (~$5-10) et plus long (~5 min)
- Rarement nécessaire sauf si le call a révélé des changements majeurs

---

## 4. UI/UX — Interface coaching

### 4.1 Principe directeur

L'interface est **un flux de cartes minimaliste, zéro interaction manuelle requise**. Le BA est en conversation — il jette un oeil, lit la suggestion en 2 secondes, rebondit naturellement. Aucun clic nécessaire.

### 4.2 Placement dans AngelDesk

**Onglet "Live"** dans la page deal (`/deals/[id]`), à côté des onglets existants (Analyse, Documents, etc.).

**Bouton pop-out** : permet de détacher la vue coaching dans une fenêtre navigateur séparée, redimensionnable et positionnable librement à côté de l'app de visio.

### 4.3 Layout de la page coaching

```
┌────────────────────────────────────────┐
│  ● LIVE — StartupXYZ           47:23  │
│  Fondateur parle...                    │
│                                        │
│  [Coaching]  [Questions analyse]  [⤢]  │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Le fondateur mentionne un MRR   │  │
│  │ de 50K€ — le deck indiquait     │  │
│  │ 30K€. Écart de 67%.             │  │
│  │ → Demandez le détail de         │  │
│  │   l'évolution mensuelle du MRR  │  │
│  │                     ● haute     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Il dit "3 concurrents directs"  │  │
│  │ — l'analyse en identifie 7.     │  │
│  │ → Quel périmètre considère-     │  │
│  │   t-il ? Quid de [X] et [Y] ?  │  │
│  │                     ● haute     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Nouveau : pivot marketplace     │  │
│  │ prévu Q2 — absent du deck.      │  │
│  │ Impact potentiel sur le modèle  │  │
│  │ économique et la valorisation.  │  │
│  │                     ● moyenne   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌─ grisé ──────────────────────────┐  │
│  │ ✓ Runway abordé — le fondateur  │  │
│  │   confirme 14 mois              │  │
│  └──────────────────────────────────┘  │
│                                        │
├────────────────────────────────────────┤
│  [⏸ Pause]        [⏹ Terminer]       │
└────────────────────────────────────────┘
```

### 4.4 Deux onglets

| Onglet | Contenu | Comportement |
|--------|---------|-------------|
| **Coaching** (principal, par défaut) | Flux live de suggestions contextuelles générées par rapport à ce qui se dit dans le call, croisé avec l'analyse. | Mise à jour en temps réel via Ably. Nouvelles cartes en haut, anciennes descendent. Cartes abordées se grisent. |
| **Questions analyse** (secondaire) | Liste statique des questions pré-générées par question-master et les autres agents. | Consultable à tout moment. Non mise à jour pendant le call. Le BA peut s'y référer s'il veut. |

Le bouton `[⤢]` ouvre le coaching dans une fenêtre pop-out séparée.

### 4.5 Types de cartes coaching

| Type | Indicateur visuel | Description |
|------|-------------------|-------------|
| **Question / Contradiction** | Bordure gauche orange/rouge, priorité haute | Le fondateur dit quelque chose qui contredit l'analyse ou ouvre une question critique |
| **Nouvelle info** | Bordure gauche verte | Fait nouveau révélé pendant le call, absent des documents |
| **Point de négociation** | Bordure gauche violette | Mention de valorisation, termes, conditions → benchmark DB |
| **Abordé (grisé)** | Fond gris, icône ✓ | Sujet automatiquement détecté comme abordé par le BA |

### 4.6 Comportement des cartes

- **Apparition** : la carte apparaît en haut du flux avec une animation légère (slide-in)
- **Disparition automatique** : quand le système détecte que le BA a abordé le sujet (via transcription du BA), la carte se grise et descend avec un "✓ Abordé"
- **Pas de boutons d'action** : aucun clic requis du BA
- **Priorité visuelle** : les cartes haute priorité ont un indicateur coloré plus visible
- **Scroll** : le flux est scrollable, les nouvelles cartes arrivent en haut

### 4.7 Status bar

En haut de l'interface :
- **Indicateur LIVE** (point rouge pulsant)
- **Nom de la startup**
- **Timer** (durée du call)
- **Qui parle** (indicateur du speaker actif)
- **Boutons** : Pause (met le coaching en pause, continue la transcription) / Terminer

### 4.8 Écran de lancement de session

Avant le call, quand le BA clique "Lancer session live" :

```
┌────────────────────────────────────────┐
│  Nouvelle session live                  │
│                                        │
│  Deal : StartupXYZ                     │
│  Analyse disponible : ✅ Complète      │
│                                        │
│  Lien du meeting :                     │
│  ┌──────────────────────────────────┐  │
│  │ https://zoom.us/j/123456789     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Plateforme détectée : Zoom ✓          │
│  Langue du call : [FR/EN bilingue ▾]   │
│                                        │
│  [Lancer la session]                   │
└────────────────────────────────────────┘
```

### 4.9 Écran d'identification des participants

Après que le bot a rejoint et que les participants sont détectés :

```
┌────────────────────────────────────────┐
│  Participants détectés (3)             │
│                                        │
│  ● Vous (Marie Martin) — auto-détecté │
│  ○ Jean Dupont    [Fondateur      ▾]  │
│  ○ Pierre Durand  [Co-fondateur   ▾]  │
│                                        │
│  Rôles disponibles :                   │
│  Fondateur, Co-fondateur, Investisseur,│
│  Avocat, Advisor, Autre                │
│                                        │
│  [Confirmer et démarrer le coaching]   │
└────────────────────────────────────────┘
```

- Le BA est auto-détecté par son nom de compte AngelDesk
- Tous les autres participants sont "non-BA" par défaut
- Le BA labélise manuellement le rôle de chaque participant
- Si un nouveau participant rejoint en cours de call, notification pour labéliser

### 4.10 Écran post-call

Après "Terminer" :

```
┌────────────────────────────────────────┐
│  Session terminée — StartupXYZ         │
│  Durée : 47 min                        │
│                                        │
│  Génération du rapport en cours... ⏳  │
│                                        │
│  ━━━━━━━━━━━━━░░░░░  75%              │
├────────────────────────────────────────┤
│  (puis une fois généré)               │
│                                        │
│  📄 Rapport post-call                  │
│  [Voir le rapport]                     │
│  [Télécharger en PDF]                  │
│                                        │
│  🔄 Re-analyse                         │
│  5 agents impactés par les nouvelles   │
│  données du call.                      │
│  [Voir le delta] [Relancer l'analyse] │
│                                        │
│  Le rapport a été ajouté aux           │
│  documents du deal.                    │
└────────────────────────────────────────┘
```

### 4.11 Responsive design

| Device | Comportement |
|--------|-------------|
| **Desktop (>1024px)** | Layout complet. Onglets, status bar, flux de cartes. Pop-out recommandé à côté de la visio. |
| **iPad split screen (~500-700px)** | Layout condensé. Status bar simplifiée. Cartes pleine largeur. Font légèrement plus grande pour lisibilité. |
| **Mobile PiP (~320-400px)** | Mode ultra-compact. Uniquement les cartes, pas de status bar. Font grande. Scroll vertical. Le call est en PiP au-dessus. |

### 4.12 Mode cold recording (sans deal)

Si le BA lance une session sans deal lié :
- Pas de coaching contextuel (pas de deal context)
- Coaching générique uniquement ("Le fondateur mentionne une levée de 2M€ — questions standard : dilution, termes, utilisation des fonds")
- Post-call : résumé + transcription
- Option de rattacher à un deal existant ou de créer un nouveau deal après le call

---

## 5. Stack technique (nouveaux composants)

| Composant | Technologie | Rôle |
|-----------|------------|------|
| **Bot meeting** | [Recall.ai API](https://docs.recall.ai) | Rejoint Zoom/Meet/Teams, capture audio, transcription temps réel, speaker diarization |
| **Backup STT** | [Deepgram Nova-3](https://deepgram.com) | Transcription streaming backup si qualité Recall.ai insuffisante. Excellent FR/EN bilingue. |
| **Realtime messaging** | [Ably](https://ably.com) | Push des coaching cards vers le client. Reconnexion native. Compatible serverless Vercel. |
| **Coaching LLM** | Claude Sonnet 4.5/4.6 via OpenRouter | Génération des suggestions contextuelles |
| **Classification** | Claude Haiku 4.5 via OpenRouter | Utterance Router (classification rapide) |
| **Frontend** | React (Next.js existant) + Ably React SDK | Interface coaching temps réel |

### Nouvelles dépendances npm

```json
{
  "ably": "^2.x",           // Client Ably pour pub/sub temps réel
  "@ably/react": "^1.x"     // React hooks pour Ably (useChannel, usePresence)
}
```

### APIs externes nouvelles

| Service | Endpoint | Auth |
|---------|----------|------|
| Recall.ai | `https://api.recall.ai/api/v1/bot/` | API Key (header `Authorization: Token <key>`) |
| Recall.ai webhook | Notre endpoint recevant les events | Signature verification |
| Ably | Server-side publish + client-side subscribe | API Key (server) + Token auth (client) |
| Deepgram (backup) | WebSocket streaming `wss://api.deepgram.com/v1/listen` | API Key |

---

## 6. Schéma base de données

### Nouvelles tables (Prisma)

```prisma
model LiveSession {
  id              String   @id @default(cuid())
  dealId          String?  // Nullable pour le mode cold
  deal            Deal?    @relation(fields: [dealId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // Meeting info
  meetingUrl      String
  meetingPlatform String   // "zoom" | "meet" | "teams"
  botId           String?  // Recall.ai bot ID
  botJoinUrl      String?  // URL pour le bot

  // Session state
  status          String   @default("created")
  // Valeurs: "created" | "bot_joining" | "live" | "processing" | "completed" | "failed"

  // Participants
  participants    Json     @default("[]")
  // Format: [{ name: string, role: string, speakerId: string }]

  // Settings
  language        String   @default("fr-en")
  llmModel        String   @default("claude-sonnet-4-5")

  // Timestamps
  startedAt       DateTime?
  endedAt         DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  transcriptChunks  TranscriptChunk[]
  coachingCards     CoachingCard[]
  summary           SessionSummary?
  document          Document?        @relation(fields: [documentId], references: [id])
  documentId        String?          @unique

  @@index([dealId])
  @@index([userId])
  @@index([status])
}

model TranscriptChunk {
  id          String   @id @default(cuid())
  sessionId   String
  session     LiveSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  speaker     String   // Nom du speaker
  speakerRole String   // "founder" | "co-founder" | "ba" | "investor" | "lawyer" | "advisor" | "other"
  text        String
  isFinal     Boolean  @default(true)

  timestampStart Float  // Secondes depuis le début du call
  timestampEnd   Float

  // Classification (Utterance Router)
  classification String?
  // "financial_claim" | "competitive_claim" | "team_info" | "market_claim" |
  // "tech_claim" | "strategy_reveal" | "negotiation_point" | "question_response" |
  // "small_talk" | "filler"

  createdAt   DateTime @default(now())

  @@index([sessionId])
  @@index([sessionId, speakerRole])
}

model CoachingCard {
  id          String   @id @default(cuid())
  sessionId   String
  session     LiveSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  type        String   // "question" | "contradiction" | "new_info" | "negotiation"
  priority    String   // "high" | "medium" | "low"
  content     String   // Le texte de la suggestion
  context     String?  // Ce qui a déclenché la suggestion (utterance du fondateur)
  reference   String?  // Quelle partie de l'analyse est concernée
  suggestedQuestion String? // Question formulée naturellement (si applicable)

  // État
  status      String   @default("active")
  // "active" | "addressed" | "dismissed" | "expired"
  addressedAt DateTime?
  addressedBy String?  // "auto" (détection transcription) | "manual" (si on ajoute un jour)

  // Trigger
  triggeredByChunkId String? // ID du TranscriptChunk qui a déclenché cette card

  createdAt   DateTime @default(now())

  @@index([sessionId])
  @@index([sessionId, status])
}

model SessionSummary {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  session     LiveSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  // Contenu du rapport
  executiveSummary  String
  keyPoints         Json     // Array<{ topic, summary, speakerQuotes }>
  actionItems       Json     // Array<{ description, owner, deadline? }>
  newInformation    Json     // Array<{ fact, impact, agentsAffected }>
  contradictions    Json     // Array<{ claimInDeck, claimInCall, severity }>
  questionsAsked    Json     // Array<{ question, answer, wasFromCoaching }>
  remainingQuestions Json    // string[]
  confidenceDelta   Json     // { before, after, reason }
  sessionStats      Json     // { duration, totalUtterances, coachingCards*, topics* }

  // Markdown complet du rapport (pour le document)
  markdownReport    String   @db.Text

  createdAt   DateTime @default(now())
}
```

### Relations avec les tables existantes

- `LiveSession.dealId` → `Deal.id` (un deal peut avoir plusieurs sessions)
- `LiveSession.userId` → `User.id`
- `LiveSession.documentId` → `Document.id` (le document post-call auto-généré)

---

## 7. Structure des fichiers

```
src/
├── app/(dashboard)/deals/[id]/
│   └── live/
│       ├── page.tsx                      # Page principale coaching live
│       └── components/
│           ├── live-session-launcher.tsx  # Formulaire de lancement (URL meeting)
│           ├── participant-mapper.tsx     # Identification des participants + rôles
│           ├── coaching-feed.tsx          # Flux de coaching cards (composant principal)
│           ├── coaching-card.tsx          # Composant individuel d'une card
│           ├── analysis-questions-tab.tsx # Onglet questions pré-analyse
│           ├── session-status-bar.tsx     # Timer, speaker actif, statut
│           ├── session-controls.tsx       # Pause / Terminer
│           ├── post-call-report.tsx       # Affichage du rapport post-call
│           └── post-call-reanalysis.tsx   # Options de re-analyse
│
├── app/api/
│   ├── live-sessions/
│   │   ├── route.ts                      # POST: créer session, GET: lister sessions
│   │   └── [id]/
│   │       ├── route.ts                  # GET: détail session, PATCH: update
│   │       ├── start/route.ts            # POST: lancer le bot Recall.ai
│   │       ├── stop/route.ts             # POST: arrêter session + déclencher post-call
│   │       ├── participants/route.ts     # PUT: mettre à jour les rôles
│   │       └── webhook/route.ts          # POST: webhook Recall.ai (transcription)
│   │
│   ├── coaching/
│   │   ├── context/route.ts              # GET: compiler le Deal Context Engine
│   │   ├── ably-token/route.ts           # GET: token Ably pour le client
│   │   └── reanalyze/route.ts            # POST: déclencher re-analyse post-call
│   │
│   └── webhooks/
│       └── recall/route.ts               # POST: webhook global Recall.ai (status events)
│
├── lib/
│   └── live/
│       ├── recall-client.ts              # Client API Recall.ai (create bot, get status, etc.)
│       ├── ably-server.ts                # Ably server-side publisher
│       ├── coaching-engine.ts            # Logique LLM coaching (system prompt, appel Sonnet)
│       ├── utterance-router.ts           # Classification des utterances (Haiku)
│       ├── context-compiler.ts           # Compile le Deal Context depuis la DB
│       ├── speaker-detector.ts           # Auto-détection BA + gestion speakers
│       ├── auto-dismiss.ts               # Détection auto des sujets abordés
│       ├── post-call-generator.ts        # Génération du rapport post-call
│       ├── post-call-reanalyzer.ts       # Re-analyse ciblée post-call
│       ├── deepgram-client.ts            # Client Deepgram (backup STT)
│       └── types.ts                      # Types TypeScript partagés
│
├── components/deals/
│   └── live-session-card.tsx             # Card "Session live" sur la page deal
│
└── prisma/
    └── schema.prisma                     # + nouvelles tables
```

---

## 8. Routes API

### Sessions

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/live-sessions` | Créer une nouvelle session (body: dealId?, meetingUrl, language) |
| `GET` | `/api/live-sessions` | Lister les sessions de l'utilisateur (query: dealId?, status?) |
| `GET` | `/api/live-sessions/[id]` | Détail d'une session |
| `PATCH` | `/api/live-sessions/[id]` | Mettre à jour une session (status, settings) |
| `POST` | `/api/live-sessions/[id]/start` | Lancer le bot Recall.ai → rejoint le meeting |
| `POST` | `/api/live-sessions/[id]/stop` | Arrêter la session → déclencher le post-call |
| `PUT` | `/api/live-sessions/[id]/participants` | Mettre à jour les rôles des participants |

### Webhooks

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/live-sessions/[id]/webhook` | Webhook Recall.ai : reçoit les chunks de transcription |
| `POST` | `/api/webhooks/recall` | Webhook global Recall.ai : events de status (bot joined, bot left, error) |

### Coaching

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/coaching/context?dealId=xxx` | Compiler et retourner le Deal Context Engine |
| `GET` | `/api/coaching/ably-token` | Générer un token Ably pour le client (authentifié) |
| `POST` | `/api/coaching/reanalyze` | Déclencher la re-analyse post-call (body: sessionId, mode: 'delta' \| 'targeted' \| 'full') |

### Flow des webhooks Recall.ai

```
1. POST /api/webhooks/recall
   Event: "bot.status_change"
   → Met à jour LiveSession.status
   → Si status = "in_call" → session passe en "live"
   → Si status = "done" → session passe en "processing"

2. POST /api/live-sessions/[id]/webhook
   Event: "transcript.chunk"
   → Stocke le chunk en DB (TranscriptChunk)
   → Envoie au Utterance Router
   → Si pertinent → Coaching Engine → Ably publish
```

---

## 9. Intégration avec AngelDesk existant

### 9.1 Page deal

La page deal existante (`/deals/[id]`) reçoit :
- Un **nouvel onglet "Live"** (ou "Sessions") dans la navigation
- Un **bouton "Lancer session live"** visible quand une analyse est disponible
- Un **historique des sessions** passées avec accès aux rapports

### 9.2 Documents

Le document post-call est automatiquement créé dans la table `documents` existante :
- Type : `call_transcript` (nouveau type)
- Rattaché au deal
- Visible dans l'onglet Documents existant
- Exportable en PDF via l'infrastructure PDF existante (`src/lib/pdf/`)

### 9.3 Chat IA

Le chat IA existant (`deal-chat-panel.tsx`) peut :
- Référencer les transcriptions de calls ("Que dit le fondateur sur le MRR dans le dernier call ?")
- Utiliser les rapports post-call comme contexte additionnel
- Suggérer "Vous pourriez relancer une analyse basée sur le dernier call"

### 9.4 Agents d'analyse

Le re-analysis post-call s'intègre avec le pipeline d'agents existant :
- Le `post-call-reanalyzer.ts` identifie les agents impactés
- Il déclenche un re-run ciblé via l'orchestrateur existant
- Les résultats sont mergés dans les résultats existants avec un badge "Mis à jour post-call [date]"

### 9.5 Onglet Suivi DD

Les sessions live alimentent le suivi DD :
- Nouvelles alertes basées sur les contradictions détectées pendant le call
- Action items du call intégrés dans le suivi

### 9.6 Landing / Pricing

La feature Live Coaching est mise en avant :
- Landing : section dédiée "Coaching live pendant vos calls"
- Pricing : feature différenciante justifiant le pricing premium

---

## 10. Coûts détaillés

### Coût par session d'1 heure

| Composant | Fournisseur | Coût unitaire | Coût/heure |
|-----------|-------------|---------------|------------|
| Bot meeting | Recall.ai | $0.50/h (proraté à la seconde) | **$0.50** |
| Transcription temps réel | Recall.ai (intégrée) | $0.15/h | **$0.15** |
| Utterance Router | Claude Haiku 4.5 (~120 calls/h) | ~$0.001/call | **$0.12** |
| Coaching Engine | Claude Sonnet 4.5/4.6 (~60 calls/h, ~7500 tok in, ~150 tok out) | ~$0.025/call | **$1.49** |
| Post-call summary | Claude Sonnet 4.5/4.6 (1 call, ~30K tok in, ~3K tok out) | | **$0.14** |
| Ably messaging | ~200 messages/session | Inclus dans le plan gratuit/starter | **~$0.00** |
| **TOTAL** | | | **$2.40/h** |

### Avec Deepgram en backup (au lieu de Recall.ai transcription)

| Composant | Coût/heure |
|-----------|------------|
| Recall.ai (bot uniquement) | $0.50 |
| Deepgram Nova-3 (streaming) | $0.46 |
| Reste identique | $1.75 |
| **TOTAL** | **$2.71/h** |

### Coût de re-analyse post-call

| Mode | Coût estimé | Durée |
|------|-------------|-------|
| Delta report (automatique) | ~$0.15 | ~15 secondes |
| Re-analyse ciblée (2-5 agents + Tier 3) | ~$1-2 | ~1-2 minutes |
| Full re-run (40 agents) | ~$5-10 | ~5 minutes |

### Projection de rentabilité

Si pricing = $39/mois (add-on Live Coaching) :
- Un BA fait en moyenne 4-8 calls/mois de ~45 min
- Coût par BA : 4 × $2.40 × 0.75 = **$7.20/mois** (sessions de 45 min)
- Marge : ~$32/mois soit **~82%**

### Coûts d'infrastructure mensuels fixes

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Ably | Starter (6M messages/mois) | $29/mois |
| Recall.ai | Pay-as-you-go | Variable (cf. ci-dessus) |
| Deepgram | Pay-as-you-go | Variable (si utilisé comme backup) |

---

## 11. Sécurité

### 11.1 API Keys

| Service | Stockage | Variable d'env |
|---------|----------|----------------|
| Recall.ai | Vercel env (encrypted) | `RECALL_AI_API_KEY` |
| Deepgram | Vercel env (encrypted) | `DEEPGRAM_API_KEY` |
| Ably | Vercel env (encrypted) | `ABLY_API_KEY` |

### 11.2 Webhooks Recall.ai

- Vérification de la signature HMAC sur chaque webhook entrant
- Le secret de signature est stocké dans `RECALL_WEBHOOK_SECRET`
- Rejet de tout webhook avec signature invalide

### 11.3 Ably Token Auth

- Le client ne reçoit jamais l'API key Ably directement
- Le client demande un **token temporaire** via `/api/coaching/ably-token`
- Ce token est scoped : le client ne peut écouter que le channel de sa session
- Token expiry : 60 minutes (renouvelé automatiquement)

### 11.4 Chiffrement des transcriptions

- Les transcriptions sont stockées en DB (PostgreSQL Neon) avec chiffrement at-rest natif de Neon
- En transit : HTTPS partout (Vercel, Recall.ai, Ably, Deepgram)
- Pas de stockage local des transcriptions côté client

### 11.5 Accès aux données

- Un BA ne peut accéder qu'à ses propres sessions (`userId` vérifié via Clerk)
- Les sessions sont scopées au deal, lui-même scopé à l'équipe du BA
- L'API vérifie systématiquement `userId` + `dealId` ownership

### 11.6 Consentement enregistrement

- Le bot Recall.ai est visible dans le meeting et configurable pour afficher un nom type "AngelDesk Notes (enregistrement)"
- Les plateformes (Zoom, Meet, Teams) affichent nativement une notification "Recording in progress"
- En France (RGPD) : le consentement est implicite par la participation au meeting enregistré, mais on recommande au BA d'informer les participants
- Option dans les settings : message de consentement personnalisable que le bot affiche en rejoignant

### 11.7 Rétention des données

- Transcriptions : conservées tant que le deal existe
- Recordings audio (Recall.ai) : 7 jours gratuits, puis supprimées (on ne garde que la transcription texte)
- Le BA peut supprimer une session et toutes ses données (cascade delete)

---

## 12. Gestion d'erreurs

### 12.1 Le bot ne peut pas rejoindre le meeting

**Causes possibles** : lien invalide, meeting n'a pas commencé, permissions insuffisantes, plateforme non supportée.

**Handling** :
- Recall.ai envoie un webhook `bot.status_change: failed`
- La session passe en status `failed` avec un message d'erreur
- L'UI affiche : "Le bot n'a pas pu rejoindre le meeting. Vérifiez le lien et réessayez."
- Option de relancer

### 12.2 Perte de connexion pendant le call

**Côté bot (Recall.ai)** :
- Recall.ai gère la reconnexion automatiquement
- Si déconnexion prolongée (>30s) → webhook notification → UI affiche "Reconnexion..."
- Si échec total → session passe en "processing" avec les données collectées jusque-là

**Côté client (Ably)** :
- Ably gère la reconnexion automatiquement (retry exponentiel)
- Messages manqués pendant la déconnexion sont rejoués (buffer de 2 minutes)
- Pour déconnexions >2 min : au reconnect, le client fetch les coaching cards manquées depuis la DB via API
- L'UI affiche un indicateur "Reconnexion..." pendant la déconnexion

### 12.3 Timeout du Coaching Engine (LLM)

**Si le LLM met >5s à répondre** :
- La suggestion est abandonnée (le moment est passé)
- Log de l'incident pour monitoring
- Le système continue avec les utterances suivantes
- Pas de retry (la conversation a avancé)

### 12.4 Erreur du Utterance Router

**Si la classification échoue** :
- Fallback : considérer l'utterance comme pertinente → envoyer au Coaching Engine
- Mieux vaut un faux positif (suggestion inutile) qu'un faux négatif (manquer une contradiction)

### 12.5 Rate limiting

- Max 1 session live simultanée par BA (vérification à la création)
- Max 3 sessions par jour par BA (éviter les abus)
- Rate limit sur les webhooks : 100 req/s par session (largement suffisant)

---

## 13. Testing

### 13.1 Tests unitaires

- `context-compiler.ts` : vérifie que le contexte est correctement compilé depuis les données DB mock
- `utterance-router.ts` : vérifie la classification (small talk → skip, financial claim → coaching)
- `auto-dismiss.ts` : vérifie la détection des sujets abordés
- `post-call-generator.ts` : vérifie la génération du rapport

### 13.2 Tests d'intégration

- **Mock Recall.ai** : un service mock qui simule les webhooks Recall.ai (transcript chunks avec des données de test)
- **Mock LLM** : réponses pré-enregistrées du Coaching Engine pour des scénarios types
- **Test end-to-end** : simuler un call complet (séquence de webhooks) et vérifier que les coaching cards sont correctement générées et envoyées

### 13.3 Testing sans vrai meeting

**Outil de simulation** :
- Un script qui envoie une séquence de transcript chunks mockés au webhook endpoint
- Simule un call de X minutes avec des utterances réalistes
- Permet de tester le pipeline complet sans avoir à faire un vrai call

**Fichiers de test** :
- `test-data/mock-call-startup-xyz.json` : scénario complet d'un call de 30 minutes
- Inclut : utterances du fondateur (avec des claims vérifiables), utterances du BA, small talk, etc.
- Le deal context mock correspondant est fourni

### 13.4 Testing de la latence

- Mesurer le temps entre le webhook Recall.ai et la réception de la coaching card côté client
- Target : <3.5 secondes pour 95% des suggestions
- Alerter si latence moyenne >5 secondes

---

## 14. Limites & contraintes

### 14.1 Limites techniques

| Limite | Valeur | Raison |
|--------|--------|--------|
| Sessions simultanées par BA | 1 | Complexité + coût |
| Sessions par jour par BA | 3 | Rate limiting, anti-abus |
| Durée max d'une session | 2 heures | Coût + dégradation qualité contexte |
| Participants max | 10 | Diarization dégrade au-delà |
| Latence coaching | <3.5s (P95) | Au-delà, la suggestion n'est plus contextuelle |
| Taille du deal context | ~10K tokens max | Optimisation coût LLM |

### 14.2 Limites fonctionnelles

- **Pas de vidéo** : on capture uniquement l'audio. Pas d'analyse du langage corporel, des slides partagées, etc.
- **Diarization imparfaite** : pour >5 speakers, la qualité d'attribution peut baisser. Le BA peut corriger manuellement dans le rapport post-call.
- **Latence incompressible** : ~2-4 secondes entre ce que dit le fondateur et la suggestion. Le coaching est "quasi" temps réel, pas instantané.
- **Coaching dépend de la qualité de l'analyse** : si l'analyse Tier 1/2/3 est incomplète (pas assez de documents uploadés), le coaching sera générique.
- **Mode cold** : coaching générique uniquement, pas contextuel.

### 14.3 Langues supportées

| Langue | Support transcription | Support coaching |
|--------|----------------------|-----------------|
| Français | Excellent (Deepgram/Recall) | Excellent (Sonnet multilingue) |
| Anglais | Excellent | Excellent |
| FR/EN bilingue (code-switching) | Bon (Deepgram Nova-3 gère bien) | Excellent |
| Autres langues européennes | Phase 2 | Phase 2 |

### 14.4 Plateformes de visio supportées

| Plateforme | Support Recall.ai | Notes |
|------------|-------------------|-------|
| Zoom | ✅ Complet | App desktop + web |
| Google Meet | ✅ Complet | Web uniquement |
| Microsoft Teams | ✅ Complet | App desktop + web |
| Autres (Webex, etc.) | ❌ Phase 2 | Via Recall.ai si supporté |

---

## 15. Phases d'implémentation

### Phase 1 — Infrastructure de base

**Objectif** : Bot rejoint un meeting, transcrit, et stocke en DB.

- [ ] Setup Recall.ai (compte, API key, webhook)
- [ ] Setup Ably (compte, API key)
- [ ] Schéma Prisma (nouvelles tables)
- [ ] `recall-client.ts` : créer bot, gérer lifecycle
- [ ] Routes API : CRUD sessions, webhook Recall.ai
- [ ] Test : simuler un call et vérifier que la transcription arrive en DB

### Phase 2 — Coaching Engine

**Objectif** : Suggestions contextuelles en temps réel.

- [ ] `context-compiler.ts` : compiler le Deal Context depuis la DB
- [ ] `utterance-router.ts` : classification des utterances (Haiku)
- [ ] `coaching-engine.ts` : génération des suggestions (Sonnet)
- [ ] `ably-server.ts` : publish des coaching cards
- [ ] `auto-dismiss.ts` : détection auto des sujets abordés
- [ ] Test : simuler un flux de transcription et vérifier les suggestions

### Phase 3 — Interface utilisateur

**Objectif** : Le BA peut lancer une session et voir les suggestions.

- [ ] Page `/deals/[id]/live` (layout complet)
- [ ] `live-session-launcher.tsx` : formulaire de lancement
- [ ] `participant-mapper.tsx` : identification des rôles
- [ ] `coaching-feed.tsx` + `coaching-card.tsx` : flux de suggestions
- [ ] `session-status-bar.tsx` + `session-controls.tsx`
- [ ] Intégration Ably côté client (subscribe au channel)
- [ ] Pop-out window
- [ ] Responsive design (iPad, mobile)

### Phase 4 — Post-call intelligence

**Objectif** : Rapport post-call + document auto-pushé + re-analyse.

- [ ] `post-call-generator.ts` : génération du rapport
- [ ] `post-call-reanalyzer.ts` : re-analyse ciblée
- [ ] `post-call-report.tsx` + `post-call-reanalysis.tsx` : UI post-call
- [ ] Auto-création du document rattaché au deal
- [ ] Intégration avec l'onglet Documents existant

### Phase 5 — Polish & production

**Objectif** : Robustesse, monitoring, billing.

- [ ] Gestion d'erreurs complète (cf. section 12)
- [ ] Monitoring latence (alertes si >5s)
- [ ] Usage tracking par utilisateur (nombre de sessions, durée)
- [ ] Mode cold recording (sans deal)
- [ ] Tests E2E avec scénarios mockés
- [ ] Documentation utilisateur

### Phase future (non incluse dans le MVP)

- Calendar integration (auto-join meetings programmés)
- Analyse vidéo (slides partagées pendant le call)
- Multi-langue étendu (DE, ES, IT, etc.)
- Résumé vocal post-call (audio summary TTS)
- Intégration CRM (push des rapports vers HubSpot, Pipedrive, etc.)

---

## Annexes

### A. Recall.ai — Endpoints utilisés

```
POST   /api/v1/bot/              # Créer un bot (body: meeting_url, bot_name, etc.)
GET    /api/v1/bot/{id}/          # Statut du bot
POST   /api/v1/bot/{id}/leave/    # Faire quitter le bot
DELETE /api/v1/bot/{id}/          # Supprimer le bot
GET    /api/v1/bot/{id}/transcript/ # Récupérer la transcription complète
```

#### Configuration critique — Low Latency

> **ATTENTION** : Recall.ai est par défaut en mode `prioritize_accuracy` qui introduit un délai de **3-10 minutes** sur la transcription. C'est catastrophique pour le coaching live. Le mode `prioritize_low_latency` doit être activé à la création de chaque bot.

```json
{
  "meeting_url": "https://zoom.us/j/...",
  "bot_name": "AngelDesk Notes",
  "recording_config": {
    "transcript": {
      "provider": {
        "recallai_streaming": {
          "mode": "prioritize_low_latency",
          "language_code": "en"
        }
      }
    },
    "realtime_endpoints": [
      {
        "type": "webhook",
        "url": "https://app.angeldesk.io/api/live-sessions/{id}/webhook",
        "events": ["transcript.data", "transcript.partial_data"]
      }
    ]
  }
}
```

| Mode | Latence | Langues | Notes |
|------|---------|---------|-------|
| `prioritize_low_latency` | ~1-3s | EN uniquement | **Obligatoire pour live coaching** |
| `prioritize_accuracy` | 3-10 min | Multi-langue | Inutilisable en live, ok pour post-processing |

**Limitations du mode low latency** :
- `language_code` doit être `en` (pas de FR natif — le modèle comprend quand même le français parlé mais la qualité est moindre)
- Pas de détection automatique de langue
- Pas de filtrage de profanités
- Pour du FR natif haute qualité, utiliser Deepgram Nova-3 en backup (cf. section 5)

**Partial results** (`transcript.partial_data`) :
- Résultats intermédiaires basse latence envoyés avant la finalisation de l'utterance
- Utiles pour l'indicateur "qui parle" en temps réel
- Le coaching pipeline ne se déclenche que sur `transcript.data` (final) pour éviter les doublons

### B. Ably — Channels

```
Channel naming: live-session:{sessionId}

Events published:
- "coaching-card"     → { type, priority, content, context, reference, suggestedQuestion }
- "card-addressed"    → { cardId, addressedBy }
- "session-status"    → { status, message }
- "participant-joined" → { name, role }
- "participant-left"   → { name }
```

### C. Exemple de coaching card (JSON)

```json
{
  "id": "card_abc123",
  "type": "contradiction",
  "priority": "high",
  "content": "Le fondateur mentionne un MRR de 50K€ — le deck indiquait 30K€. Écart de 67%. L'analyse financial-auditor avait basé ses projections sur 30K€.",
  "context": "Jean Dupont: \"On est aujourd'hui à 50K de MRR, en croissance de 15% mois sur mois\"",
  "reference": "financial-auditor → keyMetrics.mrr (30000)",
  "suggestedQuestion": "Pouvez-vous détailler l'évolution du MRR sur les 6 derniers mois ? Le deck mentionnait 30K€, qu'est-ce qui explique la progression ?",
  "status": "active",
  "createdAt": "2026-02-24T14:32:15.000Z"
}
```

### D. Exemple de system prompt Coaching Engine (complet)

```
Tu es l'analyste IA d'un Business Angel pendant un appel en direct avec un fondateur.
Tu as déjà analysé ce deal en profondeur. Ton rôle est de coacher le BA en temps réel :
suggérer des questions, détecter des contradictions, noter les nouvelles informations.

## Contexte du deal

{DEAL_CONTEXT}

## Historique des suggestions déjà faites (ne pas répéter)

{PREVIOUS_SUGGESTIONS}

## Sujets déjà abordés dans le call

{ADDRESSED_TOPICS}

## Transcription récente (5 dernières interventions)

{RECENT_TRANSCRIPT}

## Intervention actuelle à analyser

Speaker: {SPEAKER_NAME} ({SPEAKER_ROLE})
"{CURRENT_UTTERANCE}"
Classification: {UTTERANCE_CLASSIFICATION}

## Instructions

1. Analyse cette intervention en la croisant avec le contexte du deal.
2. Si tu détectes quelque chose de pertinent (contradiction, question à poser, nouvelle info, point de négociation), génère une suggestion.
3. Si rien de pertinent, réponds shouldRespond: false.

Règles STRICTES :
- Ton analytique, JAMAIS prescriptif. Tu constates, tu ne décides pas.
- Suggestions COURTES : 2-3 phrases max. Le BA est en conversation, il jette un oeil.
- Questions formulées NATURELLEMENT, comme si le BA les posait spontanément.
- Ne JAMAIS répéter une suggestion déjà faite.
- Ne JAMAIS suggérer sur du small talk.
- Priorité haute = contradiction directe ou red flag confirmé.
- Priorité moyenne = opportunité de creuser un sujet important.
- Priorité basse = information nouvelle à noter.

Réponds en JSON strict :
{
  "shouldRespond": boolean,
  "type": "question" | "contradiction" | "new_info" | "negotiation",
  "priority": "high" | "medium" | "low",
  "content": "Texte de la suggestion",
  "reference": "Quelle partie de l'analyse est concernée",
  "suggestedQuestion": "Question formulée naturellement (optionnel, null si pas applicable)"
}
```

---

*Document rédigé le 2026-02-24. Toute modification doit être reflétée ici.*
