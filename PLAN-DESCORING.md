# PLAN — Dé-scorisation Angel Desk (« on analyse, on ne score pas »)

> Statut : PLAN À VALIDER (pas une ligne de code écrite). Chantier de refonte transverse (~77 fichiers).
> Construit avec : diagnostic racine Codex (run prod mort), sounding board Codex indépendant, revue adverse Codex de cette architecture. Chaque phase = une unité de gate Codex (`codex-gate-drive.sh`).

## Context — pourquoi ce chantier

Décision produit de Sacha (2026-06-12) : **Angel Desk ne restitue plus jamais de note de deal.** Pas de 0-100, pas de grade A-F, pas de percentile de score. Même geste doctrinal que le retrait des agents exit-strategist / scenario-modeler : *« je ne viens pas scorer un deal, je viens l'analyser »*. Le déclencheur opérationnel : un run prod (`cmq9lg9un…`) est mort en boucle sur `synthesis-deal-scorer` (timeout = plafond Vercel + retries + prompt 137k), zombie, remboursé.

**Le fait porteur** (`synthesis-deal-scorer.ts:1226`) : aujourd'hui l'orientation EST dérivée du score (`if (score>=85) return "very_favorable"`). Retirer le nombre de l'UI ne suffit pas — l'orientation resterait un score caché. La vraie correction change la *dérivation*.

### Trois concerns à NE PAS confondre (clé de tout le plan, recadrage Codex)
1. **Restitution** — ce qui est rendu (UI, PDF, chat, exports). 
2. **Contrat interne** — ce que les agents produisent et se passent (`previousResults`, read-model, APIs). 
3. **Compatibilité durable** — runs stepwise en vol + analyses historiques en DB.

Les traiter comme une seule bascule = le risque #1. → ordre **additif** : on construit le scoreless en parallèle du scoreful, on prouve, puis on retire.

### Décisions verrouillées
- **Option B** : plus aucune note de deal restituée. Numérique toléré UNIQUEMENT en mécanique interne non restituée (tri, budgets, qualité d'extraction, benchmarks de métriques OBSERVABLES — ARR/valorisation).
- **Taxonomie 4 valeurs** (doctrine pivot) : `favorable / contrasté / alerte / non exploitable`.
- **Tout-en-un** : une seule livraison du pipeline scoreless. Pas de patch intermédiaire.
- **Béton armé + Codex-gated** à chaque phase.

### Deux gros risques de conception (revue adverse Codex)
- **Ne pas remplacer un faux score par une heuristique négative.** Absence de red flags ≠ deal favorable. Le nouveau synthétiseur doit modéliser l'axe POSITIF explicitement : signaux favorables dominants, couverture par dimension, solidité des preuves, raisons critiques. Sinon on a juste un compteur d'alertes.
- **Le score contamine les contextes LLM**, pas que l'UI : `summary.ts:91`, `memo-generator.ts:655`, `deal-chat-agent.ts:427`, `context-compressor.ts:166` (Board), `score-extraction.ts:71`. Sans scrubber des projections `previousResults`, memo/chat/board réinjectent `/100` après une UI propre.

---

## Architecture cible

**Contrat de sortie de synthèse** = `AnalysisSignalProfile` (scoreless) :
- `orientation` : `favorable | contrasté | alerte | non exploitable` (4 valeurs doctrine)
- `evidenceSolidity` : `solide | partielle | contradictoire | insuffisante` (service `evidence-solidity`, déterministe, jamais dérivé d'un score)
- `dominantSignals[]` : signaux FAVORABLES et défavorables dominants, sourcés (modèle positif explicite)
- `dimensionCoverage[]` : par dimension — couvert / partiel / non couvert (remplace les sous-scores)
- `criticalRisks[]` : déjà natif (`CriticalRiskRef[]`)
- AUCUN champ numérique de note (overallScore, score.value, grade, dimensionScores[].score).

**Dérivation scoreless** — réutiliser le pattern EXISTANT `deriveSignalContributionFromIntensity` (contradiction-detector / conditions-analyst / devils-advocate l'utilisent déjà) : orientation depuis `signalIntensity` (comptes de red flags par sévérité, `derive-alert-signal.ts`) + couverture + evidence-solidity. **Retirer les tiebreaks résiduels `score>=80`** de ces dérivations (sinon score caché persistant).

**`non exploitable`** = décision de COUVERTURE explicite, jamais un fallback flou : cap table manquante, extraction faible, sources contradictoires, agents critiques échoués → `non exploitable`, PAS `contrasté` par défaut.

---

## Phases (ordre additif Codex — chacune = gate Codex, livrées ensemble)

### P0 — Doctrine + allowlist/banned-list
- `docs-doctrine/angeldesk-strategic-pivot.md` + `CLAUDE.md` : « score subordonné » → « aucune note de deal restituée, jamais ». Définir noir sur blanc le numérique interne autorisé.
- Banned-list PRÉCISE (pas « tout /100 ») : `overallScore`, `score global`, `grade A-F`, `Deal Score`, `x/100` proche de score/verdict/recommendation. Allowlist : ARR, croissance, valorisation, percentile de métrique OBSERVABLE, confiance de thèse.

### P1 — Fondation de compatibilité (le scaffolding porteur)
- Type `AnalysisSignalProfile` + fonction canonique unique `toDoctrineOrientation()` (mapper 5→4 au BOUNDARY ; l'enum interne 5 valeurs reste pour l'instant).
- **Bi-reader** old/new : tous les consumers savent lire l'ancienne forme (score) ET la nouvelle (profil) pendant la transition.
- **Scrubber de contexte LLM** : retirer les scores des projections `previousResults` injectées dans summary/memo/chat/board.
- Tests : old snapshot + new code (durabilité), mapper 5→4.

### P2 — Synthèse scoreless (le cœur)
- Réécrire la dérivation de `synthesis-deal-scorer` (clé durable INCHANGÉE) : orientation depuis signalIntensity+couverture+solidité, **modèle positif explicite**, plus de score/grade/dimensionScores numériques produits.
- Producteurs Tier1/Tier2 INCHANGÉS à ce stade (émettent encore leurs scores).
- **Budgets deadline-aware** (fix racine, pas juste un timeout) : `maxRetries 0-1`, désactiver le fallback implicite long, borner récursivement le contexte (plus de prompt 137k → projection synthèse bornée), retirer l'exception `140_000` (`base-agent.ts:1348`), deadline budget réel par step < 300s.
- **Test invariant « poisoned score »** : injecter des scores producteurs absurdes → orientation INCHANGÉE (preuve que la synthèse est vraiment score-indépendante).

### P3 — Consumers → profil scoreless
- UI : `analysis-v2` (decision-strip, orientation×solidité) devient la SEULE surface ; retirer ScoreBadge/ScoreRing/score-display/verdict-panel score-based.
- PDF : retirer `/100`/grades/ScoreCircle (cover, score-breakdown, tier1-agents, tier3-synthesis) → profil verbal.
- Chat : retirer l'injection « Score global: X/100 » (`deal-chat-agent.ts:427`).
- read-model readers, `analysis-delta` (scoreDelta → orientationChange + redFlagDelta), compare API.

### P4 — Retirer les scores des PRODUCTEURS (destructif, en dernier)
- Schémas + prompts Tier1 (12) / Tier2 (sectorScore) / Tier3 : retirer `score.value`/grade/dimensionScores numériques. Le restitué Tier1 devient `signalIntensity` (existe déjà).

### P5 — Migration DB physique (après bascule des readers)
- Cacher d'abord `AnalysisSignalProfile`, basculer les readers, PUIS DROP colonnes scores (`AnalysisSignalSummary.*Score`, reliques `Deal.globalScore/...`). Migration prod À LA MAIN (cf. CLAUDE.md).
- Retirer `percentile-calculator` (score-based). Garder les benchmarks de métriques observables (Benchmark/SectorBenchmark/benchmark-injector).

### P6 — Garde-fous + vérif
- Source-guards (pattern `a7b3-tier1-consumers.guard.test.ts`) : bannir les PATTERNS de note de deal (pas tous les nombres).
- Full stepwise replay avec snapshots old/new. Re-test prod Deep Dive complet.

---

## Durabilité (tranche Codex)
- **Garder la clé durable `"synthesis-deal-scorer"`** (pas de rename) + topologie/step ids inchangés → **pas de bump** si bi-reader strict.
- Bump `STEPWISE_GRAPH_VERSION` v5 OBLIGATOIRE seulement si on change nom/ordre/batch/step id ou si on refuse la compat old-snapshot.

## Analyses historiques
- Masquer les nombres. Ne PAS reprocesser en masse. Ne PAS dériver une orientation depuis un vieux score (= score caché).
- Si l'analyse historique a déjà signalIntensity/red flags/evidence → reconstruire un profil scoreless. Sinon → état « analyse legacy, profil scoreless indisponible » + faits/red flags/memo nettoyé.

## Décision produit à flaguer (tes yeux requis)
**Collapse 5→4 de l'orientation.** Mapping proposé : `very_favorable+favorable→favorable`, `contrasted→contrasté`, `alert_dominant→alerte`, insuffisance de couverture→`non exploitable`. **Point ouvert** : `vigilance`. Aujourd'hui plusieurs surfaces traitent `vigilance` comme « fragile/info », pas alerte rouge. Reco : `vigilance→contrasté` (pas `→alerte`), pour ne pas sur-alarmer l'investisseur. À confirmer.

## Vérification
- Test invariant « poisoned score » (P2) : orientation score-indépendante.
- Stepwise replay golden old/new snapshots (byte-equiv durabilité).
- Guards : aucun pattern de note de deal dans UI/PDF/chat.
- Re-test prod : Deep Dive complet end-to-end, step de synthèse < 300s, profil scoreless rendu.

## Sizing honnête
Chantier multi-jours / multi-sessions (relais Codex). P1 (fondation) + P2 (cœur synthèse) sont les pièces porteuses et risquées. La prod reste cassable sur l'ancien scorer jusqu'à la livraison (choix tout-en-un assumé) ; le salvage/watchdog déjà livré couvre les cas où le scorer réussit, pas la boucle — d'où l'urgence relative de P2.
