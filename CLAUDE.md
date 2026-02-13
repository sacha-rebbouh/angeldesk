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
