# Angel Desk - Project Context

## Description
Plateforme de Due Diligence IA **pour Business Angels** (95% de la cible).
> "La DD d'un fonds VC, accessible a un Business Angel solo."

## Cible principale
**Business Angels** - investisseurs individuels qui sont seuls, n'ont pas le temps (2-3h/semaine), n'ont pas accès aux données pro, et investissent souvent "au feeling".

## Value proposition
En 5 min, un BA obtient : la DD qu'un analyste VC ferait en 2 jours, 50+ deals comparables, red flags détectés, questions à poser, arguments de négociation chiffrés.

## Principes de développement
1. **Value-first** - L'utilisateur voit de la valeur dès le premier deal
2. **Context is king** - Pas d'analyse sans contexte (50K+ deals, benchmarks)
3. **Zero faux positifs** - Chaque red flag : confidence score > 80%
4. **Pas de probabilités** - Scores multi-dimensionnels

---

## POSITIONNEMENT PRODUIT — RÈGLE N°1 (s'applique à TOUT)

### Le principe fondamental

> **Angel Desk ANALYSE et GUIDE. Angel Desk ne DÉCIDE JAMAIS.**
>
> Le Business Angel est le seul décideur. L'outil rapporte des signaux, des faits, des comparaisons. Il ne dit jamais quoi faire.

Ceci est la règle la plus importante du projet. Elle s'applique à **tout** : prompts agents, UI, PDF, chat, labels, textes générés par les LLM.

### Ce qui est INTERDIT — tolérance zéro

| Interdit | Pourquoi | Remplacer par |
|----------|----------|---------------|
| "Investir" / "Ne pas investir" | Prescriptif, on décide à la place du BA | "Signaux favorables" / "Signaux d'alerte dominants" |
| "GO / NO-GO" | Binaire et directif | Profil de signal (voir grille ci-dessous) |
| "Rejeter l'opportunité" | On ordonne au BA | "Les signaux d'alerte dominent sur X dimensions" |
| "Passer ce deal" | Prescriptif | "Vigilance requise" / "Zone d'alerte" |
| "Dealbreaker" | Trop définitif, on ferme la porte | "Risque critique" |
| "Toute négociation serait une perte de temps" | Agressif et directif | "Les points de négociation identifiés sont limités compte tenu des signaux d'alerte" |
| "Recommandation : PASS" | On recommande une action | "Signal : Signaux d'alerte dominants" |
| Tout impératif adressé au BA ("Rejetez", "N'investissez pas", "Fuyez") | On commande | Constater les faits, laisser le BA conclure |

### La grille de profils de signal (remplace les verdicts)

| Score | Ancien verdict (INTERDIT) | Nouveau profil de signal |
|-------|--------------------------|--------------------------|
| 85-100 | ~~STRONG_PASS~~ / ~~INVESTIR~~ | **Signaux très favorables** |
| 70-84 | ~~PASS~~ / ~~INVESTIR~~ | **Signaux favorables** |
| 55-69 | ~~CONDITIONAL_PASS~~ / ~~NÉGOCIER~~ | **Signaux contrastés** |
| 40-54 | ~~WEAK_PASS~~ / ~~ATTENDRE~~ | **Vigilance requise** |
| 0-39 | ~~NO_GO~~ / ~~PASSER~~ | **Signaux d'alerte dominants** |

### Labels de score (analytiques, jamais évaluatifs)

| Score | Label |
|-------|-------|
| 80+ | Excellent |
| 60-79 | Solide |
| 40-59 | À approfondir |
| 20-39 | Points d'attention |
| 0-19 | Zone d'alerte |

### Exemples de reformulation

**Avant (INTERDIT) :**
> "Recommandation : NE PAS INVESTIR. Ce deal présente trop de risques. Toute négociation serait une perte de temps. Rejeter l'opportunité."

**Après (CORRECT) :**
> "Profil de signal : Signaux d'alerte dominants sur 6 dimensions. 10 risques critiques identifiés dont 4 sur les financials. Les points de négociation sont limités par l'absence de données vérifiables. Questions prioritaires à poser au fondateur avant toute décision."

**Règle d'or :** Chaque phrase doit pouvoir se terminer par "...à vous de décider" sans que ce soit absurde. Si une phrase ne passe pas ce test, elle est trop directive.

### Où ça s'applique concrètement

1. **Prompts agents (system prompts)** — Les LLM ne doivent JAMAIS générer de texte prescriptif dans les champs `narrative`, `nextSteps`, `forNegotiation`, `rationale`, `verdict`. Les instructions doivent explicitement demander un ton analytique.
2. **UI (composants React)** — Tous les labels passent par `src/lib/ui-configs.ts` (RECOMMENDATION_CONFIG, VERDICT_CONFIG, ALERT_SIGNAL_LABELS, READINESS_LABELS). Ne jamais hardcoder de label prescriptif.
3. **PDF** — Les labels passent par `src/lib/pdf/pdf-helpers.ts` (`recLabel()`). Même règle.
4. **Chat IA** — Le system prompt du chat doit maintenir le ton analytique.
5. **Landing / Pricing** — "Vos analystes IA font le travail, vous décidez."

### État de l'implémentation (2026-02-22)

**Fait :**
- UI configs centrales (`ui-configs.ts`) — tous les labels relabelisés
- Composants d'affichage (verdict-panel, tier1/2/3-results, early-warnings, severity-badge/legend)
- PDF (tous les pdf-sections, pdf-helpers, pdf-components)
- Orchestrator summary (`summary.ts`)
- Landing + Pricing
- Glossaire (`glossary.ts`)
- Chat prompt

**Reste à faire :**
- Les **system prompts des agents Tier 3** génèrent encore du texte libre directif (le LLM écrit "Rejeter", "perte de temps", etc. dans `nextSteps`, `forNegotiation`, `narrative.summary`). Les prompts de `synthesis-deal-scorer.ts`, `memo-generator.ts`, `devils-advocate.ts` doivent être mis à jour pour interdire explicitement le langage prescriptif dans le contenu généré.

## Stack technique
- **Frontend/Backend**: Next.js 16+ (App Router, TypeScript, Tailwind)
- **Database**: PostgreSQL (Neon) + Prisma ORM
- **Auth**: Clerk (+ BYPASS_AUTH pour dev)
- **LLM Gateway**: OpenRouter (Claude 3.5 Sonnet, GPT-4o, etc.)
- **UI**: shadcn/ui
- **State**: React Query (TanStack Query)
- **Storage**: Vercel Blob

## Commandes utiles
```bash
npm run dev -- -p 3003          # Serveur dev
npx dotenv -e .env.local -- npx prisma studio  # Tables DB
npx prisma generate             # Regénérer Prisma client
npx tsc --noEmit                # Type check
```

## Documents de référence
- `investor.md` — Vision produit complète (~3500 lignes). Lire si la tâche concerne l'architecture, les agents ou la vision produit.
- `AGENT-REFONTE-PROMPT.md` — Guide de refonte des agents. Lire avant de modifier un agent.
- `DB-EXPLOITATION-SPEC.md` — Spécification d'exploitation de la DB par les agents.
- `dbagents.md` — Système de maintenance DB (CLEANER, SOURCER, COMPLETER, SUPERVISOR).
- `changes-log.md` — Historique des modifications.

---

## REFONTE DES 40 AGENTS (3 TIERS)

| Tier | Nb | Rôle | Exécution |
|------|----|------|-----------|
| Tier 1 | 13 | Analyse | Parallèle |
| Tier 2 | 22 | Experts sectoriels (21 secteurs + 1 général) | Dynamique (selon secteur) |
| Tier 3 | 5 | Synthèse | Séquentiel (après Tier 1 & 2) |

> technical-dd a été split en tech-stack-dd + tech-ops-dd (optimisation coûts/timeouts Haiku).

### Tier 1 — Analyse (13 agents)
```
src/agents/tier1/
├── financial-auditor.ts      [P1]
├── deck-forensics.ts         [P1]
├── team-investigator.ts      [P1]
├── market-intelligence.ts    [P2]
├── competitive-intel.ts      [P2]
├── exit-strategist.ts        [P2]
├── tech-stack-dd.ts          [P3] Stack + Scalabilité + Dette
├── tech-ops-dd.ts            [P3] Maturité + Équipe + Sécu + IP
├── legal-regulatory.ts       [P3]
├── gtm-analyst.ts            [P3]
├── customer-intel.ts         [P3]
├── cap-table-auditor.ts      [P3]
└── question-master.ts        [P3]
```

### Tier 2 — Experts Sectoriels (22 agents)

Implémentés (11) :
```
src/agents/tier2/
├── saas-expert.ts        ├── fintech-expert.ts
├── marketplace-expert.ts ├── ai-expert.ts
├── healthtech-expert.ts  ├── deeptech-expert.ts
├── climate-expert.ts     ├── consumer-expert.ts
├── hardware-expert.ts    ├── gaming-expert.ts
└── blockchain-expert.ts
```

À créer (10) : biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator.

Fallback : `general-expert.ts` (100% recherche web).

Support : `base-sector-expert.ts`, `sector-standards.ts`, `benchmark-injector.ts`.

### Tier 3 — Synthèse (5 agents)
```
src/agents/tier3/
├── contradiction-detector.ts   [CRITIQUE]
├── synthesis-deal-scorer.ts    [CRITIQUE]
├── devils-advocate.ts          [HIGH]
├── scenario-modeler.ts         [HIGH]
└── memo-generator.ts           [HIGH]
```

### Standards de qualité
- Chaque affirmation sourcée
- Red flags : sévérité + preuve + impact + question
- Cross-reference obligatoire avec Context Engine et Funding DB
- Calculs montrés, pas juste les résultats
- Output actionnable pour un BA

---

## EXPLOITATION DE LA FUNDING DATABASE

La DB de deals (5,000+ cible) est exploitée par les agents d'analyse. Détails complets dans `DB-EXPLOITATION-SPEC.md`.

### Usages prioritaires
1. **Détection concurrents** — Boîtes similaires (use cases, secteur)
2. **Benchmark valorisation** — Deal vs P25/médian/P75
3. **Validation market timing** — Tendance funding secteur
4. **Track record investisseurs** — Qui investit, signaux

### Agents concernés
| Agent | Usage DB |
|-------|----------|
| `financial-auditor` | Benchmark valo, multiples |
| `competitive-intel` | Détection concurrents |
| `market-intelligence` | Tendances marché |
| `exit-strategist` | Comparables exit |
| `deck-forensics` | Vérification claims vs DB |

### Cross-reference obligatoire
Chaque claim du deck (concurrence, valorisation, marché) doit être confronté à la DB.

### Relations entre documents
```
dbagents.md           → Maintenance DB
DB-EXPLOITATION-SPEC.md → Exploitation DB (agents Tier 1)
AGENT-REFONTE-PROMPT.md → Standards agents
```
