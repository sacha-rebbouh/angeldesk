# Plan — Durabilité du pipeline Deep Dive (full_analysis)

> Document versionné, destiné à audit (Codex) puis exécution **incrémentale**.
> Source de vérité = `tsc` / `vitest` / `git`, **jamais** l'affichage Read (qui a corrompu le multi-lignes lors de sessions précédentes → utiliser des codemods Node sur octets disque + `grep -c` pour vérifier).
>
> Branche : `fix/thesis-gate-guard` (= `main` `ff87da4` + C2a `de02b77`). **`main` n'est PAS touché** avant l'étape I, flag OFF.

---

## 0. Cause racine (vérifiée)

Un Deep Dive `full_analysis` exécute Tier 0→0.5(thèse)→1→2→3 dans **UNE seule step Inngest** `step.run('run-analysis')` (`src/lib/inngest.ts:328`), qui appelle tout `orchestrator.runAnalysis` → `runFullAnalysis` d'un bloc. La step est plafonnée à **300s** par Vercel (`src/app/api/inngest/route.ts` `maxDuration=300`). L'orchestrateur (`src/agents/orchestrator/index.ts`, 4724 lignes) n'a **aucune frontière `step.run` interne**.

**Conséquence** : dès qu'un agent ou la glue inter-agents (sélection expert secteur, consensus, reflexion, funding-DB) pousse le wall-clock au-delà de 300s, Vercel tue la fonction mid-step → la ligne `Analysis` reste `RUNNING` à vie (zombie).

**Données réelles (DB, `totalTimeMs` des `full_analysis` COMPLETED)** : p50 = 21 min, max = 30 min, **6/8 runs > 800s**. → Le pipeline dépasse structurellement tout budget de step unique. **Monter `maxDuration` ne suffit pas** (plafond plateforme < 21 min). Le **split en steps durables est obligatoire**.

Hypothèse cap-table **falsifiée** (DB) : avekapeti A une cap table ; `cap-table-auditor` n'a jamais tourné ; 0 `empty_response` sur 7 jours. Le gel n'est pas lié à un agent « sans données » mais au budget de step.

---

## 1. État déjà livré (ne pas refaire)

### En PROD (`main` `ff87da4`, build vert, Inngest synced)
- **Watchdog `reapStaleAnalyses`** (`src/lib/analysis-compensation.ts`) — cron Inngest `staleAnalysisReaperFunction` `*/5`. Toute analyse `RUNNING` sans activité (dernier checkpoint, sinon `startedAt`) depuis > 20 min → `FAILED` + refund + deal `IN_DD`. Flip atomique `updateMany where status RUNNING` → refund **une seule fois** (anti double-spend). + route Vercel fallback `/api/cron/reap-stale-analyses`. 6 tests.
- **Fix B router** (`src/services/openrouter/router.ts`) — `completeJSON` ne déclenche plus le fallback cross-family GEMINI_PRO→HAIKU sur `empty_response`.

**Effet** : plus de gel PERMANENT (zombie reapé ≤ 5 min). **NE garantit PAS la complétion** d'un Deep Dive dont une étape dépasse 300s.

### Sur la branche `fix/thesis-gate-guard` (NON poussé ; dernier HEAD **code** `e274d24` — Phase 1 C.3g→C.3m terminée ; commits docs au-dessus)
- **C2a** — helper `persistTierCheckpoint` (`src/agents/orchestrator/index.ts`, `state:'ANALYZING'`) appelé à 4 frontières dans `runFullAnalysis` (avant STEP 3 / après Tier 1 / avant STEP 6 / avant STEP 7). Rend une analyse tuée mid-pipeline reprenable au lieu de `RUNNING`-sans-checkpoint (que `resume` marquait `FAILED`). **Prérequis du split.** tsc 0, 4069 tests verts.
  - **Précision (audit Codex #7)** : `saveCheckpoint` crée **une ligne `AnalysisCheckpoint` à chaque frontière** (effet réel : +N rows). Seul l'`update` de `Analysis.results` est RUNNING-gated. Ce n'est donc PAS « aucun effet absolu » — c'est « pas de régression de la sortie finale ».
- **B (FAIT)** — DTO strict `FullAnalysisStepState` + garde `assertPlainJson` + helpers snapshot `AnalysisCheckpoint state:"STEPWISE:<unit>"` + tests (round-trip, négatif à dents, funding-DB drift). Validé Codex.
- **C.1 → C.3f (FAIT)** — 13 helpers byte-inert extraits de `runFullAnalysis`, 1 commit + 1 audit Codex chacun, tsc 0 + vitest orchestrateur 75/75 à chaque pas : `initializeFullAnalysisRun`, `buildBaseAnalysisContext`, `runTier0Step`, `runDocumentExtractorStep`, `runDeckCoherenceStep`, `runContextEngineStep`, `runThesisExtractionStep`, `runTier1Phase`/`runTier1Phases`, `runPostTier1Aggregation`, `runPostTier1FailFast`, `runGlobalConsensusStep`, `runPostConsensusCostLimit`, `runTier1CrossValidationStep`.
- **C.3g → C.3m (FAIT, 2026-06-01)** — 7 derniers helpers byte-inert extraits, 1 commit + 1 audit Codex APPROVE chacun, tsc 0 + vitest 75/75 à chaque pas : `runRedFlagConsolidationStep` (`1051981`), `runSynthesisSetupStep` (`1e6264f`), `runTier3PreTier2Batch` (`bddc0be`), `runTier2SectorStep` (`39b9c69`), `runTier2ConsensusReflexionStep` (`b62880e`), `runTier3PostTier2Batch` (`3ba1b3f`), `runFinalCompletion` (`e274d24`). **`runFullAnalysis` est désormais un pur séquenceur de helpers + le `catch` final inline** (caveat non bloquant : la branche `stopAfterThesis` reste inline, préexistante hors chemin Deep Dive complet).

---

## 2. Objectif

Un Deep Dive **complète toujours** (ou échoue proprement + refund), **quel que soit** le wall-clock, **sans changer un prompt / output / schéma / directive anti-hallucination**. Moyen : découper `runFullAnalysis` en **unités durables** (step Inngest par phase Tier1 A/B/C/D + par batch Tier3), chacune < 300s, l'état survivant entre steps via un DTO sérialisable + snapshot DB. Réutiliser le checkpoint/resume existant. Tout derrière un flag `DEEP_DIVE_STEPWISE` (OFF = code actuel exact = rollback instantané).

---

## 3. Invariants (à ne jamais casser)

1. **Byte-équivalence — scindée en 3 claims distincts** (audit Codex v2 #1) :
   - **E1** : single-pass vs stepwise sur **run neuf sain** → sortie identique.
   - **E2** : kill/resume vs run ininterrompu → identique, **seulement après** unification du resume (étape G).
   - **E3** : compatibilité UI/PDF/Findings sur **analyses historiques** (qui changeront de richesse après G).
2. **Crédits** : 1 débit au dispatch (`POST /analyze`), 1 refund keyé via compensation sur échec persistant. Le split n'introduit **aucun** débit/refund supplémentaire.
3. **Coûts LLM / logs / side-effects** (audit Codex v2 #6) : NE doublent PAS sur retry → mécanisme « agent result déjà présent ⇒ skip » (agent + `processAgentResult` + writes), réutilise le `completedSet` du resume.
4. **Pas de boucle infinie** : complétion bornée OU FAILED+refund.
5. **Watchdog compatible** : un run stepwise sain n'est jamais reapé en cours.
6. **`main` jamais cassé** : chaque incrément vérifié (`tsc` + `vitest` ciblé, sortie **relue** avant tout commit) AVANT commit ; jamais d'édition à l'aveugle (codemod Node + `grep -c`). **Ne jamais commiter si tsc ≠ 0.**

---

## 4. Faits vérifiés (sous-agent Explore, process propre — base de C/D/E)

- **completedSet** (corrige audit Codex #1) : **PAS** à `index.ts:4114-4121` (c'est le recovery load). Il est construit dans `_resumeAnalysisImpl` **après le merge checkpoint/DB** — re-localiser exactement au moment de coder.
- **DebateRecord** (`schema.prisma:912`) : `contradictionId @unique` (ligne 917), **pas** de composite. → upsert **par `contradictionId`**. **[FAIT D.1 `b94528c`]** `persistDebateRecord` passé en `upsert`. ⚠️ **précondition seulement** : `contradiction.id` = `crypto.randomUUID()` (`consensus-engine.ts:922`) ET `finding.id` aussi (`score-aggregator.ts:409`) → l'upsert dédupe le re-persist du MÊME objet, PAS une re-détection ; l'idempotence débat réelle vient du **snapshot-carry des contradictions** (porter les objets + ids, pas seulement `_consensus_resolutions`).
- **ScoredFinding** (`schema.prisma:849`) : **AUCUNE contrainte unique**, pas de natural key. `persistScoredFindings` (`persistence.ts:320`) = `createMany` INSERT-only → double-write sur replay. **[FAIT D.2 `4370320`]** delete + insert transactionnel par `(analysisId, agentName)` — **idempotent en soi** (pas de dépendance au carry). Early-return sur 0 finding conservé (ne converge pas si un agent passe N→0 au replay → couvert par D.4 skip-agent).
- **FactEvent** (`schema.prisma:1971`) : `@@unique([dealId, factKey, createdAt, eventType])` = `factEvent_natural_key`. **[CONFIRMÉ D.3 — PAS de fix isolé]** `createFactEventsBatch` (`fact-store/persistence.ts:175`) = `$transaction(facts.map(create))` ; `buildFactEventCreateData` (:88) **ne pose pas `createdAt`** → défaut `now()`. Donc la clé naturelle change à chaque replay → `skipDuplicates`/`upsert` **ne dédupent rien**. Les FactEvents sont un **journal append-only** (chaînes SUPERSEDED) → delete+insert INTERDIT (≠ ScoredFinding). Fix possible UNIQUEMENT couplé au stepwise : (a) `createdAt` = timestamp de run **stable porté dans le StepState** + `skipDuplicates` sur la clé naturelle, OU (b) step-memoization Inngest (la step Tier 0 d'extraction de faits ne re-tourne pas au replay). → traité au **câblage stepwise (D.5+)**, pas en couche persistance.
- **processAgentResult** (`persistence.ts:407`) écrit en DB selon le type d'agent : `document-extractor`→`deal.update` (:526) ; `red-flag-detector`→`redFlag.createMany` (:544) ; `synthesis-deal-scorer`→`deal.update` scores (:576) ; `conditions-analyst`→`deal.update` (:601) ; `team-investigator`→`$transaction` founder.update+createMany (:696). → si result déjà `success`, **ne pas rerun l'agent NI `processAgentResult` NI réécrire findings/debates**. Skip **AVANT** tout side-effect.
- **costMonitor** (`cost-monitor.ts`) : `recordCall` **no-op si `currentAnalysis` null** (:243, pas de throw) ; `endAnalysis` lit l'accumulateur **EN MÉMOIRE** seulement (pas de DB read). → état **non cross-step** : ne pas en dépendre entre steps (DB/log-derived, ou re-start par step).
- **setAnalysisContext** (`router.ts:68`) = **AsyncLocalStorage** via `runWithLLMContext` (:32). → chaque step Inngest doit **re-wrapper** dans `runWithLLMContext({ analysisId })` avant tout appel LLM, sinon `LLMCallLog` perd `analysisId`. Sites actuels : `index.ts` 572/705/992/1287/1465/4360.
- **Snapshot DB tranché** (audit Codex #3) : réutiliser **`AnalysisCheckpoint`** avec `state:"STEPWISE:<unit>"` + `results` (Json) = le `StepState` sérialisé. Write = `writeStepwiseSnapshot` (= `prisma.analysisCheckpoint.create` **DIRECT** — **PAS** `saveCheckpoint`, qui merge son `results` dans `Analysis.results`) ; read = `readLatestStepwiseSnapshot` (= `findFirst`). Helpers livrés en étape B (`full-analysis-snapshot.ts`). **Pas de nouvelle table.** Décidé d'emblée (ne pas attendre le câblage) car le payload `step.run` peut dépasser le cap Inngest.

---

## 5. Roadmap (incréments livrables, ordre STRICT — chaque étape auditée par Codex avant la suivante)

### A — C2a (FAIT, `de02b77`)
À auditer (forme checkpoint, RUNNING-gate, précision « +N rows »). Vérif : `tsc` 0 ; `vitest src/agents/orchestrator` vert.

### B — Type `FullAnalysisStepState` + snapshot + tests (FAIT, validé Codex)
- Type **sérialisable strict** (DTO, pas un `EnrichedAgentContext` déguisé — audit #2). Champs : `version, analysisId, dealId, analysisType, totalAgents, completedCount, totalCost, lastUnit, done, allResults, previousResults/consensusResolutions, factStoreFormatted, verificationContext, tier1CrossValidation, consolidatedRedFlags`.
- **Garde runtime** `assertPlainJson` (rejette Date / Map / Set / function / undefined / NaN / instances de classe, chemin fautif renvoyé), `serialize`/`deserialize` versionnés, validation des scalaires au load.
- **Helpers snapshot read/write** via `AnalysisCheckpoint` `state:"STEPWISE:<unit>"`.
- **Tests** : round-trip/carry ; négatif (drop `verificationContext` ⇒ deep-equal échoue) ; funding-DB drift (passe SSI `verificationContext` est **porté**, pas reconstruit).

### C — Extraction des méthodes par-phase (byte-inert, flag OFF)
**C.1 → C.3m : FAIT** (cf. §1). `runFullAnalysis` est désormais un **pur séquenceur** de helpers (initialize → tier0/thèse → tier1 → post-tier1 → consensus global → cross-val → red-flags → synthesis-setup → tier3-pré → tier2-sector → tier2-consensus/reflexion → tier3-post → final-completion) + le `catch` final inline.

**Phase 1 — TERMINÉE (2026-06-01).** Les 7 micro-étapes C.3g → C.3m ont été extraites byte-inert (mapping commits en §1), chacune `tsc` 0 + vitest 75/75 + audit Codex APPROVE. La table ci-dessous documente les contrats réalisés (à noter : `runTier3PreTier2Batch` (C.3i) et `runTier3PostTier2Batch` (C.3l) mutent aussi `enrichedContext.previousResults` par réf ; `runTier2ConsensusReflexionStep` (C.3k) mute `allResults` via `applyReflexion`). Numéros de ligne périmés (le fichier a évolué) :

| Étape | Bloc | Lignes ≈ | Helper | Contrat |
|---|---|---|---|---|
| **C.3g** | STEP 4.6 red-flag consolidation (`try/catch`, `consolidateRedFlags`, inject) | 2455–2475 | `runRedFlagConsolidationStep` | mute `enrichedContext.consolidatedRedFlags` par réf ; **void** |
| **C.3h** | STEP 5 setup synthèse (`startSynthesis`, `getTier3Agents`, BA prefs, `DealTerms`/`DealStructure`, `conditionsAnalystMode`) | 2476–2540 | `runSynthesisSetupStep` | mute `enrichedContext` par réf (baPreferences/dealTerms/dealStructure/conditionsAnalystMode) ; retourne **`{ tier3AgentMap }`** uniquement (seul local consommé downstream — 2554/2578/2733) |
| **C.3i** | Tier 3 **pré-Tier2** batch (conditions/contradiction/devil's-advocate) + cost-check « skip Tier 3 » **+ `persistTierCheckpoint`** | 2541–2627 | `runTier3PreTier2Batch` | mute `allResults` ; **inclut le `persistTierCheckpoint` final (L.2627)** ; retourne `{ totalCost, completedCount }` (gated, pas de return terminal) |
| **C.3j** | STEP 6 expert sectoriel Tier 2 (si secteur détecté) | 2629–2675 | `runTier2SectorStep` | mute `allResults` ; retourne agrégats coût/compteur |
| **C.3k** | STEP 6.5 consensus + reflexion Tier 2 (+ `persistTierCheckpoint` L.2710) | 2676–2711 | `runTier2ConsensusReflexionStep` | mute `allResults` ; retourne agrégats |
| **C.3l** | STEP 7 synthèse finale Tier 3 (après Tier 2) + persist `thesis-reconciler` | 2712–2800 | `runTier3PostTier2Batch` | mute `allResults` ; retourne agrégats. **Si diff trop gros : batch d'abord, completion (C.3m) après — déjà séparés.** |
| **C.3m** | Complétion terminale succès (`stateMachine.complete` + `generateFullAnalysisSummary` + `completeAnalysis` + `return addWarningsToResult`) | 2801–2885 | `runFinalCompletion` | retourne `AnalysisResult` → caller `return this.runFinalCompletion(...)`. Le **`catch (error)` final (2886–2927) RESTE** dans `runFullAnalysis`. |

- **Test E1 avant/après CHAQUE extraction** (pas un seul gros harness en fin). Flag OFF = byte-inert. Codemod Node sur octets disque (bloc pris par slice de lignes, dé-indent, insertion `split/join` — jamais `.replace`, piège `$$`). Vérif `tsc`=0 (relu, call séparé) + vitest 75/75 + diff = déplacement net.

### D — Idempotence + câblage Inngest stepwise (conçus ENSEMBLE — audit v2 #5)
- **D.1 FAIT** (`b94528c`) `persistDebateRecord` → upsert par `contradictionId` (précondition ; idempotence réelle via snapshot-carry). **D.2 FAIT** (`4370320`) `persistScoredFindings` → delete+insert transactionnel par `(analysisId, agentName)` (idempotent en soi). **D.3 CONFIRMÉ** : `createFactEventsBatch` non idempotent isolément (`createdAt` auto-`now()` dans la clé naturelle, journal append-only) → fix couplé au stepwise (cf. §4 FactEvent), PAS de change persistance isolé.
- **D.4 / D.4b / D.4c-1 / D.4c-3a FAIT** (resume-guard `STEPWISE:*` sur 5 chemins ; init idempotent `dispatchEventId` ; thesis-extractor replay-équivalent ; `cleanupOldCheckpoints` legacy-only). 3 migrations appliquées prod. D.4c-2 (redFlag) RETIRÉ (hors flux full_analysis).
- **D.5c FAIT** (`5735e3a`, gated APPROVE) — golden harness INFRA : `step-runner.ts` (StepRunner + InlineStepRunner/InngestStepRunner/FakeStepRunner mémoïsation+round-trip wire+kill/resume + runStepwiseUntilDone). 10 tests (E1, E2, négatif à dents, intégration bridge).
- **DESIGN D.5d v4 VALIDÉ CODEX** (4 tours) — driver stepwise durable. **Modèle B** (rehydrate seulement si `!bodyRan` au replay → E1 STRUCTUREL) ; driver UNIFIÉ (Inline OFF byte-inert / Inngest ON hors step externe) ; bootstrap non mémoïsé (start() dedans) ; unités durables tier0-facts→tier0-thesis→tier1-a/b/c/d→post-tier1-glue→tier3-pre→tier2-sector→tier3-post ; `terminalResult` early-returns ; `transitionCount` cumulatif (summary E2===E1) ; persistStateTransition = télémétrie hors invariant (résiduel D.6). Golden d-1 SCOPE révisé (Codex APPROVE) : golden au niveau DRIVER (helpers stubés, pas full-LLM-mock — E1 garanti structurellement par modèle B) ; E1 plein-pipeline réel = go/no-go preview D.6.
- **D.5d-1a FAIT** (`b3d3129`, gated APPROVE) — fondations driver : DTO +`tier0-facts` (unité FactEvent isolée) +`terminalResult` +`transitionCount` ; state machine `getTransitionCount`/`restoredTransitionBase`/`getSummary` via getter + `restoreFromStepState(transitionCount)`. vitest orchestration+orchestrateur 233.
- **D.5d-1 FAIT (driver foundation, 5 commits gated APPROVE)** :
  - **D.5d-1b** (`d42d1a5`) extraction byte-inert du corps → `runFullAnalysisPipeline` (bootstrap séparé du séquenceur).
  - **D.5d-1c** (`e9a75a0`) wrapper « 1 step englobante » Modèle B : `runTerminalStepwiseDriver` (module à dépendances injectées, testable sans DB) ; OFF (InlineStepRunner) byte-inert ; ON → step durable unique ; enveloppe terminale `buildTerminalEnvelope` (EXCLUT `results`=allResults, cap 4 MB Inngest) + `reviveTerminalEnvelope` (ravive earlyWarnings[].timestamp seul) ; `results` relu via `loadResults` au replay. Golden driver (E1/E2/OFF-byte-inert/dents-Date). `AnalysisOptions.stepRunner`.
  - **D.5d-1d** (`173c3e1` + fix `494f6d6`) inngest ON : runAnalysis HORS du step.run externe + `new InngestStepRunner(step)` (cast Jsonify<T>≡T) ; `dispatchEventId` threadé → `createAnalysis` get-or-create. **Fix gate Codex P0** : get-or-create matche TOUT STATUT (pas que RUNNING — sinon replay-après-complétion crée un run zombie + loadResults sur mauvais id) ; **mode stepwise STICKY** (`event.data.stepwise` décidé au dispatch, immuable → pas de changement de graphe en vol).
  - Nits non bloquants 1d (dette) : commentaire `schema.prisma:664` parle encore de RUNNING ; défense optionnelle `&& type==='full_analysis'` dans le handler.
- **DESIGN SPLIT d-2..k VERROUILLÉ + APPROVE CODEX** (thread `019e84c8-4e63-7583-88f5-f78b96167fc6`, 3 tours design-gate). **Blueprint final (ON v2)** :
  - **OFF strict** : `runFullAnalysis` après init → `if(!init.stepwise) return runFullAnalysisPipeline(...)` EXACT (zéro driver/snapshot, byte-inert prod). Sinon `runFullAnalysisStepwise(...)`.
  - **Unités durables** : `tier0-facts`(step FRÈRE, retourne un DTO wire de TOUTE la mutation runTier0Step : factStore+factStoreFormatted+founderResponses+totalCost/completedCount+`allResults["fact-extractor"]`) → `tier0-thesis`(doc-extractor+deck-coherence+context-engine+thesis, 1er SNAPSHOT, enrichedContext complet, `lastUnit="tier0-thesis"`) → [early-returns terminaux à IDs dédiés] → `post-tier1-glue`(Tier1 ENTIER transitoire MESURÉ wall-clock, snapshot, `tier1Findings` porté) → `tier3-pre`(snap) → `tier2-sector`(snap) → `tier3-post`(snap) → **terminal final durable** (runFinalCompletion en enveloppe, ID `terminal-final-completion`).
  - **5 LOCKS Codex** : (1) `stepwiseGraphVersion` EXACT (undefined|1→driver 1-step ; 2→graphe d-2b ; 3→d-3 ; … chaque changement de graphe = sa version, sinon un run en vol reprend sur le mauvais graphe). (2) `tier0-facts` = step de SORTIE (pas snapshot unit) : sur memo hit on applique le DTO retourné, on NE lit PAS readLatestStepwiseSnapshot (peut ne pas exister) ; rehydrate UNIQUE commence au 1er step ayant RÉELLEMENT écrit un snapshot (`tier0-thesis`+). (3) DTO de sortie tier0-facts = TOUTE la mutation runTier0Step (pas juste 3 champs). (4) `tier1Findings` DTO v3 + reviver `createdAt` (allFindings = ids crypto.randomUUID + createdAt, NON re-dérivables byte-identique car réutilisés au consensus Tier2-secteur). (5) `runTerminalStepwiseDriver(stepId)` paramétrable (l'ID = clé de mémoïsation Inngest) + IDs terminaux distincts.
  - **Rehydrate UNIQUE** : `let rehydrated=false` ; au 1er step mémoïsé ayant un snapshot → assert(snapshot présent, `lastUnit ≥ unit`, transitionCount restauré) → réassigne liveCtx (enrichedContext, allResults, verificationContext, collectedWarnings, totalCost, completedCount, factStore, factStoreFormatted, founderResponses, extractedData, deckCoherenceReport, tier1Findings via rehydrateContext ; tier3AgentMap re-construit via getTier3Agents ; lowConfidenceAgents re-dérivé log-only).
  - **Séquencement gated** : **d-2a** (additif byte-inert) = DTO v3 (`tier1Findings`+reviver) + `runTerminalStepwiseDriver(stepId)` paramétrable + `stepwiseGraphVersion` (constante code stampée au dispatch, routing exact) + tests. **d-2b** = 1re vraie unité `tier0-facts`(frère) + `tier0-thesis`(snapshot) + `rest`(terminal transitoire ID dédié), active graphe v2. **d-3** `post-tier1-glue`(Tier1 entier, MESURER wall-clock d'abord). **d-4** `tier3-pre`. **d-5** `tier2-sector`. **d-6** `tier3-post`. **d-7** `terminal-final-completion`. Golden E1 + E2-par-frontière à CHAQUE commit. Puis **D.6** activation flag/version preview→prod (+ go/no-go FactEvent réel), **F** watchdog recalibration, **G** unification resume.
- **PROCHAIN = d-2a** (design APPROVE). Gate thread Codex `019e84c8-4e63-7583-88f5-f78b96167fc6`.
- **D.5b FAIT** (4 sous-étapes gated APPROVE) — **contrat d'état complet** (DTO + pont live↔wire + restore), ADDITIF/byte-inert. Design gaté à part (1 REQUEST_CHANGES→APPROVE). Stratégie **CARRY > REBUILD** (byte-safe : `evidenceLedger.generatedAt` wall-clock → rebuild driverait les prompts). b-1 (`9bcabb0`) `FullAnalysisStepState` v1→v2 (~20 champs wire + validation table-driven, version 2) ; b-2 (`e9c0ffb`) `buildStepState` via normalizer STRICT (Date→ISO, LÈVE sur NaN/Map/Set/classe — gate Codex) dans `full-analysis-step-state-bridge.ts` ; b-3 (`0ec00b4`) `rehydrateContext` (revivers Date stricts incl. `canonicalDeal.documents[]` — gate Codex ; pas de `attachEvidenceLedger` ; round-trip build∘rehydrate∘build===build) ; b-4 (`b801e06`) `AnalysisStateMachine.restoreFromStepState` (UNIT_TO_STATE, dérive l'état du set recordable d'allResults). vitest orchestration+orchestrateur 220.
- **D.5a FAIT** (`1fa3dbf`, gated APPROVE 1er tour) — driver stepwise **FONDATION**. Flag `DEEP_DIVE_STEPWISE` + branche `dealAnalysisFunction` (OFF = `step.run('run-analysis')` runtime-identique via spread `...{}` ; ON = stub single-pass `stepwise:true`) + **D.4c-3b** : conditionnement des 3 sources de checkpoint legacy en mode stepwise — state machine `enableCheckpointing: !stepwise` (coupe périodique+transition+flush ET le checkpoint FAILED), `persistTierCheckpoint` early-return, `runFinalCompletion` garde le `saveCheckpoint("COMPLETED")` sous `if(!stepwise)` (completeAnalysis canonique conservée). **INVARIANT « zéro checkpoint legacy en stepwise » tenu sur succès ET échec.** Threading **explicite** (orchestrateur singleton + concurrency 3 → pas d'état d'instance ; param `stepwise` REQUIS → tsc=0 prouve la couverture). `writeStepwiseSnapshot` PAS encore câblé (D.5d) : D.5a ne fait que SUPPRIMER les legacy. `StepRunner` **différé à D.5c/D.5d** (Codex APPROVE : abstraction morte en D.5a). tsc 0, vitest 90/90 orchestrateur. Gate thread #2 `019e8433-…` (thread #1 expiré).
- **Reste (couplé, conçu ensemble)** : **D.4** skip agent déjà `success` **avant tout side-effect** (`completedSet`). **D.5+** chaque step re-wrappe `runWithLLMContext({ analysisId })` ; un `step.run` par méthode sous le flag ; OFF = `step.run('run-analysis')` actuel inchangé ; State via snapshot `AnalysisCheckpoint` `STEPWISE:<unit>` + token (StepState portant `_consensus_resolutions`+objets contradictions/ids, `tier1CrossValidation`, `consolidatedRedFlags`, `factStoreFormatted`, `verificationContext`, timestamp de run stable) ; **Splitter unit D (7 agents) en sub-steps par agent** UP FRONT ; Dispatcher lit le marqueur `done` ; échec → même handler de compensation = 1 refund keyé ; golden harness AVANT activation.
- Chaque step re-wrappe `runWithLLMContext({ analysisId })`. Un `step.run` par méthode sous le flag ; OFF = `step.run('run-analysis')` actuel inchangé. State via snapshot `AnalysisCheckpoint` `STEPWISE:<unit>` + token. Dispatcher lit le marqueur `done` (cost-limit early-return, thesis-reconciler conditionnel — pas de séquence hardcodée). Échec → même handler de compensation = 1 refund keyé.

### F — Watchdog recalibration
Confirmer que chaque `persistTierCheckpoint` rafraîchit le clock de staleness ; seuil reaper > (max wall-clock d'une unité + latence inter-step). Guard test.

### G — Unification du resume (EN DERNIER)
Router `_resumeAnalysisImpl` via les méthodes partagées → résout l'asymétrie qualité (le resume gagne consensus/cross-val/red-flags/`persistScoredFindings` qu'il skippait). ⚠️ Vérifier qu'aucun consommateur (PDF, UI score badge, dashboard Findings, snapshot test) n'assert l'ancienne forme « thin » (E3). Test E2 kill/resume == ininterrompu.

### H — Hard walls C1 (APRÈS le split)
`withHardWall(label, fn, wallMs)` autour de la glue non bornée (`getTier2SectorExpert`, `detectContradictions`, funding-DB `Promise.all`, consensus/reflexion). **NE PAS** présupposer que chaque site « dégrade gracieusement » sans **test par call-site** (audit v3 #8 : certains appels peuvent laisser un état partiellement muté). Valeur du mur = timeout configuré de l'agent + buffer (pas un global 310s). Résiduel connu : Promise.race n'abort pas le Prisma sous-jacent → follow-up AbortController, hors scope.

### I — Activation progressive
Merge → `main` flag **OFF** (code dormant). Preview `DEEP_DIVE_STEPWISE=1` → Deep Dive lourd réel → vérif complétion + multiples steps dashboard + pas de double-charge (LLMCallLog) + pas de doublon (Findings) + watchdog OK. Puis prod. Rollback = `DEEP_DIVE_STEPWISE=0` (instantané, pas de migration DB).

---

## 6. Interdits (standing, sur toute la suite)
- **1 micro-étape = 1 commit = 1 audit Codex**, ordre strict, pas de saut, pas de regroupement. Refactor et docs **jamais** dans le même commit.
- Ne pas toucher : Inngest / flag `DEEP_DIVE_STEPWISE` / schéma / migrations / prompts / schemas / agents / directives anti-hallucination — sauf si explicitement dans le périmètre de l'étape en cours (Phases 2+).
- Ne pas toucher les fichiers untracked préexistants (`api-key-auth.ts`, `api-logger.ts`, `webhook-dispatcher.ts`, `scripts/*`).
- **Ne jamais commiter si `tsc` ≠ 0** (lire la sortie tsc dans un appel SÉPARÉ avant le commit). **Ne jamais pousser** (Sacha contrôle push/merge).

## 7. Faux blocker écarté
« Corruption disque de `inngest.ts` » (relevé par un critic) = artefact d'affichage de session ; `tsc --noEmit` = 0, fichier valide.
