/**
 * Phase B2.4.1 P2 — Static guard: the dialog wires the duplicate action
 * end-to-end (FileUpload exposes the prop, the dialog passes a handler).
 *
 * Component-level testing of the duplicate path would require JSDOM +
 * fetch mocks for the upload route; that's the scope of B14 (full E2E).
 * For B2.4.1, grep guards enforce the wire so future refactors can't
 * silently drop the actionData round-trip.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("document-upload-dialog — duplicate action wiring (B2.4.1 P2)", () => {
  const source = readFileSync(
    join(__dirname, "..", "document-upload-dialog.tsx"),
    "utf8"
  );

  it("declares handleViewExistingDocument callback", () => {
    expect(source).toMatch(/const\s+handleViewExistingDocument\s*=\s*useCallback\(/);
  });

  it("passes onViewExistingDocument to <FileUpload>", () => {
    expect(source).toMatch(/onViewExistingDocument=\{handleViewExistingDocument\}/);
  });

  it("handler toasts the doc name and invalidates the deal detail query", () => {
    // Anchor on both observable side-effects so refactors can drop neither
    // silently. Toast surfaces the cue immediately; invalidate makes the
    // Documents tab pick up the existing doc.
    expect(source).toMatch(
      /handleViewExistingDocument[\s\S]{0,400}toast\.success[\s\S]{0,200}invalidateQueries[\s\S]{0,200}queryKeys\.deals\.detail\(dealId\)/
    );
  });
});
