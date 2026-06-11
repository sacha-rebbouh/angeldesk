# Angel Desk

The analytical copilot for private investors. Angel Desk turns documents,
founder claims and exchanges into sourced signals, visible contradictions and
prioritised questions — a reliable analytical environment around imperfect AI.
**It analyses and guides; the investor always decides.**

Next.js (App Router, TypeScript) · PostgreSQL (Neon) + Prisma · Clerk auth ·
OpenRouter LLM gateway · Vercel Blob · Inngest background jobs.

## Setup

```bash
npm install
cp .env.example .env.local          # then fill in the Required vars
npx prisma generate                  # generate the Prisma client
npm run dev -- -p 3003               # dev server on :3003
```

Minimum required env: `DATABASE_URL`/`DIRECT_URL`, Clerk keys,
`OPENROUTER_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DOCUMENT_ENCRYPTION_KEY`,
`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. See `.env.example` for the full surface
(distributed state, OCR, live coaching, enrichment APIs — all optional).
For local dev without auth, set `BYPASS_AUTH=true`.

## Database & migrations

```bash
npx dotenv -e .env.local -- npx prisma studio           # browse tables
npx dotenv -e .env.local -- npx prisma migrate deploy    # apply migrations (local)
```

> ⚠️ **Production migrations are applied BY HAND against Neon, never automatically.**
> New migrations go AFTER `prisma/migrations/0_baseline/` (the baseline is
> `resolve`d in prod — never edit it). Validate every migration on a clean
> `postgres:16` (`migrate deploy` + empty `migrate diff`) before merging, then
> apply it to prod manually. A CI `migration-drift` job guards against drift.

## Tests & checks

```bash
npx tsc --noEmit                                                  # type check
npx eslint src                                                    # lint
SKIP_DB_TESTS=1 npx vitest run --config vitest.unit.config.ts     # unit suite
```

DB-integration tests need a real Postgres (`docker run postgres:16`); a guard
refuses `*.neon.tech` URLs unless `ALLOW_REMOTE_DB=1`.

## Docs map

- `CLAUDE.md` — project context, doctrine (2-strata "analyses, never decides"), workflow.
- `docs-doctrine/angeldesk-strategic-pivot.md` — canonical strategic doctrine.
- `docs-private/reference.yaml` — central technical/product reference.
- `docs-private/credits-refund-flow.md` — credit debit/refund lifecycle.
- `dbagents.md` — Funding DB maintenance agents.
- `errors.md` / `agentic-mistakes.md` — code-error and AI-reasoning registries.
- `changes-log.md` — change history (most recent 30 entries).
