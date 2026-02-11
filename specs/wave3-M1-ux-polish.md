# Wave 3 - M1 UX Polish Core
## Spec de correction detaillee pour 10 failles MEDIUM

**Agent** : M1 - UX Polish Core
**Date** : 2026-02-11
**Fichiers analyses** : 18 fichiers source lus en totalite

---

## F60 -- Pricing confus / quotas dupliques

### Diagnostic

**Probleme 1 : "5 deals" sur la page pricing vs "3 deals" partout ailleurs**

- **Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/pricing/page.tsx`, ligne 63
  ```tsx
  <PricingFeature included>5 deals analysés/mois</PricingFeature>
  ```
- **Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/credits/types.ts`, ligne 17
  ```ts
  analysesPerMonth: 3,
  ```
- **Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/deal-limits/index.ts`, lignes 10, 269
  ```ts
  monthlyDeals: 3, // Aligned with PLAN_LIMITS.FREE.analysesPerMonth
  MONTHLY_DEALS: 3, // Aligned with PLAN_LIMITS.FREE.analysesPerMonth
  ```
- **Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/dashboard/page.tsx`, ligne 111
  ```ts
  ? "3 deals/mois"
  ```

La page pricing affiche **5** alors que toutes les sources de verite backend disent **3**. L'utilisateur pense avoir 5 deals gratuits, mais il est bloque apres 3.

**Probleme 2 : Nomenclature Tier 2/3 inversee sur la page pricing**

- **Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/pricing/page.tsx`, lignes 203 et 259
  ```tsx
  // Ligne 203 : Tier 2 est decrit comme "Deep Analysis" (5 agents de synthese)
  Tier 2: Deep Analysis
  // -> En realite, c'est le Tier 3 (synthesis-deal-scorer, scenario-modeler, etc.)

  // Ligne 259 : Tier 3 est decrit comme "Expert Sectoriel" (1 expert specialise)
  Tier 3: Expert Sectoriel
  // -> En realite, c'est le Tier 2 (saas-expert, fintech-expert, etc.)
  ```

Confirmation dans l'architecture reelle :
- `TIER2_AGENTS` dans `analysis-constants.ts` (ligne 106) = experts sectoriels (saas-expert, marketplace-expert, etc.)
- `TIER3_AGENTS` dans `analysis-constants.ts` (ligne 119) = agents de synthese (synthesis-deal-scorer, scenario-modeler, etc.)

De plus, dans le plan FREE de `types.ts` (ligne 20), les tiers disponibles sont `['TIER_1', 'SYNTHESIS']`, et dans le plan PRO (ligne 27) `['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS']`. Le fait que FREE inclut `SYNTHESIS` (qui correspond au Tier 3) est etrange mais coherent avec la logique actuelle ou le plan FREE lance `tier1_complete` qui inclut un scoring de synthese simplifie.

**Probleme 3 : Prix extra Board inconsistant**

- **Fichier** : `pricing/page.tsx`, ligne 375 : `79 EUR/session`
- **Fichier** : `credits/types.ts`, ligne 28 : `extraBoardPrice: 59`

### Correction

**1. Creer une source de verite unique pour les quotas**

Creer le fichier `/Users/sacharebbouh/Desktop/angeldesk/src/config/plan-config.ts` :

```ts
// =============================================================================
// SOURCE DE VERITE UNIQUE - Plans et quotas
// Tout fichier qui a besoin de limites/prix DOIT importer depuis ici
// =============================================================================

export type PlanType = 'FREE' | 'PRO';

export const PLAN_CONFIG = {
  FREE: {
    name: 'Gratuit',
    price: 0,
    currency: 'EUR',
    analysesPerMonth: 3,
    updatesPerDeal: 2,
    boardsPerMonth: 0,
    extraBoardPrice: null as number | null,
    tiers: ['TIER_1', 'SYNTHESIS'] as const,
    maxTier: 1,
    features: {
      screening: true,
      deepAnalysis: false,
      sectorExpert: false,
      aiBoard: false,
      negotiation: false,
      memo: false,
    },
  },
  PRO: {
    name: 'PRO',
    price: 249,
    currency: 'EUR',
    analysesPerMonth: 20,
    updatesPerDeal: -1, // illimite
    boardsPerMonth: 5,
    extraBoardPrice: 59,
    tiers: ['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS'] as const,
    maxTier: 3,
    features: {
      screening: true,
      deepAnalysis: true,
      sectorExpert: true,
      aiBoard: true,
      negotiation: true,
      memo: true,
    },
  },
} as const;

// Labels corriges pour l'UI pricing
export const TIER_DESCRIPTIONS = {
  TIER_1: {
    name: 'Tier 1 : Screening rapide',
    description: '13 agents en parallele - 2 min',
    agents: 13,
  },
  TIER_2: {
    name: 'Tier 2 : Expert sectoriel',
    description: '1 expert specialise selon le secteur',
    agents: 1,
  },
  TIER_3: {
    name: 'Tier 3 : Synthese & scoring',
    description: '5 agents de synthese, scenarios, memo',
    agents: 5,
  },
} as const;
```

**2. Corriger la page pricing** (`pricing/page.tsx`)

```diff
// Ligne 63 : Corriger le nombre de deals
- <PricingFeature included>5 deals analysés/mois</PricingFeature>
+ <PricingFeature included>3 deals analysés/mois</PricingFeature>

// Lignes 67-68 : Corriger la nomenclature des tiers
- <PricingFeature>Tier 2: Deep Analysis</PricingFeature>
- <PricingFeature>Tier 3: Expert Sectoriel</PricingFeature>
+ <PricingFeature>Tier 2 : Expert sectoriel</PricingFeature>
+ <PricingFeature>Tier 3 : Synthèse & scoring</PricingFeature>

// Lignes 107-108 : Idem pour le plan PRO
- <PricingFeature included>Tier 2: Deep Analysis</PricingFeature>
- <PricingFeature included>Tier 3: Expert Sectoriel</PricingFeature>
+ <PricingFeature included>Tier 2 : Expert sectoriel</PricingFeature>
+ <PricingFeature included>Tier 3 : Synthèse & scoring</PricingFeature>

// Section Tier 2 (lignes 194-248) : INVERSER avec Tier 3
// Tier 2 doit decrire l'expert sectoriel (SaaS, FinTech, etc.)
// Titre ligne 203 :
- Tier 2: Deep Analysis
+ Tier 2 : Expert sectoriel

// Description ligne 206 :
- 5 agents de synthèse • +3 min
+ 1 expert spécialisé selon le secteur • +2 min

// Contenu : remplacer les agents synthesis par les experts sectoriels
// (SaaS Expert, FinTech Expert, Marketplace Expert, etc.)

// Section Tier 3 (lignes 250-309) : INVERSER avec Tier 2
// Tier 3 doit decrire la synthese
// Titre ligne 259 :
- Tier 3: Expert Sectoriel
+ Tier 3 : Synthèse & scoring

// Description ligne 263 :
- 1 expert spécialisé • +2 min
+ 5 agents de synthèse • +3 min

// Contenu : remplacer les experts sectoriels par les agents de synthese
// (Synthesis Scorer, Scenario Modeler, Devil's Advocate, etc.)

// Ligne 375 : Corriger le prix extra Board
- Sessions supplémentaires : 79 €/session
+ Sessions supplémentaires : 59 €/session
```

**3. Mettre a jour les imports dans `credits/types.ts` et `deal-limits/index.ts`**

A terme, ces fichiers doivent importer depuis `plan-config.ts` au lieu de dupliquer les valeurs. En attendant, s'assurer que toutes les valeurs sont alignees sur 3 deals FREE.

### Dependances
- Aucune autre faille directement liee, mais F61 (i18n) impacte aussi les labels de cette page.

### Verification
1. Ouvrir `/pricing` : verifier que FREE affiche "3 deals analyses/mois"
2. Verifier que Tier 2 = Expert sectoriel et Tier 3 = Synthese & scoring
3. Verifier que le prix extra Board affiche 59 EUR
4. Dashboard : verifier que "3 deals/mois" est affiche pour les FREE
5. Test unitaire : `usage-gate.test.ts` doit toujours passer avec `analysesPerMonth: 3`

---

## F61 -- Zero i18n / labels bilingues inconsistants

### Diagnostic

**Fichier principal** : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/format-utils.ts`, lignes 5-42

Tous les noms d'agents sont en anglais :
```ts
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  "financial-auditor": "Financial Auditor",
  "team-investigator": "Team Investigator",
  "competitive-intel": "Competitive Intel",
  "deck-forensics": "Deck Forensics",
  "market-intelligence": "Market Intelligence",
  // ... tous en anglais
};
```

**Autres fichiers avec labels anglais visibles dans l'UI** :

- `tier1-results.tsx` : `<CardTitle>Audit Financier</CardTitle>` (l.210) -- celui-ci est en FR
  Mais : `<CardTitle>Team Investigation</CardTitle>` (l.524), `<CardTitle>Competitive Intel</CardTitle>` (l.677), `<CardTitle>Deck Forensics</CardTitle>` (l.805), `<CardTitle>Market Intelligence</CardTitle>` (l.978)
- `tier3-results.tsx` : `Score Final` (l.142), `"Strong Pass"` / `"Conditional"` / `"Weak Pass"` / `"No Go"` (l.78-84), `"Investir"` / `"Passer"` / `"Negocier"` (l.93-97 -- mix FR/EN)
- `tier2-results.tsx` : `"SaaS Expert"`, `"Marketplace Expert"` etc. dans `SECTOR_CONFIG` (analysis-constants.ts l.193-204)
- `analysis-constants.ts` : `MATURITY_CONFIG` (l.213-217) tout en anglais : `"Emerging"`, `"Growing"`, `"Mature"`, `"Declining"` ; `ASSESSMENT_CONFIG` (l.223-229) : `"Exceptional"`, `"Above Avg"`, etc. ; `SEVERITY_CONFIG` (l.235-239) : `"Critical"`, `"Major"`, `"Minor"`
- `confidence-breakdown.tsx` : `FACTOR_ICONS` keys en anglais (l.34-39) : `"Data Availability"`, `"Evidence Quality"`, etc.

### Correction

**1. Creer un fichier de traductions centralise**

Creer `/Users/sacharebbouh/Desktop/angeldesk/src/config/labels-fr.ts` :

```ts
// =============================================================================
// LABELS FRANCAIS - Source de verite pour tous les textes UI
// Cible : Business Angels francophones
// =============================================================================

// --- Noms d'agents ---
export const AGENT_LABELS_FR: Record<string, string> = {
  // Base
  "red-flag-detector": "Detection de risques",
  "document-extractor": "Extraction de documents",
  "deal-scorer": "Scoring du deal",
  // Tier 1
  "financial-auditor": "Audit financier",
  "team-investigator": "Investigation equipe",
  "competitive-intel": "Intelligence concurrentielle",
  "deck-forensics": "Analyse du pitch deck",
  "market-intelligence": "Intelligence marche",
  "tech-stack-dd": "DD Stack technique",
  "tech-ops-dd": "DD Operations tech",
  "legal-regulatory": "Juridique & reglementaire",
  "cap-table-auditor": "Audit cap table",
  "gtm-analyst": "Analyse GTM",
  "customer-intel": "Intelligence client",
  "exit-strategist": "Strategie de sortie",
  "question-master": "Questions au fondateur",
  // Tier 2
  "saas-expert": "Expert SaaS",
  "marketplace-expert": "Expert Marketplace",
  "fintech-expert": "Expert FinTech",
  "healthtech-expert": "Expert HealthTech",
  "ai-expert": "Expert IA",
  "deeptech-expert": "Expert DeepTech",
  "climate-expert": "Expert Climate",
  "hardware-expert": "Expert Hardware",
  "gaming-expert": "Expert Gaming",
  "consumer-expert": "Expert Consumer",
  "blockchain-expert": "Expert Blockchain",
  // Tier 3
  "contradiction-detector": "Detection de contradictions",
  "scenario-modeler": "Modelisation de scenarios",
  "synthesis-deal-scorer": "Scoring de synthese",
  "devils-advocate": "Avocat du diable",
  "memo-generator": "Generation du memo",
};

// --- Verdicts ---
export const VERDICT_LABELS_FR: Record<string, string> = {
  strong_pass: "Forte conviction",
  pass: "Favorable",
  conditional_pass: "Conditionnel",
  weak_pass: "Reserve",
  no_go: "Ne pas investir",
};

// --- Maturite ---
export const MATURITY_LABELS_FR: Record<string, string> = {
  emerging: "Emergent",
  growing: "En croissance",
  mature: "Mature",
  declining: "En declin",
};

// --- Evaluation ---
export const ASSESSMENT_LABELS_FR: Record<string, string> = {
  exceptional: "Exceptionnel",
  above_average: "Au-dessus de la moyenne",
  average: "Dans la moyenne",
  below_average: "En-dessous de la moyenne",
  concerning: "Preoccupant",
};

// --- Severite ---
export const SEVERITY_LABELS_FR: Record<string, string> = {
  critical: "Critique",
  major: "Majeur",
  minor: "Mineur",
};

// --- Facteurs de confiance ---
export const CONFIDENCE_FACTOR_LABELS_FR: Record<string, string> = {
  "Data Availability": "Disponibilite des donnees",
  "Evidence Quality": "Qualite des preuves",
  "Benchmark Match": "Correspondance benchmarks",
  "Source Reliability": "Fiabilite des sources",
  "Temporal Relevance": "Pertinence temporelle",
};

// --- Secteur experts ---
export const SECTOR_LABELS_FR: Record<string, string> = {
  "saas-expert": "Expert SaaS",
  "marketplace-expert": "Expert Marketplace",
  "fintech-expert": "Expert FinTech",
  "healthtech-expert": "Expert HealthTech",
  "ai-expert": "Expert IA",
  "deeptech-expert": "Expert DeepTech",
  "climate-expert": "Expert CleanTech",
  "hardware-expert": "Expert Hardware & IoT",
  "gaming-expert": "Expert Gaming",
  "consumer-expert": "Expert D2C & Consumer",
};
```

**2. Mettre a jour `format-utils.ts`**

Remplacer `AGENT_DISPLAY_NAMES` par des imports depuis `labels-fr.ts` :
```ts
import { AGENT_LABELS_FR } from '@/config/labels-fr';

export const AGENT_DISPLAY_NAMES = AGENT_LABELS_FR;
```

**3. Mettre a jour les titres de cartes dans `tier1-results.tsx`**

```diff
// Ligne 524
- <CardTitle className="text-lg">Team Investigation</CardTitle>
+ <CardTitle className="text-lg">Investigation equipe</CardTitle>

// Ligne 677
- <CardTitle className="text-lg">Competitive Intel</CardTitle>
+ <CardTitle className="text-lg">Intelligence concurrentielle</CardTitle>

// Ligne 805
- <CardTitle className="text-lg">Deck Forensics</CardTitle>
+ <CardTitle className="text-lg">Analyse du pitch deck</CardTitle>

// Ligne 978
- <CardTitle className="text-lg">Market Intelligence</CardTitle>
+ <CardTitle className="text-lg">Intelligence marche</CardTitle>
```

**4. Mettre a jour `VERDICT_CONFIG` dans `tier3-results.tsx`** (ligne 78-84) :

```diff
const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
-  strong_pass: { label: "Strong Pass", ... },
-  pass: { label: "Pass", ... },
-  conditional_pass: { label: "Conditional", ... },
-  weak_pass: { label: "Weak Pass", ... },
-  no_go: { label: "No Go", ... },
+  strong_pass: { label: "Forte conviction", ... },
+  pass: { label: "Favorable", ... },
+  conditional_pass: { label: "Conditionnel", ... },
+  weak_pass: { label: "Reservé", ... },
+  no_go: { label: "Ne pas investir", ... },
};
```

**5. Mettre a jour `MATURITY_CONFIG`, `ASSESSMENT_CONFIG`, `SEVERITY_CONFIG` dans `analysis-constants.ts`** (lignes 212-239) :

Remplacer les labels anglais par les equivalents francais du fichier `labels-fr.ts`.

### Dependances
- F90 (accents manquants) : les labels FR ci-dessus doivent avoir les accents corrects.

### Verification
1. Naviguer sur un deal avec resultats Tier 1 : tous les titres de cartes sont en francais
2. Naviguer sur les resultats Tier 3 : verdicts en francais
3. Verifier qu'aucun label anglais n'apparait dans l'UI visible (hors termes techniques acceptes comme "SaaS", "GTM", "NRR")

---

## F64 -- Projections vs faits insuffisamment visible

### Diagnostic

Le systeme de `DataReliability` existe dans `/Users/sacharebbouh/Desktop/angeldesk/src/services/fact-store/types.ts` (lignes 54-60) avec 6 niveaux :
```ts
export type DataReliability =
  | 'AUDITED'       // Confirme par audit externe
  | 'VERIFIED'      // Cross-verifie via sources multiples
  | 'DECLARED'      // Declare dans le deck sans verification
  | 'PROJECTED'     // Projection future
  | 'ESTIMATED'     // Calcule/deduit par l'IA
  | 'UNVERIFIABLE'; // Non verifiable
```

Cependant, cette information n'est **jamais exposee** dans les composants de resultats visibles. Dans `tier1-results.tsx`, les metriques financieres (ligne 260-272) affichent la valeur et le percentile mais pas le niveau de fiabilite :

```tsx
{availableMetrics.slice(0, 4).map((m, i) => (
  <div key={i} className="p-3 rounded-lg bg-muted">
    <div className="text-xs text-muted-foreground truncate">{m.metric}</div>
    <div className="text-lg font-bold mt-1">
      {formatAmount(m.reportedValue)}
    </div>
    {m.percentile != null && (
      <div className="text-xs text-muted-foreground">P{m.percentile}</div>
    )}
  </div>
))}
```

Le composant `deck-coherence-report.tsx` a un `reliabilityGrade` mais c'est pour le deck dans son ensemble, pas metrique par metrique.

### Correction

**1. Creer un composant `ReliabilityBadge`**

Creer `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/reliability-badge.tsx` :

```tsx
"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, FileQuestion, TrendingUp, Calculator, HelpCircle } from "lucide-react";

type DataReliability = 'AUDITED' | 'VERIFIED' | 'DECLARED' | 'PROJECTED' | 'ESTIMATED' | 'UNVERIFIABLE';

const RELIABILITY_CONFIG: Record<DataReliability, {
  label: string;
  shortLabel: string;
  color: string;
  icon: React.ElementType;
  tooltip: string;
}> = {
  AUDITED: {
    label: "Audite",
    shortLabel: "Audite",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: ShieldCheck,
    tooltip: "Confirme par un audit externe ou des releves bancaires",
  },
  VERIFIED: {
    label: "Verifie",
    shortLabel: "Verifie",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    icon: ShieldCheck,
    tooltip: "Croise et confirme par plusieurs sources independantes",
  },
  DECLARED: {
    label: "Declare",
    shortLabel: "Declare",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: FileQuestion,
    tooltip: "Chiffre annonce par le fondateur, non verifie de maniere independante",
  },
  PROJECTED: {
    label: "Projection",
    shortLabel: "Proj.",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    icon: TrendingUp,
    tooltip: "Projection future basee sur un business plan ou previsions",
  },
  ESTIMATED: {
    label: "Estime",
    shortLabel: "Estime",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Calculator,
    tooltip: "Calcule ou deduit par l'IA a partir de donnees partielles",
  },
  UNVERIFIABLE: {
    label: "Non verifiable",
    shortLabel: "N/V",
    color: "bg-gray-100 text-gray-500 border-gray-300",
    icon: HelpCircle,
    tooltip: "Impossible a verifier avec les donnees disponibles",
  },
};

interface ReliabilityBadgeProps {
  reliability: DataReliability;
  compact?: boolean;
  className?: string;
}

export const ReliabilityBadge = memo(function ReliabilityBadge({
  reliability,
  compact = true,
  className,
}: ReliabilityBadgeProps) {
  const config = RELIABILITY_CONFIG[reliability];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium cursor-help gap-0.5 px-1.5 py-0",
              config.color,
              className
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {compact ? config.shortLabel : config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{config.label}</p>
          <p className="text-sm text-muted-foreground">{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
```

**2. Integrer dans `tier1-results.tsx` -- grille de metriques (ligne 260)**

```diff
{availableMetrics.slice(0, 4).map((m, i) => (
  <div key={i} className="p-3 rounded-lg bg-muted">
-   <div className="text-xs text-muted-foreground truncate">{m.metric}</div>
+   <div className="flex items-center gap-1">
+     <span className="text-xs text-muted-foreground truncate">{m.metric}</span>
+     {m.reliability && (
+       <ReliabilityBadge reliability={m.reliability} compact />
+     )}
+   </div>
    <div className="text-lg font-bold mt-1">
      {typeof m.reportedValue === "number"
        ? formatAmount(m.reportedValue)
        : m.reportedValue ?? "N/A"}
    </div>
    {m.percentile != null && (
      <div className="text-xs text-muted-foreground">P{m.percentile}</div>
    )}
  </div>
))}
```

**3. Integrer dans la section Valorisation (ligne 328-348) et Burn (ligne 290-310)**

Ajouter `ReliabilityBadge` a cote de chaque valeur cle.

### Dependances
- Les agents Tier 1 doivent retourner le champ `reliability` dans leurs metriques. Verifier que `FinancialAuditData.findings.metrics[].reliability` existe dans les types (`/Users/sacharebbouh/Desktop/angeldesk/src/agents/types.ts`). Si absent, ajouter le champ optionnel.

### Verification
1. Lancer une analyse sur un deal avec pitch deck
2. Verifier que chaque metrique cle (ARR, MRR, burn, etc.) affiche un petit badge colore (vert=Audite, jaune=Declare, orange=Projection)
3. Hover sur le badge : le tooltip explique le niveau de fiabilite
4. Les metriques sans `reliability` ne montrent pas de badge (graceful fallback)

---

## F65 -- Percentiles sans contexte

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`, lignes 268-270
```tsx
{m.percentile != null && (
  <div className="text-xs text-muted-foreground">P{m.percentile}</div>
)}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/react-trace-viewer.tsx`, lignes 100-103
```tsx
<Badge variant="outline" className={cn("text-xs flex items-center gap-1", getColor(percentile))}>
  {getIcon(percentile)}
  P{percentile}
</Badge>
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier2-results.tsx`, lignes 437-438
```tsx
<div className="text-sm text-slate-500">Percentile</div>
<div className="text-2xl font-semibold text-slate-700">P{valuation.percentilePosition}</div>
```

**Fichier** : `tier2-results.tsx`, ligne 765
```tsx
<span>Benchmark: P25={metric.sectorBenchmark.p25}, Median={metric.sectorBenchmark.median}, P75={metric.sectorBenchmark.p75}</span>
```

**Fichier** : `tier3-results.tsx`, lignes 206, 210
```tsx
<p className="text-xs text-muted-foreground">Percentile Global</p>
<p className="text-xs text-muted-foreground">Percentile Secteur</p>
```

**Fichier** : `tier1-results.tsx`, lignes 2513-2514
```tsx
{retention.nrr.percentile && (
  <div className="text-xs text-muted-foreground">P{retention.nrr.percentile}</div>
)}
```

### Correction

**1. Creer une fonction utilitaire `formatPercentile`**

Ajouter dans `/Users/sacharebbouh/Desktop/angeldesk/src/lib/format-utils.ts` :

```ts
/**
 * Convertit un percentile en langage clair pour un BA non-technique.
 * P75 -> "Top 25% du marche"
 * P50 -> "Mediane du marche"
 * P25 -> "Bas 25% du marche"
 */
export function formatPercentile(percentile: number): string {
  if (percentile >= 90) return `Top 10% du marche`;
  if (percentile >= 75) return `Top 25% du marche`;
  if (percentile >= 50) return `Au-dessus de la mediane`;
  if (percentile >= 25) return `En-dessous de la mediane`;
  return `Bas 25% du marche`;
}

/**
 * Version courte pour les espaces restreints
 */
export function formatPercentileShort(percentile: number): string {
  if (percentile >= 90) return `Top 10%`;
  if (percentile >= 75) return `Top 25%`;
  if (percentile >= 50) return `> Mediane`;
  if (percentile >= 25) return `< Mediane`;
  return `Bas 25%`;
}
```

**2. Remplacer dans `tier1-results.tsx`** (ligne 269)

```diff
{m.percentile != null && (
- <div className="text-xs text-muted-foreground">P{m.percentile}</div>
+ <div className="text-xs text-muted-foreground">{formatPercentileShort(m.percentile)}</div>
)}
```

**3. Remplacer dans `react-trace-viewer.tsx`** -- composant `PercentileBadge` (lignes 85-105)

```diff
return (
  <Badge variant="outline" className={cn("text-xs flex items-center gap-1", getColor(percentile))}>
    {getIcon(percentile)}
-   P{percentile}
+   {formatPercentileShort(percentile)}
  </Badge>
);
```

**4. Remplacer dans `tier2-results.tsx`** (lignes 437-438)

```diff
- <div className="text-sm text-slate-500">Percentile</div>
- <div className="text-2xl font-semibold text-slate-700">P{valuation.percentilePosition}</div>
+ <div className="text-sm text-slate-500">Position marche</div>
+ <div className="text-2xl font-semibold text-slate-700">{formatPercentileShort(valuation.percentilePosition)}</div>
```

**5. Remplacer dans `tier2-results.tsx`** (ligne 765)

```diff
- <span>Benchmark: P25={metric.sectorBenchmark.p25}, Median={metric.sectorBenchmark.median}, P75={metric.sectorBenchmark.p75}</span>
+ <span>Benchmark : Bas 25% = {metric.sectorBenchmark.p25}, Mediane = {metric.sectorBenchmark.median}, Top 25% = {metric.sectorBenchmark.p75}</span>
```

**6. Remplacer dans `tier3-results.tsx`** (lignes 206, 210)

```diff
- <p className="text-xs text-muted-foreground">Percentile Global</p>
+ <p className="text-xs text-muted-foreground">Position globale</p>
// Note : la valeur est deja un % (ex: 72%) donc afficher "Top 28%" n'a pas de sens
// Mieux : afficher "72e sur 100" ou garder le % avec le contexte "parmi tous les deals"

- <p className="text-xs text-muted-foreground">Percentile Secteur</p>
+ <p className="text-xs text-muted-foreground">Position dans le secteur</p>
```

**7. Remplacer dans `tier1-results.tsx`** (ligne 2514)

```diff
- <div className="text-xs text-muted-foreground">P{retention.nrr.percentile}</div>
+ <div className="text-xs text-muted-foreground">{formatPercentileShort(retention.nrr.percentile)}</div>
```

### Dependances
- Aucune dependance directe.

### Verification
1. Ouvrir un deal avec analyse complete
2. Verifier que "P75" n'apparait plus nulle part dans l'UI
3. A la place : "Top 25%", "> Mediane", "< Mediane", "Bas 25%"
4. Les tooltips sur les benchmarks montrent la signification

---

## F66 -- Alerts dans la table sans explication

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`, lignes 114-123

```tsx
<TableCell>
  {criticalFlags > 0 ? (
    <div className="flex items-center gap-1 text-destructive">
      <AlertTriangle className="h-4 w-4" />
      <span>{criticalFlags}</span>
    </div>
  ) : (
    <span className="text-muted-foreground">-</span>
  )}
</TableCell>
```

Le triangle rouge avec un nombre n'a aucun tooltip ni explication. L'utilisateur ne sait pas ce que represente le nombre.

### Correction

**Ajouter un tooltip avec resume des red flags**

```diff
+ import {
+   Tooltip,
+   TooltipContent,
+   TooltipProvider,
+   TooltipTrigger,
+ } from "@/components/ui/tooltip";

// Modifier l'interface Deal pour inclure les titres des red flags
interface Deal {
  // ... champs existants
  redFlags: { severity: string; title?: string }[];
}

// Dans le JSX (lignes 114-123) :
<TableCell>
  {criticalFlags > 0 ? (
-   <div className="flex items-center gap-1 text-destructive">
-     <AlertTriangle className="h-4 w-4" />
-     <span>{criticalFlags}</span>
-   </div>
+   <TooltipProvider>
+     <Tooltip>
+       <TooltipTrigger asChild>
+         <div className="flex items-center gap-1 text-destructive cursor-help">
+           <AlertTriangle className="h-4 w-4" />
+           <span>{criticalFlags}</span>
+         </div>
+       </TooltipTrigger>
+       <TooltipContent side="left" className="max-w-xs">
+         <p className="font-medium mb-1">
+           {criticalFlags} alerte{criticalFlags > 1 ? "s" : ""} critique{criticalFlags > 1 ? "s" : ""}
+         </p>
+         <ul className="text-sm space-y-0.5">
+           {deal.redFlags
+             .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
+             .slice(0, 3)
+             .map((f, i) => (
+               <li key={i} className="flex items-start gap-1">
+                 <span className="text-red-400">•</span>
+                 <span>{f.title ?? `Red flag ${f.severity}`}</span>
+               </li>
+             ))}
+           {criticalFlags > 3 && (
+             <li className="text-xs text-muted-foreground">
+               +{criticalFlags - 3} autre{criticalFlags - 3 > 1 ? "s" : ""}...
+             </li>
+           )}
+         </ul>
+       </TooltipContent>
+     </Tooltip>
+   </TooltipProvider>
  ) : (
    <span className="text-muted-foreground">-</span>
  )}
</TableCell>
```

**Aussi, changer le header de colonne** (ligne 72) :

```diff
- <TableHead>Alerts</TableHead>
+ <TableHead>Alertes</TableHead>
```

**Note** : Verifier que l'API qui fournit les deals retourne bien `title` dans les red flags. Si ce n'est pas le cas, modifier la query Prisma dans la route API pour inclure `select: { severity: true, title: true }`.

### Dependances
- La route API des deals doit retourner `redFlags.title`. Verifier dans `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/deals/route.ts`.

### Verification
1. Ouvrir la page deals (liste)
2. Survoler le triangle rouge : un tooltip affiche le nombre et la liste des alertes
3. Les deals sans alertes affichent toujours "-"
4. Le header de colonne dit "Alertes" au lieu de "Alerts"

---

## F67 -- Termes de negociation sans aide

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/negotiation-panel.tsx`

Ligne 46-56 -- Les configs ont des labels bruts sans explication :
```ts
const LEVERAGE_CONFIG = {
  strong: { color: "...", label: "Fort" },
  moderate: { color: "...", label: "Modere" },
  weak: { color: "...", label: "Faible" },
};

const PRIORITY_CONFIG = {
  must_have: { color: "...", label: "Must Have" },
  nice_to_have: { color: "...", label: "Nice to Have" },
  optional: { color: "...", label: "Optionnel" },
};
```

Le composant `LeverageBadge` (ligne 78-89) affiche juste "Leverage: Fort" sans explication :
```tsx
<Badge variant="outline" className={cn("text-sm font-medium", color)}>
  Leverage: {label}
</Badge>
```

Le composant `PriorityBadge` (ligne 91-102) affiche "Must Have" sans explication.

### Correction

**1. Ajouter des tooltips a chaque config**

```diff
const LEVERAGE_CONFIG = {
- strong: { color: "...", label: "Fort" },
- moderate: { color: "...", label: "Modere" },
- weak: { color: "...", label: "Faible" },
+ strong: {
+   color: "bg-green-100 text-green-800 border-green-200",
+   label: "Fort",
+   tooltip: "Vous etes en position de force : le deal a des faiblesses identifiees et/ou vous avez des alternatives. Negociez fermement."
+ },
+ moderate: {
+   color: "bg-yellow-100 text-yellow-800 border-yellow-200",
+   label: "Modere",
+   tooltip: "Position equilibree : le deal est correct mais pas exceptionnel. Vous pouvez negocier sur certains points."
+ },
+ weak: {
+   color: "bg-red-100 text-red-800 border-red-200",
+   label: "Faible",
+   tooltip: "Le deal est attractif et/ou tres demande. Votre marge de negociation est limitee."
+ },
};

const PRIORITY_CONFIG = {
- must_have: { color: "...", label: "Must Have" },
- nice_to_have: { color: "...", label: "Nice to Have" },
- optional: { color: "...", label: "Optionnel" },
+ must_have: {
+   color: "bg-red-100 text-red-800",
+   label: "Indispensable",
+   tooltip: "Point non-negociable. Si vous ne l'obtenez pas, reconsiderez l'investissement."
+ },
+ nice_to_have: {
+   color: "bg-orange-100 text-orange-800",
+   label: "Souhaitable",
+   tooltip: "Point important mais sur lequel vous pouvez faire un compromis si necessaire."
+ },
+ optional: {
+   color: "bg-blue-100 text-blue-800",
+   label: "Optionnel",
+   tooltip: "Bonus a obtenir si possible. Peut servir de monnaie d'echange dans la negociation."
+ },
};
```

**2. Wrapper `LeverageBadge` avec Tooltip** (remplacer lignes 78-89)

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LeverageBadge = memo(function LeverageBadge({
  leverage
}: {
  leverage: NegotiationStrategy["overallLeverage"]
}) {
  const config = LEVERAGE_CONFIG[leverage] ?? { color: "bg-gray-100 text-gray-800", label: "Inconnu", tooltip: "" };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("text-sm font-medium cursor-help", config.color)}>
            Levier : {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
```

**3. Wrapper `PriorityBadge` avec Tooltip** (remplacer lignes 91-102, meme pattern)

**4. Remplacer les labels anglais** : "Must Have" -> "Indispensable", "Nice to Have" -> "Souhaitable" (deja fait dans la config ci-dessus)

### Dependances
- F61 (i18n) : "Leverage" -> "Levier", "Must Have" -> "Indispensable"
- F90 (accents) : "Modere" -> "Modere" (manque accent dans l'actuel)

### Verification
1. Ouvrir un deal avec strategie de negociation
2. Survoler "Levier : Fort" : tooltip explicatif apparait
3. Survoler "Indispensable" : tooltip explicatif apparait
4. Tous les labels sont en francais

---

## F68 -- Pas de comparaison deck vs marche explicite

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`, lignes 328-348

La section Valorisation affiche les multiples cote a cote sans phrase de synthese :
```tsx
<div className="grid grid-cols-2 gap-3 text-sm">
  <div>
    <span className="text-muted-foreground">Valo demandée:</span>{" "}
    <span className="font-medium">{formatAmount(data.findings.valuation.requested)}</span>
  </div>
  <div>
    <span className="text-muted-foreground">Multiple implicite:</span>{" "}
    <span className="font-medium">
      {safeFixed(data.findings.valuation.impliedMultiple, 1)}x
    </span>
    <span className="text-xs text-muted-foreground ml-1">
      (bench: {data.findings.valuation.benchmarkMultiple}x)
    </span>
  </div>
</div>
```

L'utilisateur voit `3.2x` et `(bench: 2.1x)` mais ne comprend pas si c'est bien ou mal.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier2-results.tsx`, lignes 425-443

Meme probleme dans la section valuation de l'expert sectoriel : les multiples sont affiches sans synthese.

### Correction

**1. Ajouter une phrase de synthese sous les multiples dans `tier1-results.tsx`**

Apres la div `grid grid-cols-2` (apres ligne 348), ajouter :

```tsx
{/* Phrase de synthese comparaison deck vs marche */}
{data.findings.valuation.impliedMultiple != null && data.findings.valuation.benchmarkMultiple != null && (
  <div className={cn(
    "mt-2 p-2 rounded text-sm font-medium",
    data.findings.valuation.impliedMultiple > data.findings.valuation.benchmarkMultiple * 1.3
      ? "bg-red-50 text-red-800 border border-red-200"
      : data.findings.valuation.impliedMultiple > data.findings.valuation.benchmarkMultiple * 1.1
      ? "bg-orange-50 text-orange-800 border border-orange-200"
      : data.findings.valuation.impliedMultiple >= data.findings.valuation.benchmarkMultiple * 0.9
      ? "bg-green-50 text-green-800 border border-green-200"
      : "bg-blue-50 text-blue-800 border border-blue-200"
  )}>
    {(() => {
      const ratio = data.findings.valuation.impliedMultiple / data.findings.valuation.benchmarkMultiple;
      const diff = Math.round((ratio - 1) * 100);
      if (diff > 30) return `Ce deal demande un multiple ${diff}% au-dessus du marche. Valorisation agressive, negociez.`;
      if (diff > 10) return `Ce deal est ${diff}% au-dessus de la mediane du marche. Marge de negociation possible.`;
      if (diff >= -10) return `Ce deal est dans la fourchette du marche (ecart ${diff > 0 ? '+' : ''}${diff}%). Valorisation coherente.`;
      return `Ce deal est ${Math.abs(diff)}% en-dessous du marche. Opportunite potentielle ou signal de faiblesse.`;
    })()}
  </div>
)}
```

**2. Ajouter dans `tier2-results.tsx` apres la section valuation** (apres ligne 443)

Meme pattern avec `valuation.askMultiple` et `valuation.medianSectorMultiple`.

### Dependances
- Aucune.

### Verification
1. Ouvrir un deal avec valorisation dans l'analyse
2. Sous les multiples : une phrase coloree indique clairement si la valo est au-dessus, dans la fourchette, ou en-dessous du marche
3. Le texte utilise des pourcentages pour quantifier l'ecart

---

## F69 -- Confiance analyse non expliquee

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`, lignes 507, 1790

```tsx
// Ligne 507 (ScenarioModelerCard)
<Badge variant="outline" className="text-sm bg-white">
  Confiance: {confidenceLevel}%
</Badge>

// Ligne 1790 (Tier3ResultsCard)
<Badge variant="outline" className="border-white/20 text-white">
  Confiance: {scorerData.confidence}%
</Badge>
```

Le label "Confiance: 72%" est ambigu. L'utilisateur peut croire que c'est la probabilite de succes du deal.

Le composant `ConfidenceBreakdown` dans `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/confidence-breakdown.tsx` (lignes 179-302) a une version detaillee avec facteurs, mais elle est utilisee uniquement dans le panneau ReAct, pas dans les badges principaux.

### Correction

**1. Renommer le label et ajouter un tooltip**

Dans `tier3-results.tsx`, ligne 507 :

```diff
- <Badge variant="outline" className="text-sm bg-white">
-   Confiance: {confidenceLevel}%
- </Badge>
+ <TooltipProvider>
+   <Tooltip>
+     <TooltipTrigger asChild>
+       <Badge variant="outline" className="text-sm bg-white cursor-help">
+         Fiabilite donnees : {confidenceLevel}%
+       </Badge>
+     </TooltipTrigger>
+     <TooltipContent side="bottom" className="max-w-xs">
+       <p className="font-medium">Qualite des donnees d'entree</p>
+       <p className="text-sm text-muted-foreground mt-1">
+         Ce score mesure la completude et la fiabilite des donnees utilisees pour cette analyse.
+         Ce n'est PAS une probabilite de succes du deal.
+       </p>
+       <p className="text-xs text-muted-foreground mt-2">
+         100% = Toutes les donnees sont disponibles et verifiees.
+         50% = Donnees partielles, resultats a prendre avec recul.
+       </p>
+     </TooltipContent>
+   </Tooltip>
+ </TooltipProvider>
```

Dans `tier3-results.tsx`, ligne 1790 :

```diff
- <Badge variant="outline" className="border-white/20 text-white">
-   Confiance: {scorerData.confidence}%
- </Badge>
+ <TooltipProvider>
+   <Tooltip>
+     <TooltipTrigger asChild>
+       <Badge variant="outline" className="border-white/20 text-white cursor-help">
+         Fiabilite donnees : {scorerData.confidence}%
+       </Badge>
+     </TooltipTrigger>
+     <TooltipContent side="bottom" className="max-w-xs">
+       <p className="font-medium">Qualite des donnees d'entree</p>
+       <p className="text-sm text-muted-foreground mt-1">
+         Ce score mesure la completude et la fiabilite des donnees disponibles,
+         pas la probabilite de succes du deal.
+       </p>
+     </TooltipContent>
+   </Tooltip>
+ </TooltipProvider>
```

**2. Mettre a jour aussi `early-warnings-panel.tsx`** (ligne 85)

```diff
- <span>Confiance: {warning.confidence}%</span>
+ <span>Fiabilite : {warning.confidence}%</span>
```

**3. Mettre a jour le label dans `confidence-breakdown.tsx`** (ligne 148)

```diff
- <span className="font-medium">Confiance: {levelInfo.text}</span>
+ <span className="font-medium">Qualite des donnees : {levelInfo.text}</span>
```

### Dependances
- F61 (i18n) : Les labels de facteurs (`"Data Availability"` etc.) doivent etre traduits.

### Verification
1. Ouvrir un deal avec resultats Tier 3
2. Le badge affiche "Fiabilite donnees : 72%" au lieu de "Confiance: 72%"
3. Survoler le badge : tooltip explicatif qui clarifie que ce n'est PAS une probabilite de succes
4. Le composant ConfidenceBreakdown affiche "Qualite des donnees" dans son header

---

## F84 -- Progression analyse opaque

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-progress.tsx`

Le composant affiche 3-4 etapes generiques :
```ts
// FREE plan - 3 steps
{ id: "extraction", label: "Extraction des documents", duration: 15 },
{ id: "investigation", label: "Investigation", duration: 60 },
{ id: "scoring", label: "Scoring", duration: 30 },

// PRO plan - 4 steps
{ id: "extraction", label: "Extraction des documents", duration: 15 },
{ id: "tier1", label: "Investigation approfondie", duration: 90 },
{ id: "tier2", label: "Expert sectoriel", duration: 45 },
{ id: "tier3", label: "Synthese & Scoring", duration: 60 },
```

Les etapes sont purement basees sur le temps (timer), sans aucun feedback reel des agents. L'utilisateur ne sait pas quel agent tourne, lequel a termine, lequel a echoue.

### Correction

**1. Modifier l'interface pour accepter le statut reel des agents**

```ts
export interface AgentStatus {
  agentName: string;
  displayName: string;
  status: "pending" | "running" | "completed" | "error";
  executionTimeMs?: number;
  error?: string;
}

export interface AnalysisProgressProps {
  isRunning: boolean;
  onComplete?: () => void;
  analysisType?: "tier1_complete" | "full_analysis";
  // NOUVEAU : statut reel des agents si disponible
  agentStatuses?: AgentStatus[];
}
```

**2. Ajouter un mode "detail par agent" sous chaque etape**

Modifier le composant pour qu'il affiche les agents individuels quand `agentStatuses` est fourni :

```tsx
// Dans le rendu de chaque step, ajouter un sous-listing expandable
{step.id === "tier1" && agentStatuses && agentStatuses.length > 0 && status === "running" && (
  <div className="ml-9 mt-1 space-y-0.5">
    {agentStatuses
      .filter(a => TIER1_AGENT_NAMES.includes(a.agentName))
      .map((agent) => (
        <div key={agent.agentName} className="flex items-center gap-2 text-xs">
          {agent.status === "completed" ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : agent.status === "running" ? (
            <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
          ) : agent.status === "error" ? (
            <XCircle className="h-3 w-3 text-red-500" />
          ) : (
            <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
          )}
          <span className={cn(
            agent.status === "completed" ? "text-muted-foreground" :
            agent.status === "running" ? "text-foreground" :
            agent.status === "error" ? "text-red-600" :
            "text-muted-foreground/50"
          )}>
            {agent.displayName}
          </span>
          {agent.executionTimeMs != null && agent.status === "completed" && (
            <span className="text-muted-foreground/50">
              ({(agent.executionTimeMs / 1000).toFixed(1)}s)
            </span>
          )}
          {agent.status === "error" && agent.error && (
            <span className="text-red-500 truncate max-w-[150px]" title={agent.error}>
              {agent.error}
            </span>
          )}
        </div>
      ))}
  </div>
)}
```

**3. Alimenter `agentStatuses` depuis le parent (`analysis-panel.tsx`)**

Le parent doit passer les statuts recus via SSE/polling. Si le backend ne renvoie pas encore les statuts agent par agent en temps reel, utiliser les resultats partiels deja disponibles dans `liveResult` pour deduire quels agents ont termine.

Dans `analysis-panel.tsx`, construire `agentStatuses` depuis les resultats partiels :

```ts
const agentStatuses = useMemo<AgentStatus[]>(() => {
  if (!liveResult?.results) return [];
  return Object.entries(liveResult.results).map(([name, result]) => ({
    agentName: name,
    displayName: formatAgentName(name),
    status: result.success ? "completed" : result.error ? "error" : "running",
    executionTimeMs: result.executionTimeMs,
    error: result.error,
  }));
}, [liveResult?.results]);
```

**4. Conserver le mode timer comme fallback**

Si `agentStatuses` est vide ou non fourni, le composant continue de fonctionner en mode timer (comportement actuel). Cela garantit la retro-compatibilite.

### Dependances
- Necessite que l'analyse envoie des resultats partiels (deja le cas via les updates de `liveResult` dans `analysis-panel.tsx`).

### Verification
1. Lancer une analyse sur un deal
2. Pendant le Tier 1 : voir la liste des 13 agents avec leur statut individuel
3. Les agents termines montrent un check vert + temps d'execution
4. Les agents en cours montrent un spinner bleu
5. Les agents en erreur montrent une icone rouge + message
6. Les agents en attente montrent un cercle vide

---

## F90 -- Accents manquants dans l'UI

### Diagnostic

Recherche exhaustive des chaines sans accents dans les fichiers de composants :

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/negotiation-panel.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 48 | `"Modere"` | `"Modéré"` |
| 59 | `"A negocier"` | `"À négocier"` |
| 61 | `"Refuse"` | `"Refusé"` |
| 179 | `"Point de negociation"` | `"Point de négociation"` |
| 366 | `"Resolu"` | `"Résolu"` |
| 467 | `"plan de negociation"` | `"plan de négociation"` |
| 486 | `"Strategie de negociation basee sur l'analyse"` | `"Stratégie de négociation basée sur l'analyse"` |
| 510 | `"Refuses"` | `"Refusés"` |
| 402 | `"Benefice +"` | `"Bénéfice +"` |
| 624 | `"Approche recommandee"` | `"Approche recommandée"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-progress.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 81 | `"Synthese & Scoring"` | `"Synthèse & Scoring"` |
| 181 | `"Analyse terminee"` | `"Analyse terminée"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 410 | `"Analyse terminee"` | `"Analyse terminée"` |
| 431 | `"Analyse terminee"` | `"Analyse terminée"` |
| 588 | `"Reponses enregistrees"` | `"Réponses enregistrées"` |
| 1096 | `"Resultats"` | `"Résultats"` |
| 1096 | `"Analyse sauvegardee"` | `"Analyse sauvegardée"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/react-trace-viewer.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 113 | `"Synthese"` | `"Synthèse"` |
| 270 | `"Confiance apres cette etape"` | `"Confiance après cette étape"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 96 | `"Negocier"` | `"Négocier"` |
| 149 | `"Score final — analyse multi-tiers avec consensus et reflexion"` | `"...réflexion"` |
| 190 | `"Score detaille par dimension"` | `"Score détaillé par dimension"` |
| 191 | `"analysees avec benchmarks"` | `"analysées avec benchmarks"` |
| 503 | `"Modelisation Scenarios"` | `"Modélisation Scénarios"` |
| 511 | `"scenarios avec calculs ROI detailles"` | `"scénarios avec calculs ROI détaillés"` |
| 520 | `"Retour Espere"` | `"Retour Espéré"` |
| 524 | `"Deal evalue NO_GO"` | `"Deal évalué NO_GO"` |
| 541 | `"Multiple pondere"` | `"Multiple pondéré"` |
| 555 | `"IRR ajuste au risque"` | `"IRR ajusté au risque"` |
| 564 | `"Moyenne ponderee"` | `"Moyenne pondérée"` |
| 578 | `"Seuls les scenarios de risque sont affiches"` | `"...scénarios...affichés"` |
| 701 | `"Comparables utilises"` | `"Comparables utilisés"` |
| 773 | `"Analyse de sensibilite"` | `"Analyse de sensibilité"` |
| 1331 | `"Contradictions detectees"` | `"Contradictions détectées"` |
| 1380 | `"Donnees manquantes"` | `"Données manquantes"` |
| 1479 | `"Risques cles"` | `"Risques clés"` |
| 1840 | `"Scenarios modelises"` | `"Scénarios modélisés"` |
| 1852 | `"Contradictions detectees"` | `"Contradictions détectées"` |
| 1855 | `"Detection automatique des incoherences"` | `"Détection automatique des incohérences"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/board-progress.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 73 | `"Session initialisee"` | `"Session initialisée"` |
| 82 | `"Analyse terminee"` | `"Analyse terminée"` |
| 89 | `"Analyse echouee"` | `"Analyse échouée"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/ai-board-panel.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 441 | `"Synthese"` | `"Synthèse"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/board-teaser.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 117 | `"Questions cles"` | `"Questions clés"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/pro-teaser.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 204 | `"Score detaille multi-dimensionnel"` | `"Score détaillé multi-dimensionnel"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/lib/analysis-constants.ts`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 9 | `"12 agents en parallele"` | `"12 agents en parallèle"` |
| 82 | `"Synthese & Scoring"` (dans STEP_TIMINGS) | `"Synthèse & Scoring"` |
| 137 | `"Synthese Tier 3"` | `"Synthèse Tier 3"` |
| 138 | `"Analyse Complete"` | `"Analyse Complète"` |
| 158 | `"A l'instant"` | `"À l'instant"` |

**`/Users/sacharebbouh/Desktop/angeldesk/src/lib/pdf/pdf-sections/negotiation.tsx`** :
| Ligne | Actuel | Correct |
|-------|--------|---------|
| 92 | `"A negocier"` | `"À négocier"` |

### Correction

Pour chaque fichier, utiliser `Edit` avec `replace_all` pour corriger chaque chaine. L'approche recommandee est de corriger fichier par fichier avec des `Edit` cibles.

Exemples de corrections pour les fichiers les plus critiques :

**`negotiation-panel.tsx`** :
```diff
- label: "Modere"
+ label: "Modéré"

- label: "A negocier"
+ label: "À négocier"

- label: "Refuse"
+ label: "Refusé"

- "Strategie de negociation basee sur l'analyse"
+ "Stratégie de négociation basée sur l'analyse"

- "Approche recommandee"
+ "Approche recommandée"
```

**`analysis-panel.tsx`** :
```diff
- toast.success("Analyse terminee");
+ toast.success("Analyse terminée");

- "Resultats"
+ "Résultats"

- "Analyse sauvegardee"
+ "Analyse sauvegardée"
```

**`tier3-results.tsx`** : Corriger les ~20 chaines listees ci-dessus.

### Dependances
- F61 (i18n) : Si le fichier `labels-fr.ts` est cree, y mettre directement les chaines avec accents corrects.
- F67 (termes de negociation) : Les corrections de F67 doivent aussi avoir les bons accents.

### Verification
1. Grep global `"Resultats"|"Donnees"|"terminee"|"Synthese"|"negocier"|"Modere"` dans `src/components` -- doit retourner 0 resultats
2. Parcourir visuellement les pages : deals list, deal detail, negotiation panel, tier3 results
3. Tous les textes ont leurs accents corrects

---

## Resume des dependances entre failles

```
F60 (Pricing) -----> F61 (i18n labels pricing)
F61 (i18n)    -----> F90 (accents dans les nouveaux labels FR)
F64 (Reliability) -> Independant (nouveau composant)
F65 (Percentiles) -> Independant (nouvelle fonction utilitaire)
F66 (Alerts table) -> Independant (ajout tooltip)
F67 (Nego terms) --> F61 (labels FR) + F90 (accents)
F68 (Deck vs marche) -> Independant (ajout phrase synthese)
F69 (Confiance)  --> F61 (labels facteurs en FR)
F84 (Progression) -> Independant (refonte composant)
F90 (Accents)    --> Doit etre fait APRES F61 et F67
```

### Ordre de correction recommande

1. **F60** -- Pricing (source de verite quotas)
2. **F61** -- i18n (fichier labels-fr.ts)
3. **F90** -- Accents (corriger dans toute la codebase)
4. **F64** -- ReliabilityBadge (nouveau composant)
5. **F65** -- Percentiles (nouvelle fonction)
6. **F66** -- Alerts table (tooltip)
7. **F67** -- Nego terms (tooltips)
8. **F68** -- Deck vs marche (phrase synthese)
9. **F69** -- Confiance (renommage + tooltip)
10. **F84** -- Progression (refonte composant)

---

## Fichiers impactes (liste complete)

| Fichier | Failles |
|---------|---------|
| `src/config/plan-config.ts` | F60 (NOUVEAU) |
| `src/config/labels-fr.ts` | F61 (NOUVEAU) |
| `src/components/shared/reliability-badge.tsx` | F64 (NOUVEAU) |
| `src/app/(dashboard)/pricing/page.tsx` | F60 |
| `src/services/credits/types.ts` | F60 |
| `src/services/deal-limits/index.ts` | F60 |
| `src/lib/format-utils.ts` | F61, F65 |
| `src/lib/analysis-constants.ts` | F61, F90 |
| `src/components/deals/tier1-results.tsx` | F61, F64, F65, F68 |
| `src/components/deals/tier2-results.tsx` | F65, F68 |
| `src/components/deals/tier3-results.tsx` | F61, F65, F69, F90 |
| `src/components/deals/deals-table.tsx` | F66, F90 |
| `src/components/deals/negotiation-panel.tsx` | F67, F90 |
| `src/components/deals/analysis-progress.tsx` | F84, F90 |
| `src/components/deals/analysis-panel.tsx` | F84, F90 |
| `src/components/deals/react-trace-viewer.tsx` | F65, F90 |
| `src/components/deals/confidence-breakdown.tsx` | F61, F69 |
| `src/components/deals/early-warnings-panel.tsx` | F69 |
| `src/components/deals/board/board-progress.tsx` | F90 |
| `src/components/deals/board/ai-board-panel.tsx` | F90 |
| `src/components/deals/board/board-teaser.tsx` | F90 |
| `src/components/shared/pro-teaser.tsx` | F90 |
| `src/lib/pdf/pdf-sections/negotiation.tsx` | F90 |
