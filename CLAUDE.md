# Angel Desk - Project Context

## Description
**Angel Desk est le copilote analytique des investisseurs privés** qui doivent décider avec rigueur, sans infrastructure d'analyse lourde. Il transforme documents, déclarations des fondateurs et échanges en signaux sourcés, contradictions visibles, zones d'incertitude et questions prioritaires. La décision reste à l'investisseur.

Définition stratégique de référence : *"Angel Desk est un environnement analytique fiable autour d'IA imparfaites."* La valeur ne vient pas d'une IA brillante — elle vient de l'orchestration, la structure, la traçabilité, la mémoire, la gestion de l'incertitude, la hiérarchisation des signaux, la réduction des hallucinations critiques.

## Cible (ICP)

**Cœur stratégique — équipes d'investissement légères** (interne : *lean investment teams*) : les équipes (ou quasi-équipes) qui prennent des décisions sérieuses sans infrastructure analytique complète :
- BA experts / très actifs / chefs de syndicat
- Angel clubs structurés
- Micro-fonds VC (y compris avec un analyste junior)
- Family offices directs
- Petits fonds (moins de 50 M€ d'actifs sous gestion)
- Équipes M&A légères

**Persona principale — Pauline** : 34 ans, responsable d'investissement dans un micro-fonds ou chef de syndicat structuré. Voit 100-200 deals/an. Doit produire des mémos défendables sans armée d'analystes, et justifier ses raisonnements devant associés, co-investisseurs ou LPs. **Pauline porte le besoin** : elle pilote l'essai et défend l'achat auprès de l'associé responsable ou de l'équipe dirigeante. Ce n'est pas un junior analyst qui subit l'outil.

**Porte d'entrée acquisition — Marie (persona secondaire)** : BA expérimenté/expert, accessible via le pack Starter. **Ce n'est PAS le centre stratégique.** Marie reste documentée comme persona d'acquisition bottom-up, pas comme cible cœur. Le BA novice 2h/semaine n'est pas le centre de conception : il a besoin d'une vue simplifiée, sinon il risque de transformer le copilote en oracle (= retour au piège oraculaire fui).

## Proposition de valeur
*Meilleur processus, moins d'angles morts, plus de traçabilité, plus de vitesse* — pas *"meilleure décision garantie"*. Le produit est jugé sur la **robustesse du processus de décision**, pas sur *"avoir eu raison"* sur un deal donné.

## Principes de développement
1. **Valeur dès le premier dossier** — L'utilisateur voit de la valeur dès le premier dossier.
2. **Le contexte prime** — Pas d'analyse sans contexte (Funding DB cible 5K+ deals, benchmarks sectoriels datés, couche evidence-first interne).
3. **Discipline anti-faux-positifs** — Les signaux d'alerte doivent viser : source citée, fiabilité/provenance explicite, et cross-référence documentaire ou externe pertinente lorsque disponible. Discipline du **processus de détection**, pas garantie de résultat.
4. **Scoring déterministe** — Agrégation de score déterministe par formule TypeScript sur les sous-scores et signaux disponibles. Certains sous-scores peuvent provenir de sorties LLM ; la reproductibilité bout-en-bout reste à tester. Les variations entre versions doivent être explicables par de nouvelles preuves ou un changement de méthodologie tracé, pas par un jugement opaque (cf. § 8 target_scoring_model + § 20 deterministic_scoring).
5. **Evidence-first** — Les affirmations factuelles critiques sont rattachées à leur source, leur date disponible ou l'absence de date explicitée, leur fiabilité. Contradictions détectées exposées. Zones d'incertitude. Fraîcheur tracée.

---

## POSITIONNEMENT PRODUIT — DOCTRINE À 2 STRATES (s'applique à TOUT)

### Strate 1 — Doctrine positive (étoile guide)

> **Angel Desk ne remplace pas le jugement de l'investisseur. Il augmente sa capacité à raisonner sous incertitude.**

Cette doctrine inspire les prompts agents, la hiérarchie d'interface et le message public. Non vérifiable mécaniquement — elle **oriente** toute production. Tout ce qui est écrit dans le code, les prompts, le PDF, le chat, la com doit pouvoir être lu comme **augmentant** la capacité du décideur, jamais comme **le remplaçant**.

### Strate 2 — Garde-fou opérationnel (plancher de sécurité)

> **Angel Desk ANALYSE et GUIDE. Angel Desk ne DÉCIDE JAMAIS.**
>
> L'investisseur est le seul décideur. L'outil rapporte des signaux, des éléments sourcés (affirmations factuelles critiques rattachées à leur source, leur date disponible ou l'absence de date explicitée, leur fiabilité), des comparaisons et des contradictions détectées. Il ne dit jamais quoi faire.

Cette règle est **vérifiable mécaniquement** : sanitizers de labels, linters de prompts, assertions UI. Elle empêche les régressions vers le langage prescriptif.

**Les deux strates coexistent. La positive guide, la négative protège.**

### Ce qui est INTERDIT — tolérance zéro

| Interdit | Pourquoi | Remplacer par |
|----------|----------|---------------|
| "Investir" / "Ne pas investir" | Prescriptif, on décide à la place de l'investisseur | "Signaux favorables" / "Signaux d'alerte" |
| "GO / NO-GO" | Binaire et directif | Profil de signal (orientation × solidité — voir scoring 2 axes) |
| "Rejeter l'opportunité" | On ordonne à l'investisseur | "Les signaux d'alerte dominent sur X dimensions" |
| "Passer ce deal" | Prescriptif | "Vigilance requise" / "Zone d'alerte" |
| "Dealbreaker" | Trop définitif, on ferme la porte | "Risque critique" / "Condition critique" |
| "Toute négociation serait une perte de temps" | Agressif et directif | "Les points de négociation sont limités compte tenu des signaux d'alerte" |
| "Recommandation : PASS" | On recommande une action | "Signal : Signaux d'alerte dominants" |
| Tout impératif adressé à l'investisseur ("Rejetez", "N'investissez pas", "Fuyez") | On commande | Constater les faits, laisser l'investisseur conclure |
| **"La DD d'un fonds VC en 1h"** | Promesse oraculaire mesurable et trouvable fausse au premier deal sérieux | "L'environnement analytique des décisions d'investissement" |
| **"Sublimation"** en public | Trop magique, registre IA-mystique | "Débat multi-modèle / désaccords exposés" |
| **"Aucun analyste n'est expert en 22 secteurs"** | Sonne remplacement humain | "Chaque dossier obtient une lentille spécialisée lorsque le secteur est couvert, sinon un fallback général structuré (21 lentilles spécialisées + general-expert)" |
| **"Evidence Engine"** en public | Jargon interne | "Les affirmations factuelles critiques rattachées à leur source, leur date disponible ou l'absence de date explicitée, leur fiabilité ; contradictions détectées ; zones d'incertitude ; fraîcheur tracée" |
| **"Le meilleur partenaire d'aide à la décision parfaite"** | "Le meilleur" + "parfaite" = oraculaire | "Le copilote analytique des investisseurs privés" |

### Scoring à 2 axes — orientation × solidité des preuves

Cible produit : remplacer le scoring mono-axe (*Excellent / Solide / À approfondir / Points d'attention / Zone d'alerte*) par un modèle à 2 axes indépendants. Un dossier avec signaux d'alerte bien documentés ≠ un dossier avec signaux favorables mal sourcés. Les deux doivent être distinguables.

| Axe | Valeurs | Source de la valeur |
|---|---|---|
| **Orientation du signal** | favorable / contrasté / alerte / non exploitable | Synthèse des constats agents, avec justification sourcée |
| **Solidité des preuves** | solide / partielle / contradictoire / insuffisante | **Formule TypeScript déterministe** sur signaux evidence-first (provenance, fraîcheur, contradiction, couverture documentaire, fiabilité source) |

**Critique** : l'axe 2 s'appelle **"Solidité des preuves"** et **PAS "Confiance"**. *"Confiance"* recréerait l'anti-pattern fui — *"une machine qui dit 'je suis confiante'"*. La donnée doit être objective, pas une auto-évaluation LLM.

Cas distincts qui ne sont plus conflués :
- *Mauvais dossier bien documenté* = Signaux d'alerte × Preuves solides → les signaux d'alerte sont fortement étayés
- *Bon dossier mal sourcé* = Signaux favorables × Données insuffisantes → tendance positive avec caveat majeur
- *Pas exploitable* = Non exploitable × Insuffisante → pas même de signal à interpréter

### Règle d'or — test rapide

Chaque phrase RESTITUÉE À L'UTILISATEUR ou utilisée en communication (UI, PDF, chat, com publique) doit pouvoir se terminer par *"…à vous de décider"* sans que ce soit absurde. Le test ne s'applique pas aux prompts internes pris isolément (vocabulaire technique runtime non destiné à l'utilisateur). Si une phrase ne passe pas ce test, elle est trop directive.

### Hiérarchie de messaging (à appliquer sur TOUTE surface publique)

Ordre canonique strict :

1. **Copilote analytique** (la catégorie)
2. **Raisonnement sous incertitude** (la doctrine)
3. **Effets evidence-first** (affirmations factuelles critiques sourcées, contradictions détectées, zones d'incertitude, fraîcheur — décrits comme effets, jamais comme noms de système)
4. **44 agents en architecture de support** (preuve technique sous le capot, jamais en accroche)

L'inverse fait sonner machinerie. La section d'ouverture de la page d'accueil ne mentionne pas *"44 agents"* ni *"Evidence Engine"*. Le pitch deck slide 1 ne mentionne pas le nombre.

### Règle de séparation langage doctrine / public

| Surface | Langage autorisé |
|---|---|
| **Docs doctrine** (`CLAUDE.md`, `reference.yaml`, docs-private internes, prompts agents) | Peuvent affirmer que la couche evidence-first **existe** et **est livrée**. Vocabulaire technique OK. |
| **Docs publics** (page d'accueil, pricing, pitch deck, blog, communication, emails sortants) | AUCUN langage de type *"prêt"*, *"produit lancé"*, *"service lancé"*, *"lancement public"*, *"live now"*, *"release-complete"*, *"disponible dès maintenant"*, *"available now"*, *"prêt à utiliser"* tant que le gate de release actif n'est pas fermé (à date : B16, export PDF authentifié prod + 1h monitoring sans erreur). Le mot *"live"* brut n'est PAS banni en soi (*"Live Coaching"*, *"live sessions"*, statuts applicatifs runtime restent légitimes — c'est l'usage marketing public de disponibilité commerciale qui est banni). Le message reste sur l'**identité produit** et le **récit**, sans claim de disponibilité commerciale. |

### Reframes de features (à appliquer dans tous les docs et prompts)

| Feature | Ancien framing (banni) | Nouveau framing |
|---------|-----------------------|----------------|
| **Board AI** | *"Sublimation — délibération qui trouve la vérité"* | *"4 modèles indépendants qui exposent leurs désaccords, leurs angles morts, leurs hypothèses faibles. Le désaccord persistant est une feature, pas un bug."* |
| **Live Coaching** | *"IA temps réel — quoi répondre au fondateur"* | *"Vérification des preuves en temps réel pendant le call — fait remonter contradictions deck/fondateur, benchmarks dépassés, infos nouvelles, questions à poser maintenant."* |
| **22 experts sectoriels** | *"Aucun analyste n'est expert en 22 secteurs"* | *"Chaque dossier obtient une lentille spécialisée lorsque le secteur est couvert, sinon un fallback général structuré (21 lentilles spécialisées + general-expert)."* |
| **44 agents** | Accroche principale | *"Architecture en 4 couches — extraction, analyse horizontale (13 lentilles), expertise sectorielle (22 bibliothèques), synthèse et challenge (6 mécanismes). 44 agents / composants selon convention § 7 (3 + 13 + 22 + 6 ; thesis-reconciler conditionnel hors total), sous le capot."* |
| **Scoring** | Score global 0-100 en écran principal | Score subordonné. Dimensions + solidité des preuves + sources + contradictions + questions montrés en premier. |

### Où ça s'applique concrètement

1. **Prompts agents (system prompts)** — Les LLM ne doivent JAMAIS générer de texte prescriptif dans les champs `narrative`, `nextSteps`, `forNegotiation`, `rationale`, `verdict`. Les instructions doivent explicitement demander un ton analytique et conforme aux deux strates de la doctrine.
2. **UI (composants React)** — Tous les labels passent par `src/lib/ui-configs.ts` (RECOMMENDATION_CONFIG, VERDICT_CONFIG, ALERT_SIGNAL_LABELS, READINESS_LABELS). Ne jamais hardcoder de label prescriptif. **Le scoring 2 axes implique deux familles de labels** (orientation + solidité) — chantier dédié.
3. **PDF** — Les labels passent par `src/lib/pdf/pdf-helpers.ts` (`recLabel()` pour orientation, `proofLabel()` pour solidité — à créer). Même règle.
4. **Chat IA** — Le system prompt du chat maintient le ton analytique et applique les deux strates.
5. **Page d'accueil / Pricing / Blog / Com publique** — Identité produit + récit. **Pas de claim de disponibilité commerciale avant fermeture du gate de release actif** (à date : B16, export PDF authentifié prod + 1h monitoring sans erreur).

### État de l'implémentation

**Fait** :
- UI configs centrales (`ui-configs.ts`) — labels analytiques historiques en place ; refonte 2 axes à faire
- Composants d'affichage (verdict-panel, tier1/2/3-results, early-warnings, severity-badge/legend)
- PDF (tous les pdf-sections, pdf-helpers, pdf-components)
- Orchestrator summary (`summary.ts`)
- Landing + Pricing (sur ancienne doctrine — à reprendre selon le pivot)
- Glossaire (`glossary.ts`)
- Chat prompt
- Evidence Engine end-to-end (9 phases, migrations prod B13/B16, bug `base-agent.ts:1003` corrigé)

**Reste à faire (cascade en cours)** :
- Cascade documentaire : `reference.yaml`, `product-overview.md`, `exec-summary.md`, `pitch-deck.md`, slides — à aligner sur la nouvelle doctrine
- Chantier scoring 2 axes : schema synthesis-deal-scorer, ui-configs, ScoreBadge, pdf-helpers, prompts agents
- Surfaces publiques (landing, pricing, blog) — à reprendre APRÈS fermeture du gate de release actif
- Purge finale des vestiges oraculaires dans les prompts Tier 3 (synthesis-deal-scorer, memo-generator, devils-advocate)

## ANTI-HALLUCINATION — 5 DIRECTIVES (STANDARD CIBLE)

Standard cible : tout prompt agent d'analyse (Tier 0, 1, 2, 3, Chat, Board, Orchestration, certaines surfaces Live Coaching) devrait inclure les 5 directives anti-hallucination. La couverture actuelle est documentée et auditée dans `docs-private/reference.yaml` § 19 (coverage_audit, gaps_known) — la couverture n'est PAS universelle. Gaps connus : thesis-extractor, thesis-reconciler, rebuttal-judge, utterance-router, auto-dismiss, flux maintenance DB. Ajouter les directives à un nouvel agent reste recommandé, mais l'exigence absolue *"chaque agent sans exception"* n'est PAS le runtime actuel.

Quand un schéma JSON est requis, l'incertitude doit être portée dans les champs du schéma, sans casser le format attendu.

Ces directives DEMANDENT au LLM de changer son comportement (plus de prudence, plus de structuration, auto-évaluation explicite). Elles ne garantissent NI la vérité, NI la détection systématique des erreurs, NI l'application réelle par le LLM (cf. § 19 doctrinal_limits).

### 1. Confidence Threshold
> Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

### 2. Abstention Permission
> It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong. If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently. Uncertainty is valued here, not penalised.

### 3. Citation Demand
> For every factual claim in your response: 1. Cite a specific, verifiable source (name, publication, date) 2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true 3. If you are relying on general training data rather than a specific source, say so explicitly. Do not present unverified information as established fact.

### 4. Self-Audit
> After completing your response, perform a self-audit: 1. Identify the 3 claims in your response that you are LEAST confident about 2. For each one, explain what could be wrong and what the alternative might be 3. Rate your overall response confidence: HIGH / MEDIUM / LOW. Be ruthlessly honest. I will not penalise you for uncertainty.

### 5. Structured Uncertainty
> Structure your response in three clearly labelled sections: **CONFIDENT:** Claims where you have strong evidence and high certainty (>90%) **PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%) **SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%). Every claim must be placed in one of these three categories. Do not present speculative claims as confident ones.

### Implémentation (3 patterns d'injection — cf. § 19 injection_patterns)
- **Pattern 1 — BaseAgent helpers** (Tier 0/1/3 majoritairement, Chat) : directives 2-5 injectées via `buildFullSystemPrompt()` appelé depuis `llmComplete` / `llmCompleteJSON` / `llmCompleteJSONValidated` / `llmCompleteJSONWithFallback` / `llmStream` de `base-agent.ts`. Méthodes : `getAbstentionPermission()`, `getCitationDemand()`, `getSelfAuditDirective()`, `getStructuredUncertaintyDirective()`. Nuance : étendre BaseAgent N'EST PAS suffisant — c'est l'utilisation des helpers d'appel LLM qui déclenche l'injection.
- **Pattern 2 — helper partagé** : `src/agents/orchestration/prompts/anti-hallucination.ts` (utilisé notamment par board-orchestrator et fact-extractor).
- **Pattern 3 — inline per prompt** : directives écrites verbatim dans le prompt (system prompt OU fallback user prompt selon le chemin). Concerne agents standalone, lentilles sectorielles Tier 2 non-BaseAgent (incl. `base-sector-expert.ts`), Board members, Consensus debater/arbitrator, Reflexion critic/improver, Live Coaching engine / visual-processor / post-call-* / transcript-condenser.
- **Directive 1 (Confidence Threshold) N'EST PAS centralisée** dans BaseAgent — à auditer agent par agent. Gaps connus listés dans § 19 gaps_known.

---

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
- `docs-doctrine/angeldesk-strategic-pivot.md` — **Doctrine canonique versionnée et partagée (Claude + Codex + Sacha).** Source de vérité du pivot 2026-05-20 : phrase publique, doctrine à 2 strates, ICP, persona Pauline, scoring à 2 axes, glossaire interne→public, reframes de features, cascade documentaire. À lire en début de session. Tracké git (le dossier `docs-private/` est gitignored).
- `docs-private/reference.yaml` — Référence technique et produit centrale (forme YAML structurée). § 3 Vision & Positionnement aligné sur la doctrine pivotée ; autres sections en cours d'alignement.
- `dbagents.md` — Système de maintenance DB (CLEANER, SOURCER, COMPLETER, SUPERVISOR).
- `changes-log.md` — Historique des modifications.

---

## ARCHITECTURE ANALYTIQUE — 4 COUCHES

Le nombre "44 agents" est une preuve technique sous le capot, pas une accroche publique. En public, parler d'architecture en 4 couches : extraction, analyse horizontale, expertise sectorielle, synthèse et challenge.

| Couche | Nb | Rôle | Exécution |
|------|----|------|-----------|
| Couche 0 | 3 | Extraction, scoring initial, détection de signaux d'alerte | Selon le parcours |
| Couche 1 | 12 | Lentilles d'analyse horizontales | Parallèle |
| Couche 2 | 22 | Bibliothèques / experts sectoriels | Dynamique (1 expert activé selon secteur) |
| Couche 3 | 5 autonomes / 6 en analyse complète (`full_analysis`) | Synthèse, contradiction, scoring, memo, challenge | Séquentiel (après couches 1 & 2) |

> `technical-dd` a été split en `tech-stack-dd` + `tech-ops-dd` (optimisation coûts/timeouts Haiku). `exit-strategist` et `scenario-modeler` retirés du pipeline actif (doctrine anti-oraculaire — pas de projection multiple/IRR/exit valuation).

### Couche 0 — Extraction et pré-analyse (3 agents)
```
src/agents/base/
├── document-extractor.ts      Extraction structurée
├── red-flag-detector.ts       Détection précoce de signaux d'alerte
└── deal-scorer.ts             Scoring initial
```

### Couche 1 — Analyse horizontale (12 agents)
```
src/agents/tier1/
├── financial-auditor.ts      [P1]
├── deck-forensics.ts         [P1]
├── team-investigator.ts      [P1]
├── market-intelligence.ts    [P2]
├── competitive-intel.ts      [P2]
├── tech-stack-dd.ts          [P3] Stack + Scalabilité + Dette
├── tech-ops-dd.ts            [P3] Maturité + Équipe + Sécu + IP
├── legal-regulatory.ts       [P3]
├── gtm-analyst.ts            [P3]
├── customer-intel.ts         [P3]
├── cap-table-auditor.ts      [P3]
└── question-master.ts        [P3]
```

### Couche 2 — Experts sectoriels (22 agents)

Implémentés :
```
src/agents/tier2/
├── ai-expert.ts              ├── biotech-expert.ts
├── blockchain-expert.ts      ├── climate-expert.ts
├── consumer-expert.ts        ├── creator-expert.ts
├── cybersecurity-expert.ts   ├── deeptech-expert.ts
├── edtech-expert.ts          ├── fintech-expert.ts
├── foodtech-expert.ts        ├── gaming-expert.ts
├── general-expert.ts         ├── hardware-expert.ts
├── healthtech-expert.ts      ├── hrtech-expert.ts
├── legaltech-expert.ts       ├── marketplace-expert.ts
├── mobility-expert.ts        ├── proptech-expert.ts
├── saas-expert.ts            └── spacetech-expert.ts
```

Activation : 1 expert sectoriel activé dynamiquement selon le secteur détecté. Fallback : `general-expert.ts`.

Support : `base-sector-expert.ts`, `sector-standards.ts`, `benchmark-injector.ts`.

### Couche 3 — Synthèse et challenge (5 autonomes / 6 en analyse complète)
```
src/agents/tier3/
├── conditions-analyst.ts      [HIGH]
├── contradiction-detector.ts   [CRITIQUE]
├── synthesis-deal-scorer.ts    [CRITIQUE]
├── devils-advocate.ts          [HIGH]
├── memo-generator.ts           [HIGH]
└── thesis-reconciler.ts        [FULL_ANALYSIS only]
```

### Standards de qualité
- Affirmations factuelles critiques sourcées
- Signaux d'alerte : sévérité + preuve + impact + question
- Cross-reference documentaire ou externe pertinente lorsque disponible
- Calculs montrés, pas juste les résultats
- Sortie exploitable par un investisseur qui garde la décision finale

---

## EXPLOITATION DE LA FUNDING DATABASE

La DB de deals (5,000+ cible) est exploitée par les agents d'analyse.

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
| `deck-forensics` | Vérification déclarations vs DB |

### Cross-reference obligatoire
Chaque déclaration du deck (concurrence, valorisation, marché) doit être confrontée à la DB lorsque la donnée existe.

### Relations entre documents
```
dbagents.md           → Maintenance DB
```
