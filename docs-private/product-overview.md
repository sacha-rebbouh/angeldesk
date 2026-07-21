# Angel Desk — Product Overview

> Angel Desk est le copilote analytique des investisseurs privés qui doivent décider avec rigueur, sans infrastructure d'analyse lourde. Il transforme documents, déclarations des fondateurs et échanges en signaux sourcés, contradictions visibles, zones d'incertitude et questions prioritaires. La décision reste à l'investisseur.

Angel Desk ne remplace pas le jugement de l'investisseur. Il augmente sa capacité à raisonner sous incertitude. Le produit organise une trace analytique défendable autour d'un dossier et rend explicite ce qui est établi, contesté, incomplet ou à clarifier.

## Pour qui

Le cœur du produit est conçu pour les équipes d'investissement légères : responsables d'investissement de micro-fonds, chefs de syndicat structurés, angel clubs, family offices directs, petits fonds et équipes M&A légères.

**Pauline est la persona principale.** Responsable d'investissement dans un micro-fonds ou chef de syndicat structuré, elle traite 100 à 200 dossiers par an, prépare des mémos défendables et justifie ses raisonnements devant associés, co-investisseurs ou LPs. Elle pilote l'essai et porte le besoin auprès de l'équipe qui arbitre l'achat.

**Marie est une porte d'entrée secondaire.** Business Angel expérimenté, elle peut découvrir le produit dans un parcours Starter. Elle ne définit pas le centre stratégique. Le Business Angel novice qui consacre quelques heures par semaine à cette activité est exclu du centre de conception : une restitution trop simplifiée risquerait de transformer le copilote en oracle.

## Raisonner sous incertitude

Angel Desk part d'une contrainte simple : un dossier d'investissement contient des faits, des déclarations, des projections, des omissions et des documents de fraîcheur inégale. Une réponse utile doit conserver ces différences au lieu de les aplatir.

Le produit vise donc à rendre observables quatre effets :

- les affirmations factuelles critiques sont rattachées à une source, à une date connue ou à une absence de date explicitée, et à une fiabilité documentaire ;
- les contradictions entre documents, analyses et déclarations des fondateurs sont exposées ;
- les zones d'incertitude et les limites de couverture restent visibles ;
- les questions prioritaires relient chaque point à clarifier aux éléments qui le motivent.

Les garde-fous de prompt imposent notamment l'abstention lorsque la donnée manque, la citation des éléments critiques, l'auto-relecture et une expression structurée de l'incertitude. Ils réduisent certains risques ; ils ne garantissent pas qu'une sortie soit vraie.

## Restitution analytique

La synthèse repose sur deux axes verbaux indépendants :

| Axe | Valeurs | Lecture |
|---|---|---|
| **Orientation du signal** | favorable / contrasté / alerte / non exploitable | Synthèse justifiée de l'intensité des signaux et de la couverture par dimension |
| **Solidité des preuves** | solide / partielle / contradictoire / insuffisante | Dérivation TypeScript déterministe à partir de la provenance, de la fraîcheur, des contradictions, de la couverture et de la fiabilité des sources |

Cette séparation distingue une tendance favorable peu étayée d'une alerte solidement documentée. `non exploitable` décrit une limite de couverture explicite — par exemple un document critique absent, une extraction trop faible, des sources incompatibles ou l'échec d'une analyse essentielle — et non une conclusion par défaut.

La restitution met ensuite en avant les dimensions analysées, les sources, les contradictions, les incertitudes et les questions. L'orientation n'est jamais dérivée d'une appréciation numérique cachée.

## Capacités produit

### Construire le socle documentaire

Le dossier rassemble les documents transmis, les déclarations des fondateurs et les échanges. L'extraction structure les éléments financiers, d'équipe, de produit et de marché. Leur fiabilité est qualifiée selon six niveaux, de `AUDITED` à `UNVERIFIABLE`, et leur temporalité distingue notamment données actuelles et projections.

Lorsque le contexte existe, les analyses rapprochent les affirmations du dossier de documents connexes, de références externes et de dossiers comparables. Une source externe ne vaut pas automatiquement preuve : sa provenance, sa date, sa devise et la pertinence de la comparaison doivent rester explicites.

<!-- TODO à vérifier : resynchroniser avant toute diffusion les connecteurs réellement actifs et le volume courant de la base de dossiers comparables ; les anciens chiffres ne sont pas assez stables pour constituer un claim. -->

### Croiser des lentilles complémentaires

Les analyses transverses couvrent notamment les dimensions financière, équipe, marché, concurrence, technologie, opérations, juridique, stratégie commerciale, clients et cap table. Une lentille sectorielle spécialisée est activée lorsque le secteur est couvert ; un fallback général structuré prend le relais dans les autres cas.

La couche de synthèse rapproche les constats, détecte leurs contradictions, challenge les hypothèses fragiles et prépare un mémo structuré. L'analyse des conditions et de la dilution, les éléments de négociation et les questions fondateur sont présentés comme matériaux de raisonnement. L'investisseur reste responsable de leur interprétation et de leur usage.

### Confronter plusieurs lectures

Le débat multi-modèle met d'abord en regard des lectures indépendantes, puis confronte leurs hypothèses et leurs preuves. Les convergences ne sont pas assimilées à une vérité. Les divergences persistantes sont conservées comme signaux à examiner, avec les arguments qui les soutiennent.

<!-- TODO à vérifier : resynchroniser la liste des modèles et les règles de routage avec la configuration runtime avant de les citer dans une surface externe. -->

### Vérifier les preuves pendant l'appel

Pendant un échange avec un fondateur, le produit peut faire remonter une contradiction entre présentation et déclaration, un benchmark daté à recontextualiser, une information nouvelle ou une question prioritaire. L'investisseur conduit la conversation ; le système apporte le contexte du dossier au moment où il devient utile.

Un rapport post-call structure les éléments recueillis. Les informations nouvelles peuvent alimenter une nouvelle lecture ciblée du dossier selon le parcours suivi.

<!-- TODO à vérifier : mesurer la latence de bout en bout et confirmer les conditions exactes de relance post-call avant toute promesse chiffrée ou formulation d'automatisme. -->

### Maintenir une trace vivante

Le dossier évolue à mesure que de nouveaux documents, réponses ou échanges sont intégrés. Les contradictions peuvent apparaître ou se résoudre ; les questions ouvertes persistent ; les changements doivent pouvoir être reliés à une preuve nouvelle ou à une évolution méthodologique tracée.

Le chat contextuel permet d'explorer un point du dossier à partir des documents et analyses pertinents. Les sorties incluent un mémo, un rapport PDF structuré et des interfaces REST et webhooks pour intégrer la trace analytique aux workflows existants.

## Architecture de support

L'architecture en 4 couches intervient en dernier dans le récit produit :

1. **Extraction et qualification** — structurer les documents, leur provenance, leur fraîcheur et leur fiabilité.
2. **Analyses transverses** — examiner le dossier sous des lentilles complémentaires exécutées en parallèle selon le parcours.
3. **Expertise sectorielle** — activer une lentille spécialisée ou un fallback général structuré.
4. **Synthèse et challenge** — rapprocher constats, contradictions, conditions, questions et mémo.

Le socle technique associe Next.js et TypeScript, PostgreSQL avec Prisma, Clerk pour l'authentification, OpenRouter pour le routage des modèles, React Query pour l'état client et Vercel Blob pour le stockage. Cette architecture soutient la traçabilité et l'orchestration ; elle n'est pas la promesse principale.

---

_Angel Desk analyse et guide. La décision reste à l'investisseur._
