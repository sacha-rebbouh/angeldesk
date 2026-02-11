# Wave 2 - H4 : UX Guidance & Onboarding

**Agent** : H4
**Severite** : HIGH
**Failles** : F29, F30, F31, F32, F33, F50, F51, F52
**Fichiers analyses** : 15+ fichiers source lus en entier

---

## F29 — Pas de guide "Prochaines etapes" post-analyse

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`
**Lignes** : 1547-1562

La section "Prochaines etapes" n'existe QUE dans le composant `MemoGeneratorCard` (Tier 3), qui est reserve aux utilisateurs PRO :

```tsx
// tier3-results.tsx, lignes 1547-1562
{/* Next Steps */}
{data.nextSteps.length > 0 && (
  <div className="pt-2 border-t">
    <p className="text-sm font-medium mb-2">Prochaines etapes</p>
    <ul className="space-y-1">
      {data.nextSteps.map((s, i) => (
        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
          <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">
            {i + 1}
          </span>
          {s}
        </li>
      ))}
    </ul>
  </div>
)}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/analysis-constants.ts`
**Lignes** : 55-69

Le plan FREE n'a pas acces au memo (`memo: false`) :

```tsx
export const FREE_DISPLAY_LIMITS = {
  // ...
  memo: false,            // Memo masque
} as const;
```

**Probleme** : Un utilisateur FREE termine son analyse Tier 1 et voit 12 cartes d'agents mais AUCUNE indication de quoi faire ensuite. Le BA est submerge sans guide d'action.

### Correction

Creer un composant `NextStepsGuide` qui s'affiche en bas des resultats Tier 1, meme pour les utilisateurs FREE, avec des etapes generiques mais actionnables derivees des resultats.

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/next-steps-guide.tsx`

```tsx
"use client";

import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  MessageSquare,
  AlertTriangle,
  Search,
  FileText,
  Handshake,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/lib/analysis-constants";

interface NextStepAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  priority: "critical" | "high" | "medium";
  proOnly?: boolean;
}

interface NextStepsGuideProps {
  /** Number of critical/high red flags detected */
  criticalRedFlagCount: number;
  /** Number of questions to ask the founder */
  questionsCount: number;
  /** Average score from Tier 1 agents */
  avgScore: number;
  /** Whether Tier 3 synthesis is available */
  hasTier3: boolean;
  /** User plan */
  subscriptionPlan: SubscriptionPlan;
}

export const NextStepsGuide = memo(function NextStepsGuide({
  criticalRedFlagCount,
  questionsCount,
  avgScore,
  hasTier3,
  subscriptionPlan,
}: NextStepsGuideProps) {
  const isFree = subscriptionPlan === "FREE";

  const steps = useMemo((): NextStepAction[] => {
    const actions: NextStepAction[] = [];

    // Step 1: Always — review critical red flags first
    if (criticalRedFlagCount > 0) {
      actions.push({
        id: "review-red-flags",
        label: "Examiner les red flags critiques",
        description: `${criticalRedFlagCount} red flag${criticalRedFlagCount > 1 ? "s" : ""} necessitent votre attention immediate. Lisez les details et evaluez s'il s'agit de dealbreakers.`,
        icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
        priority: "critical",
      });
    }

    // Step 2: Ask founder questions
    if (questionsCount > 0) {
      actions.push({
        id: "ask-founder",
        label: "Poser les questions au fondateur",
        description: `${questionsCount} questions generees par l'analyse. Utilisez l'onglet "Reponses Fondateur" pour enregistrer ses reponses et relancer l'analyse.`,
        icon: <MessageSquare className="h-5 w-5 text-blue-500" />,
        priority: "high",
      });
    }

    // Step 3: Upload more documents if score is low
    if (avgScore < 60) {
      actions.push({
        id: "add-documents",
        label: "Ajouter des documents complementaires",
        description: "Le score moyen est bas. Ajoutez le pitch deck, le BP financier, ou la cap table pour affiner l'analyse.",
        icon: <FileText className="h-5 w-5 text-amber-500" />,
        priority: "high",
      });
    }

    // Step 4: Use chat to deep-dive
    actions.push({
      id: "chat-deep-dive",
      label: "Approfondir avec le chat IA",
      description: "Posez des questions specifiques sur les points d'ombre. Le chat connait tous les resultats de l'analyse.",
      icon: <Search className="h-5 w-5 text-purple-500" />,
      priority: "medium",
    });

    // Step 5: Run full analysis (PRO)
    if (isFree && !hasTier3) {
      actions.push({
        id: "run-full-analysis",
        label: "Lancer l'analyse complete (PRO)",
        description: "Obtenez le Devil's Advocate, les scenarios financiers, le detecteur de contradictions et le memo d'investissement.",
        icon: <Crown className="h-5 w-5 text-amber-500" />,
        priority: "medium",
        proOnly: true,
      });
    }

    // Step 6: Negotiate (only if score is decent)
    if (avgScore >= 50) {
      actions.push({
        id: "prepare-negotiation",
        label: "Preparer la negociation",
        description: "Les agents ont identifie des points de negociation. Utilisez-les pour discuter la valorisation et les termes.",
        icon: <Handshake className="h-5 w-5 text-green-500" />,
        priority: "medium",
      });
    }

    return actions;
  }, [criticalRedFlagCount, questionsCount, avgScore, hasTier3, isFree]);

  if (steps.length === 0) return null;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-primary" />
          Prochaines etapes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Actions recommandees en fonction de votre analyse
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                step.priority === "critical" && "bg-red-50 border-red-200",
                step.priority === "high" && "bg-amber-50/50 border-amber-200",
                step.priority === "medium" && "bg-muted/50 border-border"
              )}
            >
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {step.icon}
                  <span className="font-medium text-sm">{step.label}</span>
                  {step.proOnly && (
                    <Badge variant="secondary" className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 text-xs">
                      <Crown className="mr-0.5 h-3 w-3" />
                      PRO
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
});
```

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`
**Ligne ~1224** : Ajouter le composant apres les resultats Tier 1.

```tsx
// Apres la ligne:
//   <Tier1Results results={tier1Results} subscriptionPlan={subscriptionPlan} />
// Ajouter:

{/* Next Steps Guide - Always visible, even for FREE */}
{isTier1Analysis && displayedResult.success && (
  <NextStepsGuide
    criticalRedFlagCount={Object.values(tier1Results).reduce((count, r) => {
      if (!r.success || !r.data) return count;
      const data = r.data as { redFlags?: { severity: string }[] };
      return count + (data.redFlags?.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH").length ?? 0);
    }, 0)}
    questionsCount={founderQuestions.length}
    avgScore={extractDealScore(displayedResult.results) || 0}
    hasTier3={isTier3Analysis}
    subscriptionPlan={subscriptionPlan}
  />
)}
```

Import a ajouter en haut du fichier :
```tsx
import { NextStepsGuide } from "./next-steps-guide";
```

### Dependances
- F32 (faux sentiment de securite) : le NextStepsGuide mentionne les agents manquants PRO.

### Verification
1. Creer un deal avec un compte FREE, lancer l'analyse Tier 1
2. Verifier qu'une section "Prochaines etapes" apparait en bas des resultats
3. Verifier que les etapes sont dynamiques (red flags > questions > documents > chat)
4. Avec un compte PRO ayant Tier 3, verifier que l'etape PRO ne s'affiche pas

---

## F30 — Severites des red flags sans explication d'impact

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`
**Lignes** : 411-446 (FinancialAuditCard), 627-651 (TeamInvestigatorCard), 763-784 (CompetitiveIntelCard), et dans TOUTES les cartes d'agents

Les badges de severite sont affiches comme de simples textes sans explication :

```tsx
// Exemple typique (ligne 432-442):
{otherFlags.map((flag: { severity: string; title: string; evidence: string }, i: number) => (
  <div key={`other-${i}`} className="flex items-start gap-2 text-sm">
    <AlertTriangle className={cn(
      "h-4 w-4 shrink-0 mt-0.5",
      flag.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
    )} />
    <div>
      <span className="font-medium">{flag.title}</span>
      <span className="text-muted-foreground ml-1">- {flag.evidence}</span>
    </div>
  </div>
))}
```

Les badges `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` sont juste des mots sans explication de ce qu'ils signifient pour un BA.

**Probleme** : Un BA debutant ne sait pas qu'un red flag "MEDIUM" sur la cap table peut etre un dealbreaker dans certains contextes. Il faut une legende ET un tooltip.

### Correction

**1. Creer un composant `SeverityBadge` avec tooltip**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/severity-badge.tsx`

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

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  impact: string;
  action: string;
}> = {
  CRITICAL: {
    label: "CRITIQUE",
    color: "bg-red-100 text-red-800 border-red-300",
    impact: "Dealbreaker potentiel. Ce risque peut a lui seul justifier de passer le deal.",
    action: "Investiguer IMMEDIATEMENT. Si confirme, envisager serieusement le NO GO.",
  },
  HIGH: {
    label: "ELEVE",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    impact: "Risque serieux qui peut reduire significativement le retour attendu ou bloquer la croissance.",
    action: "Poser la question au fondateur AVANT d'investir. Negocier une protection (clause, milestone).",
  },
  MEDIUM: {
    label: "MOYEN",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    impact: "Point de vigilance. Peut devenir critique si non adresse, surtout combine a d'autres risques.",
    action: "Aborder le sujet avec le fondateur. Suivre dans le temps post-investissement.",
  },
  LOW: {
    label: "FAIBLE",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    impact: "Risque mineur, commun a beaucoup de startups early stage. A noter, pas a prioriser.",
    action: "Pas d'action immediate requise. Surveiller lors des board meetings.",
  },
};

interface SeverityBadgeProps {
  severity: string;
  showTooltip?: boolean;
  className?: string;
}

export const SeverityBadge = memo(function SeverityBadge({
  severity,
  showTooltip = true,
  className,
}: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity.toUpperCase()] ?? {
    label: severity,
    color: "bg-gray-100 text-gray-800",
    impact: "Niveau de severite inconnu.",
    action: "Evaluer au cas par cas.",
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn("text-xs cursor-help", config.color, className)}
    >
      {config.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs p-3"
        >
          <div className="space-y-1.5">
            <p className="font-medium text-sm">Impact : {config.label}</p>
            <p className="text-xs text-muted-foreground">{config.impact}</p>
            <p className="text-xs font-medium">Action : {config.action}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
```

**2. Creer un composant `SeverityLegend` pour l'affichage en haut des resultats**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/severity-legend.tsx`

```tsx
"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

const SEVERITIES = [
  { key: "CRITICAL", label: "CRITIQUE", color: "bg-red-100 text-red-800 border-red-300", desc: "Dealbreaker potentiel" },
  { key: "HIGH", label: "ELEVE", color: "bg-orange-100 text-orange-800 border-orange-300", desc: "Risque serieux, investiguer avant d'investir" },
  { key: "MEDIUM", label: "MOYEN", color: "bg-yellow-100 text-yellow-800 border-yellow-300", desc: "Point de vigilance, peut devenir critique" },
  { key: "LOW", label: "FAIBLE", color: "bg-blue-100 text-blue-800 border-blue-300", desc: "Risque mineur, commun en early stage" },
];

export const SeverityLegend = memo(function SeverityLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border rounded-lg bg-muted/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Comprendre les niveaux de severite
        </span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t space-y-2">
          {SEVERITIES.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs w-20 justify-center shrink-0", s.color)}>
                {s.label}
              </Badge>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
```

**3. Modifications dans tier1-results.tsx**

Remplacer tous les badges de severite hardcodes par `<SeverityBadge severity={...} />`. Exemple pour FinancialAuditCard (ligne 423) :

```tsx
// AVANT (ligne 423):
<Badge variant="outline" className="ml-2 text-xs bg-red-100 text-red-800">CRITIQUE</Badge>

// APRES:
<SeverityBadge severity="CRITICAL" />
```

Et pour les otherFlags (lignes 432-442), remplacer l'icone seule par une combinaison icone + badge :

```tsx
// AVANT (ligne 432-442):
<AlertTriangle className={cn(
  "h-4 w-4 shrink-0 mt-0.5",
  flag.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
)} />
<div>
  <span className="font-medium">{flag.title}</span>
  <span className="text-muted-foreground ml-1">- {flag.evidence}</span>
</div>

// APRES:
<AlertTriangle className={cn(
  "h-4 w-4 shrink-0 mt-0.5",
  flag.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
)} />
<div>
  <div className="flex items-center gap-2">
    <span className="font-medium">{flag.title}</span>
    <SeverityBadge severity={flag.severity} />
  </div>
  <span className="text-xs text-muted-foreground">{flag.evidence}</span>
</div>
```

**4. Ajouter SeverityLegend dans Tier1Results (ligne ~3574)**

```tsx
// Dans la fonction Tier1Results, apres le Summary Header Card (ligne ~3612):
<SeverityLegend />
```

### Dependances
- Aucune dependance directe.

### Verification
1. Verifier que tous les badges de severite dans Tier 1 et Tier 3 ont un tooltip au hover
2. Verifier la legende depliable en haut des resultats
3. Tester sur mobile : le tooltip doit fonctionner au tap

---

## F31 — Chat IA sans cadrage du niveau utilisateur

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/chat/deal-chat-agent.ts`
**Lignes** : 178-213

Le system prompt du chat ne prend pas en compte le niveau de l'utilisateur :

```tsx
protected buildSystemPrompt(): string {
  return `# ROLE

Tu es un analyste d'investissement senior specialise dans l'accompagnement de Business Angels.
Tu as 15+ ans d'experience en Venture Capital et as analyse 500+ deals.
Tu combines rigueur analytique et pedagogie pour aider les BA a prendre des decisions eclairees.

# MISSION

Aider le Business Angel a comprendre et exploiter l'analyse de son deal:
- Repondre aux questions avec precision et sources
- Expliquer les red flags et leurs implications
- Fournir des arguments de negociation
- Suggerer des questions a poser au fondateur

# PRINCIPES

1. **Toujours sourcer** - Chaque affirmation doit citer sa source
2. **Etre actionnable** - Le BA doit pouvoir agir sur tes reponses
3. **Etre concis** - Reponses directes, pas de bavardage
4. **Etre honnete** - Si une info manque, le dire clairement
5. **Etre pedagogue** - Expliquer les concepts VC si necessaire
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx`
**Lignes** : 78-95

Les quick actions presupposent des connaissances VC :

```tsx
const QUICK_ACTIONS = [
  { label: "Explique-moi les red flags", prompt: "Explique-moi les red flags identifies dans cette analyse." },
  { label: "Compare aux benchmarks", prompt: "Compare ce deal aux benchmarks du secteur." },
  { label: "Questions au fondateur", prompt: "Quelles questions devrais-je poser au fondateur?" },
  { label: "Resume l'analyse", prompt: "Resume les points cles de l'analyse de ce deal." },
] as const;
```

**Probleme** : "Compare aux benchmarks" est du jargon VC. Un BA debutant ne sait pas ce que signifie un benchmark P25/P75.

### Correction

**1. Ajouter un champ `investorLevel` au contexte du chat**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/chat/deal-chat-agent.ts`
**Dans l'interface `FullChatContext`** (ligne 80), ajouter :

```tsx
export interface FullChatContext {
  deal: {
    // ... existant
  };
  chatContext: DealChatContextData | null;
  documents: Array<{ ... }>;
  latestAnalysis: { ... } | null;

  // NOUVEAU: Niveau investisseur pour adapter les reponses
  investorLevel?: "beginner" | "intermediate" | "expert";
}
```

**2. Adapter le system prompt selon le niveau**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/chat/deal-chat-agent.ts`
**Methode `buildSystemPrompt()`** (ligne 178), remplacer entierement par :

```tsx
protected buildSystemPrompt(): string {
  const level = this.chatContext?.investorLevel ?? "beginner";

  const levelInstructions = {
    beginner: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **Business Angel debutant** (1-3 premiers deals).
- Explique TOUS les termes techniques (ARR, burn rate, runway, multiple, etc.)
- Utilise des analogies simples pour les concepts complexes
- Ne presuppose aucune connaissance VC
- Structure tes reponses en commencant par "En resume" avant les details
- Quand tu mentionnes un ratio ou un benchmark, explique ce qu'il signifie et pourquoi c'est important
- Exemple: au lieu de "Le burn multiple est de 3.2x", dis "Le burn multiple est de 3.2x, ce qui signifie que l'entreprise depense 3.2EUR pour generer 1EUR de nouveau revenu. Un bon ratio est en dessous de 2x."`,

    intermediate: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **Business Angel intermediaire** (3-10 deals).
- Les termes de base sont acquis (ARR, burn, runway, cap table)
- Explique les concepts avances (liquidation preference, anti-dilution, MOIC vs IRR)
- Fournis des comparaisons avec d'autres deals similaires quand possible
- Focus sur les implications pratiques et les decisions a prendre`,

    expert: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **investisseur experimente** (10+ deals ou ex-VC).
- Utilise le jargon VC librement
- Focus sur les insights non-evidents et les edge cases
- Fournis des analyses quantitatives detaillees
- Challenge les hypotheses si necessaire`,
  };

  return `# ROLE

Tu es un analyste d'investissement senior specialise dans l'accompagnement de Business Angels.
Tu as 15+ ans d'experience en Venture Capital et as analyse 500+ deals.
Tu combines rigueur analytique et pedagogie pour aider les BA a prendre des decisions eclairees.

# MISSION

Aider le Business Angel a comprendre et exploiter l'analyse de son deal:
- Repondre aux questions avec precision et sources
- Expliquer les red flags et leurs implications
- Fournir des arguments de negociation
- Suggerer des questions a poser au fondateur

# PRINCIPES

1. **Toujours sourcer** - Chaque affirmation doit citer sa source (fait extrait, agent, red flag)
2. **Etre actionnable** - Le BA doit pouvoir agir sur tes reponses
3. **Etre concis** - Reponses directes, pas de bavardage
4. **Etre honnete** - Si une info manque, le dire clairement
5. **Etre pedagogue** - Expliquer les concepts VC si necessaire
${levelInstructions[level]}

# FORMAT DE REPONSE

- Reponses en francais (sauf termes techniques anglais standard)
- Markdown pour la structure (titres, listes, gras)
- Citations entre guillemets avec source
- Calculs montres si pertinent

# LIMITES

- Tu ne peux pas acceder a des donnees externes en temps reel
- Tu te bases uniquement sur les donnees de l'analyse
- Tu ne fais pas de predictions de succes/echec
- Tu ne donnes pas de conseil d'investissement definitif (decision finale = BA)`;
}
```

**3. Adapter les quick actions selon le niveau**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/chat/deal-chat-panel.tsx`
**Lignes 78-95**, remplacer par :

```tsx
const QUICK_ACTIONS_BY_LEVEL: Record<string, Array<{ label: string; prompt: string }>> = {
  beginner: [
    { label: "C'est quoi ce score ?", prompt: "Explique-moi simplement ce que signifie le score de ce deal et si c'est bien ou pas." },
    { label: "Est-ce que je risque de perdre mon argent ?", prompt: "Quels sont les principaux risques de cet investissement, expliques simplement ?" },
    { label: "Que demander au fondateur ?", prompt: "Quelles questions simples mais importantes devrais-je poser au fondateur avant d'investir ?" },
    { label: "Resume pour moi", prompt: "Resume cette analyse comme si tu l'expliquais a quelqu'un qui n'a jamais investi dans une startup." },
  ],
  intermediate: [
    { label: "Explique les red flags", prompt: "Explique-moi les red flags identifies dans cette analyse et leur impact potentiel." },
    { label: "Compare aux benchmarks", prompt: "Compare ce deal aux benchmarks du secteur. Les metriques sont-elles au-dessus ou en-dessous de la mediane ?" },
    { label: "Questions au fondateur", prompt: "Quelles questions devrais-je poser au fondateur, classees par priorite ?" },
    { label: "Points de negociation", prompt: "Quels sont mes leviers de negociation sur la valorisation et les termes ?" },
  ],
  expert: [
    { label: "Red flags & dealbreakers", prompt: "Analyse les red flags detectes. Lesquels sont des dealbreakers absolus vs conditionnels ?" },
    { label: "Benchmark & valo", prompt: "Compare les multiples de valorisation aux comparables. La valo est-elle justifiee ?" },
    { label: "Due diligence gaps", prompt: "Quels points de la DD restent insuffisamment couverts ? Quelles donnees manquent ?" },
    { label: "Structuration du deal", prompt: "Quels termes devrais-je negocier (liquidation pref, pro-rata, anti-dilution) ?" },
  ],
};

// Fallback to beginner
function getQuickActions(level: string) {
  return QUICK_ACTIONS_BY_LEVEL[level] ?? QUICK_ACTIONS_BY_LEVEL.beginner;
}
```

**4. Ajouter un selecteur de niveau dans le chat panel**

Dans le composant `DealChatPanel`, ajouter un etat `investorLevel` et un selecteur discret :

```tsx
// Dans le composant DealChatPanel, ajouter:
const [investorLevel, setInvestorLevel] = useState<"beginner" | "intermediate" | "expert">(
  () => {
    // Persister dans localStorage
    if (typeof window !== "undefined") {
      return (localStorage.getItem("angeldesk-investor-level") as "beginner" | "intermediate" | "expert") ?? "beginner";
    }
    return "beginner";
  }
);

const handleLevelChange = useCallback((level: "beginner" | "intermediate" | "expert") => {
  setInvestorLevel(level);
  if (typeof window !== "undefined") {
    localStorage.setItem("angeldesk-investor-level", level);
  }
}, []);
```

Et dans le header du chat panel, ajouter un selecteur en 3 boutons compacts :

```tsx
// Dans le header du chat panel:
<div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
  {(["beginner", "intermediate", "expert"] as const).map((level) => (
    <button
      key={level}
      onClick={() => handleLevelChange(level)}
      className={cn(
        "px-2 py-1 text-xs rounded transition-colors",
        investorLevel === level
          ? "bg-background shadow-sm font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {level === "beginner" ? "Debutant" : level === "intermediate" ? "Intermediaire" : "Expert"}
    </button>
  ))}
</div>
```

**5. Passer le niveau a l'API du chat**

Dans l'appel API d'envoi de message (`sendMessage`), ajouter `investorLevel` dans le body. Cote API, le passer au `FullChatContext` pour que `buildSystemPrompt()` l'utilise.

### Dependances
- F33 (onboarding) : Le niveau detecte a l'onboarding peut pre-remplir `investorLevel`.

### Verification
1. Ouvrir le chat IA sur un deal analyse
2. En mode "Debutant", les quick actions doivent etre en langage simple
3. Cliquer sur "C'est quoi ce score ?" — la reponse doit expliquer le score sans jargon
4. Passer en mode "Expert" — les quick actions changent, les reponses sont plus techniques

---

## F32 — Faux sentiment de securite plan FREE

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`
**Lignes** : 1030-1063

Le banner FREE actuel ne mentionne que le quota (analyses restantes) mais PAS les agents manquants :

```tsx
{usage && !usage.isUnlimited && (
  <Card className={usage.remainingDeals === 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
    <CardContent className="py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">
            {usage.remainingDeals === 0
              ? "Limite mensuelle atteinte"
              : `${usage.remainingDeals} analyse${usage.remainingDeals > 1 ? "s" : ""} restante${usage.remainingDeals > 1 ? "s" : ""} ce mois`}
          </p>
          <p className="text-sm text-muted-foreground">
            Plan FREE : {usage.monthlyLimit} deals/mois. PRO = analyses illimitees + synthese + expert sectoriel
          </p>
        </div>
        ...
      </div>
    </CardContent>
  </Card>
)}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/analysis-constants.ts`
**Lignes** : 23-42

Le plan FREE ne lance que `tier1_complete` (12 agents) tandis que PRO lance `full_analysis` (18+ agents incluant contradiction-detector, devils-advocate, scenario-modeler, synthesis-deal-scorer, memo-generator + expert sectoriel).

**Probleme** : L'utilisateur FREE voit 12 agents OK et pense avoir une DD complete. Or les agents les plus critiques (devil's advocate, contradiction detector) sont PRO. C'est un conflit d'interet : on cache les outils qui pourraient dire "ne faites pas ce deal".

### Correction

**Nouveau composant** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/partial-analysis-banner.tsx`

```tsx
"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Shield,
  Brain,
  BarChart3,
  FileText,
  Zap,
  Crown,
} from "lucide-react";
import type { SubscriptionPlan } from "@/lib/analysis-constants";

interface MissingAgent {
  name: string;
  icon: React.ReactNode;
  impact: string;
}

const MISSING_AGENTS_FOR_FREE: MissingAgent[] = [
  {
    name: "Devil's Advocate",
    icon: <Brain className="h-4 w-4 text-purple-500" />,
    impact: "Challenge la these d'investissement. Identifie les dealbreakers que les autres agents ne voient pas.",
  },
  {
    name: "Detecteur de contradictions",
    icon: <Zap className="h-4 w-4 text-amber-500" />,
    impact: "Compare les affirmations du deck entre elles et avec les donnees reelles. Detecte les incoherences cachees.",
  },
  {
    name: "Modelisation de scenarios",
    icon: <BarChart3 className="h-4 w-4 text-indigo-500" />,
    impact: "Calcule votre retour potentiel (IRR, multiple) dans 4 scenarios avec probabilites.",
  },
  {
    name: "Expert sectoriel",
    icon: <Shield className="h-4 w-4 text-cyan-500" />,
    impact: "Analyse specialisee avec les KPIs et standards du secteur. Detecte les risques specifiques.",
  },
  {
    name: "Memo d'investissement",
    icon: <FileText className="h-4 w-4 text-green-500" />,
    impact: "Document structure avec these d'investissement, risques mitiges, et prochaines etapes concretes.",
  },
];

interface PartialAnalysisBannerProps {
  subscriptionPlan: SubscriptionPlan;
  /** True if Tier 3 results are NOT present */
  isMissingTier3: boolean;
}

export const PartialAnalysisBanner = memo(function PartialAnalysisBanner({
  subscriptionPlan,
  isMissingTier3,
}: PartialAnalysisBannerProps) {
  const router = useRouter();

  // Only show for FREE users missing Tier 3
  if (subscriptionPlan !== "FREE" || !isMissingTier3) return null;

  return (
    <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-amber-900">
                Votre analyse est partielle
              </p>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                5 agents manquants
              </Badge>
            </div>
            <p className="text-sm text-amber-800 mb-3">
              Les agents ci-dessous sont essentiels pour une decision d'investissement eclairee.
              Sans eux, des risques critiques peuvent passer inapercus.
            </p>

            <div className="space-y-2 mb-4">
              {MISSING_AGENTS_FOR_FREE.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-start gap-2 p-2 rounded bg-white/60 border border-amber-200"
                >
                  {agent.icon}
                  <div>
                    <span className="text-sm font-medium text-amber-900">{agent.name}</span>
                    <p className="text-xs text-amber-700">{agent.impact}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                onClick={() => router.push("/pricing")}
              >
                <Crown className="mr-2 h-4 w-4" />
                Debloquer l'analyse complete
              </Button>
              <p className="text-xs text-amber-600">
                Votre score actuel pourrait changer significativement avec l'analyse complete.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
```

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/analysis-panel.tsx`
**Ligne ~1206** : Ajouter le banner AVANT les resultats Tier 1.

```tsx
// AVANT la ligne:
//   {isTier1Analysis && displayedResult.success && ...}
// Ajouter:

{/* Partial Analysis Warning - Show for FREE users without Tier 3 */}
<PartialAnalysisBanner
  subscriptionPlan={subscriptionPlan}
  isMissingTier3={!isTier3Analysis}
/>
```

Import :
```tsx
import { PartialAnalysisBanner } from "./partial-analysis-banner";
```

### Dependances
- F29 (prochaines etapes) : Le banner et les prochaines etapes se completent.
- F50 (surcharge) : Le banner aide a cadrer l'interpretation.

### Verification
1. Analyser un deal en FREE — le banner doit apparaitre au-dessus des resultats Tier 1
2. Verifier que les 5 agents manquants sont listes avec leur impact
3. En PRO (full_analysis), le banner ne doit PAS apparaitre
4. Le bouton "Debloquer" redirige vers /pricing

---

## F33 — Zero onboarding / tutoriel pour premier deal

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/dashboard/page.tsx`
**Lignes** : 54-155 (entierement)

Le dashboard affiche directement les stats et deals recents sans aucun onboarding :

```tsx
export default async function DashboardPage() {
  const user = await requireAuth();
  const { totalDeals, activeDeals, recentDeals, redFlagsCount } =
    await getDashboardStats(user.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Bienvenue, {user.name ?? "Business Angel"}
          </p>
        </div>
        ...
      </div>
      {/* Stats Cards + Recent Deals - aucun onboarding */}
    </div>
  );
}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/new/page.tsx`
**Lignes** : 185-389 (entierement)

Le formulaire de creation affiche les champs sans explications :

```tsx
<Label htmlFor="arr">ARR (EUR)</Label>
<Input id="arr" type="number" placeholder="Ex: 500000" ... />
```

Un BA debutant ne sait pas ce qu'est l'ARR ni quelle valeur mettre.

### Correction

**1. Composant d'onboarding pour le dashboard**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/onboarding/first-deal-guide.tsx`

```tsx
"use client";

import { memo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  Play,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FirstDealGuideProps {
  userName: string;
  totalDeals: number;
}

const STEPS = [
  {
    id: 1,
    title: "Creez votre premier deal",
    description: "Entrez les informations de base : nom de la startup, secteur, stade. Meme le minimum suffit pour commencer.",
    icon: FileText,
    action: "Creer un deal",
    href: "/deals/new",
  },
  {
    id: 2,
    title: "Uploadez le pitch deck",
    description: "Ajoutez le PDF du pitch deck. L'IA extraira automatiquement les metriques cles (valorisation, ARR, equipe...).",
    icon: Upload,
    action: null, // No action link for this step
    href: null,
  },
  {
    id: 3,
    title: "Lancez l'analyse",
    description: "12 agents IA analysent le deal en parallele : finances, equipe, marche, tech, legal... En 2-3 minutes, c'est fait.",
    icon: Play,
    action: null,
    href: null,
  },
  {
    id: 4,
    title: "Explorez les resultats",
    description: "Consultez le score, les red flags, et les questions a poser au fondateur. Utilisez le chat IA pour approfondir.",
    icon: MessageSquare,
    action: null,
    href: null,
  },
];

export const FirstDealGuide = memo(function FirstDealGuide({
  userName,
  totalDeals,
}: FirstDealGuideProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("angeldesk-onboarding-dismissed", "true");
    }
  }, []);

  // Don't show if dismissed or if user already has deals
  if (isDismissed || totalDeals > 0) return null;

  // Check localStorage for persistence
  if (typeof window !== "undefined" && localStorage.getItem("angeldesk-onboarding-dismissed")) {
    return null;
  }

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 relative overflow-hidden">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        aria-label="Fermer le guide"
      >
        <X className="h-4 w-4" />
      </button>

      <CardHeader className="pb-3">
        <CardTitle className="text-xl">
          Bienvenue {userName} ! Voici comment analyser votre premier deal
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          En 5 minutes, obtenez une analyse digne d'un fonds VC. Suivez ces 4 etapes.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "relative p-4 rounded-lg border bg-background transition-shadow hover:shadow-md",
                i === 0 && "ring-2 ring-primary/50"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                  {step.id}
                </span>
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {i === 0 && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => router.push("/deals/new")}
                >
                  Commencer
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Button>
              )}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
```

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/dashboard/page.tsx`
**Ligne ~60** : Ajouter le guide avant les stats.

Comme c'est un Server Component, il faut wraper le guide. Transformer en :

```tsx
// Apres le header (ligne ~74), AVANT les Stats Cards:
{totalDeals === 0 && (
  <FirstDealGuide
    userName={user.name ?? "Business Angel"}
    totalDeals={totalDeals}
  />
)}
```

Note : `FirstDealGuide` est un Client Component, donc il faut l'importer directement.

**2. Explications inline dans le formulaire de creation**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/new/page.tsx`

Ajouter des descriptions sous chaque champ financier. Exemple pour le champ ARR (ligne ~331-338) :

```tsx
// AVANT:
<div className="space-y-2">
  <Label htmlFor="arr">ARR (EUR)</Label>
  <Input id="arr" type="number" placeholder="Ex: 500000" ... />
</div>

// APRES:
<div className="space-y-2">
  <Label htmlFor="arr">ARR (EUR)</Label>
  <Input id="arr" type="number" placeholder="Ex: 500000" ... />
  <p className="text-xs text-muted-foreground">
    Revenu Annuel Recurrent. Chiffre d'affaires annualise des abonnements en cours. Si pas de SaaS, laissez vide.
  </p>
</div>
```

Ajouter egalement pour les autres champs :

```tsx
// Croissance YoY (ligne ~340-347):
<p className="text-xs text-muted-foreground">
  Taux de croissance annuel du CA ou de l'ARR. Ex: 150 = le CA a ete multiplie par 2.5 en un an.
</p>

// Montant demande (ligne ~349-356):
<p className="text-xs text-muted-foreground">
  Combien la startup leve dans ce round. Ex: 2000000 pour un round de 2M EUR.
</p>

// Valorisation pre-money (ligne ~358-365):
<p className="text-xs text-muted-foreground">
  Valorisation de la societe AVANT la levee. Votre part = montant investi / (pre-money + montant total leve).
</p>
```

Et ajouter une note d'encouragement en haut du formulaire (apres ligne 196) :

```tsx
{/* Encouraging note for first-time users */}
<Card className="bg-muted/50 border-dashed">
  <CardContent className="py-3">
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Vous n'avez pas toutes les infos ?</span>{" "}
      Pas de probleme. Seul le nom du deal est obligatoire. L'IA extraira le reste du pitch deck si vous l'uploadez ensuite.
    </p>
  </CardContent>
</Card>
```

### Dependances
- F31 (chat IA) : Le niveau investisseur detecte a l'onboarding peut alimenter le chat.

### Verification
1. Creer un nouveau compte (ou un utilisateur sans deals)
2. Le dashboard doit afficher le guide en 4 etapes
3. Cliquer "Commencer" doit rediriger vers /deals/new
4. Sur /deals/new, verifier les descriptions sous les champs financiers
5. Apres creation du premier deal, le guide doit disparaitre

---

## F50 — Surcharge informationnelle

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`
**Lignes** : 3573-3685 (Tier1Results main render)

Le composant affiche TOUTES les cartes d'agents simultanement dans un systeme d'onglets (overview, business, technical, strategic), mais chaque onglet contient deja 3-4 cartes complexes avec des sections depliables :

```tsx
// Ligne 3615-3621 — Les tabs:
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="grid w-full grid-cols-4">
    <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
    <TabsTrigger value="business">Business</TabsTrigger>
    <TabsTrigger value="technical">Technique</TabsTrigger>
    <TabsTrigger value="strategic">Strategique</TabsTrigger>
  </TabsList>
```

Chaque card contient des `ExpandableSection` (red flags, questions, metriques, concurrents...) qui peuvent aller jusqu'a 50+ items depliables.

**Probleme** : Le BA voit 12+ cartes d'agents, chacune avec multiple sections depliables. Il n'y a pas de hierarchie : un insight mineur a le meme poids visuel qu'un red flag critique.

### Correction

Ajouter un onglet "Resume" comme premier onglet par defaut, qui synthetise les top findings sans bruit.

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`
**Dans la fonction `Tier1Results`** (ligne 3573), ajouter un onglet "Resume" :

```tsx
// Nouveau composant a ajouter DANS le fichier tier1-results.tsx:

const Tier1SummaryView = memo(function Tier1SummaryView({
  scores,
  avgScore,
  results,
}: {
  scores: { name: string; score: number; icon: React.ReactNode }[];
  avgScore: number;
  results: Record<string, AgentResultWithReAct>;
}) {
  // Extract top red flags across all agents
  const topRedFlags = useMemo(() => {
    const allFlags: { title: string; severity: string; evidence: string; agent: string }[] = [];
    for (const [agentName, result] of Object.entries(results)) {
      if (!result.success || !result.data) continue;
      const data = result.data as { redFlags?: Array<{ title: string; severity: string; evidence: string }> };
      if (data.redFlags) {
        for (const rf of data.redFlags) {
          allFlags.push({ ...rf, agent: agentName });
        }
      }
    }
    // Sort by severity: CRITICAL > HIGH > MEDIUM > LOW
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    allFlags.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));
    return allFlags.slice(0, 5); // Top 5
  }, [results]);

  // Extract key insights across agents
  const topInsights = useMemo(() => {
    const insights: string[] = [];
    for (const result of Object.values(results)) {
      if (!result.success || !result.data) continue;
      const data = result.data as { narrative?: { keyInsights?: string[] } };
      if (data.narrative?.keyInsights) {
        insights.push(...data.narrative.keyInsights.slice(0, 1));
      }
    }
    return insights.slice(0, 5);
  }, [results]);

  // Extract weakest dimensions
  const weakestDimensions = useMemo(() => {
    return [...scores]
      .filter(s => s.score < 60)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [scores]);

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <div className="text-center py-4">
        <div className={cn(
          "text-5xl font-bold mb-1",
          avgScore >= 70 ? "text-green-600" :
          avgScore >= 50 ? "text-yellow-600" : "text-red-600"
        )}>
          {avgScore}/100
        </div>
        <p className="text-sm text-muted-foreground">Score moyen Tier 1</p>
      </div>

      {/* Weakest Dimensions */}
      {weakestDimensions.length > 0 && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-800 mb-2">Points faibles a investiguer</p>
          <div className="space-y-2">
            {weakestDimensions.map((dim, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {dim.icon}
                  <span className="text-sm">{dim.name}</span>
                </div>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  dim.score < 40 ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                )}>
                  {dim.score}/100
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Red Flags */}
      {topRedFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-red-600">
            Top red flags ({topRedFlags.length})
          </p>
          {topRedFlags.map((rf, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded border bg-card">
              <AlertTriangle className={cn(
                "h-4 w-4 shrink-0 mt-0.5",
                rf.severity === "CRITICAL" ? "text-red-600" :
                rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
              )} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{rf.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {formatAgentName(rf.agent)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{rf.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Insights */}
      {topInsights.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-blue-600">Insights cles</p>
          <ul className="space-y-1.5">
            {topInsights.map((insight, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <Lightbulb className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground pt-2 border-t">
        Explorez les onglets ci-dessus pour le detail agent par agent
      </p>
    </div>
  );
});
```

**Puis modifier les Tabs** (ligne 3615) :

```tsx
// AVANT:
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="grid w-full grid-cols-4">
    <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
    ...
  </TabsList>

// APRES:
<Tabs defaultValue="summary" className="w-full">
  <TabsList className="grid w-full grid-cols-5">
    <TabsTrigger value="summary">Resume</TabsTrigger>
    <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
    <TabsTrigger value="business">Business</TabsTrigger>
    <TabsTrigger value="technical">Technique</TabsTrigger>
    <TabsTrigger value="strategic">Strategique</TabsTrigger>
  </TabsList>

  {/* NEW Summary Tab */}
  <TabsContent value="summary" className="mt-4">
    <Tier1SummaryView
      scores={scores}
      avgScore={avgScore}
      results={results}
    />
  </TabsContent>

  {/* Existing tabs unchanged */}
  <TabsContent value="overview" className="space-y-4 mt-4">
    ...
```

### Dependances
- F30 (severite badges) : La vue Resume doit utiliser les `SeverityBadge` avec tooltips.

### Verification
1. Analyser un deal — l'onglet "Resume" doit etre selectionne par defaut
2. Le Resume montre : score, points faibles, top 5 red flags, insights cles
3. Les autres onglets (Vue d'ensemble, Business, etc.) restent accessibles
4. Le Resume doit tenir sur un ecran sans scroll excessif

---

## F51 — Aucune comparaison entre deals

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/deals/page.tsx`
**Lignes** : 39-88 (entierement)

La page deals est une simple liste avec un `DealsTable` :

```tsx
export default async function DealsPage() {
  const user = await requireAuth();
  const deals = await getDeals(user.id);

  return (
    <div className="space-y-6">
      ...
      <DealsTable deals={deals} />
    </div>
  );
}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`
**Lignes** : 45-100

La table affiche nom, secteur, stade, valorisation, statut, alerts. Aucun systeme de selection ni de comparaison :

```tsx
<TableHeader>
  <TableRow>
    <TableHead>Nom</TableHead>
    <TableHead>Secteur</TableHead>
    <TableHead>Stade</TableHead>
    <TableHead>Valorisation</TableHead>
    <TableHead>Statut</TableHead>
    <TableHead>Alerts</TableHead>
    <TableHead>Mis a jour</TableHead>
    <TableHead></TableHead>
  </TableRow>
</TableHeader>
```

**Probleme** : Un BA avec 5+ deals en pipeline ne peut pas comparer rapidement lequel est le meilleur. Il doit ouvrir chaque deal individuellement.

### Correction

**1. Ajouter des checkboxes de selection dans DealsTable**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deals-table.tsx`

Ajouter un etat `selectedDeals` et des checkboxes :

```tsx
// Ajouter dans le composant DealsTable:
const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
const [showComparison, setShowComparison] = useState(false);

const toggleDealSelection = useCallback((dealId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  setSelectedDeals(prev => {
    const next = new Set(prev);
    if (next.has(dealId)) {
      next.delete(dealId);
    } else if (next.size < 3) { // Max 3 deals to compare
      next.add(dealId);
    }
    return next;
  });
}, []);
```

Ajouter une colonne checkbox :

```tsx
<TableHead className="w-[40px]">
  {/* Select header - empty label */}
</TableHead>
```

Et dans chaque row :

```tsx
<TableCell onClick={(e) => e.stopPropagation()} className="w-[40px]">
  <input
    type="checkbox"
    checked={selectedDeals.has(deal.id)}
    onChange={() => {}}
    onClick={(e) => toggleDealSelection(deal.id, e as unknown as React.MouseEvent)}
    className="h-4 w-4 rounded border-gray-300"
  />
</TableCell>
```

**2. Barre d'action flottante quand 2+ deals selectionnes**

```tsx
// En bas du composant DealsTable, avant la fermeture du fragment:
{selectedDeals.size >= 2 && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
    <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-lg">
      <span className="text-sm font-medium">
        {selectedDeals.size} deal{selectedDeals.size > 1 ? "s" : ""} selectionne{selectedDeals.size > 1 ? "s" : ""}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setShowComparison(true)}
      >
        Comparer
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-primary-foreground hover:text-primary-foreground/80"
        onClick={() => setSelectedDeals(new Set())}
      >
        Annuler
      </Button>
    </div>
  </div>
)}
```

**3. Creer le composant de comparaison**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/deal-comparison.tsx`

```tsx
"use client";

import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { queryKeys } from "@/lib/query-keys";

interface DealComparisonProps {
  dealIds: string[];
  onClose: () => void;
}

interface DealComparisonData {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
  valuationPre: number | null;
  arr: number | null;
  growthRate: number | null;
  redFlagCount: number;
  criticalRedFlagCount: number;
}

async function fetchComparisonData(dealIds: string[]): Promise<{ data: DealComparisonData[] }> {
  const response = await fetch(`/api/deals/compare?ids=${dealIds.join(",")}`);
  if (!response.ok) throw new Error("Failed to fetch comparison data");
  return response.json();
}

const DIMENSION_LABELS: Record<string, string> = {
  globalScore: "Score Global",
  teamScore: "Equipe",
  marketScore: "Marche",
  productScore: "Produit",
  financialsScore: "Financier",
};

export const DealComparison = memo(function DealComparison({
  dealIds,
  onClose,
}: DealComparisonProps) {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.deals.lists(), "compare", ...dealIds],
    queryFn: () => fetchComparisonData(dealIds),
    enabled: dealIds.length >= 2,
  });

  const deals = data?.data ?? [];

  // Find best scores for highlighting
  const bestScores = useMemo(() => {
    const best: Record<string, number> = {};
    const dimensions = ["globalScore", "teamScore", "marketScore", "productScore", "financialsScore"];
    for (const dim of dimensions) {
      let max = -1;
      for (const deal of deals) {
        const val = (deal as Record<string, unknown>)[dim] as number | null;
        if (val != null && val > max) max = val;
      }
      best[dim] = max;
    }
    return best;
  }, [deals]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Chargement de la comparaison...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Comparaison de deals</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Dimension</th>
                {deals.map(deal => (
                  <th key={deal.id} className="text-center py-2 px-4 font-medium">
                    <div>{deal.name}</div>
                    <Badge variant="outline" className="text-xs mt-1">{deal.sector ?? "N/A"}</Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  {deals.map(deal => {
                    const val = (deal as Record<string, unknown>)[key] as number | null;
                    const isBest = val != null && val === bestScores[key] && deals.length > 1;
                    return (
                      <td key={deal.id} className="text-center py-2 px-4">
                        {val != null ? (
                          <span className={cn(
                            "font-medium",
                            isBest && "text-green-600 font-bold",
                            val < 50 && "text-red-600"
                          )}>
                            {val}/100
                            {isBest && deals.length > 1 && " *"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Red Flags row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">Red Flags</td>
                {deals.map(deal => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    <span className={cn(
                      "font-medium",
                      deal.criticalRedFlagCount > 0 && "text-red-600"
                    )}>
                      {deal.redFlagCount}
                      {deal.criticalRedFlagCount > 0 && (
                        <span className="text-xs text-red-500 ml-1">
                          ({deal.criticalRedFlagCount} critiques)
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
              {/* Valorisation row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">Valorisation</td>
                {deals.map(deal => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.valuationPre
                      ? `${(deal.valuationPre / 1_000_000).toFixed(1)}M`
                      : "--"}
                  </td>
                ))}
              </tr>
              {/* ARR row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">ARR</td>
                {deals.map(deal => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.arr
                      ? `${(deal.arr / 1_000).toFixed(0)}K`
                      : "--"}
                  </td>
                ))}
              </tr>
              {/* Growth row */}
              <tr>
                <td className="py-2 pr-4 text-muted-foreground">Croissance</td>
                {deals.map(deal => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.growthRate != null
                      ? `${deal.growthRate}%`
                      : "--"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          * Meilleur score dans la dimension
        </p>
      </CardContent>
    </Card>
  );
});
```

**4. API endpoint pour la comparaison**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/deals/compare/route.ts`

```tsx
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthApi } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await requireAuthApi();
  const ids = request.nextUrl.searchParams.get("ids")?.split(",") ?? [];

  if (ids.length < 2 || ids.length > 3) {
    return NextResponse.json({ error: "Need 2-3 deal IDs" }, { status: 400 });
  }

  const deals = await prisma.deal.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: {
      id: true,
      name: true,
      sector: true,
      stage: true,
      globalScore: true,
      teamScore: true,
      marketScore: true,
      productScore: true,
      financialsScore: true,
      valuationPre: true,
      arr: true,
      growthRate: true,
      redFlags: {
        where: { status: "OPEN" },
        select: { severity: true },
      },
    },
  });

  const data = deals.map(deal => ({
    id: deal.id,
    name: deal.name,
    sector: deal.sector,
    stage: deal.stage,
    globalScore: deal.globalScore,
    teamScore: deal.teamScore,
    marketScore: deal.marketScore,
    productScore: deal.productScore,
    financialsScore: deal.financialsScore,
    valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
    arr: deal.arr ? Number(deal.arr) : null,
    growthRate: deal.growthRate ? Number(deal.growthRate) : null,
    redFlagCount: deal.redFlags.length,
    criticalRedFlagCount: deal.redFlags.filter(rf => rf.severity === "CRITICAL" || rf.severity === "HIGH").length,
  }));

  return NextResponse.json({ data });
}
```

### Dependances
- Necessite un endpoint API `/api/deals/compare` (inclus dans la correction).
- Les scores `globalScore`, `teamScore`, etc. doivent etre renseignes dans la DB apres analyse.

### Verification
1. Aller sur /deals avec 2+ deals analyses
2. Cocher 2 deals — une barre flottante apparait en bas
3. Cliquer "Comparer" — un tableau comparatif s'affiche
4. Le meilleur score de chaque dimension est mis en evidence en vert
5. Verifier que la selection est limitee a 3 deals max

---

## F52 — Biais de confirmation : agents downstream contamines par previousResults

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts`
**Lignes** : 1850-1897 (methode `runTier1Phases`)

Les agents Tier 1 sont executes en 4 phases sequentielles. Apres chaque phase, les resultats sont injectes dans `enrichedContext.previousResults` :

```tsx
// Ligne 1858-1885:
// Run agents in this phase (parallel within phase)
const phaseResults = await Promise.all(
  phase.agents.map(async (agentName) => {
    const agent = tier1AgentMap[agentName];
    try {
      const result = await agent.run(enrichedContext);
      return { agentName, result };
    } catch (error) { ... }
  })
);

// Collect phase results
for (const { agentName, result } of phaseResults) {
  allResults[agentName] = result;
  totalCost += result.cost;
  completedCount++;
  enrichedContext.previousResults![agentName] = result;  // <-- INJECTION ICI
  ...
}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/base-agent.ts`
**Lignes** : 857-866

La methode `getExtractedInfo()` lit `previousResults` pour obtenir les donnees extraites du document-extractor :

```tsx
protected getExtractedInfo(context: AgentContext): Record<string, unknown> | null {
  const extractionResult = context.previousResults?.["document-extractor"];
  if (extractionResult?.success && "data" in extractionResult) {
    const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
    return data.extractedInfo ?? null;
  }
  return null;
}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/types.ts`
**Lignes** : 119-167 (TIER1_PHASE_A/B/C/D)

Les phases sont :
- **Phase A** : `deck-forensics` (seul) — pas de biais car premier
- **Phase B** : `financial-auditor` (seul) — recoit deck-forensics dans previousResults
- **Phase C** : `team-investigator`, `competitive-intel`, `market-intelligence` (parallele) — recoivent Phase A + B
- **Phase D** : tous les restants (7 agents paralleles) — recoivent Phase A + B + C

**Impact du biais** : Si `financial-auditor` (Phase B) score le deal a 30/100, les agents de Phase C et D voient ce score et risquent d'ajuster leur evaluation a la baisse par biais d'ancrage. L'inverse est aussi vrai : un score eleve peut masquer des problemes.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier2/marketplace-expert.ts`
**Lignes** : 385-409

Les experts Tier 2 lisent directement les resultats d'agents :

```tsx
const tier1Results = context.previousResults ?? {};
const previousResults = tier1Results;

if (previousResults) {
  const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
  // ... accede aux findings ET aux narratives (contenant les evaluations/scores)
```

### Correction

La correction doit etre CHIRURGICALE : on ne veut PAS supprimer `previousResults` (les agents en ont besoin pour les donnees factuelles comme les metriques extraites). On doit FILTRER ce qui est injecte.

**1. Creer un filtre de previousResults qui retire les evaluations**

**Nouveau fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestration/result-sanitizer.ts`

```tsx
/**
 * Result Sanitizer
 *
 * Filters agent results before injection into downstream agent contexts.
 * GOAL: Remove evaluative content (scores, assessments, verdicts) while
 * keeping raw factual data (metrics, numbers, extracted text).
 *
 * This prevents confirmation bias where downstream agents anchor on
 * upstream evaluations instead of forming independent assessments.
 */

import type { AgentResult } from "../types";

/**
 * Keys that contain evaluative judgments (scores, verdicts, assessments).
 * These should be STRIPPED from previousResults before injection.
 */
const EVALUATIVE_KEYS = new Set([
  "score",
  "overallScore",
  "verdict",
  "assessment",
  "recommendation",
  "alertSignal",
  "narrative",  // Contains keyInsights which are evaluative
  "investmentRecommendation",
  "skepticismAssessment",
  "killReasons",
  "concernsSummary",
  "moatVerdict",
]);

/**
 * Keys that contain raw factual data (metrics, numbers, lists).
 * These should be KEPT in previousResults.
 */
const FACTUAL_KEYS = new Set([
  "findings",
  "redFlags",
  "questions",
  "meta",
  "extractedInfo",
  "competitors",
  "founderProfiles",
  "teamMemberProfiles",
  "teamComposition",
  "metrics",
  "burn",
  "valuation",
  "projections",
  "marketSize",
  "fundingTrend",
  "claimVerification",
  "inconsistencies",
  "deckQuality",
]);

/**
 * Recursively strip evaluative keys from a data object.
 * Returns a new object with only factual data.
 */
function stripEvaluativeData(data: unknown, depth = 0): unknown {
  if (depth > 5) return data; // Safety: don't recurse too deep
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map(item => stripEvaluativeData(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Strip evaluative keys at the TOP level of agent data
    if (depth <= 1 && EVALUATIVE_KEYS.has(key)) {
      continue; // Skip this key entirely
    }

    // For nested objects within findings, strip score-like subkeys
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      // Remove score subfields within nested objects
      if ("score" in nested && "value" in (nested.score as Record<string, unknown> ?? {})) {
        const { score: _score, ...rest } = nested;
        result[key] = stripEvaluativeData(rest, depth + 1);
        continue;
      }
    }

    result[key] = stripEvaluativeData(value, depth + 1);
  }
  return result;
}

/**
 * Sanitize an agent result for injection into downstream agents.
 * Keeps: success status, execution time, raw factual data
 * Removes: scores, verdicts, assessments, narratives
 */
export function sanitizeResultForDownstream(result: AgentResult): AgentResult {
  // Always keep: document-extractor (pure data extraction, no evaluation)
  // Always keep: fact-extractor (pure fact extraction)
  if (
    result.agentName === "document-extractor" ||
    result.agentName === "fact-extractor" ||
    result.agentName === "deck-coherence-checker"
  ) {
    return result; // No sanitization needed for pure extractors
  }

  // For analysis agents: strip evaluative data
  if (!result.success || !("data" in result)) {
    return result; // Nothing to sanitize
  }

  const sanitizedData = stripEvaluativeData((result as { data: unknown }).data);

  return {
    ...result,
    data: sanitizedData,
  } as AgentResult;
}

/**
 * Sanitize a full previousResults map for downstream injection.
 */
export function sanitizePreviousResults(
  results: Record<string, AgentResult>
): Record<string, AgentResult> {
  const sanitized: Record<string, AgentResult> = {};
  for (const [key, result] of Object.entries(results)) {
    sanitized[key] = sanitizeResultForDownstream(result);
  }
  return sanitized;
}
```

**2. Appliquer le filtre dans runTier1Phases**

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts`
**Ligne 1885** : Remplacer l'injection directe par une injection sanitisee.

```tsx
// AVANT (ligne 1885):
enrichedContext.previousResults![agentName] = result;

// APRES:
// Store full result in allResults (for persistence and post-processing)
// But inject sanitized version into context (no scores/verdicts to avoid bias)
const { sanitizeResultForDownstream } = await import("../orchestration/result-sanitizer");
enrichedContext.previousResults![agentName] = sanitizeResultForDownstream(result);
```

Note : L'import dynamique evite d'alourdir le bundle si le fichier n'est utilise que dans l'orchestrator server-side. Alternativement, on peut utiliser un import statique en haut du fichier.

**IMPORTANT** : Les resultats COMPLETS (`allResults`) sont toujours utilises pour :
- La persistence en DB
- Le consensus engine (qui a besoin des scores pour debattre)
- La reflexion engine
- Le post-processing

Seul `enrichedContext.previousResults` est sanitise, car c'est ce que les agents downstream recoivent dans leur contexte.

**3. Exception pour les agents Tier 3**

Les agents Tier 3 (synthesis-deal-scorer, devils-advocate, etc.) DOIVENT recevoir les resultats complets car leur role est justement de synthetiser. Ne pas appliquer le filtre pour eux.

**Modification** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestrator/index.ts`
**Ligne ~758** (methode `runTier3Synthesis`) : S'assurer que `previousResults` contient les resultats complets.

```tsx
// Dans runTier3Synthesis (ligne ~758):
// Tier 3 agents NEED full evaluative data (that's their job: synthesize)
// So we pass unsanitized results
const context: AgentContext = {
  dealId,
  deal,
  documents: deal.documents,
  previousResults: tier1Results ?? {},  // Full results, NOT sanitized
};
```

Cela est deja le cas dans le code actuel (ligne 758). Verifier qu'on n'applique pas le filtre ici.

### Dependances
- Aucune dependance frontend. C'est une correction purement backend.
- Le consensus engine et la reflexion engine continuent de recevoir les resultats complets via `allResults`.

### Verification
1. Lancer une analyse Tier 1 complete
2. Dans les logs (`[Orchestrator]`), verifier que les agents Phase C et D ne recoivent PAS les scores des agents precedents dans leur contexte
3. Comparer les scores avant/apres correction :
   - Si un deal avait un financial-auditor a 30/100, verifier que les autres agents ne sont plus ancres a ce score bas
   - Les scores devraient etre plus disperses (plus de variance inter-agents)
4. Verifier que `document-extractor` et `fact-extractor` passent toujours les donnees completes
5. Verifier que Tier 3 recoit toujours les resultats complets

---

## Resume des fichiers a creer

| Fichier | Faille |
|---------|--------|
| `src/components/deals/next-steps-guide.tsx` | F29 |
| `src/components/shared/severity-badge.tsx` | F30 |
| `src/components/shared/severity-legend.tsx` | F30 |
| `src/components/deals/partial-analysis-banner.tsx` | F32 |
| `src/components/onboarding/first-deal-guide.tsx` | F33 |
| `src/components/deals/deal-comparison.tsx` | F51 |
| `src/app/api/deals/compare/route.ts` | F51 |
| `src/agents/orchestration/result-sanitizer.ts` | F52 |

## Resume des fichiers a modifier

| Fichier | Faille | Nature de la modification |
|---------|--------|--------------------------|
| `src/components/deals/analysis-panel.tsx` | F29, F32 | Ajouter NextStepsGuide et PartialAnalysisBanner |
| `src/components/deals/tier1-results.tsx` | F30, F50 | Remplacer badges severite, ajouter onglet Resume |
| `src/agents/chat/deal-chat-agent.ts` | F31 | Adapter system prompt au niveau utilisateur |
| `src/components/chat/deal-chat-panel.tsx` | F31 | Quick actions par niveau, selecteur de niveau |
| `src/app/(dashboard)/dashboard/page.tsx` | F33 | Ajouter FirstDealGuide |
| `src/app/(dashboard)/deals/new/page.tsx` | F33 | Descriptions inline des champs |
| `src/components/deals/deals-table.tsx` | F51 | Checkboxes de selection + barre flottante |
| `src/agents/orchestrator/index.ts` | F52 | Sanitiser previousResults pour agents downstream |

## Matrice de dependances

```
F29 (Next Steps) ←→ F32 (Analyse partielle) : se completent
F30 (Severity)    → F50 (Resume) : le resume utilise SeverityBadge
F31 (Chat niveau) ← F33 (Onboarding) : le niveau detecte alimente le chat
F32 (Partielle)   → F29 (Next Steps) : le banner mentionne les agents PRO
F50 (Resume)      → F30 (Severity) : utilise les tooltips de severite
F51 (Comparaison)   independant
F52 (Biais)         independant (backend only)
```

## Ordre d'implementation recommande

1. **F52** (backend, pas d'impact UI, risque minimal)
2. **F30** (composants partages SeverityBadge/Legend, prereq pour F50)
3. **F50** (vue Resume, depend de F30)
4. **F33** (onboarding, independant)
5. **F31** (chat niveau, peut utiliser le niveau de F33)
6. **F32** (banner analyse partielle)
7. **F29** (next steps, depend de F32)
8. **F51** (comparaison, independant mais necessite un endpoint API)
