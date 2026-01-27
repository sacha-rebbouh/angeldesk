# Angel Desk - Project Context

## Description
Plateforme de Due Diligence IA **pour Business Angels** (95% de la cible).

> "La DD d'un fonds VC, accessible a un Business Angel solo."

## Cible principale
**Business Angels** - investisseurs individuels qui:
- Sont seuls (pas d'equipe d'analystes)
- N'ont pas le temps (2-3h/semaine max pour les deals)
- N'ont pas acces aux donnees pro (PitchBook = 20K€/an)
- Investissent souvent "au feeling" faute de mieux

## Value proposition
En 5 min, un BA obtient:
- La DD qu'un analyste VC ferait en 2 jours
- 50+ deals comparables pour savoir si la valo est bonne
- Red flags detectes automatiquement
- Questions a poser au fondateur
- Arguments de negociation chiffres

## Document Principal
**IMPORTANT**: Au debut de chaque session, lire le fichier `investor.md` a la racine du projet.
Ce fichier contient:
- La vision produit complete (v5.0)
- Les killer features detaillees
- L'architecture technique
- Les specs des 39 agents
- Le Context Engine
- Le Model Orchestration Layer

## Fichiers cles
- `investor.md` - Document de vision produit (~3500 lignes)
- `changes-log.md` - Historique des modifications
- `AGENT-REFONTE-PROMPT.md` - **Guide de refonte des 28 agents (Tier 1, 2 et 3)** (voir section dediee)
- `dbagents.md` - Systeme de maintenance de la DB (CLEANER, SOURCER, COMPLETER, SUPERVISOR)
- `DB-EXPLOITATION-SPEC.md` - **Specification d'exploitation de la DB par les agents** (voir section dediee)

## Principes de developpement
1. **Value-first** - L'utilisateur voit de la valeur des le premier deal
2. **Context is king** - Pas d'analyse sans contexte (50K+ deals, benchmarks, etc.)
3. **Zero faux positifs** - Chaque red flag doit avoir un confidence score > 80%
4. **Pas de probabilites** - Scores multi-dimensionnels, pas de "65% de chance de reussir"

## Stack technique (IMPLEMENTE)
- **Frontend/Backend**: Next.js 16+ (App Router, TypeScript, Tailwind)
- **Database**: PostgreSQL (Neon) + Prisma ORM
- **Auth**: Clerk (+ mode BYPASS_AUTH pour dev)
- **LLM Gateway**: OpenRouter (Claude 3.5 Sonnet, GPT-4o, etc.)
- **UI**: shadcn/ui
- **State**: React Query (TanStack Query)
- **Storage**: Vercel Blob (configure, pas encore utilise)

## Commandes utiles
```bash
# Lancer le serveur dev (port 3003)
npm run dev -- -p 3003

# Voir les tables DB
npx dotenv -e .env.local -- npx prisma studio

# Regenerer Prisma client
npx prisma generate

# Type check
npx tsc --noEmit
```

## Structure des agents IA
```
src/agents/
├── types.ts           # Types pour tous les agents
├── base-agent.ts      # Classe abstraite
├── orchestrator.ts    # Gestion des analyses
├── deal-screener.ts   # ✅ Screening GO/NO-GO
├── document-extractor.ts  # ✅ Extraction docs
├── deal-scorer.ts     # ✅ Scoring 5 dimensions
└── red-flag-detector.ts   # ✅ Detection risques
```

## Fichiers cles
- `investor.md` - Document de vision produit (~3500 lignes)
- `changes-log.md` - Historique des modifications (LIRE EN PREMIER)
- `.env.local` - Credentials (Clerk, Neon, OpenRouter)

## Prochaines priorites
1. PDF Text Extraction (extraire texte des pitch decks)
2. Context Engine (APIs Crunchbase/Dealroom)
3. Seed Benchmarks (donnees de comparaison)
4. 23 agents restants (voir investor.md)

---

## REFONTE DES 39 AGENTS (3 TIERS)

### Resume
**39 agents a refondre, repartis en 3 tiers :**

| Tier | Nb | Role | Execution |
|------|----|------|-----------|
| Tier 1 | 13 | Analyse | Parallele |
| Tier 2 | 21 | Experts sectoriels (20 secteurs + 1 general) | Dynamique (selon secteur) |
| Tier 3 | 5 | Synthese | Sequentiel (apres Tier 1 & 2) |

> Note: technical-dd a ete split en 2 agents (tech-stack-dd + tech-ops-dd) pour optimiser les couts et eviter les timeouts sur Haiku (limite 4096 tokens output).

### Contexte
Les agents actuels produisent des outputs insuffisants:
- Analyses superficielles
- Pas assez actionnables
- Trop generiques
- Manque de rigueur

### Guide de Refonte
Le fichier **`AGENT-REFONTE-PROMPT.md`** a la racine contient:
- La vision et philosophie des agents
- Les anti-patterns a eliminer (avec exemples)
- Les standards de qualite Big4 + Partner VC
- L'architecture des prompts (system + user)
- Le format de sortie detaille (Tier 1, 2 et 3)
- Les regles absolues
- La gestion des donnees manquantes
- L'exploitation de la Funding Database
- Un template de refonte
- Une checklist de validation
- La liste des **39 agents** a refondre

### Comment utiliser ce guide

**AVANT de modifier un agent (Tier 1, 2 ou 3):**
1. Lire `AGENT-REFONTE-PROMPT.md` en entier
2. Identifier les anti-patterns dans l'agent actuel
3. Suivre le template de refonte (Section 9)
4. Valider avec la checklist (Section 10)

**Pour chaque nouvelle session Claude:**
```
Je dois refondre l'agent [NOM].
Lis d'abord AGENT-REFONTE-PROMPT.md puis investor.md (sections pertinentes).
Ensuite, applique le guide pour refaire l'agent.
```

### Agents a Refondre (39 total)

**TIER 1 - Analyse (13 agents)**
```
src/agents/tier1/
├── financial-auditor.ts      [PRIORITE 1]
├── deck-forensics.ts         [PRIORITE 1]
├── team-investigator.ts      [PRIORITE 1]
├── market-intelligence.ts    [PRIORITE 2]
├── competitive-intel.ts      [PRIORITE 2]
├── exit-strategist.ts        [PRIORITE 2]
├── tech-stack-dd.ts          [PRIORITE 3] Stack + Scalabilite + Dette (split de technical-dd)
├── tech-ops-dd.ts            [PRIORITE 3] Maturite + Equipe + Secu + IP (split de technical-dd)
├── legal-regulatory.ts       [PRIORITE 3]
├── gtm-analyst.ts            [PRIORITE 3]
├── customer-intel.ts         [PRIORITE 3]
├── cap-table-auditor.ts      [PRIORITE 3]
└── question-master.ts        [PRIORITE 3]
```

**TIER 2 - Experts Sectoriels (21 agents: 20 secteurs + 1 general)**

*Implementes (10 secteurs):*
```
src/agents/tier2/
├── saas-expert.ts            [IMPL] SaaS, B2B Software
├── fintech-expert.ts         [IMPL] Fintech, Payments, InsurTech
├── marketplace-expert.ts     [IMPL] Marketplaces, Platforms
├── ai-expert.ts              [IMPL] AI/ML, LLM
├── healthtech-expert.ts      [IMPL] Digital Health, MedTech
├── deeptech-expert.ts        [IMPL] Deep Science, Hard Tech
├── climate-expert.ts         [IMPL] CleanTech, GreenTech
├── consumer-expert.ts        [IMPL] D2C, E-commerce
├── hardware-expert.ts        [IMPL] IoT, Robotics
└── gaming-expert.ts          [IMPL] Gaming, Mobile Games
```

*A creer (10 secteurs):*
```
src/agents/tier2/
├── biotech-expert.ts         [TODO] Life Sciences, Pharma, Drug Discovery
├── edtech-expert.ts          [TODO] Education, Learning Platforms
├── proptech-expert.ts        [TODO] Real Estate, Construction Tech
├── mobility-expert.ts        [TODO] Transportation, Logistics
├── foodtech-expert.ts        [TODO] AgTech, Alt Protein, F&B
├── hrtech-expert.ts          [TODO] Workforce, Recruitment, Payroll
├── legaltech-expert.ts       [TODO] Law Tech, RegTech, Compliance
├── cybersecurity-expert.ts   [TODO] InfoSec, Security Software
├── spacetech-expert.ts       [TODO] Aerospace, Satellite, NewSpace
└── creator-expert.ts         [TODO] Creator Economy, Media, Content
```

*Fallback pour secteurs non couverts:*
```
src/agents/tier2/
└── general-expert.ts         [TODO] 100% recherche web, pas de standards hardcodes
```

*Fichiers support:*
```
src/agents/tier2/
├── base-sector-expert.ts     [IMPL] Classe abstraite
├── sector-standards.ts       [IMPL] Standards etablis (formules, seuils)
└── benchmark-injector.ts     [IMPL] Injection benchmarks dans prompts
```

**TIER 3 - Synthese (5 agents)**
```
src/agents/tier3/
├── contradiction-detector.ts   [CRITIQUE]
├── synthesis-deal-scorer.ts    [CRITIQUE]
├── devils-advocate.ts          [HIGH]
├── scenario-modeler.ts         [HIGH]
└── memo-generator.ts           [HIGH]
```

### Standards de Qualite Rappel
- Chaque affirmation doit etre sourcee
- Chaque red flag: severite + preuve + impact + question
- Cross-reference obligatoire avec Context Engine et Funding DB
- Calculs montres, pas juste les resultats
- Output actionnable pour un BA

---

## EXPLOITATION DE LA FUNDING DATABASE

### Contexte
La DB de deals (5,000+ cible) est une **intelligence competitive** qui doit etre exploitee par les agents d'analyse.

### Document de reference
Le fichier **`DB-EXPLOITATION-SPEC.md`** a la racine contient:
- Les 4 usages prioritaires de la DB
- Le schema de donnees cible (champs a ajouter)
- Les instructions d'exploitation par agent
- La logique de matching (concurrents, benchmarks)
- Le format d'injection dans les prompts
- Le cross-reference obligatoire

### Usages de la DB (par priorite)

1. **Detection concurrents** - Trouver des boites similaires (memes use cases, secteur)
2. **Benchmark valorisation** - Positionner le deal vs P25/median/P75 du marche
3. **Validation market timing** - Tendance de funding du secteur (chaud/froid)
4. **Track record investisseurs** - Qui investit dans ce secteur, signaux

### Agents concernes

| Agent | Usage DB |
|-------|----------|
| `financial-auditor` | Benchmark valo, multiples |
| `competitive-intel` | Detection concurrents |
| `market-intelligence` | Tendances marche |
| `exit-strategist` | Comparables exit |
| `deck-forensics` | Verification claims vs DB |

### Cross-reference obligatoire

Chaque claim du deck concernant le marche ou la competition DOIT etre confronte a la DB:
- "Pas de concurrent" → verifier dans la DB
- "Valorisation fair" → comparer aux benchmarks DB
- "Marche en croissance" → verifier tendance DB

### Pour chaque session Claude

```
Je travaille sur [AGENT/FEATURE lié à la DB].
Lis d'abord DB-EXPLOITATION-SPEC.md pour comprendre comment exploiter la DB.
```

### Relations entre documents

```
dbagents.md           → Maintenance DB (CLEANER, SOURCER, COMPLETER)
DB-EXPLOITATION-SPEC.md → Exploitation DB (par agents Tier 1)
AGENT-REFONTE-PROMPT.md → Standards des agents (doit integrer specs DB)
```
