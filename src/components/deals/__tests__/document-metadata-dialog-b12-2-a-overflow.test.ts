/**
 * Phase B12.2.a — Static guards on the DocumentMetadataDialog
 * overflow fix.
 *
 * Context: B12.1 P0 #3 — the dialog previously used
 *   <DialogContent className="sm:max-w-md">
 * with no `max-h-[Xvh]` and no internal scroll container. On a
 * 900x600 viewport the dialog grew to 827px and overflowed the page,
 * making the Save button invisible without scrolling the whole
 * document. Even on a standard 1366x768 laptop the bottom 30px
 * (containing the save buttons) was clipped.
 *
 * The fix applies the internal standard already used by
 * DocumentUploadDialog: max-h-[85vh] + flex flex-col + gap-0 p-0 on
 * DialogContent, an overflow-y-auto / flex-1 / min-h-0 body, and a
 * shrink-0 + border-t sticky footer.
 *
 * These guards anchor the structure so a future refactor cannot
 * silently regress the overflow bug. They are read-source-as-text
 * assertions — cheap and durable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "..", "document-metadata-dialog.tsx"),
  "utf8"
);

// Strip block + line + JSX comments so the assertions only inspect
// USER-FACING JSX, not the doc comments that describe the standard
// (those legitimately mention the same class names).
const STRIPPED = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("B12.2.a — DocumentMetadataDialog overflow guards", () => {
  it("DialogContent declares max-h + flex-col + gap-0 + p-0 (height bound + layout)", () => {
    // The standard pattern that prevents the dialog from growing past
    // 85% of the viewport AND lets the body scroll internally rather
    // than push the footer off-screen.
    expect(STRIPPED).toMatch(
      /<DialogContent[^>]*className=["'][^"']*\bmax-h-\[85vh\][^"']*["']/
    );
    expect(STRIPPED).toMatch(
      /<DialogContent[^>]*className=["'][^"']*\bflex\b[^"']*\bflex-col\b[^"']*["']/
    );
    // gap-0 + p-0 — required so the header / footer can manage their
    // own padding without the DialogContent's defaults double-padding.
    expect(STRIPPED).toMatch(
      /<DialogContent[^>]*className=["'][^"']*\bgap-0\b[^"']*["']/
    );
    expect(STRIPPED).toMatch(
      /<DialogContent[^>]*className=["'][^"']*\bp-0\b[^"']*["']/
    );
  });

  it("Body scroll container present: flex-1 + overflow-y-auto + min-h-0", () => {
    // The triple-class is required by flexbox: a flex child needs
    // min-h-0 to be allowed to shrink below its content height,
    // overflow-y-auto to scroll the overflow, and flex-1 to fill the
    // remaining height between header and footer. Missing any one of
    // these breaks the scroll-internal contract.
    expect(STRIPPED).toMatch(/\bflex-1\b[^"']*\boverflow-y-auto\b[^"']*\bmin-h-0\b/);
  });

  it("DialogFooter is sticky (shrink-0 + border-t)", () => {
    // The footer must NOT scroll with the body — otherwise the Save
    // button would disappear under the scroll and we'd be back to
    // P0 #3. shrink-0 prevents the flex parent from squashing it,
    // border-t visually anchors it to the body.
    expect(STRIPPED).toMatch(
      /<DialogFooter[^>]*className=["'][^"']*\bshrink-0\b[^"']*["']/
    );
    expect(STRIPPED).toMatch(
      /<DialogFooter[^>]*className=["'][^"']*\bborder-t\b[^"']*["']/
    );
  });

  it("DialogHeader is shrink-0 (header always visible at the top)", () => {
    // Same as the footer: the header must stay anchored even when
    // the body scrolls. Without shrink-0, a long body could push the
    // title out of view.
    expect(STRIPPED).toMatch(
      /<DialogHeader[^>]*className=["'][^"']*\bshrink-0\b[^"']*["']/
    );
  });

  it("Submit button keeps type=\"submit\" inside the form (Save reachable from the sticky footer)", () => {
    // The footer now lives at the bottom of the form (so the submit
    // button still submits) but its containing structure changed.
    // Anchor: there is still a button with type="submit" somewhere
    // in the file (the Save button).
    expect(STRIPPED).toMatch(/<Button[^>]*type=["']submit["']/);
  });

  it("DialogClose still wraps the Annuler button (Radix ESC + close-on-click preserved)", () => {
    // The refactor must NOT have replaced DialogClose with a plain
    // onClick — Radix relies on DialogClose to trigger the same code
    // path as ESC / overlay-click, keeping focus management consistent.
    expect(STRIPPED).toMatch(/<DialogClose[\s\S]*?Annuler[\s\S]*?<\/DialogClose>/);
  });

  it("Body scroll container is INSIDE the form (so flex layout extends from DialogContent through form to body+footer)", () => {
    // Anchor that the scroll container sits between the <form> open
    // tag and the <DialogFooter>. If it ever escapes the form, the
    // body and footer would no longer share the flex column and the
    // scroll math would break.
    const formIdx = STRIPPED.search(/<form[^>]*onSubmit=\{handleSubmit\}/);
    expect(formIdx).toBeGreaterThan(0);
    const footerIdx = STRIPPED.indexOf("<DialogFooter", formIdx);
    expect(footerIdx).toBeGreaterThan(formIdx);
    const scrollIdx = STRIPPED.indexOf("overflow-y-auto", formIdx);
    expect(scrollIdx).toBeGreaterThan(formIdx);
    expect(scrollIdx).toBeLessThan(footerIdx);
  });
});
