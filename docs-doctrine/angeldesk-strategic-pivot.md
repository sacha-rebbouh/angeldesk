# Angel Desk — Doctrine canonique

> Source de vérité versionnée et partagée (Claude + Codex + Sacha).
> **Pivot 2026-05-20** · Dernière mise à jour 2026-05-21.
> Appliquée dans `CLAUDE.md` projet et `docs-private/reference.yaml` §§ 3-11 + § 19 + § 20 + § 21 + § 22 + § 26 + § 27 + § 28 + § 29 + § 30 + § 31 + § 32 + § 33 + § 34.
> Cascade doctrinale TERMINÉE pour le périmètre repéré.
> Formulation prudente : *"terminée pour le périmètre repéré"*, PAS *"tout le fichier est parfait"*. Toute section non listée ci-dessus n'a PAS été auditée dans le cadre de la cascade 2026-05-20 et peut contenir des vestiges doctrinaux.

---

## 1. Phrase publique verrouillée

> *"Angel Desk est le copilote analytique des investisseurs privés qui doivent décider avec rigueur, sans infrastructure d'analyse lourde. Il transforme documents, déclarations des fondateurs et échanges en signaux sourcés, contradictions visibles, zones d'incertitude et questions prioritaires. La décision reste à l'investisseur."*

---

## 2. Doctrine à 2 strates

**Strate 1 — Étoile guide (oriente, non vérifiable mécaniquement)** :
> *"Angel Desk ne remplace pas le jugement de l'investisseur. Il augmente sa capacité à raisonner sous incertitude."*

**Strate 2 — Garde-fou opérationnel (vérifiable mécaniquement : sanitizers, linters, assertions d'interface)** :
> *"Angel Desk ANALYSE et GUIDE. Angel Desk ne DÉCIDE JAMAIS."*

La positive guide, la négative protège. Les deux coexistent.

**Définition stratégique interne** (jamais en surface publique) : *"Angel Desk est un environnement analytique fiable autour d'IA imparfaites."*

---

## 3. ICP

**Cœur stratégique — équipes d'investissement légères** (interne / GTM : *lean investment teams*) :
- BA très actifs / chefs de syndicat solos
- Angel clubs structurés
- Micro-fonds VC (y compris avec un analyste junior)
- Family offices directs
- Petits fonds (moins de 50 M€ d'actifs sous gestion)
- Équipes M&A légères

**Persona principale — Pauline** : 34 ans, responsable d'investissement micro-fonds ou chef de syndicat structuré. 100-200 deals/an. Mémos défendables sans armée d'analystes. Justifie devant associés, co-investisseurs, LPs. **Pauline porte le besoin** : elle pilote l'essai et défend l'achat auprès de l'associé responsable ou de l'équipe dirigeante. Ce n'est pas un junior analyst qui subit l'outil.

**Porte d'entrée acquisition — Marie (secondaire)** : BA expérimenté/expert via pack Starter. **PAS le centre stratégique.** Le BA novice 2h/semaine est exclu du centre de conception (risque de transformation oracle).

---

## 4. Scoring à 2 axes

| Axe | Valeurs | Source |
|---|---|---|
| **Orientation du signal** | favorable / contrasté / alerte / non exploitable | Synthèse des findings agents, justification sourcée |
| **Solidité des preuves** | solide / partielle / contradictoire / insuffisante | Formule TypeScript déterministe sur signaux evidence-first (provenance, fraîcheur, contradiction, couverture, fiabilité source) |

L'axe 2 s'appelle **"Solidité des preuves"**, **PAS "Confiance"** (anti-pattern auto-évaluation LLM).

Cas distincts :
- *Mauvais dossier bien documenté* = Alerte × Solides → signaux d'alerte fortement étayés
- *Bon dossier mal sourcé* = Favorables × Insuffisantes → tendance positive avec caveat majeur
- *Pas exploitable* = Non exploitable × Insuffisante → pas même de signal à interpréter

---

## 5. Interdits (tolérance zéro)

| Banni | Pourquoi |
|---|---|
| *"Investir"* / *"Ne pas investir"* | Prescriptif |
| *"GO / NO-GO"*, *"Recommandation : PASS"*, *"Rejeter"*, *"Passer ce deal"* | Directif |
| *"Dealbreaker"* | Trop définitif |
| *"La DD d'un fonds VC en 1h"* | Promesse oraculaire mesurable et falsifiable |
| *"Sublimation"* en surface publique | Magique, IA-mystique |
| *"Le meilleur partenaire d'aide à la décision parfaite"* | Oraculaire |
| *"L'IA poussée à l'extrême pour prendre la meilleure décision"* | *"Prendre"* = remplacer |
| *"Aucun analyste n'est expert en 22 secteurs"* | Sonne remplacement humain |
| *"Evidence Engine"* en surface publique | Jargon interne |
| *"Intelligence collective émergente"*, *"wisdom of crowds"*, *"vérité émergente"* | Registre magique |
| *"IA imparfaites"* en surface publique | Brutal — utiliser *"raisonnement sous incertitude"* |
| Persona Marie au centre stratégique | Devient porte d'entrée acquisition secondaire |
| Score global mono-axe trônant en haut de l'UI | Remplacé par modèle 2 axes |
| *"Confiance"* comme nom d'axe scoring | Recrée l'auto-évaluation LLM |

**Test règle d'or** : chaque phrase RESTITUÉE À L'UTILISATEUR ou utilisée en communication (UI, PDF, chat, com publique) doit pouvoir se terminer par *"…à vous de décider"* sans absurdité. Ne s'applique pas aux prompts internes pris isolément. Sinon : trop directive.

---

## 6. Hiérarchie de messaging publique

Ordre canonique strict :

1. **Copilote analytique** (catégorie)
2. **Raisonnement sous incertitude** (doctrine)
3. **Affirmations factuelles critiques sourcées, contradictions détectées, zones d'incertitude, fraîcheur et fiabilité documentaire** (effets)
4. **Architecture de support** (preuve technique sous le capot)

La page d'accueil ne mentionne pas *"44 agents"* ni *"Evidence Engine"*. Le pitch deck slide 1 ne mentionne pas le nombre.

---

## 7. Reframes de features

| Feature | Banni | Nouveau |
|---|---|---|
| **Board AI** | *"Sublimation — trouve la vérité"* | *"Modèles indépendants aux profils complémentaires confrontent leurs lectures. Divergences = signaux à examiner, pas des défauts."* |
| **Live Coaching** | *"IA temps réel — quoi répondre"* | *"Vérification des preuves en temps réel pendant l'appel — fait remonter contradictions présentation/déclarations, benchmarks dépassés, infos nouvelles."* |
| **22 experts sectoriels** | *"Aucun analyste expert en 22 secteurs"* | *"Chaque dossier obtient une lentille spécialisée lorsque le secteur est couvert, sinon un fallback général structuré (21 lentilles spécialisées + general-expert)."* |
| **44 agents** | Accroche principale | *"Architecture en 4 couches — 44 agents sous le capot."* |
| **Scoring** | Score global en hero UI | Score subordonné. Dimensions + solidité des preuves + sources + contradictions + questions en premier. |

---

## 8. Règle de séparation langage doctrine / public

| Surface | Langage autorisé |
|---|---|
| **Doctrine** (`CLAUDE.md`, `docs-doctrine/`, `docs-private/reference.yaml`, prompts agents) | Vocabulaire technique. Affirmation que la couche evidence-first existe / est livrée. |
| **Public** (page d'accueil, pricing, pitch deck, blog, com, emails sortants) | Aucun langage de disponibilité commerciale (*"prêt"*, *"produit lancé"*, *"service lancé"*, *"lancement public"*, *"live now"*, *"release-complete"*, *"disponible dès maintenant"*, *"available now"*, *"prêt à utiliser"*) tant que le gate de release actif n'est pas fermé. Le mot *"live"* brut n'est PAS banni en soi (*"Live Coaching"*, *"live sessions"*, statuts applicatifs runtime restent légitimes — c'est l'usage marketing public de disponibilité commerciale qui est banni). |

**Gate de release actif (état courant)** : B16 — export PDF authentifié prod + 1h monitoring sans erreur.

---

## 9. Glossaire interne → public

| Interne | Public |
|---|---|
| *lean investment teams* | équipes d'investissement légères / investisseurs privés sans infrastructure d'analyse lourde |
| *claims* | déclarations des fondateurs |
| *Board AI* | débat multi-modèle |
| *evidence-first* | preuves sourcées, traçabilité, fiabilité documentaire |
| *substrat cognitif partagé* | trace analytique partagée |
| *Evidence Engine* | affirmations factuelles critiques sourcées, dates disponibles ou absences de date explicitées, fiabilité documentaire, contradictions détectées |
| *IA imparfaites* | (jamais en public — utiliser *"raisonnement sous incertitude"*) |
| *sublimation* | (bannie — utiliser *"débat multi-modèle"*) |
| *wisdom of crowds* | (bannie — décrire l'effet observable) |
| *intelligence collective émergente* | (bannie — décrire l'effet observable) |

---

## 10. Cascade d'exécution

| Niveau | Cible | État |
|---|---|---|
| 1 | `CLAUDE.md` projet | ✅ |
| 1 | `docs-private/reference.yaml` § 3 Vision & Positionnement | ✅ |
| 1 | `docs-doctrine/angeldesk-strategic-pivot.md` (ce fichier) | ✅ |
| 2 | `docs-private/reference.yaml` § 4 Marché Cible | ✅ |
| 2 | `docs-private/reference.yaml` § 5 Problème | ✅ |
| 2 | `docs-private/reference.yaml` § 6 Produit — Vue d'ensemble | ✅ |
| 2 | `docs-private/reference.yaml` § 7 Agents détaillés | ✅ |
| 2 | `docs-private/reference.yaml` § 8 Scoring détaillé | ✅ |
| 2 | `docs-private/reference.yaml` § 9 Board AI | ✅ |
| 2 | `docs-private/reference.yaml` § 10 Live Coaching | ✅ |
| 2 | `docs-private/reference.yaml` § 11 Engines (Consensus + Reflexion) | ✅ |
| 2 | `docs-private/reference.yaml` § 19 (5 directives anti-hallucination détail) | ✅ |
| 2 | `docs-private/reference.yaml` § 20 Moat & Différenciation | ✅ |
| 2 | `docs-private/reference.yaml` § 26 Positionnement Produit (Règles publiques) | ✅ |
| 2 | `docs-private/reference.yaml` § 27 Personas (Pauline + Marie) | ✅ |
| 2 | `docs-private/reference.yaml` § 28 GTM (hypothèses + measurement_plan) | ✅ |
| 2 | `docs-private/reference.yaml` § 32 Legal & Compliance (matrice d'audit) | ✅ |
| 2 | `docs-private/reference.yaml` § 21 Pricing (matrice d'audit) | ✅ |
| 2 | `docs-private/reference.yaml` § 22 Add-ons (matrice d'audit) | ✅ |
| 2 | `docs-private/reference.yaml` § 29 Unit Economics (matrice d'audit) | ✅ |
| 2 | `docs-private/reference.yaml` § 30 Objections & Réponses (matrice talking points) | ✅ |
| 2 | `docs-private/reference.yaml` § 31 Traction & Métriques (matrice d'audit) | ✅ |
| 2 | `docs-private/reference.yaml` § 34 Roadmap (matrice d'hypothèses) | ✅ |
| 2 | `docs-private/reference.yaml` § 33 KPI (matrice gouvernance métriques) | ✅ |
| 2 | `docs-private/product-overview.md` | ⏳ |
| 2 | `docs-private/exec-summary.md` | ⏳ |
| 2 | `docs-private/pitch-deck.md` + `pitch-deck-slides.md` | ⏳ |
| 3 | Schema `synthesis-deal-scorer-schema.ts` (passage 2 axes) | ⏳ |
| 3 | Service calcul déterministe *Solidité des preuves* | ⏳ |
| 3 | `src/lib/ui-configs.ts` (deux familles de labels) | ⏳ |
| 3 | `src/lib/pdf/pdf-helpers.ts` (`recLabel()` + `proofLabel()`) | ⏳ |
| 3 | `ScoreBadge` composé + UI hierarchy refondue | ⏳ |
| 3 | Prompts agents (purge des vestiges oraculaires) | ⏳ |
| 4 | Page d'accueil (APRÈS fermeture du gate de release actif) | ⏳ |
| 4 | Pricing (APRÈS fermeture du gate de release actif) | ⏳ |
| 4 | Blog post launch (APRÈS fermeture du gate de release actif) | ⏳ |

---

## 11. Fichiers à conserver synchronisés

| Fichier | Rôle | Tracké git |
|---|---|---|
| `docs-doctrine/angeldesk-strategic-pivot.md` (ce fichier) | Source de vérité versionnée et partagée | ✅ |
| `CLAUDE.md` projet | Doctrine condensée + instructions actives pour session Claude | ✅ |
| `docs-private/reference.yaml` §§ 3-11 + § 19 + § 20 + § 21 + § 22 + § 26 + § 27 + § 28 + § 29 + § 30 + § 31 + § 32 + § 33 + § 34 | Doctrine en YAML structuré | ❌ (docs-private/ gitignored) |
| `~/.claude/projects/.../memory/angeldesk_strategic_pivot.md` | Pointeur Claude (rappel, pas autorité) | ❌ (hors repo) |
| `changes-log.md` | Trace des modifications doctrinales | ✅ |
