# Changes Log - Angel Desk

---
## 2026-07-20 — Chantier A1 — purge des valeurs fabriquées DealIntelligence / DealContext

### Fichiers
- `src/services/context-engine/{types.ts,deal-intelligence.ts,index.ts,competitor-relevance.ts,persistence.ts,fact-normalizer.ts}` : champs de tendance/concentration optionnels, suppression des défauts plausibles, purge inconditionnelle au chargement des snapshots et fait `market.timing_assessment` limité aux signaux réellement présents.
- `src/services/context-engine/connectors/seedtable.ts` : exclusion des news et deals similaires sans `fundingDate`, sans substitution par la date du jour.
- `src/agents/{types.ts,type-modules/common.ts,base-agent.ts}` + renderers Tier 1/2/3 : types alignés et lignes période/tendance/concentration conditionnelles.
- Tests : `deal-intelligence.test.ts`, `fact-normalizer.test.ts`, `competitor-relevance.test.ts`, `seedtable.test.ts` (nouveau), `base-agent.test.ts`.

### Description
Les valeurs `stable`, `0 %`, `Last 12 months` et `moderate` n'étaient adossées à aucun calcul réel mais alimentaient les prompts et, pour le timing marché, le Fact Store. Les builders les omettent désormais ; le choke point de persistence les retire aussi de tous les snapshots existants sans matérialiser de `fundingContext` absent. Les données mécaniques ou observées (`totalDealsInPeriod`, taille/stage de l'échantillon de multiples, sentiment calculé depuis des articles) restent intactes. Seedtable ne transforme plus une date inconnue en date courante. Vérifications : `tsc --noEmit` 0 ; tests ciblés 64/64 ; suite complète 4622 passed / 9 skipped / 0 failed ; contrôles grep interdits vides.

---
## 2026-07-20 — Fix qualité rendu (audit HelloCoco) — Validation finale : script DoD réutilisable + traîne profonde scrubbers + rejeu 3/3 PASS

### Fichiers
- `scripts/debug/audit-render-quality.ts` (NOUVEAU) : audit lecture-seule des 3 DoD sur une analyse arbitraire (`npx dotenv -e .env.local -- npx tsx scripts/debug/audit-render-quality.ts <dealName>`), sans appel LLM. Rejoue les VRAIES fonctions du pipeline corrigé sur les données stockées (sanitizeDealIntelligence + hasDefensibleMultiples, sanitizeLegacyCompetitiveLandscape + filterMissedCompetitors + applyOmissionRedFlagGuard, scrubAllScoresForLLMContext) — classifie par surface/allowlist (exigence Codex), section INFORMATIVE séparée pour les textes historiques persistés. Exit 0/1.
- `src/services/signal-profile/index.ts` : le script a révélé 2 trous fermés dans la foulée — (a) `deepStripDealNoteKeys` : les notes IMBRIQUÉES en profondeur (`teamAssessment.overallScore` du memo, `findings.score.grade` Tier 2) échappaient au strip top-level → retrait récursif par NOM de clé (patterns de note §4.1, métriques observables et orientations 5 valeurs préservées) câblé dans `scrubAgentScoreData` + `scrubSynthesisScoreData` ; (b) `scrubAllScoresForLLMContext` droppe désormais les champs de trace internes (`_traceFull`/`_traceMetrics`) qui portent la réponse LLM BRUTE pré-transform (score/grade inclus) au niveau du result, hors `data`.
- `src/services/signal-profile/__tests__/signal-profile.test.ts` : +2 tests (notes imbriquées memo/Tier 2 ; drop `_traceFull`).

### Description
**Validation finale de la session audit HelloCoco.** Rejeu sur les données existantes (sans analyse payante) : **3/3 DoD PASS** — DoD1 : médiane 1.15x stockée NEUTRALISÉE (renderers → INDISPONIBLE) ; DoD2 : 21 concurrents snapshot → 0 après sanitize (Mistral AI/Ankorstore/Dataiku/Yacla/Dolead purgés), Jasper/Anthropic écartés de competitorsMissedInDeck, red flag CRITICAL « Omission de concurrents massifs » supprimé au rejeu ; DoD3 : contexte LLM scrubé sans grade/overallScore/recommendation prescriptive. Suite unitaire complète : 4615 passed / 9 skipped / 0 failed ; tsc 0. **Obs annexe résolue en passant (cause évidente, pas de code)** : `_costReport` vide (`totalCalls: 0`) sur les analyses stepwise = le cost-monitor agrège des appels trackés EN MÉMOIRE (`this.analyses` Map par invocation) alors que le pipeline durable étale les steps sur des invocations Inngest séparées — au `endAnalysis` final la Map est vide ; même classe de bug que `totalTimeMs` (fixé 2026-06-15 via wall-clock). Source durable correcte : `LLMCallLog` (81 appels persistés pour HelloCoco). TODO futur : reconstruire le report depuis `LLMCallLog` au endAnalysis. **Vérifiable uniquement avec une nouvelle analyse réelle** : textes régénérés scoreless (memo sans médiane fabriquée ni « Score: X/100 »), qualité du juge de pertinence concurrents en conditions réelles (liste CE avec justifications), comportement fail-closed sur un deal sans use-cases, dérivés alertSignal cohérents post-chantier-2.

---
## 2026-07-20 — Fix qualité rendu (audit HelloCoco) — Chantier 3 : vestiges score/prescriptif hors des contextes LLM et des textes restitués

### Fichiers
- `src/agents/tier3/contradiction-detector.ts` : `formatAgentOutput` ne réinjecte plus « Score: X/100 (Grade: Y) » dans le prompt (remplacé par `signalIntensity`, mécanique interne autorisée) ; red flag « Score de consistance de X/100 » reformulé sans note.
- `src/agents/tier3/devils-advocate.ts` : `extractChallengeableElements` idem (plus de Score/Grade dans le prompt) ; justification fallback « à partir du score X/100 » reformulée.
- `src/agents/tier1/question-master.ts` : agentSummary (previousResults P1/P2) idem.
- `src/agents/tier3/thesis-reconciler.ts` : résumé agents sans « Score: X/100 » ; champ vestigial `blockers[].recommendation` (STOP) retiré (jamais rendu).
- `src/agents/tier3/memo-generator.ts` : le prompt ne demande PLUS de `score {value, grade A-F, breakdown}` au LLM (le transform le droppait déjà — production pure supprimée + type nettoyé).
- `src/agents/tier3/prompts/memo-generator-prompt.ts` (**finding Codex tour 2**) : system prompt runtime réécrit scoreless — « Synthèse des Scores » (agrégation pondérée) → « Synthèse des Signaux » ; table FRAMEWORK 0-100 → grille qualitative ; table « Score | Grade | Orientation » (anti-pattern orientation-depuis-score) → orientation dérivée de l'intensité des signaux uniquement ; exemple « Score 72/100 (Grade B) » purgé ; `alertSignal: hasBlocker, justification`.
- `src/agents/orchestrator/early-warnings.ts` : 10 `descriptionTemplate` « … score of {value}/100 … » réécrits en signaux agrégés sans note (les seuils `score.value` internes de déclenchement restent — mécanique autorisée §4.1).
- `src/services/signal-profile/index.ts` : scrubbers étendus — `stripPrescriptiveAlertSignal` retire `alertSignal.recommendation` (enum prescriptif STOP/PROCEED, compat infra) de tout contexte LLM réinjecté (`scrubAgentScoreData`, `scrubAllScoresForLLMContext`, `scrubSynthesisScoreData`) en gardant `hasBlocker`/`blockerReason`/`justification` (analytiques). Couvre chat + board déjà câblés.
- `src/agents/tier1/utils/derive-alert-signal.ts` : doc — statut « champ interne confiné » de `recommendation` + résolution de l'« incohérence » `hasBlocker=false`+`STOP` (axes indépendants ; le cas HelloCoco venait du faux red flag CRITICAL corrigé au chantier 2 ; le LLM ne pilote pas la dérivation — pas de couplage à `hasBlocker`).
- `src/agents/__tests__/doctrine-previousresults-guard.test.ts` (NOUVEAU) : source-guard — patterns de réinjection bannis (`Score: ${…}/100`, `(Grade: ${…}`) absents des 5 formatters ; memo sans schema grade ; early-warnings sans `{value}/100` ; textes produits CD/DA sans `${…}/100`.
- `src/services/signal-profile/__tests__/signal-profile.test.ts` : +3 tests scrubber (STOP retiré, hasBlocker conservé, alertSignal non-objet inchangé).

### Description
**Audit externe HelloCoco 2026-07-20, chantier 3.** Constat sur les données : 15 agents portent `score.grade` (D/F…) + `alertSignal.recommendation` (10× STOP) dans `analysis.results` ; `previousResults` réinjectait ces notes dans les prompts Tier 3 (« Score: 50/100 (Grade: D) ») ; des textes PRODUITS restitués contenaient « X/100 » (red flag consistance, justification DA, 10 templates early-warnings). Audit des surfaces : UI (`tier1-results` → `ALERT_SIGNAL_LABELS` : STOP→« ANOMALIE MAJEURE ») et PDF (`resolveTier1SignalIntensity`, `RecommendationBadge` 5 valeurs analytiques, `score-breakdown` déjà scoreless) mappent déjà en labels analytiques — le brut ne fuyait que via les contextes LLM et les textes produits, désormais fermés. Traitement conforme au DoD : champs vestiges « explicitement internes ET filtrés par les source-guards » (production `score.value`/`grade` des agents = P4 du plan dé-scorisation, hors périmètre — pas de sur-purge ; `score.value` reste une mécanique interne consommée par `deriveTier1SignalIntensity` et les triggers early-warnings). **Gate Codex 2 tours** : tour 1 REQUEST_CHANGES (system prompt memo encore score-based ; DA réinjectait `Recommandation: ${alert.recommendation}` ; red flag CD encore « Score de consistance » dans titre+evidence) — 3 findings vérifiés exacts, corrigés, guardés ; tour 2 APPROVE (arbitrage confirmé : pas de couplage hasBlocker→dérivation, le LLM ne doit pas piloter la dérivation déterministe). tsc 0 ; 2644 tests agents+services verts.

---
## 2026-07-20 — Fix qualité rendu (audit HelloCoco) — Chantier 2 : concurrents hors-catégorie → juge de pertinence + garde d'élévation « omission »

### Fichiers
- `src/services/context-engine/competitor-relevance.ts` (NOUVEAU) : juge LLM léger (gpt-4o-mini via OpenRouter, 1 appel/compute, temp 0) qui classe l'overlap CATÉGORIE de chaque candidat (`direct`/`partial`/`adjacent`/`none`) avec justification — seuls `direct`/`partial` avec justification NON VIDE restitués comme concurrents ; doute/adjacent/none/sans-verdict/sans-justification → suppression (zéro faux positif). **Fail-closed intégral (finding Codex)** : juge indisponible ou réponse inexploitable → AUCUN concurrent restitué (liste vide explicite, pas de liste non évaluée). + `sanitizeLegacyCompetitiveLandscape()` fail-closed au chargement (seuls les concurrents porteurs d'une justification survivent — un snapshot legacy rend une liste vide) + cap 30 candidats loggé.
- `src/services/context-engine/types.ts` : `Competitor.overlapJustification?` (absent = jamais évalué).
- `src/services/context-engine/index.ts` : `computeDealContext` filtre les concurrents par pertinence catégorie après `fetchCompetitorsParallel`.
- `src/services/context-engine/persistence.ts` : `loadContextSnapshot` sanitize aussi `competitiveLandscape`.
- `src/services/context-engine/connectors/web-search.ts` : export de `postOpenRouterCompletion` (réutilisé par le juge).
- `src/agents/tier1/utils/competitor-omission-guard.ts` (NOUVEAU) : `filterMissedCompetitors` (une entité « manquée dans le deck » n'est gardée que si PRÉSENTE dans la liste Context Engine JUGÉE — la vérification Funding DB n'est pas un passe-droit : existence ≠ pertinence catégorie, cf. tour 3 Codex scénario Mistral AI) + `applyOmissionRedFlagGuard` (sévérité d'un red flag « omission de concurrent » plafonnée par la sévérité max des omissions établies restantes ; aucune → suppression du flag ; notes de garde dans `meta.limitations` ; détection du thème sur title+description+evidence).
- `src/agents/tier1/competitive-intel.ts` : câblage des 2 gardes après la vérification d'entités (F08) ; prompt durci (fournisseur de techno/API ≠ concurrent de catégorie ; même secteur large ≠ overlap ; doute → ne pas inclure ; règle de sévérité CRITICAL sur `competitorsMissedInDeck` ; rappel ZÉRO FAUX POSITIF).
- `src/agents/base-agent.ts` : renderer concurrents affiche la justification d'overlap, ou « overlap non evalue, pertinence categorie NON etablie ».
- Tests (NOUVEAUX, 20) : `competitor-relevance.test.ts` (verdicts appliqués — fixture snapshot HelloCoco Mistral/Ankorstore/Dataiku/Yacla supprimés, Support Flow gardé ; fail-closed sans verdict ; parse fences/malformé ; fallback déterministe ; sanitize legacy) + `competitor-omission-guard.test.ts` (Jasper/Anthropic non vérifiés → écartés + red flag CRITICAL « Omission de concurrents massifs » supprimé ; plafonnement CRITICAL→HIGH ; CRITICAL maintenu si omission vérifiée CRITICAL ; flags non-omission intouchés).

### Description
**Audit externe HelloCoco 2026-07-20, chantier 2.** Cause racine (confirmée sur le `ContextEngineSnapshot`) : les connecteurs statiques matchent par mot-clé de SECTEUR et hardcodent `overlap` sans jamais l'évaluer (seedtable → Mistral AI/Ankorstore `partial`, french-tech → Dataiku `direct`, web-search → tout en `partial`) ; l'agrégation met ces matches en tête et base-agent ne rend que le top 5 → le contradiction-detector a vu « Dataiku, Yacla, Dolead » comme LES concurrents Context Engine (CONT-005 CRITICAL) pendant que les vrais comparables use-case étaient tronqués. Côté competitive-intel, le LLM a inventé Jasper/Anthropic depuis ses connaissances d'entraînement, en attribuant faussement au Context Engine (« Context Engine identifie Jasper et Anthropic ») : le marquage `[NON VERIFIE]` fonctionnait mais ne gâtait PAS la sévérité → red flag CRITICAL « Omission de concurrents massifs » repris dans le memo, alors que le deck listait le bon set concurrentiel. Fix : check de pertinence catégorie avant restitution (juge LLM justifié, suppression sous le seuil — pas de « peut-être ») + règle d'élévation déterministe (CRITICAL seulement si pertinence établie ET sourcée). Coût juge ≈ négligeable (1 appel gpt-4o-mini par compute de contexte, caché 30j). **Gate Codex 3 tours** : tour 1 REQUEST_CHANGES (fallback web_search + sanitize legacy gardaient Yacla → fail-closed intégral ; justification non vide exigée pour direct/partial ; `isOmissionFlag` inspecte aussi `evidence`) ; tour 2 REQUEST_CHANGES (« Funding DB verified » suffisait à garder une omission → une entité DB-vérifiée mais hors liste CE jugée pouvait porter un CRITICAL, ex. Mistral AI ; fix = liste CE jugée seule source de pertinence) ; tour 3 APPROVE. tsc 0 ; 38 tests des modules du chantier verts.

---
## 2026-07-20 — Fix qualité rendu (audit HelloCoco) — Chantier 1 : médiane valo 1.15x fabriquée → jamais de médiane sans échantillon défendable

### Fichiers
- `src/services/context-engine/deal-intelligence.ts` (NOUVEAU) : `buildDealIntelligence` extrait d'`index.ts` + fixé — calibration de stage (multiples d'un stage ≠ query exclus), seuil `MIN_MULTIPLE_SAMPLE=5` sous lequel AUCUNE médiane/p25/p75 n'est produite, `multiplesSampleSize`/`multiplesStage` exposés, suppression des fallbacks fabriqués (`median=20` par défaut, `p25/p75=±30%`, `percentileRank:50`, `verdict:"fair"`, `fairValueRange 0-0` hardcodés). + `hasDefensibleMultiples()` garde-fou de restitution (rejette aussi les snapshots legacy persistés avec médiane fabriquée sans sampleSize — cas HelloCoco).
- `src/services/context-engine/types.ts` : `FundingContext.medianValuationMultiple/p25/p75` optionnels + `multiplesSampleSize`/`multiplesStage` ; `DealIntelligence.percentileRank/fairValueRange/verdict` optionnels.
- `src/services/context-engine/index.ts` : ancienne `buildDealIntelligence` privée supprimée, import du nouveau module.
- `src/services/context-engine/connectors/french-tech.ts` : suppression de l'heuristique `valuation/(montant×10)` (« Rough ARR multiple ») — source exacte du 1.15x (Dataiku : 4.6Md/(400M×10)).
- `src/services/context-engine/connectors/eldorado.ts` : suppression de `calculateValuationMultiple` (constante 20 fabriquée).
- Renderers de prompts (garde `hasDefensibleMultiples`, sinon ligne explicite « INDISPONIBLE … NE PAS citer de mediane sectorielle ») : `src/agents/base-agent.ts` (`formatContextEngineData`), `src/agents/tier1/market-intelligence.ts`, `src/agents/tier1/deck-forensics.ts`, `src/agents/tier3/synthesis-deal-scorer.ts`, `src/agents/tier2/marketplace-expert.ts`.
- `src/services/context-engine/persistence.ts` : `loadContextSnapshot` passe `dealIntelligence` par `sanitizeDealIntelligence()` — point d'étranglement qui purge les snapshots legacy AVANT tout renderer/`JSON.stringify` (couvre aussi les experts Tier 2 qui stringifient `dealIntelligence` brut : mobility/blockchain/fintech/legaltech/creator).
- `src/services/context-engine/__tests__/deal-intelligence.test.ts` (NOUVEAU) : 14 tests — cas HelloCoco (67 deals, 0 multiple → rien), 1 seul multiple (sous seuil), calibration stage, échantillon suffisant (médiane+quartiles+n), multiples dégénérés (0/négatif/NaN/Infinity), top-10, rejet snapshot legacy, sanitizer (purge snapshot legacy exact HelloCoco incl. `similarDeals[].valuationMultiple` Dataiku@1.15 + assertion `JSON.stringify` sans "1.15", passthrough données fraîches, médiane incomplète retirée, objets partiels).

### Description
**Audit externe HelloCoco 2026-07-20, chantier 1.** Le memo citait « médiane sectorielle de 1.15x » (vs multiple implicite 6.7x → `valuationAssessment: VERY_AGGRESSIVE`) et le contradiction-detector « 1.15x … sur 67 deals récents ». Cause racine (confirmée sur le `ContextEngineSnapshot` persisté : `median=1.15, p25=0.805=1.15×0.7, p75=1.495=1.15×1.3` → branche fallback ≤3 multiples) : la médiane était calculée sur 1-3 multiples **fabriqués par heuristique** (french-tech `valuation/(montant×10)` : Dataiku Growth/Series E → 1.15 exactement ; eldorado → constante 20), sans calibration de stage (deal Seed comparé à du Growth), pendant que `totalDealsInPeriod=67` (deals SANS multiple) était affiché à côté → conflation LLM « médiane sur 67 deals ». Fix : plus aucun multiple fabriqué à la source ; médiane restituée uniquement si ≥5 multiples vérifiés du bon stage, avec n affiché dans le prompt ; sinon donnée explicitement indisponible (un chiffre faux est pire qu'une absence — 5 directives anti-hallucination). Le garde-fou de restitution neutralise aussi les snapshots legacy en cache (TTL 30j). **Gate Codex tour 1 REQUEST_CHANGES** (3 findings, tous vérifiés puis traités) : (1) `similarDeals[].valuationMultiple` legacy atteignait encore les prompts (`@ 1.15x ARR`) → sanitizer au chargement du snapshot ; (2) 5 experts Tier 2 `JSON.stringify(dealIntelligence)` bypassaient `hasDefensibleMultiples` → même sanitizer au choke point persistence ; (3) `hasDefensibleMultiples` durci (médiane + p25 + p75 + sampleSize requis, plus de `undefinedx`). tsc 0 ; 14 tests deal-intelligence verts.

---
## 2026-06-21 — Fix — mémo « Due diligence / À compléter » : questions tronquées à 80 car. + « ... »

### Fichiers
- `src/agents/tier3/memo-generator.ts` (ligne 1344) : `extractOutstandingDD` — `Vérifier: ${q.question.slice(0, 80)}...` → `Vérifier: ${q.question}` (question entière).

### Description
**Bug remonté par Sacha (screen, deal HelloCoco `cmq5i356n0001jp046gopsuev`).** Dans le bloc « Due diligence » du mémo (analysis-v2, sous-section « À compléter »), chaque ligne « Vérifier: … » était coupée (« l'isolation des donn… », « éviter les bo… »), alors que les lignes « Limitation: … » restaient entières. Cause racine : `memo-generator.extractOutstandingDD` tronquait chaque question CRITICAL à `q.question.slice(0, 80)` + suffixe `"..."` littéral au moment de la **génération du mémo** (donnée stockée pré-tronquée dans `dueDiligence.outstanding`, pas un clip CSS). Diagnostic : données question-master brutes 100 % intactes (220 questions complètes) ; aucune troncature CSS dans les renderers ; seul ce `.slice(0,80)` produisait le symptôme. Ligne 1307 (`Vérifier : ${q.question}`) ne tronquait déjà pas → cohérence rétablie. **Forward-only** : les mémos déjà générés gardent les chaînes tronquées en base ; il faut **ré-analyser** (ou backfill) pour rafraîchir HelloCoco. Fix trivial (suppression d'un slice d'affichage, skip gate Codex per routing UI/petit fix). tsc 0.

---
## 2026-06-15 — UX — durée d'analyse en wall-clock (carte « Couverture » affichait « 0 min »)

### Fichiers
- `src/lib/analysis-duration.ts` (NOUVEAU) : `resolveAnalysisDurationMs(startedAt, completedAt, totalTimeMs)` — préfère le wall-clock `completedAt − startedAt`, fallback `totalTimeMs`.
- `src/lib/__tests__/analysis-duration.test.ts` (NOUVEAU) : 5 tests (cas avekapeti 41 min, fallback, intervalles non positifs, null).
- `src/components/deals/analysis-v2/lib/selectors.ts` : `extractDealHeader` calcule `totalDurationMin` via le helper ; `startedAt?` ajouté à `extractDealHeader` / `buildDecisionStripModel` / `buildAnalysisV2ViewModel`.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` + `.../analysis-preview/avekapeti-v2/page.tsx` : `startedAt` ajouté au `select` Prisma + passé au view model.

### Description
**Fix UX (trouvé par Sacha pendant le re-test E2E — « pourquoi ça dit 0 min ? »).** La carte « Couverture » affichait `Analyse complète · 0 min` pour une analyse de **41 min** (wall-clock `startedAt`→`completedAt`). Cause : la durée était dérivée de `analysis.totalTimeMs`, qui en mode **stepwise/durable** ne capture que la durée de la **dernière invocation Inngest** (`report.duration` ≈ 5 s ; l'orchestrateur est ré-instancié à chaque step → jamais le temps total écoulé). Fix display-side (sûr, corrige aussi les analyses historiques) : préférer le wall-clock. `totalTimeMs` est purement un champ d'affichage (le coût = `totalCost`, séparé). **RESTE (même bug `totalTimeMs`, follow-up trivial via le même helper)** : `analysis-memo-full.tsx` + `analysis-investor-view.tsx` (reçoivent `totalTimeMs` en prop → à étendre `startedAt`/`completedAt`). Fix UI cosmétique (skip gate Codex per routing UI). tsc 0 ; suite unit complète 4553 passed / 9 skipped / 0 failed (4548 + 5 helper).

---
## 2026-06-15 — UX — masque d'analyse affiché dès le clic (fix latence ~30s)

### Fichiers
- `src/components/deals/analysis-v2/analysis-running-overlay.tsx` : lecture non réactive `getQueryData(launchedAt)` → `useQuery` client-only abonné à la clé (enabled:false, initialData lit le cache, staleTime/gcTime Infinity) → `setQueryData(launchedAt)` re-render désormais l'overlay.
- `src/components/deals/analysis-v2/analysis-v2-live.tsx` : `handleRelaunch` pose `launchedAt` AVANT le `fetch` (optimiste) + rollback (`→0`) sur 403/upgradeRequired et dans le `catch` ; 409/succès gardent le signal ; suppression des 2 `setQueryData(launchedAt)` post-fetch redondants.

### Description
**Fix UX (diagnostic + fix indépendants Codex, gaté APPROVE).** Trouvé pendant le re-test E2E (Sacha) : ~30 s de latence entre le clic « Relancer l'analyse » et l'apparition du masque « Analyse en cours ». Cause racine (convergence Claude+Codex, Codex a complété) : le signal `launchedAt` (qui doit afficher le masque immédiatement via la fenêtre de grâce 150 s) était posé **après** le POST `/api/analyze` (lent : auth + checks DB séquentiels + dispatch Inngest, ~30 s à froid) **ET** lu de façon **non réactive** (`getQueryData`) → `setQueryData` ne re-render pas l'overlay. Fix optimiste + abonnement réactif → le masque s'affiche au clic ; rollback couvre le refus crédits (403) et l'échec réel (pas de masque fantôme). Note (Codex, non bloquante) : la fenêtre de grâce peut théoriquement tenir le masque jusqu'à 150 s si un terminal arrive très vite — même compromis que l'existant. Indépendant du chantier synthèse SDS. tsc 0 ; suite unit complète 4548 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Synthèse SDS — étape B2 — nettoyage user-prompt mission + builders Tier 1 (scoreless)

### Fichiers
- `src/agents/tier3/synthesis-deal-scorer.ts` : `execute()` — retrait du calcul de pondérations (+ import `@/scoring/stage-weights`, inutilisé ailleurs) ; section prompt `SCORES BRUTS TIER 1` → `SIGNAUX TIER 1` ; MISSION réécrite (plus de `CALCULE LE SCORE PONDÉRÉ Σ` / table de poids / `AJUSTE -10/-20` / mapping `85-100→very_favorable` / `DONNE LE PROFIL DE SIGNAL`) ; RAPPELS (retrait `MONTRE TOUS LES CALCULS` / `score.value=Σ` / `score>40`) ; CONCISION alignée scoreless. Builders : `extractTier1Scores`→`extractTier1Signals` (facteurs qualitatifs, plus de `score.value/100`), `extractKeyFactors` (team sans `complementarityScore/100`), `buildTier1Synthesis` (complétude observable seule). **Findings Codex** : aussi nettoyés `Score sectoriel/100` (extractTier2Data → verdict qualitatif), `Score de cohérence/100` (extractContradictions → nombre + contenu), `bonus/malus du score global` + `pour le scoring` + description `score pondéré` + `intégrées dans le scoring`.

### Description
**Fix synthèse SDS, étape B2 (gaté Codex APPROVE après 1 REQUEST_CHANGES).** Complète B1 côté user-prompt : ni la mission, ni les builders n'injectent plus de note/score dans le contexte LLM. Le LLM ne calcule plus de moyenne pondérée (orientation dérivée déterministiquement en aval). **REQUEST_CHANGES Codex (correct, appliqué + arbitrage de scope tranché)** : les injections adjacentes `Score sectoriel/100` et `Score de cohérence/100` devaient être nettoyées DANS B2 (pas en follow-up) — le wording `Score …/100` réactive la forme retirée ; le verdict sectoriel qualitatif + le nombre/contenu des incohérences restent. Grep de contrôle : plus aucune chaîne de score injectée dans le prompt (résidus `/100` = commentaires d'explication). Le prompt alimente toujours `transformResponse` (champs réellement lus). DURABILITÉ : sortie d'agent inchangée, prompt non persisté → pas de bump `STEPWISE_GRAPH_VERSION`. Qualité réelle du JSON à confirmer au re-test E2E payé. tsc 0 ; suite unit complète 4548 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Synthèse SDS — étape B1 — nettoyage prompt système (retrait machinerie de score)

### Fichiers
- `src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts` : réécrit scoreless (net −177 l). Retiré : tables de scoring 0-100 par dimension, formule pondérée `Score = Σ`, grille Score→orientation, champs de sortie `score`/`dimensionScores`/`scoreBreakdown`/`marketPosition`/`grade`, orientation native demandée au LLM. Conservé VERBATIM : TONALITE anti-prescriptive (ANALYSE et GUIDE / ne DECIDE JAMAIS), NEXT STEPS, FORNEGOTIATION. Nouveau FORMAT DE SORTIE = uniquement ce que `transformResponse` lit.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-prompt.guard.test.ts` : 2 assertions périmées (orientation native, tables `Team(26%)`) remplacées par assertions descorisation (pas de `dimensionScores`/`scoreBreakdown`/`marketPosition`/`"score":`/`"grade":`/`very_favorable`/`Score=Σ`/`85-100`) + présence des champs qualitatifs lus (`topStrengths`/`topWeaknesses`/`recommendation`/`rationale`/`redFlags`).

### Description
**Fix synthèse SDS, étape B1 (gaté Codex APPROVE, sans REQUEST_CHANGES).** Fix RACINE du timeout systématique de l'appel LLM de synthèse : le prompt système instruisait toute une machinerie de score (output volumineux) que `transformResponse` JETTE (orientation + solidité dérivées DÉTERMINISTIQUEMENT en aval depuis les signaux consolidés, jamais du LLM). Retirée → prompt lean → LLM plus rapide. Complète la dette descorisation côté system prompt (plus aucune note/score/grade demandé). Le nouveau FORMAT DE SORTIE ne demande QUE ce que `transformResponse` consomme (`recommendation.{rationale,conditions,suggestedTerms}`, `topStrengths`, `topWeaknesses`, `redFlags`, `narrative.keyInsights`) — champs retirés tous optionnels dans `LLMSynthesisResponse`, donc le chemin nominal ne casse pas (validé Codex). La qualité réelle de l'output sera revalidée au re-test E2E payé (différé). tsc 0 ; suite unit complète 4548 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Synthèse SDS — étape A — fallback déterministe sur échec LLM (synthèse de signaux propre, scoreless)

### Fichiers
- `src/agents/tier3/synthesis-deal-scorer.ts` : `execute()` enveloppe le seul appel LLM dans un try/catch (transformResponse reste HORS du try) ; nouvelles méthodes `buildFallbackSynthesis` (repli déterministe) + `composeFallbackNarrative` (narratif scoreless anti-prescriptif) ; import `DOCTRINE_ORIENTATION_CONFIG`.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-transform.test.ts` : +8 tests builder (alert correct, plafond contrasted conservateur, keyStrengths/Weaknesses vides, contrat signalProfile, narratif propre sans langage d'échec, anti-prescriptif + sans note, criticalRisks consolidés, not_exploitable) + 1 test wiring (llmCompleteJSON rejette → execute renvoie le repli sans throw).

### Description
**Fix synthèse SDS, étape A (gaté Codex APPROVE, sans REQUEST_CHANGES).** Le test E2E preview a montré que l'appel LLM de synthèse timeout systématiquement (cap délibéré 100s `SYNTHESIS_LLM_CALL_OPTIONS` + GEMINI_PRO lent sur prompt bourré de scores legacy + gros contexte) → orientation non rendue → analyse « partielle ». Désormais, sur échec de l'appel LLM, `execute()` ne propage plus `success:false` mais restitue une **synthèse de signaux déterministe** : orientation scoreless dérivée 100% du contexte (red flags consolidés + couverture par dimension + solidité), `favorableSignalCount=0` conservateur (plafond `contrasted` côté positif, branche défavorable pleinement pilotée par les signaux), narratif **propre** anti-prescriptif **sans formulation d'échec côté user** (décision produit Sacha A1 — la carte reste riche, l'analyse se termine 22/22). `transformResponse` strictement INCHANGÉ (byte-équiv durable, chemin nominal replayé en stepwise) → repli en méthode SÉPARÉE. `console.warn` pour surveiller le taux de fallback. Catch large (tout échec `llmCompleteJSON`, pas que timeout) validé par Codex (dégrader proprement plutôt qu'échouer l'analyse). PAS de bump `STEPWISE_GRAPH_VERSION` (forme de payload nominale). tsc 0 ; suite unit complète 4547 passed / 9 skipped / 0 failed (4538 + 9).

---
## 2026-06-15 — Dé-scorisation — fix scoreless miss bannière « Analyse incomplète » (trouvé par test E2E preview)

### Fichiers
- `src/components/deals/analysis-v2/page-shell.tsx` : `PartialBanner` « le score consolidé » → « l'orientation consolidée » (`&apos;` JSX).

### Description
**Miss de dé-scorisation trouvé par le test E2E sur preview (Deep Dive avekapeti, branche Neon isolée).** Le `PartialBanner` « Analyse incomplète » (affiché quand un agent n'aboutit pas) restituait encore « le score consolidé ci-dessous sont donc partiels » — terme de note de deal oublié par le sweep P3. Aligné sur le modèle scoreless (orientation). Le reste de la restitution est confirmé scoreless par le test (summary 0 hit `/100`/`overallScore` ; les patterns score restants = internes LARGE-différés / cohérence documentaire allowlist, jamais dans le `summary`). **Note** : le `doctrine-guard` analysis-v2 ne couvrait pas la prose « score consolidé » → gap de guard à combler. Fix copy trivial (skip gate Codex per routing UI) ; tsc 0 ; tests analysis-v2 64 passed.

---
## 2026-06-15 — Dé-scorisation — P6.2 — replay durable stepwise old/new snapshots (byte-equiv)

### Fichiers
- `src/agents/orchestrator/__tests__/p5-descoring-durability-replay.test.ts` (NOUVEAU) : test d'intégration durabilité × lecture scoreless.

### Description
**Chantier dé-scorisation, P6.2 (gaté Codex APPROVE, sans REQUEST_CHANGES) — test-only.** Prouve la durabilité de la dé-scorisation **à travers la frontière du snapshot stepwise**, en composant deux propriétés déjà testées séparément (`full-analysis-snapshot.test.ts` round-trip byte-préservant ; `signal-profile.test.ts` lecture old/new + poisoned-score). Construit un `FullAnalysisStepState` (base v4 valide) avec un résultat `synthesis-deal-scorer`, le passe par le chemin durable RÉEL (`serializeStepState` → `deserializeStepState`), puis le lit par le chemin de production (`readDoctrineOrientation`). **3 scénarios** : (1) snapshot ANCIEN portant `overallScore=91` + `verdict alert_dominant` → après round-trip le score est préservé (carry) mais l'orientation vient du verdict catégoriel (`legacy_verdict`, alerte), jamais du score (assertion **poisoned-score** explicite : 91 aurait suggéré favorable) ; `scrubAllScoresForLLMContext` retire la note du résultat round-trippé ; (2) snapshot NOUVEAU scoreless (`signalProfile`) → source `profile`, aucun overallScore ; (3) **TEETH** : synthesis portant QUE `overallScore` (sans verdict ni profil) → orientation `none` (jamais dérivée d'un score). Non-redondant : la nouveauté est le round-trip durable AVANT lecture. tsc 0 ; suite unit complète 4538 passed / 9 skipped / 0 failed (4531 + 7).

---
## 2026-06-15 — Dé-scorisation — P6.1 — source-guard structurel anti-régression (schema + types agents)

### Fichiers
- `src/agents/__tests__/p5-descoring-structural.guard.test.ts` (NOUVEAU) : guard de contenu source (pattern a7b3).

### Description
**Chantier dé-scorisation, P6.1 (gaté Codex APPROVE après 1 REQUEST_CHANGES) — test-only.** Verrouille les acquis STRUCTURELS de P5 contre régression : (1) `prisma/schema.prisma` ne re-déclare aucune des 13 colonnes de note droppées en P5-c (match de DÉCLARATION nom + Int/Float, pas une simple mention en commentaire) ; (2) les 3 défs `SynthesisDealScorerData` + les 2 défs `ConditionsAnalystData` ne re-déclarent aucun champ de note purgé en P5-b. Mécanique : `extractInterfaceBody` (comptage de braces, exclut le compat `SynthesisDealScorerDataV2`) + `stripComments` (les commentaires P5 CITENT les noms purgés → faux positif corrigé) + regex de déclaration de champ. **Ne bannit QUE les patterns de note** (qualityScore / confidenceScore par-item / similarityScore autorisés). **REQUEST_CHANGES Codex (correct, appliqué)** : le guard `confidence` ne couvrait que `confidence?:` (pas `confidence:` requis) et le guard conditions que `score?: AgentScore` (pas `score:` ni autre forme) → `confidence` versé dans `BANNED_FIELDS`, regex conditions élargie à `\bscore\??\s*:`. Teeth check vérifié sur les 2 trous fermés. tsc 0 ; suite unit complète 4531 passed / 9 skipped / 0 failed (4502 + 29).

---
## 2026-06-15 — Dé-scorisation — P5-c — MIGRATION DROP des 13 colonnes de note de deal mortes

### Fichiers
- `prisma/schema.prisma` : drop `Deal.{global,fundamentals,conditions,team,market,product,financials}Score` (7), `AnalysisSignalSummary.{global,team,market,product,financials}Score` (5, Float), `DealTermsVersion.conditionsScore` (1). Commentaires P5-c.
- `prisma/migrations/20260615110802_descoring_drop_dead_score_columns/migration.sql` : 13 `ALTER TABLE ... DROP COLUMN` exacts. Générée **sans DB** (`migrate diff --from-schema-datamodel HEAD --to-schema-datamodel edité`) car `.env.local` = prod Neon uniquement (pas de dev/shadow → pas de `migrate dev`).
- 5 blocs `omit` Prisma retirés (`dashboard/page`, `deals/page`, `deals/[dealId]/page`, `api/deals/route`, `api/deals/[dealId]/route`) — obligatoire post-drop (omit d'une colonne droppée = erreur).
- 3 mocks Prisma Deal nettoyés (`base-agent-date-rendering` 7 nulls, `analysis-cache` 5 nulls, `context-compiler` 5 valeurs vestigiales). Tests d'absence `export`/`compare` (`not.toHaveProperty`) laissés (valides après drop).

### Description
**Chantier dé-scorisation, P5-c (gaté Codex APPROVE, sans REQUEST_CHANGES) — byte-equiv-critique.** Drop physique des 13 colonnes de note mortes (3 familles, décision verrouillée Codex). **Mortes** : zéro writer (P4-b4/P5-a.3), zéro reader d'écran (P3), readers cluster basculés (P5-a), types purgés (P5-b) ; `AnalysisSignalSummary.findMany` a un `select` explicite sans scores ; `src/scoring` globalScore = type interne distinct. **Durabilité** : pas de bump `STEPWISE_GRAPH_VERSION` (snapshots dans `Analysis.summary`, pas ces colonnes) ni `CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION` (extractedInfo inchangé). **ORDONNANCEMENT PROD verrouillé par Codex** : DROP destructif → **déployer le code scoreless d'ABORD, drainer les instances old-code, PUIS `migrate deploy`** (appliquer avant deploy casserait l'ancien code prod qui lit encore les colonnes) ; **inverse** la règle habituelle « apply before merge ». **PROD Neon À LA MAIN par SACHA** (`migrate deploy`, soft-bloqué harness) après deploy scoreless ; `migrate status` + `migrate diff` clean attendus. tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed ; migration SQL relue = 13 DROP COLUMN exacts.

---
## 2026-06-15 — Dé-scorisation — P5-b.2 — purge ConditionsAnalystData.score (Option B, cast Record legacy)

### Fichiers
- `src/agents/types.ts` : `ConditionsAnalystData` — `score?: AgentScore` retiré + commentaire P5-b.
- `src/agents/type-modules/tier3.ts` : `ConditionsAnalystData` (one-liner) — idem.
- `src/services/terms-normalization.ts` : fallback legacy `conditionsBreakdown` — lecture `score.breakdown` (criterion + justification) passée d'un accès typé à un cast `Record` étroit.

### Description
**Chantier dé-scorisation, P5-b.2 (gaté Codex APPROVE, Option B arbitrée — sans REQUEST_CHANGES).** Purge du champ de note `score` côté conditions. **Fork de périmètre tranché par Codex** : `ConditionsAnalystData.score` avait UN lecteur typé vivant (le fallback legacy `terms-normalization.ts` qui lit `score.breakdown` criterion/justification pour les snapshots conditions pré-P4). Option B retenue (vs A garder le champ / C drop le fallback) : retirer le champ du type + lire le fallback via cast `Record` étroit → compat snapshot historique préservée (libellés qualitatifs, jamais value/grade), runtime byte-équivalent. Producteur n'émet plus de `score` top-level depuis P4-b2 ; seuls `trancheAssessments[].score` (LARGE-différé) subsistent. `AgentScore` import non orphelin (ContradictionDetector/DevilsAdvocate). **Pas de bump `STEPWISE_GRAPH_VERSION`** (purge de type, bytes runtime inchangés). **P5-b COMPLET** (b.1 synthèse + b.2 conditions). tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-b.1 — purge des champs de note du type SynthesisDealScorerData (synthèse)

### Fichiers
- `src/agents/type-modules/tier3.ts` : `SynthesisDealScorerData` (one-liner) — 5 champs de note retirés (`overallScore`, `confidence`, `dimensionScores`, `scoreBreakdown`, `comparativeRanking`) ; commentaire P4→P5-b.
- `src/agents/types.ts` : même def — 5 champs + commentaire mis à jour.
- `src/agents/tier3/synthesis-deal-scorer.ts` : même def — 5 champs + bloc commentaire fusionné avec la doc `verdict`.

### Description
**Chantier dé-scorisation, P5-b.1 (gaté Codex APPROVE, sans REQUEST_CHANGES).** Purge des 5 champs de note de deal devenus OPTIONNELS en P4-a, côté synthèse uniquement. **Zéro lecteur typé** : `tier3-results.tsx` (seul consumer UI) scoreless depuis P3 ; producteur `transformResponse` ne les set plus (P4-a) ; `analysis-delta`/`analysis-variance` lisent via leur propre type local lâche (cluster différé, interne) ; scrubber `signal-profile` via clone `Record` ; `early-warnings` `field: "overallScore"` = littéral string consommé dynamiquement (règle inerte). Snapshots historiques lus défensivement (cast `Record`), jamais via ce type. **Hors périmètre** (micro-steps séparés) : `ConditionsAnalystData.score` (bi-reader vivant `terms-normalization.ts:85` → P5-b.2), règle early-warning inerte, mock Prisma `base-agent-date-rendering.test.ts` (→ P5-c), `SynthesisDealScorerDataV2`. **Pas de bump `STEPWISE_GRAPH_VERSION`** (purge de type, bytes runtime inchangés). tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.4 — read-model core scoreless (P5-a bascule readers COMPLET)

### Fichiers
- `src/services/deals/analysis-signal-summary.ts` (−36) : moitié SCORES retirée (`AnalysisSignalSummaryData.scores`, `computeAnalysisSignalSummary`, `SummaryRow`, `rowToData`, `select` `readAnalysisSignalSummaries`, write `upsert`). **`extractedInfo` (sector/stage/instrument/geo/description) ENTIÈREMENT CONSERVÉ** (moitié live).
- `src/services/analysis-results/score-extraction.ts` (−90) : `extractAnalysisScores` + interface `AnalysisScores` + helper `normalizeDimensionLabel` SUPPRIMÉS. `extractCanonicalExtractedInfo` + `CanonicalExtractedInfo` + `isRecord`/`readString` conservés.
- `src/services/funding-db/percentile-calculator.ts` SUPPRIMÉ (`calculateDealPercentile` = percentile-DE-score, orphelin en prod — bloc F37 retiré en P4-a, aucun import production) + son test ; 2 `vi.mock` morts retirés (agent-pipeline + sequential-pipeline).
- Test `analysis-signal-summary.test.ts` : assertions de score retirées, couverture `extractedInfo` conservée.

### Description
**Chantier dé-scorisation, P5-a.4 (gaté Codex APPROVE, sans REQUEST_CHANGES) — clôt P5-a (bascule readers).** Le cœur du read-model ne calcule/stocke/lit plus de note. **Durabilité (validée Codex)** : colonnes `AnalysisSignalSummary.*Score` restent en DB jusqu'à P5-c (drop confirmé) ; **pas de bump `CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION`** (la moitié `extractedInfo` cachée est inchangée → vieux rows valides en lecture ; scores simplement ignorés). Pas de bump `STEPWISE_GRAPH_VERSION`. `extractAnalysisScores`/`AnalysisScores`/`calculateDealPercentile` totalement absents (reste 1 commentaire historique). **P5-a COMPLET** : a.1 chat, a.2 canonical deal-fields, a.3 terms/conditions, a.4 read-model core. tsc 0 (lu directement) ; suite unit complète 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.3 — bascule des readers du cluster TERMS/CONDITIONS off conditionsScore

### Fichiers
- `src/services/terms-normalization.ts` : `buildTermsResponse` perd le param positionnel `conditionsScore` + le champ `conditionsScore` du retour (`conditionsBreakdown`/`dimensionAssessment` verbal conservé).
- `src/app/api/deals/[dealId]/terms/route.ts` : 3 callers mis à jour ; `select` Deal.{globalScore (mort), conditionsScore} retiré (GET) ; write `conditionsScore` du `dealTermsVersion.create` retiré ; write neutralisé `conditionsScore: null` du `Deal.update` retiré.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : lecture `deal.conditionsScore` retirée + `conditionsScore` ajouté à l'`omit` `getDeal`.
- `src/app/api/deals/[dealId]/terms/versions/route.ts` : `select` + sortie `DealTermsVersion.conditionsScore` retirés.
- `src/agents/orchestrator/persistence.ts` : write neutralisé `conditionsScore: null` (case `conditions-analyst`) retiré.
- `src/components/deals/conditions/types.ts` : `conditionsScore` retiré de `TermsResponse` + `TermsVersionData` (0 consumer client).
- 5 `omit` (deals/route, deals/[dealId]/route, deals/page, deals/[dealId]/page, dashboard) : `conditionsScore` ajouté (note Codex a.2 — couvre aussi les `include` + spread sans lecture explicite).

### Description
**Chantier dé-scorisation, P5-a.3 (gaté Codex APPROVE, sans REQUEST_CHANGES).** 3e micro-step de P5 : le cluster terms/conditions ne lit/écrit plus `conditionsScore` (Deal.conditionsScore + DealTermsVersion.conditionsScore). UI déjà scoreless depuis G4 (carry mort) ; le verbal `conditionsBreakdown`/`dimensionAssessment` reste. **Scope P5-c confirmé par Codex** : DROP aussi `DealTermsVersion.conditionsScore` (snapshot de note mort, comme `Deal.conditionsScore` + `AnalysisSignalSummary.*Score`). Conservé : guard `user/export` (asserte l'absence). **Différé à P5-b** : mock full-Deal `base-agent-date-rendering.test.ts` (porte les 7 scores). Colonnes encore en schema ; drop = P5-c → `omit` retirés à ce moment. **Pas de bump `STEPWISE_GRAPH_VERSION`**. tsc 0 (lu directement) ; suite unit complète 4506 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.2 — bascule des readers du cluster CANONICAL DEAL-FIELDS off Deal.*Score

### Fichiers
- `src/services/deals/canonical-read-model.ts` (cœur, −53) : `CanonicalFieldFallbacks` (= `CanonicalDealFields`) 5 champs de score retirés ; `CanonicalDealSignals.analysisScoresByDealId` retiré + son build dans `loadCanonicalDealSignals` (early-return vide + chemin nominal) ; **`extractedInfoByDealId` CONSERVÉ** (live : sector/stage/geo) ; fonction `resolveCanonicalAnalysisScores` SUPPRIMÉE (0 caller) ; `resolveCanonicalDealFields` `const scores` + 5 sorties retirés ; import `type AnalysisScores` retiré.
- 5 consumers (retrait des args fallback de score lus depuis `deal.*Score` + sorties ; ajout d'un `omit` Prisma des 6 colonnes note global/dimension pour fermer la fuite `include` + spread `...deal`) : `api/deals/route.ts` (utilisait `resolveCanonicalAnalysisScores` + mapping → import retiré), `api/deals/[dealId]/route.ts`, `(dashboard)/deals/page.tsx`, `(dashboard)/deals/[dealId]/page.tsx` (helper `getDeal`, `omit` de 6 — conditionsScore gardé pour a.3), `(dashboard)/dashboard/page.tsx`.
- `src/components/deals/types.ts` : `CanonicalDealListItem.globalScore` retiré (0 consumer UI post-E).
- Tests (suppression de couverture de SCORE uniquement) : `canonical-read-model.test.ts` (test obsolète `resolveCanonicalAnalysisScores` supprimé + I/O score retirés du test de résolution), `canonical-read-model-signal-summary.test.ts` (assertions `analysisScoresByDealId` retirées, équivalence cache hit/miss conservée via extractedInfo), `api/deals/route.test.ts` + `api/deals/[dealId]/route.test.ts` (mocks + assertions de score retirés).

### Description
**Chantier dé-scorisation, P5-a.2 (gaté Codex APPROVE après 1 REQUEST_CHANGES).** 2e micro-step de P5 : le read-model canonique (linchpin partagé par 5 surfaces) ne lit/restitue plus les colonnes de note global/dimension. **REQUEST_CHANGES Codex (correct, vérifié)** : `prisma.deal.findMany({ include })` sans `select` ramène TOUS les scalaires → `...deal` re-restituait `globalScore` etc. dans la réponse API même après retrait des reads explicites → ajout `omit` (6 colonnes) sur les 5 requêtes qui spreadent ; + correction du test détail `api/deals/[dealId]/route.test.ts` (contrat obsolète qui masquait la fuite). **Boundary** : `conditionsScore` = P5-a.3 (lectures explicites onglet Conditions) ; **note Codex pour a.3** : ajouter `conditionsScore` aux `omit` couvrira aussi les requêtes sans lecture explicite. Colonnes encore en schema (tsc vert) ; drop = P5-c → les `omit` seront retirés à ce moment. **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe durable). tsc 0 (lu directement) ; suite unit complète 4506 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — P5-a.1 — bascule des readers du cluster CHAT off Deal.*Score (scoreless)

### Fichiers
- `src/agents/chat/context-retriever.ts` : 5 champs de score retirés de l'interface `DealInfo`, du `select` Prisma deal, du carry `DealInfo`, et du type+corps de `getLatestAnalysisMeta` (`scores: extractAnalysisScores(results)`) ; import `extractAnalysisScores` retiré (`loadResults` conservé).
- `src/services/chat-context/index.ts` : 5 champs de score retirés du `select` `getDealBasicInfo`, carry `canonicalDeal` collapsé (`const canonicalDeal = deal`), `scores` retiré de `getLatestAnalysisResults` (`results` conservé pour `hasResults`) ; import `extractAnalysisScores` retiré.
- `src/app/api/chat/[dealId]/route.ts` : 5 champs de score retirés des 2 objets construits pour l'agent (`dealInfo` + `deal`) ; `thesisGated` conservé (sanitizer).
- `src/agents/chat/deal-chat-agent.ts` : 5 champs de score optionnels retirés des 2 sous-objets de `FullChatContext` (`canonicalDeal` + `deal` alias legacy).
- `src/app/api/chat/[dealId]/__tests__/route.test.ts` + `src/agents/chat/__tests__/context-retriever.test.ts` : assertion `agentContext.deal.globalScore` + mocks de score obsolètes retirés (cluster grep-clean).

### Description
**Chantier dé-scorisation, P5-a.1 (gaté Codex APPROVE après 2 REQUEST_CHANGES).** 1er micro-step de P5 (bascule readers AVANT drop colonnes — colonnes encore en schema, tsc reste vert). Le cluster chat ne lit plus `Deal.*Score` ni `extractAnalysisScores` : champs structurés morts (LLM déjà scoreless depuis P3 + scrubbers G3). **Round 1→2 (finding Codex correct, vérifié tsc)** : le chat route reconstruisait `canonicalDeal.*Score` depuis `getDealBasicInfo` → ajout route + `FullChatContext` au périmètre. **Round 2→3** : mock `dealFindUnique` nettoyé (contrat « cluster fermé » = grep-clean). **Décisions Codex verrouillées pour la suite P5** : ordre a(readers)→b(types optionnels)→c(migration DROP)→cleanup ; DROP aussi `AnalysisSignalSummary.*Score` (même famille read-model) ; `calculateDealPercentile` supprimable dès a.4 (orphelin). **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe durable). tsc 0 (lu directement) ; 10 tests chat verts.

---
## 2026-06-15 — Dé-scorisation — P4-b4 — retrait du write de persistence inerte (synthesis → Deal.*Score) — P4 producteurs COMPLET

### Fichiers
- `src/agents/orchestrator/persistence.ts` : case `synthesis-deal-scorer` de `persistAgentResult` **retiré** (écrivait `Deal.{fundamentals,global,team,market,product,financials}Score` depuis `synthResult.data.overallScore` + `dimensionScores`). Inerte depuis P4-a (synthesis ne produit plus `overallScore` → garde `if (overallScore != null)` toujours faux). Remplacé par un commentaire (drop colonnes + readers = P5). Import `SynthesisDealScorerResult` retiré (orphelin).

### Description
**Chantier dé-scorisation, P4-b4 (gaté Codex APPROVE — clôt P4 producteurs).** Dernier nettoyage P4 : retrait du write DB mort. **P4 producteurs COMPLET** : b1 (team-investigator founder scores), b2 (conditions-analyst note + Option B dimensionAssessment), b3 (retrait deal-scorer Tier 0), b4 (persistence inerte). **Reporté à P5 (périmètre validé Codex)** : la PURGE des champs optionnels de note (synthesis `overallScore`/`dimensionScores`/`scoreBreakdown`/`comparativeRanking`/`confidence` ; conditions `score`) est entrelacée avec les lecteurs défensifs (`score-extraction`, `canonical-read-model`) + le drop des colonnes `Deal.*Score` → cluster P5, pas P4 (les retirer maintenant casserait les readers `?? null` et la compat snapshots). **Pas de bump `STEPWISE_GRAPH_VERSION`** (retrait d'un write inerte, aucun changement graphe/snapshot). tsc 0 ; persistence idempotence + salvage + progress-monotone = 32 verts.

---
## 2026-06-15 — Dé-scorisation — P4-b3 — retrait de l'agent deal-scorer Tier 0 (pur producteur de note)

### Fichiers
- **`src/agents/deal-scorer.ts` SUPPRIMÉ** : agent Tier 0 = PUR producteur de note de deal (scores global/team/market/product/financials/timing + breakdown + `percentileRanking` percentile-de-score + comparableDeals.score). Aucun findings/redFlags/narrative verbal à préserver. **Décision Codex : RETRAIT** (vs neutralisation, qui laisserait un agent vide).
- `src/agents/index.ts` + `src/agents/orchestrator/agent-registry.ts` : export `dealScorer` + import + entrée `BASE_AGENTS["deal-scorer"]` retirés.
- `src/agents/orchestrator/types.ts` : `"deal-scorer"` retiré de `BaseAgentName` ; `ANALYSIS_CONFIGS.full_dd.agents` → `[]` (**clé `full_dd` CONSERVÉE** car `AnalysisType = keyof typeof ANALYSIS_CONFIGS` — retirer la clé casserait le type partout).
- `src/agents/orchestrator/index.ts` : **garde dispatcher** `case "full_dd"` → fall-through `runFullAnalysis` (sans ce garde, un event interne legacy `type=full_dd` tomberait dans `runBaseAnalysis` avec 0 agent = succès vide trompeur — bug latent trouvé par Codex). Cohérent avec le remap route `full_dd→full_analysis`.
- `src/agents/board/{types,board-orchestrator}.ts` : champ + construction `dealScorer` du tier0 board retirés.
- Types orphelins retirés (3 copies) : `ScoringResult` / `DealScores` / `ScoreBreakdown` (agents/types.ts, type-modules/common.ts, src/types/index.ts) + membre `ScoringResult` des 2 unions `AnalysisAgentResult` + import pipeline.ts. (synthesis-deal-scorer a son `ScoreBreakdown` local, intact.)
- `src/agents/__tests__/a9-reste-confidence-threshold.guard.test.ts` : entrée `deal-scorer.ts` retirée de la liste (fichier supprimé).

### Description
**Chantier dé-scorisation, P4-b3 (gaté Codex APPROVE après 1 REQUEST_CHANGES — garde dispatcher).** 3e producteur P4. deal-scorer ne tournait que via `ANALYSIS_CONFIGS.full_dd`, lui-même remappé vers `full_analysis` à la route (`LEGACY_TYPE_REPLACEMENTS`) → agent de facto mort. Pas dans le graphe stepwise, pas persisté, seul consumer = board (déjà scrubbé P2-c). **Conservé (anti-over-clean, consigne Codex)** : label `AGENT_LABELS_FR["deal-scorer"]` (affichage historique), entrée denylist `presentation.ts` (empêche de resurfacer le nom technique d'anciens snapshots scorés), mappings API/coût/crédits legacy `full_dd`. **Pas de bump `STEPWISE_GRAPH_VERSION`** (hors graphe stepwise). **Dette doc notée** : `CLAUDE.md` § ARCHITECTURE liste encore deal-scorer sous « Couche 0 = 3 agents » / « 43 agents » — drift de doctrine laissé à Sacha (hors-scope code). tsc 0 ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-b2 — conditions-analyst : retrait de la note conditions (Option B)

### Fichiers
- `src/agents/tier3/conditions-analyst.ts` (−72) : top-level `score` (value/grade/breakdown) retiré — type `LLMConditionsResponse`, bloc `score` du prompt schema, construction dans `buildOutput` + fallback, `getGrade`, mention `score X/100` dans `alertSignal.justification`, `score` du return + import `AgentScore`. **Option B (gaté Codex)** : nouveau `findings.dimensionAssessment` `{criterion, justification}` (verbal UNIQUEMENT, aucune note) — demandé dans le prompt (4 critères Valorisation/Instrument/Protections/Gouvernance), mappé dans `buildOutput` (filtre + cap 4, fallback `[]`), `[]` en fallback no-conditions. Retrait de la **fuite LLM** du context-builder (poussait `Score X/100` des autres agents).
- `src/agents/base-agent.ts` : `conditions-analyst` retiré de `standardStructuredAgents` + branche contrat SCORELESS dédiée (`meta/findings/redFlags/questions/alertSignal/narrative`, sans `score`).
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : `ConditionsAnalystData.score` rendu OPTIONNEL (compat durable) ; `dimensionAssessment` ajouté à `ConditionsAnalystFindings` (2 défs).
- `src/agents/tier3/schemas/conditions-analyst-schema.ts` (hors-runtime) : `score` optionnel + `dimensionAssessment` ajouté (`.optional().default([])`, cohérence schéma/type/prompt — flag Codex).
- `src/agents/tier3/synthesis-deal-scorer.ts` (−11) : fuite LLM `extractConditionsData` retirée (`**Score conditions: X/100**` + breakdown, désormais morte ; findings/valuation/etc. verbaux conservés).
- `src/agents/orchestrator/persistence.ts` + `src/app/api/deals/[dealId]/terms/route.ts` : `Deal.conditionsScore` neutralisé (`null` ; colonne droppée en P5) ; cache `conditionsAnalysis` verbal conservé.
- `src/components/deals/conditions/types.ts` : `ScoreBreakdownItem` (weight/score) → `DimensionAssessmentItem` (criterion/justification verbal) ; `conditionsBreakdown` retypé.
- `src/services/terms-normalization.ts` : `conditionsBreakdown` lit `findings.dimensionAssessment` puis **fallback legacy** `score.breakdown.map(criterion, justification)` pour snapshots historiques pré-P4.
- `src/components/deals/conditions/conditions-analysis-cards.tsx` : prop `breakdown` retypé `DimensionAssessmentItem[]` (rendu criterion + justification inchangé — G4 « justifs par critère conservés »).
- `src/agents/__tests__/conditions-analyst-e2e.test.ts` (−49) : assertions `data.score.*` retirées (scoreless), 2 tests renommés.

### Description
**Chantier dé-scorisation, P4-b2 (BORNÉE, gaté Codex APPROVE après 2 REQUEST_CHANGES productifs).** 2e producteur P4. Retrait de la **note conditions** (`score.value`/grade) + neutralisation `Deal.conditionsScore`. **Fourche tranchée par Codex = Option B** : la décision G4 « justifs par critère conservées » (hero card) imposait de préserver les justifications verbales qui vivaient dans `score.breakdown` → déplacées vers `findings.dimensionAssessment` (verbal pur), avec fallback legacy `score.breakdown` pour les snapshots historiques. Carve-out du contrat partagé (comme synthesis-deal-scorer en P4-a). **Différé LARGE/P5** : `structuredAssessment.trancheAssessments[].score` (sous-note par tranche, non restituée depuis G4). **Pas de bump `STEPWISE_GRAPH_VERSION`** (contrat évalué à la PRODUCTION, pas au replay ; lecteurs legacy préservés). tsc 0 ; conditions e2e + transform + prompt.guard + schemas + 2 pipelines + doctrine guards = 104+ verts ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-b1 — team-investigator : retrait des notes par fondateur

### Fichiers
- `src/agents/tier1/team-investigator.ts` (−58) : retrait de `founderProfiles[].scores.*` (domainExpertise / entrepreneurialExperience / executionCapability / networkStrength / overallFounderScore = note d'appréciation agrégée par fondateur) — type `LLMTeamInvestigatorResponse`, schéma de sortie du prompt, exemple JSON, ligne du MAUVAIS exemple, et le bloc transform `scores:(()=>{capScore…})()`. Prompt : échelle chiffrée « Score domainExpertise 0-100 » → guidance qualitative (reflétée dans strengths/concerns) ; section « Impact sur les scores » → « Impact sur l'évaluation ». Métriques internes : les 4 dérivées `unit:"score"` (domain_expertise / entrepreneurial_experience / execution_capability / network_strength) + le helper `avg()` retirés ; **conservées** les observables `linkedin_verified_ratio` (%) et `successful_exits` (count). **Top-level `data.score.value` CONSERVÉ** (score agent des 15 standardStructuredAgents = LARGE-déféré per Codex ; désormais dérivé des 2 métriques observables + fallback breakdown LLM).
- `src/agents/types.ts` + `src/agents/type-modules/tier1.ts` : champ `scores` retiré de `FounderProfile` / `TeamInvestigatorFindings`.
- `src/agents/tier3/devils-advocate.ts` (−10) : **fuite LLM** retirée — le bloc qui poussait « name: Score N/100 » dans le contexte de challenge (devils-advocate reçoit déjà les founderProfiles complets via previousResults).
- `src/agents/orchestrator/persistence.ts` (−2) : `scores: profile.scores` retiré de `analysisData` (merge `verifiedInfo`) + champ de type `scores?`.
- `src/components/deals/team-management.tsx` (−9) : interface morte `AnalysisScores` + champ `scores?` retirés (rendering déjà retiré en `c63620d`).

### Description
**Chantier dé-scorisation, P4-b1 (périmètre BORNÉE gaté Codex APPROVE).** Premier producteur du périmètre P4 borné. Retrait des notes 0-100 PAR FONDATEUR (appréciation agrégée bannie même interne) + la fuite vers le contexte LLM de devils-advocate + persistence + UI/types. **Laissé intentionnellement** : top-level `data.score.value` de l'agent (carry interne transitoire non rendu, retrait dans le chantier LARGE/P5 per Codex) ; `TEAM_INVESTIGATOR_CRITERIA` (config de pondération du score déféré ; `calculateAgentScore` tolère déjà les métriques absentes) ; PDF `domainExpertise?:string` (dead rendering préexistant, lit un champ inexistant) ; context-engine `networkStrength` enum qualitatif (autre système). **Pas de bump `STEPWISE_GRAPH_VERSION`** (ni topologie ni step-id ni clé durable changés ; contrat partagé toujours satisfait). tsc 0 ; sequential-pipeline + agent-pipeline 45/45 ; suite complète verte dans le payload gate.

---
## 2026-06-15 — Dé-scorisation — P4-a — synthesis-deal-scorer : retrait de la PRODUCTION de note de deal

### Fichiers
- `src/agents/tier3/synthesis-deal-scorer.ts` (cœur, −296/+67) : `transformResponse` ne produit plus `overallScore` / `confidence` / `dimensionScores` / `scoreBreakdown` / `comparativeRanking`. Supprimés : extraction dimensionScores + calcul overallScore pondéré, caps de cohérence (Rule 1 skepticism, Rule 2 critical), meta-gate thèse (Rule 4), pénalité de score (Rule 3 ; le **relevé** `partialAgents` est conservé pour `keyWeaknesses`), confidence + pénalité, `patchScoreInText`, helper mort `normalizeDimensionWeight`. `execute()` : un SEUL appel LLM (retry « dimensions » retiré, sans objet en scoreless) + **bloc F37 retiré** (percentile DE SCORE via `percentile-calculator` → écriture comparativeRanking + confidence = note de deal bannie). Rationale restituée scrubbée via `stripDealScoreMentions` (remplace le patch). `buildSignalContribution(orientation, context)` ne porte plus `score`. Type `SynthesisDealScorerData` : 5 champs de score rendus **OPTIONNELS** (compat durable snapshots en vol + historiques + lecteurs défensifs `?? null`). Orientation 100% scoreless (`finalVerdict` + `signalProfile`) inchangée.
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : mêmes 5 champs de score rendus OPTIONNELS dans les copies dupliquées de `SynthesisDealScorerData`.
- `src/agents/base-agent.ts` : contrat de sortie synthesis SCORELESS. `getRequiredOutputContractFields` → `["verdict", "investmentRecommendation", "keyStrengths", "keyWeaknesses", "criticalRisks", "signalProfile"]` (overallScore/dimensionScores retirés). Bloc de validation synthesis : check structurel `signalProfile.orientation` + `dimensionCoverage` (au lieu de overallScore/dimensionScores/comparativeRanking). Sinon CONTRACT_BROKEN → `success:false`.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-transform.test.ts` : invariant `signalContribution.score === overallScore` supprimé (les deux champs n'existent plus).
- `src/agents/tier3/__tests__/synthesis-deal-scorer-llm-budget.guard.test.ts` : `MAX_IN_EXECUTE_CALLS` 2→1 ; assertion count `>=2`→`toBe(1)` (retry retiré) ; doc/worst-case alignés (1×100s, F37 retiré).

### Description
**Chantier dé-scorisation, P4-a (retrait des scores producteurs, ordre additif).** La synthèse ne RESTITUE plus de note depuis P3 ; ici on retire sa **production** (1er producteur). Ordre ADDITIF : champs de note rendus optionnels (PAS supprimés du type) → snapshots stepwise en vol + analyses historiques + lecteurs défensifs (persistence `if (overallScore != null)`, score-extraction) compilent et tolèrent l'absence. La persistence (`Deal.*Score` gatée sur `overallScore != null`) **skippe** naturellement le write pour les nouveaux runs. **Pas de bump `STEPWISE_GRAPH_VERSION` (reste 4)** : ni topologie ni step-ids changés ; le contrat de sortie n'est validé qu'à la PRODUCTION (pas au replay du snapshot). Clé durable `"synthesis-deal-scorer"` inchangée. Gain collatéral : 1 appel LLM au lieu de 2. **Différé (micro-étapes P4 suivantes)** : prompt LLM (instruit encore score/dimensions, ignorés), purge finale des champs optionnels + write persistence inerte, retrait `percentile-calculator` (P5), type mort `SynthesisDealScorerDataV2`. tsc 0 ; suite unit complète 4515 passed / 9 skipped / 0 failed.

---
## 2026-06-15 — Dé-scorisation — sweep complétude — 3 surfaces (analysis-complete-view, deck-coherence, board thesis-debate)

### Fichiers
- `src/components/deals/analysis-complete-view.tsx` (vue complète par agent, rendue par analysis-panel + analysis-preview-tabs) : fonction `getScore` + badge `{value}/100 · {grade}` par agent **retirés**. `score` déjà dans `hiddenKeys` (non listé en findings). Reste inchangé.
- `src/components/deals/deck-coherence-report.tsx` (rapport cohérence deck, via analysis-panel) : header — `GradeBadge` (reliabilityGrade A-F) + badge `coherenceScore/100` retirés ; composant `GradeBadge` + `GRADE_CONFIG` orphelins retirés. Body conservé : `RecommendationBanner` (verbal) + compteurs issues critical/warning/info (observables) + liste issues ; auto-déplie si criticalIssues>0. `coherenceScore`/`reliabilityGrade` restent dans le type producteur (P4).
- `src/components/deals/board/thesis-debate-view.tsx` (Board Round 0) : `thesisSolidityScore/100` par membre (barre+nombre) + `avgSolidity/100` retirés (axe Solidité en nombre = anti-doctrine, axe-2 doit être verbal). Badge `agreement` (strong_agree…strong_disagree, verbal) conservé par membre ; description → « Thèse débattue par N membres IA, désaccords et critiques exposés » (on-doctrine Board). justification/weakestAssumption/majorCritique/recommandations conservés. Helper `solidityColor` orphelin retiré. `thesisSolidityScore` reste dans le type producteur (P4).

### Description
**Sweep complétude** : 3 surfaces de restitution de note NON listées dans le RESTE du relais. Producteurs inchangés (P4, ordre additif). **Gate Codex APPROVE.** tsc 0 ; board-orchestrator 2 + doctrine guards 27 = 29 verts. Restitutions écran restantes à classer : thesis « Confiance /100 » (×4 — allowlist per-item confidence vs note ?), react-trace + extraction-audit (qualité extraction/confiance dev = allowlist probable).

---
## 2026-06-15 — Dé-scorisation — sweep complétude — team-management (scores fondateurs)

### Fichiers
- `src/components/deals/team-management.tsx` : carte fondateur (onglet Équipe) dé-scorée. Avatar : nombre `overallFounderScore` (coloré) → initiale du nom. Grille 4 `ScoreMiniBar` (Domain/Startup XP/Execution/Network /100) **supprimée**. Caveat provenance « Scores estimés depuis le deck » → « Analyse estimée depuis le deck » (sorti du gate scores). Retirés : composant `ScoreMiniBar`, helpers locaux `getScoreColor`/`getScoreBg`, icônes Target/TrendingUp/Zap/Network, consts `scores`/`overallScore` (orphelins). **Conservé verbal natif** : strengths/concerns/redFlags/background/highlights. **Carry interne (Option B, → P4)** : interface `AnalysisScores` + `VerifiedInfo.scores` (data shape team-investigator, plus lue en rendu).

### Description
**Découverte sweep complétude** : surface de restitution de scores NON listée dans le RESTE du relais. Producteur `team-investigator` inchangé (P4, ordre additif). **Gate Codex APPROVE.** tsc 0 ; doctrine guards 27 verts. Sweep en cours : restent analysis-complete-view (score/100·grade), deck-coherence-report (coherenceScore/100), board thesis-debate (avgSolidity/100) ; thesis « Confiance /100 » à classer (allowlist per-item vs note).

---
## 2026-06-15 — Dé-scorisation — étape G4-b — cleanup composants + helpers de score orphelins

### Fichiers
- `src/components/deals/verdict-panel.tsx` : **supprimé** (composant MORT, 0 importeur ; panneau de score ScoreRing + dimensions + VERDICT_CONFIG).
- `src/components/ui/score-ring.tsx` : **supprimé** (orphelin après dé-scorisation G4 de conditions-analysis-cards ; seul consumer restant = verdict-panel supprimé).
- `src/lib/ui-configs.ts` : retrait section « Score Thresholds » — `getScoreColor` + `getScoreLabel` (ancienne échelle mono-axe Excellent/Solide/…) + `getScoreBarColor` (importeurs = verdict-panel + score-ring seulement). Commentaire périmé « verdict-panel » → « tier3-results & analysis-v2 ».
- `src/lib/format-utils.ts` : retrait `getScoreColor` (0 importeur, team-management a sa version locale) + `getScoreBadgeColor` (0 ref, orphelin depuis suppression score-badge étape D = le NIT du plan).

### Description
Cleanup des vestiges de score rendus orphelins par la dé-scorisation. Tous vérifiés orphelins par `git grep` avant suppression. **Hors-scope laissé (Karpathy)** : `team-management.tsx` garde `getScoreColor`/`getScoreBg` LOCAUX (scores fondateurs `overallFounderScore`/`domainExpertise`…) = surface de score SÉPARÉE vivante → sweep de complétude avant P4. Le source-guard `orientation-solidity-display.test.ts` référence `getScoreColor`/`getScoreLabel` comme chaînes BANNIES (pas de consommation) → non cassé. **Gate Codex APPROVE.** tsc 0 ; doctrine-guard 10 + doctrine-runtime-guard 17 + orientation-solidity 14 + ui-configs 71 verts.

---
## 2026-06-14 — Dé-scorisation — étape G4 — onglet Conditions entièrement scoreless (4 sous-onglets + 2 routes)

### Fichiers
- `src/components/deals/conditions/conditions-analysis-cards.tsx` : `ConditionsHeroCard` dé-scoré — retrait `ScoreRing` (note /100), `getVerdictConfig(score)` (verdict verbal « Conditions favorables/défavorables » **dérivé du score** = anti-pattern orientation-depuis-score-caché), badge `getScoreLabel`, `MiniBar` + nombres de breakdown par dimension. Layout 2 colonnes → 1 colonne. **Conservé verbal natif** : `narrative.oneLiner` (titre), compteur red flags (observable), justification qualitative par critère (criterion + justification, sans nombre ni poids), valuation quick view (verdict + percentile observable + rationale). `StructuredAssessmentCard` : `ta.score/100` + barre par tranche retirés (label + assessment + risks conservés). Imports `getScoreColor/getScoreBarColor/getScoreLabel/ScoreRing` retirés.
- `src/components/deals/conditions/conditions-tab.tsx` : prop `score` retiré du hero ; sentinel de présence d'analyse `conditionsScore` → `conditionsAnalysis` (montre la dernière analyse valide même après re-run échoué) ; `isEmpty` idem ; 2 textes empty-state dé-scorés.
- `src/components/deals/conditions/version-timeline.tsx` (Historique) : badges `Score: X/100` + delta `pts` retirés ; type `VersionWithDelta` (deltaScore) supprimé → lit `TermsVersionData`.
- `src/components/deals/conditions/percentile-comparator.tsx` (Comparateur) : notes `protections.score`/`governance.score` /100 + barres + `getScoreColor` local retirés → **checklist OBSERVABLE present/absent** (`TermsChecklist`) des protections/gouvernance saisies au formulaire. Conservé : valuation percentile P25/P50/P75, dilution médiane, instrument standard (observables).
- `src/app/api/deals/[dealId]/terms/versions/route.ts` : dérivation `deltaScore` (delta de note) retirée ; `conditionsScore` conservé en payload (carry interne, → P5).
- `src/app/api/deals/[dealId]/terms/benchmarks/route.ts` : tally `protectionScore`/`governanceScore` (0-100) → listes `items` present/absent dérivées des mêmes booléens observables du formulaire (terms null → items vides → « Non évalué »).

### Description
Directive Sacha « dégager tous les scores » + leçon défaut = SUPPRIMER. Toute la surface **Conditions** (4 sous-onglets) ne restitue plus de note de deal. Garde-fou respecté : aucune orientation dérivée d'un vieux score (suppression pure, contenu verbal natif conservé). Agent producteur `conditions-analyst` (score interne) + colonne DB `conditionsScore` **inchangés** = P4/P5 (ordre additif) ; les `conditionsScore` restants côté route = écritures DB + lecture producteur, jamais restitués écran. **Gate Codex APPROVE après 1 REQUEST_CHANGES** (Codex a flaggé version-timeline = même surface non dé-scorée ; corrigé + percentile-comparator dé-scoré proactivement par le même principe). Non-bloquant noté par Codex : select `globalScore` mort dans `/terms` GET → cleanup sweep P5/carry. tsc 0 ; 117 tests verts (doctrine-guard, doctrine-runtime-guard, signal-profile, orientation-solidity-display, conditions-analyst ×3).
