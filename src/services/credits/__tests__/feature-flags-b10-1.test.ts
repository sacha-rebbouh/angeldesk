/**
 * Phase B10.1 — spec gates for CHARGE_DOCUMENT_EXTRACTION_CREDITS.
 *
 * Pure / cheap tests that anchor the product invariant: while the
 * flag is `false`, extraction/OCR is NEVER billed, anywhere. The
 * route-level tests in:
 *   - documents/upload/__tests__/route.test.ts
 *   - documents/[documentId]/process/__tests__/route.test.ts
 *   - documents/[documentId]/ocr/__tests__/route-b11-3.test.ts
 *   - documents/[documentId]/extraction-pages/[p]/retry/__tests__/route.test.ts
 *   - lib/__tests__/document-extraction-inngest.test.ts
 * each exercise the no-charge / no-refund / no-top-up gates on
 * their specific surfaces. This file is the single grep-target for
 * "where is the spec anchored" and double-checks the flag's
 * default state.
 */
import { describe, expect, it } from "vitest";

import { CHARGE_DOCUMENT_EXTRACTION_CREDITS } from "@/services/credits";

describe("B10.1 — CHARGE_DOCUMENT_EXTRACTION_CREDITS spec gates", () => {
  it("default flag state is FALSE (extraction is non-billable per product decision 2026-05-19)", () => {
    // The whole point of B10.1: extraction is free for the user.
    // If this assertion ever flips to true accidentally (rebase
    // conflict, find/replace gone wrong), the product invariant
    // is broken — every test relying on no-charge / no-refund /
    // no-top-up downstream would also fail, but THIS test is the
    // fastest signal.
    expect(CHARGE_DOCUMENT_EXTRACTION_CREDITS).toBe(false);
  });

  it("is a boolean (typed const, not a derived expression) — predictable for downstream `if (FLAG)` guards", () => {
    expect(typeof CHARGE_DOCUMENT_EXTRACTION_CREDITS).toBe("boolean");
  });

  it("re-export from the index module preserves the value", async () => {
    // Double-check that the index re-export doesn't silently
    // shadow the source-of-truth in feature-flags.ts. Catches
    // a future "export { CHARGE_... = true } from ..." typo.
    const indexExports = await import("@/services/credits");
    const featureFlagsExports = await import("@/services/credits/feature-flags");
    expect(indexExports.CHARGE_DOCUMENT_EXTRACTION_CREDITS).toBe(
      featureFlagsExports.CHARGE_DOCUMENT_EXTRACTION_CREDITS
    );
  });
});
