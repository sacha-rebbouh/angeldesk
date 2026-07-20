# Angel Desk — Executive Summary

> Angel Desk est le copilote analytique des investisseurs privés qui doivent décider avec rigueur, sans infrastructure d'analyse lourde. Il transforme documents, déclarations des fondateurs et échanges en signaux sourcés, contradictions visibles, zones d'incertitude et questions prioritaires. La décision reste à l'investisseur.

Angel Desk augmente la capacité à raisonner sous incertitude. Son identité produit repose sur un processus analytique traçable, pas sur une conclusion automatique : les éléments critiques sont sourcés, les contradictions restent visibles et les limites de couverture sont explicites.

## Problème

Les équipes d'investissement légères doivent traiter des dossiers nombreux et hétérogènes sans disposer d'une infrastructure analytique complète. Les documents arrivent à des dates différentes, les déclarations et projections se confondent, les contradictions traversent plusieurs sources et les questions importantes se perdent entre lecture initiale, appel fondateur et préparation du mémo.

Les bases de données apportent du contexte, mais n'organisent pas à elles seules le raisonnement propre au dossier. Une IA généraliste interrogée isolément peut suivre le cadrage fourni, négliger une incertitude ou produire une affirmation insuffisamment étayée. Le besoin central est donc un environnement qui structure la preuve, conserve les désaccords et aide l'équipe à défendre son raisonnement.

## Cible

Le cœur stratégique réunit les équipes d'investissement légères : micro-fonds, chefs de syndicat structurés, angel clubs, family offices directs, petits fonds et équipes M&A légères.

**Pauline**, responsable d'investissement dans un micro-fonds ou chef de syndicat structuré, est la persona principale. Elle traite 100 à 200 dossiers par an, prépare des mémos défendables et répond de son raisonnement devant associés, co-investisseurs ou LPs. Elle pilote l'essai et porte le besoin auprès de l'équipe qui arbitre l'achat.

**Marie**, Business Angel expérimenté, constitue une porte d'entrée secondaire via un parcours Starter. Elle n'est pas le centre de conception. Le Business Angel novice à usage très occasionnel en est explicitement exclu afin de ne pas transformer le copilote en oracle.

## Réponse produit

Angel Desk relie les documents, les déclarations des fondateurs et les échanges dans une même trace analytique. Les effets recherchés sont concrets :

- rattacher les affirmations factuelles critiques à leurs sources, leurs dates et leur fiabilité ;
- détecter les contradictions inter-documents et rendre visibles les désaccords entre analyses ;
- distinguer faits, projections, hypothèses et données manquantes ;
- hiérarchiser les questions à partir des preuves et incertitudes du dossier ;
- conserver l'évolution du raisonnement entre lecture initiale, réponses du fondateur et post-call.

La synthèse utilise deux axes verbaux indépendants : **orientation du signal** (`favorable`, `contrasté`, `alerte`, `non exploitable`) et **solidité des preuves** (`solide`, `partielle`, `contradictoire`, `insuffisante`). La solidité est dérivée de façon déterministe à partir de la provenance, de la fraîcheur, des contradictions, de la couverture et de la fiabilité documentaire. Les dimensions, sources, incertitudes et questions restent au premier plan.

## Expérience analytique

Le parcours commence par l'extraction et la qualification documentaire, puis combine analyses transverses et lentille sectorielle. La synthèse rapproche les constats, expose les contradictions, challenge les hypothèses fragiles et prépare un mémo structuré.

Des modèles indépendants aux profils complémentaires peuvent confronter leurs lectures dans un débat structuré. Une divergence persistante demeure un signal à examiner ; une convergence n'est jamais présentée comme une vérité.

Pendant l'appel fondateur, la vérification des preuves en temps réel peut faire remonter contradictions, benchmarks datés, informations nouvelles et questions prioritaires. Le rapport post-call structure ensuite les éléments recueillis et peut alimenter une nouvelle lecture ciblée du dossier.

Le chat contextuel, l'analyse des conditions, les éléments de négociation, le rapport PDF et les interfaces REST et webhooks prolongent la même trace. Ces capacités fournissent des matériaux analytiques ; elles ne se substituent ni au comité humain ni au jugement de l'investisseur.

## Architecture de support

L'architecture en 4 couches intervient après la catégorie, la doctrine et les effets : extraction et qualification ; analyses transverses ; expertise sectorielle avec fallback général structuré ; synthèse et challenge. Le socle associe Next.js et TypeScript, PostgreSQL avec Prisma, Clerk, OpenRouter, React Query et Vercel Blob.

## Marché et modèle économique

Le cadrage stratégique vise d'abord les équipes où la rigueur attendue dépasse la capacité analytique interne. Pauline porte le besoin cœur ; Marie représente une hypothèse d'acquisition secondaire. Les extensions vers des organisations déjà dotées d'une infrastructure lourde relèvent d'un horizon ultérieur.

<!-- TODO à vérifier : sourcer et dater avant usage externe les hypothèses historiques de TAM 2,5–4,5 Md€, SAM 565 M€, croissance 18–22 % et trajectoire à 13 M€ d'ARR en année trois. -->

<!-- TODO à vérifier : auditer les packs, prix, crédits, coûts runtime, marges et règles d'essai contre Stripe, la base et les parcours actifs avant de publier le modèle économique. -->

<!-- TODO à vérifier : confirmer le volume courant et la qualité de la base de dossiers comparables ; ne présenter aucun objectif futur comme traction acquise. -->

## Fondateur

Angel Desk est porté par **Sacha Rebbouh**. Son parcours relie produit IA, développement logiciel, finance et développement international : HEC Paris, TheSubtil.ai, Deel, Antiopea et Sweetwood Capital. Cette combinaison soutient une approche produit conçue pour les contraintes concrètes d'une équipe d'investissement légère.

<!-- TODO à vérifier : valider les intitulés, dates et éléments biographiques détaillés avant toute diffusion externe. -->

## Cap

Le récit produit doit être évalué sur la robustesse du processus : qualité de la traçabilité, visibilité des contradictions, discipline face aux données manquantes et utilité des questions prioritaires. Les prochains jalons portent sur la validation terrain avec Pauline, la qualité inter-couches, l'enrichissement documenté des comparables et la mesure des parcours temps réel.

---

_Angel Desk analyse et guide. La décision reste à l'investisseur._
