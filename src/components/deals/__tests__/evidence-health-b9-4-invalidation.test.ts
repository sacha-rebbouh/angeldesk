/**
 * Phase B9.4 — Cache / invalidation parity guards.
 *
 * Spec: every UI surface that mutates a document (metadata edit,
 * upload, delete, OCR, retry) MUST invalidate
 * `queryKeys.evidenceHealth.byDeal(dealId)` so the corpus-control
 * panel + per-doc badges reflect the new state. Pre-B9.4 the
 * upload-dialog relied on the documents-tab `onUploadSuccess`
 * callback to fire the invalidation — fragile when the dialog is
 * mounted from the evidence-health panel (different tab; the docs-tab
 * polling isn't live). This guard pins the contract at module-source
 * level so the regression can't sneak back in.
 *
 * Approach (same as `documents-tab-evidence-invalidation.test.ts`):
 * parse the consumer source and assert that every block that already
 * invalidates `deals.detail(dealId)` ALSO invalidates
 * `evidenceHealth.byDeal(dealId)`. The invariant is `evidenceHealth ≥
 * deals.detail` — extra evidence-health invalidations (e.g. on a
 * polling tick) are fine.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadSource(file: string): string {
  return readFileSync(join(__dirname, "..", file), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

// ----------------------------------------------------------------
// document-upload-dialog.tsx — B9.4 fix-up (defensive evidence-health)
// ----------------------------------------------------------------

describe("document-upload-dialog.tsx — B9.4 evidence-health invalidation parity", () => {
  const source = loadSource("document-upload-dialog.tsx");

  it("imports queryKeys (the invalidation reaches into the centralised factory)", () => {
    expect(source).toMatch(/import\s*\{\s*queryKeys\s*\}\s*from\s*["']@\/lib\/query-keys["']/);
  });

  it("every deals.detail invalidation has at least one matching evidenceHealth.byDeal invalidation", () => {
    // Contract — invalidate counts: evidenceHealth ≥ deals.detail.
    // Pre-B9.4 there were 4 deals.detail / 0 evidenceHealth, so a
    // mounted-from-the-panel upload left the bundle stale.
    const dealsDetailCount = countMatches(
      source,
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.deals\.detail\(dealId\)/g
    );
    const evidenceHealthCount = countMatches(
      source,
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(dealId\)/g
    );
    expect(dealsDetailCount).toBeGreaterThanOrEqual(4); // anchor on the actual call sites
    expect(evidenceHealthCount).toBeGreaterThanOrEqual(dealsDetailCount);
  });

  it("handleClose invalidates the bundle when the user closes after an upload (`hasUploaded` branch)", () => {
    // Specific anti-regression: the close-after-upload path was
    // previously only invalidating deals.detail. The panel's mounted
    // upload-dialog relies on this site since handleAllComplete only
    // fires when the queue completes — a partial upload + close
    // would otherwise leave the bundle stale.
    // We use a generous tolerance for the comment between the two
    // invalidates (a future doc rewrite shouldn't break the guard).
    expect(source).toMatch(
      /if\s*\(hasUploaded\)\s*\{[\s\S]{0,800}evidenceHealth\.byDeal\(dealId\)/
    );
  });
});

// ----------------------------------------------------------------
// document-metadata-dialog.tsx — already had parity (B6), anchor it
// ----------------------------------------------------------------

describe("document-metadata-dialog.tsx — evidence-health invalidation parity (B6 → B9.4 anchor)", () => {
  const source = loadSource("document-metadata-dialog.tsx");

  it("invalidates evidenceHealth.byDeal at least once per deals.detail invalidation", () => {
    const dealsDetailCount = countMatches(
      source,
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.deals\.detail\(document\.dealId\)/g
    );
    const evidenceHealthCount = countMatches(
      source,
      /queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(document\.dealId\)/g
    );
    expect(dealsDetailCount).toBeGreaterThan(0);
    expect(evidenceHealthCount).toBeGreaterThanOrEqual(dealsDetailCount);
  });
});

// ----------------------------------------------------------------
// evidence-health-panel.tsx — B9.3 resolution mutations (anchor)
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 resolution mutations invalidate the bundle (B9.4 anchor)", () => {
  const source = loadSource("evidence-health-panel.tsx");

  it("each onSuccess (POST resolve + DELETE reopen) invalidates evidenceHealth.byDeal exactly once", () => {
    // The mutation onSuccess handlers MUST invalidate so the panel
    // re-fetches the partitioned bundle and shows the signal in
    // "Signaux traités" (POST) or back in active (DELETE).
    const matches = countMatches(
      source,
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(dealId\)/g
    );
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it("imports useQueryClient — anti-regression for a future refactor that switches to optimistic-only updates", () => {
    expect(source).toMatch(/useQueryClient/);
  });
});

// ----------------------------------------------------------------
// documents-tab.tsx — existing B3.x guard, anchor here too
// ----------------------------------------------------------------

describe("documents-tab.tsx — evidence-health invalidation parity (Codex round 24 P1 → B9.4 anchor)", () => {
  const source = loadSource("documents-tab.tsx");

  it("invalidates evidenceHealth.byDeal at least once per deals.detail invalidation", () => {
    const dealsDetailCount = countMatches(
      source,
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.deals\.detail\(dealId\)/g
    );
    const evidenceHealthCount = countMatches(
      source,
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(dealId\)/g
    );
    expect(dealsDetailCount).toBeGreaterThan(0);
    expect(evidenceHealthCount).toBeGreaterThanOrEqual(dealsDetailCount);
  });
});
