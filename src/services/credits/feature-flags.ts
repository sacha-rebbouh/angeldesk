/**
 * Phase B10.1 — credit feature flags.
 *
 * Central switches for "is THIS action billed?". Lives in
 * services/credits so any future re-pricing decision has a single
 * grep-target (no scattered booleans).
 *
 * # CHARGE_DOCUMENT_EXTRACTION_CREDITS
 *
 * Product decision (2026-05-19): OCR + extraction are NOT billed
 * separately to the user, anywhere — at upload, on retry, on
 * reprocess, on page-level supreme retry, AND in the Inngest
 * worker top-up. AI analysis remains the only clearly paid action.
 *
 * Contract guarantees when `false`:
 *   - `deductCreditAmount(..., "EXTRACTION_*", ...)` is NEVER
 *     called. The user's balance is never moved by an extraction.
 *   - `refundCreditAmount(..., "EXTRACTION_*", ...)` is NEVER
 *     called either (no-op refunds would create ghost credits if
 *     the underlying deduct was bypassed, breaking ledger
 *     conservation). This includes:
 *       a. the upload-time refund (route catch block),
 *       b. the page-retry refund (failure-422 + catch block),
 *       c. the Inngest worker `reconcile-extraction-credits` step,
 *       d. the Inngest worker `compensate-superseded-extraction`,
 *       e. the Inngest worker `compensate-failed-extraction`.
 *     Legacy in-flight events from before the flag flip that still
 *     carry non-zero `chargedCredits` would otherwise produce a
 *     phantom credit (refund without a matching deduct on the
 *     user's ledger). The strict gate prevents that.
 *   - Ledger-facing values (`chargedCredits`, `creditsCharged`,
 *     `preChargedCredits`, `delta`, `lastPageRetry.creditsCharged`)
 *     stay at 0 throughout the extraction lifecycle. The
 *     `lastPageRetry.creditAction` key is OMITTED entirely when
 *     no charge took place (so downstream observers don't see a
 *     phantom EXTRACTION_SUPREME_PAGE op in the metrics blob).
 *   - Note: `actualCredits` may still be computed by the extraction
 *     pipeline (see `services/documents/extraction-pipeline.ts`) as
 *     an internal cost estimate / observability signal from the
 *     manifest. It is IGNORED for billing while the flag is false —
 *     the `reconcile-extraction-credits` step short-circuits before
 *     reading it. Don't read `actualCredits` as a "what we charged"
 *     value; read `chargedCredits` (which is 0).
 *   - Inngest worker's actual-vs-estimated top-up is a no-op.
 *     Document FAILED + run terminalization on pipeline crash
 *     still run unconditionally — those are state recovery, not
 *     money movement.
 *   - All OTHER gates stay enforced: auth, ownership, rate limit,
 *     analysis-running, processing status, idempotency, stale
 *     retry guards.
 *
 * Reversion path: flip to `true` to restore the historical
 * extraction pricing. No code structure has been removed — only
 * the deduct/refund call sites are gated.
 *
 * Out of scope of this flag (still billed): `THESIS_REEXTRACT`,
 * `THESIS_REBUTTAL`, `RE_ANALYSIS`, `CHAT`, `PDF_EXPORT`, and
 * the analysis launch itself. Those keep their existing pricing.
 */
export const CHARGE_DOCUMENT_EXTRACTION_CREDITS = false;
