# E2E Release Gate — Upload / OCR durable pipeline (Phase 5)

> Purpose: prove the **real** upload/OCR flow works end-to-end before release.
> No refactoring — validation only. Generated 2026-05-14.

## How this gate is split

| Kind | Scenarios | Why |
|---|---|---|
| **Auto-executed here** | 8 (advisory lock live) | Needs a live Postgres, no app stack — runnable from a script. |
| **Already covered by the audited unit suite** | 3, 4, 7 | Phase 4.1–4.5 tests (prisma mocked) already pin these invariants. Re-verified green: `npx vitest run` → 139 files, 1160 passed, 2 skipped. |
| **Manual smoke (this runbook)** | 1, 2, 5, 6 | Need the full stack running (Next server + Inngest dev worker + real OpenRouter OCR + Vercel Blob). Cannot be auto-run without burning OCR credits. |

---

## RESULT SUMMARY

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Upload PDF text-native → durable → COMPLETED → latest → analysis consumes corpus | ⏳ TO RUN | reproducible smoke below (`scripts/e2e/generate-fixtures.ts` + `smoke-setup.ts` + curl commands) |
| 2 | Upload PDF scanné/OCR → progress modal correct → COMPLETED or honest FAILED | ⏳ TO RUN | reproducible smoke below (`image-only.pdf` fixture, explicit `progressId` for polling) |
| 3 | New version that FAILS → old document stays `isLatest` | ✅ PASS | `complete-extraction-run-atomic.test.ts` ("a FAILED finalization NEVER promotes"), `promote-document-version.test.ts` (COMPLETED gate), `upload/route.test.ts` (candidate creation) |
| 4 | New version that SUCCEEDS → candidate promoted `isLatest` | ✅ PASS | `complete-extraction-run-atomic.test.ts` ("COMPLETED finalization promotes + demotes — full flip"), `promote-document-version.test.ts` |
| 5 | Reprocess `/process` → 202 then poll to terminal | ⏳ TO RUN | reproducible smoke below (uses `$DOC_ID` from scenario 1) |
| 6 | Retry page supreme → storagePath/storageUrl OK | ⏳ TO RUN | reproducible smoke below (uses `$DOC_ID_OCR` from scenario 2). Step 3 is a deterministic `storageUrl=NULL` + `GET /download` that GUARANTEES reaching `downloadFile` (no route-level short-circuit) — proves the Phase 5 fix end-to-end. Refund-on-failure path declared unit-only. |
| 7 | Forced timeout (low budget) → run+document FAILED, refund, progress failed, no oscillation | ✅ PASS | `extraction-pipeline.test.ts` (EXTRACTION_TIMEOUT, never-returns + cooperative-partial + late-callback drop), `progress-monotone-guards.test.ts`, `document-extraction-inngest.test.ts` (compensation/refund) |
| 8 | Advisory lock live Postgres — two concurrent promotions same lineage → one `isLatest`, version monotone | ✅ PASS | `scripts/e2e/advisory-lock-live.ts` — executed, see below |

### 🐞 Bugs found & fixed during this gate

**1. `acquireDocumentLineageLock` — `$queryRaw` on a `void`-returning fn.**
`pg_advisory_xact_lock` returns `void`; `$queryRaw` throws `P2010 — Failed
to deserialize column of type 'void'` at runtime. **The advisory lock
never worked in reality** — every version creation / promotion would have
thrown. The mocked unit tests (which stub `$queryRaw`) could not catch it.
**Fix:** `tx.$queryRaw` → `tx.$executeRaw`. Re-verified live (scenario 8 PASS).

**2. `downloadFile` — Blob mode broke on `storagePath`-only rows (Codex P1).**
A Document row can legitimately have `storageUrl=null` and only `storagePath`
set (legacy rows, the `?? storagePath` fallback in `/retry`, `/process`,
`/ocr`). `storagePath` is a pathname (`deals/<id>/abc.pdf`), not a URL —
passing it to `fetch()` throws `Invalid URL`. **Fix:** when the input is not
an `http(s)://` URL, resolve via `@vercel/blob.head(pathname).url` first.
Local-storage path unchanged. New unit test
(`src/services/storage/__tests__/download-file-blob.test.ts`) pins the
behavior; scenario 6 step 3 exercises it deterministically end-to-end.

---

## Scenario 8 — advisory lock LIVE (auto-executed) ✅

Script: `scripts/e2e/advisory-lock-live.ts` — no table writes, zero DB risk.

```bash
npx dotenv -e .env.local -- npx tsx scripts/e2e/advisory-lock-live.ts
```

Executed 2026-05-14 result:

```
[PASS] SAME lineage serializes — B waits for A's transaction to commit
       B blocked for the full 800ms A held the lock: true; B acquired only AFTER A released: true
[PASS] DIFFERENT lineages do NOT block each other
       B acquired its lock in 124ms while A still held a different-lineage lock
[PASS] pgbouncer (pooled DATABASE_URL) lock probe
       pg_advisory_xact_lock taken + released inside one transaction on the pooled URL
RESULT: PASS
```

This proves the **primitive** Phase 4.3 relies on: the per-lineage advisory
lock genuinely serializes concurrent transactions on the same lineage and
does not block unrelated lineages — including through the production
(pgbouncer) connection. The table-level invariant ("exactly one `isLatest`,
version monotone") is pinned by `promote-document-version.test.ts`.

---

## Manual smoke runbook (scenarios 1, 2, 5, 6)

### Prerequisites — start the stack (once)

```bash
# Terminal 1 — Next dev server
npm run dev -- -p 3003

# Terminal 2 — Inngest dev worker (consumes document/extraction.run)
npx inngest-cli@latest dev -u http://localhost:3003/api/inngest

# .env.local must have: OPENROUTER_API_KEY, BLOB_READ_WRITE_TOKEN,
#   DATABASE_URL/DIRECT_URL, DOCUMENT_ENCRYPTION_KEY, and BYPASS_AUTH=true
#   (dev only) so the routes are reachable as `dev-user-001` without Clerk.
```

### Setup — fixtures + a fresh owned deal (run each smoke session)

```bash
# 1. Generate the smoke fixtures (deterministic, no committed binaries):
npx dotenv -e .env.local -- npx tsx scripts/e2e/generate-fixtures.ts
#   → scripts/e2e/fixtures/text-native.pdf  (selectable text via pdf-lib)
#   → scripts/e2e/fixtures/image-only.pdf   (raster PNG embedded — no text
#      layer → forces the OCR path; uses pdf-to-img, already a project dep)

# 2. Create a fresh test deal owned by the BYPASS_AUTH dev user (`dev-user-001`).
#    Captures DEAL_ID into your shell for the curl commands below.
eval "$(npx dotenv -e .env.local -- npx tsx scripts/e2e/smoke-setup.ts)"
echo "DEAL_ID=$DEAL_ID"
#    The deal name is `E2E-SMOKE-<runId>` — the safety token the teardown
#    script enforces. Real user data is never touched.
```

> **Why the setup is required:** the upload route requires
> `deal.userId === currentUser.id` (`src/app/api/documents/upload/route.ts`).
> With `BYPASS_AUTH=true` the current user is `dev-user-001`
> (`src/lib/auth.ts`). Without an owned deal, every upload would 404 / 403.

### Teardown — when finished (or on failure)

```bash
npx dotenv -e .env.local -- npx tsx scripts/e2e/smoke-teardown.ts "$DEAL_ID"
#   Refuses to run if the deal is not owned by `dev-user-001` AND its name
#   does not start with `E2E-SMOKE-`. Cleans blobs first, then cascades the
#   deal delete (Documents / ExtractionRuns / Pages / ... via the schema's
#   onDelete: Cascade).
```

### DB inspection helper (read-only)

```bash
psql "$DIRECT_URL" -c "SELECT id, name, version, \"isLatest\", \"processingStatus\", \"supersededAt\" FROM \"Document\" WHERE \"dealId\"='$DEAL_ID' ORDER BY version;"
psql "$DIRECT_URL" -c "SELECT id, status, \"pagesProcessed\", \"pageCount\", \"blockedReason\" FROM \"DocumentExtractionRun\" WHERE \"documentId\"='<DOC_ID>' ORDER BY \"startedAt\" DESC LIMIT 3;"
psql "$DIRECT_URL" -c "SELECT id, phase, percent, message FROM \"DocumentExtractionProgress\" WHERE id='<PROGRESS_ID>';"
```

> `<DOC_ID>` is returned by the upload response (scenario 1/2) or already
> known (scenario 5/6). `<PROGRESS_ID>` is in the upload response too.

---

### Scenario 1 — Upload PDF text-native → durable → COMPLETED → analysis consumes corpus

**Steps**
1. Upload the text-native fixture (capture DOC_ID):
   ```bash
   UPLOAD_OUT=$(curl -s -F "file=@scripts/e2e/fixtures/text-native.pdf" \
     -F "dealId=$DEAL_ID" -F "type=PITCH_DECK" \
     http://localhost:3003/api/documents/upload)
   echo "$UPLOAD_OUT" | jq
   export DOC_ID=$(echo "$UPLOAD_OUT" | jq -r '.data.id')
   echo "DOC_ID=$DOC_ID"
   ```
   *(No `progressId` here — scenario 1 verifies the final DB state, not the
   modal poller. Scenario 2 exercises the progress poller explicitly.)*
2. Observe the Inngest dashboard (`http://localhost:8288`): a `document-extraction`
   run appears, steps `run-extraction-pipeline` → (`reconcile-extraction-credits`)
   → `trigger-thesis-reextract`.
3. Poll the document until terminal — `GET /api/documents/$DOC_ID` (or the
   DB query above), expect `processingStatus = COMPLETED` within ~10–30s.

**Pass criteria**
- HTTP response 201 with `extraction.pending === true` (PDF path is async).
- Inngest function completes (no retries / no `compensate-failed-extraction`).
- `Document.processingStatus = COMPLETED`, `isLatest = true`, `extractedText` non-null (encrypted), `extractionQuality` set.
- `DocumentExtractionRun.status` ∈ {READY, READY_WITH_WARNINGS}.
- Launch an analysis (or `/supreme`) on the deal → it reads the corpus (the run's pages / `extractedText`) — no "document not extracted" gating.

**Fail signals** — document stuck PROCESSING; run stuck PENDING/PROCESSING; `extractedText` null on a COMPLETED doc; analysis can't see the corpus.

---

### Scenario 2 — Upload scanned/OCR PDF → progress modal correct → honest terminal

**Steps**
1. Upload the image-only fixture (PNG-rasterized page, no text layer →
   forces OCR). The `progressId` is generated client-side and is what the
   modal poller listens on — pass one explicitly so the curl path can poll
   the same progress row the UI would:
   ```bash
   export PROGRESS_ID=$(uuidgen)
   UPLOAD_OUT=$(curl -s -F "file=@scripts/e2e/fixtures/image-only.pdf" \
     -F "dealId=$DEAL_ID" -F "type=PITCH_DECK" -F "progressId=$PROGRESS_ID" \
     http://localhost:3003/api/documents/upload)
   export DOC_ID_OCR=$(echo "$UPLOAD_OUT" | jq -r '.data.id')
   echo "DOC_ID_OCR=$DOC_ID_OCR  PROGRESS_ID=$PROGRESS_ID"
   ```
2. Poll the progress row until terminal (or open the UI's upload modal in
   parallel — same row). The route wraps the snapshot in `{ data: ... }`:
   ```bash
   watch -n 1 "curl -s http://localhost:3003/api/documents/upload/progress/$PROGRESS_ID | jq '.data | {phase, percent, pagesProcessed, pageCount, message}'"
   ```

**Pass criteria**
- Modal shows a real progression: `queued → started → native_extracted → page_processed…` then a **terminal** phase.
- Terminal is honest: `completed` only if a usable corpus was produced; otherwise `failed` (e.g. unreadable scan) — never a silent "completed" with empty text.
- Progress is **monotone**: never regresses from a terminal phase back to a non-terminal one; the modal stops polling once terminal.
- `Document.processingStatus` matches the modal's terminal phase; an empty/whitespace OCR corpus ⇒ `FAILED` (not COMPLETED).
- On `failed`: the pre-charged credits are refunded (check the credit ledger for the run).

**Fail signals** — modal spins forever; phase regresses; COMPLETED with empty `extractedText`; no refund on failure.

---

### Scenario 5 — Reprocess via `/process` → 202 then poll to terminal

> Prereq: $DOC_ID from scenario 1 (or any PDF document in the test deal).

**Steps**
1. Trigger reprocess on the document from scenario 1:
   ```bash
   PROC_OUT=$(curl -s -X POST "http://localhost:3003/api/documents/$DOC_ID/process")
   echo "$PROC_OUT" | jq
   #   Expect: HTTP/1.1 202 + JSON { data: { extractionRunId, documentId, processingStatus: "PROCESSING" }, creditsCharged, message }
   export REPROCESS_RUN_ID=$(echo "$PROC_OUT" | jq -r '.data.extractionRunId')
   echo "REPROCESS_RUN_ID=$REPROCESS_RUN_ID"
   ```
2. Poll `GET /api/documents/$DOC_ID` (or the extraction-audit dialog in the
   UI) until terminal.

**Pass criteria**
- HTTP **202** with `{ data: { extractionRunId, documentId, processingStatus: "PROCESSING" } }` — no inline extraction in the request.
- A new `document-extraction` Inngest run (event id `document-extraction:<runId>`, `reason: "reprocess"`).
- Document transitions PROCESSING → terminal (COMPLETED or FAILED).
- Re-sending the same request id is deduped by Inngest (event id keyed on the run) — no double charge.
- If credits insufficient → **402** and the document is NOT left PROCESSING.

**Fail signals** — 202 but no Inngest run; document stuck PROCESSING; double credit charge on a retry.

---

### Scenario 6 — Retry page supreme → storagePath/storageUrl OK

> Prereq: `$DOC_ID_OCR` from scenario 2 (it has page 1 from the image-only
> fixture).
> `export PAGE_N=1` — deterministic, the fixture has exactly one page.

**Steps**
1. Trigger the page-supreme retry on page 1 (charges 2 credits up-front):
   ```bash
   curl -i -X POST "http://localhost:3003/api/documents/$DOC_ID_OCR/extraction-pages/$PAGE_N/retry"
   ```
2. Inspect the page row and the credit ledger:
   ```bash
   psql "$DIRECT_URL" -c "SELECT \"pageNumber\", status, confidence, \"ocrProcessed\" FROM \"DocumentExtractionPage\" p JOIN \"DocumentExtractionRun\" r ON p.\"runId\"=r.id WHERE r.\"documentId\"='$DOC_ID_OCR' AND p.\"pageNumber\"=$PAGE_N;"
   psql "$DIRECT_URL" -c "SELECT type, amount, action, \"idempotencyKey\" FROM \"CreditTransaction\" WHERE \"userId\"='dev-user-001' AND \"createdAt\" > NOW() - INTERVAL '5 minutes' ORDER BY \"createdAt\" DESC;"
   ```
3. **storagePath-only fallback (deterministic, REAL Blob mode only).** Force
   the document onto the legacy `storageUrl=NULL + storagePath=<pathname>`
   shape and hit `GET /download` — that route unconditionally calls
   `downloadFile(storageUrl ?? storagePath)` after auth (no `canRetryPage`
   short-circuit, no extraction state to satisfy), so `downloadFile` is
   GUARANTEED reached. Without the Phase 5 fix this returns 500 with
   `TypeError [ERR_INVALID_URL]` from `fetch`; with the fix
   `@vercel/blob.head()` resolves the pathname first and the bytes flow:
   ```bash
   psql "$DIRECT_URL" -c "UPDATE \"Document\" SET \"storageUrl\"=NULL WHERE id='$DOC_ID_OCR';"
   curl -s -o /tmp/download-fallback.bin -w "%{http_code}\n" \
     "http://localhost:3003/api/documents/$DOC_ID_OCR/download"
   #   Expect: 200, and the downloaded size matches the fixture (bytes
   #     round-trip through encrypt/decrypt). Compare to the regenerable
   #     truth, not a hardcoded number:
   wc -c /tmp/download-fallback.bin scripts/e2e/fixtures/image-only.pdf
   #   Local-storage dev (no BLOB_READ_WRITE_TOKEN) does not exercise the
   #   Blob branch — note it and skip step 3 in that case.
   ```

**Pass criteria**
- **Step 1 / 2** (retry happy path): the curl returns 200; the page row's `ocrProcessed=true` and the `confidence`/`status` were rewritten; `CreditTransaction` shows a 2-credit `EXTRACTION_SUPREME_PAGE` deduction. (If `canRetryPage` rejects the page — already retried, status not eligible — the route returns 4xx; that's a route-validation outcome, not a `downloadFile` outcome, and is fine for the gate.)
- **Step 3** (storagePath fallback, Blob mode only): `/download` returns **200** with the file bytes after `storageUrl` is nulled. The `/download` route has no extraction-state preconditions, so reaching `downloadFile` is GUARANTEED — the only thing that can fail at that point is `downloadFile` itself. With the Phase 5 fix → 200 + bytes; without it → 500.

**Fail signals**
- Step 1: retry 500.
- Step 3 (Blob mode): non-200 response, server log shows `TypeError [ERR_INVALID_URL]` from `fetch(storagePath)` → the storagePath-fallback regression.

**Refund-on-failure path** — declared **unit-only** for this gate. Forcing a
deterministic OCR/extraction failure in a live smoke is not feasible without
invasive flags. The invariant is covered by:
- `document-extraction-inngest.test.ts` → `refunds credits with the dispatchRefundKey and marks document FAILED when pipeline throws`, `logs without throwing when the refund itself fails`, `skips refund entirely when chargedCredits is 0`.
- `extraction-pipeline.test.ts` → run+document FAILED + EXTRACTION_TIMEOUT path triggers compensation.
- The `/retry` route's `refundCreditAmount` call uses an idempotency key derived from the request, so a duplicated catch is naturally idempotent.

---

## Notes / residuals

- **pgbouncer**: production uses the pooled `DATABASE_URL`. `pg_advisory_xact_lock`
  is transaction-scoped, so it is safe under pgbouncer transaction pooling —
  confirmed live by the scenario-8 probe.
- Scenarios 3/4/7 are intentionally not re-run as live E2E: the audited
  Phase 4.1–4.5 unit suite already pins them and is green. Re-running them
  live would burn OCR credits for no additional coverage.
- The `recordExtractionPageProgress` "live run" read has a known, accepted
  TOCTOU window (a page can still be upserted if the run terminalizes between
  the read and the upsert) — it does not re-open the run/progress, so the
  critical no-oscillation invariant holds (validated by Codex Phase 4.4
  fix-up #2 audit).
