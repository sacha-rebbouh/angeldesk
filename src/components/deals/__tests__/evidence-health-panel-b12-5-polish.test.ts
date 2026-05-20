/**
 * Phase B12.5 — Polish guards on Evidence Health UI.
 *
 * Covers:
 *  - P3 #11 — `.truncate` document name in the active freshness card
 *    gets a `title` attribute so the full doc name is reachable via
 *    hover (desktop) / long-press (mobile) tooltip.
 *  - P3 #12 — the Resolution / Ignore sub-dialog adopts the internal
 *    standard pattern (max-h-[85vh] + flex flex-col + gap-0 p-0 on
 *    DialogContent + flex-1 overflow-y-auto min-h-0 body + shrink-0
 *    border-t footer). Defense-in-depth so a future content addition
 *    can't overflow the viewport (mirror of B12.2.a fix on
 *    DocumentMetadataDialog).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "..", "evidence-health-panel.tsx"),
  "utf8"
);

const STRIPPED = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("B12.5 P3 #11 — Truncated document name has a title tooltip", () => {
  it("the freshness card's truncated <span> with entry.documentName carries title={entry.documentName}", () => {
    // The span renders `entry.documentName` with `truncate`. Without
    // the `title` attribute, narrow viewports clip the name with no
    // recovery path. The HTML title attribute restores full visibility
    // via hover (desktop) and long-press (mobile).
    const tooltipSpan = STRIPPED.match(
      /<span\s+className=["']truncate text-xs text-muted-foreground["']\s+title=\{entry\.documentName\}\s*>\s*\{entry\.documentName\}\s*<\/span>/
    );
    expect(tooltipSpan).not.toBeNull();
  });
});

describe("B12.5 P3 #12 — Resolution sub-dialog overflow guard", () => {
  it("DialogContent uses the max-h-[85vh] + flex-col + gap-0 + p-0 standard", () => {
    // Match the same pattern enforced on DocumentMetadataDialog in
    // B12.2.a. Anchor each class separately so the order in the JSX
    // can vary without breaking the guard.
    // There are 2+ DialogContent in this file (other panels reuse the
    // primitive). Anchor specifically on the one that contains the
    // resolution-reason textarea so we test the right one.
    const resolutionBlock = STRIPPED.match(
      /<DialogContent[^>]*className=["']([^"']+)["'][\s\S]*?id="resolution-reason"/
    );
    expect(resolutionBlock).not.toBeNull();
    const className = resolutionBlock![1];
    // Note: `\b` doesn't work around `[` / `]` (both non-word chars),
    // so `max-h-[85vh]` is matched as a literal substring with
    // surrounding-space/start anchors.
    expect(className).toMatch(/(?:^|\s)max-h-\[85vh\](?:\s|$)/);
    expect(className).toMatch(/(?:^|\s)flex(?:\s|$)/);
    expect(className).toMatch(/(?:^|\s)flex-col(?:\s|$)/);
    expect(className).toMatch(/(?:^|\s)gap-0(?:\s|$)/);
    expect(className).toMatch(/(?:^|\s)p-0(?:\s|$)/);
  });

  it("Body wrapper has flex-1 + overflow-y-auto + min-h-0 (the triple-class flexbox scroll pattern)", () => {
    // The `space-y-3` body container around the state badge + reason
    // textarea. Must scroll internally rather than push the footer
    // off-screen on a long state.label or extra content additions.
    expect(STRIPPED).toMatch(
      /<div\s+className=["'][^"']*\bflex-1\b[^"']*\boverflow-y-auto\b[^"']*\bmin-h-0\b[^"']*\bspace-y-3\b/
    );
  });

  it("DialogHeader inside the resolution dialog is shrink-0 (sticky top)", () => {
    // Header carries title + description, must stay anchored when body
    // scrolls. Defense-in-depth pattern from B12.2.a.
    const resolutionHeader = STRIPPED.match(
      /<DialogHeader\s+className=["']shrink-0 border-b px-6 pt-5 pb-3["']/
    );
    expect(resolutionHeader).not.toBeNull();
  });

  it("DialogFooter inside the resolution dialog is shrink-0 + border-t (sticky bottom)", () => {
    // The confirm/cancel footer must NOT scroll with the body — same
    // contract as the B12.2.a metadata dialog fix.
    expect(STRIPPED).toMatch(
      /<DialogFooter\s+className=["']shrink-0[^"']*border-t[^"']*["']/
    );
  });
});
