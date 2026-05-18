/**
 * Phase 8 — Static guard for evidence-health invalidation wiring.
 *
 * Codex round 24 P1 — Evidence Health can stay stale (30s staleTime) after
 * upload/processing/delete/rename/OCR if no mutation invalidates the
 * `queryKeys.evidenceHealth.byDeal(dealId)` query. The panel would then
 * show "rien à signaler" while the extraction just created new signals.
 *
 * Approach: parse documents-tab.tsx and assert every block that already
 * invalidates `deals.detail(dealId)` ALSO invalidates
 * `evidenceHealth.byDeal(dealId)`. Cheaper than mocking React Query and
 * catches the next time someone adds a new mutation site.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("documents-tab — evidence-health invalidation wiring (Codex round 24 P1)", () => {
  const source = readFileSync(
    join(__dirname, "..", "documents-tab.tsx"),
    "utf8"
  );

  it("uses the useEvidenceHealth hook", () => {
    expect(source).toMatch(/useEvidenceHealth\s*\(\s*dealId\s*\)/);
  });

  it("every deals.detail invalidation has at least one matching evidenceHealth.byDeal invalidation", () => {
    // Contract: every site that invalidates the deal payload must also
    // invalidate evidence-health. Evidence-health may be invalidated MORE
    // often (e.g. by the polling path which doesn't touch deals.detail —
    // Codex round 25 P1) — so the invariant is `evidenceHealth >= deals.detail`,
    // not strict equality.
    const dealsDetailCount = (
      source.match(/queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.deals\.detail\(dealId\)/g) ?? []
    ).length;
    const evidenceHealthCount = (
      source.match(/queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(dealId\)/g) ?? []
    ).length;
    expect(dealsDetailCount).toBeGreaterThan(0);
    expect(evidenceHealthCount).toBeGreaterThanOrEqual(dealsDetailCount);
  });

  it("Codex round 25 P1 — the PROCESSING polling path invalidates evidenceHealth on terminal transition", () => {
    // The OCR async path (PDF upload → Inngest → EvidenceSignal created →
    // polling sees doc terminal) is THE main flow. Without invalidation in
    // refreshProcessingDocuments, the panel/badges stay stale for up to 30s
    // (or forever if no other mutation fires).
    expect(source).toMatch(/processingStatus\s*!==\s*["']PROCESSING["']/);
    // The invalidation must be guarded by a terminal-transition detection,
    // not unconditional on every poll (avoid noisy refetches).
    expect(source).toMatch(/hasTerminalTransition[\s\S]{0,400}invalidateEvidenceHealth\(\)/);
  });

  it("Codex round 26 P1 — deferred follow-up invalidation closes the terminal-doc-before-evidence race", () => {
    // `completeDocumentExtractionRun` flips processingStatus to terminal
    // BEFORE `runEvidenceForDocument` finishes persisting EvidenceSignal.
    // A single immediate invalidation can race and cache an empty bundle for
    // 30s. The fix is to ALSO schedule a deferred invalidation a few seconds
    // later that catches the late evidence write.
    expect(source).toMatch(/window\.setTimeout\([\s\S]{0,200}invalidateEvidenceHealth\(\)/);
    // The follow-up must be cancellable: cleanup must clear pending timeouts.
    expect(source).toMatch(/pendingFollowupTimeouts/);
    expect(source).toMatch(/window\.clearTimeout/);
    // And the cleanup must run in the effect's teardown.
    expect(source).toMatch(/for\s*\(\s*const\s+timeoutId\s+of\s+pendingFollowupTimeouts\s*\)\s*window\.clearTimeout\(timeoutId\)/);
  });
});
