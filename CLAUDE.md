# FULLINVEST - Project Context

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
- Les specs des 27 agents
- Le Context Engine
- Le Model Orchestration Layer

## Fichiers cles
- `investor.md` - Document de vision produit (~3500 lignes)
- `changes-log.md` - Historique des modifications

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
