# Wave 4 - L1 UI Polish
## Spec de correction detaillee pour 4 failles LOW

**Agent** : L1 - UI Polish
**Date** : 2026-02-11
**Fichiers analyses** : 12 fichiers source lus en totalite

---

## F99 -- Vote Board tronque

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/vote-board.tsx`, ligne 275

```tsx
{justification && (
  <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{justification}</p>
)}
```

Le composant `MemberCard` (ligne 176) affiche la justification de chaque membre du Board dans un paragraphe avec `line-clamp-2`. Cette classe Tailwind coupe le texte apres 2 lignes avec des points de suspension, rendant la justification illisible si elle depasse ~80 caracteres.

Le probleme se situe dans la section "Confiance" de chaque card membre, entre les lignes 272-277 :

```tsx
<div className="flex-1 min-w-0">
  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Confiance</p>
  {justification && (
    <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{justification}</p>
  )}
</div>
```

La justification vient de `member.vote?.justification` (ligne 179) qui est un string libre genere par le LLM, typiquement entre 2 et 8 phrases.

**Impact utilisateur** : Le BA ne peut pas lire pourquoi un LLM a vote GO ou NO_GO, ce qui reduit considerablement la valeur de l'AI Board.

### Correction

Transformer la justification en texte expandable avec un toggle clic. On utilise un state local `expanded` et on bascule entre `line-clamp-2` et affichage complet.

**Remplacer le composant `MemberCard`** dans `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/vote-board.tsx` :

**Etape 1** : Ajouter `useState` dans les imports (ligne 3)

```tsx
// AVANT (ligne 3)
import { useMemo, memo } from "react";

// APRES
import { useMemo, memo, useState, useCallback } from "react";
```

**Etape 2** : Ajouter l'import `ChevronDown` et `ChevronUp` (ligne 5)

```tsx
// AVANT (ligne 5)
import { CheckCircle2, XCircle, HelpCircle, Loader2, AlertCircle } from "lucide-react";

// APRES
import { CheckCircle2, XCircle, HelpCircle, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
```

**Etape 3** : Modifier le composant `MemberCard` — ajouter le state et le toggle

Ajouter juste apres la ligne 180 (`const verdictColors = ...`) :

```tsx
const [justificationExpanded, setJustificationExpanded] = useState(false);
const toggleJustification = useCallback(() => setJustificationExpanded(prev => !prev), []);
```

**Etape 4** : Remplacer le bloc justification (lignes 272-277)

```tsx
// AVANT (lignes 272-277)
<div className="flex-1 min-w-0">
  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Confiance</p>
  {justification && (
    <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{justification}</p>
  )}
</div>

// APRES
<div className="flex-1 min-w-0">
  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Confiance</p>
  {justification && (
    <div className="mt-0.5">
      <p
        className={cn(
          "text-xs text-slate-400 transition-all duration-200",
          !justificationExpanded && "line-clamp-2"
        )}
      >
        {justification}
      </p>
      {/* Afficher le toggle seulement si le texte est potentiellement tronque */}
      {justification.length > 80 && (
        <button
          onClick={toggleJustification}
          className="mt-1 flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {justificationExpanded ? (
            <>
              Reduire <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Lire la suite <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  )}
</div>
```

### Dependances

- Aucune dependance avec d'autres failles.
- Le composant `VoteBoard` est utilise dans `ai-board-panel.tsx` (ligne 429). Aucune modification requise dans ce fichier parent.

### Verification

1. Aller sur un deal avec une session AI Board completee (ou en lancer une)
2. Dans la section "Votes individuels", chaque card membre doit afficher la justification tronquee a 2 lignes
3. Si la justification depasse ~80 caracteres, un lien "Lire la suite" apparait sous le texte
4. Cliquer sur "Lire la suite" : la justification s'affiche integralement, le lien devient "Reduire"
5. Cliquer sur "Reduire" : retour a l'etat tronque
6. Les justifications courtes (< 80 chars) ne montrent pas le toggle

---

## F100 -- Credit modal peu informative

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/credits/credit-modal.tsx`

La modal actuelle (`CreditModal`, ligne 33) est affichee quand l'utilisateur atteint sa limite de credits. Elle presente deux cas :

**Cas 1 : `TIER_LOCKED`** (lignes 42-76)
- Affiche "Fonctionnalite PRO" + prix PRO (249 EUR/mois)
- Pas de date de reset
- Pas d'option d'achat unitaire

**Cas 2 : `LIMIT_REACHED` / `UPGRADE_REQUIRED`** (lignes 79-111)
- Affiche "Limite atteinte" + quota utilise (ex: "3/3")
- Dit "Passez a PRO pour augmenter vos limites"
- Pas de date de reset
- Pas d'option d'achat unitaire
- Pas de detail sur ce que PRO inclut

Code problematique (lignes 89-97) :

```tsx
<div className="space-y-4 py-4">
  <p className="text-sm text-muted-foreground">
    Vous avez utilise <span className="font-semibold text-foreground">{current}/{limit}</span> de votre quota mensuel.
  </p>

  <p className="text-sm text-muted-foreground">
    Passez a PRO pour augmenter vos limites.
  </p>
</div>
```

Par ailleurs, le composant `CreditBadge` (`/Users/sacharebbouh/Desktop/angeldesk/src/components/credits/credit-badge.tsx`) dispose deja de l'information `resetsAt` dans le `UserQuotaInfo` (ligne 23) et l'affiche dans un tooltip (ligne 95) :

```tsx
<TooltipContent side="bottom" align="end">
  <p>
    Reset le {format(new Date(quota.resetsAt), 'd MMMM', { locale: fr })}
  </p>
</TooltipContent>
```

Mais cette information n'est pas transmise a la `CreditModal`.

De meme, le composant `AIBoardPanel` (`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/board/ai-board-panel.tsx`) a l'interface `BoardCreditsStatus` (ligne 22) qui inclut `nextResetDate` (ligne 31) et `extraCredits` (ligne 28), mais ces infos ne sont pas montrees dans aucune modal de credits.

**Impact utilisateur** : L'utilisateur qui atteint la limite ne sait pas quand ses credits seront renouveles (dans 2 jours ? 28 jours ?) et ne sait pas qu'il peut eventuellement acheter des credits supplementaires ou passer a PRO.

### Correction

**Etape 1** : Ajouter les props `resetDate` et `planName` a la modal

Modifier `/Users/sacharebbouh/Desktop/angeldesk/src/components/credits/credit-modal.tsx` :

```tsx
// AVANT (lignes 1-5 — imports)
'use client';

import { AlertTriangle, Lock } from 'lucide-react';
import Link from 'next/link';

// APRES
'use client';

import { AlertTriangle, Lock, Calendar, Zap } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
```

**Etape 2** : Ajouter les nouvelles props a l'interface (lignes 16-25)

```tsx
// AVANT
interface QuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'LIMIT_REACHED' | 'UPGRADE_REQUIRED' | 'TIER_LOCKED';
  action: string; // "analyse", "mise à jour", "AI Board"
  current?: number;
  limit?: number;
  onUpgrade?: () => void;
  isLoading?: boolean;
}

// APRES
interface QuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'LIMIT_REACHED' | 'UPGRADE_REQUIRED' | 'TIER_LOCKED';
  action: string;
  current?: number;
  limit?: number;
  resetDate?: string; // ISO date du prochain reset
  planName?: 'FREE' | 'PRO';
  onUpgrade?: () => void;
  isLoading?: boolean;
}
```

**Etape 3** : Destructurer les nouvelles props (ligne 33)

```tsx
// AVANT
export function CreditModal({
  isOpen,
  onClose,
  type,
  action,
  current,
  limit,
  isLoading = false,
}: QuotaModalProps) {

// APRES
export function CreditModal({
  isOpen,
  onClose,
  type,
  action,
  current,
  limit,
  resetDate,
  planName,
  isLoading = false,
}: QuotaModalProps) {
```

**Etape 4** : Remplacer le contenu du cas `LIMIT_REACHED` (lignes 89-97)

```tsx
// AVANT
<div className="space-y-4 py-4">
  <p className="text-sm text-muted-foreground">
    Vous avez utilise <span className="font-semibold text-foreground">{current}/{limit}</span> de votre quota mensuel.
  </p>

  <p className="text-sm text-muted-foreground">
    Passez a PRO pour augmenter vos limites.
  </p>
</div>

// APRES
<div className="space-y-4 py-4">
  <p className="text-sm text-muted-foreground">
    Vous avez utilise <span className="font-semibold text-foreground">{current}/{limit}</span> de votre quota mensuel.
  </p>

  {/* Date de reset */}
  {resetDate && (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <Calendar className="size-4 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground">
        Vos credits seront renouveles le{' '}
        <span className="font-medium text-foreground">
          {format(new Date(resetDate), 'd MMMM yyyy', { locale: fr })}
        </span>
      </p>
    </div>
  )}

  {/* Options d'upgrade */}
  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <Zap className="size-4 text-primary" />
      <p className="text-sm font-medium">Options pour continuer</p>
    </div>
    <ul className="space-y-1.5 text-sm text-muted-foreground ml-6">
      {planName === 'FREE' && (
        <li className="flex items-start gap-2">
          <span className="text-primary font-bold mt-0.5">1.</span>
          <span>
            <span className="font-medium text-foreground">Passer a PRO</span> — 25 analyses/mois,
            experts sectoriels, AI Board, synthese complete
          </span>
        </li>
      )}
      <li className="flex items-start gap-2">
        <span className="text-primary font-bold mt-0.5">{planName === 'FREE' ? '2' : '1'}.</span>
        <span>
          <span className="font-medium text-foreground">Attendre le renouvellement</span>
          {resetDate && (
            <> — le {format(new Date(resetDate), 'd MMMM', { locale: fr })}</>
          )}
        </span>
      </li>
    </ul>
  </div>
</div>
```

**Etape 5** : Mettre a jour les appelants pour passer `resetDate` et `planName`

Rechercher tous les endroits ou `CreditModal` est utilise avec :

```bash
grep -rn "CreditModal" src/
```

Pour chaque appelant, ajouter les props `resetDate={quota?.resetsAt}` et `planName={quota?.plan}` en utilisant les donnees deja disponibles via le hook `useQuery` de quota. Par exemple, si l'appelant a deja `quota: UserQuotaInfo` :

```tsx
<CreditModal
  isOpen={showCreditModal}
  onClose={() => setShowCreditModal(false)}
  type="LIMIT_REACHED"
  action="ANALYSIS"
  current={quota?.analyses.used}
  limit={quota?.analyses.limit}
  resetDate={quota?.resetsAt}      // <-- AJOUTER
  planName={quota?.plan}            // <-- AJOUTER
/>
```

### Dependances

- Les types `UserQuotaInfo` dans `credit-badge.tsx` (ligne 17) contiennent deja `resetsAt: string` et `plan: 'FREE' | 'PRO'`. Ces donnees sont disponibles via l'API `/api/credits`.
- Connexion avec la `BoardCreditsStatus` de `ai-board-panel.tsx` qui a `nextResetDate` (ligne 31).

### Verification

1. En tant qu'utilisateur FREE, consommer toutes les analyses (3/3)
2. Tenter de lancer une nouvelle analyse
3. La modal doit afficher :
   - Le quota consomme (3/3)
   - La date de reset ("Vos credits seront renouveles le 12 mars 2026")
   - La section "Options pour continuer" avec (a) Passer a PRO et (b) Attendre le renouvellement
4. Le bouton "Passer a PRO" redirige vers `/pricing`
5. Tester aussi le cas `TIER_LOCKED` : la modal doit rester inchangee (car il n'y a pas de notion de reset)

---

## F101 -- ReAct trace invisible

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`, lignes 83-121

Le composant `ReActIndicator` est un petit bouton discret :

```tsx
const ReActIndicator = memo(function ReActIndicator({
  reactData,
  onShowTrace
}: {
  reactData: ReActMetadata;
  onShowTrace: () => void;
}) {
  // ...
  return (
    <button
      onClick={onShowTrace}
      className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
    >
      <Brain className="h-4 w-4 text-primary" />
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className={cn("text-xs", confidenceColor)}>
          {reactData.confidence.score}%
        </Badge>
        {benchmarkedFindings > 0 && (
          <span className="text-xs text-muted-foreground">
            {benchmarkedFindings} benchmarks
          </span>
        )}
      </div>
    </button>
  );
});
```

**Problemes identifies** :

1. **Opacite trop faible** : `bg-primary/5` (5% d'opacite) et `border-primary/20` (20%) rendent le bouton quasi invisible sur fond blanc.
2. **Pas de label texte** : L'icone Brain + un pourcentage ne suffit pas a communiquer que c'est un processus de raisonnement cliquable.
3. **Pas d'animation** : Le bouton est statique, l'utilisateur ne comprend pas que le systeme a "reflechi".
4. **Positionnement** : Le bouton est insere inline dans le header de chaque card agent (ex: ligne 212 pour FinancialAuditCard), entre le titre et les badges. Il se confond avec les autres badges.

L'indicateur est utilise dans tous les composants agent card :
- `FinancialAuditCard` (ligne 212)
- `CapTableCard` (ligne 1566)
- `GTMCard` (ligne 1982)
- `CustomerIntelCard` (ligne 2378)
- Et probablement d'autres (tous les cards Tier 1 avec `reactData`)

**Impact utilisateur** : Le BA ne realise pas que l'agent a fait un raisonnement structure, et ne clique donc jamais sur le bouton pour voir la trace. La transparence du systeme est perdue.

### Correction

Rendre le `ReActIndicator` plus visible avec :
- Un fond plus contrastant avec une subtile animation pulse
- Un label textuel "Trace IA"
- Un indicateur visuel de "raisonnement"

**Remplacer le composant `ReActIndicator`** (lignes 83-121 de `tier1-results.tsx`) :

```tsx
// ReAct Badge Component - Shows when agent has ReAct metadata
const ReActIndicator = memo(function ReActIndicator({
  reactData,
  onShowTrace
}: {
  reactData: ReActMetadata;
  onShowTrace: () => void;
}) {
  const confidenceColor = useMemo(() => {
    const level = reactData.confidence.level;
    if (level === "high") return "bg-green-100 text-green-800 border-green-300";
    if (level === "medium") return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-red-100 text-red-800 border-red-300";
  }, [reactData.confidence.level]);

  const benchmarkedFindings = useMemo(
    () => reactData.findings.filter(f => f.benchmarkData).length,
    [reactData.findings]
  );

  const iterationCount = reactData.reasoningTrace.totalIterations;

  return (
    <button
      onClick={onShowTrace}
      className={cn(
        "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg",
        "bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20",
        "border border-violet-200 dark:border-violet-500/30",
        "transition-all duration-200 hover:shadow-sm hover:shadow-violet-200/50"
      )}
      title="Voir la trace de raisonnement de l'agent"
    >
      {/* Pulse indicator */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
      </span>

      <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />

      <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
        Trace IA
      </span>

      <Badge variant="outline" className={cn("text-xs", confidenceColor)}>
        {reactData.confidence.score}%
      </Badge>

      {benchmarkedFindings > 0 && (
        <span className="text-[11px] text-violet-500 dark:text-violet-400">
          {benchmarkedFindings} bench.
        </span>
      )}

      {iterationCount > 1 && (
        <span className="text-[11px] text-violet-500 dark:text-violet-400">
          {iterationCount} etapes
        </span>
      )}

      {/* Underline hint on hover */}
      <span className="absolute bottom-0 left-2 right-2 h-px bg-violet-300 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
});
```

**Changements cles** :
1. **Fond violet distinct** (`bg-violet-50`, `border-violet-200`) au lieu de `bg-primary/5` quasi invisible
2. **Dot pulse anime** : le petit cercle violet qui pulse attire l'oeil et indique un processus
3. **Label "Trace IA"** : texte explicite qui dit quoi
4. **Nombre d'etapes** : affiche combien d'iterations de raisonnement ont ete faites
5. **Underline au hover** : indique la cliquabilite
6. **Titre tooltip natif** : "Voir la trace de raisonnement de l'agent"
7. **Support dark mode** avec les variantes `dark:`

### Dependances

- Aucune modification necessaire dans les composants parents (les cards agent appellent deja `<ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />`).
- Le `ReActTracePanel` (ligne 124) et le `ReActTraceViewer` (`react-trace-viewer.tsx`) restent inchanges.
- Le type `ReActMetadata` contient deja `reasoningTrace.totalIterations` (via `ReasoningTrace` dans `/Users/sacharebbouh/Desktop/angeldesk/src/agents/react/types.ts`).

### Verification

1. Aller sur un deal avec une analyse completee
2. Dans les cards agents (Audit Financier, Cap Table, GTM, etc.), le bouton "Trace IA" doit etre visible avec :
   - Un fond violet clair
   - Un point violet qui pulse doucement
   - Le texte "Trace IA" + le score de confiance
   - Le nombre d'etapes si > 1
3. Au hover, le bouton s'assombrit legerement et une ligne apparait en bas
4. Cliquer ouvre le slide-over panel avec la trace complete
5. Verifier que le dark mode fonctionne (fond violet fonce, texte clair)

---

## F102 -- Feedback donnees d'entree absent

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`

Le badge "Donnees minimales" est affiche a **5 endroits** dans les cards agents :

1. **FinancialAuditCard** (ligne 224) :
   ```tsx
   {data.meta?.dataCompleteness === "complete" ? "Donnees completes" :
    data.meta?.dataCompleteness === "partial" ? "Donnees partielles" :
    "Donnees minimales"}
   ```

2. **CapTableCard** (ligne 1579) : idem
3. **GTMCard** (ligne 1994) : variante avec "Completes/Partielles/Minimales"
4. **CustomerIntelCard** (ligne 2390) : idem

Chaque badge est un simple `<Badge>` colore (rouge pour minimal, jaune pour partial, vert pour complete) sans aucun tooltip, guide, ou explication.

Par ailleurs, chaque agent produit dans son `AgentMeta` :
- `dataCompleteness: "complete" | "partial" | "minimal"` (type dans `/Users/sacharebbouh/Desktop/angeldesk/src/agents/types.ts`, ligne 312)
- `limitations: string[]` (type dans `/Users/sacharebbouh/Desktop/angeldesk/src/agents/types.ts`, ligne 314) — une liste de ce qui n'a pas pu etre analyse

Ces `limitations` ne sont **jamais affichees** dans les cards agents du front-end.

De plus, la page de creation de deal (`/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/new/page.tsx`) montre les champs optionnels suivants :
- `website` (ligne 233)
- `description` (ligne 243)
- `sector` (ligne 265)
- `stage` (ligne 292)
- `geography` (ligne 310)
- `arr` (ligne 332)
- `growthRate` (ligne 341)
- `amountRequested` (ligne 351)
- `valuationPre` (ligne 361)

Et il y a un systeme d'upload de documents (`/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/documents-tab.tsx`, `document-upload-dialog.tsx`) qui permet d'ajouter des pitch decks.

**Impact utilisateur** : Le BA voit "Donnees minimales" en rouge mais ne sait pas :
- Quelles donnees manquent exactement
- Lesquelles amelioreraient le plus l'analyse
- Comment les fournir (upload pitch deck ? remplir les champs ?)

### Correction

Creer un composant `DataCompletenessGuide` reutilisable qui remplace tous les badges "Donnees minimales/partielles/completes" actuels. Ce composant affiche :
- Le badge colore (comme avant)
- Un popover au clic quand `dataCompleteness !== "complete"` avec les limitations + suggestions d'amelioration

**Etape 1** : Creer le composant `DataCompletenessGuide`

Ajouter dans `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/data-completeness-guide.tsx` :

```tsx
"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Globe,
  BarChart3,
  Info,
  ArrowRight,
} from "lucide-react";

type DataCompleteness = "complete" | "partial" | "minimal";

interface DataCompletenessGuideProps {
  completeness: DataCompleteness;
  limitations?: string[];
  agentName?: string;
}

/** Mapping de donnees manquantes vers suggestions d'action */
const IMPROVEMENT_SUGGESTIONS: { pattern: RegExp; suggestion: string; icon: "upload" | "form" | "web" }[] = [
  { pattern: /pitch\s?deck|deck|presentation|document/i, suggestion: "Uploadez votre pitch deck (PDF)", icon: "upload" },
  { pattern: /financ|revenue|arr|mrr|chiffre|tresorerie|bilan|resultat/i, suggestion: "Renseignez l'ARR et le taux de croissance", icon: "form" },
  { pattern: /valoris|valuation|valo|pre-money/i, suggestion: "Renseignez la valorisation pre-money", icon: "form" },
  { pattern: /equipe|team|fondateur|cto|ceo|linkedin/i, suggestion: "Ajoutez les profils LinkedIn des fondateurs", icon: "web" },
  { pattern: /site\s?web|website|url|domaine/i, suggestion: "Renseignez le site web de la startup", icon: "form" },
  { pattern: /cap\s?table|dilution|term\s?sheet|vesting/i, suggestion: "Uploadez la cap table ou le term sheet", icon: "upload" },
  { pattern: /concurr|compet|marche|market|tam|sam/i, suggestion: "Ajoutez une description du marche et des concurrents", icon: "form" },
  { pattern: /client|customer|contrat|churn|retention/i, suggestion: "Uploadez des donnees clients (metriques, temoignages)", icon: "upload" },
  { pattern: /techno|stack|infra|code|github|repo/i, suggestion: "Renseignez la stack technique dans la description", icon: "form" },
  { pattern: /secteur|sector|industry/i, suggestion: "Selectionnez le secteur du deal", icon: "form" },
  { pattern: /geograph|pays|region|location/i, suggestion: "Renseignez la geographie", icon: "form" },
  { pattern: /montant|amount|lev[ée]e|round/i, suggestion: "Renseignez le montant demande", icon: "form" },
];

const ICON_MAP = {
  upload: <FileUp className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />,
  form: <BarChart3 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />,
  web: <Globe className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />,
};

const COMPLETENESS_CONFIG: Record<DataCompleteness, {
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}> = {
  complete: {
    label: "Donnees completes",
    shortLabel: "Completes",
    color: "bg-green-100 text-green-800",
    description: "Toutes les donnees necessaires sont disponibles.",
  },
  partial: {
    label: "Donnees partielles",
    shortLabel: "Partielles",
    color: "bg-yellow-100 text-yellow-800",
    description: "Certaines donnees manquent. L'analyse reste fiable mais peut etre amelioree.",
  },
  minimal: {
    label: "Donnees minimales",
    shortLabel: "Minimales",
    color: "bg-red-100 text-red-800",
    description: "Tres peu de donnees disponibles. L'analyse est limitee et moins fiable.",
  },
};

export const DataCompletenessGuide = memo(function DataCompletenessGuide({
  completeness,
  limitations = [],
  agentName,
}: DataCompletenessGuideProps) {
  const config = COMPLETENESS_CONFIG[completeness];

  // Generer les suggestions basees sur les limitations
  const suggestions = useMemo(() => {
    if (completeness === "complete" || limitations.length === 0) return [];

    const seen = new Set<string>();
    const result: { suggestion: string; icon: "upload" | "form" | "web" }[] = [];

    for (const limitation of limitations) {
      for (const mapping of IMPROVEMENT_SUGGESTIONS) {
        if (mapping.pattern.test(limitation) && !seen.has(mapping.suggestion)) {
          seen.add(mapping.suggestion);
          result.push({ suggestion: mapping.suggestion, icon: mapping.icon });
        }
      }
    }

    // Si aucune suggestion n'a matche, ajouter une generique
    if (result.length === 0) {
      result.push({
        suggestion: "Uploadez votre pitch deck pour enrichir l'analyse",
        icon: "upload" as const,
      });
    }

    // Limiter a 4 suggestions
    return result.slice(0, 4);
  }, [completeness, limitations]);

  // Si complete, pas de popover
  if (completeness === "complete") {
    return (
      <Badge variant="outline" className={cn("text-xs", config.color)}>
        {config.label}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex">
          <Badge
            variant="outline"
            className={cn(
              "text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1",
              config.color
            )}
          >
            {config.shortLabel}
            <Info className="h-3 w-3 opacity-60" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 p-0"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-2">
            <AlertCircle className={cn(
              "h-5 w-5 shrink-0 mt-0.5",
              completeness === "minimal" ? "text-red-500" : "text-amber-500"
            )} />
            <div>
              <p className="text-sm font-medium">{config.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.description}
              </p>
            </div>
          </div>

          {/* Limitations actuelles */}
          {limitations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Non analyse
              </p>
              <ul className="space-y-1">
                {limitations.slice(0, 5).map((limitation, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-red-400 mt-0.5">-</span>
                    <span>{limitation}</span>
                  </li>
                ))}
                {limitations.length > 5 && (
                  <li className="text-xs text-muted-foreground/60 ml-4">
                    +{limitations.length - 5} autre{limitations.length - 5 > 1 ? "s" : ""}...
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Suggestions d'amelioration */}
          {suggestions.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pour ameliorer cette analyse
              </p>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {ICON_MAP[s.icon]}
                    <span>{s.suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="border-t pt-2">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              Modifiez le deal ou uploadez des documents dans l&apos;onglet Documents
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
```

**Etape 2** : Remplacer les badges inline dans `tier1-results.tsx`

Pour chaque card agent, remplacer le badge par le nouveau composant. Exemple pour `FinancialAuditCard` (lignes 215-225) :

```tsx
// AVANT
<Badge variant="outline" className={cn(
  "text-xs",
  data.meta?.dataCompleteness === "complete" ? "bg-green-100 text-green-800" :
  data.meta?.dataCompleteness === "partial" ? "bg-yellow-100 text-yellow-800" :
  "bg-red-100 text-red-800"
)}>
  {data.meta?.dataCompleteness === "complete" ? "Donnees completes" :
   data.meta?.dataCompleteness === "partial" ? "Donnees partielles" :
   "Donnees minimales"}
</Badge>

// APRES
<DataCompletenessGuide
  completeness={data.meta?.dataCompleteness ?? "minimal"}
  limitations={data.meta?.limitations}
  agentName="financial-auditor"
/>
```

Ajouter l'import en haut du fichier :

```tsx
import { DataCompletenessGuide } from "@/components/shared/data-completeness-guide";
```

Repeter le remplacement pour :
- **CapTableCard** (lignes 1570-1580) : `completeness={data.meta?.dataCompleteness ?? "minimal"}` + `limitations={data.meta?.limitations}`
- **GTMCard** (lignes 1986-1995) : idem
- **CustomerIntelCard** (lignes 2382-2391) : idem
- Et tout autre card agent qui affiche le badge dataCompleteness

**Etape 3** : S'assurer que Popover est disponible

Verifier que le composant `Popover` de shadcn/ui est installe :

```bash
ls src/components/ui/popover.tsx
```

Si absent, l'installer avec :

```bash
npx shadcn@latest add popover
```

### Dependances

- **Dependance sur `AgentMeta.limitations`** : Le champ `limitations: string[]` est deja produit par tous les agents Tier 1 refondus (financial-auditor, competitive-intel, cap-table-auditor, tech-stack-dd, tech-ops-dd, gtm-analyst, exit-strategist). Il faut s'assurer que ce champ est bien transmis jusqu'au front-end dans le `data.meta` de chaque agent result.
- **Composant Popover** : Necessite `@/components/ui/popover` (shadcn).
- **Pas de lien direct** avec les autres failles (F99-F101), mais le guide rejoint la philosophie "value-first" de la F101 (transparence du systeme).

### Verification

1. Aller sur un deal avec une analyse completee
2. Identifier une card agent affichant "Donnees minimales" ou "Partielles"
3. Le badge doit afficher une petite icone info (i) a cote du texte
4. Cliquer sur le badge : un popover s'ouvre avec :
   - La description du niveau de completude
   - La liste des limitations (ce qui n'a pas pu etre analyse)
   - Les suggestions d'amelioration priorisees (ex: "Uploadez votre pitch deck", "Renseignez l'ARR")
   - Un lien vers l'onglet Documents
5. Si "Donnees completes" : pas de popover, simple badge vert
6. Tester avec differents agents (Financial, Cap Table, GTM, Customer Intel)
7. Verifier que les suggestions s'adaptent aux limitations reelles (ex: si limitation contient "financier", la suggestion dit "Renseignez l'ARR")

---

## Recapitulatif

| Faille | Fichier(s) principal(aux) | Type de correction | Effort estime |
|--------|---------------------------|-------------------|---------------|
| F99 | `vote-board.tsx` | Ajout state expand/collapse sur justification | ~30 min |
| F100 | `credit-modal.tsx` + appelants | Ajout date reset + options upgrade | ~1h |
| F101 | `tier1-results.tsx` (ReActIndicator) | Refonte visuelle du bouton (violet, pulse, label) | ~30 min |
| F102 | Nouveau `data-completeness-guide.tsx` + `tier1-results.tsx` | Composant popover avec guide contextuel | ~2h |

**Total estime** : ~4h

**Fichiers a creer** : 1 (`src/components/shared/data-completeness-guide.tsx`)
**Fichiers a modifier** : 3 (`vote-board.tsx`, `credit-modal.tsx`, `tier1-results.tsx`)
**Dependances externes** : Aucune (shadcn Popover probablement deja present)
