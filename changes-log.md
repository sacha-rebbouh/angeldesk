# Changes Log - Angel Desk

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up #3 (scénario 6 step 3 déterministe via /download)

### Contexte
Ré-audit Codex du fix-up #2 — P2 résiduel : le step 3 utilisait `/retry` après `UPDATE storageUrl=NULL`, mais `canRetryPage()` peut court-circuiter avant `downloadFile()` (page déjà retried, status non éligible, etc.). Donc le smoke peut "passer" sans jamais exercer la branche storagePath. Codex a suggéré soit forcer une page NEEDS_REVIEW soit, plus simple, utiliser un endpoint qui télécharge toujours le blob.

### Action
- Scénario 6 step 3 réécrit pour utiliser **`GET /api/documents/[documentId]/download`** au lieu du retry. Cette route n'a pas de pré-condition extraction-state — elle fait `auth → ownership check → downloadFile(storageUrl ?? storagePath) → renvoie les bytes`. Donc `downloadFile()` est GARANTI atteint, et le smoke prouve réellement la branche storagePath-fallback.
- Pass criteria : 200 + bytes après `UPDATE storageUrl=NULL`. Fail signal : 500 + `TypeError [ERR_INVALID_URL]` dans les logs serveur.
- Le retry (steps 1 + 2) reste le smoke OCR happy-path séparé, sans pré-conditions sur `downloadFile`.

### État
- `npx tsc --noEmit` : clean.
- 0 octet NUL dans tous les fichiers Phase 5 touchés.
- Pas de nouveau code ni de tests dans ce fix-up (uniquement le runbook).

### Fichiers
`docs-private/e2e-release-gate.md` (scénario 6 step 3, pass criteria, summary table).

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up #2 (storagePath Blob bug + runbook réponses API)

### Contexte
Ré-audit Codex du fix-up #1 :
- **P1** : `downloadFile` en mode Vercel Blob passait `storagePath` (un pathname comme `deals/<id>/abc.pdf`) directement à `fetch()` → `Invalid URL` pour les rows `storageUrl=NULL`. Le scénario 6 du runbook ne forçait jamais cette branche → bug non détecté. Le pattern `storageUrl ?? storagePath` est pourtant utilisé partout (retry, process, ocr, pipeline, delete-cascade).
- **P2a** : Le runbook lisait mal les réponses API — `/process` répond `{ data: { extractionRunId } }` mais le runbook annonçait `{ extractionRunId }` racine ; `/progress` répond `{ data: progress }` mais le `jq` lisait `phase/percent` à la racine.
- **P2b** : Scénario 6 "refund-on-failure" pas déterministe — pas de moyen reproductible de forcer un échec OCR.

### Action

**P1 — bug storagePath en mode Blob corrigé (`src/services/storage/index.ts`)**
- Dans la branche `isVercelBlobConfigured`, si l'input n'est pas `http(s)://`, résoudre le pathname en URL via `@vercel/blob.head(urlOrPathname)` (accepte les deux formes) puis `fetch(info.url)`. URLs absolues passent through. Le mode local reste inchangé.
- Nouveau test `src/services/storage/__tests__/download-file-blob.test.ts` (4) : pathname → head + fetch ; URL → pas de head ; `http://` accepté aussi ; non-OK fetch throw. Stub `BLOB_READ_WRITE_TOKEN` au top-level AVANT l'import dynamique (un `beforeAll` aurait été trop tard, la constante module est figée).

**P2a — runbook aligné sur les vraies réponses API (`docs-private/e2e-release-gate.md`)**
- Scénario 2 progress poll : `jq '.data | {phase, percent, ...}'`.
- Scénario 5 reprocess : capture `.data.extractionRunId`, pass criteria mis à jour `{ data: { extractionRunId, documentId, processingStatus } }`.

**P2b — scénario 6 réécrit déterministe**
- Step 1 : retry page 1 du fixture `image-only.pdf` (déterministe, page 1 existe toujours).
- **Step 3 (nouveau)** : `psql UPDATE Document SET storageUrl=NULL`, puis retry à nouveau → en mode Blob ce step ECHOUERAIT sans le fix P1 (Invalid URL), il PASSE avec. Smoke réel de la branche storagePath-only. Mode local non affecté (note explicite).
- **Refund-on-failure** : explicitement déclaré **unit-only** dans cette gate, avec pointer vers les unit tests qui prouvent l'invariant (`document-extraction-inngest.test.ts`, `extraction-pipeline.test.ts`, idempotency key du `/retry` route). Forcer une vraie failure OCR live demanderait un flag invasif ; honnête de l'admettre.

### État
- `npx tsc --noEmit` : clean.
- `npx vitest run` : **140 fichiers · 1164/1166** (2 skipped) — vs 1160 avant = +4 (test storage). Aucune régression sur le full run cette fois (les flaky `financial-auditor` se sont comportés).
- `scripts/e2e/generate-fixtures.ts`, `smoke-setup.ts`, `smoke-teardown.ts`, `advisory-lock-live.ts` : tous toujours OK (non touchés).

### Fichiers
`src/services/storage/index.ts`, `src/services/storage/__tests__/download-file-blob.test.ts` (nouveau), `docs-private/e2e-release-gate.md`.

### Registres
- `errors.md` : entrée STORAGE (`downloadFile` Blob pathname) + index.
- Le runbook `🐞 Bugs found` liste désormais les 2 bugs trouvés par Phase 5 (advisory lock + downloadFile).

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up (release gate reproductible + NULs stripped)

### Contexte
Audit Codex Phase 5 : P1 — le runbook 1/2/5/6 listait des fixtures "needed" sans les fournir/générer + plaçait des `<DEAL_ID>`/`<DOC_ID>`/`<PAGE_N>` sans setup/teardown ; un deal au hasard renvoie 404/403 car la route exige `deal.userId === currentUser.id` et `BYPASS_AUTH` se résout en `dev-user-001`. P2 — `errors.md` et `agentic-mistakes.md` contenaient encore de vrais octets NUL (0x00) écrits par mes Edits décrivant le bug NUL.

### Action

**P2 — octets NUL strippés des registres**
- `perl -i -pe 's/\x00/\\0/g' errors.md agentic-mistakes.md`. Vérifié : 0 NUL restants ; `rg` ne traite plus les fichiers comme binaires.

**P1 — release gate reproductible pour 1/2/5/6**
- `scripts/e2e/generate-fixtures.ts` (nouveau) : génère `text-native.pdf` (texte sélectable via `pdf-lib`) et `image-only.pdf` (rasterisation PNG via `pdf-to-img` réintégrée dans un PDF sans couche texte → force l'OCR). Aucun binaire commité, regénérable à volonté. Utilise uniquement des deps déjà présentes.
- `scripts/e2e/smoke-setup.ts` (nouveau) : upsert le dev user `dev-user-001` (mirror de `getOrCreateUser`), crée un Deal frais nommé `E2E-SMOKE-<runId>`, imprime `DEAL_ID=...` parseable par `eval`. Sans ça, l'upload renvoie 404/403.
- `scripts/e2e/smoke-teardown.ts` (nouveau) : **deux gardes de sécurité** — refuse de delete si le deal n'est pas `dev-user-001` ET si son `name` ne commence pas par `E2E-SMOKE-`. Nettoie les blobs AVANT le cascade prisma (pour ne pas perdre les `storageUrl`), puis `prisma.deal.delete` cascade les Documents / ExtractionRuns / Pages via `onDelete: Cascade`.
- `docs-private/e2e-release-gate.md` : runbook réécrit. Setup/teardown sections explicites. Chaque scénario 1/2/5/6 a des commandes curl utilisant `$DEAL_ID`, `$DOC_ID`, `$DOC_ID_OCR`, `$PROGRESS_ID`, `$PAGE_N` capturés depuis les sorties précédentes (`jq`, `uuidgen`). Scénario 2 passe un `progressId` explicite pour pouvoir poller `/api/documents/upload/progress/$PROGRESS_ID` sans la modal UI. Scénario 6 inclut une requête psql pour choisir une page basse-confidence à retry + une requête sur `CreditTransaction` pour vérifier le refund.
- `.gitignore` : `/scripts/e2e/fixtures/` (artefacts regénérables, non commités).

### État
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers verts + 2 fichiers flaky (`agent-pipeline` / `sequential-pipeline` — le `financial-auditor` smoke timeout à 5005ms sous charge parallèle, sans rapport avec ces changements). En isolation : 47/47 verts. Total : 1157/1162 (2 skipped), ou 1160/1162 en isolation des flakys connus.
- `scripts/e2e/generate-fixtures.ts` exécuté → 2 PDF produits (1308 et 52839 octets).
- `scripts/e2e/advisory-lock-live.ts` (Phase 5 #1) : toujours PASS (non touché ce round).
- 0 octet NUL dans les registres (vérifié via `grep -aPc '\x00'`).

### Fichiers
`scripts/e2e/generate-fixtures.ts`, `scripts/e2e/smoke-setup.ts`, `scripts/e2e/smoke-teardown.ts` (nouveaux), `docs-private/e2e-release-gate.md`, `.gitignore`, `errors.md`, `agentic-mistakes.md` (NUL strip).

---
## 2026-05-14 — Upload/OCR Phase 5 (E2E release gate — validation, pas de refactor)

### Contexte
Gate de release : prouver que le flux réel upload/OCR fonctionne, sans refactor. 8 scénarios. Split validé avec l'utilisateur : scénario 8 auto-exécuté ici (lock live, sans écriture) ; scénarios 3/4/7 déjà couverts par la suite Phase 4.1–4.5 ; scénarios 1/2/5/6 livrés en runbook de smoke reproductible (nécessitent la stack complète + crédits OpenRouter).

### 🐞 Bug trouvé et corrigé
`acquireDocumentLineageLock` faisait `tx.$queryRaw` sur `SELECT pg_advisory_xact_lock(...)`. `pg_advisory_xact_lock` retourne `void` → `$queryRaw` throw `P2010 — Failed to deserialize column of type 'void'` en runtime. **L'advisory lock n'a jamais fonctionné** ; chaque upload de version / promotion aurait throw en prod. Masqué par les tests mockés. Fix : `$queryRaw` → `$executeRaw` (exécute le statement, prend le lock, ne désérialise rien). Probé live sur 3 formes possibles. Vérifié live : scénario 8 PASS.

### Action

**Fix du bug (`extraction-runs.ts`)**
- `acquireDocumentLineageLock` : `tx.$queryRaw` → `tx.$executeRaw` + commentaire expliquant pourquoi (`void` non désérialisable).
- 4 fichiers de tests mis à jour : mock `$queryRaw` → `$executeRaw` (`promote-document-version`, `complete-extraction-run-atomic`, `extraction-reuse`, `phase3-leak-findings`).

**Scénario 8 — advisory lock live (`scripts/e2e/advisory-lock-live.ts`, nouveau)**
- Script reproductible, aucune écriture de table : prouve que `acquireDocumentLineageLock` sérialise bien deux transactions concurrentes sur le même lineage, ne bloque pas des lineages différents, et fonctionne via l'URL pgbouncer pooled. Exécuté → **PASS** sur les 3 sous-tests.

**Runbook de smoke (`docs-private/e2e-release-gate.md`, nouveau)**
- Scénarios 1/2/5/6 : prérequis, commandes exactes (curl + psql read-only), critères pass/fail, signaux d'échec. À exécuter par l'utilisateur contre la stack locale.
- Tableau récapitulatif pass/fail des 8 scénarios + carte scénario→test pour 3/4/7 + résultat live du scénario 8 + le bug trouvé.

### État
| # | Scénario | Statut |
|---|---|---|
| 3 | Nouvelle version échoue → ancien reste isLatest | ✅ PASS (suite Phase 4.x) |
| 4 | Nouvelle version réussit → candidate promue | ✅ PASS (suite Phase 4.x) |
| 7 | Timeout forcé → FAILED + refund + pas d'oscillation | ✅ PASS (suite Phase 4.x) |
| 8 | Advisory lock live Postgres | ✅ PASS (script exécuté) |
| 1,2,5,6 | Flux full-stack | ⏳ Runbook livré, à exécuter par l'utilisateur |

- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1160/1162** (2 skipped) — le fix du bug ne casse rien.

### Fichiers
`src/services/documents/extraction-runs.ts`, `scripts/e2e/advisory-lock-live.ts` (nouveau), `docs-private/e2e-release-gate.md` (nouveau), + 4 fichiers de tests (mock `$queryRaw`→`$executeRaw`).

### Registres
- `errors.md` : entrée DB ($queryRaw void).
- `agentic-mistakes.md` : entrée TESTING (SQL brut couvert seulement par des mocks → 2 bugs runtime non détectés ; tout chemin SQL brut doit avoir un test live-DB).

---
## 2026-05-14 — Upload/OCR Phase 4.5 (tests — Gate Audit 4 : invariants de durabilité)

### Contexte
Phase finale du plan Codex : prouver les 4 critères du Gate Audit 4 — absence d'état oscillant, retries idempotents, crash recovery, ancien document préservé si nouvelle version failed. L'essentiel a été couvert au fil des sous-phases (chacune auditée avec tests RED par Codex) ; Phase 4.5 = combler les gaps réels + cartographier la couverture. Pas de nouveau "golden" corpus : les invariants de durabilité sont comportementaux, pas des sorties figées (les goldens d'extraction Excel/docx/pptx existants restent hors scope durabilité).

### Action — gaps comblés

**Gap réel : version preservation on FAILURE (`complete-extraction-run-atomic.test.ts`)**
- Nouveau test : une finalisation FAILED (corpus vide) ne déclenche JAMAIS la promotion — assert que rien du chemin de promotion ne tourne (pas d'advisory lock `$queryRaw`, pas de `findUnique` lineage, pas de `updateMany` démote). L'ancien document `isLatest` n'est jamais touché → ancien préservé.
- Nouveau test : une finalisation COMPLETED fait le flip COMPLET via `completeDocumentExtractionRun` — démote l'ancien `isLatest` du lineage (`updateMany` scopé) ET promeut le candidat, dans la même transaction, démote-avant-promote. (Couvrait avant : promotion testée isolément dans `promote-document-version.test.ts` ; le flip via `completeDocumentExtractionRun` n'était pas asserté.)

**Crash recovery explicite (`extraction-pipeline.test.ts`)**
- Nouveau test labellisé : un retry sur un run encore PROCESSING (crash AVANT le commit atomique) → le pipeline ne court-circuite pas, re-run `smartExtract` + `completeDocumentExtractionRun`, finalise proprement. (Le chemin existait via le happy-path mais n'était pas labellisé "crash recovery".)

### Carte de couverture — Gate Audit 4
- **Absence d'état oscillant** : `progress-monotone-guards.test.ts` (16 — gardes DB monotones run + progress) ; `promote-document-version.test.ts` (monotone par version, advisory lock) ; `extraction-pipeline.test.ts` (drop des callbacks tardifs après abort).
- **Retries idempotents** : `extraction-pipeline.test.ts` (retry sur run terminal SUCCESS = no-op ; sur FAILED = throw ; republie le progress terminal) ; `document-extraction-inngest.test.ts` (refund idempotent via `dispatchRefundKey`, réconciliation crédits) ; `process/route.test.ts` (event id déterministe keyé sur `extractionRunId`).
- **Crash recovery** : `extraction-pipeline.test.ts` (retry sur PROCESSING re-run [nouveau] ; `completeDocumentExtractionRun` throw → run terminalisé, pas d'orphelin ; downloadFile/smartExtract throw → run+document terminalisés) ; `document-extraction-inngest.test.ts` (`compensate-failed-extraction` terminalise run+document défensivement).
- **Ancien document préservé** : `complete-extraction-run-atomic.test.ts` (FAILED → pas de promotion [nouveau] ; COMPLETED → flip complet [nouveau]) ; `promote-document-version.test.ts` (gate COMPLETED, monotone) ; `upload/route.test.ts` (nouvelle version créée candidate `isLatest: false`, pas de démote eager).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1160/1162** (2 skipped) — vs 1157 = +3.

### Fichiers
`src/services/documents/__tests__/complete-extraction-run-atomic.test.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 fix-up #2 (callbacks tardifs — gardes monotones)

### Contexte
Audit Codex Phase 4.4 fix-up — P1 : le `smartExtract` perdant continue en arrière-plan après que la race timeout a gagné. S'il émet ensuite des callbacks `onProgress`, ils peuvent réécrire l'état APRÈS le FAILED : `markExtractionRunProgress` / `recordExtractionPageProgress` faisaient un `update` non gardé → run FAILED reflippé PROCESSING ; `setDocumentExtractionProgress` pouvait écraser une phase terminale `failed`/`completed` par `page_processed` → progress row non-terminal → modal poll à l'infini. Casse l'invariant Phase 4.1 "pas d'état oscillant".

### Action — défense en profondeur sur 3 couches

**Garde callback (`extraction-pipeline.ts`)**
- `onProgress` du pipeline : `if (budgetController.signal.aborted) return` en tête. Première ligne de défense — une fois le budget déclenché, les callbacks du `smartExtract` perdant ne font rien.

**Garde DB monotone — run (`extraction-runs.ts`)**
- Constante `LIVE_RUN_STATUSES = ["PENDING", "PROCESSING"]` (tout le reste — READY, READY_WITH_WARNINGS, BLOCKED, FAILED — est TERMINAL). Réutilisée aussi par `terminalizeExtractionRunAsFailed`.
- `markExtractionRunProgress` : `update` → `updateMany` scopé `status: { in: LIVE }`. Un callback tardif sur un run terminal = no-op 0-ligne. La transition légitime PROCESSING → FAILED passe toujours (PROCESSING est LIVE).
- `recordExtractionPageProgress` : early-return si le run est terminal (read en tête, skip l'encryption + l'upsert) + `update` final → `updateMany` scopé LIVE (backstop atomique pour la fenêtre TOCTOU).

**Garde DB monotone — progress upload (`extraction-progress.ts`)**
- `setDocumentExtractionProgress` : phase terminale (`completed`/`failed`) → upsert (gagne toujours, idempotent). Phase non-terminale → `updateMany` scopé `phase: { notIn: ["completed","failed"] }` ; si 0 ligne → `create` (ligne absente) avec catch P2002 swallowed (writer concurrent terminal). Garde monotone race-free, pas de TOCTOU read-then-write.

### Tests (+17)
- `progress-monotone-guards.test.ts` (16, nouveau) : `markExtractionRunProgress` scopé LIVE + transition PROCESSING→FAILED non bloquée ; `recordExtractionPageProgress` no-op sur run terminal (FAILED/READY/READY_WITH_WARNINGS/BLOCKED/absent) ; `setDocumentExtractionProgress` phase terminale → upsert, phase non-terminale → updateMany scopé, create si absent, P2002 swallowed, autre erreur re-throw.
- `extraction-pipeline.test.ts` (+1) : RED — budget gagne, puis callbacks tardifs `page_processed`/`native_extracted` du `smartExtract` perdant → la garde `onProgress` les drop, zéro nouvelle écriture de progress après abort.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1157/1159** (2 skipped) — vs 1140 = +17.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-progress.ts`, `src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/progress-monotone-guards.test.ts` (nouveau), `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 fix-up (budget GLOBAL réel — race + abort)

### Contexte
Audit Codex Phase 4.4 — P1 : le budget 8 min n'était pas un *vrai* budget global. Le pipeline faisait `budgetController.abort()` puis `await smartExtract(...)` jusqu'à résolution. Les boucles OCR ne checkent le signal qu'entre batchs ; un appel non-coopératif (requête LLM en vol bornée à 90s ; surtout les providers structurés Google/Azure dont les `fetch` n'ont ni signal ni timeout) peut laisser `smartExtract` pendant au-delà de 8 min → le run ne passe pas FAILED à l'heure. P2 : le code `EXTRACTION_TIMEOUT` n'était pas persisté de façon stable (seul `error.message` finissait dans `blockedReason`, sans préfixe stable).

### Action

**P1 — race contre une deadline (`extraction-pipeline.ts`)**
- Le budget combine désormais DEUX mécanismes, aucun suffisant seul :
  1. `budgetController` threadé dans `smartExtract` → les boucles OCR coopératives s'arrêtent (winddown du travail de fond, pas de fuite de compute illimitée).
  2. `budgetDeadline` (Promise qui `reject` à l'expiration du timer) **racé** contre `smartExtract` → le PIPELINE réagit à la deadline même si un sous-appel non-coopératif n'a pas rendu la main.
- `extraction = await Promise.race([extractionPromise, budgetDeadline])`. Ce n'est PAS le vieux `Promise.race` décoratif : ici le signal EST threadé et aborte vraiment le coopératif ; la race garantit juste que le pipeline ne *bloque* pas sur le non-coopératif.
- `extractionPromise.catch(() => undefined)` pour éviter une unhandled rejection si `smartExtract` rejette après que la race a déjà tranché.
- Post-race : `if (budgetController.signal.aborted) throw budgetExceededError()` — couvre le cas où les boucles coopératives ont rendu un partiel pile au déclenchement (la race peut résoudre avec le partiel). Un corpus partiel strict-mode n'est jamais finalisé COMPLETED.

**P2 — code stable persisté**
- `budgetExceededError()` produit un message préfixé `EXTRACTION_TIMEOUT: ...`. Ce préfixe stable finit dans `blockedReason` via `terminalizeExtractionRunAsFailed(runId, error.message)` → greppable pour audit/UI/runbook.

### Tests (+1, 3 au total dans le describe Phase 4.4)
- Nouveau test P1 : `smartExtract` qui ne résout JAMAIS (`new Promise(() => {})`) → `runDocumentExtractionPipeline` rejette quand même `EXTRACTION_TIMEOUT` à `EXTRACTION_TIME_BUDGET_MS` (fake timers). Prouve le budget global.
- Test renommé/clarifié : `smartExtract` qui rend un partiel coopératif au budget → rejet via le post-check `signal.aborted`.
- Les deux assertent `terminalizeExtractionRunAsFailed` appelé avec un reason `/^EXTRACTION_TIMEOUT:/` (P2).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 138 fichiers · **1140/1142** (2 skipped) — vs 1139 = +1.

### Fichiers
`src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 (budget temps d'extraction réel — AbortController)

### Contexte
Plan Codex item 4 : "soft timeout → real budget". L'ancien upload route avait un soft-timeout *décoratif* (`Promise.race` contre un timer qui n'abortait rien — `smartExtract` continuait à tourner en arrière-plan). Supprimé en Phase 4.2. Résultat actuel : le pipeline durable n'a AUCUN budget temps — une extraction OCR pathologique (PDF scanné volumineux, `maxOCRPages: Infinity`) peut tourner jusqu'à ce que l'infra Inngest la tue (non gracieux, run laissé PROCESSING). Phase 4.4 ajoute un VRAI budget qui aborte effectivement le travail.

### Décisions (validées avec l'utilisateur)
- **Budget dépassé → hard fail + refund** : run+document FAILED avec `EXTRACTION_TIMEOUT`, refund via la machinery existante. Un corpus partiel strict-mode (pages manquantes = financials manquants) n'est pas fiable. Réutilise tout l'existant, pas de scope creep readiness-gate.
- **Valeur : 8 minutes** (`EXTRACTION_TIME_BUDGET_MS`), soft budget interne documenté, doit déclencher avant toute limite infra Inngest. Tunable.

### Action

**Threading de l'AbortSignal dans la chaîne OCR (`ocr-service.ts`)**
- `signal?: AbortSignal` ajouté à `smartExtract`, `extractTextWithOCR`, `selectiveOCR`, `processSelectedPdfPages`, `processAllPdfPages`, `runStructuredProviderPlan`, `runVisualOCRPlan`.
- Les 2 boucles feuilles (`processSelectedPdfPages`, `processAllPdfPages`) checkent `signal?.aborted` en tête de chaque itération de batch → `break` → retournent les pages déjà traitées (partiel). `runStructuredProviderPlan` early-return si aborted (skip l'appel provider potentiellement lent).
- Granularité : check entre batchs. L'OCR par requête est déjà borné à 90s (`OCR_REQUEST_TIMEOUT_MS`) → dépassement max après le déclenchement du budget ≈ 1 batch (~90s). Pas de threading dans `generateOCRCompletion` (v1).

**Budget réel dans le pipeline (`extraction-pipeline.ts`)**
- `EXTRACTION_TIME_BUDGET_MS = 8 * 60_000` exporté + documenté.
- `runExtractionWork` arme un `AbortController` + `setTimeout(abort, budget)`, passe `signal` à `smartExtract`, `clearTimeout` via `.finally()`.
- Après `smartExtract` : si `budgetController.signal.aborted` → `throw ExtractionPipelineError("EXTRACTION_TIMEOUT")`. Le catch externe du pipeline terminalise run+document FAILED, publie `failed`, re-throw → le catch Inngest refund. `EXTRACTION_TIMEOUT` ajouté à l'union de codes. Aucun changement Inngest (passe par la machinery FAILED existante).

### Tests (+5)
- `extraction-pipeline.test.ts` (+2) : budget non dépassé → `AbortSignal` frais non-aborté threadé, COMPLETED normal, timer nettoyé ; budget déclenché mid-extraction (fake timers) → `EXTRACTION_TIMEOUT` + run+document terminalisés FAILED + `completeDocumentExtractionRun` jamais appelé.
- `ocr-service-abort-budget.test.ts` (3, nouveau) : `selectiveOCR` avec signal pré-aborté → stop AVANT tout rendering, 0 page ; sans signal → rendering effectué (preuve que le signal est le gate) ; abort après le 1er batch → 2e batch jamais scheduled.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 138 fichiers · **1139/1141** (2 skipped) — vs 1134 = +5. (Note : un 1er run a montré du flakiness parallèle non lié — circuit-breaker / financial-auditor ; 2e run full green, fichiers concernés verts en isolation.)

### Fichiers
`src/services/pdf/ocr-service.ts`, `src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`, `src/services/pdf/__tests__/ocr-service-abort-budget.test.ts` (nouveau).

---
## 2026-05-14 — Upload/OCR Phase 4.3 fix-up #2 (clé d'advisory lock sans NUL)

### Contexte
Ré-audit Codex du fix-up #1 — P1 : `acquireDocumentLineageLock` construisait sa clé avec des octets NUL (0x00) comme séparateur, passés à `hashtext()` comme `text`. PostgreSQL refuse les NUL dans `text` → `$queryRaw` aurait throw au runtime avant de protéger la section critique, à chaque upload et chaque promotion. Non détecté : `$queryRaw` mocké, assertions sur le contenu de la clé seulement.

### Action
- `acquireDocumentLineageLock` : clé construite via `JSON.stringify(["doc-lineage", dealId, name, corpusParentDocumentId ?? ""])` — jamais de NUL brut, délimitation non ambiguë (échappement JSON).
- Test renforcé (`promote-document-version.test.ts`) : `name` contenant un espace, `expect(key).not.toContain("\0")`, `expect(JSON.parse(key)).toEqual([...])`.
- Test DB live réel (`SELECT pg_advisory_xact_lock(hashtext($key))`) → Phase 4.5.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1134/1136** (2 skipped).

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/__tests__/promote-document-version.test.ts`.

### Registres
- `errors.md` : entrée DB (clé NUL) + annotation sur l'entrée CONCURRENCE.
- `agentic-mistakes.md` : entrée VÉRIFICATION (Read tool a masqué les NUL, j'ai failli rejeter un finding Codex correct → toujours `od -c` pour les questions au niveau octet).

---
## 2026-05-14 — Upload/OCR Phase 4.3 fix-up (sérialisation concurrence — advisory lock par lineage)

### Contexte
Audit Codex Phase 4.3 — P1 : la garantie "monotone / pas d'oscillation" tenait en séquentiel mais pas en concurrence. `promoteDocumentVersionTx` faisait un check `newerLatest` puis, plus tard, démotait/promouvait — sans isolation ni lock. Scénario : v2 et v3 candidates terminent quasi simultanément ; tx v2 lit "pas de newer latest" pendant que v3 est encore candidate, v3 promeut et commit, puis v2 reprend, démote v3 et promeut v2 → le latest repart en arrière. Note non-bloquante liée : `existingDoc.version + 1` hors transaction → deux uploads concurrents du même filename créent deux v2.

### Action

**Advisory lock transactionnel par lineage (`extraction-runs.ts`)**
- `acquireDocumentLineageLock(tx, lineage)` : `SELECT pg_advisory_xact_lock(hashtext(key))` où `key` dérive de `(dealId, name, corpusParentDocumentId)`. Lock tenu jusqu'à la fin de la transaction. Collisions `hashtext` → au pire deux lineages non liés se sérialisent occasionnellement, jamais d'incorrection.
- `promoteDocumentVersionTx` : prend le lock AVANT le check `newerLatest` et les writes. Le check-then-act est désormais une section critique sérialisée par lineage. Re-read de `processingStatus` DANS le lock (un reprocess concurrent peut avoir bougé le doc hors COMPLETED entre le read pré-lock et le lock). Re-trace du scénario Codex avec le lock : tx v2 prend le lock, tx v3 bloque ; v2 démote v1/promeut v2, commit, libère ; v3 prend le lock, `newerLatest` voit v2... ou ordre inverse : v3 promeut, v2 prend le lock, `newerLatest` trouve v3 (version > 2) → return, v2 reste candidate. Monotone dans les deux cas.
- Un seul lock par transaction (un document = un lineage) → pas de risque de deadlock par ordre de lock.

**Création de version sous lock (`upload/route.ts`)**
- Requête `existingDoc` supprimée de son ancien emplacement. Assignation de version + `document.create` déplacés dans un `prisma.$transaction` qui prend d'abord `acquireDocumentLineageLock`.
- `version = MAX(version) + 1` sur TOUT le lineage (plus seulement la row `isLatest: true`) → deux candidates in-flight obtiennent des numéros de version distincts.
- `isLatest: priorVersionInLineage ? false : true`, `parentDocumentId` = la plus haute version du lineage. Transaction courte (lock + 1 findFirst + 1 create) — l'upload blob reste hors transaction.
- `existingDoc` renommé `priorVersion` (sémantique : plus haute version du lineage, plus "la row isLatest").

### Tests (+5)
- `promote-document-version.test.ts` (+4) : lock pris AVANT le check `newerLatest` et les writes (ordre) ; clé de lock dérivée du tuple lineage ; pas de lock pour un doc non-COMPLETED (fast-exit) ; re-read sous lock → bail si un reprocess concurrent a bougé le doc hors COMPLETED.
- `upload/route.test.ts` (+1) : version assignée + row créée dans un `$transaction` lock-protégé ; `acquireDocumentLineageLock` appelé avec le tuple lineage ; lineage read = `MAX(version)` (orderBy version desc) ; lock avant le read.
- tx mocks étendus (`$queryRaw`, `$transaction`) dans `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/route.test.ts`.

### Note (non corrigé ici, suivi explicite)
Index unique partiel "un seul `isLatest: true` par lineage" (filet DB) : suggéré "idéalement" par Codex. Non fait — nécessite une migration SQL brute (Prisma n'exprime pas un index partiel avec `COALESCE` pour gérer le NULL de `corpusParentDocumentId`) + un passage de nettoyage des données existantes potentiellement non conformes. Les locks ferment la race au niveau applicatif ; l'index reste un défense-en-profondeur à planifier séparément.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1134/1136** (2 skipped) — vs 1129 = +5.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/app/api/documents/upload/route.ts`, `src/services/documents/__tests__/promote-document-version.test.ts`, `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/__tests__/route.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.3 (version candidate / isLatest après COMPLETED)

### Contexte
Trou de durabilité versions : à l'upload d'une nouvelle version (même nom + deal), l'ancien document était démoté `isLatest: false` IMMÉDIATEMENT, puis le nouveau créé `isLatest: true`. Si l'extraction de la nouvelle version échouait ensuite, le deal pointait sur un document cassé sans fallback `isLatest`. Exigence Codex : nouvelle version = candidate, `isLatest` bascule seulement après extraction COMPLETED, ancien document préservé si la nouvelle version échoue, pas d'état oscillant.

### Action

**Helper de promotion (`extraction-runs.ts`)**
- `promoteDocumentVersionTx(tx, documentId)` : promotion lineage-scopée, gated COMPLETED, monotone par version.
  - Gate COMPLETED : un document PENDING/PROCESSING/FAILED ne promeut jamais → ancien préservé.
  - Lineage = `(dealId, name, corpusParentDocumentId)` (le tuple exact que l'upload route utilise pour détecter "même document réuploadé").
  - Monotone : si une version strictement plus récente détient déjà `isLatest`, le candidat (plus ancien) reste candidat → pas d'oscillation (une vieille version qui complète tard ne démote pas un winner plus récent).
  - Démote tous les autres `isLatest` du lineage puis promeut le candidat → exactement un `isLatest: true` par lineage.
- `promoteDocumentVersion({ documentId })` : wrapper standalone (`$transaction`) pour les call sites hors transaction.

**Promotion atomique — path PDF durable + reuse**
- `completeDocumentExtractionRun` : appelle `promoteDocumentVersionTx` dans la MÊME transaction que le statut terminal du run, quand `hasUsableCorpus` (le pont COMPLETED ⟺ succès). Aucun nouveau param ni changement Inngest/pipeline.
- `extraction-reuse.ts` : `promoteDocumentVersionTx` dans la transaction de clonage existante (reuse finalise COMPLETED immédiatement, pas de fenêtre PROCESSING).

**Upload route (`upload/route.ts`)**
- Suppression du démote eager de l'ancienne version.
- `prisma.document.create` : `isLatest: existingDoc ? false : true` — nouvelle version = candidate, document neuf = `isLatest: true` (rien à préserver).
- Fin de route : `promoteDocumentVersion` pour les paths inline (image/Excel/Word/PowerPoint) une fois le statut final COMPLETED connu — gardé par `file.type !== "application/pdf"` (PDF durable promeut dans le pipeline, reuse dans sa propre transaction).

### Tests (+12)
- `promote-document-version.test.ts` (10, nouveau) : gate COMPLETED (PENDING/PROCESSING/FAILED → pas de promotion), document absent, démote lineage-scopé + promote, scoping par corpusParentDocumentId, monotone (version plus récente déjà isLatest → pas de promotion), document neuf = no-op inoffensif, wrapper `$transaction`.
- `complete-extraction-run-atomic.test.ts` : tx mock étendu (findUnique/findFirst/updateMany) ; assertion order run → finalize → promote dans la même transaction.
- `upload/__tests__/route.test.ts` (+2) : document neuf créé `isLatest: true` ; version réuploadée créée `isLatest: false` SANS démote eager de l'ancien.
- `extraction-reuse.test.ts` + `phase3-leak-findings.test.ts` : tx mocks étendus pour la promotion.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1129/1131** (2 skipped) — vs 1117 = +12.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-reuse.ts`, `src/app/api/documents/upload/route.ts`, `src/services/documents/__tests__/promote-document-version.test.ts` (nouveau), `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/__tests__/route.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 2 fix-up (contrat async client + progress terminal sur retry)

### Contexte
Audit Codex du step 2 : 2×P1 + 1×P2. Le serveur a bien migré en async mais le contrat client n'a pas suivi.
- P1a : la modal upload ne pollait pas réellement le progress async (`handleUploadAll` tear-down immédiat).
- P1b : `inngest.send` qui throw → route retournait quand même 201 → toast "succès" alors que l'OCR ne tournera jamais.
- P2 : un retry sur run terminal ne republiait pas le progress terminal → progress row bloqué non-terminal.

### Action

**P1a — modal upload poll réellement l'extraction durable (`file-upload.tsx`)**
- `FileToUpload.status` += `"extracting"`. `UploadApiResult` += `extraction?.pending`.
- `uploadFile` retourne `{ ok, pending, progressId }` ; un PDF `pending` → statut `"extracting"`, `onUploadComplete` différé.
- `handleUploadAll` : si un fichier est `pending`, garde `isUploading` + `activeProgressId` vivants, stocke les counts dans `deferredCountsRef`, ne tear-down PAS.
- Nouveau `useEffect` terminal-watcher : `serverProgress.phase` ∈ {completed, failed} → settle le fichier (`success`/`error`), tear-down, `onAllComplete` avec les counts finaux. Le poller existant continue (isUploading reste true).
- Rendu : `"extracting"` affiché comme un état en cours (spinner bleu).

**P1b — échec d'enqueue → erreur, pas succès (`upload/route.ts`)**
- La branche catch d'enqueue throw `UploadRequestError(503)` au lieu de continuer vers un 201. Le client le transforme en exception → fichier `error`, pas de success toast. Régression Phase 1 fermée.

**P2 — pipeline republie le progress terminal sur retry (`extraction-pipeline.ts`)**
- Branche d'idempotence : run terminal SUCCESS → `publishUploadProgress({ phase: "completed" })` avant `return summarizeExistingRun`. Run terminal FAILED → `publishUploadProgress({ phase: "failed" })` avant `throw`. Idempotent.

### Tests (4 nouveaux)
- `extraction-pipeline.test.ts` (4) : retry terminal READY/READY_WITH_WARNINGS/BLOCKED republie `completed` (it.each) ; retry terminal FAILED republie `failed` avant de throw.
- `upload/__tests__/route.test.ts` : test ajusté — `inngest.send` throw → **503** (plus 201) + refund + terminalize.
- Client `file-upload.tsx` : couvert par tsc + revue (même pattern que le terminal-watcher du audit dialog Phase 4.1 ; pas de RTL dans ce repo).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1117/1117** tests (vs 1113 = +4).

### Registres
- `errors.md` : index + 2 nouvelles entrées (UX + DURABILITÉ). Entrée step 2 annotée "Ce qui N'A PAS fonctionné".

### Dette UX connue (non-bloquante, validée par Codex)
- `file-upload.tsx` est mono-pending : en multi-upload avec plusieurs PDF async, seul le dernier `progressId` est suivi en direct par la modal. Compteurs/toasts peuvent être incomplets dans ce cas. La DB et la liste se rattrapent via le polling des documents PROCESSING. Single-PDF (cas courant) entièrement correct. À traiter comme dette UX réelle si le multi-upload devient fréquent.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 2 (migration du path PDF de l'upload vers le durable pipeline)

### Contexte
Step 1 (sweep truthiness) audité OK. Step 2 = le cœur de Phase 4.2 : sortir l'extraction PDF de la route HTTP `/api/documents/upload`. Le path PDF faisait `smartExtract` inline (~300 lignes) avec un soft-timeout `setTimeout` décoratif — sur Vercel un PDF long est tronqué sans cleanup.

### Action

**Pipeline `runDocumentExtractionPipeline` étendu**
- Nouveau param `progressPublishing: { uploadProgressId, userId, documentName }` → publie `DocumentExtractionProgress` aux phases started / native_extracted / page_processed / completed / failed (best-effort, ne fait jamais échouer l'extraction). Le poller upload client voit la vraie progression backend.
- Résultat enrichi de `actualCredits` (dérivé de `manifest.creditEstimate.estimatedCredits`).
- `summarizeExistingRun` re-dérive `actualCredits` depuis le run persisté (idempotence retry).

**Inngest function `documentExtractionFunction` étendue**
- Event data : `reconcileCredits?`, `uploadProgressId?`, `documentName?`.
- Forward `progressPublishing` au pipeline.
- Step `reconcile-extraction-credits` (succès, si `reconcileCredits`) : `actualCredits` vs `chargedCredits` → delta charge (`extraction:delta:${runId}`) ou refund (`extraction:reconcile-refund:${runId}`). Idempotent. Le /process flow omet `reconcileCredits` (comportement inchangé).
- Step `trigger-thesis-reextract` (succès, si `reason === "upload"`) : déplacé depuis l'upload route — le document n'atteint COMPLETED que dans la fonction Inngest désormais. Non-bloquant.

**Upload route — path PDF migré**
- Remplacement de ~300 lignes de `smartExtract` inline + soft-timeout décoratif par : `estimatePdfExtractionCost` → pre-charge worst-case → `document.update PROCESSING` → `startDocumentExtractionRun` → `inngest.send('document/extraction.run')`.
- Catch pré-enqueue : refund + `terminalizeExtractionRunAsFailed` + document FAILED (jamais de run orphelin).
- Réponse : `response.extraction = { ...vides, pending: true }` pour un PDF enqueued. Le client poll le progress endpoint.
- Imports nettoyés : `markExtractionRunProgress`, `recordExtractionPageProgress`, `completeDocumentExtractionRun`, `getBlockingPageNumbersFromManifest`, `formatExtractionTierSummary` retirés (plus utilisés sur la surface upload).
- Images / Excel / Word / PowerPoint restent inline (truthiness corrigée step 1) — migration durable ultérieure.

### Tests (16 nouveaux)
- `extraction-pipeline.test.ts` (4) : actualCredits du manifest, progress started→completed publié, progress failed sur throw, pas de progress si `progressPublishing` omis.
- `document-extraction-inngest.test.ts` (8) : reconciliation refund (actual < charged), delta charge (actual > charged), no-op (actual == charged), pas de reconciliation si `reconcileCredits` absent, refund-fail loggé ; thesis re-extract déclenché si thesis existe, pas si absente, pas si `reason !== "upload"`.
- `upload/__tests__/route.test.ts` (4) : event `document/extraction.run` shape + `reconcileCredits: true`, pre-charge AVANT `inngest.send` (ordering), 402 + pas d'enqueue si pre-charge échoue, refund + `terminalizeExtractionRunAsFailed` + document FAILED si `inngest.send` throw.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1113/1113** tests (vs 1097 = +16).

### Registres
- `errors.md` : index + 1 nouvelle entrée ARCHITECTURE.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 1 (sweep truthiness — gate Codex)

### Contexte
Feu vert Phase 4.2 de Codex, avec gate explicite : les paths legacy upload/OCR qui décident COMPLETED/FAILED via la truthiness brute (`result.text ? ...`) doivent passer à `hasUsableExtractionCorpus()` OU être migrés derrière le durable pipeline. Step 1 = le sweep truthiness (surgical, le gate nommé). Step 2 (à suivre) = migration du path PDF de l'upload vers enqueue Inngest.

### Action — `hasUsableExtractionCorpus` appliqué aux 6 sites inline legacy
- `recordDocumentExtractionRun` (extraction-runs.ts) : `status = hasUsableCorpus ? mapRunStatus(manifest) : "FAILED"` + `readyForAnalysis` gated. Miroir de `completeDocumentExtractionRun`. Couvre les paths image + Office qui utilisent cette fonction.
- Route OCR (`/api/documents/[documentId]/ocr`) : `processingStatus`/`extractedText` gated sur `hasUsableExtractionCorpus(result.text)`.
- Upload route, 4 paths inline :
  - PDF inline : `result.text ? "COMPLETED" : "FAILED"` → `pdfCorpusUsable`.
  - Image : `processingStatus: "COMPLETED"` inconditionnel → `imageCorpusUsable`.
  - Excel : `processingStatus: "COMPLETED"` inconditionnel → `excelCorpusUsable`.
  - Word : idem → `wordCorpusUsable`.
  - PowerPoint : idem → `pptCorpusUsable`.
- Plus aucun site qui décide COMPLETED/FAILED sans passer par le helper partagé.

### Tests (7 nouveaux)
- `extraction-runs.test.ts` (5) : `hasUsableExtractionCorpus` direct — texte réel / vide / whitespace-only / null-undefined / single char.
- `complete-extraction-run-atomic.test.ts` (2) : `recordDocumentExtractionRun` corpus vide → run FAILED même sur manifest `ready_with_warnings` ; corpus non-vide → statut manifest préservé.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1097/1097** tests (vs 1090 = +7). Note : 3 échecs transitoires observés sur un run (smoke tests agent `financial-auditor` timeout 5005ms sous charge parallèle) — confirmés flaky : `agent-pipeline` passe 35/35 en isolation, re-run complet 1097/1097 vert.

### Hors scope step 1 (→ Phase 4.2 step 2)
- Migration du path PDF de l'upload route vers le durable pipeline (enqueue Inngest + reconciliation crédits + publication progress). Les paths image/Office restent inline pour l'instant (truthiness désormais correcte).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #4 (helper partagé hasUsableExtractionCorpus)

### Contexte
Audit Codex : le fix-up #3 n'a corrigé QUE `completeDocumentExtractionRun`. Le caller pipeline gardait `const isSuccess = Boolean(extraction.text)`. Pour un corpus whitespace-only : `completeDocumentExtractionRun` force le run FAILED, mais le pipeline construit `documentFinalization` COMPLETED et retourne `status: "COMPLETED"` → divergence run FAILED / document COMPLETED / API COMPLETED + pas de refund.

### Action
- Nouveau helper exporté `hasUsableExtractionCorpus(text)` dans `extraction-runs.ts` — `typeof text === "string" && text.trim().length > 0`. Source unique de vérité.
- `completeDocumentExtractionRun` : `hasUsableCorpus = hasUsableExtractionCorpus(params.text)`.
- `runDocumentExtractionPipeline` : `isSuccess = hasUsableExtractionCorpus(extraction.text)` (remplace `Boolean(extraction.text)`).
- Plus aucune définition dupliquée du "succès d'extraction".

### Tests (1 nouveau)
- `extraction-pipeline.test.ts` : `P1: treats a whitespace-only corpus as a FAILURE (no run/document/API divergence)` (RED→GREEN — `text: "   \n  \t "` + manifest `ready_with_warnings` + `pagesProcessed: 3` → pipeline throw `EXTRACTION_FAILED` + `documentFinalization.data.processingStatus === "FAILED"`).
- Le mock du pipeline test inclut la VRAIE logique de `hasUsableExtractionCorpus` (pas de stub) pour exercer exactement la même définition.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1090/1090** tests (vs 1089 = +1).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ. Entrée fix-up #3 annotée "Ce qui N'A PAS fonctionné" (corrigeait qu'un des 2 call sites).

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #3 (corpus vide → run forcé FAILED)

### Contexte
Audit Codex : le chemin `text === ""` pouvait encore produire un run terminal non-FAILED. `completeDocumentExtractionRun` mappait le statut du run uniquement depuis le manifest (`mapRunStatus`), sans tenir compte d'un corpus final vide. Le chemin OCR peut retourner `success: true` avec `pagesProcessed > 0` mais `composeOCRText` → `""` (toutes les pages OCR ont `text.length === 0`). Résultat : run `READY_WITH_WARNINGS`/`BLOCKED` + document FAILED → retry no-op sur le run terminal-success → incohérence permanente.

### Action
- `completeDocumentExtractionRun` : `const hasUsableCorpus = params.text.trim().length > 0;` → `status = hasUsableCorpus ? mapRunStatus(manifest) : "FAILED"`. `readyForAnalysis` également gated sur `hasUsableCorpus`.
- Le statut du run ne peut plus contredire "pas de texte exploitable".

### Tests (2 nouveaux dans complete-extraction-run-atomic.test.ts)
- `P1: forces run status FAILED when the final corpus is empty, even if the manifest says ready_with_warnings` (RED→GREEN — manifest `ready_with_warnings` + `pagesProcessed: 3` + `text: "   \n  "` → run FAILED).
- `keeps the manifest-derived status when the corpus is non-empty` (non-régression — corpus réel → READY_WITH_WARNINGS préservé).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1089/1089** tests (vs 1087 = +2).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #2 (finalisation succès atomique run + document)

### Contexte
Audit Codex post-fix-up : le commit "succès" n'était pas atomique. `completeDocumentExtractionRun()` terminalisait le run, PUIS `prisma.document.update()` séparément. Crash entre les deux → run terminal-success + document non finalisé, et le retry `summarizeExistingRun` ne re-mute pas le document → run READY + document inexploitable.

### Action

**`completeDocumentExtractionRun` — param `documentFinalization`**
- Nouveau param optionnel `documentFinalization: { documentId, data: Prisma.DocumentUpdateInput }`.
- Quand fourni : `tx.document.update` s'exécute DANS le même `prisma.$transaction` que la terminalisation du run + création des pages. Atomique tout-ou-rien.
- Callers legacy (upload/ocr routes, non migrés) omettent le param → comportement inchangé.

**Pipeline `runDocumentExtractionPipeline` — section 4+5 fusionnée**
- Construit `documentData` (COMPLETED+extractedText si `isSuccess`, sinon FAILED+errorWarning) et le passe en `documentFinalization` à `completeDocumentExtractionRun`.
- Plus aucun `prisma.document.update` séparé. `latestExtractionRunId` utilise `extractionRunId` directement (connu avant la tx).
- Si la transaction rollback → le run reste PROCESSING → le catch global terminalise → retry re-run propre. Jamais run=READY + document non finalisé.

### Tests (4 nouveaux)
- `extraction-pipeline.test.ts` : `P1 (atomicity): when completeDocumentExtractionRun throws, the run is terminalized FAILED and NO orphan run-READY-without-document is left` (RED→GREEN — simule le crash de la tx de finalisation). + 2 tests existants adaptés (assert `documentFinalization` au lieu de `prisma.document.update` séparé).
- `complete-extraction-run-atomic.test.ts` (3 tests) : document update DANS la même tx (même client tx, ordering run→doc), legacy sans `documentFinalization` ne touche pas le document, throw dans la tx propagé au caller.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1087/1087** tests (vs 1083 = +4 : 1 atomicity RED→GREEN + 3 complete-extraction-run-atomic).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up (durabilité : terminaliser runs + compenser FAILED idempotemment)

### Contexte
Audit Codex post-Phase-4.1 a trouvé 4 trous de durabilité (3×P1 + 1×P2) :
- P1.1 : la compensation/catch marquait `Document` FAILED mais pas le `DocumentExtractionRun` → run stuck PROCESSING.
- P1.2 : un retry Inngest voyant un run FAILED retournait `status: "FAILED"` comme succès → pas de refund.
- P1.3 : /process pre-enqueue catch laissait le run orphelin PROCESSING.
- P2 : le client affichait "Extraction terminée" sur le 202 async.

### Action

**Nouveau helper `terminalizeExtractionRunAsFailed(runId, reason)` (extraction-runs.ts)**
- `updateMany WHERE id AND status IN [PENDING, PROCESSING]` → `status: FAILED`.
- Idempotent (no-op si déjà terminal), retourne le count des rows transitionnées. Safe à appeler depuis tous les catch.

**P1.1 — Terminaliser le run dans tous les catch**
- Pipeline : `runDocumentExtractionPipeline` wrappe le travail lourd dans `runExtractionWork` ; un try/catch global terminalise run + document avant re-throw. La garde MIME a migré dans `runExtractionWork` (un non-PDF enqueued terminalise quand même son run).
- Inngest function : le step `compensate-failed-extraction` appelle aussi `terminalizeExtractionRunAsFailed` (défensif si le pipeline crash avant son propre catch).
- /process route : catch pré-enqueue terminalise via `orphanRunId`.

**P1.2 — Compenser les runs FAILED idempotemment**
- Branche d'idempotence du pipeline : run terminal SUCCESS (READY/READY_WITH_WARNINGS/BLOCKED) → `summarizeExistingRun` retourne le résumé caché. Run terminal FAILED → **throw** `ExtractionPipelineError("...", "EXTRACTION_FAILED")` → le retry Inngest passe par le catch → refund idempotent via `dispatchRefundKey`.
- `summarizeExistingRun` ne gère plus le cas FAILED (param `_runStatus` restreint aux 3 statuts SUCCESS).

**P1.3 — /process pre-enqueue catch terminalise le run orphelin**
- Tracker `orphanRunId` : set après `startDocumentExtractionRun`, remis à `null` après `inngest.send` succès. Le catch terminalise si non-null.

**P2 — Client polling-aware (document-extraction-audit-dialog.tsx)**
- `reprocessMutation.onSuccess` stocke `extractionRunId` dans `reprocessRunId`, toast "lancee — traitement en cours" (plus "terminee").
- `useQuery` du audit : `refetchInterval: reprocessRunId ? 3000 : false`.
- `useEffect` terminal-watcher : quand `latestRun.id === reprocessRunId` ET status terminal → clear, toast final (terminee/echouee), invalide readiness.
- `extractionActionPending` inclut `reprocessRunId !== null` → barre de progression maintenue pendant tout le traitement durable.
- `notifyDocumentUpdated` wrappé en `useCallback`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 135 fichiers · **1083/1083** tests (vs 1080 Phase 4.1 = +3 : P1.2 FAILED-throw, +2 P1.1 terminalize ; idempotency it.each 4→3 cas + 1 test P1.2 dédié ; +1 test /process "no terminalize on success").

### Registres
- `errors.md` : index + 4 nouvelles entrées (3 DURABILITÉ + 1 UX).

---
## 2026-05-14 — Upload/OCR Phase 4.1 (durable pipeline — vertical slice /process route)

### Contexte
Feu vert Phase 4. Phase 4.1 = plus petit vertical slice auditable : Inngest function + service `runDocumentExtractionPipeline` + /process route bascule en enqueue + tests idempotency/crash recovery. Upload (PDF + images + Office docs) et /retry restent inline pour 4.2/4.3.

### Action

**Nouveau service `src/services/documents/extraction-pipeline.ts`**
- `runDocumentExtractionPipeline({ documentId, extractionRunId })` : contient la logique d'extraction (download + smartExtract + completeRun + updateDocument).
- Idempotent : si le run est en état terminal (READY/READY_WITH_WARNINGS/BLOCKED/FAILED), retourne le résumé caché sans re-exécuter.
- Page-level upsert via `recordExtractionPageProgress(runId, pageNumber)` → mid-extraction retry safe.
- Throw `ExtractionPipelineError(code)` avec codes : DOCUMENT_NOT_FOUND / RUN_NOT_FOUND / MIME_UNSUPPORTED / NO_STORAGE / DOWNLOAD_FAILED / EXTRACTION_FAILED.
- PDF only (4.1). Images / Excel / PowerPoint / Word à venir.

**Nouvelle Inngest function `documentExtractionFunction`**
- Event : `document/extraction.run` avec data `{ documentId, extractionRunId, userId, dealId, reason, creditAction?, chargedCredits?, dispatchRefundKey? }`.
- Retries : 1. Concurrency : 3 / `event.data.userId`.
- `step.run('run-extraction-pipeline')` → appelle le service.
- Sur throw : `step.run('compensate-failed-extraction')` → `refundCreditAmount(idempotencyKey=dispatchRefundKey)` + `prisma.document.updateMany({ where: { id, processingStatus: "PROCESSING" }, data: { processingStatus: "FAILED" }})`.
- Si refund retourne `{ success: false }` → log via `logger.error` (user reste débité, surfaceé pour audit).
- Registered dans `functions[]` array.

**Route `/api/documents/[documentId]/process` réécrite (de 327 → 230 lignes)**
- 1. Auth + validation + ownership + running analysis check.
- 2. PDF + storage check (`storageUrl ?? storagePath`).
- 3. Atomic PROCESSING claim (`updateMany where: { id, NOT PROCESSING }`).
- 4. Deduct credits (avec idempotency key `extraction:reprocess:${docId}:${requestId}`).
- 5. `startDocumentExtractionRun`.
- 6. `inngest.send({ id: 'document-extraction:${runId}', name: 'document/extraction.run', data: {...} })`.
- 7. Return 202 `{ data: { documentId, extractionRunId, processingStatus: "PROCESSING" }, creditsCharged }`.
- Pre-enqueue catch : refund + revert PROCESSING claim.
- `maxDuration` : 300 → 30 (HTTP work bounded).

**Tests (24 nouveaux)**
- `extraction-pipeline.test.ts` (12 tests) :
  - Happy path : smartExtract → COMPLETED + shape attendue.
  - requiresOCR flag quand manifest a hard blockers.
  - Idempotency : re-run sur READY/READY_WITH_WARNINGS/BLOCKED/FAILED = no-op (no smartExtract, no document update).
  - Error paths : DOCUMENT_NOT_FOUND, MIME_UNSUPPORTED, RUN_NOT_FOUND, NO_STORAGE, EXTRACTION_FAILED, DOWNLOAD_FAILED.
- `/process/__tests__/route.test.ts` (8 tests) :
  - 202 + enqueue with deterministic event id `document-extraction:${runId}`.
  - Deduct BEFORE send (ordering assertion).
  - 402 + revert PROCESSING quand credit deduction fails.
  - 409 race-condition guard.
  - Refund + revert PROCESSING quand `inngest.send` throw.
  - 400 non-PDF, 403 unowned.
- `document-extraction-inngest.test.ts` (4 tests) :
  - Succès → result returned, no compensation.
  - Pipeline throw → refund + mark FAILED + re-throw.
  - Refund retournant `{ success: false }` → log error, document quand même FAILED.
  - chargedCredits=0 → skip refund.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 135 fichiers · **1080/1080** tests (vs 1056 Phase 3 = +24 : 12 pipeline + 8 route + 4 Inngest).

### Hors scope Phase 4.1 (à venir)
- Phase 4.2 : Upload route bascule en enqueue (PDF first, puis images / Office).
- Phase 4.3 : Version candidate / `isLatest` post-COMPLETED.
- Phase 4.4 : Soft timeout / abort budget réel.
- Phase 4.5 : Tests crash-recovery integration + golden runbook.

---
## 2026-05-13 — Upload/OCR Phase 3 textPreview fail-closed (audit Codex P2)

### Contexte
Mon fix Phase 3.5(d) prétendait fail-closed sur textPreview corrompu, mais utilisait `safeDecrypt` qui swallow l'erreur silencieusement. Le try/catch externe était code mort. Repro live Codex : preview base64 corrompu → `isEncrypted=true, safeDecryptReturnedOriginal=true, clonedDecryptsToOriginalCiphertext=true` (le ciphertext corrompu était propagé tel quel dans la nouvelle row).

### Action

**TDD : 1 test RED écrit AVANT fix**
- "fail-closed: a corrupted encrypted-looking textPreview on the source must throw" — flip d'un byte dans l'auth tag, vérifie que le clonage throw au lieu de propager.

**API encryption.ts — miroir strict pour les strings**
- Nouveau `tryDecryptText(text): DecryptedTextResult` qui retourne `{ kind: "plaintext" | "decrypted" | "corrupted", value?, reason? }`. Pattern identique à `tryDecryptJsonField`.
- `safeDecrypt` documentée explicitement comme "swallow errors" → réservée au display, jamais aux security gates.

**Fix extraction-reuse**
- `reEncryptTextPreviewForReuse` réécrit en switch sur `result.kind`. `corrupted` → throw `CorruptedSourceArtifactError`. Plus de `safeDecrypt` dans le chemin fail-closed.

### Verrouillage par tests (encryption.test.ts)
- 4 tests directs sur `tryDecryptText` : plaintext / decrypted / corrupted / "differs from safeDecrypt" — ce dernier prouve explicitement que les deux helpers divergent sur un input corrompu (exactement le piège que mon fix précédent contenait).
- 4 tests directs sur `tryDecryptJsonField` : absent / plaintext / decrypted / corrupted.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1056/1056** tests (vs 1047 = +9 nouveaux : 1 leak + 8 helper).

### Registres
- `errors.md` : 1 nouvelle entrée SÉCURITÉ.
- `agentic-mistakes.md` : 1 nouvelle entrée API-DESIGN — "réutilisé safeDecrypt dans un fail-closed, try/catch code mort". Avec la note ironique que je venais d'écrire 5 minutes plus tôt une entrée sur "API qui collapse erreurs en sentinel = anti-pattern pour gates" et que j'ai immédiatement réintroduit le même anti-pattern.

---
## 2026-05-13 — Upload/OCR Phase 3 fail-closed sur envelope corrompue (audit Codex P1)

### Contexte
Audit Codex post-Phase-3.5 a trouvé un fail-open résiduel : `safeDecryptJsonField` retournait `null` pour 3 sémantiques distinctes (absent / legacy null / envelope corrompue), et `isPageArtifactToxic` interprétait ce null comme "pas d'artifact vérifiable" → return false sur une envelope chiffrée indéchiffrable. Repro live Codex : `{state:null, toxic:false}` avec `artifact = { _enc: "ad1", data: "not-valid-ciphertext", v: 1 }`. Même bug dans `extraction-reuse.reEncryptArtifactForReuse` qui transformait silencieusement les envelopes corrompues en `Prisma.DbNull`.

### Action

**TDD : 2 tests RED écrits AVANT fix**
- "fail-closed: a corrupted envelope must be toxic, not silently 'no artifact'" — vérifie `isPageArtifactToxic({ _enc: "ad1", data: "garbage", v: 1 }) === true`.
- "fail-closed: a corrupted envelope on the source must NOT be cloned as Prisma.DbNull" — vérifie que `reuseCompletedExtractionForContentHash` throw quand la source a une envelope indéchiffrable.

**API encryption.ts — nouveau type discriminé**
- `DecryptedJsonFieldResult<T>` : `{ kind: "absent" | "plaintext" | "decrypted" | "corrupted", value?, reason? }`.
- `tryDecryptJsonField(value)` retourne ce résultat (callers security-sensitive).
- `safeDecryptJsonField` réécrite comme wrapper qui collapse absent+corrupted en null (rétrocompat).

**Fix toxic gate (extraction-readiness-policy.ts)**
- `isPageArtifactToxic` : check explicite `if (isEncryptedJsonField(artifact))` → `tryDecryptJsonField(...)` → si `kind === "corrupted"`, return true (toxic) AVANT le check `state === null`.
- Une envelope chiffrée structurellement valide qui ne décrypte pas est désormais bloquée par le gate UNVERIFIED_ARTIFACT.

**Fix extraction-reuse**
- `reEncryptArtifactForReuse` réécrit en switch sur `result.kind`. `corrupted` → throw `CorruptedSourceArtifactError`. La transaction Prisma rollback ; le caller fall back sur une vraie ré-extraction.
- `reEncryptTextPreviewForReuse` : si la string ressemble à du chiffré (`isEncrypted`) mais ne décrypte pas, throw aussi.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1047/1047** tests (vs 1045 = +2 nouveaux fail-closed tests).

### Registres
- `errors.md` : 1 nouvelle entrée SÉCURITÉ.
- `agentic-mistakes.md` : 1 nouvelle entrée API-DESIGN — helper "ergonomique" qui collapse des erreurs en sentinel `null` est anti-pattern pour les security gates.

---
## 2026-05-13 — Upload/OCR Phase 3 fix-up (3 sites de lecture artifact ratés — audit Codex P1)

### Contexte
Audit Codex post-Phase 3 a identifié 3 chemins de lecture du champ `artifact` que mon mapping Phase 3.0 avait ratés. Chaque site est un fail-open silencieux du chiffrement Phase 3 :
1. (P1) `extraction-readiness-policy.readPageVerificationState` ne déchiffrait pas → `isPageArtifactToxic(encrypted)` → toujours false → bypass UNVERIFIED_ARTIFACT.
2. (P1) `evidence-ledger.asRecord` ne déchiffrait pas → 0 tables/charts/numericClaims pour tous les agents downstream.
3. (P1) `extraction-reuse` clonait `artifact`/`textPreview` verbatim → une source legacy plaintext produisait une nouvelle row plaintext (re-fuite du corpus).

Demandé en bonus : tests qui ÉCHOUENT aujourd'hui (TDD style) pour chaque bug avant le fix.

### Action

**Méthode : 3 tests RED écrits AVANT fix** (`phase3-leak-findings.test.ts`)
- "flags a parse_failed artifact as toxic whether stored encrypted or plaintext" — vérifie que `isPageArtifactToxic` opère sur les deux formats.
- "returns identical structured counts for encrypted vs plaintext artifacts" — vérifie que le ledger compte les mêmes claims peu importe le format.
- "writes ENCRYPTED artifact + textPreview to the target row even when the source is legacy plaintext" — vérifie qu'un clone reuse ne propage pas le plaintext.
- + 2 régression-guards : clean encrypted reste non-toxic / source déjà encrypted ne fuit pas.

**Fix 3.5(a) — extraction-readiness-policy déchiffre transparently**
- Import `safeDecryptJsonField` dans `extraction-readiness-policy.ts`.
- `readPageVerificationState` et `readVerificationEvidence` font le décrypt en première ligne.
- Tous les callers existants (`isPageArtifactToxic`, plus 3 sites externes) deviennent corrects sans changement de signature.
- Le commentaire d'en-tête "Ne doit dependre d'AUCUN autre module interne" assoupli explicitement pour autoriser `@/lib/encryption` (leaf utility, zéro deps internes).

**Fix 3.5(b) — evidence-ledger.asRecord déchiffre transparently**
- Une seule fonction `asRecord` modifiée pour faire `safeDecryptJsonField(value)` AVANT le type check.
- Les 2 sites de consommation (`buildEvidenceLedgerFromContext` + `countNumericClaims`) deviennent corrects sans changement.

**Fix 3.5(c) — extraction-reuse re-encrypte au clonage**
- Deux nouveaux helpers `reEncryptArtifactForReuse(stored)` + `reEncryptTextPreviewForReuse(stored)` dans `extraction-reuse.ts`.
- Pipeline : `safeDecryptJsonField/safeDecrypt` (handle legacy + encrypted) → `encryptJsonField/encryptText` (fresh IV).
- La target row est TOUJOURS chiffrée, peu importe le format de la source.

### Audit transversal final
- `grep -rnE "page\.artifact"` : 8 sites recensés, tous passent par `safeDecryptJsonField` ou un helper Phase 3.
- `grep -rnE "page\.textPreview"` : 1 site (extraction-reuse), passe par `reEncryptTextPreviewForReuse`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1045/1045** tests (vs 1040 Phase 3 = +5 nouveaux : 3 RED→GREEN + 2 régression-guards).

### Registres
- `errors.md` : index + 3 nouvelles entrées détaillées (1 SÉCURITÉ + 2 RGPD).
- `agentic-mistakes.md` : 1 nouvelle entrée RECHERCHE — mapping de surface trop étroit (grep sur pattern d'usage au lieu du nom de champ).

---
## 2026-05-13 — Upload/OCR Phase 3 (Privacy DB — chiffrement artifact + textPreview)

### Contexte
Feu vert Codex pour Phase 3 avec exigence non négociable : chiffrement + compat lecture legacy plaintext + tests non-régression sur `DocumentExtractionPage.artifact`, `textPreview` et claims structurés. Gate Codex : "refuse si du texte OCR brut reste lisible en DB hors `Document.extractedText`, sauf metadata non sensible justifiée".

### Action

**3.1 — Helpers chiffrement JSON (compat legacy)**
- `src/lib/encryption.ts` : nouveau `encryptJsonField(value)` qui sérialise + chiffre en AES-256-GCM, retourne `{ _enc: "ad1", data, v: 1 }`.
- `isEncryptedJsonField(value)` : strict envelope detection.
- `safeDecryptJsonField<T>(value)` : (a) envelope → decrypt + JSON.parse, (b) plaintext object → return as-is (legacy compat), (c) null → null, (d) corrupted envelope → null + console.warn.
- 7 tests dédiés couvrant round-trip, IV unique, null inputs, legacy plaintext verbatim, corrupted ciphertext, unicode/nested.

**3.2 — Chiffrer toutes les écritures**
- Wrapper centralisé `encryptExtractionPagePayload({ artifact, textPreview })` dans `extraction-runs.ts`.
- Sites modifiés :
  - `extraction-runs.ts:recordExtractionPageProgress` (upsert).
  - `extraction-runs.ts:buildExtractionPageCreateInput` (batch create via recordDocumentExtractionRun + completeDocumentExtractionRun).
  - `retry/route.ts` (success path via wrapper, failed path via `encryptText` direct).
- `extraction-reuse.ts` non modifié : le clonage copie envelope/plaintext as-is, fonctionne uniformément à la lecture.

**3.3 — Déchiffrer toutes les lectures avec compat legacy**
- `extraction-audit/route.ts` : `safeDecryptJsonField(page.artifact)` + `safeDecrypt(page.textPreview)` avant sérialisation client. Toutes les introspections (`extractArtifactProvider`, `extractArtifactVerification`, `extractSemanticAssessment`, `buildPageEvidenceSummary`) opèrent sur le payload décrypté.
- `extraction-runs.ts:getBlockingPageNumbersFromStoredPages` : `safeDecryptJsonField(page.artifact)` avant `extractSemanticAssessment`.
- `retry/route.ts:canRetryPage` : `safeDecryptJsonField(page.artifact)` avant introspection des tables/charts/numericClaims.
- `document-context-retriever.ts:formatExtractionPageArtifact` : décryption avant build du prompt LLM.
- `ocr-service.ts:normalizeDocumentPageArtifact` : décryption avant validation du cache OCR par hash d'image.

**3.4 — Tests non-régression (`phase3-encryption-compat.test.ts`)**
- 12 tests qui prouvent les 3 invariants gate Codex :
  - (a) `encryptExtractionPagePayload` ne laisse AUCUNE substring du corpus brut lisible dans la forme stockée (audit gate principal).
  - (b) Round-trip exact via `safeDecryptJsonField` + `safeDecrypt`.
  - (c) Legacy plaintext rows retournées verbatim (zero migration).
  - (d) Décision blocking IDENTIQUE pour rows legacy vs encrypted (le risque le plus chiant : un audit dialog qui diverge selon la date d'extraction).
  - (e) Tables / charts / numericClaims / visualBlocks survivent avec égalité stricte.
  - (f) Phase 1 extraction-reuse reste correct (envelope copy → décryption).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 131 fichiers · **1040/1040** tests (vs 1021 pré-Phase 3 = +19 nouveaux : 7 helper + 12 non-régression).

### Migration / rollout
- Aucune migration de schema requise. Le format envelope tient dans le champ Json existant.
- Aucun backfill DB requis. La compat legacy est résolue à la lecture par `safeDecryptJsonField`.
- L'env `DOCUMENT_ENCRYPTION_KEY` est déjà en place (utilisée par `Document.extractedText`).

---
## 2026-05-13 — Upload/OCR Phase 2 résiduel (storageUrl ?? storagePath dans OCR/reprocess)

### Contexte
Codex a feu vert pour Phase 3 mais demande de boucler un P2 résiduel : 3 routes OCR-adjacent bloquaient encore sur `document.storageUrl` seul alors que (1) le schema permet `storagePath` sans `storageUrl` (rows local-dev / legacy), (2) download/preview/delete savaient déjà fallback. Inconsistance connue à fermer maintenant.

### Action
- `process/route.ts:91`, `ocr/route.ts:63`, `retry/route.ts:79` : remplacés par `const storageTarget = document.storageUrl ?? document.storagePath;` + check `!storageTarget` + `downloadFile(storageTarget)`. Message d'erreur : "Document has no storage reference".
- Test ajouté : `retry/__tests__/route.test.ts` "downloads using storagePath when storageUrl is null" — assertion que downloadFile est appelé avec le storagePath quand storageUrl est null.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 130 fichiers · **1021/1021** tests (vs 1020 fix-up = +1 nouveau test storagePath-only).

---
## 2026-05-13 — Upload/OCR Phase 2 fix-up (post-audit Codex P1/P2)

### Contexte
Codex a refusé le gate Phase 2 pour 4 problèmes :
1. (P1) `validateTemporaryBlobUrl` ne bindait pas `blobUrl` à `blobPathname` → cleanup = primitive de delete arbitraire (caller authentifié choisit ce qu'on supprime).
2. (P1) Cleanup armé avant ownership prouvée → première early-return supprime un blob potentiel d'un autre tenant.
3. (P1) `/api/documents/upload/client` n'exigeait pas `pathname.startsWith(\`tmp/document-uploads/${dealId}/\`)` → token généré pour upload dans le namespace d'un autre deal.
4. (P2) Temp pathname incluait le filename original (leak avant cleanup).
5. (P2) Incohérence `storageUrl` seul vs `storageUrl ?? storagePath` (mask, delete document).
Demandé en bonus : tests route upload immédiats (pas Phase 5).

### Action

**P1.1 — Binding strict blobUrl ↔ blobPathname**
- `validateTemporaryBlobUrl` (route.ts) : après les checks domaine + préfixe, extraire `decodeURIComponent(new URL(blobUrl).pathname).replace(/^\/+/, "")` et exiger `=== blobPathname`. Sinon throw UploadRequestError 400. Garantie : tout blob qu'on delete dans un cleanup est bien celui que le caller a déclaré.

**P1.2 — Cleanup armé seulement après ownership**
- POST handler réordonné. Tous les early-returns pré-ownership utilisent `NextResponse.json` direct (pas de cleanup, le blob temp n'est pas prouvé comme étant à nous).
- `cleanupSourceUpload` armé UNIQUEMENT après : (a) URL↔pathname binding, (b) `pathname.startsWith(\`tmp/document-uploads/${dealId}/\`)`, (c) `deal.findFirst({ id: dealId, userId })` succès.
- `bailWithCleanup` créé après l'arming, utilisé pour toutes les checks post-ownership (parent doc, running analysis, MIME, size, signature, dedup).

**P1.3 — Durcir upload/client**
- `onBeforeGenerateToken` (client/route.ts) : nouveau check `pathname.startsWith(\`tmp/document-uploads/${parsedPayload.dealId}/\`)`. Sinon ClientUploadTokenError 400. Empêche un caller de générer un token pour le namespace d'un autre deal.

**P2.1 — Temp pathname opaque**
- `buildTemporaryBlobPathname(dealId: string)` (file-upload.tsx) : `tmp/document-uploads/${dealId}/${crypto.randomUUID()}.enc`. Le filename original n'apparaît plus dans le path Vercel Blob public-readable. Reste dans le body JSON (HTTPS-only).

**P2.2 — Harmonisation storageUrl ?? storagePath**
- `maskDocumentStorage` (deals/[dealId]/route.ts) : strip `storageUrl` ET `storagePath`, compute `hasStorage: Boolean(storageUrl ?? storagePath)`.
- DELETE `/api/documents/:id` : target = `document.storageUrl ?? document.storagePath`.
- Ajout `storagePath: true` au prisma select GET+PATCH deal pour que le mask voie les deux.

**Tests route upload (5 nouveaux, dans `upload/__tests__/route.test.ts`)**
1. blobUrl pathname mismatch blobPathname → 400, deleteFile NOT called, dealFindFirst NOT called.
2. blobPathname dealId segment ≠ body dealId → 400, deleteFile NOT called, dealFindFirst NOT called.
3. Unowned deal (deal.findFirst null) → 404, fetch NOT called, deleteFile NOT called.
4. Owned deal + MIME invalid → 400, fetch NOT called (MIME check pre-fetchBuffer), deleteFile called once sur l'URL temp bound.
5. Multipart + uploadFile success + document.create throws → 500, deleteFile called once sur l'URL finale (cleanup catch-block).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 130 fichiers · **1020/1020** tests (vs 1015 Phase 2 = +5 nouveaux tests route upload).

### Registres
- `errors.md` : 5 nouvelles entrées (3 SÉCURITÉ + 1 RGPD + 1 QA), index complété.
- `agentic-mistakes.md` : 2 nouvelles entrées (SÉCURITÉ-RAISONNEMENT : raté la primitive de delete arbitraire / TESTING : renvoyé tests sécurité à Phase 5 par confort).

---
## 2026-05-13 — Upload/OCR Phase 2 (Blob / Storage — audité par Codex)

### Contexte
Avec Phase 1 gate verte (clerkFetch sweep + refund honnête), passage à Phase 2 du plan Codex sur la surface Blob/Storage. Cinq sous-tâches :
1. Valider deal ownership / running analysis / parent doc / dealId-vs-pathname AVANT de fetch/décrypt le Blob client.
2. Nettoyer le temp blob sur tous les early-returns du handler upload.
3. Tracker le blob final et le cleanup si Document.create / update échoue.
4. DELETE deal doit cascade-delete les blobs documents (pas seulement les rows DB).
5. Remplacer `deals/${dealId}/${filename}` par une clé opaque random + retirer `storageUrl` des réponses client.

### Action

**2.1 — Validation pre-fetch (deferred buffer)**
- `UploadInput` type réécrit avec `source: "multipart" | "blob"` + `fetchBuffer: () => Promise<Buffer>` différé. Plus de fetch direct dans `readBlobUploadInput`.
- POST handler : ordre `deal ownership → parent ownership → running analysis → MIME → size → fetchBuffer()`. Le blob distant n'est pull/décrypté QUE si toutes les checks cheap passent.
- Nouvelle check `blobPathname.startsWith(\`tmp/document-uploads/${dealId}/\`)` : bloque la substitution cross-deal d'un blob temp.

**2.2 — Cleanup temp blob (early-returns)**
- Helper centralisé `bailWithCleanup(status, payload)` qui fait `await cleanupUploadSource; cleanupSourceUpload = null; return NextResponse.json(...)`.
- 7+ early-returns réécrits via ce helper : `!file`, `!dealId`, dealId CUID invalid, blob pathname mismatch, deal not found, parent CUID invalid, parent not found, running analysis, MIME/size, signature, dedup. Avant : seuls MIME/size/signature/dedup faisaient le cleanup.

**2.3 — Cleanup blob final si DB échoue**
- Variable `cleanupFinalBlob: (() => Promise<void>) | null = null` au top du handler. Armée juste après `uploadFile()` (final blob créé). Désarmée juste après `prisma.document.create()` (le row commit garantit que le blob est référencé en DB).
- Catch block enrichi : appelle `cleanupFinalBlob()` si encore armée, en plus du `cleanupSourceUpload`. Si le cleanup échoue, on log `console.warn` sans masquer l'erreur originale.

**2.4 — DELETE deal cascade blobs**
- `src/app/api/deals/[dealId]/route.ts` DELETE : avant `prisma.deal.delete`, `prisma.document.findMany({ where: { dealId }})` puis boucle tolérante aux échecs (try/catch par blob, agrégation dans `blobDeletionErrors[]`).
- Réponse JSON inclut `blobDeletionFailures: number` pour visibilité.
- `console.warn` détaille les blobs qui n'ont pas pu être supprimés (already-deleted, 410, network) — la DB cascade procède quand même.
- 3 nouveaux tests dans `[dealId]/__tests__/route.test.ts` : success path (ordre blob avant DB), 1 blob failure / DB cascade quand même, 404 deal pas owné (aucune storage operation).

**2.5 — Clé opaque blob + suppression storageUrl client**
- Nouveau storage key : `deals/${dealId}/${randomUUID()}${safeExtension}` (au lieu de `deals/${dealId}/${sanitizedFilename}`). dealId prefix conservé pour ops legibility ; filename retiré du path (le `Document.name` DB le conserve pour l'UI).
- Toutes les responses qui sérialisaient `storageUrl` :
  - GET/PATCH `/api/deals/:dealId` : helper `maskDocumentStorage()` transforme `documents[i].storageUrl: string | null` → `documents[i].hasStorage: boolean`.
  - GET/PATCH `/api/documents/:id` : strip `storageUrl` + `storagePath`, ajout `hasStorage`.
  - POST `/api/documents/upload` : même stripping ; type `SafeDocumentResponse` (Omit + hasStorage).
  - SSR `/(dashboard)/deals/[dealId]/page.tsx` : strip dans le map avant de passer aux client components.
- Client : `UploadedDocumentSummary`, `Document` (documents-tab), `DocumentPreviewDialog` props : `storageUrl: string | null` → `hasStorage: boolean`. Gate `disabled={!doc.storageUrl}` → `disabled={!doc.hasStorage}`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 129 fichiers · **1015/1015** tests passés (vs 1012 avant Phase 2 = +3 tests DELETE cascade).

### Hors scope Phase 2 (renvoyé aux phases suivantes)
- Phase 3 : chiffrer/neutraliser `DocumentExtractionPage.artifact` + `textPreview` + autres champs OCR brut en DB.
- Phase 4 : Inngest, idempotency, soft timeout, versioning.
- Phase 5 : route tests complets upload (incl. assertions pre-fetch ordering), goldens, fixtures.

---
## 2026-05-13 — Upload/OCR Phase 1 fix-up (post-audit Codex)

### Contexte
Audit Codex sur Phase 1 a remonté deux P1 :
1. Gate clerkFetch pas vraiment vert : `extraction-quality-badge.tsx:367` (POST `/api/documents/:id/ocr`) restait en `fetch` brut, ainsi que `text-preview-dialog.tsx`, `corpus/email-form.tsx` et `corpus/note-form.tsx` (`/api/documents/text`).
2. La branche 422 du retry route annonçait `refundedCredits: 2` en dur sans vérifier le résultat de `refundCreditAmount` — si la provider de crédits retournait `{ success: false }` ou throwait, l'utilisateur restait débité mais l'API affirmait le contraire.

### Action

**Sweep clerkFetch complet (4 fichiers supplémentaires)**
- `extraction-quality-badge.tsx` : `POST /api/documents/:id/ocr` → `clerkFetch`.
- `text-preview-dialog.tsx` : `GET /api/documents/:id?includeText=1` → `clerkFetch`.
- `corpus/email-form.tsx` + `corpus/note-form.tsx` : `POST /api/documents/text` → `clerkFetch`.
- Sanity grep final `grep -rnE "fetch\(['\"\`]/api/(documents|deals/[^/]+/staleness)"` = vide.

**Refund honnête (retry + process routes)**
- `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts` branche 422 :
  - Capture du résultat de `refundCreditAmount` dans `let refundedCredits = 0; let refundFailed = false;`.
  - `try / catch` autour de l'appel pour distinguer throw vs `{ success: false }`.
  - `refundedCredits` set uniquement si `refund?.success === true`, sinon `refundFailed = true` + `console.error` détaillé.
  - Réponse JSON inclut le **vrai** `refundedCredits` (0 ou 2) + `refundFailed` pour le client.
- Catch block du même route : passage de `.catch(() => undefined)` à try/catch avec log explicite "user remains debited".
- `src/app/api/documents/[documentId]/process/route.ts` symétrique sur la branche 500 et le catch.

**Tests refund failure**
- `retry/__tests__/route.test.ts` : 2 nouveaux tests :
  - `refundCreditAmount.mockResolvedValue({ success: false })` → payload `refundedCredits: 0, refundFailed: true`, `console.error` appelé.
  - `refundCreditAmount.mockRejectedValue(new Error("network unreachable"))` → idem.
- Total retry route tests : 4/4 verts.

**Registres**
- `agentic-mistakes.md` : 2 nouvelles entrées (RECHERCHE — sweep grep trop étroit ; COMMUNICATION — refund annoncé sans vérif).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 129 fichiers · **1012/1012** tests passés (vs 1010 avant ce fix-up).

---
## 2026-05-13 — Upload/OCR Phase 1 (hotfix critique audité par Codex)

### Contexte
Codex a livré un plan en 5 phases après audit upload/OCR. Phase 1 = hotfix critique avant tout autre refactor. Quatre points : (1) fuite cross-tenant dans le cache d'extraction par contentHash, (2) Authorization Bearer manquant sur la surface upload/OCR (workaround Clerk SDK), (3) UX upload (failed déclenchait toast success + auto-close ; progress pouvait régresser 36% → 1%), (4) retry OCR (credits non refundés sur échec, requiresOCR jamais remis à false).

### Action

**1.1 Tenant isolation du cache d'extraction**
- Extrait `reuseCompletedExtractionForContentHash` de `src/app/api/documents/upload/route.ts` (~190 lignes) vers `src/services/documents/extraction-reuse.ts` pour testabilité.
- Ajout d'un paramètre `userId` et d'un filtre `deal: { userId }` sur le `findFirst` source.
- Avant : même hash + COMPLETED + extractionRuns READY suffisaient à cloner les artifacts entre tenants (fuite OCR/text/pages). Après : reuse strictement intra-tenant.
- Test : `src/services/documents/__tests__/extraction-reuse.test.ts` (3 tests, dont assertion explicite du filtre `deal: { userId }`).

**1.2 clerkFetch sur la surface upload/OCR**
- `file-upload.tsx` : `/api/documents/upload`, `/api/documents/upload/client` (token Blob), upload final blob → `clerkFetch`.
- `documents-tab.tsx` : staleness, GET document, PATCH (rename), DELETE → `clerkFetch`.
- `document-extraction-audit-dialog.tsx` : extraction-audit, extraction-decision, /process, /extraction-pages/:n/retry (single + batch) → `clerkFetch`.
- `analysis-panel.tsx` : extraction-decision → `clerkFetch`.
- `corpus/attachment-input.tsx` : `/api/documents/upload` → `clerkFetch`.
- Bypasse le `__session` cookie périmé sur preview Vercel (cf. errors.md 2026-05-13 AUTH).
- Test : `src/lib/__tests__/clerk-fetch.test.ts` (4 tests : Bearer attaché, respect des headers user, fallback session-less, server-side no-op).

**1.3 UX upload**
- `mergeMonotonicProgress(prev, next)` extrait comme fonction pure exportée. Empêche tout retour en arrière du percent affiché, sauf phases terminales `completed`/`failed` qui bypassent.
- `applyServerProgress` (callback du composant) utilise ce merge à la place de `setServerProgress(payload)` direct. Le `setServerProgress(null)` reste pour les resets explicites entre fichiers.
- `onAllComplete` signature changée : `() => void` → `(summary: { successCount, errorCount }) => void`. `handleUploadAll` agrège les retours de `uploadFile`.
- `DocumentUploadDialog.handleAllComplete` : si `successCount === 0`, plus de toast "Documents uploadés avec succès" et plus d'auto-close. Si mix succès/échec, toast hybride. Si tout réussi, comportement préservé.
- Test : `src/components/deals/__tests__/file-upload-progress.test.ts` (6 tests : pas de prev, monotonie, hausse autorisée, terminal completed/failed bypass).

**1.4 Retry OCR**
- `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts` :
  - Branche 422 (OCR retry returns no usable text) : avant retournait 422 sans rembourser les 2 crédits débités. Maintenant : `refundCreditAmount` avec `idempotencyKey: extraction:refund:supreme-page:${requestId}`, réponse inclut `refundedCredits`.
  - Branche succès : avant `requiresOCR: true` posé inconditionnellement dans la transaction (signifiait "OCR a tourné" mais l'UI lit "OCR encore requis"). Maintenant : si `refreshRunExtractionStats(...).readyForAnalysis === true`, on update `Document.requiresOCR = false` après la transaction.
- `src/app/api/documents/[documentId]/process/route.ts` : symétrique. Branche extraction text vide (500) refund les crédits debités via `EXTRACTION_HIGH_PAGE` avec idempotencyKey reproc-id. Réponse inclut `refundedCredits`.
- Test : `src/app/api/documents/.../retry/__tests__/route.test.ts` (2 tests : selectiveOCR retournant texte vide → refund ; selectiveOCR retournant `success: false` → refund).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run --config vitest.unit.config.ts` : 129 fichiers, 1010 tests passés, 0 régression.

### Hors scope Phase 1 (renvoyé aux phases suivantes du plan Codex)
- Phase 2 : Blob/Storage (ownership deal vs blobUrl, clé opaque random, cleanup blob temp/final, delete deal cascade).
- Phase 3 : Privacy DB (chiffrer/neutraliser `DocumentExtractionPage.artifact` + `textPreview`).
- Phase 4 : Durabilité jobs (Inngest, idempotency, soft timeout, versioning).
- Phase 5 : Route tests, goldens, fixtures OCR capped/skipped.

---
## 2026-05-13 — Pipeline visuelle : ne plus bloquer review après visual extraction réussie

### Contexte
Sur un PDF dont la nouvelle pipeline avait OCR'd 27 pages en high_fidelity + supreme tier avec succès (`quality=100%`), l'UI affichait toujours un dialog "Review requis - Qualité 100%" avec "OCR recommandé" et un bouton "Activer OCR" — alors que l'OCR était déjà fait. L'utilisateur a souligné que c'était précisément ce que la refonte de pipeline était censée éliminer.

### Action
`src/services/documents/extraction-runs.ts:isBlockingReviewPage` :
- Nouveau champ `ocrProcessed?: boolean` sur `ExtractionPageReviewShape`.
- Quand `ocrProcessed === true`, la page n'est plus blocking que pour :
  - Erreur fatale explicite (`did not complete`, `returned no text`, `could not be extracted reliably`), OR
  - `semanticSufficiency === "insufficient"` AND `analyticalValueScore >= 70` (seuil rehaussé de 35 → 70).
- Branche `shouldBlockIfStructureMissing` désactivée post-OCR : la pipeline visuelle ÉTAIT le moyen de capturer la structure ; insister ne donne rien de plus.
- Pages non OCR'd conservent les seuils existants.
- `getBlockingPageNumbersFromStoredPages` étendu pour propager `ocrProcessed` depuis le DB (champ déjà persisté sur `DocumentExtractionPage`).

Effet en cascade : pour les nouvelles extractions où la pipeline visuelle réussit, `blockingPages.length === 0` → `requiresOCR === false` (cf. `upload/route.ts:783`) → le badge passe en vert "Quality X%" et le dialog "Review requis" + "OCR recommandé" ne s'affiche plus.

### Tests
- `npx vitest run src/services/documents/__tests__/extraction-runs.test.ts` → 5/5 ✅
- `npx vitest run src/services/pdf/__tests__/golden-corpus.test.ts` → 3/3 ✅

### Limitation
Les documents extraits AVANT ce fix gardent leur `extractionMetrics.blockingPages` figé dans le DB. Le dialog s'affichera sur eux tant qu'ils ne sont pas re-extraits (bouton "Réessayer l'extraction" ou backfill).

---
## 2026-05-13 — Fix double bug upload : progress Redis-less + Clerk 404 cookie sync

### Contexte
Test live sur preview Vercel (Chrome DevTools MCP) après le bump 6.39.3. Deux bugs distincts identifiés et corrigés ensemble :
1. **Progress data:null permanent** — l'UI restait figée à 35% car `setDocumentExtractionProgress` écrivait dans un `InMemoryStore` isolé par invocation Vercel (`UPSTASH_REDIS_*` non configuré). Les polls dans une autre invocation lisaient une Map vide → `{data:null}`.
2. **Clerk 404 après JWT expiry** — le bump SDK 6.39.3 n'a PAS suffi. Le cookie `__session` reste expiré côté browser tandis que `__session_Gu_eEu8y` est rafraîchi. Le middleware Clerk lit le mauvais cookie.

### Bug 1 — Migration du progress vers Postgres
- Nouveau modèle Prisma `DocumentExtractionProgress` (id=progressId UUID, userId, documentId, phase, pageCount, pagesProcessed, percent, message, expiresAt). TTL 15 min géré dans `getDocumentExtractionProgress` (best-effort cleanup à la lecture).
- Migration SQL `prisma/migrations/20260513115614_document_extraction_progress/`.
- `src/services/documents/extraction-progress.ts` réécrit pour utiliser `prisma.documentExtractionProgress.upsert/findUnique` au lieu du `getStore()`.
- `package.json` : `build` passe à `prisma migrate deploy && next build` pour que les migrations s'appliquent automatiquement sur Vercel (idempotent — n'applique que les pending).

### Bug 2 — Wrapper `clerkFetch` avec Bearer token
- Vérifié dans `node_modules/@clerk/backend/dist/internal.js:910` : `return this.sessionTokenInCookie || this.tokenInHeader;` → le middleware fait fallback sur Authorization header si cookie expiré.
- Nouveau `src/lib/clerk-fetch.ts` : wrapper minimal qui appelle `Clerk.session.getToken()` côté browser et attache `Authorization: Bearer <jwt>` à la requête. Solution générique applicable à n'importe quel endpoint API.
- `src/components/deals/file-upload.tsx` : `fetch(...)` du polling progress remplacé par `clerkFetch(...)`. Autres usages de `fetch` (staleness, etc.) à wrapper progressivement si nécessaire.

### À valider après rebuild preview
- L'UI affiche les vraies valeurs de progress (page count, %) au lieu de rester figée à 35%.
- Aucun 404 sur `/api/documents/upload/progress/...` même après ≥2 cycles d'expiry JWT (>2 min).

---
## 2026-05-13 — Bump @clerk/nextjs 6.36.8 → 6.39.3 (fix preview JWT cookie sync)

### Contexte
Sur les preview Vercel (Clerk en `pk_test_…`), les requêtes API basculent en 404 après ~1 min d'inactivité, alors que l'UI reste loggée. Diag live via Chrome DevTools MCP : le SDK Clerk rafraîchit `__session_Gu_eEu8y` (cookie suffixé par instance) mais pas `__session` (sans suffixe), que lit le middleware. Le middleware reçoit donc un JWT expiré et renvoie la page HTML 404 (visible dans `x-clerk-auth-message: JWT is expired … session_refresh_session_token_ineligible`).

### Action
- `@clerk/nextjs` `^6.36.8` → `^6.39.3` (latest 6.x) via `npm install`. APIs utilisées (clerkMiddleware, auth, currentUser, ClerkProvider, useUser, SignIn/SignUp/UserButton, useClerk) stables sur la fenêtre — pas de breaking change attendu.

### Action complémentaire (côté Clerk Dashboard, hors code)
- Allonger "Session token lifetime" de 60 s à 5-10 min côté instance preview/dev pour réduire la fenêtre d'expo au bug, le temps de valider le fix SDK.

### À valider
- Re-déployer la preview puis refaire un upload long (>3 min) et vérifier qu'aucun 404 n'apparaît sur le polling progress ni sur `/api/deals/*/staleness`.

---
## 2026-05-11 — vault: Création Obsidian-AngelDesk-Brain (LLM Wiki Karpathy)

Création du vault Obsidian de référence pour Angel Desk selon le pattern LLM Wiki Karpathy (déjà éprouvé sur Obsidian-Netgem-Brain). Le vault devient la référence ultime indexée et navigable pour toutes les connaissances projet : doctrine, agents, systèmes, projets, synthèses docs.

### Localisation
- `/Users/sacharebbouh/Documents/Obsidian/Obsidian-AngelDesk-Brain/`

### Contenu (163 pages + raw snapshot)
- **01_Companies** (6) : Angel Desk, Anthropic, OpenRouter, Neon, Clerk, Vercel.
- **02_People** (1) : Sacha Rebbouh.
- **03_Projects** (10) : Refonte 41 Agents, Arc-Light, Fact Store, Live Coaching, AI Board, Reflexion/Consensus, DB Exploitation, Audit Personas, Truncation, Corpus Upload Stabilization.
- **04_Products** (15) : hubs Angel Desk + Tier 0/1/2/3 + Board + Chat + Orchestrator + Maintenance + Context Engine + Funding DB + Fact Store + Live Coaching + Reflexion + Consensus.
- **05_Documents** (30) : synthèses des .md du repo (CLAUDE, reference.yaml, dbagents, errors, changes-log, ai-board, FACT-STORE-SPEC, LIVE-COACHING-SPEC, REFLEXION-CONSENSUS, DB-EXPLOITATION, AGENT-REFONTE, audit-personas, truncation, investor, exec-summary, product-overview, pitch-deck × 2, market-research × 2, workinprogress, arc-light, README, + 7 docs/engines).
- **06_Concepts** (85) : doctrine (12), architecture/infra (10), métier (10), Tier 0 (3) + Tier 1 (13) + Tier 2 (22) + Tier 3 (8) + Board (3) + Maintenance (4) = 53 agents documentés.
- **07_Sources** (5) : Anthropic API, OpenRouter, shadcn ui, Vercel Blob, Neon.
- **_MOC** (7) : hubs humains de navigation.
- **_Templates** (9), **CLAUDE.md** (schema vault), **README.md**, **index.md** (catalogue), **log.md** (journal append-only).
- **raw/snapshots/2026-05-11/** : 31 fichiers copiés depuis angeldesk repo (immutable Karpathy).

### Doctrine inscrite dans le vault
- Anti-prescriptive : aucune page ne dit "Angel Desk recommande X" (cf. règle N°1 projet).
- 5 directives anti-hallucination appliquées au contenu du vault (citation systématique, [UNCERTAIN]/[UNVERIFIED] si extrapolation).
- Anti-doublon primordial avant toute écriture (cf. `_LLM-WIKI-PATTERN.md` Sacha).
- Workflows : ingest / query / lint / snapshot codifiés dans `CLAUDE.md` du vault.

### Vérification finale
- 163 pages content, 0 lien cassé réel (8 placeholders pédagogiques dans templates/CLAUDE.md vault).
- Index exhaustif machine-lisible (`index.md`) + 7 MOCs humains.
- Seed log dans `log.md`.

### À enrichir au prochain ingest dédié
- reference.yaml (1782 lignes), investor.md (5014 lignes), REFLEXION-CONSENSUS-ENGINES.md (4216 lignes) : lecture intégrale et synthèse approfondie.
- 10 experts Tier 2 marqués `agent_status: spec` (Biotech, EdTech, PropTech, Mobility, FoodTech, HRTech, LegalTech, Cybersecurity, SpaceTech, Creator).

### MAJ 2026-05-12 (lectures intégrales COMPLÈTES — session unique)

**Toutes les lectures restantes complétées en session.** Aucun "à enrichir" / "à approfondir" résiduel dans le vault.

- FACT-STORE-SPEC (1262L restantes), investor.md (2914L restantes), REFLEXION-CONSENSUS-ENGINES (2596L restantes), AGENT-REFONTE (1052L restantes), audit-failles (362L restantes), LIVE-COACHING (544L restantes), dbagents (951L restantes) → **TOUTES lues intégralement (~9700L)**.
- 22 Tier 2 experts source code confirmé tous IMPL. Pages mises à jour `spec` → `active`.
- Prisma schema.prisma lu (2502L, 50+ modèles + enums).
- 6 docs short pitch-deck/pitch-deck-slides/gemini-market-research/market-research-gemini/workinprogress/arc-light-renderer-spike : lus intégralement et enrichis.
- 2 nouveaux concepts créés : [[Sector Standards Management]] + [[Calculs Arithmétiques en Code]].
- 2 nouvelles entités créées : [[ChatGPT]] + [[Claude]] (mentionnés comme concurrents DIY).
- **189 pages content au final** (vs 187 phase 16-23, vs 163 seed initial).
- 0 lien cassé.
- Audit-failles personas : status 102/102 ✅ COMPLÉTÉE (4 waves × ~180h effort).
- Live Coaching : 7/7 phases ✅ complétées.

### MAJ 2026-05-11 (ingest enrichissement — même session)
**Phases 16-23 exécutées** : lecture intégrale reference.yaml + chunks substantiels investor.md / REFLEXION-CONSENSUS / AGENT-REFONTE / audit-failles / LIVE-COACHING / dbagents.

**+24 pages ajoutées** :
- 12 concepts : [[Sublimation]], [[L'IA Augmentée]], [[Analyse Vivante (V1-V2-V3)]], [[Data Reliability Classification]], [[Temporal Detection]], [[Pricing Model & Credits]], [[Persona Marie]], [[Anti-DIY Pitfalls]], [[Question Persistence]], [[ROI Simulator]], [[Challenge Partner]], [[Track Record Visible]].
- 12 entités : 7 concurrents (Harmonic $1.45B, Hebbia $700M, AlphaSense $4B, PitchBook, CB Insights, Dealroom, Carta) + 5 stack additions (Inngest, Ably, Recall.ai, Deepgram, Fly.io).

**8 pages massivement enrichies** :
- Doc - reference.yaml (Bible Technique) : 34 sections couvertes (TAM/SAM/SOM, scoring methodology, Board AI 4 LLMs, Live Coaching pipeline 6 composants, engines V3.0, anti-hallucination 60+ fichiers, moat triple, pricing crédits 6 packs, persona Marie, unit economics, 7 objections, roadmap).
- Doc - investor.md : 200+ lignes de synthèse, flag des divergences vs reference.yaml (positioning, count agents, pricing).
- Doc - REFLEXION-CONSENSUS-ENGINES : V3.0 complet (types TypeScript, system prompts, source hierarchy 5 ranks).
- Doc - AGENT-REFONTE-PROMPT : anti-patterns + standards + format sortie par agent + discrepancy count agents.
- Doc - audit-failles-personas : TOP 10 failles convergentes + 25 CRITICAL + 9 verdicts personas.
- Doc - dbagents.md : 4 agents détaillés + tests validés (Brave Search + DeepSeek option A) + Telegram bot + Schema Prisma + coûts $2.50-5/mois.
- Consensus Engine + Reflexion Engine + Live Coaching System (pages hubs).

**Vault final** : **187 pages content** (+15% vs seed initial 163), 0 lien cassé réel.

**Découvertes critiques captées** :
1. Positionnement actualisé reference.yaml 2026-03-10 : ancien claim BA-only obsolète.
2. Drift count agents (44 vs 41 vs 40 vs 38 selon les docs).
3. Mono-modèle Gemini 3 Flash hardcodé = CRITICAL (4 personas convergent — F02 dans audit).
4. Scoring 100% LLM non déterministe = CRITICAL (F03).
5. Pricing model : passage FREE/PRO 249€ → crédits 6 packs.
6. Sublimation/L'IA Augmentée/Analyse Vivante = 3 moats marketing centraux (pas formalisés au seed).

---
## 2026-04-22 — fix: Suppression middleware.ts deprecie (Next.js 16)

Next.js 16 a deprecie la convention `middleware.ts` au profit de `proxy.ts`. Les deux fichiers coexistaient (contenu quasi-identique), ce qui bloquait le dev server au demarrage avec "Both middleware file and proxy file are detected".

### Fichiers
- `src/middleware.ts` **supprime** (doublon de `src/proxy.ts`)
- `src/proxy.ts` conserve (clerkMiddleware + BYPASS_AUTH + isPublicRoute identiques)

---
## 2026-04-17 — fix: Audit-driven hardening — 24+ items P0/P1/P2 corriges (pipeline, credits, UI, board, chat)

Suite a 5 audits paralleles (orchestrator, UI, API/data, credits, board/chat) qui ont
identifie 24+ bugs dont 13 P0 (money / fonctionnel), corrections chirurgicales pour
un systeme thesis-first production-ready.

### P0 — Fonctionnel & money
1. **Checkpoint manquant sur pause** (`orchestrator/index.ts`) : `saveCheckpoint` desormais appele pendant pauseAfterThesis. Avant : `resumeAnalysis` throwait "no checkpoint" → continue/contest casse.
2. **Thesis stale sur resume** (`orchestrator/index.ts`) : `resumeAnalysis` rehydrate enrichedContext.thesis via thesisService.getLatest(). Avant : Tier 1/2/3 reconciler repartaient sans contexte.
3. **Non-fatal thesis fail + refund** (`orchestrator/index.ts`) : si thesis-extractor null avec pauseAfterThesis=true, l'analyse abort FAILED. Avant : silent fallthrough sans gate.
4. **/decision refund mint 2cr** (`decision/route.ts`) : valide mode="full_analysis" + refundedAt=null avant refund. Avant : route mintait 2cr pour n'importe quel deal avec these.
5. **Admin backfill idempotency** (`backfill/route.ts`) : key stable `admin-thesis-backfill:${admin}:${deal}:${prevThesisId}`. Avant : Date.now() = double-charge sur click.
6. **Admin + upload double-charge** (`inngest.ts`) : thesisReextractFunction skip BA deduct si triggeredByAdminId. Avant : admin 2cr + BA 1cr meme operation.
7. **Thesis.create() race** (`thesis/index.ts`) : advisory lock Postgres pg_advisory_xact_lock + SERIALIZABLE + updateMany({isLatest:false}). Avant : 2 rows isLatest=true possibles.
8. **Refund amounts alignes 3cr partout** (decision route + modal) : 5cr Deep Dive - 2cr Tier0/extraction = 3cr. Avant : modal 2cr, phase3 3cr, mismatch.
9. **Null event broadcast** (`decision/route.ts`) : inngest.send skip si pausedAnalysis null. Avant : analysisId:null pollue.
10. **THESIS_DEBATE invisible** (`ai-board-panel.tsx` + nouveau `thesis-debate-view.tsx`) : filter roundType, render dedie avec solidite/critique/recommandations. Avant : persist DB mais UI vide.
11. **Chat intent THESIS dead code** (`deal-chat-agent.ts`) : classifier liste THESIS + keywords (these, why-now, moat, YC, Thiel, PMF, monopoly, contrarian). Avant : jamais emis.
12. **5 directives anti-hallucination** (`thesis/types.ts` helper + 4 prompts injectes) : CLAUDE.md respecte. Avant : violations dans thesis-extractor + YC/Thiel/Angel Desk.
13. **Chat thesisBypass hardcoded false** (`chat/[dealId]/route.ts`) : propage depuis Analysis.thesisBypass. Avant : chat ignorait le bypass BA.

### P1 — Robustesse
14. **compensate double-compensation** (`inngest.ts`) : phase3 fail apres paused=true → refund PARTIEL 3cr au lieu de integral 5cr. Avant : user gagne 5cr + these.
15. **Rebuttal cap race** (`thesis/index.ts` + routes) : recordDecision("contest") en tx SERIALIZABLE avec SELECT FOR UPDATE. Retourne null si race → routes refund + 429.
16. **Rate limits** (decision 10/min + rebuttal 5/min) : checkRateLimitDistributed.
17. **Deals/page orderBy** sur include theses.
18. **getHistory pagination** take=20 par defaut.

### P2 — UX & consistance
19. **thesis_only mode label** ajoute.
20. **ThesisPayload.createdAt** exposé → RevisionBanner utilise vrai timestamp.
21. **Modal auto-open race guard** : !!thesis required.
22. **Alerts board capped** top 10 severity-sorted + "+N autres".
23. **Thesis section en tete chat prompt** : resume avant deal info pour anti-truncation.
24. **Thesis-extractor + reconciler dans contract penalty list**.
25. **Legacy refund marque refundedAt** : audit trail complet.
26. **Devise incohérence** : `$1M+`, `$2M+` → `€1M+`, `€2M+` dans angel-desk.ts.

### Validations
- `npx tsc --noEmit` → 0 erreur
- `npx vitest run` → 559/559 tests verts (mock prisma mis a jour : updateMany, $executeRawUnsafe, $transaction avec options)

---
## 2026-04-17 — feat: Thesis-first completeness — 3 UI components + chat loader + deals-table + admin backfill + transition Quick Scan

Complete du rollout thesis-first avec les 6 items manquants par rapport au plan initial :

1. **ThesisFrameworksExpand** — composant collapsible affichant les 3 lunettes (YC/Thiel/Angel Desk) en detail : verdict + confiance + question centrale + claims testes (supported/contradicted/unverifiable/partial) + strengths + failures + summary. Toggle global + toggle par framework. Injecte dans AnalysisPanel apres ThesisHeroCard.
2. **ThesisRevisionBanner** — banner affiche quand une nouvelle version de these apparait (v2+). Calcule automatiquement le diff verdict / confiance / reformulation / load-bearing (ajoutees / supprimees / modifiees). Bouton "Voir diff complet" ouvre dialog avec comparaison avant/apres per-field. Dismiss persist localement.
3. **ThesisStaleBadge** — badge sur deals pre-migration (variant="inline" dans deals-table, variant="full" pour page deal). CTA "Lancer Deep Dive" route vers la page deal + loading state pendant le declenchement.
4. **Chat IA context loader** — `/api/chat/[dealId]` charge desormais `thesisService.getLatest(dealId)` et l'injecte dans `FullChatContext.thesis`. `DealChatAgent.buildContextPrompt()` formate la these complete (reformulation, probleme, solution, why-now, moat, path-to-exit, verdict, load-bearing, alertes, 3 lunettes). L'intent `THESIS` dispose maintenant du contexte necessaire pour repondre.
5. **deals-table thesis column** — nouvelle colonne "Thèse" entre Score et Statut. Affiche le verdict avec `THESIS_VERDICT_CONFIG` (labels courts : Très solide / Solide / Contrastée / Fragile / Non validée). Fallback sur `ThesisStaleBadge` pour deals sans these. Sort canonique sur l'ordre du verdict (meilleur→pire), deals sans these en bas. Query Prisma etendue avec `include: { theses: { where: { isLatest: true } } }`.
6. **Admin backfill** — `/api/admin/thesis/backfill` (GET liste candidats + POST declenche re-extract, 2cr facturees admin, idempotent par dealId). Page `/admin/thesis` avec liste des deals sans these (200 max), search, bouton backfill individuel + bouton batch avec confirm. Client component `AdminThesisBackfillClient` gere les etats loading/done/error par deal.
7. **THESIS_VERDICT_CONFIG** — config dedie dans `ui-configs.ts` avec `label` long, `shortLabel` pour table, `color`, `bg`, `description` par verdict. Reutilisable partout où la these s'affiche.
8. **Quick Scan retire de l'UI** — `pricing-content.tsx` retire la card QUICK_SCAN + ajoute cards `THESIS_REBUTTAL` + `THESIS_REEXTRACT`. Banner explicite "Quick Scan remplacé par Deep Dive thesis-first" en tete avec detail du nouveau flow (5cr inclut these, stop possible avec refund 3cr). `analysis-panel.tsx` : retrait du fallback `tier1_complete` → `analysisType` toujours `full_analysis`.
9. **base-agent contract** — `getRequiredOutputContractFields()` etendu avec entries pour `thesis-extractor` (11 champs : reformulated / problem / solution / whyNow / verdict / confidence / loadBearing / alerts / ycLens / thielLens / angelDeskLens) et `thesis-reconciler` (5 champs). Active la verification contractStatus pour ces agents (PARTIAL_UNVERIFIED si manquants).
10. **Meta-gate dans Tier3Results** — `Tier3Results` accepte `thesisVerdict` + `thesisBypass`. Si these fragile sans bypass : notice rouge "Score global non applicable" au lieu du SynthesisScorerCard. AnalysisPanel propage les props depuis `thesis?.verdict` + `thesis?.thesisBypass` (lu depuis l'analyse liee via le route API thesis).
11. **API thesis route enriche** — `/api/deals/[id]/thesis` retourne desormais history avec `reformulated` / `problem` / `solution` / `whyNow` / `moat` / `pathToExit` / `loadBearing` (pour le diff RevisionBanner) + `thesisBypass` lu depuis l'analyse liee la plus recente.

### Fichiers nouveaux
- `src/components/deals/thesis/thesis-frameworks-expand.tsx`
- `src/components/deals/thesis/thesis-revision-banner.tsx`
- `src/components/deals/thesis/thesis-stale-badge.tsx`
- `src/components/admin/admin-thesis-backfill-client.tsx`
- `src/app/(dashboard)/admin/thesis/page.tsx`
- `src/app/api/admin/thesis/backfill/route.ts`

### Fichiers modifies
- `src/lib/ui-configs.ts` — THESIS_VERDICT_CONFIG.
- `src/components/deals/analysis-panel.tsx` — imports FrameworksExpand + RevisionBanner + ThesisStaleBadge, types ThesisPayload enrichis, detection previousThesisVersion via history, propagation thesisVerdict/thesisBypass vers Tier3Results, retrait fallback tier1_complete.
- `src/components/deals/deals-table.tsx` — colonne Thèse, sort thesisVerdict, ThesisStaleBadge inline.
- `src/components/deals/deals-view-toggle.tsx` — Deal.thesisVerdict optionnel.
- `src/components/deals/tier3-results.tsx` — props thesisVerdict/thesisBypass, meta-gate notice, masquage SynthesisScorerCard si thesisGated.
- `src/app/(dashboard)/deals/page.tsx` — include theses (isLatest) dans getDeals, flatten thesisVerdict.
- `src/app/(dashboard)/pricing/pricing-content.tsx` — retrait QUICK_SCAN, ajout THESIS_REBUTTAL + THESIS_REEXTRACT, banner transition.
- `src/app/api/chat/[dealId]/route.ts` — thesisService.getLatest() injecte dans FullChatContext.thesis.
- `src/app/api/deals/[dealId]/thesis/route.ts` — history enrichie + thesisBypass propage.
- `src/agents/chat/deal-chat-agent.ts` — FullChatContext.thesis + formatage section these dans buildContextPrompt.
- `src/agents/base-agent.ts` — contract fields pour thesis-extractor et thesis-reconciler.

### Commandes validation
```bash
npx tsc --noEmit  # 0 erreur
npx vitest run    # 559/559 tests verts
```

---
## 2026-04-17 — feat: Thesis-first pipeline pause + Board round THESIS_DEBATE + meta-gate + auto re-extraction

Suite au delivery thesis-first de base, implementation des 5 items deferes :
1. **Inngest waitForEvent** : pipeline d'analyse splittee en 3 phases — `phase1-extract-thesis` → `step.waitForEvent('analysis/thesis.decision', 24h)` → `phase3-post-thesis`. Le BA dispose de 24h pour decider (stop / continue / contest). Sur timeout : full refund + analyse expired. Sur stop : partial refund (3cr sur 5).
2. **AnalysisPanel integration** : `ThesisHeroCard` injecte en haut des resultats d'analyse, polling toutes les 5s de `/api/deals/[id]/thesis`, ouverture automatique de `ThesisReviewModal` des que `hasPendingDecision=true`. Decision BA → invalidation cache → pipeline reprend.
3. **Board round THESIS_DEBATE** : nouveau round 0 execute AVANT les DEBATE rounds classiques. Les 4 membres IA (Claude/GPT/Gemini/Grok) debattent la solidite de la these (score 0-100, weakest assumption, major critique, recommandations). Persist en `AIBoardRound` avec `roundType=THESIS_DEBATE`.
4. **Meta-gate UI** : `VerdictPanel` masque le score global si `thesisVerdict ∈ {alert_dominant, vigilance}` et `!thesisBypass`. Affiche notice "Score non applicable — these jugee fragile". `SynthesisDealScorerAgent` applique la regle 4 post-LLM : cap 50/100 si these fragile sans bypass.
5. **Auto re-extraction** : sur upload d'un nouveau document, si le deal a deja une these persistee, emission de l'event Inngest `analysis/thesis.reextract`. Nouvelle Inngest function `thesisReextractFunction` : facture 1cr (idempotent), re-lance extraction via `orchestrator.runAnalysis({pauseAfterThesis:true, forceRefresh:true})`, refund sur echec.

### Fichiers modifies
- `src/agents/orchestrator/types.ts` — `AnalysisOptions.pauseAfterThesis` + `PausedAnalysisResult` + pass-through dans `AdvancedAnalysisOptions`.
- `src/agents/orchestrator/index.ts` — pause post-thesis (persist intermediate results + emit `analysis/thesis.review-required` event + early return), nouvelle methode publique `continueAnalysisAfterThesis(analysisId, decision, {thesisBypass})` qui route sur completeAnalysis (stop/timeout) ou resumeAnalysis (continue/contest).
- `src/agents/tier3/synthesis-deal-scorer.ts` — regle 4 : cap score a 50 si `thesisVerdict ∈ {alert_dominant, vigilance} && !thesisBypass`.
- `src/lib/inngest.ts` — `dealAnalysisFunction` splittee en 3 `step.run` avec `step.waitForEvent('analysis/thesis.decision', 24h)` au milieu. Nouvelle fonction `thesisReextractFunction` triggeree par `analysis/thesis.reextract`. Helper `compensateFailedAnalysis` factorise le refund.
- `src/app/api/deals/[dealId]/thesis/decision/route.ts` — emit `analysis/thesis.decision` event apres persistance. Refund partiel uniquement pour analyses deja COMPLETED (legacy) ; les RUNNING/paused sont gerees par Inngest phase3.
- `src/app/api/documents/upload/route.ts` — apres extraction COMPLETED, si deal a une these, emit `analysis/thesis.reextract`.
- `src/components/deals/verdict-panel.tsx` — props `thesisVerdict`/`thesisBypass`/`thesisDecision`. Logic `thesisGated`. Top accent line rouge, score ring masquee, notice "Score non applicable".
- `src/components/deals/analysis-panel.tsx` — imports `ThesisHeroCard` + `ThesisReviewModal`. Query `thesis.byDeal` avec polling 5s. Auto-open modal sur `hasPendingDecision=true`. Callback `handleThesisDecided` invalide les caches et toast.
- `src/lib/query-keys.ts` — `queryKeys.thesis.byDeal(dealId)`.
- `src/agents/board/types.ts` — `BoardInput.thesis` (nullable) + nouveau `ThesisDebateResponse`.
- `src/agents/board/board-orchestrator.ts` — `prepareInputPackage` charge la these via `thesisService.getLatest()`. Round 0 (`runThesisDebate`) execute AVANT les initial analyses. Persist en `AIBoardRound` avec `roundType=THESIS_DEBATE`.
- `src/agents/board/board-member.ts` — nouvelle methode `debateThesis(input)` + prompt `buildThesisDebatePrompt` : evaluation adherence/solidity/weakest-assumption/major-critique/recommandations.

### Commandes validation
```bash
npx tsc --noEmit  # 0 erreur
npx vitest run    # 559/559 tests verts
```

---
## 2026-04-17 — feat: Thesis-first architecture (extractor + reconciler + frameworks + bifurcation)

Refonte fondamentale de l'analyse : avant de parler equipe/marche/finances, on teste
la THESE d'investissement de la societe. Extraite par AI en Tier 0.5, confrontee a
3 frameworks (YC, Thiel, Angel Desk), reconciliee avec les findings Tier 1/2/3,
bifurcation BA (Stop / Continue / Contest + rebuttal 1cr).

### Phase 1 — Schema + Agents backend
**Fichiers :**
- `prisma/schema.prisma` — nouveau modele `Thesis`, enum `RedFlagCategory` += `THESIS` + `THESIS_VS_REALITY`, enum `RoundType` += `THESIS_DEBATE`, enum `CreditAction` += `THESIS_REBUTTAL` + `THESIS_REEXTRACT`. `Analysis` : nouveaux champs `thesisId` (FK), `thesisDecision`, `thesisDecisionAt`, `thesisBypass`.
- `prisma/migrations/20260417120000_thesis_first_architecture/migration.sql` — migration idempotente (appliquee sur Neon). Cree table `Thesis` + indexes + FK CASCADE, etend les enums, ajoute les colonnes sur `Analysis`.
- `src/agents/thesis/types.ts` — types partages : `ThesisVerdict`, `LoadBearingAssumption`, `FrameworkClaim`, `FrameworkLens`, `ThesisAlert`, `ThesisExtractorOutput`, `ThesisReconcilerOutput`, `RebuttalJudgeOutput`. Helper `worstVerdict()` pour la doctrine "worst-of-3".
- `src/agents/thesis/frameworks/yc.ts` — lunette YC (problem reality, PMF path, distribution, retention, why-now, moat PMF-driven).
- `src/agents/thesis/frameworks/thiel.ts` — lunette Thiel (contrarian truth, 10x, proprietary tech, network effects, monopoly path, timing).
- `src/agents/thesis/frameworks/angel-desk.ts` — lunette Angel Desk **elargi au spectre investisseur prive** (BA solo + groupe d'angels + family office + syndicate, pas juste BA solo). Exit realisable, ticket compatibility, dilution control, key-person risk, liquidity path, instrument protection.
- `src/agents/tier0/thesis-extractor.ts` — agent Tier 0.5 : extrait reformulated/problem/solution/whyNow/moat/pathToExit, identifie 3-5 load-bearing assumptions, lance les 3 lunettes en parallele, verdict worst-of-3.
- `src/agents/tier3/thesis-reconciler.ts` — agent Tier 3 : confronte la these initiale aux findings Tier 1/2 (financial-auditor, market-intel, competitive-intel, team-investigator, customer-intel), emet red flags `THESIS_VS_REALITY`, met a jour verdict (cap amelioration +1 cran max, degradation non cappee).
- `src/agents/thesis/rebuttal-judge.ts` — agent one-shot declenche par action BA. Juge un rebuttal ecrit (valid / rejected) avec critere de rigueur strict (~80% rejected attendus).
- `src/services/thesis/index.ts` — service persistance : create (versioning auto-incremente), getLatest, getHistory, applyReconciliation, recordDecision, recordRebuttalVerdict, hasReachedRebuttalCap (3 max/deal), isStale, listDashboard cross-deals.
- `src/agents/thesis/__tests__/types.test.ts` + `src/services/thesis/__tests__/thesis-service.test.ts` — 21 tests couvrant worstVerdict doctrine + CRUD + versioning + rebuttal cap + isStale.

### Phase 2 — Orchestrateur + Tier 3 integration
**Fichiers :**
- `src/agents/orchestrator/index.ts` — nouvelle methode `runThesisExtraction()` appelee en Tier 0.5 dans `runFullAnalysis` (apres fact-extractor + deck-coherence + context-engine, avant Tier 1 phases). Persiste la these via `thesisService.create()`, linke `Analysis.thesisId`, injecte dans `enrichedContext.thesis` pour propagation downstream. Apres thesis-reconciler (Tier 3), appelle `thesisService.applyReconciliation()` pour persister le verdict raffine.
- `src/agents/orchestrator/agent-registry.ts` — `getTier3Agents()` retourne maintenant 7 agents (+ `thesis-reconciler`).
- `src/agents/orchestrator/types.ts` — `TIER3_BATCHES_AFTER_TIER2` : nouveau batch `["thesis-reconciler"]` AVANT `synthesis-deal-scorer` (pour que le scorer voie le verdict raffine).
- `src/agents/tier3/index.ts` — exports ajoutes.
- `src/agents/types.ts` — `EnrichedAgentContext.thesis` ajoute (champs reformulated/problem/solution/whyNow/moat/pathToExit/verdict/confidence/loadBearing/alertsCount/ycVerdict/thielVerdict/angelDeskVerdict).
- `src/services/credits/types.ts` — `CreditActionType` += `THESIS_REBUTTAL` (1cr), `THESIS_REEXTRACT` (1cr). `QUICK_SCAN` marque DEPRECATED (valeur conservee pour historique transactions).
- `src/services/credits/usage-gate.ts` — `getActionDescription()` complete pour les nouveaux types.
- `src/app/api/analyze/route.ts` — **Quick Scan retire de l'offre**. `analyzeSchema` rejette les nouveaux types `screening`/`quick_scan`/`tier1_complete`. Message de transition : "Quick Scan a ete remplace par Deep Dive". Defaut = `full_dd`. `getAnalysisTier` mis a jour.
- `src/agents/__tests__/agent-pipeline.test.ts` — test mis a jour : tier3Agents = 7 (avec thesis-reconciler).

**Simplification documentee :** L'Inngest `waitForEvent` pour PAUSE mi-pipeline (stop/continue/contest avant Tier 1/2/3) n'est PAS implemente dans cette version. Le pipeline tourne complet, la bifurcation se fait cote UI post-completion via modal non-dismissible. Le compute Tier 1/2/3 est toujours depense meme sur Stop, mais le rendu UI est gate par `thesisDecision`. Evolution Phase 2b : split `runAnalysis` en 2 steps Inngest avec `step.waitForEvent('thesis.decision', { timeout: '24h' })` + handler dedie pour reprendre le pipeline. Reporte pour eviter un refactor massif risque du orchestrateur (3794 lignes).

### Phase 3 — Endpoints API
**Fichiers nouveaux :**
- `src/app/api/deals/[dealId]/thesis/route.ts` — `GET` : these courante + historique versions + hasPendingDecision flag. Auth + ownership.
- `src/app/api/deals/[dealId]/thesis/decision/route.ts` — `POST` : enregistre la decision BA (stop | continue | contest). Refund partiel 2cr si stop. `thesisBypass=true` si continue sur verdict fragile. Idempotence double-submit (409 si decision deja posee). Cap rebuttals (3 max/deal).
- `src/app/api/deals/[dealId]/thesis/rebuttal/route.ts` — `POST` : invoque `thesis-rebuttal-judge`. Debite 1cr idempotent (clef `thesis:rebuttal:${thesisId}:${count}`). Refund automatique en cas de crash/echec du juge.
- `src/app/api/thesis/dashboard/route.ts` — `GET` : liste cross-deals avec filtres `verdict` / `sector` / `stage` / `search` / `sortBy` / `sortDir` + pagination (take/skip, cap 100).

### Phase 4 — UI thesis-first (composants V1)
**Fichiers nouveaux :**
- `src/components/deals/thesis/thesis-hero-card.tsx` — HERO card : reformulation longue (3-5 phrases), verdict badge (RECOMMENDATION_CONFIG), structure probleme/solution/whyNow/moat/pathToExit, load-bearing assumptions avec statut (verified/declared/projected/speculative), alertes (toutes affichees, pas limitees a 3 — expand au-dela de 5). Bouton "Decider" et "Voir par framework".
- `src/components/deals/thesis/thesis-review-modal.tsx` — modal non-dismissible (pattern cgu-consent-modal). 3 options : Arreter (refund partiel 2cr) / Continuer / Contester (1cr, textarea 4000 chars max). Appels API /thesis/decision et /thesis/rebuttal. Footer explicite sur le timeout 24h.

**Reportes en Phase 4b :**
- Integration effective de `ThesisHeroCard` dans `AnalysisPanel` (placement HERO, polling pending decision, auto-ouverture du modal) — composants livres, cablage UI a faire.
- `ThesisFrameworksExpand` — toggle 3 lunettes YC/Thiel/AD.
- `ThesisRebuttalDialog` (en partie : integre au ReviewModal).
- `ThesisRevisionBanner` (auto re-extraction sur nouveau doc).
- `ThesisStaleBadge` sur deals pre-migration.
- Meta-gate UI (masquer score global dans `VerdictPanel` si verdict=alert_dominant et !thesisBypass).

### Phase 5 — Dashboard cross-deals
**Fichier nouveau :**
- `src/app/(dashboard)/theses/page.tsx` — page `/theses` : 5 cards count par verdict (very_favorable → alert_dominant), liste des thèses avec click → page deal, deal/secteur/stage/reformulation tronquee + verdict + decision. Server component.

### Phase 6 — Chat intent THESIS
**Fichiers :**
- `src/agents/chat/deal-chat-agent.ts` — ajout de l'intent `"THESIS"` dans le type `ChatIntent` + guidance dedie dans `getIntentGuidance()`. Le chat repond structurement sur verdict / assumptions / raison de la fracture / points d'approfondissement.

**Reporte en Phase 6b :**
- Round `THESIS_DEBATE` dans le Board IA (refactor `board-orchestrator` + `board-member`). Les types enum Prisma sont en place. L'implementation des prompts + ordre des rounds reste a faire.
- Auto re-extraction sur nouveau doc upload (event Inngest `thesis.reextract` + handler).
- Backfill badge UI sur deals pre-migration.

### Decisions utilisateur respectees (dialogue en 6 batches)
- **Nature these** : celle de la societe (pas du BA) — pas de champ user pour rediger these
- **Placement** : Tier 0.5 (extractor) + Tier 3 (reconciler) — 2 passes
- **Frameworks** : YC + Thiel + Angel Desk systematiquement en parallele
- **Framework Angel Desk elargi** : BA solo + groupe d'angels + family office + syndicate (clarifie mid-dialogue)
- **Bifurcation** : Stop / Continuer / Contester (3 boutons modal non-dismissible)
- **Labels verdict** : alignes sur `RECOMMENDATION_CONFIG` existant (signaux très favorables → alerte dominante)
- **Scoring gate** : meta-gate — si thèse fail, score global masque (implementation UI en Phase 4b)
- **Frameworks visibles** : partiellement (expand apres verdict unifie)
- **Conflit thèse vs realite** : nouvelle categorie `THESIS_VS_REALITY` (emise par reconciler)
- **Persistance** : table Thesis + versioning + comparable cross-deals dashboard
- **Edition these** : non editable, rebuttal ecrit (1cr) analyse par rebuttal-judge
- **Quick Scan supprime** — Deep Dive est le tier d'entree (validation explicite user)
- **Bifurcation timeout** : 24h (dans la doc du modal UI ; implementation serveur en Phase 2b)
- **Rebuttal cap** : 3 max/deal (anti-abus)
- **First view BA** : these reformulee longue + verdict + alertes (pas limitees a 3)

### Validation
- `npx prisma migrate deploy` OK (9 migrations appliquees sur Neon prod)
- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **559/559 tests verts** (21 nouveaux thesis-*)

### Avant gros tests
1. Tester manuellement le flow Deep Dive sur un deal existant : verifier que thesis-extractor tourne en Tier 0.5 et persiste
2. Tester les 4 endpoints API (GET thesis, POST decision, POST rebuttal, GET dashboard)
3. Exercer la page `/theses`
4. Monitorer les costs LLM : thesis-extractor = 4 LLM calls (1 core + 3 frameworks parallel). Modele complex. Estimer le cout moyen.

---
## 2026-04-16 — feat: Sprint P1 — durcissement complet (securite, data, scoring, UI, perf)

6 vagues livrees, 2 migrations Neon appliquees, 538/538 tests, tsc 0 erreur.

### Vague A — Securite

**Fichiers :**
- `src/app/api/analyze/route.ts` — rate limit par user resserre 5/min -> 2/min.
  Protege du spam + de l'abus couteux (chaque Deep Dive = 41 agents).
- `src/app/api/context/route.ts` — rate limit resserre 10/min -> 3/min. Chaque
  appel Context Engine declenche des calls externes payants (Perplexity, LinkedIn,
  Pappers); 3/min suffit largement au flux normal.
- `next.config.ts` — CSP prod durcie: `unsafe-eval` retire, ajout de
  `challenges.cloudflare.com` (Clerk anti-bot), `api.inngest.com`/`inn.gs`
  (workers), policies `object-src none`, `base-uri self`, `form-action self`.
  Migration nonce-based reportee en P2 (necessite middleware dedie + injection
  dans le layout).
- `src/services/context-engine/connectors/website-crawler.ts` — tous les champs
  issus du HTML crawle (title, description, content, testimonials, clients,
  teamMembers, pricingPlans, jobOpenings, features, integrations) passent par
  `sanitizeForLLM` avec caps explicites (content: 40KB, textes: 256-1024 chars).
  Protege contre les injections adversaire ("Ignore previous instructions...")
  dans les prompts LLM downstream.

### Vague B — Data integrity + idempotence

**Fichiers :**
- `prisma/schema.prisma` — 3 indexes composites: `Deal[userId,status,createdAt]`,
  `RedFlag[dealId,severity]`, `Analysis[dealId,status,createdAt]`.
- `prisma/migrations/20260416170000_p1_composite_indexes/migration.sql` —
  migration safe (IF NOT EXISTS), appliquee sur Neon.
- `src/services/credits/usage-gate.ts` — `refundCredits()` accepte maintenant
  `options: { analysisId?, idempotencyKey? }`. L'idempotence n'est plus bloquante
  (ancienne cle `(userId, dealId, action='REFUND')` empechait les refunds
  multiples sur le meme deal); nouvelle cle scope par analysisId ou par minute
  d'horloge.
- `src/lib/inngest.ts`, `src/app/api/coaching/reanalyze/route.ts` — appels
  migres avec analysisId / sessionId.
- `src/services/credits/__tests__/credit-flow-e2e.test.ts` — mock `findUnique`
  + champ `idempotencyKey` ajoute dans les transactions simulees (27/27 tests).

### Vague C — Scoring + anti-hallucination

**Fichiers :**
- `src/agents/chat/deal-chat-agent.ts` — `sanitizeAgentNarratives()` applique
  sur la reponse chat + suggestedFollowUps avant retour au client. Regle N°1:
  un BA ne doit jamais recevoir "Investissez !" du chat.
- `src/agents/board/board-orchestrator.ts` — idem sur `consensusPoints`,
  `frictionPoints`, `questionsForFounder`, `votes[].justification` avant
  persistence + emission au client. Les votes LLM peuvent contenir du
  langage prescriptif, le sanitizer les neutralise.
- `src/agents/tier3/synthesis-deal-scorer.ts` — nouvelle Rule 3 post-LLM:
  detecte les agents Tier1 en `contractStatus === "PARTIAL_UNVERIFIED"` et
  applique -2 pts par agent (cap -10), baisse la confidence de -5/agent, injecte
  un keyWeakness explicite. `contractStatus` etait emis mais non consomme; il
  influe maintenant sur le score final.

### Vague D — Facturation

**Fichiers :**
- `prisma/schema.prisma` — `Analysis.refundedAt`, `Analysis.refundAmount` ajoutes.
- `prisma/migrations/20260416180000_p1_analysis_refund_tracking/migration.sql` —
  appliquee sur Neon.
- `src/lib/inngest.ts` — le worker marque `refundedAt`/`refundAmount` quand
  il refund sur echec. Permet au resume flow de savoir si les credits ont deja
  ete rembourses (evite le double-refund sur un resume qui re-fail).
- `src/app/api/analyze/route.ts` — resume logic: si `resumableAnalysis.refundedAt`
  est set, on re-facture la reprise; sinon on continue sans double-charger.
- `src/app/api/documents/upload/route.ts` — OCR image granulaire: 1 credit si
  `file.size < 500KB`, 2 credits sinon. Pricing aligne sur cout reel Vision LLM.
- `src/services/board-credits/index.ts` — `refundCredit()` accepte sessionId
  et construit un idempotencyKey scope fin.

### Vague E — UI/UX

**Fichiers (accents FR + HTML entities) :**
- `src/components/deals/founder-responses.tsx` — "Repondez"->"Répondez",
  "re-analyser"->"ré-analyser".
- `src/components/chat/deal-chat-panel.tsx` — "Debutant"->"Débutant",
  "Intermediaire"->"Intermédiaire".
- `src/components/deals/conditions/simple-mode-form.tsx` — "Montant leve"->
  "Montant levé", "Calculee"->"Dilution calculée", "Ecart theorique"->"Écart théorique".
- `src/components/deals/conditions/conditions-tab.tsx` — 5 messages d'erreur
  avec accents corriges ("doit etre"->"doit être", "depasser la duree"->
  "dépasser la durée", "leve"->"levé", etc.).
- `src/components/deals/conditions/term-sheet-suggestions.tsx` — "Montant leve"->
  "Montant levé", "detecte"->"détecté", "pre-remplir"->"pré-remplir".
- `src/components/deals/red-flags-summary.tsx` — "Eleve"->"Élevé".
- `src/components/shared/score-badge.tsx` — HTML entities `&egrave;`, `&eacute;`,
  `&apos;` remplaces par Unicode natif.

**Fichiers (aria-labels) :**
- `src/components/deals/board/views/arena-view.tsx` — SVG Arena recoit
  `role="img"` + `aria-label` explicite.
- `src/components/deals/documents-tab.tsx` — DropdownMenuTrigger recoit
  `aria-label="Options pour {doc.name}"`.

### Vague F — Perf

**Fichiers :**
- `src/agents/base-agent.ts` — `formatDealContext`:
  - Description capee 10000 -> 4000 chars (~1000 tokens vs ~2500).
  - Founders affichage capee a 8 membres (au-dela: compte + ref people graph).
- Retry LLM exponential backoff: **deja en place** au niveau router
  (`src/services/openrouter/router.ts:calculateBackoff` — `baseDelayMs * 2^attempt`).
  L'item audit P1 etait outdated.

### Items P1 audit deja resolus en P0 ou conception existante

- `financial-auditor` timeout 180s -> 240s: **fait 2026-04-16** (commit `83a4e07`)
- `Analysis.documentIds String[]` FK: **fait P0** (`AnalysisDocument` join table)
- CVE xmldom/defu/effect/flatted: **fait P0** (`npm audit fix`)
- Chat directive 5 (Structured Uncertainty): **deja presente** ligne 306 du
  chat system prompt (audit P1 etait errone)
- Tier3 directives doublees: **deja resolues 2026-03-12** (dedup fait en P2C)
- LLM retry exponential backoff: **deja present** dans le router central

### Items reportes en P2 (decision requise)

Ces items etaient dans l'audit P1 mais necessitent une decision produit ou un
chantier multi-semaines qui depasse le scope P1 courant:

- **Poids Board vs `stage-weights.ts`** — divergence jusqu'a 20 pts. Decision
  produit requise: Board = "investment appeal" (subjectif), Scoring = "DD rigor"
  (objectif). A documenter explicitement dans l'UI ou a aligner dynamiquement.
- **Fichiers monolithiques** — orchestrator/index.ts (3800 lignes),
  tier1-results.tsx (4000), types.ts (3900), synthesis-deal-scorer.ts (1900),
  ocr-service.ts (1600), base-agent.ts (1650). Split par domaine = chantier
  d'une semaine minimum. Bloque les nouvelles features, a prioriser apres
  stabilisation.
- **BaseAgent AsyncLocalStorage** — remplacer l'etat mutable singleton
  (`_totalCost`, `_llmCalls`) par un `RunContext` isolated. Refactor
  transversal sensible (tous les tests d'agents impactes).
- **Conversion 125 composants `'use client'` en RSC** — audit fichier par
  fichier, budget bundle 800KB -> 400KB estime. Travail incremental, 1
  composant = 15-30 min.
- **Stripe Checkout + webhook HMAC** — necessite compte Stripe actif + cle
  webhook + tests e2e avec sandbox. Jusque la, achat manuel via mailto reste
  la voie officielle.
- **Live coaching refund partiel** — disconnect avant la fin ne refund pas
  pro-rata. Demande integration Recall.ai webhook + logique temps ecoule.
- **xlsx -> exceljs** (CVE residuelle) — chantier de 2-3 jours (API differente),
  a planifier pour un sprint dedie.
- **Migration `console.log` hot paths restants** — ~600 appels. Outil: codemod
  ou script sed + PR volumineuse.

### Validation

- `npx prisma migrate deploy` OK (7 migrations appliquees sur Neon prod)
- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **538/538 passed**

---
## 2026-04-16 — fix: timeouts Tier1 critiques (financial-auditor, team-investigator)

**Fichiers (2) :**
- `src/agents/tier1/financial-auditor.ts` — `timeoutMs` 180000 -> 240000 (4 min).
  Couvre les gros pitch decks (80+ pages) avec modele complex. Phase B est non-
  fatale depuis le fix 2026-04-13, mais un timeout cascadait sur Tier3 scorer
  (red flags financiers vides, biais optimiste).
- `src/agents/tier1/team-investigator.ts` — `timeoutMs` 120000 -> 180000 (3 min).
  LinkedIn est desormais sequentialise avec retry backoff 429; pour 5 fondateurs
  la latence cumulative peut depasser 120s.

**Valide avant gros tests :** `npx tsc --noEmit` 0 erreur, 538/538 tests.

---
## 2026-04-16 — feat: Sprint P0 — production-readiness (10 fixes bloquants)

Sprint de durcissement complet avant les gros tests. 10 failles P0 traitees en
parallele : orchestration serverless, integrite schema, invariants credits,
observabilite, positionnement anti-hallucination. 538/538 tests verts,
`npx tsc --noEmit` 0 erreur, 19/20 CVE fixees.

### P0.1 + P0.2 + P0.10 — Inngest + pool Neon + FactEvents atomicite

**Fichiers :**
- `src/app/api/analyze/route.ts` — migration complete fire-and-forget -> `inngest.send('analysis/deal.analyze' | 'analysis/deal.resume')`. Rollback credit + deal status si dispatch echoue. Retourne `status: 'QUEUED'`.
- `src/lib/inngest.ts` — cablage de `dealAnalysisFunction` (deja existant) + ajout `dealAnalysisResumeFunction`. Compensation metier (refund + reset deal) dans un step separe quand l'analyse echoue dans le worker. `retries: 1`, `concurrency: 3/user`.
- `src/lib/prisma.ts` — `connection_limit` 25 -> 50 (41 agents en parallele + Inngest concurrency 3/user). `src/lib/__tests__/prisma-pool.test.ts` aligne.
- `src/agents/orchestrator/index.ts` — `createFactEventsBatch` retour verifie et logue si echec (remplace le silent fail). L'atomicite est deja garantie par `prisma.$transaction` interne de `createFactEventsBatch`.

**Probleme resolu :** Les analyses > 5 min (Deep Dive) etaient tronquees
silencieusement par Vercel serverless. Le pool 25 connexions ne suffisait pas
pour 41 agents parallels. Les FactEvents pouvaient etre persistes partiellement
sans que l'orchestrateur le sache.

### P0.3 — Stream polling backoff + select minimal

**Fichiers :**
- `src/app/api/analyze/stream/route.ts` — supprime le fetch de `Analysis.results` (JSON 5-10MB). Select minimal (id, status, completedAgents, totalAgents, summary, timestamps). Backoff exponentiel par type d'analyse (quick=500ms->2s, deep=2s->5s), reset a la progression active. Hard timeout 10 min.
- `src/app/api/analyze/stream/backoff.ts` (nouveau) — `nextStreamBackoffMs`, `getStreamBackoffConfig`, `DEFAULT_STREAM_HARD_TIMEOUT_MS`.
- `src/app/api/analyze/stream/__tests__/backoff.test.ts` (nouveau) — 7 tests (config, reset, doublement, cap, timeout).

**Probleme resolu :** Chaque poll rechargeait le JSON complet de l'analyse
(jusqu'a 360 reads x 5-10MB par analyse). Tres couteux en bande passante Neon
+ Vercel sous charge.

### P0.4 — Extraction pre-check credits avant OCR

**Fichiers :**
- `src/services/pdf/extractor.ts` — ajout `getPdfPageCount()` (lecture `numPages` sans rendu) et `estimatePdfExtractionCost()` (estimation conservatrice worst-case 1 credit/page).
- `src/services/pdf/index.ts` — exports ajoutes.
- `src/services/credits/usage-gate.ts` — ajout `refundCreditAmount()` (refund d'un montant arbitraire avec idempotency key variable). Utilise pour les deltas d'extraction et les refunds sur failure.
- `src/services/credits/index.ts` — exports mis a jour.
- `src/app/api/documents/upload/route.ts` — pre-deduct AVANT `smartExtract()` / `processImageOCR()`. Retourne 402 si credits insuffisants SANS lancer l'OCR. Reconciliation post-extraction : debit delta si reel > estime, refund si reel < estime. Refund integral si l'OCR crash.

**Probleme resolu :** L'OCR etait lance AVANT la verification de credits. Si le
user n'avait pas assez, le compute OpenRouter etait deja consomme et le message
d'erreur etait masque en "file corrupted" generique. Fuite directe de budget
Angel Desk + UX trompeuse.

### P0.5 + P0.6 — Prisma schema hardening + migration

**Fichiers :**
- `prisma/schema.prisma` :
  - `AnalysisExtractionRun.run` ON DELETE : `Restrict` -> `Cascade`
  - `LiveSession.deal` ON DELETE : `SetNull` -> `Cascade`
  - `LiveSession.document` ON DELETE : `SetNull` -> `Cascade`
  - `FactEvent` : `@@unique([dealId, factKey, createdAt, eventType])`
  - Nouveau modele `AnalysisDocument` (table de jointure FK-contrainte, CASCADE des deux cotes). Remplace progressivement `Analysis.documentIds String[]` qui laissait des refs obsoletes apres suppression de documents. Relations bidirectionnelles ajoutees sur `Analysis` et `Document`.
- `prisma/migrations/20260416150000_p0_schema_hardening/migration.sql` (nouveau) — DDL complet : DROP + ADD FK pour les 3 cascade, dedup pre-migration pour FactEvent (DELETE duplicates exact match par cuid-id), CREATE UNIQUE INDEX, CREATE TABLE `AnalysisDocument` + index + FK, backfill `INSERT ... FROM Analysis.documentIds`.
- `src/agents/orchestrator/persistence.ts` — `createAnalysis()` ecrit dans les 2 endroits (legacy `documentIds` + nouvelle jointure `documents`).
- `src/services/analysis-versioning/index.ts` — lecture avec fallback : si la jointure est peuplee, l'utiliser ; sinon fallback sur `documentIds` legacy.

**Probleme resolu :** Suppression de deal en cascade pouvait echouer (Restrict
sur AnalysisExtractionRun), laisser des transcripts orphelins (LiveSession
SetNull), ou contenir des IDs de documents supprimes (String[] sans FK). Les
FactEvents concurrents pouvaient dupliquer la meme entree.

**Migration NON appliquee automatiquement.** A lancer avec `npx prisma migrate
deploy` apres validation sur staging (la dedup FactEvent est destructive — ne
supprime que les duplicates exacts mais requiert verification prealable du
volume).

### P0.7 — 9 fallbacks LLM anti-hallucination

**Fichiers :**
- `src/agents/orchestration/prompts/anti-hallucination.ts` (nouveau) — helper centralise `getFiveAntiHallucinationDirectives()` et `buildFallbackSystemPrompt(role, options)`. Source unique des 5 directives en version complete (verbatim CLAUDE.md).
- `src/agents/board/board-orchestrator.ts` — fallback dedup des key points (~L927) : ajout du `systemPrompt` avec les 5 directives (auparavant : aucune directive).
- `src/agents/tier0/fact-extractor.ts` — fallback meta-evaluation (~L1109) : remplacement du systemPrompt hardcoded avec directives abregees par l'appel au helper (version complete).

Les 7 autres fallbacks (consensus-engine x4, reflexion x3) avaient deja les 5
directives inline. Leur consolidation via le helper est une optimisation P1
(reduction duplication) — non bloquante pour la production-readiness.

**Probleme resolu :** Quand la validation Zod echoue (20-30% des cas en prod),
les fallbacks LLM sans directives anti-hallucination augmentent drastiquement
le taux d'hallucination sur les cas les plus difficiles.

### P0.8 — Feature access backend middleware

**Fichiers :**
- `src/services/credits/feature-access.ts` (nouveau) — `canAccessFeature(userId, feature)`, `assertFeatureAccess(userId, feature)`, classe `FeatureAccessError`, helper `serializeFeatureAccessError(err)`.
- `src/services/credits/__tests__/feature-access.test.ts` (nouveau) — 9 tests (seuils 0/59/60/124/125/300, feature inconnue, assert vs try/catch, serialisation 403).
- `src/services/credits/index.ts` — reexports.
- `src/app/api/v1/keys/route.ts` — POST + DELETE : remplace le legacy `subscriptionStatus === "PRO"` par `assertFeatureAccess(user.id, "api")`. Handler `FeatureAccessError` -> 403 avec payload structure.
- `src/app/api/negotiation/generate/route.ts` — POST : gate `"negotiation"` apres `requireAuth()`. Handler 403 dans le catch.
- `src/app/api/negotiation/update/route.ts` — PATCH : idem.

**Probleme resolu :** Les seuils `FEATURE_ACCESS` (Negotiation=60, API=125) etaient
verifies uniquement au frontend. Un utilisateur pouvait POST directement sur les
routes sans avoir atteint le seuil d'achat cumule -> revenue leak (clef API
creee gratuitement).

### P0.9a — Logger centralise + Sentry durci

**Fichiers :**
- `src/lib/logger.ts` (nouveau) — logger structure avec niveaux (debug/info/warn/error/fatal), redaction automatique des champs PII (email, token, apiKey, clerkId, stripePaymentId, extractedText, prompts, etc.), output JSON en production / console lisible en dev, hook automatique vers Sentry sur error+fatal, breadcrumbs sur warn. API : `logger.info({ ctx }, "msg")` + `logger.child({ bindings })`.
- `sentry.client.config.ts` — `tracesSampleRate: 0.1 -> 0.5`, ajout `release` (VERCEL_GIT_COMMIT_SHA), `environment`, `beforeSend` scrubber (URL params, cookies, headers), `replayIntegration({ maskAllText, blockAllMedia })`, `ignoreErrors` pour les events Next non-bugs.
- `sentry.server.config.ts` — meme trajectoire + beforeSend server-side.
- `sentry.edge.config.ts` — release + environment + tracesSampleRate=0.5.

### P0.9b — Migration console.log -> logger (hot paths critiques)

**Fichiers migres (priorite maximale : routes API d'analyse + credits + orchestration + versioning) :**
- `src/app/api/analyze/route.ts` — tous les `console.error/log` hot paths remplaces.
- `src/agents/orchestrator/persistence.ts` — `logPersistenceError()` utilise maintenant `logger.error`. Blob cache logs via logger.debug/warn.
- `src/services/credits/usage-gate.ts` — 10 sites migres (deductCreditAmount, addCredits, grantFreeCredits, refundCredits, refundCreditAmount, getOrCreateBalance).
- `src/lib/inngest.ts` — 3 sites migres (compensation logic).
- `src/services/analysis-versioning/index.ts` — 4 sites migres.

Le reste des ~700 appels `console.*` (Tier 2/3, UI, connectors) sera migre
progressivement en P1+. La couche observabilite critique (money path + analyse
path) est deja sur Sentry via le logger.

### P0 — npm audit fix

**Commandes :** `npm audit fix` x2 passes. Fixed 19/20 high/moderate CVE :
`@xmldom/xmldom`, `ajv`, `brace-expansion`, `defu`, `effect`, `minimatch`,
`next`, `picomatch`, `rollup`, `serialize-javascript`, `vite`, `yaml`, etc.

**1 CVE restante : `xlsx` (SheetJS)** — prototype pollution + ReDoS. Pas de fix
upstream. Usage circonscrit a la lecture de fichiers Excel en extraction
documents. **Action P1** : remplacer par `exceljs` (fork maintenu) ou sandboxer
l'appel dans un worker isole.

### Validation finale

- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **538/538 tests passed** (16 tests P0 ajoutes : 9 feature-access + 7 stream/backoff)
- Migration SQL `20260416150000_p0_schema_hardening` : generee manuellement, NON appliquee (a valider en staging d'abord)

### A faire avant deploy prod

1. Verifier le volume de duplicates FactEvent en prod avant migration (la section `DELETE a USING b WHERE a.id > b.id ...` supprime les duplicates exacts — ne devrait pas etre massif mais a controler).
2. Tester sous charge (10-50 analyses concurrentes) pour valider le pool=50 + concurrency Inngest 3/user.
3. Monitorer Sentry sur la premiere semaine (tracesSampleRate=0.5 genere plus d'events qu'avant).
4. Exercer le flow 402 extraction (upload gros PDF sans credits) pour valider l'UX client.
5. Documenter la nouvelle API feature-access pour les integrateurs API (README ou CHANGELOG API).

---
## 2026-04-16 — feat: evidence ledger, contrats agents, artefacts DOCX/PPTX/Excel

**Evidence ledger (nouveau service) :**
- `src/services/evidence-ledger/index.ts` + tests — registre centralisé des évidences injecté dans le contexte des agents via `formatEvidenceLedgerForPrompt`.

**BaseAgent / agents :**
- `src/agents/base-agent.ts` — `contractStatus` + `contractIssues` dans `AgentResult`, budget documentaire global partagé entre docs, routing doc affiné par relevance.
- `src/agents/document-context-retriever.ts` + tests — sélection de fenêtres documentaires plus fine.
- `src/agents/orchestration/tier1-cross-validation.ts` (+ nouveaux tests) — cross-validation durcie.
- `src/agents/orchestrator/index.ts`, `persistence.ts` — propagation du contrat.
- `src/agents/tier1/financial-auditor.ts`, `tier3/synthesis-deal-scorer.ts`, `tier2/saas-expert.ts`, `types.ts`, `schemas/common.ts` — durcissements.

**Extraction documents :**
- `src/app/api/documents/upload/route.ts` — artefacts structurés pour DOCX, PPTX, Excel ; OCR des médias embarqués.
- `src/services/docx.ts`, `pptx.ts`, `pdf/ocr-service.ts` — extraction enrichie (sections, tables, médias).
- `src/services/documents/extraction-runs.ts` + tests ; routes extraction-audit / retry mises à jour ; dialog UI d'audit étendu.
- `src/services/pdf/__tests__/document-extraction-golden.test.ts` — golden tests étendus.

**Context Engine :**
- `src/services/context-engine/{index,parallel-fetcher,persistence,types}.ts` — persistence et fetcher étendus.

**TypeScript : OK. Commit `9c07c09` poussé sur `main`.**

---
## 2026-04-13 — fix: financial-auditor timeout cascade + LinkedIn rate limit

**Orchestrator abort logic (1 fichier) :**
- `src/agents/orchestrator/index.ts` — Seule Phase A (deck-forensics) est désormais fatale. Phase B (financial-auditor) failure est loggé en warning mais n'aborte plus les 11 agents restants. L'analyse continue en mode dégradé (question-master sans red flags financiers) au lieu de produire 1/13 agents.

**Financial-auditor timeout (1 fichier) :**
- `src/agents/tier1/financial-auditor.ts` — Timeout augmenté de 120s → 180s pour accommoder les gros documents + modèle complex.

**Problème résolu :** Le timeout du financial-auditor cascadait et tuait toute l'analyse (1/13 agents Tier 1, Tier 3 sur du vide, scorer incohérent 7 vs 49).

**TypeScript : 0 erreurs.**

---
## 2026-04-13 — fix: LinkedIn API rate limit 429 — séquentialisation + retry

**Context Engine (1 fichier) :**
- `src/services/context-engine/index.ts` — `buildPeopleGraph()` : remplacé `Promise.all` parallèle par boucle `for...of` séquentielle. Chaque profil LinkedIn est fetché uniquement après le précédent, évitant les 429 rate limits.

**RapidAPI LinkedIn connector (1 fichier) :**
- `src/services/context-engine/connectors/rapidapi-linkedin.ts` — Ajout retry avec backoff sur HTTP 429 : 3 tentatives max avec délais 2s/4s/6s. Cache DB et log sur chaque retry réussi.

**Problème résolu :** 4/5 profils LinkedIn échouaient en 429 car tous fetchés en parallèle. Le team-investigator n'avait les données que d'1 fondateur sur 5.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — feat: image OCR for JPEG/PNG uploads

**OCR service (1 fichier) :**
- `src/services/pdf/ocr-service.ts` — Ajout `processImageOCR()` : envoie l'image en base64 à GPT-4o Mini Vision via OpenRouter pour extraction texte. Retourne texte, confidence (high/medium/low), coût.
- `src/services/pdf/index.ts` — Export `processImageOCR` ajouté

**Upload route (1 fichier) :**
- `src/app/api/documents/upload/route.ts` — Ajout bloc de traitement image (JPEG/PNG) : passe le buffer à `processImageOCR()`, met à jour le document avec le texte extrait (chiffré), quality score, métriques OCR. Fallback gracieux si OCR échoue (document marqué COMPLETED sans texte).

**Problème résolu :** Les images uploadées restaient en statut "en attente" (PENDING) car aucun bloc de traitement n'existait pour les types image/jpeg et image/png.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — fix: KillReason/CriticalQuestion type alignment, breadcrumb deal detail, cleanup types split

**Vue Kanban deals (3 fichiers) :**
- `src/components/deals/deals-kanban.tsx` — Nouveau : vue kanban groupant les deals par statut (6 colonnes)
- `src/components/deals/deals-view-toggle.tsx` — Nouveau : toggle liste/kanban avec boutons LayoutList/LayoutGrid
- `src/app/(dashboard)/deals/page.tsx` — Intégration DealsViewToggle, toggle visible dans le CardHeader

**Dark mode toggle (2 fichiers) :**
- `src/components/providers.tsx` — Ajout `ThemeProvider` de next-themes (attribute="class", defaultTheme="light")
- `src/components/layout/sidebar.tsx` — Ajout bouton toggle Sun/Moon dans la section user du sidebar

**Type alignment — Dealbreaker → ABSOLUTE/CONDITIONAL (6 fichiers) :**
- `src/agents/types.ts` — Ajout `CriticalQuestion` type alias, ajout `criticalQuestions` dans `QuestionMasterFindings`
- `src/agents/tier1/question-master.ts` — Fix severity mapping: `CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`
- `src/agents/tier3/devils-advocate.ts` — Fix `validKillReasonLevels`, severity mapping, et filtres `dealBreakerLevel`
- `src/components/deals/tier3-results.tsx` — Fix 5 comparaisons `dealBreakerLevel` (`CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`)

**Breadcrumb (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Ajout fil d'Ariane "Deals / {deal.name}" avec `aria-label`

**Cleanup types split (suppression) :**
- Suppression `src/agents/types/` (split incomplet par agent background — fichiers non importés)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — refactor: ProviderIcon extraction, Cache-Control, DB index, accents supplémentaires

**ProviderIcon extraction (5 fichiers) :**
- `src/components/shared/provider-icon.tsx` — Nouveau : composant partagé avec SVG inline des 4 providers (Anthropic, OpenAI, Google, xAI)
- `src/components/deals/board/board-progress.tsx` — Import partagé, suppression locale, accent "Réponse reçue"
- `src/components/deals/board/board-teaser.tsx` — Import partagé, suppression locale
- `src/components/deals/board/vote-board.tsx` — Import partagé, suppression locale
- `src/components/deals/board/views/chat-view.tsx` — Import partagé, suppression locale

**Cache-Control (1 fichier) :**
- `next.config.ts` — Ajout headers `Cache-Control: public, max-age=31536000, immutable` pour `/_next/static/` et `/fonts/`

**DB Index (1 fichier) :**
- `prisma/schema.prisma` — Ajout index composite `[userId, action]` sur CreditTransaction (optimise lookup refund idempotence)

**Accents supplémentaires (7 fichiers) :**
- `src/components/deals/partial-analysis-banner.tsx` — spécialisée, Détecte, spécifiques, Mémo, structuré, thèse, mitigés, étapes, concrètes
- `src/components/deals/board/ai-board-panel.tsx` — Débat (label)
- `src/components/deals/board/key-points-section.tsx` — supplémentaires
- `src/components/deals/conditions/simple-mode-form.tsx` — supplémentaires, spécifiques
- `src/components/deals/conditions/tranche-editor.tsx` — Détails, supplémentaires, Précisions
- `src/components/deals/conditions/term-sheet-suggestions.tsx` — supplémentaires
- `src/components/deals/conditions/structured-mode-form.tsx` — définie, décrire
- `src/components/onboarding/first-deal-guide.tsx` — étapes
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — feat: admin analytics page

**Nouveau fichier :**
- `src/app/(dashboard)/admin/analytics/page.tsx` — Page server component d'analytics admin avec :
  - Overview cards : total users, deals, analyses completed, credits purchased
  - Recent activity : analyses/jour et users/jour (7 derniers jours) en tables
  - Credit health : balance moyenne, credits consumed, revenue estimate
  - Auth via `requireAdmin()`, queries paralleles via `Promise.all`

---
## 2026-03-12 — fix: accents français manquants dans 20+ composants UI

**Re-audit loop — correction des accents français dans les textes user-facing (20 fichiers) :**

- `src/components/shared/cgu-consent-modal.tsx` — opportunités, résultats, à, données, traitées, modèles, générer, utilisée, entraîner, Générales
- `src/components/shared/linkedin-consent-dialog.tsx` — données, expériences, compétences, légale, intérêt, légitime, à
- `src/components/shared/data-completeness-guide.tsx` — trésorerie, équipe
- `src/components/deals/board/ai-board-panel.tsx` — délibèrent, clés
- `src/components/deals/board/board-progress.tsx` — Débat
- `src/components/deals/board/debate-viewer.tsx` — Débat
- `src/components/deals/extraction-quality-badge.tsx` — Échec, échoué
- `src/components/deals/documents-tab.tsx` — Échec
- `src/components/deals/deck-coherence-report.tsx` — cohérentes, incohérences, détectées, nécessaire, données, supplémentaires, cohérence, recommandée, Vérification
- `src/components/deals/founder-responses.tsx` — réponse (x4), générée, générer, à, traitées, refusé, Ré-analyser
- `src/components/deals/partial-analysis-banner.tsx` — Détecteur, Détecte, données, réelles, incohérences, cachées, Modélisation, scénarios, probabilités
- `src/components/deals/tier1-results.tsx` — Résumé, Stratégique, Insights clés (x2)
- `src/components/deals/tier3-results.tsx` — cohérence
- `src/components/deals/analysis-panel.tsx` — Résumé (x3), exécutif, clés, exporté
- `src/components/deals/team-management.tsx` — conservées, équipe (x2)
- `src/components/deals/conditions/conditions-analysis-cards.tsx` — négocier, défavorables, sous-évalué, clés
- `src/components/deals/conditions/dilution-simulator.tsx` — Résultats
- `src/components/deals/conditions/percentile-comparator.tsx` — médiane (x2)
- `src/components/deals/conditions/structured-mode-form.tsx` — Résumé
- `src/components/deals/suivi-dd/suivi-dd-dashboard.tsx` — traitées, réponses
- `src/components/deals/suivi-dd/suivi-dd-tab.tsx` — Ré-analyser, réponses
- `src/components/chat/deal-chat-panel.tsx` — Résumé, identifiés, métriques, médiane, priorité, négociation (x2), justifiée, données (x2), négocier
- `src/components/onboarding/first-deal-guide.tsx` — métriques, clés, équipe, parallèle, marché, résultats, à
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 nouvelles erreurs (2 attendues CGU/Prisma).**

---
## 2026-03-12 — fix: Phase 3A/3B/3C — auth, pricing, CSP, connection pool

**Phase 3A — Auth try/catch (1 fichier) :**
- `src/app/api/analyze/stream/route.ts` — `requireAuth()` wrappé en try/catch → retourne 401 au lieu de crash

**Phase 3B — UX Polish (3 fichiers) :**
- `src/app/(dashboard)/pricing/pricing-content.tsx` — "Pack recommandé : Standard (30 crédits, 99€)" ajouté sous Deal complet + toggle auto-refill masqué + nettoyage imports
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes

**Phase 3C — Architecture (2 fichiers) :**
- `next.config.ts` — CSP connect-src: ajout `wss://*.ably.io https://*.ably.io`
- `src/lib/prisma.ts` — `connection_limit` 15 → 25, comment mis à jour

**Divers :**
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir)
- `src/lib/__tests__/prisma-pool.test.ts` — Tests mis à jour pour connection_limit=25

**Tests : 498/498 passed.**

---
## 2026-03-12 — feat: CGU/IA consent modal at signup

**Prisma schema (1 fichier) :**
- `prisma/schema.prisma` — Ajout champ `cguAcceptedAt DateTime?` au model User (null = pas encore accepte)

**Composants (2 fichiers crees) :**
- `src/components/shared/cgu-consent-modal.tsx` — Modal non-dismissible (pas de X, pas d'escape, pas de clic exterieur) avec checkbox CGU + bouton "Accepter et continuer", POST vers `/api/user/cgu`
- `src/components/shared/cgu-gate.tsx` — Client wrapper qui affiche le modal si `cguAcceptedAt` est null

**API route (1 fichier cree) :**
- `src/app/api/user/cgu/route.ts` — POST handler : `requireAuth()` + `prisma.user.update({ cguAcceptedAt: new Date() })`

**Layout (1 fichier modifie) :**
- `src/app/(dashboard)/layout.tsx` — Charge l'utilisateur via `getAuthUser()`, wrappe le contenu avec `CguGate` qui affiche le modal si consentement manquant

**Auth (1 fichier modifie) :**
- `src/lib/auth.ts` — Ajout `cguAcceptedAt` au DEV_USER (pre-accepte en dev)

**TypeScript : 2 erreurs attendues (champ `cguAcceptedAt` absent des types Prisma generes — resolu apres `prisma generate`).**

---
## 2026-03-12 — feat: RGPD Art. 20 data portability route

**1 fichier cree :**
- `src/app/api/user/export/route.ts` — `GET /api/user/export` retourne un JSON telechargeable avec toutes les donnees utilisateur : profil, deals (founders, documents metadata, red flags, analyses metadata), credits (balance + transactions), API keys (masquees). Exclut les blobs d'analyse (10MB+), extractedText, et les cles API completes. Requetes paralleles via `Promise.all`. Headers `Content-Disposition` pour telechargement direct.

**TypeScript : 0 erreur sur le fichier.**

---
## 2026-03-12 — fix: Phase 2D/3B/3D — FR labels, Dealbreaker rename, UX polish, credits rollover

**Phase 2D — FR enum labels centralisés (2 fichiers) :**
- `src/lib/ui-configs.ts` — Ajout mappings FR : `BURN_EFFICIENCY_LABELS`, `MOAT_LABELS`, `PMF_LABELS`, `DIVERSIFICATION_LABELS`, `CONCENTRATION_LABELS`, `LEVEL_LABELS` + fonction `getEnumLabel()` avec fallback
- `src/components/deals/tier1-results.tsx` — 7 badges remplacent les enums EN bruts par les labels FR centralisés (EFFICIENT→"Efficace", STRONG_MOAT→"Fort avantage concurrentiel", etc.)

**Phase 3D — Dealbreaker → CriticalCondition (3 fichiers) :**
- `src/services/negotiation/strategist.ts` — Interface `Dealbreaker` → `CriticalCondition` (alias deprecated conservé pour compat)
- `src/services/negotiation/index.ts` — Export `CriticalCondition` ajouté
- `src/agents/tier1/schemas/question-master-schema.ts` — Commentaire JSDoc ajouté sur le champ `dealbreakers`

**Phase 3B — UX Polish (5 fichiers) :**
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes (aligné avec dashboard réel)
- `src/components/deals/board/views/arena-view.tsx` — Dimensions responsives `h-[240px] sm:h-[300px] lg:h-[400px]`
- `src/app/(dashboard)/pricing/pricing-content.tsx` — Toggle auto-refill masqué (Stripe non intégré), nettoyage imports/state inutiles
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir), config simplifiée

**Phase 3D — Credits rollover cap (1 fichier) :**
- `src/services/credits/usage-gate.ts` — `addCredits()` enforce rollover cap 2x sur auto-refill uniquement (manual purchases sans cap)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — perf: Phase 2C Performance fixes (export-pdf blob cache, SSR doc select, dedup directives)

**Fix 1 — Export PDF: use Blob cache instead of DB query (3 fichiers) :**
- `src/services/analysis-results/load-results.ts` — Nouveau : fonction `loadResults()` partagee (Blob cache + DB fallback + backfill)
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Remplace `prisma.analysis.findFirst()` (charge le JSON multi-MB depuis Neon, 30s+) par `loadResults()` depuis le Blob cache (<1s). Metadata chargee separement avec `select` (sans le champ `results`)
- `src/app/api/deals/[dealId]/analyses/route.ts` — Importe `loadResults` depuis le service partage au lieu de la fonction locale

**Fix 2 — Deal SSR: exclure extractedText des documents (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — `documents: { include: true }` remplace par `select` explicite excluant `extractedText` (200KB+/doc) et `ocrText`

**Fix 3 — Dedup anti-hallucination directives Tier 3 (6 fichiers) :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — Suppression `getAbstentionPermission()`, `getCitationDemand()`, `getSelfAuditDirective()`, `getStructuredUncertaintyDirective()`, `getDataReliabilityDirective()`, `getAnalyticalToneDirective()` (deja auto-injectes par `buildFullSystemPrompt`). Directive 1 (Confidence Threshold) conservee.
- `src/agents/tier3/memo-generator.ts` — Idem
- `src/agents/tier3/devils-advocate.ts` — Idem
- `src/agents/tier3/scenario-modeler.ts` — Idem
- `src/agents/tier3/contradiction-detector.ts` — Idem
- `src/agents/tier3/conditions-analyst.ts` — Idem

**TypeScript : `npx tsc --noEmit` OK, 0 erreurs.**

---
## 2026-03-12 — test: comprehensive score-aggregator test suite (35 tests)

**Fichiers créés (1) :**
- `src/scoring/services/__tests__/score-aggregator.test.ts` — 35 tests couvrant : agrégation normale, scores 0 et 100, input vide, dimension unique, distribution des poids, scores hors limites, dimensions manquantes, filtrage par confidence, structure du résultat, précision moyenne pondérée, toggle confidence weighting, variance attendue, mapping catégorie→dimension, utilitaire createScoredFinding, compteurs metadata, minMetricsForDimension custom

**35/35 tests passed.**

---
## 2026-03-12 — fix: Phase 2E Anti-Hallucination — fallbacks consensus-engine + reflexion

**Fichiers modifiés (2) :**
- `src/agents/orchestration/consensus-engine.ts` — Ajout des 5 directives anti-hallucination (Confidence Threshold, Abstention Permission, Citation Demand, Self-Audit, Structured Uncertainty) dans les 4 fallback LLM calls : debateRound1Fallback, debateRound2 fallback, debateRound3 fallback, arbitrateFallback
- `src/agents/orchestration/reflexion.ts` — Ajout des 5 directives anti-hallucination dans les 3 fallback LLM calls legacy : generateCritiques, identifyDataNeeds, generateImprovements

---
## 2026-03-12 — fix: Phase 2G accessibilité WCAG AA — progressbar crédits

**Fichiers modifiés (1) :**
- `src/components/layout/sidebar.tsx` — Ajout `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` sur la barre de solde crédits (CreditCard)

**Vérifications (2 fichiers déjà OK) :**
- `src/components/deals/board/views/arena-view.tsx` — `aria-label` déjà présent sur les boutons membres
- `src/components/shared/score-badge.tsx` — `tabIndex={0}` déjà présent

---
## 2026-03-12 — fix: Phase 1-2-3 mega-audit corrections

**Phase 1C — Positionnement Règle N°1 UI visible (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fail-open → fail-closed en prod, double refund idempotence via findFirst
- `src/app/api/analyze/route.ts` — TOCTOU: suppression canAnalyzeDeal(), seul recordDealAnalysis() atomique reste

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" → "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe → mailto contact@angeldesk.io

**Phase 2A — Positionnement prompts agents (7 fichiers) :**
- question-master, legal-regulatory, synthesis-deal-scorer, conditions-analyst, benchmark-tool, early-warnings, types.ts

**Phase 2C — Performance :** export-pdf deal+analysis parallélisés
**Phase 2D — Labels :** score-badge aligné ui-configs, tier1-results "Analyse détaillée"
**Phase 2E — Anti-hallucination :** fact-extractor meta-eval directives 2/3/5, board-orchestrator dedup guard
**Phase 3B/3D — Credits :** badge seuils, purchase-modal mailto, canAnalyze >= QUICK_SCAN

**Tests :** schemas verdict corrigé, credit-flow idempotence mock. **463/463 passed.**

---
## 2026-03-12 — fix: Phase 2D accents français + Phase 2G accessibilité WCAG AA

**Phase 2D — Accents français manquants (7 fichiers) :**
- `src/components/deals/board/vote-board.tsx` — "Majorite forte" → "Majorité forte", "Echec" → "Échec", "de debat" → "de débat"
- `src/components/deals/board/views/arena-view.tsx` — "Debat" → "Débat", "Derniere reponse" → "Dernière réponse", "A change de position" → "A changé de position", "les details" → "les détails"
- `src/components/deals/board/views/chat-view.tsx` — "Position changee" → "Position changée", "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/columns-view.tsx` — "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/timeline-view.tsx` — "Reduire" → "Réduire"
- `src/components/deals/board/board-teaser.tsx` — "deliberent" → "délibèrent", "Debat structure" → "Débat structuré", "desaccords" → "désaccords", "modeles" → "modèles"
- `src/components/shared/score-badge.tsx` — "modele" → "modèle", "retourne" → "retourné", "Echelle" → "Échelle", "Legende echelle" → "Légende échelle"

**Phase 2G — Accessibilité WCAG AA (3 fichiers) :**
- `src/components/deals/board/views/arena-view.tsx` — Ajout `aria-label` sur les boutons de membres du board
- `src/components/layout/sidebar.tsx` — Ajout `aria-current="page"` sur les liens nav actifs (4 emplacements : desktop main, desktop admin, mobile main, mobile admin)
- `src/components/shared/score-badge.tsx` — Ajout `tabIndex={0}` sur le score badge pour la navigation clavier

---
## 2026-03-12 — feat: user account deletion

**Fichiers créés (2) :**
- `src/app/api/user/route.ts` — DELETE handler: authenticates via `requireAuth()`, deletes Vercel Blob files for documents, then in a Prisma transaction deletes all orphan records (AIBoardSession, ChatConversation, CostEvent, UserBoardCredits, UserDealUsage) and finally the User record (cascading Deal, CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession and all sub-relations).
- `src/components/settings/delete-account-button.tsx` — Client component with red "Supprimer mon compte" button, shadcn AlertDialog confirmation, loading state, calls DELETE /api/user then Clerk signOut().

**Fichiers modifiés (1) :**
- `src/app/(dashboard)/settings/page.tsx` — Added danger zone card at bottom with DeleteAccountButton, imported AlertTriangle icon.

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — security: SSRF protection for website crawling/resolving

**Fichier cree (1) :**
- `src/lib/url-validator.ts` — Exports `isPrivateUrl()` and `validatePublicUrl()`. Checks hostname against private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7, fe80::/10), blocks localhost/0.0.0.0, resolves DNS to verify the actual IP is public, and enforces http/https-only protocols.

**Fichiers modifies (2) :**
- `src/services/context-engine/connectors/website-crawler.ts` — Added `validatePublicUrl()` check in `crawlPage()` before every fetch. Private URLs return null (skipped).
- `src/services/context-engine/website-resolver.ts` — Added `validatePublicUrl()` check in `validateUrl()` before the HEAD/GET fetch. Private URLs return false (invalid).

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — feat: authenticated proxy route for document download

**Fichier créé (1) :**
- `src/app/api/documents/[documentId]/download/route.ts` — GET route that authenticates via `requireAuth()`, verifies deal ownership, then streams the file from Vercel Blob (or local storage) with correct Content-Type and Content-Disposition headers. Returns 404 if not found, 403 if not owned by user.

---
## 2026-03-12 — security: timing-safe CRON_SECRET comparison in cron routes

**Fichiers modifiés (5) :**
- `src/app/api/cron/maintenance/cleaner/route.ts` — `===` replaced with `timingSafeEqual` from `node:crypto`
- `src/app/api/cron/maintenance/sourcer/route.ts` — idem
- `src/app/api/cron/maintenance/completer/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/check/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/weekly-report/route.ts` — idem

Handles length mismatch (early return false) before calling `timingSafeEqual` to avoid `RangeError`.

---
## 2026-03-12 — fix: Phase 1 CRITICAL — positionnement, crédits, UX

**Phase 1C — Positionnement Règle N°1 (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fix 6: Fail-open → fail-closed en production (deductCredits + getOrCreateBalance bloquent si tables absentes en prod). Fix 7: Double refund idempotence (check `creditTransaction.findFirst` avant refund).
- `src/app/api/analyze/route.ts` — Fix 8: Suppression TOCTOU `canAnalyzeDeal()` préalable, seul `recordDealAnalysis()` atomique reste.

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" remplacée par carte "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems (visible uniquement pour admins)
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe remplacé par mailto contact@angeldesk.io

**`npx tsc --noEmit` : OK.**

---
## 2026-03-11 — fix: RecommendationBadge affiche les clés brutes au lieu des labels

**Problème :** Sur la page d'analyse Tier 3, les badges de recommandation affichaient `alert_dominant` en texte brut au lieu de "Signaux d'alerte dominants". La raison : `rationale` affichait "Analyse en cours" (fallback).

**Cause racine :**
1. `tier3-results.tsx` avait un `RECOMMENDATION_CONFIG` local (l.71-76) qui shadowait le global de `ui-configs.ts` et ne contenait que les anciennes clés (`invest/pass/wait/negotiate`). Les nouvelles clés (`very_favorable/favorable/contrasted/vigilance/alert_dominant`) n'y étaient pas → fallback sur le texte brut.
2. `synthesis-deal-scorer.ts` cherchait le `rationale` et `action` uniquement dans `data.findings?.recommendation` et `data.investmentRecommendation`, mais le LLM retourne dans `data.recommendation` (conformément au schema Zod). Résultat : fallback "Analyse en cours" et action par défaut "vigilance".

**Fichiers modifiés :**
- `src/components/deals/tier3-results.tsx` — `RECOMMENDATION_BADGE_CONFIG` avec toutes les clés (new + legacy). `RECOMMENDATION_ICONS` idem. `MEMO_RECOMMENDATION_CONFIG` idem.
- `src/agents/tier3/synthesis-deal-scorer.ts` — `rawAction` et `rawRationale` cherchent aussi dans `data.recommendation` et `data.investmentThesis.summary`. `LLMSynthesisResponse` enrichi avec `recommendation` et `investmentThesis`.
- `src/agents/tier3/schemas/synthesis-deal-scorer-schema.ts` — Ajout `rationale` optionnel dans le schema `recommendation`.

---
## 2026-03-11 — fix: déductions crédits manquantes + refunds (Live Coaching, Re-analyse, Analyse)

**Contexte :** Audit complet des routes API a révélé que 2 actions payantes ne déduisaient aucun crédit, et que les refunds en cas d'échec étaient absents.

**A. Live Coaching — check + déduction + refund (2 fichiers) :**
- `src/app/api/live-sessions/route.ts` — Ajout `checkCredits('LIVE_COACHING')` à la création de session. Bloque la création si crédits insuffisants (402).
- `src/app/api/live-sessions/[id]/start/route.ts` — Ajout `deductCredits('LIVE_COACHING')` avant le deploy du bot (8 crédits). Refund automatique via `refundCredits()` si le bot échoue au deploy (2 chemins d'erreur couverts : erreur video_separate_png + erreur générale).

**B. Re-analyse — check + déduction + refund (1 fichier) :**
- `src/app/api/coaching/reanalyze/route.ts` — Ajout `deductCredits('RE_ANALYSIS')` pour les modes targeted/full (3 crédits). Delta mode reste gratuit. Restructuré pour vérifier les préconditions (summary existe) AVANT la déduction. Refund automatique si `triggerTargetedReanalysis()` échoue.

**C. Analyse — refund sur échec (1 fichier) :**
- `src/app/api/analyze/route.ts` — Ajout `refundCredits()` dans le `.catch()` de `orchestrator.runAnalysis()`. Si l'analyse crash complètement, les crédits sont remboursés.

**Tableau final des déductions :**
| Action | Coût | Check | Deduct | Refund |
|--------|------|-------|--------|--------|
| Quick Scan | 1 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| Deep Dive | 5 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| AI Board | 10 | canStartBoard | consumeCredit | refundCredit |
| Live Coaching | 8 | checkCredits | deductCredits | refundCredits |
| Re-analyse | 3 | deductCredits | deductCredits | refundCredits |
| Chat | 0 | — | — | — |
| PDF Export | 0 | — | — | — |

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: migration UI complète vers système de crédits (suppression ancien plan Pro/Gratuit)

**Contexte :** Le backend avait déjà migré vers un système de crédits par pack (CREDIT_PACKS, CREDIT_COSTS dans `services/credits/types.ts`), mais l'UI affichait encore l'ancien modèle "Plan Gratuit / Plan Pro à 249€/mois". Migration complète de tous les composants UI.

**A. Nouveau composant — Modale d'achat de crédits (1 fichier) :**
- `src/components/credits/credit-purchase-modal.tsx` — Modale affichant les 5 packs avec prix, auto-sélection du pack couvrant le déficit, badges "Suffisant"/"Populaire", déverrouillage features (Négociation/API) selon totalPurchased.

**B. Credit Badge refonte (1 fichier) :**
- `src/components/credits/credit-badge.tsx` — Remplacé badge "PRO" / "X/Y analyses" par "N crédits" avec Popover dropdown (coûts par action + bouton acheter). Couleur dynamique selon solde (rouge/amber/normal).

**C. Credit Modal refonte (1 fichier) :**
- `src/components/credits/credit-modal.tsx` — Simplifié en wrapper de CreditPurchaseModal. Supprimé ancien type LIMIT_REACHED/UPGRADE_REQUIRED/TIER_LOCKED. Mapping legacy actions (ANALYSIS→DEEP_DIVE, UPDATE→RE_ANALYSIS, BOARD→AI_BOARD).

**D. Sidebar refonte (1 fichier) :**
- `src/components/layout/sidebar.tsx` — Supprimé "Plan Gratuit"/"Plan Pro" + barre d'utilisation mensuelle. Remplacé par carte crédits avec solde, barre visuelle, features débloquées (Quick Scan, Deep Dive, Négociation, API) selon totalPurchased, bouton "Acheter des crédits". Desktop + Mobile.

**E. ProTeaser refonte (1 fichier, 4 variantes) :**
- `src/components/shared/pro-teaser.tsx` — Supprimé toutes les mentions "PRO", "249EUR/mois", "Crown" icon. Remplacé par "crédits", "Coins" icon, "Acheter des crédits"/"Voir les packs de crédits".

**F. Settings page refonte (1 fichier) :**
- `src/app/(dashboard)/settings/page.tsx` — Supprimé carte "Abonnement" (Plan Pro/Gratuit, analyses/mois). Remplacé par carte "Crédits" avec solde, total acheté, dernier pack, features débloquées, lien pricing.

**G. Analysis panel mise à jour (1 fichier) :**
- `src/components/deals/analysis-panel.tsx` — Interface QuotaData migrée vers CreditBalanceInfo. handleAnalyzeClick vérifie le solde crédits au lieu de quota.analyses. CreditModal reçoit les nouvelles props (balance, totalPurchased). Supprimé badge PRO sur PDF export. Type d'analyse (`analysisType`) déterminé par le solde crédits (canAffordDeepDive) au lieu de subscriptionPlan. Ajout `effectivePlan` dérivé de la présence de résultats Tier 2/3 pour afficher correctement les résultats payés (corrige bug où un utilisateur ayant payé un Deep Dive avec des crédits voyait des ProTeasers au lieu des résultats). Toast "Passer PRO" → "Acheter des crédits". Import inutilisé `Crown` supprimé, import `AnalysisTypeValue` ajouté.

**H. Board teaser mise à jour (1 fichier) :**
- `src/components/deals/board/board-teaser.tsx` — Supprimé "Plan PRO", "249€/mois". Remplacé par "10 crédits", "Packs à partir de 49€". Import inutilisé `BOARD_PRICING` supprimé.

**I. API /api/analyze — migration critique (1 fichier) :**
- `src/app/api/analyze/route.ts` — Supprimé l'ancien check `userDealUsage.monthlyLimit` (hardcodé à 3) et l'override du type d'analyse par `subscriptionStatus`. Remplacé par déduction de crédits via `recordDealAnalysis()`. Le type d'analyse demandé par le frontend est maintenant utilisé directement (plus d'override `FREE→tier1_complete`). Import inutilisé `SubscriptionTier` supprimé.

**J. API /api/deals/[dealId]/export-pdf — suppression gate PRO (1 fichier) :**
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Supprimé le check `subscriptionStatus === "FREE"` qui bloquait l'export PDF pour les utilisateurs gratuits. PDF_EXPORT coûte 0 crédits, donc accessible à tous.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: data reliability, analytical tone, narrative sanitizer, DB cross-reference

**Contexte :** Troisième passe corrective. Ajout systématique de la classification de fiabilité des données (6 niveaux), du ton analytique obligatoire (Règle N°1), d'un sanitizer post-LLM pour le langage prescriptif, et d'instructions de cross-reference DB explicites.

**A. BaseAgent — 2 nouvelles directives auto-injectées (1 fichier) :**
- `src/agents/base-agent.ts` — Ajout de `getDataReliabilityDirective()` et `getAnalyticalToneDirective()` (méthodes protégées). Injectées automatiquement dans `buildFullSystemPrompt()` pour tous les agents Tier 0/1 (+ marketplace-expert, document-extractor, deal-scorer, red-flag-detector, etc.).

**B. Tier 3 — Ajout explicite des 2 directives (6 fichiers) :**
- contradiction-detector, synthesis-deal-scorer, memo-generator, devils-advocate, scenario-modeler, conditions-analyst — Ajout de `${this.getDataReliabilityDirective()}` + `${this.getAnalyticalToneDirective()}`.

**C. Tier 2 standalone — Ajout des 2 directives (21 fichiers) :**
- Tous les experts sectoriels (saas, fintech, ai, healthtech, deeptech, climate, consumer, hardware, gaming, blockchain, biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator, general) — Variables `dataReliability` + `analyticalTone` ajoutées au site d'appel `completeJSON()`.

**D. Chat + Board — Ajout hardcodé (2 fichiers) :**
- `deal-chat-agent.ts`, `board-member.ts` — Texte des 2 directives ajouté directement dans `buildSystemPrompt()`.

**E. base-sector-expert.ts — Ajout des 2 directives (1 fichier) :**
- `src/agents/tier2/base-sector-expert.ts` — Ajouté dans `buildSectorExpertPrompt()`.

**F. Narrative Sanitizer post-LLM (2 fichiers) :**
- `src/agents/orchestration/result-sanitizer.ts` — Nouvelle fonction `sanitizeAgentNarratives()` avec 22 patterns prescriptifs (FR + EN). Scanne récursivement les champs narratifs (narrative, summary, nextSteps, forNegotiation, etc.) et remplace le langage directif par des formulations analytiques.
- `src/agents/orchestrator/index.ts` — Intégration à 5 points de collecte des résultats (Tier 1, Tier 2, Tier 3, quick analysis). Log `[NarrativeSanitizer]` si violations corrigées.

**G. DB Cross-Reference prompts (6 fichiers) :**
- team-investigator, legal-regulatory, tech-stack-dd, tech-ops-dd, gtm-analyst, cap-table-auditor — Ajout d'une section "CROSS-REFERENCE DB OBLIGATOIRE" explicite dans le prompt.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 6 standalone Tier 2 experts (batch 3)

**Contexte :** Suite des batches 1 et 2. Ajout des deux directives `dataReliability` (classification de fiabilite des donnees) et `analyticalTone` (ton analytique obligatoire) aux 6 derniers experts Tier 2 standalone restants. Les variables sont injectees avant `citationDemand`/`structuredUncertainty` dans le `systemPrompt` concatenation du `complete()` call.

**Fichiers modifies (6) :**
- `src/agents/tier2/hrtech-expert.ts`
- `src/agents/tier2/legaltech-expert.ts`
- `src/agents/tier2/cybersecurity-expert.ts`
- `src/agents/tier2/spacetech-expert.ts`
- `src/agents/tier2/creator-expert.ts`
- `src/agents/tier2/general-expert.ts`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 8 standalone Tier 2 experts (batch 2)

**Contexte :** Suite du batch 1. Ajout des deux directives (`dataReliability` + `analyticalTone`) aux 8 experts Tier 2 standalone restants, avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (8) :**
- `src/agents/tier2/hardware-expert.ts`
- `src/agents/tier2/gaming-expert.ts`
- `src/agents/tier2/blockchain-expert.ts`
- `src/agents/tier2/biotech-expert.ts`
- `src/agents/tier2/edtech-expert.ts`
- `src/agents/tier2/proptech-expert.ts`
- `src/agents/tier2/mobility-expert.ts`
- `src/agents/tier2/foodtech-expert.ts`

**Adaptations par fichier :**
- hardware/gaming/biotech: `system + dataReliability + analyticalTone + citationDemand + structuredUncertainty`
- blockchain: `buildBlockchainSystemPrompt(stage) + dataReliability + analyticalTone + ...`
- edtech/proptech/foodtech: `systemPromptText + dataReliability + analyticalTone + ...`
- mobility: `systemPrompt + dataReliability + analyticalTone + ...`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 7 standalone Tier 2 experts (batch 1)

**Contexte :** Les experts Tier 2 standalone (object-based, pas BaseAgent) appendaient manuellement les directives anti-hallucination au call site. Ajout de deux nouvelles directives (`dataReliability` + `analyticalTone`) avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (7) :**
- `src/agents/tier2/saas-expert.ts`
- `src/agents/tier2/fintech-expert.ts`
- `src/agents/tier2/ai-expert.ts`
- `src/agents/tier2/healthtech-expert.ts`
- `src/agents/tier2/deeptech-expert.ts`
- `src/agents/tier2/climate-expert.ts`
- `src/agents/tier2/consumer-expert.ts`

**Note :** marketplace-expert.ts extends BaseAgent (class-based) et utilise `this.llmCompleteJSON()` -- il n'a PAS le pattern standalone `citationDemand`/`structuredUncertainty` au call site. Les directives pour cet agent passent par le mecanisme BaseAgent.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to Tier 2 base, chat agent, board member

**Contexte :** Ajout de deux nouvelles sections de directive (CLASSIFICATION DE FIABILITÉ DES DONNÉES + TON ANALYTIQUE OBLIGATOIRE) dans les prompts systeme de 3 fichiers, avant les blocs anti-hallucination existants.

**Fichiers modifies (3) :**
- `src/agents/tier2/base-sector-expert.ts` — `buildSectorExpertPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives. Propage aux experts crees via `createSectorExpert()`.
- `src/agents/chat/deal-chat-agent.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).
- `src/agents/board/board-member.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).

**Note :** Les 21 experts Tier 2 individuels (saas-expert, fintech-expert, etc.) ont chacun leur propre `buildSystemPrompt()` avec directives hardcoded. Ils n'utilisent PAS `buildSectorExpertPrompt()` de base-sector-expert.ts. Ils necessitent une modification individuelle separee.

**`npx tsc --noEmit` : OK.**

