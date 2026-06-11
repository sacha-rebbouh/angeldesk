# AI BOARD - Specification v1.0

> **ARCHIVED** — superseded by `docs-doctrine/angeldesk-strategic-pivot.md` (doctrine canonique). Conservé pour historique.

> **"Le premier comite d'investissement IA multi-modeles."**
> 4 LLMs. 0 role assigne. Une deliberation. Un verdict.

---

# EXECUTIVE SUMMARY

## Le Concept

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AI BOARD - LE CONCEPT                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   PROBLEME                                                                       │
│   ━━━━━━━━                                                                       │
│                                                                                  │
│   Meme avec les Tiers 1-2-3, le BA peut avoir des doutes:                       │
│   • "L'IA est-elle biaisee ?"                                                   │
│   • "Est-ce que j'ai toutes les perspectives ?"                                 │
│   • "Le score est a 65... c'est GO ou NO-GO ?"                                  │
│                                                                                  │
│   SOLUTION                                                                       │
│   ━━━━━━━━                                                                       │
│                                                                                  │
│   Un "comite d'investissement" compose de 4 LLMs differents                     │
│   qui deliberent sur le meme dossier jusqu'a un verdict clair.                  │
│                                                                                  │
│   • Chaque IA analyse librement (AUCUN role pre-assigne)                        │
│   • Elles debattent, contre-argumentent, revisent leurs positions              │
│   • Le BA voit le debat en temps reel                                           │
│   • A la fin: consensus, majorite, ou desaccord documente                       │
│                                                                                  │
│   ANALOGIE                                                                       │
│   ━━━━━━━━                                                                       │
│                                                                                  │
│   Les 27 agents Tier 1-2-3  =  L'equipe d'analystes qui prepare le dossier     │
│   Le AI Board               =  Le comite d'investissement qui delibere          │
│                                                                                  │
│   Les analystes font le travail de recherche.                                   │
│   Le comite challenge, debat, et tranche.                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Positionnement dans l'Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE COMPLETE                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   TIER 1 : Screening (30 sec)                                                   │
│   └── GO/NO-GO rapide, extraction, premiers red flags                           │
│                                                                                  │
│            ↓                                                                     │
│                                                                                  │
│   TIER 2 : Analyse approfondie (2-3 min)                                        │
│   └── 27 agents specialises, scoring 5 dimensions, red flags complets           │
│                                                                                  │
│            ↓                                                                     │
│                                                                                  │
│   TIER 3 : Board structure (optionnel)                                          │
│   └── Roles fixes (Devil's Advocate, etc.), synthese                            │
│                                                                                  │
│            ↓                                                                     │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                                                                      │       │
│   │   AI BOARD : Deliberation multi-LLM (PREMIUM)                       │       │
│   │   └── 4 LLMs differents deliberent sur le dossier complet           │       │
│   │   └── Feature payante en supplement                                  │       │
│   │                                                                      │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# LES PARTICIPANTS

## Les 4 LLMs (Modeles TOP uniquement)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       LES MEMBRES DU BOARD (TOP TIER)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────────┬──────────────────────────────────────────────────┐       │
│   │                  │                                                   │       │
│   │   CLAUDE         │  Anthropic                                       │       │
│   │   OPUS 4.5       │  Le plus puissant d'Anthropic                    │       │
│   │                  │  Via OpenRouter                                  │       │
│   │                  │                                                   │       │
│   ├──────────────────┼──────────────────────────────────────────────────┤       │
│   │                  │                                                   │       │
│   │   GPT-4          │  OpenAI                                          │       │
│   │   TURBO          │  Le flagship d'OpenAI                            │       │
│   │                  │  Via OpenRouter                                  │       │
│   │                  │                                                   │       │
│   ├──────────────────┼──────────────────────────────────────────────────┤       │
│   │                  │                                                   │       │
│   │   GEMINI         │  Google                                          │       │
│   │   2.0 ULTRA      │  Le plus avance de Google                        │       │
│   │                  │  Via OpenRouter                                  │       │
│   │                  │                                                   │       │
│   ├──────────────────┼──────────────────────────────────────────────────┤       │
│   │                  │                                                   │       │
│   │   MISTRAL        │  Mistral AI (French)                             │       │
│   │   LARGE 2        │  Le meilleur de Mistral                          │       │
│   │                  │  Via OpenRouter                                  │       │
│   │                  │                                                   │       │
│   └──────────────────┴──────────────────────────────────────────────────┘       │
│                                                                                  │
│   IMPORTANT: Aucun role n'est assigne. Chaque IA analyse LIBREMENT.             │
│   Les differences emergent naturellement des biais intrinseques des modeles.    │
│                                                                                  │
│   POURQUOI TOP UNIQUEMENT: Jamais de modeles mid-tier. L'effet wow doit         │
│   etre garanti a chaque deliberation. Premium = premium.                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Pourquoi ces 4 modeles TOP ?

| Modele | Provider | Force naturelle | Cout approx |
|--------|----------|-----------------|-------------|
| Claude Opus 4.5 | Anthropic | Analyse nuancee, prudence, rigueur | ~$15/1M input |
| GPT-4 Turbo | OpenAI | Creativite, synthese, raisonnement | ~$10/1M input |
| Gemini 2.0 Ultra | Google | Data-driven, factuel, multimodal | ~$7/1M input |
| Mistral Large 2 | Mistral | Raisonnement logique, efficacite | ~$3/1M input |

**Note**: Les "forces naturelles" ne sont pas des roles assignes, mais des tendances observees.

**Cout total par board**: ~$12 (tous modeles combines, input + output)

---

# LE FLOW DE DELIBERATION

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FLOW DE DELIBERATION                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  ROUND 0 : INPUT COMMUN                                                  │   │
│   │  ━━━━━━━━━━━━━━━━━━━━━━                                                  │   │
│   │                                                                          │   │
│   │  Chaque IA recoit EXACTEMENT le meme package:                           │   │
│   │                                                                          │   │
│   │  📄 DOCUMENTS                                                            │   │
│   │     • Pitch deck (texte extrait)                                        │   │
│   │     • Tous les docs uploades                                            │   │
│   │                                                                          │   │
│   │  📊 DONNEES ENRICHIES                                                    │   │
│   │     • Donnees Crunchbase/Dealroom                                       │   │
│   │     • Benchmarks sectoriels                                             │   │
│   │     • Comparables trouves                                               │   │
│   │                                                                          │   │
│   │  🤖 OUTPUTS DES 27 AGENTS                                                │   │
│   │     • Screening initial (Tier 1)                                        │   │
│   │     • Scores des 5 dimensions (Tier 2)                                  │   │
│   │     • Red flags detectes                                                │   │
│   │     • Market analysis                                                   │   │
│   │     • Team assessment                                                   │   │
│   │     • Financial analysis                                                │   │
│   │     • Etc.                                                              │   │
│   │                                                                          │   │
│   │  🔗 SOURCES                                                              │   │
│   │     • Toutes les URLs consultees                                        │   │
│   │     • Toutes les donnees brutes utilisees                               │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│                                    ↓                                             │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  ROUND 1 : ANALYSE INDEPENDANTE                                          │   │
│   │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                          │   │
│   │                                                                          │   │
│   │  Les 4 IAs analysent en PARALLELE (aucune ne voit les autres)           │   │
│   │                                                                          │   │
│   │  Chacune produit:                                                       │   │
│   │  • Son verdict: GO / NO-GO / NEED MORE INFO                             │   │
│   │  • Ses 3-5 arguments principaux                                         │   │
│   │  • Ses points de vigilance                                              │   │
│   │  • Sa valorisation suggeree (si applicable)                             │   │
│   │                                                                          │   │
│   │  ┌───────────┬───────────┬───────────┬───────────┐                      │   │
│   │  │  CLAUDE   │   GPT-4   │  GEMINI   │  MISTRAL  │                      │   │
│   │  │    ⚡      │    ⚡      │    ⚡      │    ⚡      │                      │   │
│   │  │ Analyse   │ Analyse   │ Analyse   │ Analyse   │                      │   │
│   │  └───────────┴───────────┴───────────┴───────────┘                      │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│                                    ↓                                             │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  ROUND 2-N : DEBAT                                                       │   │
│   │  ━━━━━━━━━━━━━━━━━━━                                                     │   │
│   │                                                                          │   │
│   │  Chaque IA voit les analyses des 3 autres.                              │   │
│   │                                                                          │   │
│   │  Elle doit:                                                             │   │
│   │  • Maintenir OU reviser sa position (avec justification)                │   │
│   │  • Repondre aux arguments des autres                                    │   │
│   │  • Challenger les positions adverses                                    │   │
│   │                                                                          │   │
│   │  ┌───────────────────────────────────────────────────────────────────┐  │   │
│   │  │                                                                    │  │   │
│   │  │  CLAUDE: "Je maintiens GO. GPT-4 souleve le churn eleve mais     │  │   │
│   │  │           l'equipe a deja identifie le probleme et le fix est     │  │   │
│   │  │           en cours. Gemini a raison sur le timing marche."        │  │   │
│   │  │                                                                    │  │   │
│   │  │  GPT-4:  "Je revise de NO-GO a NEED MORE INFO. L'argument de     │  │   │
│   │  │           Claude sur le fix en cours est valide, mais je veux    │  │   │
│   │  │           voir les metriques post-fix avant de me prononcer."    │  │   │
│   │  │                                                                    │  │   │
│   │  │  GEMINI: "Je maintiens GO. Le marche est en croissance de 40%,   │  │   │
│   │  │           ce qui compense les risques souleves par Mistral."      │  │   │
│   │  │                                                                    │  │   │
│   │  │  MISTRAL: "Je maintiens NO-GO. Ni Claude ni Gemini n'ont        │  │   │
│   │  │            repondu a mon point sur la concentration client."     │  │   │
│   │  │                                                                    │  │   │
│   │  └───────────────────────────────────────────────────────────────────┘  │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│                                    ↓                                             │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  CONDITION D'ARRET                                                       │   │
│   │  ━━━━━━━━━━━━━━━━━━                                                      │   │
│   │                                                                          │   │
│   │  Le debat s'arrete quand:                                               │   │
│   │                                                                          │   │
│   │  ✓ Consensus atteint (4/4 alignes)                                      │   │
│   │  ✓ Majorite claire (3/4 alignes + 1 round sans changement)              │   │
│   │  ✓ Max 3 rounds atteint                                                 │   │
│   │  ✓ Stagnation (personne ne change de position depuis 1 round)           │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│                                    ↓                                             │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  VERDICT FINAL                                                           │   │
│   │  ━━━━━━━━━━━━━━                                                          │   │
│   │                                                                          │   │
│   │  • Vote de chaque IA avec justification finale                          │   │
│   │  • Points de CONSENSUS (haute confiance)                                │   │
│   │  • Points de FRICTION (a investiguer)                                   │   │
│   │  • Questions a poser au fondateur                                       │   │
│   │  • Niveau de consensus: UNANIME / MAJORITE / DIVISE                     │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# OUTPUT DU AI BOARD

## Structure de l'Output

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT DU AI BOARD                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   1. VERDICT GLOBAL                                                              │
│   ━━━━━━━━━━━━━━━━━                                                              │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                          │   │
│   │   VERDICT: GO (Majorite 3/4)                                            │   │
│   │                                                                          │   │
│   │   ┌─────────┬─────────┬─────────┬─────────┐                             │   │
│   │   │ CLAUDE  │  GPT-4  │ GEMINI  │ MISTRAL │                             │   │
│   │   │   GO    │   GO    │   GO    │  NO-GO  │                             │   │
│   │   └─────────┴─────────┴─────────┴─────────┘                             │   │
│   │                                                                          │   │
│   │   Niveau de consensus: MAJORITE CLAIRE                                  │   │
│   │   Confiance du Board: 75%                                               │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   2. POINTS DE CONSENSUS                                                         │
│   ━━━━━━━━━━━━━━━━━━━━━━                                                         │
│                                                                                  │
│   Les 4 IAs s'accordent sur:                                                    │
│                                                                                  │
│   ✅ Le marche est en forte croissance (+40% YoY)                               │
│   ✅ L'equipe technique est solide                                              │
│   ✅ Le produit a un bon PMF initial                                            │
│   ✅ La traction est coherente avec le stade                                    │
│                                                                                  │
│   → Ces points sont FIABLES, les 4 perspectives convergent.                     │
│                                                                                  │
│   3. POINTS DE FRICTION                                                          │
│   ━━━━━━━━━━━━━━━━━━━━                                                           │
│                                                                                  │
│   Desaccords non resolus:                                                       │
│                                                                                  │
│   ⚠️  Concentration client (1 client = 45% du CA)                               │
│       • MISTRAL: Red flag majeur, risque de dependance                          │
│       • CLAUDE/GPT-4/GEMINI: Acceptable a ce stade, a surveiller               │
│                                                                                  │
│   ⚠️  Valorisation (30x ARR)                                                    │
│       • GPT-4: Dans le marche pour ce secteur                                   │
│       • MISTRAL: 20% au-dessus du median                                        │
│                                                                                  │
│   → Ces points DOIVENT etre investigues avec le fondateur.                      │
│                                                                                  │
│   4. QUESTIONS A POSER AU FONDATEUR                                              │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                               │
│                                                                                  │
│   Generees a partir des points de friction:                                     │
│                                                                                  │
│   1. "Quel est votre plan pour diversifier la base client ?"                    │
│   2. "A quoi correspond la valorisation de 30x ARR vs vos comparables ?"        │
│   3. "Pouvez-vous partager les metriques post-fix du churn ?"                   │
│                                                                                  │
│   5. TRACE DU DEBAT                                                              │
│   ━━━━━━━━━━━━━━━━━                                                              │
│                                                                                  │
│   Timeline complete des echanges entre IAs (voir UI)                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# VALEUR POUR LE BA

## Pourquoi c'est puissant

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         VALEUR POUR LE BUSINESS ANGEL                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   1. EFFET "WOW"                                                                 │
│   ━━━━━━━━━━━━━━                                                                 │
│                                                                                  │
│   Le BA voit 4 "cerveaux" differents debattre en temps reel.                    │
│   C'est spectaculaire et engageant.                                             │
│   → "J'ai mon propre comite d'investissement IA"                                │
│                                                                                  │
│   2. CONFIANCE AUGMENTEE                                                         │
│   ━━━━━━━━━━━━━━━━━━━━━━                                                         │
│                                                                                  │
│   Quand 4 IAs differentes convergent sur un point, c'est solide.                │
│   Ce n'est plus "une IA qui dit ca", c'est un consensus multi-modeles.          │
│   → Reduit le biais de confirmation                                             │
│                                                                                  │
│   3. ZONES GRISES IDENTIFIEES                                                    │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━                                                      │
│                                                                                  │
│   Les desaccords entre IAs = les vraies questions a creuser.                    │
│   Le BA sait exactement ou concentrer son temps.                                │
│   → "Sur quoi dois-je faire ma propre DD ?"                                     │
│                                                                                  │
│   4. ARGUMENTS POUR NEGOCIER                                                     │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━                                                      │
│                                                                                  │
│   "Mon Board IA est divise sur la valo. Voici leurs arguments..."               │
│   Le BA a des munitions concretes pour la negociation.                          │
│   → Position de force face au fondateur                                         │
│                                                                                  │
│   5. DECISION ECLAIREE                                                           │
│   ━━━━━━━━━━━━━━━━━━━━                                                           │
│                                                                                  │
│   Plus de "je sais pas trop". Le BA a:                                          │
│   • Un verdict clair (GO/NO-GO)                                                 │
│   • Le niveau de consensus (unanime/majorite/divise)                            │
│   • Les points a investiguer                                                    │
│   • Les questions a poser                                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# CAS D'USAGE

## Quand declencher le AI Board ?

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         QUAND UTILISER LE AI BOARD                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   CAS PRINCIPAL: Deals en zone grise                                            │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                              │
│                                                                                  │
│   • Score Tier 2 entre 50-70 (ni clairement bon, ni clairement mauvais)         │
│   • Red flags presents MAIS signaux forts aussi                                 │
│   • Valorisation aggressive dans un marche porteur                              │
│   • Le BA hesite apres avoir lu l'analyse                                       │
│                                                                                  │
│   Le AI Board = le "tribunal d'appel" quand la decision n'est pas evidente.     │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   CAS SECONDAIRE: Validation d'idee de startup (futur)                          │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                            │
│                                                                                  │
│   • Un entrepreneur veut valider son idee                                       │
│   • Le Board debat de la viabilite, du marche, du timing                        │
│   • Output: points forts, faiblesses, questions a creuser                       │
│                                                                                  │
│   → Nouveau marche, nouveau use case, meme infra.                               │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   DECLENCHEMENT                                                                  │
│   ━━━━━━━━━━━━━                                                                  │
│                                                                                  │
│   • Manuel: Le BA clique sur "Convoquer le AI Board"                            │
│   • Auto-suggest: Si score Tier 2 entre 50-70, on suggere le Board              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# PRICING

## Modele final valide

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PRICING ANGEL DESK + AI BOARD                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                          │   │
│   │   FREE (0€)                                                              │   │
│   │   ━━━━━━━━━                                                              │   │
│   │                                                                          │   │
│   │   • Tier 1-2 complet (screening + analyse approfondie)                  │   │
│   │   • Pas de board                                                         │   │
│   │   • Teaser board: "Voici ce que le Board analyserait sur ce deal"       │   │
│   │                                                                          │   │
│   │   → Objectif: montrer la valeur, creer l'envie                          │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                          │   │
│   │   PRO (249€/mois)                                                        │   │
│   │   ━━━━━━━━━━━━━━━                                                        │   │
│   │                                                                          │   │
│   │   • Tier 1-2-3 complet                                                  │   │
│   │   • 5 boards/mois inclus (modeles TOP uniquement)                       │   │
│   │   • Boards supplementaires: 79€/board                                   │   │
│   │                                                                          │   │
│   │   Modeles TOP:                                                          │   │
│   │   - Claude Opus 4.5 (Anthropic)                                         │   │
│   │   - GPT-4 Turbo (OpenAI)                                                │   │
│   │   - Gemini 2.0 Ultra (Google)                                           │   │
│   │   - Mistral Large 2 (Mistral)                                           │   │
│   │                                                                          │   │
│   │   → Objectif: le vrai produit, experience complete                      │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   POURQUOI CE MODELE                                                             │
│   ━━━━━━━━━━━━━━━━━━                                                             │
│                                                                                  │
│   1. Deux offres, pas trois                                                      │
│      • Simple a comprendre                                                       │
│      • Free = gouter, Pro = le vrai produit                                     │
│      • Pas de "piege du milieu" qui dilue                                       │
│                                                                                  │
│   2. Le board est LE hook payant                                                 │
│      • Tu veux les 4 meilleurs cerveaux IA? Tu paies.                           │
│      • Jamais de modeles mid → jamais de deception                              │
│                                                                                  │
│   3. 249€/mois = prix premium justifie                                           │
│      • Un BA investit 25K€+ par deal                                            │
│      • 249€/mois = 2988€/an = une erreur evitee                                 │
│      • Positionne le produit comme serieux                                      │
│                                                                                  │
│   4. 79€/board extra = anti-cannibalisation                                      │
│      • 3 boards a 79€ = 237€ → autant prendre Pro (249€)                        │
│      • Le calcul pousse vers l'abo des 4 boards                                 │
│      • Empeche de rester Free + acheter a l'unite                               │
│                                                                                  │
│   5. 5 boards/mois = sweet spot                                                  │
│      • Un BA voit ~10-15 deals/mois                                             │
│      • Il utilise le board sur les 3-5 deals ambigus                            │
│      • Force la discipline: "ce deal merite-t-il un board?"                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Analyse financiere

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ANALYSE FINANCIERE                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   COUT DE REVIENT PAR BOARD (modeles TOP)                                        │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                         │
│                                                                                  │
│   • Claude Opus 4.5:     ~$4-5                                                  │
│   • GPT-4 Turbo:         ~$3-4                                                  │
│   • Gemini 2.0 Ultra:    ~$2-3                                                  │
│   • Mistral Large 2:     ~$1                                                    │
│   ───────────────────────────────────                                            │
│   Total par board:       ~$12                                                   │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   MARGE PRO (249€/mois)                                                          │
│   ━━━━━━━━━━━━━━━━━━━━━                                                          │
│                                                                                  │
│   Revenue:               249€ (~$270)                                           │
│                                                                                  │
│   Couts:                                                                         │
│   • 5 boards TOP:        ~$60                                                   │
│   • Tier 1-2-3 LLM:      ~$25-30                                                │
│   • Infra/autres:        ~$10                                                   │
│   Total couts:           ~$95-100                                               │
│                                                                                  │
│   Marge:                 ~$170/mois (63%)                                       │
│   Marge annuelle:        ~$2040/user                                            │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   MARGE BOARD SUPPLEMENTAIRE (79€)                                               │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                               │
│                                                                                  │
│   Prix:                  79€ (~$85)                                             │
│   Cout:                  ~$12                                                   │
│   Marge:                 ~$73 (86%)                                             │
│                                                                                  │
│   ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   COMPARAISON MARCHE                                                             │
│   ━━━━━━━━━━━━━━━━━━                                                             │
│                                                                                  │
│   • 1h avocat:           200-500€                                               │
│   • 1 jour consultant:   800-1500€                                              │
│   • Analyste junior/mois: 3-4K€                                                 │
│   • PitchBook/mois:      ~1700€                                                 │
│   • Angel Desk Pro:      249€                                                   │
│                                                                                  │
│   → Clairement value for money                                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# ARCHITECTURE TECHNIQUE

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE TECHNIQUE                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         AI BOARD ORCHESTRATOR                            │   │
│   │                                                                          │   │
│   │  Responsabilites:                                                        │   │
│   │  • Assembler le package d'input commun                                  │   │
│   │  • Lancer les 4 analyses en parallele                                   │   │
│   │  • Orchestrer les rounds de debat                                       │   │
│   │  • Detecter les conditions d'arret                                      │   │
│   │  • Compiler le verdict final                                            │   │
│   │  • Streamer les updates vers le frontend                                │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                          │                                                       │
│                          ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      BOARD MEMBER (x4)                                   │   │
│   │                                                                          │   │
│   │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│   │  │  model: "anthropic/claude-3.5-sonnet" | "openai/gpt-4o" |       │   │   │
│   │  │         "google/gemini-1.5-pro" | "mistralai/mistral-large"     │   │   │
│   │  │                                                                   │   │   │
│   │  │  Methodes:                                                        │   │   │
│   │  │  • analyze(input: BoardInput): InitialAnalysis                   │   │   │
│   │  │  • debate(analyses: Analysis[], round: number): DebateResponse   │   │   │
│   │  │  • vote(): FinalVote                                             │   │   │
│   │  └──────────────────────────────────────────────────────────────────┘   │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                          │                                                       │
│                          ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         OPENROUTER                                       │   │
│   │                                                                          │   │
│   │  Tous les modeles passent par OpenRouter pour:                          │   │
│   │  • API unifiee                                                          │   │
│   │  • Fallback automatique                                                 │   │
│   │  • Tracking des couts                                                   │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Types principaux

```typescript
// Types pour le AI Board

interface BoardInput {
  // Documents
  documents: {
    pitchDeck: string;
    additionalDocs: string[];
  };

  // Donnees enrichies
  enrichedData: {
    crunchbaseData: any;
    dealroomData: any;
    benchmarks: any;
    comparables: any[];
  };

  // Outputs des agents
  agentOutputs: {
    tier1: Tier1Results;
    tier2: Tier2Results;
    tier3?: Tier3Results;
  };

  // Sources
  sources: {
    urls: string[];
    rawData: any;
  };
}

interface BoardMember {
  id: string;
  model: string;  // e.g., "anthropic/claude-3.5-sonnet"
  name: string;   // e.g., "Claude"
}

interface InitialAnalysis {
  memberId: string;
  verdict: 'GO' | 'NO_GO' | 'NEED_MORE_INFO';
  arguments: string[];
  concerns: string[];
  suggestedValuation?: number;
  confidence: number;
}

interface DebateResponse {
  memberId: string;
  previousVerdict: string;
  newVerdict: string;
  positionChanged: boolean;
  justification: string;
  responsesToOthers: {
    targetMemberId: string;
    response: string;
  }[];
}

interface BoardVerdict {
  finalVerdict: 'GO' | 'NO_GO' | 'NEED_MORE_INFO';
  consensusLevel: 'UNANIMOUS' | 'MAJORITY' | 'DIVIDED';
  votes: {
    memberId: string;
    verdict: string;
    justification: string;
  }[];
  consensusPoints: string[];
  frictionPoints: {
    point: string;
    positions: { memberId: string; stance: string }[];
  }[];
  questionsForFounder: string[];
  debateTrace: DebateRound[];
  totalRounds: number;
  stoppingReason: string;
}
```

---

# UI/UX

## Decisions validees

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UI/UX - DECISIONS                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   1. PLACEMENT: Onglet dedie                                                     │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━                                                      │
│                                                                                  │
│   • Nouvel onglet "AI Board" a cote de Tier 1/2/3                               │
│   • Feature premium = merite sa propre visibilite                               │
│   • Onglet visible mais grise/locked si pas paye (upsell)                       │
│   • Progression naturelle: Tier 1 → Tier 2 → Tier 3 → AI Board                  │
│                                                                                  │
│   2. VUE DEBAT: Multi-mode (user choice)                                         │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                           │
│                                                                                  │
│   L'utilisateur peut switcher entre 4 vues:                                     │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  [Chat] [Colonnes] [Timeline] [Arena]                    <- Toggle     │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   A. CHAT BUBBLES (default)                                                     │
│      Messages successifs comme un chat de groupe                                │
│      Chaque IA a sa couleur                                                     │
│      Simple et familier                                                         │
│                                                                                  │
│   B. 4 COLONNES PARALLELES                                                      │
│      Une colonne par IA                                                         │
│      On voit les positions evoluer cote a cote                                  │
│      Plus analytique                                                            │
│                                                                                  │
│   C. TIMELINE HORIZONTALE                                                       │
│      Les rounds en horizontal, scroll pour voir l'evolution                     │
│      Vue chronologique                                                          │
│                                                                                  │
│   D. ARENA/RING                                                                 │
│      Vue centrale avec les 4 IAs autour                                         │
│      Les arguments "volent" entre elles                                         │
│      Plus spectaculaire / effet wow                                             │
│                                                                                  │
│   3. NIVEAU DE DETAIL: Full (tout voir)                                          │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                            │
│                                                                                  │
│   • Chaque argument, chaque reponse est affiche                                 │
│   • Pour ceux qui veulent tout comprendre                                       │
│   • Le debat complet fait partie de la valeur                                   │
│                                                                                  │
│   4. VERDICT: Vote board (style jury)                                            │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                              │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                          │   │
│   │   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │   │
│   │   │  CLAUDE   │  │   GPT-4   │  │  GEMINI   │  │  MISTRAL  │           │   │
│   │   │           │  │           │  │           │  │           │           │   │
│   │   │    GO     │  │    GO     │  │    GO     │  │  NO-GO    │           │   │
│   │   │    ✓      │  │    ✓      │  │    ✓      │  │    ✗      │           │   │
│   │   │           │  │           │  │           │  │           │           │   │
│   │   └───────────┘  └───────────┘  └───────────┘  └───────────┘           │   │
│   │                                                                          │   │
│   │   VERDICT: GO (Majorite 3/4)                                            │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   • 4 cartes avec verdict individuel                                            │
│   • Couleur: vert (GO), rouge (NO-GO), orange (NEED MORE INFO)                 │
│   • Verdict global en dessous avec niveau de consensus                         │
│                                                                                  │
│   5. SECTIONS DE L'ONGLET                                                        │
│   ━━━━━━━━━━━━━━━━━━━━━━━                                                         │
│                                                                                  │
│   L'onglet AI Board contient:                                                   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  1. HEADER                                                               │   │
│   │     • Bouton "Convoquer le AI Board" (si pas encore lance)              │   │
│   │     • Status (En cours / Termine)                                        │   │
│   │     • Cout de la deliberation                                            │   │
│   │                                                                          │   │
│   │  2. VOTE BOARD (verdict)                                                 │   │
│   │     • Les 4 cartes jury                                                  │   │
│   │     • Verdict global + consensus level                                   │   │
│   │                                                                          │   │
│   │  3. POINTS CLES                                                          │   │
│   │     • Consensus (ce qui est solide)                                      │   │
│   │     • Friction (ce qui divise)                                           │   │
│   │     • Questions pour le fondateur                                        │   │
│   │                                                                          │   │
│   │  4. DEBAT COMPLET                                                        │   │
│   │     • Toggle de vue (Chat/Colonnes/Timeline/Arena)                       │   │
│   │     • Le debat en temps reel ou replay                                   │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Wireframe - Vue Chat (default)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  AI BOARD                                                    [En cours... 2/3]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ VERDICT                                                                  │    │
│  │                                                                          │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                            │    │
│  │  │ CLAUDE │ │ GPT-4  │ │ GEMINI │ │MISTRAL │                            │    │
│  │  │   GO   │ │   GO   │ │   GO   │ │ NO-GO  │                            │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘                            │    │
│  │                                                                          │    │
│  │  MAJORITE (3/4) → GO                                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌──────────────────────────────────┬──────────────────────────────────────┐    │
│  │ ✅ CONSENSUS                     │ ⚠️ FRICTION                          │    │
│  │                                   │                                       │    │
│  │ • Marche en croissance (+40%)    │ • Concentration client (45%)         │    │
│  │ • Equipe technique solide        │ • Valorisation 30x ARR               │    │
│  │ • PMF valide                     │                                       │    │
│  └──────────────────────────────────┴──────────────────────────────────────┘    │
│                                                                                  │
│  DEBAT                                         [Chat] [Col] [Time] [Arena]      │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                          │    │
│  │  🔵 CLAUDE                                              Round 1          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Verdict: GO                                                        │  │    │
│  │  │                                                                    │  │    │
│  │  │ Arguments:                                                         │  │    │
│  │  │ 1. Le marche SaaS B2B est en forte croissance...                  │  │    │
│  │  │ 2. L'equipe a deja un track record...                             │  │    │
│  │  │                                                                    │  │    │
│  │  │ Concerns:                                                          │  │    │
│  │  │ - Concentration client a surveiller                                │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                          │    │
│  │  🟢 GPT-4                                               Round 1          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Verdict: GO                                                        │  │    │
│  │  │ ...                                                                │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                          │    │
│  │  🟣 GEMINI                                              Round 1          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Verdict: GO                                                        │  │    │
│  │  │ ...                                                                │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                          │    │
│  │  🔴 MISTRAL                                             Round 1          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Verdict: NO-GO                                                     │  │    │
│  │  │ ...                                                                │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                          │    │
│  │  ─────────────────────── ROUND 2 ───────────────────────                │    │
│  │                                                                          │    │
│  │  🔵 CLAUDE                                              Round 2          │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │ Je maintiens GO.                                                   │  │    │
│  │  │                                                                    │  │    │
│  │  │ @MISTRAL: Tu souleves la concentration client, mais a ce stade    │  │    │
│  │  │ c'est normal. Le plan de diversification existe...                │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  📋 QUESTIONS A POSER AU FONDATEUR                                              │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  1. Quel est votre plan pour diversifier la base client ?                       │
│  2. Justifiez la valorisation 30x ARR vs vos comparables                        │
│  3. Partagez les metriques post-fix du churn                                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# STATUS: IMPLEMENTED ✅

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION STATUS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Le AI Board a ete entierement implemente le 2026-01-19.                       │
│                                                                                  │
│   FICHIERS CREES:                                                               │
│   ━━━━━━━━━━━━━━                                                                │
│   Backend:                                                                       │
│   • src/agents/board/types.ts          - Types Board                            │
│   • src/agents/board/board-member.ts   - Classe BoardMember                     │
│   • src/agents/board/board-orchestrator.ts - Orchestrateur principal            │
│   • src/agents/board/index.ts          - Exports                                │
│   • src/services/board-credits/index.ts - Gestion credits                       │
│   • src/app/api/board/route.ts         - API endpoint (POST)                    │
│   • src/app/api/board/[sessionId]/route.ts - API session (GET)                  │
│                                                                                  │
│   Frontend:                                                                      │
│   • src/components/deals/board/ai-board-panel.tsx   - Panel principal           │
│   • src/components/deals/board/board-header.tsx     - Header + bouton           │
│   • src/components/deals/board/vote-board.tsx       - Votes jury                │
│   • src/components/deals/board/key-points-section.tsx - Consensus/Friction      │
│   • src/components/deals/board/debate-viewer.tsx    - Container multi-vue       │
│   • src/components/deals/board/views/chat-view.tsx  - Vue chat bubbles          │
│   • src/components/deals/board/views/columns-view.tsx - Vue 4 colonnes          │
│   • src/components/deals/board/views/timeline-view.tsx - Vue timeline           │
│   • src/components/deals/board/views/arena-view.tsx - Vue arena (Framer Motion) │
│   • src/components/deals/board/board-progress.tsx   - Progress temps reel       │
│   • src/components/deals/board/board-teaser.tsx     - Teaser FREE users         │
│                                                                                  │
│   FICHIERS MODIFIES:                                                            │
│   ━━━━━━━━━━━━━━━━━                                                             │
│   • prisma/schema.prisma - Tables AIBoardSession, AIBoardMember, AIBoardRound   │
│   • src/services/openrouter/client.ts - 4 modeles TOP ajoutes                   │
│   • src/app/(dashboard)/deals/[dealId]/page.tsx - Onglet AI Board               │
│                                                                                  │
│   FONCTIONNALITES:                                                              │
│   ━━━━━━━━━━━━━━━                                                               │
│   [x] 4 LLMs TOP (Claude Opus, GPT-4 Turbo, Gemini Ultra, Mistral Large)       │
│   [x] Analyses paralleles Round 1                                               │
│   [x] Rounds de debat avec stopping conditions                                  │
│   [x] SSE streaming temps reel                                                  │
│   [x] 4 vues de debat (Chat, Colonnes, Timeline, Arena)                        │
│   [x] Vote board style jury                                                     │
│   [x] Points de consensus et friction                                           │
│   [x] Questions pour le fondateur                                               │
│   [x] Teaser pour FREE users                                                    │
│   [x] Gestion des credits (5/mois PRO)                                          │
│   [x] Paywall et upsell                                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# ROADMAP (COMPLETED)

## Phases completees

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ROADMAP - COMPLETE                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   PHASE 1: Specification ✅                                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━                                                         │
│   [x] Document de spec initial (ce document)                                    │
│   [x] Definition UI/UX (onglet dedie, multi-vue, vote board)                   │
│   [x] Discussion modeles (valide)                                               │
│   [x] Validation utilisateur                                                    │
│                                                                                  │
│   PHASE 2: Implementation ✅                                                     │
│   ━━━━━━━━━━━━━━━━━━━━━━━                                                         │
│   [x] BoardOrchestrator                                                         │
│   [x] BoardMember (abstraction)                                                 │
│   [x] Integration OpenRouter multi-modeles                                      │
│   [x] API endpoint /api/board                                                   │
│   [x] Streaming des updates (SSE)                                               │
│                                                                                  │
│   PHASE 3: Frontend ✅                                                           │
│   ━━━━━━━━━━━━━━━━━                                                              │
│   [x] Composant AIBoardPanel                                                    │
│   [x] Vue debat temps reel (4 modes)                                            │
│   [x] Affichage verdict (VoteBoard)                                             │
│   [x] Integration dans page deal                                                │
│                                                                                  │
│   PHASE 4: Polish ✅                                                             │
│   ━━━━━━━━━━━━━━━━                                                               │
│   [x] Gestion erreurs/retry (circuit breaker)                                   │
│   [x] Metriques/analytics (cost tracking)                                       │
│   [x] Paywall/credits (5 boards/mois PRO)                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

*Document cree le 2026-01-19*
*Mis a jour le 2026-01-19 - Implementation complete*
*Version: 1.1*
