# Phase B Validation Register

Date: 2026-05-19

Purpose: single source of truth for what Codex has accepted during Phase B, what was actually verified, and what still must be checked before B14 / ultrareview.

## Legend

- `CODE OK`: reviewed through source, unit/static guards, typecheck, or targeted tests.
- `LIVE OK`: verified in browser/runtime.
- `OPEN`: must still be verified or executed.
- `BLOCKER`: cannot proceed to B14 / ultrareview without this.

## Current Gate

Phase B is **not release-complete**.

Blocking items before B14 / ultrareview:

1. `LIVE OK` Prisma migration `20260519010000_add_evidence_signal_resolution` applied on the target Neon DB on 2026-05-19.
2. `LIVE OK` Current code deploys to Vercel preview after packaging fix:
   - Root cause found: local dev artifacts were being packaged into serverless functions (`public/uploads/deals` 136 MB, `public/uploads/analysis-results` 26 MB, B12 screenshots 12 MB), causing `Max serverless function size was exceeded for 40 functions`.
   - Fix: `.vercelignore` excludes `public/uploads`; `next.config.ts` excludes `public/uploads`, `docs-private`, `scripts/debug`, `changes-log.md`, `tsconfig.tsbuildinfo` from output tracing; Poppler includes narrowed to actual PDF-rendering functions.
   - `npx vercel build --debug` now completes with **0 oversized functions**.
   - Preview deploy `dpl_4RJkDtwLKXvLHU4ygYyCErnJ7RG1` reached `Ready` at `https://angeldesk-ka94f1j77-sachas-projects-7170af03.vercel.app`.
   - Basic HTTP smoke returns `401` due Vercel deployment protection, proving the deployment is live behind auth/protection.
3. `LIVE OK` Local HTTP smoke test Evidence Health read + resolution writes against migrated Neon DB:
   - GET `/api/deals/[dealId]/evidence-health` returns 200.
   - POST `/api/deals/[dealId]/evidence-health/resolutions` works.
   - DELETE `/api/deals/[dealId]/evidence-health/resolutions` works.
4. `LIVE OK` B12 live visual checks re-run on local dev (`BYPASS_AUTH=true`, Chromium headless) with Evidence Health mock injection:
   - Chat IA FAB does not overlap Evidence Health action buttons on `390x844`.
   - Unknown freshness kind renders `Donnée périmée`, not raw snake_case.
   - Attachment picker custom button visible on mobile; hidden input removed from tab order.
   - Freshness long document name exposes native `title`.
   - Resolve/Ignore dialog respects viewport max-height/internal scroll.
   - Additional issue found and fixed during recheck: long Evidence Health action labels caused horizontal overflow on mobile. `ActionBar` buttons now wrap and stay within viewport.
5. `OPEN` Run B14 E2E scenarios from the original Phase B plan.

## Register By Phase

| Phase | Scope | Codex acceptance so far | Evidence used | Still required |
|---|---|---:|---|---|
| B0/B1 | Upload instrumentation + multi-file selection without freeze | CODE OK | Unit/static guards, tsc, no heavy File API at picker, diagnostics always available after B0/B1.1 | B14: select 6 mixed files, list appears <1s, diagnostics usable without DevTools. |
| B2 | Upload queue robust: multi-pending PDFs, retry, cancel, official states, actionable errors | CODE OK | Unit/static guards through B2.4.1, batch-loop tests, cancel/retry reducer tests | B14: multi-PDF async, per-file retry, per-file cancel, duplicate, no ambiguous state. |
| B3 | Refresh/crash recovery, polling PROCESSING/PENDING, stale docs | CODE OK | Unit/static guards through B3.3.3, route tests, monotone extraction run fixes | B14: refresh before server create, refresh after create, terminal polling, stale PENDING retry, PROCESSING stale info-only. |
| B4 | Upload modal refactor | CODE OK + partial visual via B12 | Static guards, B12 visual follow-up on upload surfaces | B14: small laptop + mobile with mixed states, footer always reachable. |
| B5 | Preview / audit viewer | CODE OK + B12.3 visual fix | B5 guards, B12.3 live screenshots for low-height/mobile audit dialog | B14: PDF page nav/cache, image inline, Office fallback/download, retry page UI. |
| B6 | Metadata editor: sourceDate, type/sourceKind, email metadata | CODE OK + B12.2.a visual fix | Endpoint/helper/UI tests, cache fingerprint tests, recompute rollback tests, B12 metadata overflow live screenshots | B14: edit sourceDate/type/sourceKind/email date, warning disappears, old signals preserved on failed recompute. |
| B7 | Email and attachments correction | CODE OK | Endpoint/UI tests for read-only links, manual link/unlink, suppression, thread candidates | B14: manual link, unlink auto with audit trace, thread date picker, cross-deal rejection. |
| B8 | Actionable Evidence Health | CODE OK + B12 LIVE OK via runtime mock | Action mapping tests, drill-down tests, checklist tests, B12 mock fetch runtime checks | Needs B14 real-flow coverage where actual DB findings exist: panel actions, drill-down, checklist. |
| B9 | Resolve / ignore signals | CODE OK + LOCAL HTTP SMOKE OK + PREVIEW DEPLOY READY | Schema/migration present, route/UI/filter tests, resolution scenarios, migration applied, local GET/POST/DELETE smoke passed, preview deploy Ready | Still needs authenticated browser/API smoke on protected preview or production after deployment protection/auth is available. |
| B10 | Costs / credits: extraction included, AI analysis paid | CODE OK | Flag tests, route/Inngest no-charge tests, B10.2 label guards | B14: ledger balance unchanged for upload/OCR/retry; analysis still charges. |
| B11 | Security / confidentiality / route coverage | CODE OK | B11.2/B11.3/B11.3.1 tests: IDOR, 401 contracts, route coverage, rate limits | Optional B14 smoke: non-owner document returns no payload. |
| B12 | Visual QA / responsive | CODE OK + LIVE OK | B12.1 inventory, B12.2.a/.b live, B12.3 live, B12.4/B12.5 rechecked with Chromium headless; extra mobile overflow fixed | None before B14. |
| B13 | Migration / legacy compatibility | MIGRATION LIVE OK + PREVIEW DEPLOY READY + CODE PATCH OK | Fallback P2021 tests, tsc, prisma validate with `.env.local`, `prisma migrate deploy` applied to target Neon DB, Vercel preview deploy Ready | Needs authenticated preview/prod smoke for the migrated route once accessible through browser/session. My earlier "greenlight" wording was wrong for the phase. |
| B14 | Required E2E scenarios | NOT STARTED | None | Must run before ultrareview. |
| B15 | Rollout | NOT STARTED | None | Preview -> test deals -> real new deal -> prod. |

## B12 Live Rechecks

Re-run on 2026-05-19 using local dev server (`BYPASS_AUTH=true npm run dev -- -p 3007`) and Chromium headless (`scripts/debug/b12-live-recheck.mjs`).

1. `LIVE OK` Chat IA FAB does not overlap Evidence Health actions on `390x844`.
2. `LIVE OK` Freshness fallback renders `Donnée périmée` instead of raw snake_case for unknown kind.
3. `LIVE OK` Custom attachment file picker on mobile: visible button exists; tab does not land on hidden input (`tabIndex=-1`, `aria-hidden=true`).
4. `LIVE OK` Freshness card long document name exposes native tooltip/title on desktop hover.
5. `LIVE OK` Resolve/Ignore dialog with long label respects `max-h-[85vh]` and internal scroll.
6. `LIVE OK` Additional recheck guard: Evidence Health action labels with long doc names no longer create horizontal overflow (`pageWidth=390`, `viewportWidth=390`, action width 262px).

Note: opening the native OS file picker itself cannot be asserted in headless Chromium; B12 verifies the visible trigger and focus/accessibility contract. B14 manual/E2E can click it in a real browser session.

## B14 Required E2E Scenarios

Original Phase B gate scenarios still to execute:

1. One heavy OCR PDF.
2. Six mixed files.
3. Refresh during upload.
4. Close modal during extraction.
5. Duplicate document.
6. Stuck pending document.
7. Retry OCR.
8. Correct sourceDate/type/sourceKind/email metadata.
9. Correct email attachment link.
10. Resolve/ignore Evidence Health signal.
11. Evidence Health refresh after correction.

## Correction To Prior Codex Wording

The prior statement "B13 code greenlight" was too loose. Correct status:

- B13 code fallback: `CODE OK`.
- B13 phase: `OPEN`, because migration and deploy are done, but authenticated preview/prod smoke is still required.

Going forward, Codex should use:

- `CODE OK` only for source/tests/typecheck.
- `LIVE OK` only after browser/runtime validation.
- `PHASE CLOSED` only when all operational dependencies, migrations, and agreed live checks are done or explicitly waived by the user.
