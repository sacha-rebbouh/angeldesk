# Angel Desk — Product Overview

Angel Desk est une plateforme d'intelligence d'investissement par IA. Elle transforme un pitch deck en une due diligence complète — quarante-quatre agents orchestrés en quatre tiers d'analyse, vingt-deux experts sectoriels, un comité d'investissement virtuel composé de quatre modèles d'IA en débat, et un coaching temps réel pendant les appels avec les fondateurs. L'analyse qu'un fonds VC ferait faire à un analyste senior pendant deux jours, en une heure, et pour une fraction du coût.

Ce n'est pas un outil qui traite de la data. C'est un partenaire qui réagit, rebondit, accompagne, et coache — de la première lecture du deck jusqu'à la négociation des termes.

---

## L'IA augmentée

Tout le monde peut utiliser l'IA. La différence entre Angel Desk et un investisseur qui envoie son deck à ChatGPT tient en un mot : **fiabilité**.

Un modèle de langage interrogé seul produit une réponse enthousiaste. Il dit oui. Il suit le framing du fondateur. Il invente des chiffres quand il n'en a pas. Il ne dit jamais qu'il ne sait pas — parce que personne ne lui a dit que se tromper coûte plus cher que se taire.

Angel Desk repose sur une discipline que nous appelons l'IA augmentée — une optimisation systématique des capacités de l'IA mise au service de l'investissement. Chaque agent est soumis à cinq directives anti-hallucination calibrées sur la recherche du coût asymétrique des erreurs. Chaque donnée extraite d'un deck est classifiée selon six niveaux de fiabilité — de l'information auditée par un tiers jusqu'à la projection invérifiable — et le modèle sait qu'il ne doit pas traiter un chiffre déclaré par le fondateur comme un fait établi. Chaque score est calculé par une formule déterministe, pas par un jugement du modèle — ce qui garantit la reproductibilité. Et chaque affirmation est sourcée, ou explicitement marquée comme non vérifiée.

Ce sont des centaines de réglages, maintenus dans plus de soixante fichiers, personnalisés par modèle et par agent. Aucun d'entre eux n'est révolutionnaire pris isolément. Mis bout à bout, ils sont la différence entre un résultat générique et une intelligence fiable.

---

## L'architecture en quatre tiers

L'analyse se déploie en couches successives. Chaque tier enrichit le suivant.

### Tier 0 — Extraction et classification

Avant toute analyse, chaque donnée du deck est extraite, structurée, et classifiée. Les métriques financières, les claims du fondateur, les données d'équipe, de produit, de marché — tout est identifié et étiqueté par niveau de fiabilité. Si le deck a été rédigé en septembre et prétend montrer des résultats annuels, le système détecte automatiquement que les quatre derniers mois sont des projections, pas des faits. Ce travail d'extraction constitue le socle factuel sur lequel tout le reste s'appuie.

### Tier 1 — Treize analyses parallèles

Treize agents spécialisés sont lancés simultanément, chacun avec un mandat précis :

**L'audit financier** déconstruit les métriques : revenus, unit economics, burn rate, multiples de valorisation, projections. Il compare chaque chiffre aux benchmarks de la base de données interne — plus de mille cinq cents deals avec des métriques réelles. Si le fondateur annonce un ARR de 500K€ avec une valorisation de 15M€, l'agent calcule le multiple implicite et le positionne contre les percentiles du marché.

**L'investigation équipe** explore le parcours des fondateurs : expériences précédentes, complémentarité, gaps dans l'équipe, conflits d'intérêt potentiels, exits antérieurs. Le profil LinkedIn du fondateur n'est pas pris pour argent comptant — il est croisé avec les données du Context Engine.

**La cartographie concurrentielle** identifie les concurrents que le fondateur mentionne — et surtout ceux qu'il omet. Si la base de données contient trois concurrents directs que le deck ne mentionne pas, c'est un red flag d'omission immédiatement remonté.

**L'analyse de marché** valide les claims de TAM/SAM/SOM, évalue le timing du marché, et croise avec les tendances de funding du secteur. L'agent ne se contente pas de répéter les chiffres du fondateur — il les confronte aux données disponibles.

Les neuf autres agents couvrent la due diligence technique (stack et maturité opérationnelle, séparés en deux agents pour l'efficacité), les risques juridiques et réglementaires, la stratégie de sortie et les comparables d'exit, la stratégie go-to-market, l'intelligence client, l'audit de cap table et de dilution, et la consolidation des questions à poser au fondateur.

### Tier 2 — L'expert sectoriel

Après les analyses horizontales du Tier 1, un expert sectoriel est mobilisé parmi vingt-deux spécialités : SaaS, FinTech, HealthTech, AI, Climate, Biotech, DeepTech, Consumer, Hardware, Gaming, Blockchain, EdTech, PropTech, Mobility, FoodTech, HRTech, LegalTech, Cybersecurity, SpaceTech, Creator Economy — et un expert généraliste pour les secteurs non couverts.

Chaque expert évalue le deal contre les benchmarks spécifiques de son industrie. Un expert SaaS regarde la Rule of 40, le NRR, le CAC payback, le magic number. Un expert FinTech examine les multiples fintech, le take rate, la conformité réglementaire. Un expert HealthTech évalue les timelines FDA/CE, les risques de clinical trials.

Aucun analyste humain n'est expert dans vingt-deux secteurs simultanément. C'est une capacité surhumaine en termes de breadth — et c'est précisément ce dont un investisseur généraliste a besoin.

### Tier 3 — Synthèse et challenge

La dernière couche croise tout ce qui précède :

**Le détecteur de contradictions** identifie les incohérences entre les conclusions des agents du Tier 1. Si l'audit financier estime l'ARR à 500K€ mais que l'analyse de marché cite 800K€ — un écart de 60% — la contradiction est détectée, classifiée par sévérité, et si elle est critique, résolue par le Consensus Engine via un débat structuré entre agents avec hiérarchie de sources.

**Le devil's advocate** challenge systématiquement la thèse haussière. Tout ce qui semble positif est stress-testé. Les hypothèses sont questionnées. Les incentives du fondateur sont examinées. Si le deal paraît trop beau, c'est précisément le moment où la vigilance doit augmenter.

**Le modélisateur de scénarios** construit trois trajectoires — base, bull, bear — avec des outcomes chiffrés : exit value, multiples, timeframes, analyse de sensibilité.

**L'analyseur de conditions** décortique le term sheet : valorisation, instrument financier, dilution, vesting, gouvernance, droits de protection. Chaque clause est comparée aux standards du marché et positionnée par rapport aux benchmarks de la base de données.

**Le générateur de mémo** produit un document d'investissement structuré — executive summary, company overview, investment highlights, key risks, financial summary, team assessment, market opportunity, competitive landscape, terms analysis, exit strategy, questions pour le fondateur. Un mémo de qualité institutionnelle — le type de livrable qu'un cabinet de conseil facturerait des dizaines de milliers d'euros.

---

## Le Board AI — La sublimation

Le Board AI est l'incarnation du concept fondateur d'Angel Desk : l'IA ne se dépasse que lorsqu'elle est contrainte.

Quatre modèles d'IA — **Claude** (Anthropic), **GPT-4o** (OpenAI), **Gemini** (Google), **Grok** (xAI) — sont mis face à face dans un débat structuré sur le deal. Le processus se déroule en trois phases.

**Phase 1 — Analyse indépendante.** Chaque modèle analyse le deal séparément, sans voir les positions des autres. Il forme un verdict et le défend avec des preuves.

**Phase 2 — Débat multi-rounds.** Les modèles voient les verdicts des autres et répondent. Ils peuvent changer de position s'ils sont convaincus par les preuves. Ils doivent défendre leurs divergences avec des données. Le débat continue sur plusieurs rounds jusqu'à convergence — ou jusqu'à ce que les désaccords soient clairement documentés.

**Phase 3 — Vote final.** Un vote basé sur les outcomes du débat produit une recommandation agrégée. Les positions minoritaires sont documentées — un désaccord persistant est souvent plus informatif qu'un consensus facile.

Ce n'est pas quatre avis juxtaposés. C'est une délibération. La pression du débat élimine la complaisance. Les hallucinations survivent rarement à quatre regards croisés. Le consensus qui en émerge est structurellement plus fiable qu'un avis unique. C'est la théorie des groupes appliquée à l'IA — ce que nous appelons la **sublimation** : pousser l'IA au-delà de ce qu'elle ne se serait poussée si elle avait été interrogée seule.

---

## Le Live Coaching

Angel Desk n'est pas un rapport que l'on consulte après coup. C'est un partenaire qui intervient en temps réel.

Pendant un appel avec un fondateur, l'investisseur reçoit des **coaching cards** en réaction directe à ce qui est dit :

- **Contradictions** — Le fondateur annonce un churn de 2% mensuel. L'audit financier avait estimé 5% à partir des données du deck. La carte apparaît en moins de huit secondes avec la comparaison et une question de suivi à poser.

- **Benchmarks** — Le fondateur affirme que son take rate de 15% est standard pour son marché. L'expert marketplace a identifié un benchmark médian à 8-10%. La carte le signale.

- **Questions critiques** — Le fondateur évoque un pivot récent. L'agent détecte que cette information n'apparaît nulle part dans le deck et génère trois questions de suivi prioritaires.

- **Nouvelles informations** — Le fondateur mentionne un contrat enterprise signé la semaine dernière. L'information est captée, classifiée, et signalée comme donnée significative non couverte par l'analyse initiale.

Le pipeline combine la transcription audio en temps réel, l'analyse visuelle des slides partagées pendant l'appel, et le contexte complet de la due diligence déjà réalisée. Le tout dans un budget de latence de huit secondes — un hard timeout qui garantit que les suggestions arrivent pendant que le sujet est encore à l'écran, pas trois minutes après.

Après l'appel, un **rapport post-call** synthétise tout : les points clés, les nouvelles informations, les contradictions détectées, les questions restantes, le delta de confiance par rapport à l'analyse initiale. Et les agents impactés par les nouvelles informations sont automatiquement relancés en arrière-plan.

---

## L'analyse vivante

La plupart des outils d'analyse produisent un rapport. Un livrable figé, un snapshot à l'instant T. Angel Desk produit un **organisme qui évolue avec le deal**.

**V1** — Le deck est uploadé. Les quarante-quatre agents produisent la due diligence initiale. Les red flags sont identifiés. Les questions sont générées. Le score multi-dimensionnel est calculé.

**V2** — Le fondateur répond aux questions. Ses réponses déclenchent une re-analyse. De nouvelles contradictions apparaissent entre ce que le deck affirmait et ce que le fondateur précise. Des red flags se résolvent — d'autres émergent. Les scores sont recalculés. Les questions non répondues persistent avec un score boosté, signalant leur importance croissante.

**V3** — Le coaching en direct capte des informations que ni le deck ni les réponses écrites ne contenaient. Le rapport post-call les intègre. Les agents impactés sont relancés avec les nouvelles données. L'analyse reflète désormais tout ce que l'investisseur sait du deal — pas seulement ce que le fondateur a choisi de mettre dans ses slides.

Ce paradigme crée un switching cost naturel. Après cinquante deals analysés avec leur historique complet — scores, red flags résolus et non résolus, questions persistantes, notes de coaching, rapports post-call — cette intelligence ne se transfère pas vers un autre outil. Elle est enracinée dans Angel Desk.

---

## Le scoring multi-dimensionnel

Le score d'un deal n'est pas un jugement. C'est une mesure, calculée par une formule déterministe.

Cinq dimensions sont évaluées : **Team** (25%), **Market** (20%), **Product** (20%), **Financials** (20%), **Timing** (15%). Chaque agent retourne un breakdown avec des critères pondérés, des scores, et des justifications. Le score global est la somme pondérée des sous-scores, calculée par une fonction TypeScript — pas par un modèle de langage.

Cette approche garantit la reproductibilité. Le même deal analysé deux fois produit le même score, ce qui n'est jamais le cas avec un scoring par jugement LLM. Et chaque score est accompagné d'un profil de signal — pas d'un verdict. Angel Desk ne dit jamais "investir" ou "ne pas investir". Il rapporte des signaux : signaux très favorables, signaux favorables, signaux contrastés, vigilance requise, signaux d'alerte dominants. L'investisseur décide.

---

## La stratégie de négociation

L'analyse ne s'arrête pas au diagnostic. Angel Desk génère une stratégie de négociation personnalisée à partir des résultats de l'audit financier, de l'audit de cap table, et du scoring global.

La stratégie inclut une évaluation du rapport de force (fort, modéré, faible — avec les raisons), cinq à dix points de négociation priorisés (valorisation, termes, gouvernance, droits, protection), chacun avec la situation actuelle, le benchmark de marché, l'argument basé sur les red flags identifiés, la demande, la position de repli, et l'impact estimé. Elle inclut aussi les compromis stratégiques — ce qu'il est rationnel de céder pour obtenir quelque chose de plus important — et une projection du score du deal si tous les points de négociation étaient obtenus.

---

## Le chat IA contextuel

Le chat permet à l'investisseur de poser n'importe quelle question sur son deal et d'obtenir une réponse sourcée, tirée de l'analyse complète.

Le système classifie automatiquement l'intention — clarification, comparaison, simulation, deep dive, suivi, négociation — et récupère le contexte pertinent : faits extraits, résumés d'agents, red flags, benchmarks. Chaque réponse cite ses sources (fait extrait, agent, red flag, document, benchmark, calcul). Et le niveau de détail s'adapte au profil de l'investisseur — débutant, intermédiaire, ou expert.

Le chat est inclus sans limite dans tous les packs. C'est un coût négligeable pour Angel Desk et un facteur de rétention majeur — l'investisseur revient poser des questions au fur et à mesure que sa réflexion sur le deal mûrit.

---

## Le Context Engine

Chaque analyse est enrichie par des données externes issues de plus de quarante connecteurs : bases de funding (Crunchbase, Dealroom, Maddyness, TechCrunch), données fondateur (LinkedIn via API), données entreprise (Pappers, Société.com), signaux de traction (Product Hunt, App Stores, GitHub), signaux de recrutement (Welcome to the Jungle, Indeed), news (RSS TechCrunch, FrenchWeb, Sifted), listes de validation (Next40, FT120, BPI, Station F, Y Combinator), et la base interne de plus de mille cinq cents deals comparables.

Ces données sont injectées dans le system prompt de chaque agent sous forme d'un contexte structuré. Quand l'agent financier analyse la valorisation, il voit les multiples médians du secteur. Quand l'agent concurrentiel cartographie le marché, il voit les concurrents identifiés dans la base. Quand l'agent équipe investigue le fondateur, il voit son profil LinkedIn enrichi et son historique de levées.

---

## L'export PDF

Angel Desk génère un rapport PDF professionnel de plus de vingt sections : page de couverture, résumé analytique, alertes précoces, décomposition des scores, findings de chaque agent du Tier 1, findings de l'expert sectoriel, synthèse complète du Tier 3 (contradictions, scoring, devil's advocate, scénarios, mémo), stratégie de négociation, questions consolidées, table des red flags.

Le type de livrable qu'un cabinet de conseil facturerait des dizaines de milliers d'euros — avec une différence : chaque affirmation est sourcée, chaque score a un breakdown, et chaque red flag a une preuve, une sévérité, un impact, et une question à poser au fondateur.

---

## L'API

Angel Desk expose une API REST v1 avec des endpoints pour lister les deals, récupérer les analyses, accéder aux red flags, gérer les clés API, et configurer des webhooks sortants. Les événements couverts incluent la complétion d'une analyse, la détection d'un red flag, la fin d'un Board AI, et la fin d'une session de coaching.

L'API permet aux fonds et aux équipes M&A d'intégrer Angel Desk dans leurs workflows existants — CRM, outils de reporting, data rooms, pipelines de décision.

---

## Ce qu'Angel Desk remplace

Angel Desk ne remplace pas un outil. Il remplace — ou complète — des rôles entiers :

**L'analyste** — mais Angel Desk ne se contente pas de recevoir la data et de la traiter. Il réagit, il rebondit, il accompagne. Il mène une discussion, crée un lien avec le deal, ouvre différentes zones d'intervention.

**Le comité d'investissement** — le Board AI met quatre intelligences en débat pour challenger la thèse, détecter les angles morts, et produire un consensus structuré.

**Le coach** — le Live Coaching intervient en temps réel pendant les appels avec les fondateurs, avec le contexte complet de la due diligence déjà réalisée.

**Le négociateur** — la stratégie de négociation est chiffrée, sourcée, et personnalisée à partir des faiblesses identifiées par l'analyse.

La prise de décision d'investissement est multi-dimensionnelle. C'est la grande force d'Angel Desk — et c'est ce qui en fait un partenaire, pas un outil.

---

_Angel Desk analyse et guide. L'investisseur décide._
