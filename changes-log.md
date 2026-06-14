# Changes Log - Angel Desk

---
## 2026-06-14 — Dé-scorisation P3-b — Cohérence du deck verbale dans analysis-v2 (retrait du coherenceScore /100)

### Fichiers
- `src/lib/ui-configs.ts` : NOUVEAUX `DECK_COHERENCE_VALUES` (strong/moderate/weak/incoherent) + `DECK_COHERENCE_LABELS` (Forte / Modérée / Faible / Très faible). Restitution verbale, aucun nombre.
- `src/components/deals/analysis-v2/lib/selectors.ts` : NOUVEAU helper `deckCoherenceBand(score)` (seuils 80/60/40). `buildDecisionStripModel` émet désormais `coherenceBand` (bande verbale) au lieu de `coherenceScore` (nombre). Le nombre brut reste interne (lu par `solidity-aggregator` pour dériver la solidité — inchangé).
- `src/components/deals/analysis-v2/decision-strip.tsx` : le card « Cohérence du deck » affiche `DECK_COHERENCE_LABELS[band]` (plus de `X / 100`) ; ton couleur dérivé de la bande (mapping identique aux anciens seuils).
- `src/components/deals/analysis-v2/__tests__/doctrine-runtime-guard.test.ts` : guard — `buildDecisionStripModel` n'expose plus `coherenceScore`, émet une bande verbale, libellé sans `/100` ni chiffre ; bande nulle quand le score est absent.

### Description
Cible explicite du plan (le `coherenceScore/100` repéré dans analysis-v2). Transformation nombre → verbal sur la surface canonique. Le score de cohérence du deck reste autorisé en mécanique INTERNE (il alimente la dérivation de la solidité des preuves) mais n'est plus jamais RESTITUÉ. Aucune autre surface ne consommait `model.coherenceScore` (vérifié : seul `decision-strip`). Aucune topologie de graphe durable touchée → PAS de bump `STEPWISE_GRAPH_VERSION` (reste 4). Backlog P3/P4 noté par le gate : le libellé coverage `Score de synthèse` dans `TIER3_EXPECTED` (selectors.ts) reste une terminologie score-oriented (hors card cohérence). Gate Codex : APPROVE (sans REQUEST_CHANGES). tsc 0 ; suite unit 4508 passed (+2) / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P3-a — Scrub des notes de deal du contexte LLM du chat (première micro-étape P3)

### Fichiers
- `src/agents/chat/deal-chat-agent.ts` : retrait du bloc `## Scores d'analyse` (5 notes /100 : Score global / Équipe / Marché / Produit / Financials depuis `deal.*Score`). Retrait des deux autres injections `**Score**: X/100` (résumés agents `summary.score` + résultats agents `result.score`). `result.fullData` (sérialisé en JSON brut dans le prompt) passe désormais par `scrubAgentScoreData(result.agent, …)` avant `JSON.stringify` (sinon overallScore/grade/dimensionScores réinjectés). Conservé (allowlist) : confiances en %, confiance de thèse /100, benchmarks P25/Median/P75, bloc MÉTRIQUES QUANTIFIÉES (`scoredFindings` = métriques observables).
- `src/services/signal-profile/index.ts` : NOUVEAU helper `scrubAgentScoreData(agentName, data)` — scrub d'UN SEUL `data` agent (synthesis = scrub profond `scrubSynthesisScoreData` ; autres = `AGENT_DEAL_NOTE_KEYS`). Pur+immutable. `scrubAllScoresForLLMContext` (P2-c) refactoré pour le réutiliser (DRY, source unique).
- `src/services/signal-profile/__tests__/signal-profile.test.ts` : NOUVEAU describe `scrubAgentScoreData` (synthèse scrub profond, agent non-synthèse clés premier niveau, immutabilité, entrée non-record).

### Description
Première micro-étape de P3 (consumers → profil scoreless). Le chat était explicitement déféré de P2-c. Achève le scrub des contextes LLM (P2-c : board/mémo/summary → +chat). Le grep initial « Score global » n'avait capté qu'une des trois injections ; le gate Codex (REQUEST_CHANGES round 1) a fait remonter `summary.score`, `result.score` et la sérialisation brute de `fullData` — toutes corrigées round 2. Changement de chaîne de prompt + helper pur uniquement, aucune topologie de graphe durable touchée → PAS de bump `STEPWISE_GRAPH_VERSION` (reste 4). Périmètre chirurgical : champs de type `*Score` sur les interfaces d'entrée du chat conservés (miroir DB, retrait = sous-bloc read-model / P5) ; le plumbing read-model qui porte `globalScore` (route chat → agent) reste. DÉFÉRÉ comme item P3 séparé : `src/lib/live/context-compiler.ts` (Live Coaching, feature-flagged) qui dérive `signalProfile = getSignalProfile(globalScore)` (anti-pattern score caché, garde-fou #1) + injecte le même bloc `## Scores d'analyse` en /100 — rework Live à traiter avant de clore P3. Gate Codex : REQUEST_CHANGES (round 1) → APPROVE (round 2). tsc 0 ; suite unit 4506 passed (+4) / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P2-d.2 — Budget deadline-aware du step synthesis-deal-scorer (fix racine boucle 300s) — P2 COMPLET

### Fichiers
- `src/agents/tier3/synthesis-deal-scorer.ts` : NOUVEAU const module `SYNTHESIS_LLM_CALL_OPTIONS = { timeoutMs: 100_000, disableModelFallback: true, maxRetries: 1 }` passé aux DEUX appels `llmCompleteJSON<LLMSynthesisResponse>` (1er + retry in-execute conditionnel). Constructeur `config.timeoutMs` 300000 → 220000.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-llm-budget.guard.test.ts` : NOUVEAU source-guard (const borné présent ; tous les appels `llmCompleteJSON<LLMSynthesisResponse>` bornés ; config 220000 < plafond Vercel 300000 ; marge Vercel ≥ 60s ; pire cas 2 appels in-execute < config).

### Description
Dernier sous-bloc de P2-d → **P2 EST COMPLET**. Fix racine de la boucle 300s du step de synthèse. Mécanisme (vérifié dans base-agent.ts) : `run()` enveloppe `execute()` dans `withTimeout(config.timeoutMs)` (l.415) et NE re-throw PAS — il retourne `success:false` (catch l.455-494). La boucle prod (`cmq9lg9un`) venait de `config.timeoutMs == 300000 == plafond Vercel` : le kill plateforme gagnait la course contre le `withTimeout` gracieux, mid-write du snapshot → step tué avant écriture → retry Inngest → boucle. Avec config 220s < 300s, le timeout gracieux gagne, `success:false` est rendu et le snapshot s'écrit bien avant 300s. Bornage PAR APPEL (100s) + `disableModelFallback:true` (coupe le failover cross-modèle long, router.ts:856 = une génération complète de plus) + `maxRetries:1` (retry router same-model borné). Pire cas execute ~210s (2×100s + F37 percentile Promise.race 10s) < config 220s ; marge Vercel 80s pour rehydrate+write. Durabilité : `config.timeoutMs` n'alimente que le wrapper run(), le défaut per-call timeout et le label `promptVersion` des traces — absent du chemin durable (grep `promptVersion`/`timeoutMs` dans orchestrator/orchestration/inngest = vide) → step ids/topologie/clé durable inchangés → PAS de bump `STEPWISE_GRAPH_VERSION` (reste 4). Volontairement NON touché (scope ultérieur) : `config.maxRetries:2` (mort sur ce chemin — non lu par run() ni les helpers LLM ; levier effectif = per-call), retry in-execute (retrait P4 avec dimensionScores), bloc F37 percentile score-based (P5). Gate Codex : APPROVE (sans REQUEST_CHANGES). tsc 0 ; suite unit 4502 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P2-d.1 — Retrait de l'exception 140k de budget documentaire (synthesis / memo / devils)

### Fichiers
- `src/agents/base-agent.ts` : `getGlobalDocumentContextBudget()` — retrait de l'exception `return 140_000` qui s'appliquait à synthesis-deal-scorer / memo-generator / devils-advocate. Ces 3 agents de synthèse retombent sur `GENERAL_DOCUMENT_CONTEXT_BUDGET` (120_000). Exception `financial-auditor` (150_000) préservée.
- `src/agents/__tests__/document-context-budget.guard.test.ts` : NOUVEAU source-guard — l'exception 140k a disparu, plus de special-case synthesis/memo/devils, financial-auditor 150k conservé, fallback GENERAL.

### Description
Premier sous-bloc de P2-d (budgets deadline-aware, fix racine de la boucle 300s du step de synthèse — post-mortem `cmq9lg9un`). L'exception 140k autorisait un contexte documentaire géant (prompt synthèse ~137k) qui, combiné au plafond Vercel 300s, alimentait la boucle. Les agents de synthèse exploitent surtout `previousResults` (sorties des autres agents), pas le corpus brut → budget général suffisant. memo déjà borné 120s LLM + fallback déterministe (0109961), devils déjà `timeoutMs 120000` + score-free (P2-b). Aucun changement de forme du graphe stepwise → PAS de bump `STEPWISE_GRAPH_VERSION` (reste 4). Gate Codex : APPROVE (sans REQUEST_CHANGES). tsc 0 ; base-agent + tier3 221 tests verts.

---
## 2026-06-14 — Dé-scorisation P2-c — Scrub des notes de deal dans les contextes LLM (board / mémo / summary)

### Fichiers
- `src/services/signal-profile/index.ts` : NOUVELLE fonction `scrubAllScoresForLLMContext(results)` — scrub COMPLET de tous les agents (synthesis = scrub profond `scrubSynthesisScoreData` ; autres = retrait des clés de note de premier niveau `AGENT_DEAL_NOTE_KEYS` : overallScore/globalScore/score/grade/scoreBreakdown/*Score Tier1/technicalScore/sectorScore/sectorFitScore/overallSkepticism/consistencyScore). Pure+immutable. `scrubScoresFromResults` (P1, synthesis-only) inchangée. confidence d'agent conservée.
- `src/agents/board/board-orchestrator.ts` : `scrubAllScoresForLLMContext(analysisResults)` avant construction de `agentOutputs` (point unique) — le board délibère sur l'orientation, jamais sur une note.
- `src/agents/board/context-compressor.ts` : `extractAgentSummary` retire la ligne « Signal quantitatif secondaire » (le fallback `obj.confidence` survivait au scrub) ; `buildTier3Summaries` header synthesis renommé « Synthèse — orientation & signaux ».
- `src/agents/tier3/memo-generator.ts` : `extractTier3Insights` (retrait Score final/Grade/Scepticisme/Consistance), `formatAgentInsight` (retrait Score: X/100 Tier1), `formatSectorExpertInsight` (retrait Sector Fit Score ; benchmarks observables conservés), `normalizeResponse` fallback teamAssessment (retrait « Score équipe /100 » restitué). Orientation/verdict/concerns/benchmarks conservés.
- `src/agents/orchestrator/summary.ts` : 4 fonctions — retrait de toutes les lignes /100 (scores par dimension Tier1, Score Final, Scepticisme, Score Sectoriel, Score Global). `analysis.summary` alimente le chat LLM (chat-context:603, context-retriever:1148) → contamination réelle. Orientation (Profil/Signal/verdict labels) + rationale + top concerns + fit qualitatif + insights observables conservés.
- Tests : `signal-profile.test.ts` (+4 scrubber), `context-compressor.test.ts` (maj : plus de « Signal quantitatif secondaire »), NOUVEAU `memo-generator-llm-context-descoring.test.ts` (3 extracteurs mémo prouvés sans /100 même avec producteurs scorés).

### Description
P2-c du chantier dé-scorisation — condition dure #1 du gate P1 : après la synthèse scoreless (P2-a), memo/summary/board réinjectaient encore des notes de deal dans les contextes LLM (overallScore, grade, devils overallSkepticism/100, Tier1 dimension /100, consistencyScore/100, sectorFitScore/100). Mécanisme adapté : scrubber central pour le board (sérialisation générique d'objets), édition directe des templates pour summary/mémo (le /100 y est du scaffolding hardcodé). Ordre additif : producteurs inchangés (champs retirés en P4). Gate Codex : APPROVE après 1 REQUEST_CHANGES (fuites Tier1/Tier2 dans le contexte mémo via extractTier1/2Insights — corrigées + test dédié). Déféré : chat deal.globalScore=P3, score-extraction=P5, findings.*Score profonds=P4. tsc 0 ; suite unit 4492 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P2-b — Retrait des scores des dérivations d'orientation CD + CA (Tier 3)

### Fichiers
- `src/services/signal-profile/derive.ts` : NOUVELLE fonction pure `orientationFromAgentIntensity(intensity)` (mapping per-agent SANS score : critical→alert_dominant, high→vigilance, elevated→contrasted, low→favorable ; aligné sur la convention UI `intensityToOrientation` + agents Tier 1). Réexportée via `index.ts`.
- `src/agents/tier3/contradiction-detector.ts` : `deriveSignalContributionFromIntensity` ne prend plus `consistencyScore` (tiebreak `score>=80→favorable` retiré) → orientation via `orientationFromAgentIntensity`. Import `Tier3Orientation` devenu mort retiré.
- `src/agents/tier3/conditions-analyst.ts` : DEUX retraits de score — (a) `deriveSignalContributionFromIntensity` ne prend plus `scoreValue` (tiebreaks `score>=85/70/55` retirés) ; (b) `deriveSignalIntensityFromConditions` ne prend plus `scoreValue` (seuils `score<40/<60` qui escaladaient l'intensité retirés — sinon l'orientation restait score-dérivée VIA l'intensité, même motif d'incomplétude que le canal action bloqué en P2-a). Intensité désormais red-flag-counts-only. Import `Tier3Orientation` mort retiré. `scoreValue` conservé (champ `score.value` + justification — retrait = P4).
- `src/agents/tier3/__tests__/conditions-analyst-transform.test.ts` + `contradiction-detector-transform.test.ts` + `src/services/signal-profile/__tests__/derive.test.ts` : tests mis à jour pour les invariants score-free (score ignoré → intensité/orientation pilotées par red flags ; `orientationFromAgentIntensity` couvert).

### Description
P2-b du chantier dé-scorisation. L'orientation per-agent CD/CA (affichée dans les cartes analysis-v2) ne dérive plus d'aucun score — ni via tiebreak direct, ni via l'intensité (CA). Modèle per-agent (axe étroit, low→favorable) distinct du modèle DEAL de la synthèse (P2-a, positif strict). Conséquences validées par Codex : (B) `alertSignal.recommendation` CA n'escalade plus sur un score bas sans red flag (score<40 sans flag → PROCEED au lieu d'INVESTIGATE_FURTHER) — l'alerte vient des red flags, plus d'une note ; (C) CA ne peut plus émettre `very_favorable` (réservé à la synthèse). devils-advocate déjà score-free (dérive de `riskPosture`). Tier1/Tier2 inchangés (P4). Gate Codex : APPROVE (A-D validées ; nit comment stale corrigé). tsc 0 ; suite unit 4485 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P2-a — Synthèse SCORELESS : orientation dérivée sans aucun score + AnalysisSignalProfile

### Fichiers
- NOUVEAU `src/services/signal-profile/derive.ts` : dérivation PURE et SANS score — `deriveSynthesisSignalIntensity(criticalCount, highCount)` (counts-only) ; `deriveScoreIndependentOrientation({intensity, favorableSignalCount, coverage, evidenceSolidity})` → enum interne 5 valeurs (modèle POSITIF explicite : favorable exige ≥2 signaux favorables + couverture ≥2/3, very_favorable ≥4 + solidité non contradictoire ; l'absence de red flags ne suffit jamais) ; `decideNotExploitable` (couverture explicite : solidité insufficient OU 0 dimension couverte). Réexporté via `index.ts`.
- `src/agents/tier3/synthesis-deal-scorer.ts` : RETIRÉ `scoreBasedVerdict` (dérivation orientation←score `if score>=85…`) + alias `SignalVerdict` mort + tout le parser d'orientation piloté LLM (`validActions`/`actionMapping` STRONG_PASS→…/`rawAction`/`mappedAction` + coherence-enforcement partielle). `finalVerdict` vient maintenant de `deriveScoreIndependentOrientation` (red flags CONSOLIDÉS cross-agent + couverture par dimension + evidence-solidity). `investmentRecommendation.action` = `finalVerdict` DÉTERMINISTE (plus de canal d'orientation concurrent piloté LLM — recadrage gate Codex). Nouveau champ produit `signalProfile: AnalysisSignalProfile` (orientation 4-val doctrine via `toDoctrineOrientation`, evidenceSolidity, dominantSignals favorables+défavorables sourcés, dimensionCoverage 12 dims, criticalRisks). Helpers ajoutés : `buildRedFlagDedup` (refactor partagé extrait de `extractTier1RedFlags`), `buildDimensionCoverage`, `buildFavorableSignals`, `buildUnfavorableSignals`, `buildCriticalRiskRefs`. Champs de score legacy (overallScore/dimensionScores/scoreBreakdown/comparativeRanking) CONSERVÉS (ordre additif — retrait en P4), ne pilotent plus l'orientation.
- NOUVEAU `src/services/signal-profile/__tests__/derive.test.ts` : 16 tests purs (intensité counts-only, branches défavorable/positive, anti « compteur d'alertes inversé », not_exploitable conservateur).
- `src/agents/tier3/__tests__/synthesis-deal-scorer-transform.test.ts` : +invariants P2 — POISONED SCORE (score 99 + red flag CRITICAL → orientation `alert` ; score 1 + forces + couverture → `favorable` ; le score est ignoré), modèle positif, signalProfile (coverage 12 dims, criticalRisks, dominantSignals, taxonomie 4-val, not_exploitable). Blocs legacy-parser réécrits : orientation LLM tolérée en entrée, JAMAIS préservée en sortie.
- `src/agents/tier3/__tests__/synthesis-deal-scorer-prompt.guard.test.ts` : guard RETOURNÉ — exige l'ABSENCE de `actionMapping` + présence de `action: finalVerdict` (avant : exigeait la présence du parser legacy).

### Description
P2-a du chantier dé-scorisation (`PLAN-DESCORING.md`, le cœur). Fix racine doctrinal : `synthesis-deal-scorer.ts` dérivait l'orientation DU score (`if score>=85 return very_favorable`) — l'orientation était un score caché. Désormais l'orientation (`verdict` + `investmentRecommendation.action` + `signalProfile.orientation`) dérive d'un `finalVerdict` UNIQUE, score-indépendant par construction (la fonction pure ne prend aucun score). Ordre ADDITIF : producteurs Tier1/Tier2 inchangés, champs score legacy conservés. Durabilité : clé durable `synthesis-deal-scorer` inchangée, topologie/step-ids inchangés → pas de bump `STEPWISE_GRAPH_VERSION` (=4) ; bi-reader P1 lit les vieux snapshots. Gate Codex : 1 REQUEST_CHANGES (action restait un canal d'orientation LLM user-facing via RecommendationBadge/summary/memo) → corrigé (action=finalVerdict, parser LLM retiré) → APPROVE. tsc 0 ; suite unit 4480 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Dé-scorisation P1 — Fondation de compatibilité scoreless (additif strict, 0 fichier existant modifié)

### Fichiers
- NOUVEAU `src/services/signal-profile/index.ts` : (1) `DoctrineOrientation` 4 valeurs (clés EN + libellés FR `DOCTRINE_ORIENTATION_CONFIG`) + `toDoctrineOrientation()` mapper canonique UNIQUE 5→4 au boundary (collapse verrouillé vigilance→contrasted ; `not_exploitable` seulement via `opts.notExploitable` ; switch exhaustif `never` → throw sur valeur corrompue, jamais de fallback flou ni dérivation depuis score) ; (2) `AnalysisSignalProfile` contrat de sortie SCORELESS (orientation doctrine, evidenceSolidity réutilise le type 5 valeurs ui-configs, dominantSignals[] modèle POSITIF, dimensionCoverage[], criticalRisks: CriticalRiskRef[] ; aucun champ numérique de note) ; (3) `scrubSynthesisScoreData`/`scrubScoresFromResults` retrait des champs de note de deal (overallScore/score/grade/scoreBreakdown/dimensionScores[].score+weightedScore/comparativeRanking percentiles/signalContribution.score+scoreNote), pur+immutable+idempotent ; (4) `readDoctrineOrientation` bi-reader durable old/new (profil scoreless prioritaire, sinon verdict legacy mappé ; JAMAIS dérivé d'un score).
- NOUVEAU `src/services/signal-profile/__tests__/signal-profile.test.ts` : 25 tests (mapper, scrubber immutabilité/idempotence/invariant "aucun champ de note sérialisé", bi-reader durabilité old-snapshot + preuve "jamais dérivé d'un score").

### Description
P1 du chantier dé-scorisation (`PLAN-DESCORING.md`). FONDATION PURE : primitives construites + testées, AUCUN câblage runtime (zéro changement de comportement). S'aligne sur la fondation "scoring 2 axes" Phase A/2 existante (Tier3SignalContribution, EVIDENCE_SOLIDITY_VALUES, orientation-solidity-display.tsx) sans la dupliquer. Gate Codex : APPROVE — découpage "fondation pure en P1, câblage en P2/P3" validé (décision (a)). **Conditions dures verrouillées pour P2/P3** : (1) centraliser le scrub runtime des contextes LLM (memo-generator injecte plusieurs scores — `scrubScoresFromResults` ne cible que synthesis-deal-scorer) ; (2) ne PAS émettre `low/strong/moderate` en evidenceSolidity sans décision doctrinale / mapper explicite ; (3) câblage scrubber+bi-reader = condition dure du gate P2/P3. tsc 0 ; suite unit complète 4457 passed / 9 skipped / 0 failed.

---
## 2026-06-14 — Doctrine (dé-scorisation P0) — « aucune note de deal restituée, jamais » + allowlist/banned-list

### Fichiers
- `docs-doctrine/angeldesk-strategic-pivot.md` : § 4 renommée « Restitution analytique — aucune note de deal, modèle à 2 axes verbal » (décision verrouillée 2026-06-12 datée + orientation dérivée des signaux/couverture/solidité, jamais d'un score caché) ; nouvelle § 4.1 allowlist/banned-list ; § 5 interdit durci (« Score global mono-axe » → « Toute note de deal restituée ») ; § 7 reframe Scoring ; date d'en-tête bumpée.
- `CLAUDE.md` : principe 4 « Dérivation déterministe, aucune note de deal restituée » ; section « Restitution analytique » miroir + allowlist/banned-list ; reframe Scoring ; ligne « État de l'implémentation » → PLAN-DESCORING 7 phases.

### Description
P0 du chantier dé-scorisation (`PLAN-DESCORING.md`). Verrouille en doctrine : (a) « aucune note restituée » remplace « score subordonné » ; (b) allowlist/banned-list PRÉCISE — bannir les PATTERNS de note (overallScore, score global, grade A-F, Deal Score, x/100 près de score/verdict/recommendation) sans bannir les nombres légitimes (ARR, valo, croissance, percentile de métrique observable, signalIntensity interne, confiance sur fait précis). Contrat qu'appliqueront les source-guards de P6. Pure documentation (markdown) — tsc/vitest inchangés. Gate Codex : APPROVE direct (doctrine sans ambiguïté, allowlist correcte ; note non bloquante : harmoniser plus tard « confiance de thèse » du plan avec la formulation canonique « confiance sur fait précis »).

---
## 2026-06-12 — Perf/Robustesse — Part 2 chantier memo-generator : LLM borné à 120s (fix racine de la boucle 300s)

### Fichiers
- `src/agents/tier3/memo-generator.ts` : `timeoutMs: 120_000` EXPLICITE sur l'appel `llmCompleteJSON` du mémo (avant : `config.timeoutMs`=180s). L'invocation Vercel du step memo porte AUSSI la réhydratation du snapshot stepwise (lecture multi-MB Neon) + l'écriture du snapshot suivant : 180s de LLM laissaient la somme dépasser 300s → kill Vercel → boucle Inngest → reaper. À 120s, le filet déterministe existant (`buildDeterministicFallback`) livre le mémo dégradé DANS l'invocation (complétion dégradée au lieu de boucler). Timeout global agent inchangé (180s = headroom du filet).
- NOUVEAU `src/agents/tier3/__tests__/memo-generator-llm-budget.guard.test.ts` : source-guards — budget explicite présent, < timeout agent, ≤ moitié du plafond Vercel.

### Description
Fix racine du post-mortem `cmq9lg9un…` (la Part 1 du 2026-06-12 est le filet money-critical côté watchdog). Risque qualité assumé (mémos GEMINI_PRO 32k > 120s → plus de fallbacks déterministes) : à surveiller post-merge via le taux de fallback memo ; escalade produit seulement si visible. Gate Codex : APPROVE direct (120s validé vs son diagnostic rehydrate+snapshot ; source-guard jugé proportionné). tsc 0, 180 tests tier3 verts.

---
## 2026-06-12 — Watchdog/Crédits — Salvage des analyses stepwise livrables + invariant refund/COMPLETED bidirectionnel (Part 1 du chantier memo-generator)

### Contexte
Post-mortem prod (analysis `cmq9lg9un…`) : le step memo-generator dépasse 300s/Vercel → boucle de retries Inngest → `reapIfStale` jetait + remboursait AVEUGLÉMENT une analyse 21/22 récupérable (synthèse aboutie dans le snapshot `STEPWISE:tier3-post`). Décisions produit Sacha : seuil de sauvetage = `synthesis-deal-scorer.success` dans le snapshot ; livraison dégradée NON remboursée (cohérent avec les analyses dégradées actuelles).

### Fichiers
- `src/agents/orchestrator/persistence.ts` : NOUVEAU `salvageAnalysisFromSnapshot` (flip ATOMIQUE RUNNING→COMPLETED gated sur statut, merge results + compteurs monotones ; une fois le flip commis le retour est `salvaged:true` même si les effets best-effort throw) ; `runPostCompletionEffects` extrait de `completeAnalysis` (byte-équivalent : blob cache + read-model H2 + signal I1 dégradé) et partagé ; `completeAnalysis` TERMINAL-SAFE (override FAILED → skip si déjà COMPLETED + write conditionnel `NOT COMPLETED`) ; `markAnalysisAsFailed` conditionnel (`NOT COMPLETED`).
- `src/lib/analysis-compensation.ts` : `trySalvageFromSnapshot` AVANT le flip FAILED dans `reapIfStale` (lecture snapshot en import dynamique ; placeholder `memo-generator` failed explicite ; résumé dégradé ; TOUTE erreur → fall-through vers FAILED+refund) ; outcome `'salvaged'` (SingleReapOutcome + retour `reapStaleAnalyses` additif) ; `resetDealStatusIfIdle` partagé refund/salvage.
- `src/lib/inngest.ts` : compensations TERMINAL-SAFE — catch deal-analysis relit le statut par `dispatchEventId` (COMPLETED → AUCUN refund) ; `compensateResumeFailure` relit `status` (idem) ; refund À LA DERNIÈRE TENTATIVE SEULEMENT (`isFinalAnalysisAttempt` aligné sémantique SDK `attempt + 1 >= maxAttempts`, fallback `ANALYSIS_FN_RETRIES`, NonRetriableError → immédiat) — ferme le sens inverse « refund à la tentative 0 puis le retry LIVRE » ; fallback cron reaper aligné (`salvaged`/`salvagedIds`).
- Tests : `stale-analysis-reaper.test.ts` +8 (salvage, seuils, throw snapshot → fall-through, courses, par-analyse `salvaged`) ; NOUVEAU `persistence-salvage.test.ts` (11 : flip gated, merge monotone, courses, completeAnalysis terminal-safe, markAnalysisAsFailed) ; `deal-analysis-inngest-stepwise.test.ts` +10 (compensations terminal-safe + finalité attempt/maxAttempts) ; monotone re-ciblé updateMany.

### Description
Invariant money-critical fermé dans LES DEUX SENS : « jamais refund+COMPLETED, jamais d'écrasement d'un livré ». Gap résiduel assumé (throw sans ligne Analysis à la tentative 0 + hard-kill à la finale = pas de refund par ce chemin — même profil que le double hard-kill préexistant, watchdog couvre dès qu'une ligne RUNNING existe). Gate Codex : APPROVE après 4 REQUEST_CHANGES successifs (chemin FAILED tardif → resume/markAnalysisAsFailed → sens inverse retry → off-by-one maxAttempts). tsc 0 ; 117 tests verts sur les fichiers concernés ; échecs coaching/live préexistants sur HEAD (prouvé par stash), hors périmètre. Part 2 (borner le LLM memo-generator ~120s) à suivre.

---
## 2026-06-11 — Robustesse — Chantier deck-forensics (hors plan post-audit) : un hoquet infra n'avorte plus le Deep Dive

### Contexte
Découvert au test local de la branche : `deck-forensics` (seul agent critique de Phase A) a renvoyé un `empty_response` Gemini déterministe sur un deck mince → tout le Deep Dive avorté (FAILED). Pré-existant (sur main aussi). Diagnostic routé à Codex **en indépendance** : cause = 3 choix qui se composent (deck-forensics seul en Phase A + `maxRetries:0` + fallback interne timeout-seulement + abort Phase A fatal). Décision Sacha : implémenter Opt 1 + Opt 2 (accepte que le dégradé soit **facturé, pas remboursé**).

### Fichiers
- NOUVEAU `src/lib/transient-errors.ts` : `isTransientInfraErrorMessage(msg)` **STRICT** — marqueurs phrase non ambigus (rate limit, timeout, service unavailable, internal server error, empty_response…) + code HTTP **uniquement en contexte de statut explicite** (jamais un nombre nu type « score 500 out of range »). Strict car un faux positif MASQUERAIT un vrai défaut au gate critique.
- `src/agents/tier1/deck-forensics.ts` (**Opt 1**) : le fallback Gemini 3 Flash se déclenche désormais sur timeout **OU `empty_response`** (avant : timeout seul). `isEmptyResponseError` ajouté ; prompt de secours = « analyse minimale honnête, n'invente rien ». Erreur non transitoire → remonte (pas de masquage).
- `src/agents/orchestrator/index.ts` (**Opt 2**, garde Phase A) : si l'échec de Phase A est **uniquement** une erreur infra transitoire → continue en **DÉGRADÉ** (plus d'abort de tout le Deep Dive) ; l'agent reste `success:false` (jamais converti en signal/red flag) ; `logger.warn` (le signal Sentry central part à completeAnalysis/I1). Échec **non** transitoire → abort conservé.
- Tests : `transient-errors.test.ts` (strict + décoys nombres-nus → false) ; `deck-forensics-timeout-b16.test.ts` MAJ (fallback empty_response). Routeur `isRetryableError` **inchangé** (reste laxiste — sur-rejouer est inoffensif ; strictesses voulues différentes).

### Description
Chantier de robustesse **séparé du plan post-audit** (sur la branche `refonte/5-sujets`, commits distincts). Interaction **refund** assumée : dégradé → analyse `COMPLETED` (success:false), pas `FAILED` → pas de remboursement (l'investisseur paie un Deep Dive sans vérif forensique du deck). Validé end-to-end zéro-LLM en local (completeAnalysis dégradé → read-model H2 écrit + signal I1 émis). Gate Codex : APPROVE (après 1 REQUEST_CHANGES — classifieur trop large + double signal Sentry + flake temporel pré-existant `reanalysis-reservation` écarté avec preuve 3 runs verts). tsc 0, suite 4399 passed / 9 skipped / 0 failed.

---
## 2026-06-11 — Docs/CI — Phase I (I3 + I4 + G-différé) : README, .env.example, doc crédits, statuts docs, check SHA xlsx

### Fichiers
- **I3** — `README.md` : boilerplate create-next-app → README réel (~55 lignes : setup, env requis, **warning migrations prod à la main**, commandes tests, carte des docs). `.env.example` : 11 → couverture complète des vars user-configurables (DB, Clerk, LLM, **DOCUMENT_ENCRYPTION_KEY**, storage, Upstash, Sentry, **DEEP_DIVE_STEPWISE**/LIVE_COACHING_ENABLED/flags, OCR Azure/Google, Recall.ai, notifications, enrichment, dev/test) groupées required/optional ; vars platform-injected (NODE_ENV/VERCEL*/PATH) exclues. `.gitignore` : `!/.env.example` (opt-in root, ws-relay reste ignoré). NOUVEAU `docs-private/credits-refund-flow.md` : cycle débit/refund (pots free/paid Option B, qui débite, états terminaux→refund via watchdog/compensateFailedAnalysis, clés d'idempotence débit + refund scopé, `Analysis.refundedAt`, invariant « refund exactement une fois »).
- **I4** — `CLAUDE.md` : compte agents **44→43** (4 mentions) — Tier 1 réel = **12** lentilles, pas 13 (`3 + 12 + 22 + 6` ; cohérent avec la table d'architecture du même fichier + le répertoire `tier1/`). 3 statuts de specs corrigés : `FACT-STORE-SPEC.md` « À IMPLÉMENTER » → **IMPLÉMENTÉE** (read-model live) ; `LIVE-COACHING-SPEC.md` « Implémentée » → **+ ARCHIVÉE** (flag off) ; `PLAN-DEEPDIVE-DURABILITY.md` bannière **LIVRÉ EN PROD** (les « main pas touché / NON poussé » sont pré-merge périmés). Bannières `> ARCHIVED — superseded by docs-doctrine/angeldesk-strategic-pivot.md` sur `investor.md`, `ai-board.md`, `AGENT-REFONTE-PROMPT.md`, `REFLEXION-CONSENSUS-ENGINES.md`, `audit-failles-personas.md`.
- **G-différé** — `.github/workflows/test.yml` : nouveau job `supply-chain` (checkout + shasum, léger) épinglant `vendor/xlsx-0.20.3.tgz` au SHA-256 audité `8dc73fc3…` (échec sur mismatch). Défense en profondeur au-dessus du lockfile.

### Description
Fin de Phase I (et du plan post-audit M0+M1+M2). I3/I4/G non gatés (docs + CI). Vérifs : YAML CI valide (6 jobs), SHA-check dry-run OK (match), tsc 0, suite unit 4395 passed / 9 skipped / 0 failed. **Plan post-audit COMPLET** (A→I).

---
## 2026-06-11 — Tests/doctrine — Phase I (I2) : guards doctrine globés (nouvel agent gardé par défaut)

### Fichiers
- `src/agents/tier1/__tests__/a7a-confidence-threshold.guard.test.ts` : liste hardcodée de 12 fichiers → **glob `readdirSync('src/agents/tier1')`** + allowlist d'exclusions (`index.ts`). Un nouvel agent Tier 1 est désormais gardé PAR DÉFAUT (plus besoin de penser à l'ajouter à la liste). + assertion plancher (`length >= 12`) contre un pass vacant si le glob casse.
- `src/agents/tier2/__tests__/a8a-anti-hallucination.guard.test.ts` : idem, glob `src/agents/tier2` + 6 exclusions (sector-standards, sector-benchmarks, output-mapper, benchmark-injector, complete-sector-json, types — fichiers support sans directives anti-hallucination). base-sector-expert + index + tous les `*-expert.ts` restent gardés ; nouvel expert auto-inclus. + plancher `>= 24`.

### Description
Phase I2 du plan post-audit (non gaté). Couvre l'audit « un nouvel agent échappe silencieusement aux guards doctrine ». **a9-reste NON globé volontairement** : son scope est un sous-ensemble CURÉ inter-répertoires (4 dirs : top-level base, tier0, chat, orchestration) où ~17 fichiers non-agents seraient faussement inclus (la liste d'exclusions dépasserait la liste d'inclusions) — le glob y serait le mauvais outil. Le plan ciblait « glob des répertoires tier1/tier2 » : a7a (tier1) + a8a (tier2) sont les tiers qui croissent avec de nouveaux agents, et leur glob est propre. Vérifs : tsc 0, a7a 109 tests / a8a 241 tests (couverture IDENTIQUE — glob = même set de fichiers), suite unit 4395 passed / 9 skipped / 0 failed.

---
## 2026-06-11 — Observabilité — Phase I (I1) : logger structuré orchestrateur/router + Sentry dégradation

### Fichiers
- `src/agents/orchestrator/index.ts` (119 sites) + `src/services/openrouter/router.ts` (26 sites, + import logger) : TOUS les `console.*` → logger structuré (`src/lib/logger.ts`). Mapping : `console.log`→`logger.debug` (traces : `MIN_PRIORITY=info` en prod → **silencées en prod**, visibles en dev — corrige l'audit « 120+ console.log non gardés en production »), `console.warn`→`logger.warn`, `console.error`→`logger.error` (le logger **auto-hook Sentry** : `captureException` si champ `err` Error, sinon `captureMessage`). Multi-arg restructuré : `console.error(msg, err)` → `logger.error({ err }, msg)`. Conversion par transform arg-aware (single-line) + rename d'opener (multi-line single-arg) ; **tsc valide l'arité** (logger n'a pas d'overload `(string, X)` → toute erreur multi-arg planterait tsc).
- `src/agents/orchestrator/persistence.ts` `completeAnalysis` : visibilité Sentry des **analyses « complétées mais dégradées »** (échecs d'agent avalés en `success:false`, analyse complète quand même → invisibles). Sur la **transition** vers COMPLETED (`previousStatus` lu dans la transaction, `!== "COMPLETED"`), si des agents ont `success===false` → UN `logger.error({ analysisId, dealId, failedAgents, failedCount }, "Analysis completed degraded")` → Sentry. Central (13 appelants), idempotent (transition-gated → pas de doublon sur re-complétion), message stable.
- `persistence-progress-monotone.test.ts` : +3 tests (transition dégradée → 1 émission ; re-complétion déjà COMPLETED → 0 ; tous succès → 0).

### Description
Phase I1 du plan post-audit (observabilité, **seul volet gaté de Phase I**). Gate Codex I1 : 1 REQUEST_CHANGES (signal dégradation non idempotent — `completeAnalysis` peut être rappelé → doublons Sentry) → corrigé (transition-gating via `previousStatus` + message stable + 3 tests). Vérifs : tsc 0 ; eslint 0 nouveau (6 warnings unused-vars PRÉ-EXISTANTS dans HEAD orchestrator, confirmés par git stash, hors scope) ; suite unit 4393 passed / 9 skipped / 0 failed. Suite : I2 (guards doctrine globés), I3 (README + .env.example + doc crédits), I4 (corrections docs) + check CI SHA-256 tarball xlsx (reporté de G) — non gatés.

---
## 2026-06-11 — Perf — Phase H (H2c) : script de backfill AnalysisSignalSummary (dry-run rails)

### Fichiers
- NOUVEAU `scripts/backfill-analysis-signal-summaries.ts` : pré-chauffe le read-model pour l'analyse canonique de chaque deal. Rails dry-run (défaut) / `CONFIRM=1` (apply), pattern `unblock-stale-analysis`. Réutilise `pickCanonicalAnalysis` (= ce que lit le read path) + `loadResults` + `upsertAnalysisSignalSummary` (zéro duplication de la sélection canonique). Batché (`BATCH_SIZE`, défaut 50, **fail-fast** si non-entier-positif → sinon `NaN` ferait `chunk()` traiter zéro deal et mentir `toBackfill: 0`). Idempotent : saute les analyses déjà résumées à la version courante → re-run sûr, `toBackfill: 0` au dry-run = signal autoritaire « rien à faire ». OPTIONNEL : le read étant self-correcting, le cache se réchauffe lazy au miss sinon.

### Description
Phase H2c du plan post-audit (fin de H2). **Validation réelle sur docker postgres:16** (seed minimal User+Deal+Analysis COMPLETED, sans thèse → canonique = analyse la plus récente) : dry-run DB vide propre ; apply 1 backfill ; row vérifiée (globalScore 82, productScore **79.5** fidélité Float confirmée non tronquée, sector/stage/instrument/geography/description ok, schemaVersion 1, `updatedAt` géré par Prisma) ; idempotence (re-run → `toBackfill: 0`) ; **FK cascade vérifiée** (DELETE Analysis → summary auto-supprimé). Gate Codex H2c : 1 REQUEST_CHANGES (`BATCH_SIZE` invalide silencieux → faux `toBackfill: 0`) → corrigé (parse strict + fail-fast). scripts/ exclu du tsc projet (convention tsx) → validé par exécution réelle. ⚠️ **ACTION SACHA : après migration prod, lancer le backfill `CONFIRM=1 npx dotenv -e .env.local -- npx tsx scripts/backfill-analysis-signal-summaries.ts`** (optionnel — sinon réchauffe lazy). Fin de Phase H2. Suite : Phase I (observabilité + docs).

---
## 2026-06-11 — Perf — Phase H (H2b) : service signal-summary + write completeAnalysis + read self-correcting

### Fichiers
- `src/services/analysis-results/score-extraction.ts` : `extractCanonicalExtractedInfo` + type `CanonicalExtractedInfo` (+ helpers `isRecord`/`readString`) DÉPLACÉS ici depuis canonical-read-model (module neutre « pure extraction », à côté d'`extractAnalysisScores`) → évite le cycle service ↔ read-model.
- NOUVEAU `src/services/deals/analysis-signal-summary.ts` : `CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION=1` ; `computeAnalysisSignalSummary(results)` (pur) ; `readAnalysisSignalSummaries(ids)` bulk findMany filtré sur la version courante, **best-effort** (try/catch → Map vide sur erreur, ex. table absente pendant la fenêtre de migration manuelle D4 → tous misses → fallback loadResults, zéro crash SSR) ; `upsertAnalysisSignalSummary(analysisId,dealId,results)` best-effort (ne throw jamais, log.warn). `rowToData` reconstruit `extractedInfo=null` si les 5 colonnes sont null (miroir du contrat d'extraction).
- `src/agents/orchestrator/persistence.ts` `completeAnalysis` : upsert du summary **HORS transaction**, après le blob upload, garde `statusOverride !== FAILED`. Divergence assumée de la reco Codex « même transaction » : un échec d'écriture du cache ne doit pas rollback une complétion terminale réussie (sinon l'analyse retombe RUNNING). Le read self-correcting couvre l'absence → l'écriture est une pure optimisation.
- `src/services/deals/canonical-read-model.ts` : le bloc `loadResults` par-deal remplacé par lecture du read-model (`readAnalysisSignalSummaries`) ; misses uniquement → `loadResults` + `computeAnalysisSignalSummary` + ré-`upsert`. Hot path = 0 blob. Comportement scores/extracted-info préservé EXACTEMENT (null semantics, Float). Type `CanonicalExtractedInfo` ré-exporté.
- NOUVEAUX tests : `analysis-signal-summary.test.ts` (contrat compute, float 79.5 préservé, garbage→null) ; `canonical-read-model-signal-summary.test.ts` (hit = 0 loadResults/0 upsert ; miss = loadResults + upsert 1× + hit==miss equivalence ; cache read throws → fallback loadResults ; upsert throws → read renvoie quand même). 6 tests.

### Description
Phase H2b du plan post-audit. Élimine le `loadResults(blob multi-MB)` par-deal sur les 3 pages SSR via le read-model `AnalysisSignalSummary` (clé analysisId, immuable → sans staleness). Read ET write best-effort → le read-model est une optimisation, jamais une dépendance dure (table manquante / cache cassé → dégrade au comportement pré-H2). Gate Codex H2b : 1 REQUEST_CHANGES (cache read non gardé → risque de crash SSR pendant la fenêtre de déploiement avant migration manuelle) → corrigé (read best-effort + test). Vérifs : tsc 0, eslint 0, suite unit 4390 passed / 9 skipped / 0 failed. Suite : H2c (script backfill dry-run).

---
## 2026-06-11 — Schema/migration — Phase H (H2a) : table AnalysisSignalSummary (read-model dénormalisé)

### Fichiers
- `prisma/schema.prisma` : NOUVEAU model `AnalysisSignalSummary` — read-model dénormalisé, **clé = analysisId** (`@id`), pas dealId. Raison (design routé à Codex indépendant) : `extractAnalysisScores` + `extractCanonicalExtractedInfo` sont des fonctions PURES de `Analysis.results`, immuable une fois COMPLETED → cache **sans staleness**. Le read recalcule la sélection canonique (cheap, sans blob) puis lit par analysisId. Colonnes : 5 scores `Float?` (DOUBLE PRECISION — fidélité EXACTE avec la sortie `number`, sous-scores de dimension clampés mais pas arrondis), 5 extracted-info `String?` (`description @db.Text`), `dealId` dénormalisé NOT NULL (backfill/debug, pas de FK Deal), `schemaVersion Int @default(1)` (bump → anciennes lignes = misses contrôlés recalculés), timestamps. FK `analysisId → Analysis(id) onDelete: Cascade`. Index `dealId` + `schemaVersion`. Back-relation `Analysis.signalSummary`.
- NOUVEAU `prisma/migrations/20260611012015_analysis_signal_summary/migration.sql` : CREATE TABLE additif pur + 2 index + FK cascade. Générée APRÈS `0_baseline` (jamais édité) via `migrate diff --from-url <docker> --to-schema-datamodel`.

### Description
Phase H2a du plan post-audit (perf read-model). Élimine le `loadResults(blob multi-MB)` par-deal sur les 3 pages SSR. Design **routé à Codex en indépendance d'abord** (contexte neutre, sans ma conclusion) : Codex a proposé clé=analysisId + read self-correcting + write best-effort, ce que j'ai adopté (diverge du plan littéral « 1 row/deal » mais strictement plus robuste). Validé sur **docker postgres:16 vierge** : `migrate deploy` (3 migrations) propre + `migrate diff` post-deploy = empty (zéro drift) + `migrate status` up to date ; `\d` confirme FK cascade + index + double precision + schemaVersion default 1. Gate Codex H2a : APPROVE (note : `updatedAt` NOT NULL sans default SQL → backfill via Prisma upsert/createMany, jamais raw SQL). tsc 0. ⚠️ **ACTION SACHA : appliquer la migration en prod Neon À LA MAIN après merge** (D4). Suite : H2b (service + write completeAnalysis + read self-correcting).

---
## 2026-06-11 — Perf — Phase H (H1) : quick fixes read-model (blob-first + select + caps)

### Fichiers
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : la requête SSR `latestCompletedAnalysis` (findFirst COMPLETED) ne SELECT plus `results` (blob JSON multi-MB tiré par le wire Postgres). Results désormais chargé via `loadResults(latestCompletedAnalysis.id)` — **blob-first** (cache Vercel Blob, fallback DB-column + backfill). Même analyse affichée (latest completed by createdAt), shape identique (`loadResults` retourne `Analysis.results`). Garde du view-model réécrite pour narrower `latestCompletedAnalysis` non-null.
- `src/app/(dashboard)/dashboard/page.tsx` : (1) `recentAnalyses` `include`→`select` (id, type, completedAt, deal{id,name}) — supprime le pull implicite de TOUS les scalaires Analysis dont `results` (×5). (2) `metricDeals` capé `take: 200` (`PORTFOLIO_METRICS_DEAL_CAP`) + `orderBy updatedAt desc` (sous-ensemble déterministe). (3) Métriques portfolio désormais signalées comme échantillonnées quand `totalDeals > cap` (`portfolioMetricsTruncated`) : sous-titre 'Score moyen' + CardDescription 'Métriques Portfolio' — plus de claim portfolio-wide sur un échantillon.
- `src/app/(dashboard)/deals/page.tsx` : `deal.findMany` capé `take: 200` (`DEALS_PAGE_CAP`) ; `getDeals` retourne `{ deals, totalCount }` (count() exact en parallèle) → header garde le **total vrai** + hint '· N affichés' si tronqué.

### Description
Phase H1 du plan post-audit (perf read-model, quick fixes). Cible : les pages chaudes chargeaient le blob `Analysis.results` multi-MB par deal via le wire Postgres (SSR détail) ou tiraient implicitement tous les scalaires Analysis (dashboard). Chaque deal matérialisé déclenche aussi `loadCanonicalDealSignals`→`loadResults` (fan-out blob) → caps `take` comme garde-fou pré-H2. Gate Codex : 1 REQUEST_CHANGES (métriques portfolio tronquées présentées comme globales — truthfulness) → corrigé (libellés conditionnels). Vérifs : tsc 0, eslint 0, suite unit 4384 passed / 9 skipped / 0 failed. Suite : H2 (read-model dénormalisé `DealSignalSummary`, gate stricte + migration).

---
## 2026-06-11 — Sécurité/deps — Phase G : CVE xlsx → SheetJS 0.20.3 vendored

### Fichiers
- `package.json` : `"xlsx"` `^0.18.5` → `file:vendor/xlsx-0.20.3.tgz`. npm `xlsx` est figé à 0.18.5 (2 HIGH : Prototype Pollution <0.19.3, ReDoS <0.20.2, `fixAvailable:false`) ; SheetJS ne distribue les versions corrigées que via son CDN.
- NOUVEAU `vendor/xlsx-0.20.3.tgz` (2.4 MB, SHA-256 `8dc73fc3…`) + `vendor/README.md` (provenance, SHA, politique de mise à jour manuelle car hors npm). Tarball committé (référencé `file:`) plutôt qu'URL CDN directe → `npm ci`/build Vercel indépendants de la joignabilité `cdn.sheetjs.com`, byte-reproductibles via lockfile.
- `package-lock.json` : xlsx 0.20.3 (integrity sha512) ; retrait des transitives 0.18.5 (`adler-32`, `cfb`, `codepage`, `crc-32`, `ssf`…) — 0.20.x est self-contained ; vérifié : aucune n'est importée ailleurs dans `src`.

### Description
Phase G du plan post-audit (remédiation CVE `xlsx`). Décision **CDN SheetJS vendored vs exceljs routée à Codex** (raisonnement indépendant) : exceljs = migration de modèle de données (le code est couplé profondément au modèle SheetJS — `worksheet["A1"]`, `!ref`, `CellObject.t/.v/.w/.f`, `XLSX.utils.*`, graphe de formules, ~1450 lignes), disproportionnée pour une remédiation CVE → **Option A vendored** (même API, 0 changement de code applicatif). **Golden parse-equivalence** sur 3 fixtures réelles (Antiopea, Norway, Spin-off) avant/après : `buildExcelModelIntelligence` (cœur analytique : formules, dépendances, scores) **byte-identique** sur les 3 ; seule différence = 0.20.3 normalise `\r\n`→`\n` dans les cellules multi-lignes (bénin, invisible au LLM ; aucun code ne dépend de `\r\n`) + rendu marginal de cellules-formules corrompues sur le fichier Norway (pathologique, parsé pareil par les 2 versions). Vérifs : `npm audit --omit=dev` → 0 high/critical (2 GHSA xlsx clearées ; 5 moderate pré-existantes hors xlsx/hors scope), suite Excel 21/21 verte, tsc 0, eslint 0 (1 warning pré-existant `normalizedFormula:1396` non touché), suite unit 4384 passed / 9 skipped / 0 failed. ARRÊT DE SCOPE avant Phase H (perf read-model, session fraîche).

---
## 2026-06-11 — Schema/migration — Phase F (F6) : growthRate Decimal(7,2) + bornes Zod

### Fichiers
- `prisma/schema.prisma` : `Deal.growthRate` passe de `Decimal(5,2)` (plafond ±999.99) à `Decimal(7,2)` (±99999.99). La précision (5,2) faisait échouer l'insert (`numeric field overflow`) pour tout deal à forte croissance (>999%).
- NOUVEAU `prisma/migrations/20260611001644_growthrate_decimal_precision/migration.sql` : `ALTER TABLE "Deal" ALTER COLUMN "growthRate" SET DATA TYPE DECIMAL(7,2)`. Migration générée APRÈS `0_baseline` (jamais édité). Élargissement pur → aucune valeur existante perdue (≤999.99 rentre dans 99999.99).
- NOUVEAU `src/services/deals/growth-rate-bounds.ts` : source de vérité unique des bornes (`GROWTH_RATE_MIN=-100`, `GROWTH_RATE_MAX=99999.99`, `isGrowthRateInRange()`). Plancher -100 (le CA ne décroît pas de plus de 100% YoY) ; plafond aligné sur la colonne.
- `src/app/api/deals/route.ts` (POST `createDealSchema`) + `src/services/deals/manual-fact-overrides.ts` (PATCH `updateDealSchema`) : `growthRate` gagne `.min(GROWTH_RATE_MIN).max(GROWTH_RATE_MAX)` (avant : aucune borne → garbage/overflow possible). Rejet (400) hors plage, jamais de clamp silencieux.
- `src/agents/orchestrator/persistence.ts` (gate Codex) : le 3ᵉ chemin d'écriture — `processAgentResult`/document-extractor écrit la valeur growthRate EXTRAITE (sortie LLM) sans schéma Zod — applique désormais `isGrowthRateInRange` : **skip + `logger.warn`** hors plage (pas de clamp d'une donnée inférée). Sans ce guard, une extraction hallucinée pouvait overflow la colonne ou contourner la policy.
- Tests : `deals/__tests__/route.test.ts` +3 POST (rejet >plafond / <plancher sans toucher la DB ; acceptation 5000% que l'ancien (5,2) rejetait) ; NOUVEAU `growth-rate-bounds.test.ts` (bornes + non-finis) ; NOUVEAU `persistence-growthrate-bounds.test.ts` (extrait in-range persisté / out-of-range skip+warn).

### Description
Phase F (F6) du plan post-audit. ⚠️ **ACTION SACHA : appliquer la migration en prod Neon À LA MAIN** (comme D4 — `angeldesk_prod_migrations.md`), après merge ; NON appliquée automatiquement. L'`ALTER` peut prendre un bref ACCESS EXCLUSIVE (réécriture numeric) — table Deal petite, sous-seconde. Validé sur docker postgres:16 vierge : `migrate deploy` (baseline + nouvelle) OK + `migrate diff` post-deploy vide. Preuve typmod : `12345.67::numeric(7,2)` OK vs `numeric(5,2)` → overflow. Gate Codex : 1 REQUEST_CHANGES (3ᵉ chemin d'écriture growthRate non borné dans la persistance orchestrateur + centralisation des bornes) → corrigé. Vérifs : tsc 0, eslint 0, suite unit 4384 passed / 9 skipped / 0 failed. Fin de Phase F. Suite : Phase G (xlsx).

---
## 2026-06-11 — Tests/billing — Phase F (F5) : guards billing resume regex→comportementaux

### Fichiers
- SUPPRIMÉ `src/app/api/analyze/__tests__/route-resume-billing-guards.test.ts` (3 guards par source-string `readFileSync`+`toContain`, brittle).
- NOUVEAU `src/lib/__tests__/analysis-compensation-refund.test.ts` : `compensateFailedAnalysis` rembourse le montant EXPLICITE (refundAmount) vs le prix plein (CREDIT_COSTS) ; ignore refundAmount<=0.
- `src/lib/__tests__/deal-analysis-inngest-stepwise.test.ts` : +2 tests du chaînon central — `dealAnalysisResumeFunction` lit `event.data.resumeRefundAmount/resumeRefundKey` et les passe à `compensateFailedAnalysis` (helper `invokeResumeHandler` + `resumeAnalysis` au mock @/agents).

### Description
Phase F (F5) du plan post-audit : les 3 invariants de facturation du resume étaient gardés par regex source-string (cassent au rename, ou passent alors que la logique a changé). Remplacés par des assertions COMPORTEMENTALES aux 3 niveaux de la chaîne : route émet `resumeRefundAmount` (route.test.ts:333), le handler Inngest le transmet (nouveaux tests), `compensateFailedAnalysis` rembourse le montant exact (nouveau test). Gate Codex : 1 REQUEST_CHANGES (le chaînon central handler→compensation manquait) → corrigé → APPROVE. Vérifs : tsc 0, eslint 0, suite unit 4375 passed / 0 failed. Reste F6 (migration growthRate) — session fraîche.

---
## 2026-06-11 — Crédits/money — Phase F (F4) : addCredits idempotent (anti double-crédit, avant câblage Stripe)

### Fichiers
- `src/services/credits/usage-gate.ts` : `addCredits` gagne un paramètre OBLIGATOIRE `idempotencyKey` (4e position). En tête de transaction : `findUnique` par `idempotencyKey` → no-op idempotent (`alreadyAdded`) si déjà vu. Catch : un `P2002` concurrent (contrainte UNIQUE) est normalisé en succès idempotent (re-lecture de la transaction gagnante) au lieu d'une erreur transitoire. Réutilise `CreditTransaction.idempotencyKey` (même pattern que deduct/refund). Import `Prisma` (value).
- `src/services/credits/__tests__/credit-flow-e2e.test.ts` : mock in-memory `create` simule la contrainte UNIQUE (throw P2002), top-level mock expose `creditTransaction.findUnique` ; 9 appels existants reçoivent des clés uniques ; 2 nouveaux tests (retry séquentiel = no-op ; course concurrente P2002 = succès idempotent + 1 seul PURCHASE).

### Description
Phase F (F4) du plan post-audit : sans idempotence, un retry (webhook Stripe rejoué, double submit) double-créditait. Aucun appelant prod aujourd'hui — posé AVANT le câblage Stripe (forward-looking). Gate Codex : 1 REQUEST_CHANGES (le perdant P2002 concurrent devait retourner un succès idempotent, pas une erreur) → corrigé → APPROVE. À retenir pour Stripe : valider une clé non vide côté webhook (noté par Codex). Vérifs : tsc 0, eslint 0, suite unit 4373 passed / 0 failed. Reste F5-F6.

---
## 2026-06-11 — Maintenance — Phase F (F3) : cleanups LLM logs / snapshots branchés sur le cron reaper 12h

### Fichiers
- `src/lib/inngest.ts` : `staleAnalysisReaperFunction` (cron 0 */12) exécute désormais 3 STEPS Inngest isolés — `reap-stale-analyses` (enveloppé try/catch + fallback sérialisable car `reapStaleAnalyses` ne catch pas son `findMany`), `cleanup-old-llm-logs` (`cleanupOldLLMLogs`, purge LLMCallLog > 30j), `cleanup-expired-snapshots` (`cleanupExpiredSnapshots`, purge ContextEngineSnapshot expirés). Imports ajoutés.

### Description
Phase F (F3) du plan post-audit : `cleanupOldLLMLogs`/`cleanupExpiredSnapshots` existaient mais n'étaient jamais appelées (bloat DB). Branchées sur le filet de maintenance 12h. Gate Codex : 1 REQUEST_CHANGES (le step reap pouvait court-circuiter les cleanups sur erreur Prisma → try/catch + fallback) → APPROVE. **⚠️ Dépendance ops** : le reaper est PAUSÉ en prod (anti-drain Neon, quota compute) — le câblage est correct mais DORMANT jusqu'à réactivation du cron par Sacha (action ops, non bloquant). Vérifs : tsc 0, eslint 0, 17 tests reaper verts. Reste F4-F6.

---
## 2026-06-11 — RGPD/données — Phase F (F1+F2) : cleanup des orphelins à la suppression deal/compte (helper partagé)

### Fichiers
- NOUVEAU `src/lib/deal-cleanup.ts` : `cleanupDealRelations(tx, dealIds[])` — source UNIQUE de vérité des lignes orphelines par deal (dealId scalaire SANS cascade vers Deal). Supprime par `dealId IN` : LLMCallLog (résolu via analysisId/boardSessionId des analyses+sessions du deal), CostEvent, CostAlert, ContextEngineSnapshot, DealChatContext, ChatConversation (+cascade ChatMessage), AIBoardSession (+cascade members/rounds). + test unitaire dédié.
- `src/app/api/deals/[dealId]/route.ts` (F1) : `prisma.deal.delete` nu → transaction `cleanupDealRelations(tx,[dealId])` puis `tx.deal.delete`. Corrige la fuite RGPD (chat, snapshots, prompts LLM, télémétrie coût survivaient au deal). Test DELETE étendu.
- `src/app/api/user/route.ts` (F2) : helper sur les deals courants PUIS résidu par `userId` (legacy orphans d'anciennes suppressions deal) — LLMCallLog via boardSessionId, AIBoardSession/ChatConversation/CostEvent par userId, CostAlert split (delete deal-liées + anonymise user-level `dealId:null`). Docblock « all associated data » corrigé. NOUVEAU test route.

### Description
Phase F (F1+F2) du plan post-audit (finding High RGPD : `deal.delete` laissait orphelines 7 tables à dealId scalaire ; suppression compte en omettait 3 + laissait des dealId danglants). Gate Codex : 2 REQUEST_CHANGES (CostAlert à intégrer au helper pour cohérence deal/compte ; résidu par userId requis pour les legacy orphans) → corrigés → APPROVE. **CostEvent ajouté** (absent du plan F1 initial, dealId requis = orpheline). Limite notée : orphelins legacy sans chemin vers l'user (LLMCallLog par analysisId d'analyses supprimées, DealChatContext/ContextEngineSnapshot de deals supprimés) relèvent d'un sweep global / F3 âge-based. Vérifs : tsc 0, eslint 0, suite unit 4371 passed / 0 failed. Reste F3-F6.

---
## 2026-06-11 — Concurrence — Phase E (E5) : rate-limit distribué sur les routes coûteuses

### Fichiers
- `src/app/api/board/route.ts:55` (POST 2/min), `src/app/api/deals/route.ts:36` (GET 60/min) + `:159` (POST 20/min), `src/app/api/context/route.ts:63` (POST 3/min), `src/app/api/founder/route.ts:49` (POST 5/min), `src/app/api/founder/team/route.ts:49` (POST 5/min) : `checkRateLimit` (in-memory, par-instance serverless) → `await checkRateLimitDistributed` (Redis/Upstash via `@/services/distributed-state`, fallback in-memory gracieux). Signature + `RateLimitResult` identiques → code downstream inchangé.
- Tests adaptés (mocks `checkRateLimit`→`checkRateLimitDistributed`, `mockReturnValue`→`mockResolvedValue`) : `board/__tests__/{route-gate,route,post-route}.test.ts`, `deals/__tests__/route.test.ts`.

### Description
Phase E (E5) du plan post-audit. Le store in-memory était par-instance → sous Fluid Compute (instances réutilisées/multiples), la limite effective = N × configurée, donc les garde-fous de coût ne tenaient pas sur les routes chères (Board multi-LLM, Context Engine APIs externes, founder enrichissement). Pattern déjà établi (chat/resolutions/evidence-health l'utilisaient). Gate Codex APPROVE. **Dépendance infra** : sans UPSTASH_REDIS en prod, fallback in-memory = comportement actuel sans régression ; le bénéfice distribué nécessite Redis live. **Hors périmètre (passe ultérieure, noté par Codex)** : autres limiters in-memory (credits, coaching/reanalyze, live-sessions). Vérifs : tsc 0, eslint 0, suite unit 4365 passed / 0 failed. **Phase E (concurrence) COMPLÈTE** — errors.md 2026-03-12 « Race condition BaseAgent » clôturée.

---
## 2026-06-11 — Concurrence — Phase E (E4) : CostMonitor par-analyse (attribution money isolée)

### Fichiers
- `src/services/cost-monitor/index.ts` : slot unique `currentAnalysis` → `analyses = Map<analysisId, accumulator>`. Nouveau `resolveAccumulator(analysisId, { allowMonoAnalysisFallback })` : analysisId fourni → match EXACT ou null (jamais de devinette = pas de mis-attribution) ; analysisId omis (legacy/test) → fallback mono-analyse si une seule active. `recordCall`/`endAnalysis` distinguent « champ omis » (fallback) de « champ présent mais undefined » (router hors scope ALS → drop). `endAnalysis` retire SON analyse de la Map (les concurrentes restent).
- `src/services/openrouter/router.ts` : 7 sites `recordCall` passent `analysisId: getAnalysisContext() ?? undefined` (mirroring du `logLLMCallAsync` adjacent ; pas d'import circulaire).
- `src/agents/orchestrator/index.ts` : 4 sites `endAnalysis` passent `analysisId: analysis.id`.
- NOUVEAU `src/services/cost-monitor/__tests__/cost-monitor-concurrency.test.ts` : 2 analyses concurrentes → attribution exacte des CostEvents, appel non identifiable droppé (pas mis-attribué), clôture indépendante ; + appel router `analysisId: undefined` pendant une analyse active → droppé (régression money pointée par Codex).

### Description
Phase E (E4) du plan post-audit. Le slot unique corrompait l'attribution des coûts quand 2 analyses tournaient en parallèle (la 2e `startAnalysis` écrasait la 1re). Gate Codex : 1 REQUEST_CHANGES (le fallback mono-analyse mis-attribuait un appel board/orphelin `analysisId: undefined` à l'unique analyse active) → corrigé (distinction champ-omis vs présent-mais-undefined) → APPROVE. Vérifs : tsc 0, suite unit complète 4365 passed / 0 failed. Reste E5 (rate-limit distribué).

---
## 2026-06-11 — Concurrence — Phase E (E2+E3) : isolation par-run de l'état mutable BaseAgent (fin de la contamination cross-deal)

### Fichiers
- `src/agents/base-agent.ts` : état mutable de run() (`_totalCost`, `_llmCalls`, tokens, `_dealStage`, `_traceId/_traceStartedAt/_llmCallTraces/_contextUsed/_contextHash/_contextualSystemPrompt`, flag trace) déplacé dans un `RunState` créé par run() et exposé via un `AsyncLocalStorage<RunState>` dédié (`baseRunStateStorage`). `run()` enveloppe `baseRunStateStorage.run(runState, () => runWithLLMContext(...))`. `_dealStage` devient un accessor get/set (les 18 sites d'écriture des sous-classes restent inchangés). `_enableTrace` instance → `_defaultTraceEnabled` (config) + effective par-run dans RunState (override `run(ctx,{enableTrace})` ne fuit plus). `resetCostTracking()` supprimé ; fallback hors-run paresseux pour les appels directs `execute()`/helpers en test.
- NOUVEAU `src/agents/__tests__/base-agent-concurrency.test.ts` : test ROUGE→VERT — 2 run() concurrents entrelacés (rendez-vous barrier), assert zéro contamination thèse cross-deal + coût/compteur isolés par run ; + garde d'ordre canonique des sections de `buildFullSystemPrompt` (byte-equivalence, date-tolérant).

### Description
Phase E du plan post-audit (finding High : agents singletons + runtime serverless réutilisé → 2 analyses concurrentes contaminaient prompts et métriques). Clôture errors.md 2026-03-12 « Race condition BaseAgent état mutable singleton ». Décision Option B (ALS dédié) soumise à Codex en amont (raisonnement indépendant) → APPROVE, puis diff implémenté → APPROVE. Vérifs : tsc 0, eslint 0, suite unit complète 4363 passed / 9 skipped / 0 failed (aucune régression pipeline). Prochaines sous-étapes : E4 (CostMonitor par-analyse) + E5 (rate-limit distribué).

---
## 2026-06-11 — DB/migrations — Phase D remédiation : baseline 0_baseline (l'historique sait à nouveau provisionner une base)

### Fichiers
- `prisma/schema.prisma:769` : `Thesis.sourceDocumentIds` + `@default([])` — seul drift prod↔schéma détecté (D1, diff read-only), aligné sur la migration 20260417120000 + prod ; re-diff = « No difference detected »
- NOUVEAU `prisma/migrations/0_baseline/migration.sql` : baseline auto-générée (migrate diff --from-empty, 65 tables, 226 index) + objets hors-modèle Prisma ré-appendés à la main (materialized view `current_facts_mv` + 3 index + fonction `refresh_current_facts_mv` — invisibles pour migrate diff)
- 30 anciennes migrations + `manual_current_facts_view.sql` → `prisma/migrations-archive/` (git mv, historique préservé)
- `.github/workflows/test.yml` : job db-integration basculé `db push` → `migrate deploy` (chaque CI valide désormais le provisionnement d'une base vierge)

### Description
Phase D du plan post-audit (finding High : les migrations ne créaient que 20 tables sur 65 ; migrate deploy échouait à la 14e migration). Validé sur Postgres 16 vierge : migrate deploy OK, diff post-deploy vide, MV + fonction présentes, test crédits DB vert sur la base provisionnée. Gate Codex APPROVE (pattern baselining doc Prisma sourcé). RESTE D4 : `prisma migrate resolve --applied 0_baseline` contre la prod Neon — confirmation Sacha requise, à lancer depuis CE commit (ne plus modifier 0_baseline ensuite).

---
## 2026-06-11 — CI/qualité — Phase C remédiation : lint en CI (36 erreurs corrigées), gate drift migrations, job Postgres éphémère + garde anti-prod

### Fichiers
- `.github/workflows/test.yml` : +3 jobs — `lint` (npm run lint, bloque sur erreurs), `migration-drift` (prisma migrate diff --from-url $PROD_DATABASE_URL --to-schema-datamodel, lecture seule, skip gracieux si secret absent ; --to-schema-datamodel choisi car l'historique migrations est troué jusqu'à la Phase D), `db-integration` (service postgres:16, db push, 7 fichiers DB explicites)
- Fixes lint (36 erreurs → 0) : prefer-const orchestrateur (3 destructurings scindés const/let sans logique changée), 2 disables justifiés tier2 (any délibérés commentés), entités JSX échappées (analysis-v2), `Date.now()` au render → useSyncExternalStore + timer d'expiration (analysis-running-overlay), setState-dans-effect → pattern « adjust state during render » (document-metadata-dialog, document-upload-dialog), refs-au-render → useState lazy init (document-upload-dialog, file-upload)
- NOUVEAU `src/lib/test-db-guard.ts` : garde anti-prod — les tests d'intégration chargeaient .env.local et écrivaient en PROD Neon en local ; désormais skip si URL non-localhost sans ALLOW_REMOTE_DB=1 (6 fichiers patchés)
- NOUVEAU `src/services/credits/__tests__/db-integration.test.ts` : 4 tests money-path contre vrai Postgres (idempotence par contrainte UNIQUE réelle, course TOCTOU 2 deducts concurrents → 1 seul passe, refund idempotent)

### Description
Phase C du plan post-audit. Vérifs : tsc propre, eslint 0 erreur, 4361 tests verts, simulation locale du job CI (docker postgres:16-alpine : db push + 50 tests verts contre vrai Postgres). Gate Codex APPROVE. ⚠️ Actions Sacha : secret GitHub PROD_DATABASE_URL + ajouter les nouveaux checks à la branch protection.

---
## 2026-06-11 — Chore/deps — Phase B remédiation : bumps sécurité next/clerk, audit fix (29→6 vulns), pin pdfjs-dist, deps mortes retirées

### Fichiers
- `package.json` + `package-lock.json` : next 16.2.4→16.2.9 (ferme 3 auth-bypass middleware GHSA-26hh/GHSA-492v/GHSA-267c + SSRF/DoS), @clerk/nextjs 6.39.3→6.39.5 (js-cookie), @sentry/nextjs 10.37.0→10.57.0 (embarqué par audit fix) ; npm audit fix lockfile-only : 29 vulns prod → 6 (critical protobufjs + chaîne OTel via inngest réglés)
- Pin `pdfjs-dist@~5.4.624` en dépendance directe (était phantom via pdf-to-img ; importeurs : src/services/pdf/extractor.ts, renderers/) — dedupe vérifié
- Retraits vérifiés par grep : `decimal.js` (0 import), `@hookform/resolvers` (0 import), `react-hook-form` + `src/components/ui/form.tsx` supprimés ensemble (scaffold 0 importeur) ; `pdf-lib` → devDependencies (scripts/ uniquement)
- `docs-private/reference.yaml` : ligne stale `financial_math: decimal.js` retirée (note Codex)

### Description
Phase B du plan post-audit. Résidu accepté : 5 moderate postcss@8.4.31 épinglé en interne par next (build-time, fix = future release next) + xlsx high (phase G dédiée). Vérifs : tsc propre, 4361 tests verts ×2 (1 flake non reproduit au 1er run, à surveiller en CI), next build OK. Gate Codex : APPROVE.

---
## 2026-06-10 — Chore/hygiène — Phase A remédiation post-audit : purge zombies, doublon base-agent, changes-log 30 entrées, docs-private tracké

### Fichiers
- Supprimés (zombies non-trackés, cassaient `tsc --noEmit` — 7 erreurs) : `src/app/api/v1/` (9 fichiers, API v1 ressuscitée du refactor crédits-only qui l'avait droppée), `src/lib/api-key-auth.ts`, `src/lib/api-logger.ts`, `src/lib/__tests__/api-logger.test.ts`, `src/services/webhook-dispatcher.ts`, `src/agents/tier1/exit-strategist.ts` (banni doctrine anti-oraculaire), `src/components/deals/next-steps-guide.tsx`, `src/components/deals/partial-analysis-banner.tsx`, `src/components/shared/pro-teaser.tsx`
- `git rm "src/agents/base-agent 2.ts"` (doublon macOS 80 KB tracké, 0 importeur)
- Ajoutés à git : `scripts/follow-deal-analysis.ts`, `scripts/unblock-deal-status.ts`, `scripts/unblock-stale-analysis.ts` (scripts ops sains, dry-run par défaut)
- `changes-log.md` tronqué à 30 entrées (1,12 MB → 58 KB, sa propre règle de rétention)
- `.gitignore` : `/docs-private` retiré → 23 fichiers docs-private/ trackés (scan secrets négatif ; protection contre la perte du laptop, reference.yaml 418 KB)

### Description
Phase A du plan de remédiation post-audit (audit multi-agents 2026-06-10, 13 findings High confirmés). Décisions Sacha : zombies supprimés (redesign API v1 = décision produit future), docs-private versionné dans le repo. Vérif : `tsc --noEmit` = 0 erreur, 4361 tests verts.

---
## 2026-06-10 — Infra/Décision — B (Clerk DEV→PROD) + C3 (FROM email) PARQUÉS : bloqués sur le choix du domaine prod

### Décision (utilisateur)
B et C3 du plan overlay/Clerk/email (`~/.claude/plans/velvety-stargazing-bee.md`) sont **mis en attente** : on finit le reste du plan, ces deux-là restent ouverts. Les deux convergent sur **une seule décision produit/infra non tranchée** : quel **domaine possédé** pour Angel Desk en prod (Sacha ne possède pas `angeldesk.app` ; le rename « AngelDesk » est en pause). Aucune urgence — la mitigation A + C1/C2 sont déployées, le feu est éteint.

### B — Clerk DEV→PROD (gelé)
L'instance Clerk **production** exige un domaine possédé (pas `*.vercel.app`). Tant que le domaine n'est pas choisi : B0 (migration users re-link par email vérifié, Codex-revu) + B1-B6 (instance prod, DNS/FAPI, `pk_live/sk_live`, CSP `next.config.ts`, OAuth/redirects/webhooks, rollback réversible) **gelés**. Détail dans le plan + Obsidian `Projet Migration Clerk DEV vers PROD`.

### C3 — Emails jamais reçus (gelé, même décision)
FROM actuel `maintenance@angeldesk.app` **non vérifiable** chez Resend (domaine non possédé) = racine probable de la non-réception. Fix = FROM sur **domaine possédé + vérifié** (SPF/DKIM/DMARC). Partie diagnostic (clé Resend en prod ? logs/bounces ?) reportée avec C3. C1/C2 (fail-loud + `response.ok+id`) déjà livrés → un envoi raté ne grave plus de faux `sentAt`.

### Reprise
Plan `~/.claude/plans/velvety-stargazing-bee.md` (volets B/C) · Obsidian `03_Projects/Projet Migration Clerk DEV vers PROD.md` · mémoire repo `angeldesk_overlay_freeze_clerk.md`.

---
## 2026-06-08 — Bug/auth — Gel overlay « analyse en cours » : session Clerk expirée (fetcher auth-required)

### Contexte
L'overlay + le tracker d'étapes restaient figés à 0/22 alors que l'analyse progressait (DB 0→22). Cause (preuve DevTools réseau) : le JWT de session Clerk expire (~60 s) et le refresh échoue (`refresh_token_not_found`) → le middleware `proxy.ts` (`auth.protect()`) réécrit les polls `/analyses` en 404 « signed-out » ; les composants en `fetch()` brut avalaient l'erreur et figeaient sur la dernière valeur. Bug Clerk cookie `__session` vs `__session_<suffix>` désynchronisés (instance DEV sur domaine prod).

### Changements (gate Codex APPROVE, 2 tours)
- `lib/fetch-latest-analysis.ts` (nouveau) : fetcher AUTH-REQUIRED unifié pour `analyses.latest` — `clerkFetch` puis UN retry `getToken({skipCache:true})` en Bearer avec `credentials:"omit"` (le cookie périmé ne gagne plus sur le header) ; sinon `AuthExpiredError`. Pas de fallback cookie-only.
- `lib/auth-expired-error.ts` (nouveau) : `AuthExpiredError` + `isAuthExpiredResponse` (401/403, ou 404 AVEC signal Clerk ; `x-matched-path:/404` seul ≠ auth-expired).
- 3 consommateurs (`analysis-running-overlay`, `analysis-v2-live`, `analysis-panel`) repointés sur le fetcher unifié + `retry` no-AuthExpired + `refetchInterval` stoppe sur `query.state.error` ; UI « Session expirée + Se reconnecter » ; toast unique.
- Retouches overlay : `beforeunload` retiré ; anneau ≥1 % (Tier0 ne paraît plus bloqué) ; libellé d'étape via `lib/analysis-progress-model.ts` (nouveau, partagé avec `analysis-progress.tsx` refacto byte-équivalent).

### Vérif
33 nouveaux tests + 100 tests existants analysis-v2/panel verts ; `tsc` clean hors WIP. Gate Codex APPROVE (correctif `credentials:omit` intégré au tour 2).

---
## 2026-06-08 — Bug/email — Fiabilise l'envoi : sendEmail exige response.ok+id, prod fail-loud

### Contexte
L'utilisateur ne reçoit jamais l'email « analyse prête » bien que `analysisReadyEmailSentAt` soit posé. Deux failles : (1) `sendEmail` considérait « succès » dès que `data.error` absent — un 401/403/429 ou un domaine Resend non vérifié passait pour un envoi réussi et gravait un faux `sentAt` ; (2) si `RESEND_API_KEY` manque en prod, le claim était consommé en silence (`sentAt` posé + log info), masquant la misconfig.

### Changements (gate Codex APPROVE)
- `services/notifications/email.ts` : `sendEmail` exige `response.ok && data.id` (sinon `success:false`) + guard `.catch` sur `json()` non-JSON.
- `services/notifications/analysis-ready-email.ts` : si email non configuré ET `VERCEL_ENV === "production"` → **relâche le claim** (`claimedAt=null`, guardé `sentAt:null`) **+ throw** (retry) au lieu de marquer `sentAt`. Hors prod (dev/local + Preview) → no-op inchangé.
- Tests : `email-idempotency.test.ts` (mock fetch `ok:true` + cas 403/sans-id → `success:false`) ; `analysis-ready-email.test.ts` (ancien « non configuré » → cas HORS PROD + nouveau cas prod fail-loud).

### Vérif
12 tests email verts ; `tsc` clean hors WIP préexistant (`exit-strategist.ts`). Gate Codex APPROVE (idempotence/claim intacts, gate `VERCEL_ENV` validé).

---
## 2026-06-08 — UI — Overlay « analyse en cours » : menu libre + affichage immédiat + redesign

### Contexte
Re-run Avekapeti : l'overlay (1) apparaissait **~1min30 après** le lancement (le worker ne pose `RUNNING` qu'après ~90s ; l'overlay attendait ce statut alors que l'inline tracker partait sur `isActive`), (2) était « moche », (3) couvrait **tout y compris le menu** alors que l'utilisateur veut pouvoir naviguer (autres deals/analyses, en lancer une autre) pendant que l'analyse tourne en arrière-plan.

### Changements (UI — pas de gate)
- `analysis-v2/analysis-running-overlay.tsx` : **SCOPE** `fixed inset-0 md:left-64` (couvre le contenu, **menu latéral `w-64` libre**) ; verrou de scroll body retiré (menu utilisable) ; **AFFICHAGE IMMÉDIAT** via fenêtre de grâce (`LAUNCH_GRACE_MS=150s`, couvre le démarrage worker) + statut `PENDING`/`RUNNING` ; **REDESIGN** (anneau de progression SVG + %, carte soignée, message « navigue librement, email à la fin »). beforeunload conservé (fermeture d'onglet accidentelle), navigation in-app libre.
- `analysis-v2/analysis-v2-live.tsx` (`handleRelaunch`, succès + 409) : pose le signal `queryKeys.analyses.launchedAt(dealId)=Date.now()` → l'overlay s'affiche **sans attendre** le worker.
- `lib/query-keys.ts` : ajout `analyses.launchedAt(dealId)`.

### Vérif
`tsc` clean (hors WIP) ; 62 tests analysis-v2 verts (non-régression). Validation visuelle live (overlay state-gated, non screenshotable hors analyse en cours).

---
## 2026-06-08 — Bug/money — Refund-à-tort + email manquant : gate sur statut terminal (pas allSuccess)

### Contexte
Re-run Avekapeti (validation post-release) : l'utilisateur n'a **jamais reçu l'email « analyse prête »**. Diagnostic (prouvé en base) : l'analyse `cmpzke95i…` a **COMPLETED 22/22 agents** mais a été **REFUNDÉE** (5 crédits, `refundedAt` posé) **et** sans email. Cause racine : `inngest.ts` gatait refund vs email sur `analysisResult.success` = `allSuccess` = `Object.values(results).every(r => r.success)` (orchestrator/index.ts:688…) = vrai **seulement si TOUS les agents `success:true`**. Sur un Deep Dive, ≥1 agent en échec est normal → `success:false` → branche refund + email sauté. **Impact : chaque Deep Dive complété-mais-partiel était remboursé en silence (fuite de revenu) + sans email.** Contredit la doctrine (« environnement fiable autour d'IA imparfaites » : une analyse COMPLETED est livrée/facturable).

### Décision (utilisateur + avis convergents Claude/Codex)
Option A : gater refund/email sur le **statut terminal PERSISTÉ**, binaire — `COMPLETED` → email + facturé (pas de refund), `FAILED` → refund. `allSuccess` reste un signal qualité/observabilité, jamais une règle commerciale. **Pas de seuil** dans `inngest.ts` (un seuil appartiendrait à la logique de STATUT). **Historique non corrigé** (que le futur, décision utilisateur).

### Changements (gate Codex APPROVE round 2)
- `src/lib/analysis-completion-policy.ts` (NEW) : helper PUR `completionActionForStatus(status) → 'notify'|'refund'|'none'`.
- `src/lib/inngest.ts` : `dealAnalysisFunction` + `dealAnalysisResumeFunction` — remplace le gate `analysisResult.success` par lecture du statut persisté (`step.run('resolve-terminal-status'…) → prisma.analysis.findUnique select status`) puis `completionActionForStatus`. Idempotence email (claim Phase 4) + clé refund inchangées.
- Tests : `analysis-completion-policy.test.ts` (NEW, 3) ; `deal-analysis-inngest-stepwise.test.ts` mis à jour (mock `findUnique` + spy email ; sémantique FAILED→refund ; **+ test de régression** COMPLETED malgré agents KO → email, pas de refund).

### Vérif
`tsc` clean (hors WIP). 18 tests verts (stepwise 7, policy 3, email 8). Gate Codex : round 1 REQUEST_CHANGES (tests stepwise rouges : mock prisma `{}` + sémantique obsolète) → mock + sémantique mis à jour + régression → **APPROVE** round 2. Suivi non-bloquant noté par Codex : pas de test resume dédié (logique identique via le helper testé).

---
## 2026-06-04 — Migration/infra — Phase 6 (refonte 5-sujets) : déblocage Neon + migration prod Phase 2/4

### Contexte
La prod Neon était suspendue par un garde-fou anti-drain : quota **projet** `compute_time_seconds = 72000` (20 CU-h) sur le projet `angeldesk` (`crimson-tooth-32900265`), dépassé à 20.33 CU-h → suspension persistante de TOUS les computes jusqu'à fin de période (≠ scale-to-zero). Diagnostic prouvé : psql brut sur les 2 endpoints (direct + poolé) renvoyait l'erreur quota au niveau protocole Postgres (donc pas Prisma/connection string). Cause = quota projet, pas le plan Launch ni la limite $20. Fix : quota relevé `72000 → 144000` (20→40 CU-h) via l'API Neon (PATCH project settings.quota) → compute redémarré immédiatement.

### Changements (gate Codex APPROVE)
- `prisma/schema.prisma` : ré-ajout de `@@index([dispatchEventId])` sur `Analysis` (Phase 2 — retiré du diff lors de la Phase 2 pour éviter le drift).
- `prisma/migrations/20260604120000_add_analysis_email_idempotency_and_dispatch_index/` : NOUVELLE migration — `ADD COLUMN analysisReadyEmailClaimedAt/SentAt TIMESTAMP(3)` (Phase 4) + `CREATE INDEX Analysis_dispatchEventId_idx` (Phase 2). SQL généré via `migrate diff` (lecture seule), **pas** `migrate dev` (`.env.local` = PROD → shadow DB/reset proscrits).
- **Dérive Thesis EXCLUE** : `migrate diff` remontait aussi `ALTER TABLE Thesis ALTER COLUMN sourceDocumentIds DROP DEFAULT` — dérive cosmétique pré-existante (la migration thesis-first-architecture a créé la colonne en `DEFAULT ARRAY[]`, le champ `String[]` n'a pas de `@default`). Bénigne, hors périmètre → exclue de cette migration (confirmé Codex). Restera visible dans `migrate diff` tant que non traitée séparément.

### Vérif
Appliquée en prod via `npx dotenv -e .env.local -- npx prisma migrate deploy`. `migrate status` = up to date (29 migrations). Introspection prod : les 2 colonnes email + l'index `Analysis_dispatchEventId_idx` présents. Client Prisma régénéré (v6.19.3). Gate Codex : **APPROVE**.

---
## 2026-06-04 — Tests/vérif — Phase 6 (refonte 5-sujets) : test du filet déterministe + vérification finale

### Contexte
Clôture de la refonte 5-sujets S1 (mémo Option B). Verrouillage comportemental du filet déterministe `buildDeterministicFallback` (le mémo ne doit jamais être vide/cassé) et vérification finale avant la décision utilisateur (merge/deploy/migrations/Neon).

### Changements (gate Codex APPROVE)
- `src/agents/tier3/__tests__/memo-generator-transform.test.ts` (+4 tests, test-only — runtime déjà APPROVE en 5a) : (1) le fallback reconstruit un `MemoGeneratorData` COMPLET (orientation = recommendation, evidenceSolidity null, criticalRisks = CRITICAL+HIGH, keyRisks enrichis severity/category/source, investmentHighlights vide, nextSteps depuis questions, dueDiligence.outstanding depuis questions CRITICAL) ; (2) orientation conservatrice sans scorer (1 CRITICAL → vigilance ; 2 → alert_dominant ; jamais favorable) ; (3) orientation = verdict canonique du synthesis-deal-scorer si dispo ; (4) verdict scorer invalide → dérivation conservatrice.

### Vérif finale
`tsc` clean (hors baseline `exit-strategist.ts` untracked). Suite unit COMPLÈTE : **4316 passed / 6 failed / 48 skipped** — les 6 rouges = `*-integration.test.ts` (evidence/evidence-signals) qui font `prisma.user.create` en beforeAll → **compute Neon capé par l'utilisateur** (anti-drain), baseline pré-existante hors périmètre. ZÉRO régression. Guards doctrine/mémo verts.

### Reste — BLOQUÉ sur décision utilisateur / infra (Neon capé)
Migrations Prisma à générer (`migrate dev`, Neon UP requis) : `@@index([dispatchEventId])` (Phase 2) + colonnes email Phase 4 (`analysisReadyEmailClaimedAt`/`analysisReadyEmailSentAt`, dans `schema.prisma` sans migration). Puis merge, deploy, application migrations Neon prod à la main, réactivation reaper Inngest, re-run Avekapeti. À arbitrer par l'utilisateur.

---
## 2026-06-04 — Doctrine/UI — Phase 5b (refonte 5-sujets) : scrub doctrine classe « verdict » + résidu Source

### Contexte
Suite Phase 5a : le mémo enrichi surface plus de texte LLM rendu. Le scrub doctrine au rendu (`scrubPrescriptiveDecisionLanguage`) ne couvrait que la classe « décision » (« prendre une décision »…). La classe **verdict binaire** (investissable, GO/NO-GO, « ne pas investir »/« il faut investir », rejeter/passer le deal, rédhibitoire) n'était pas neutralisée. Plus un résidu « Source: » orphelin après scrub d'un nom d'agent mid-string.

### Changements (5b — gate Codex APPROVE round 2)
- `analysis-v2/lib/presentation.ts` : `scrubPrescriptiveDecisionLanguage` ÉTENDU à la classe VERDICT (même boucle SEGMENT + même préservation du sujet INVESTISSEUR que la classe décision). Cible des CONSTRUCTIONS (verbe + objet deal), pas des mots nus → « thèse d'investissement », le rejet d'une hypothèse, « passer à l'étape », « montant investissable » NON touchés. `investissable` réécrit en constat **NEUTRE** dans les 2 formes (copule / objet-deal) — jamais de polarité (« non investissable » ne devient PAS « favorable », finding Codex round 1).
- **Contrainte source-scan** : `doctrine-guard.test.ts` scanne `presentation.ts` et bannit ces littéraux en clair. Les regex sont écrites avec `\s+`/classes pour ne pas inscrire les littéraux contigus, et les commentaires évitent de les épeler (round 0 local : commentaires épelaient les littéraux → corrigés). `doctrine-guard` 10/10.
- `analysis-v2/lib/presentation.ts` : `scrubAgentNamesFromText` retire le résidu « Source: »/« Sources: »/« Analyse: » mid-string suivi UNIQUEMENT de ponctuation/fin (LEADING_LABEL_PREFIX ne gère que la TÊTE). Edge cosmétique connu (double point possible), mais le label orphelin est retiré.
- Tests : `presentation.test.ts` (+7 : réécritures verdict, non-inversion polarité, préservation hypothèse/étape/thèse, préservation segment investisseur, résidu Source) ; fixture DÉDIÉE `HOSTILE_MEMO_VERDICT` (memo-generator généré, shape persisté, verdicts dans 11 champs rendus, séparée pour ne pas basculer la branche reconstituted) ; `doctrine-runtime-guard` test NON-VACUOUS (champs riches peuplés + walk-all zéro verdict/agent) + walk-all VM étendu.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 250 tests verts (analysis-v2 + tier3 + shared) ; 62 ciblés (presentation 37, doctrine-runtime-guard 15, doctrine-guard 10). Gate Codex : round 1 REQUEST_CHANGES (inversion polarité investissable) → constat neutre + test anti-inversion → **APPROVE** round 2.

---
## 2026-06-04 — Mémo/UI — Phase 5a (refonte 5-sujets) : enrichissement du mémo (Option B) + filet déterministe

### Contexte
Refonte 5-sujets, S1. Le mémo d'investissement était aminci sur toute la chaîne : le normalizer droppait `dbComparable`/`source` (highlights) et `severity`/`category`/`source` (keyRisks) alors que le LLM les produit ; le sélecteur ne surfaçait qu'une fraction des champs ; `companyOverview` (un OBJET) était lu via `stringAt` → toujours null. Décision produit verrouillée : **Option B** = mémo riche LLM + **mémo AUTONOME** (se suffit) + **filet déterministe** si l'appel LLM échoue. Modèle `memo-generator` pinné **GEMINI_PRO**.

### Changements (5a — enrichissement, gate Codex APPROVE round 2)
- `src/agents/types.ts` + `src/agents/type-modules/tier3.ts` : `MemoGeneratorData.investmentHighlights` (+`dbComparable?`, +`source?`) et `keyRisks` (+`severity?`, +`category?`, +`source?`). Champs optionnels, 2 défs gardées EN SYNC (`type-modules/tier3.ts` est un module orphelin — aucun importeur — synchronisé par sécurité anti-drift).
- `src/agents/tier3/memo-generator.ts` (normalizer) : arrête de dropper les champs riches (2 branches : LLM natif + fallback red flags), pattern conditionnel identique à `criticalRisks`.
- `src/agents/tier3/memo-generator.ts` (execute) : `model:"GEMINI_PRO"` + `maxTokens:32000` explicites ; appel LLM wrappé en try/catch → sur throw (troncature fail-closed, parse, timeout) bascule sur `buildDeterministicFallback`. La chaîne model-aware du router (GEMINI_PRO→HAIKU) reste active avant le throw.
- `src/agents/tier3/memo-generator.ts` (NEW `buildDeterministicFallback`) : reconstruit un `MemoGeneratorData` COMPLET et AUTONOME depuis `consolidatedRedFlags`/`consolidatedQuestions`/`deal`. Orientation = verdict canonique du synthesis-deal-scorer si valide (cohérence ScoreBadge), sinon dérivation CONSERVATRICE par counts de sévérité (jamais « favorable » — anti-fabrication). `investmentHighlights=[]` (pas de positif fabriqué).
- `prompts/memo-generator-prompt.ts` + bloc inline : concision assouplie (mémo autonome ~700-1200 mots), invariant anti-troncature conservé ; exemple « BON OUTPUT » verdict dé-impérativé ; « investissable » ajouté à la liste INTERDIT du prompt.
- `analysis-v2/lib/selectors.ts` : BUG `companyOverview` corrigé (objet → prose scrubée) ; surface `investmentHighlights`/`keyRisks`(rich)/`financialSummary`/`teamAssessment`/`marketOpportunity`/`competitiveLandscape`/`dealTerms`/`dueDiligence`. **Chaque** champ rendu passe par `cleanRenderedText` (y compris le LABEL des métriques `financialSummary` — finding Codex round 1).
- `analysis-v2/sections/memo-section.tsx` : blocs riches du mémo autonome (types dérivés via `Extract<MemoSectionModel,{kind:"generated"}>`).

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 225 tests verts sur les 2 zones touchées (`analysis-v2/__tests__/` + `tier3/__tests__/`) + nouveau test scrub label `financialSummary`. Baseline rouge inchangée (Neon capé : 6 `*-integration` + 5 coaching/live). Gate Codex : round 1 REQUEST_CHANGES (label `financialSummary` non scrubé) → corrigé + test → **APPROVE** round 2. Phase 5b (scrub doctrine classe « verdict » + guard/fixture/tests) = commit suivant.


---

### Contexte
Sur une analyse Avekapeti rendue en prod, l'utilisateur a vu deux défauts : (#1) rank « Score de consistance insuffisant » avec « l'analyse n'est pas suffisamment fiable **pour prendre une decision** » / « baser une **decision d'investissement** » → **violation frontale de « Angel Desk ne décide jamais »** ; (#2) « La société Avekapeti**.** parie… » (faux point dans le `reformulated` LLM). Aggravation : la Phase 4 (fin des troncatures) affichait désormais le texte prescriptif en entier, et les guards doctrine ne couvraient pas la classe « décision ».

### Changements
- `lib/presentation.ts` : `scrubPrescriptiveDecisionLanguage(text)` — reformule les tournures où l'outil/l'analyse est présenté comme le LIEU de la décision (« fiable pour prendre une décision », « baser une décision d'investissement », « capacité à prendre une décision éclairée »). Précis ; ne touche PAS « à vous de décider » / « la décision revient à l'investisseur » ni la typographie FR. + `fixFalseSentencePeriod(text)` (#2, display-only, ciblé « société {Nom}. minuscule »).
- `lib/selectors.ts` : `cleanRenderedText` = scrub agents + anti-prescriptif, appliqué aux textes RENDUS (ranks title/description/evidence, QM, mémo criticalRisks/nextSteps/topPriorities/forNegotiation, signaux oneLiner/supports/concerns) → **corrige rétroactivement les analyses persistées** (pas de re-run).
- `sections/thesis-section.tsx` : `fixFalseSentencePeriod` sur le corps des cartes thèse (#2).
- Source (futures analyses) : `tier3/contradiction-detector.ts` (red flag reformulé, plus de « pour prendre une décision ») + `prompts/contradiction-detector-prompt.ts` (template l.128).
- Guard : fixture hostile + assertion VM « zéro tournure prescriptive décision dans ranks/mémo/signaux » + unit tests scrub (phrases exactes + négatifs doctrine) + fixFalseSentencePeriod.

### Couverture (corrections Codex F1-F4)
- F1/F2 : scrub appliqué à TOUTES les surfaces rendues (favorable/vigilance, mémo généré+reconstitué, thèse cards/loadBearing/alerts, evidence-collector — passe finale anti-prescriptif seule, pour préserver l'espace FR « : » du claim de contradiction).
- F3 : scrub SEGMENT-AWARE — ne reformule jamais un segment où l'INVESTISSEUR est le sujet de la décision (« l'investisseur conserve la capacité à prendre une décision » intact).
- F4 : `fixFalseSentencePeriod` borné à 1-3 tokens capitalisés accolés au point (ne fusionne pas « société X opère en France. elle… »).
- Guard : walk-all sur le view-model complet (zéro tournure prescriptive sur toutes surfaces).

### Vérif
analysis-v2 53 tests ; suite unit complète 4338 passed / 2 skipped ; tsc clean (hors `exit-strategist.ts`). Gate Codex : APPROVE (après 1 REQUEST_CHANGES — couverture P0 incomplète + sujet investisseur + period helper).


