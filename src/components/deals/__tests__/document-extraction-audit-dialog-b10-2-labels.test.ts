/**
 * Phase B10.2 / B10.2.1 — static-guard tests for the audit dialog's
 * user-facing labels around extraction billing.
 *
 * Read the dialog source as plain text and assert that forbidden
 * billing wording is either absent or gated behind the
 * CHARGE_DOCUMENT_EXTRACTION_CREDITS flag. This is a cheap, durable
 * regression net for the product invariant established in B10.1:
 * extraction is non-billable, so the UI must not show "debit",
 * "credits max", or an ungated "{N} credits" string on extraction
 * surfaces. If a future rebase / refactor re-introduces any of these
 * unguarded, this file fails fast.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const AUDIT_DIALOG_PATH = resolve(
  __dirname,
  "..",
  "document-extraction-audit-dialog.tsx"
);
const RAW_SOURCE = readFileSync(AUDIT_DIALOG_PATH, "utf8");

// Strip block comments (/* ... */) AND JSX comments ({/* ... */}) AND
// line comments (// ...) before scanning. The guards target USER-
// VISIBLE wording; copy inside a developer comment that documents the
// gate is fine and shouldn't trip the static check.
const SOURCE = RAW_SOURCE
  // JSX block comments: `{/* ... */}` (must come first — overlaps /* */)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  // Regular block comments: `/* ... */`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  // Line comments: `// ...` until newline
  .replace(/\/\/[^\n]*/g, "");

// Cheap split-on-flag approach: anything past the first reference of
// CHARGE_DOCUMENT_EXTRACTION_CREDITS that's used inside a ternary
// branch is considered "gated". For lines we want to assert are
// fully absent we just grep the whole file.

describe("B10.2 / B10.2.1 — audit dialog billing-label guards", () => {
  it("does NOT contain the user-facing 'debit idempotent' wording (B10.2.1 P1)", () => {
    // The progression copy used to say "Chaque page est retraitee en
    // OCR supreme avec debit idempotent." — that surfaces a billing
    // semantic (debit) on a non-billable action. Must be reworded.
    // Match accent + non-accent forms to be robust to typos. The
    // assertion runs on the comment-stripped source so internal
    // documentation referencing the old wording does not trip it.
    expect(SOURCE).not.toMatch(/debit idempotent/i);
    expect(SOURCE).not.toMatch(/débit idempotent/i);
  });

  it("does NOT contain 'credits max' outside the gated branch (B10.2.1 P3)", () => {
    // "Retenter toutes (N credits max)" must only appear inside the
    // CHARGE_DOCUMENT_EXTRACTION_CREDITS branch. Easiest static check:
    // every occurrence of 'credits max' in the file must be preceded,
    // within ~200 characters, by 'CHARGE_DOCUMENT_EXTRACTION_CREDITS'.
    const matches = [...SOURCE.matchAll(/credits max/gi)];
    for (const m of matches) {
      const start = Math.max(0, (m.index ?? 0) - 200);
      const context = SOURCE.slice(start, m.index ?? 0);
      expect(
        context.includes("CHARGE_DOCUMENT_EXTRACTION_CREDITS"),
        `Found ungated 'credits max' label near offset ${m.index} — must sit inside an "if (CHARGE_DOCUMENT_EXTRACTION_CREDITS)" branch`
      ).toBe(true);
    }
  });

  it("does NOT contain '{estimatedCredits} credits' outside the gated branch (B10.2.1 P3)", () => {
    // Same pattern as above for the MetricPill headline. The bare
    // template `${...estimatedCredits} credits` must always sit inside
    // a CHARGE_DOCUMENT_EXTRACTION_CREDITS condition.
    const matches = [...SOURCE.matchAll(/estimatedCredits\}\s*credits/gi)];
    for (const m of matches) {
      const start = Math.max(0, (m.index ?? 0) - 250);
      const context = SOURCE.slice(start, m.index ?? 0);
      expect(
        context.includes("CHARGE_DOCUMENT_EXTRACTION_CREDITS"),
        `Found ungated estimatedCredits label near offset ${m.index} — must sit inside an "if (CHARGE_DOCUMENT_EXTRACTION_CREDITS)" branch`
      ).toBe(true);
    }
  });

  it("imports the flag directly from the feature-flags module (not via barrel) — keeps the client bundle Prisma-free", () => {
    // services/credits/index.ts re-exports server-only modules.
    // Pulling the flag through that barrel breaks the Next.js client
    // bundle. The direct import is the contract.
    expect(SOURCE).toMatch(
      /from\s+["']@\/services\/credits\/feature-flags["']/
    );
    // And we MUST NOT import the flag via the barrel form.
    expect(SOURCE).not.toMatch(
      /import[^;]*CHARGE_DOCUMENT_EXTRACTION_CREDITS[^;]*from\s+["']@\/services\/credits["']\s*;/
    );
  });
});
