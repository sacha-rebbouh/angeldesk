# Credits — debit / refund lifecycle

Source of truth: `src/services/credits/usage-gate.ts` (debit + refund + grant),
`src/lib/analysis-compensation.ts` (failure compensation), `src/services/board-credits/`
(AI Board). All amounts come from `CREDIT_COSTS[action]`.

## Balance model (doctrine "free hebdo Option B", since 2026-05-29)

`UserCreditBalance` holds two pots: `balance` (paid) and `balanceFree` (weekly
free, 10cr / 7 days, use-it-or-lose-it, lazy reset via `freeResetStartedAt`).

- **Purchaser** (`totalPurchased > 0`): the free pot is ignored — debits and
  refunds touch `balance` (paid) only.
- **Non-purchaser** (`totalPurchased === 0`): debits split `freeUsed = min(free, cost)`
  then paid; refunds credit `balanceFree`. The first free use starts the 7-day window.

No free/paid mix at a single debit, so a refund always targets one pot.

## Who debits

`deductCredits(userId, action, ctx)` (fixed cost) and `deductCreditAmount(userId,
action, cost, ctx)` (variable cost) are called at the START of a paid action:

- `POST /api/analyze` — Quick / Deep Dive analysis
- `POST /api/live-sessions/[id]/start` — Live Coaching
- `POST /api/coaching/reanalyze` — post-call re-analysis
- `src/services/board-credits` — AI Board session

Debit is **idempotent** via the `CreditTransaction.idempotencyKey` UNIQUE
constraint: if a transaction with that key already exists, the debit is a no-op
(`alreadyDeducted: true`). The balance update uses optimistic locking on
`(balanceFree, balance, freeResetStartedAt)`.

## Terminal states → refund

An action that does NOT complete successfully is refunded. `refundCredits`
(fixed) / `refundCreditAmount` (variable / partial) credit the same pot and write
a `CreditTransaction { action: 'REFUND' }`.

Triggers:

1. **Stale/failed analysis (watchdog & backstop)** — the event-driven
   `analysisWatchdogFunction` and the 12h backstop reaper detect a `RUNNING`
   analysis stuck past `STALE_ANALYSIS_REAP_MS` (20 min) and call
   `compensateFailedAnalysis()`, which: refunds, sets `Analysis.refundedAt` +
   `refundAmount`, and resets the deal to `IN_DD` (only if no other `RUNNING`
   analysis remains on that deal).
2. **Resume of a previously failed analysis** (`/api/analyze`) — before
   re-debiting, the resume path reads `Analysis.refundAmount` / `refundedAt` so a
   run already refunded by the watchdog is not refunded (or re-charged) twice.
3. **Live Coaching / re-analysis / AI Board failures** — their routes refund on
   their own failure paths.

## Idempotency keys (no double credit)

- **Debit / grant**: caller-supplied `idempotencyKey` (UNIQUE on
  `CreditTransaction`). `addCredits` requires a **mandatory** `idempotencyKey`
  (reuses the same UNIQUE constraint) — set before any Stripe wiring to prevent
  double-credit on webhook retries.
- **Refund**: a scoped key, preferring `refund:{action}:analysis:{analysisId}`,
  falling back to `refund:{action}:deal:{dealId}:{minute}` (the minute bucket
  absorbs double-clicks). This is what lets the watchdog and a manual resume both
  attempt a refund without double-crediting — the second one hits the idempotency
  guard and skips.

## Invariants

- A failed/stale analysis is refunded **exactly once** (refund idempotency key +
  `Analysis.refundedAt` marker).
- A retried debit/grant never double-charges/credits (transaction idempotency key).
- Refund and debit always settle against the same pot the user actually spent.
