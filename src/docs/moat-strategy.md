# Strategie de Moat - Angel Desk

## Diagnostic actuel

### Ce qui est reproductible (2-4 semaines)
- Prompts system des 40 agents
- Architecture orchestrateur multi-tiers
- Integration OpenRouter / multi-LLM
- UI de presentation des resultats
- AI Board (deliberation multi-modeles)

### Ce qui constitue un debut de moat
- Base de 1500+ deals structures (schema normalise)
- Expertise de prompts DD affines par iteration
- UX specifique BA (pas generique)

## Recommandations (par priorite)

### P0 - Data Flywheel (0-3 mois)

**Objectif** : Chaque analyse enrichit la DB, qui ameliore les futures analyses.

1. **Feedback loop utilisateur** :
   - Apres chaque deal, collecter le verdict reel du BA (a-t-il investi ? Pourquoi ?)
   - Apres 6-12 mois, collecter l'outcome (la startup a-t-elle tenu ses projections ?)
   - Utiliser ces outcomes pour recalibrer les modeles de scoring

2. **Auto-enrichissement DB** :
   - Chaque analyse Tier 1 devrait extraire et stocker les metriques du deal dans la DB
   - Secteur, stage, valorisation, metriques cles → normalises et indexes
   - Objectif : 10,000 deals structures d'ici 6 mois

3. **Metriques flywheel a suivre** :
   - Nombre de deals analyses / semaine
   - Taux d'enrichissement auto (% de deals qui nourrissent la DB)
   - Taux de feedback utilisateur
   - Precision des predictions (quand on a assez de outcomes)

### P1 - Partenariats Data Exclusifs (3-6 mois)

**Objectif** : Acceder a des donnees que les concurrents n'ont pas.

1. **Partenariat avec reseaux BA** :
   - France Angels, BADGE (Business Angels des Grandes Ecoles), Angelsquare
   - Proposer Angel Desk gratuit en echange de l'acces aux deals (anonymises)
   - 50-100 deals / mois via ces reseaux = flywheel massif

2. **Partenariat avec accelerateurs** :
   - Station F, The Family, Techstars Paris
   - Analyser les cohortes = data structuree gratuite
   - Benchmark interne par cohorte

3. **Integration plateformes** :
   - Gust, AngelList, Dealum, FundingBox
   - Connecteur API pour importer les deals automatiquement
   - Double benefice : acquisition + enrichissement DB

### P2 - Moat Produit (6-12 mois)

**Objectif** : Rendre le produit difficile a quitter.

1. **Portfolio tracking** :
   - Suivre les deals investis dans le temps
   - Alertes automatiques (levee suivante, news, red flags post-investissement)
   - Plus l'utilisateur utilise le produit, plus il a de raisons de rester

2. **Network effects (BA-to-BA)** :
   - Co-investissement : partager une analyse avec un autre BA
   - Syndication : un BA peut inviter d'autres BA a analyser un deal
   - Reviews : noter la qualite des deals post-investissement

3. **Historique personnel** :
   - Calibration personnelle du scoring (chaque BA a ses preferences)
   - Historique des decisions et de leur outcome
   - "Mon track record" : performance personnelle chiffree

### P3 - Moat Technique (12+ mois)

**Objectif** : Avantages techniques difficiles a reproduire.

1. **Fine-tuning des modeles** :
   - Fine-tuner un modele sur les 10,000+ analyses accumulees
   - Specialiser les outputs pour le format BA (pas VC)
   - Proprietaire = irreproduisible par un concurrent qui copie les prompts

2. **Score predictif proprietary** :
   - Modele de scoring entraine sur les outcomes reels
   - "Ce deal a 73% de chances de lever un Series A dans les 18 mois"
   - Necessite 2-3 ans de data et de feedback

3. **Benchmark database proprietaire** :
   - 50,000+ deals structures avec outcomes
   - Percentiles par secteur/stage/geo actualises en temps reel
   - Moat defensif car la data est cumulative et non reproductible

## KPIs de Moat a Suivre

| Metrique | Actuel | Cible 6 mois | Cible 12 mois |
|---|---|---|---|
| Deals dans la DB | ~1,500 | 10,000 | 50,000 |
| Deals avec outcomes | 0 | 200 | 2,000 |
| Taux de feedback BA | 0% | 30% | 60% |
| Partenariats data | 0 | 2 | 5 |
| Precision scoring (backtest) | N/A | Mesurable | >70% |
| Retention utilisateur (M3) | N/A | >50% | >70% |
| Utilisateurs actifs / mois | N/A | 100 | 500 |

## Conclusion

Le moat actuel est FAIBLE. La priorite absolue est le data flywheel (P0) car il est
le fondement de toutes les autres strategies. Sans data differenciante, le produit
reste un wrapper de prompts facilement reproductible.

L'objectif a 12 mois est d'avoir une DB suffisamment large et enrichie pour que
le cout de reproduction soit mesure en annees, pas en semaines.
