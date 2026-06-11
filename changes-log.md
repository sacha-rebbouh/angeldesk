# Changes Log - Angel Desk

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
## 2026-06-04 — UX/infra — Phase 4 (refonte 5-sujets) : masque « analyse en cours » + email idempotent

### Contexte
Refonte 5-sujets (S4, Phase 1 seule). Une analyse Deep Dive est longue ; rien n'empêchait l'utilisateur de naviguer ailleurs en croyant l'analyse perdue. Objectif : masque plein écran au niveau page/onglets pendant qu'une analyse tourne + email « analyse prête » à la complétion. PAS de cancel, PAS de refund.

### Changements
- `prisma/schema.prisma` : 2 colonnes nullable sur `Analysis` — `analysisReadyEmailClaimedAt` / `analysisReadyEmailSentAt` (idempotence email). Client régénéré (`prisma generate`, sans DB). **Migration NON appliquée** (Neon capé) → générée en Phase 6.
- `src/services/notifications/analysis-ready-email.ts` (NEW) : `sendAnalysisReadyNotification()` — **claim ATOMIQUE** (`updateMany where {id, sentAt:null, claimedAt:null}` → `count===1`) puis send Resend, `sentAt` au succès / reset `claimedAt`+throw à l'échec (retry Inngest). Claim ET send en `step.run` distincts. URL deal via env SERVEUR (`APP_URL`/`VERCEL_URL`).
- `src/services/notifications/email.ts` : `isEmailConfigured()` + `sendAnalysisReadyEmail()` (template HTML doctrine-safe, aucun langage prescriptif).
- `src/lib/inngest.ts` : appel best-effort sur succès de `dealAnalysisFunction` ET `dealAnalysisResumeFunction` (try/catch : un échec d'email ne fait pas échouer une analyse réussie). FAILED → pas d'email.
- `src/components/deals/analysis-v2/analysis-running-overlay.tsx` (NEW) : masque plein écran `fixed inset-0 z-[60]`, dérivé du statut RUNNING serveur (poll, même queryKey que AnalysisV2Live), `beforeunload` informatif + verrou de scroll.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : monte l'overlay au niveau page (au-dessus des onglets + chat).

### Hardening idempotence (gate Codex round 1 → REQUEST_CHANGES, corrigé)
Codex a trouvé 2 fenêtres de double-envoi : (1) concurrence — claim mémoïsé `true` au retry après reset+throw alors qu'un autre run a envoyé ; (2) succès Resend puis échec de l'`update(sentAt)` → replay renvoie. Root cause : le step send renvoyait sans condition. Fix : **clé d'idempotence provider** `Idempotency-Key: analysis-ready/${analysisId}` (Resend dédoublonne 24h — doc vérifiée) + **re-check `sentAt`** en tête du step send. Exactly-once garanti au niveau provider.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). Tests notif 8/8 : `analysis-ready-email` 6/6 (claim gagnant/perdu, re-check skip concurrent, échec Resend→reset+throw, non-configuré, destinataire absent, assert clé idempotence) + `email-idempotency` 2/2 (header `Idempotency-Key` atteint `fetch`). `doctrine-guard` 10/10 (reword « bloquant »→« plein écran »). Suite complète : aucune régression introduite — 11 fichiers rouges = 6 `*-integration` (Neon capé) + 5 coaching/live (fallout Phase 3, rouges aussi à HEAD, vérifié par stash). Gate Codex : **APPROVE** (round 2).

---
## 2026-06-04 — UI/infra — Phase 3 (refonte 5-sujets) : archivage du Live Coaching

### Contexte
Refonte 5-sujets. Live Coaching (temps réel Recall/Ably) n'a pas sa place pour l'instant → archivé (réactivable via flag), sans casser Recall ni laisser de drain Neon/LLM résiduel.

### Changements
- `src/lib/feature-flags.ts` : `isLiveCoachingEnabled()` (défaut false=archivé, runtime).
- `page.tsx` : onglet + contenu Live gatés + retirés de `allowedTabs`. Popout `live/page.tsx` : redirige vers `/deals/:id` (pas `?tab=live`) quand archivé.
- Routes **403 après auth** : POST `/live-sessions` (create), `[id]/start`, `[id]/reinvite`, `[id]/retry-report` (LLM), `[id]/participants` (PUT), `[id]` PATCH, `/coaching/{context,reanalyze,ably-token}`.
- Webhooks **no-op (ACK 200 APRÈS vérif signature/secret, avant DB/LLM)** : `/webhooks/recall`, `[id]/webhook`, `[id]/visual-frame`.
- `[id]/stop` CONSERVÉ (cleanup : `leaveMeeting` + transition statut) mais rapport post-call LLM + publish Ably gatés sous le flag.
- Conservé : GET (liste/détail), DELETE (nettoyage). `src/lib/live/*` dormant.
- `vitest.unit.config.ts` : `LIVE_COACHING_ENABLED=true` par défaut (routes testées en mode activé ; tests archivé-off → Phase 6).

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 39 tests routes Live verts ; suite complète : seuls 6 `*-integration.test.ts` rouges (Neon capé). Scan auto : aucune route Live write/LLM sans guard. Différé Neon-up : stopper les bots Recall actifs. Gate Codex : **APPROVE** (après 1 round — gate report-LLM de `stop` + PATCH `[id]`).

---
## 2026-06-04 — infra/coûts — Phase 2 (refonte 5-sujets) : watchdog Neon événementiel par-analyse

### Contexte
Suite refonte 5-sujets. Un reaper cron (même à 15 min) réveille Neon à vide 24/7 (findMany inconditionnel) → ne restaure PAS le baseline ~3-4h compute/mois (≈10h/mois en horaire, ≈42h/mois en 15 min). Remplacement par une détection ÉVÉNEMENTIELLE par-analyse : Neon n'est touché que pendant qu'une analyse tourne réellement (~2 checks/analyse).

### Changements
- `src/lib/inngest.ts` : nouvelle `analysisWatchdogFunction` (event `analysis/watchdog.check`) — boucle durable `step.sleep 25m` → check UNE analyse → reap si figée (cap 8 itérations ≈ 3,3h ; la boucle vs tir unique couvre les hangs post-1er-check). Reaper global rétrogradé en BACKSTOP `0 */12 * * *` (orphelins). + registre `functions` + import des helpers. Non-stepwise full_analysis : `dispatchEventId` désormais threadé à `runAnalysis` (→ ligne Analysis le persiste, watchdog résoluble + get-or-create idempotent au retry).
- `src/lib/analysis-compensation.ts` : `reapIfStale` (helper PARTAGÉ ; `reapStaleAnalyses` byte-préservé, 9 tests existants verts) + `reapStaleAnalysisById` (resume) + `reapStaleAnalysisByDispatchEventId` (new-analysis ; no-row → `alive`/pending pour la race file Inngest).
- `src/app/api/analyze/route.ts` : 2 sends `analysis/watchdog.check` (new = `dispatchEventId`, gaté `full_analysis` ; resume = `analysisId`), non bloquants (échec → backstop 12h).
- `src/app/api/cron/reap-stale-analyses/route.ts` : commentaire rôle backstop 12h.

### Vérif
`tsc` clean (hors baseline `exit-strategist.ts` untracked). 37 tests (17 reaper/watchdog + 14 route + 6 stepwise). `@@index([dispatchEventId])` REPORTÉ en Phase 6 (migration générée quand Neon rouvre — évite le drift schema/migration). Gate Codex : **APPROVE** (après 2 rounds — threading non-stepwise + pending race + ciblage full_analysis + maj test/commentaire).

---
## 2026-06-04 — UI/produit — Phase 1 (refonte 5-sujets) : archivage de l'onglet Conditions

### Contexte
Refonte 5-sujets (plan agréé avec Codex). L'onglet « Conditions » (conçu pour un BA solo saisissant les conditions) est devenu une usine à gaz hors cœur de cible → archivé mais réactivable, sans casser l'agent `conditions-analyst` (dont `synthesis-deal-scorer` + `memo-generator` dépendent).

### Changements
- `src/lib/feature-flags.ts` (nouveau) : `isConditionsTabEnabled()` — flag SERVEUR runtime (pas `NEXT_PUBLIC` ; `page.tsx` est Server Component `force-dynamic` → toggle sans redeploy). Défaut `false` = archivé.
- `src/app/(dashboard)/deals/[dealId]/page.tsx` : gate du `TabsTrigger` + `TabsContent` « conditions » + retrait du champ `conditions` du `ScoreGrid` (Vue d'ensemble) quand off ; calcule `allowedTabs` passé à `DealDetailTabs`. Agent `conditions-analyst` CONSERVÉ.
- `src/components/deals/score-display.tsx` : ligne « Conditions » rendue seulement si `scores.conditions !== undefined` (`page.tsx` est le seul caller de `ScoreGrid`).
- `src/components/deals/deal-detail-tabs.tsx` : prop `allowedTabs` (onglets réellement rendus) → une URL `?tab=conditions` avec flag off retombe sur `analysis` (plus de vue vide). Couvre aussi `live` (Phase 3).

### Vérif
`tsc --noEmit` : aucune nouvelle erreur (seule baseline = `exit-strategist.ts`, untracked, hors périmètre). Choix flag-gating vs suppression d'imports : confirmé par Codex (imports non morts, référencés dans le JSX gaté). Gate Codex Phase 1 : **APPROVE** (après correction du cas URL `?tab=conditions` via `allowedTabs`).

---
## 2026-06-04 — infra/coûts — Reaper watchdog : cadence cron 5 min → 15 min (compute-hours Neon)

### Contexte
Compute-hours Neon passées de ~3-4h/MOIS à ~17h/4 JOURS. Cause racine : le cron Inngest `staleAnalysisReaperFunction` (introduit le 31/05, commit `773181f`) tournait à `*/5 * * * *` et exécutait un `prisma.analysis.findMany` INCONDITIONNEL à chaque tick → réveillait l'endpoint Neon ~288×/jour 24/7, empêchant l'autosuspend. Corrélation temporelle exacte (cron 4 j avant le report).

### Changements
- `src/lib/inngest.ts` : cadence reaper `*/5` → `*/15` + commentaire de rationale (seuil staleness `STALE_ANALYSIS_REAP_MS` = 20 min, donc 15 min détecte toute analyse figée dans sa fenêtre de seuil ; latence de détection ≤ 15 min < 20 min). 288 → 96 réveils/jour.
- `src/app/api/cron/reap-stale-analyses/route.ts` : commentaires « toutes les 5 min » → « 15 min » (cohérence).

### Vérif
`tsc --noEmit` : seul rouge préexistant = `exit-strategist.ts` (hors périmètre, fichier WIP non-tracké). Aucun test n'assert la chaîne du cron. Gate Codex : **APPROVE** (cadence 15 min correcte vs seuil 20 min ; flip atomique + refund-once inchangés ; `*/15` = meilleur trade-off vs `*/10`/`*/20`).

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

---
## 2026-06-03 — Refonte analysis-v2 — Phase 8c : Pappers MCP (décision argent → utilisateur)

### Décision
MCP officiel Pappers vérifié réel (`mcp.pappers.fr/{clé}`, abonnement payant à crédits, essai 2 semaines). Décision argent posée à l'utilisateur (AskUserQuestion) → **« Rester au plancher »**. 8a/8b reste la solution livrée pour #6 ; ni clé REST ni MCP provisionnés maintenant. MCP scopé et différé (revisité quand budget tranché). Aucun changement de code (la notice « couverture légale à vérifier » couvre l'UX en attendant).


