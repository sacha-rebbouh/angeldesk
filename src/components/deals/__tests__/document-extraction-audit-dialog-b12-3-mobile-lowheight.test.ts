/**
 * Phase B12.3 — Static guards on the audit dialog's mobile/low-height
 * fixes (P1 #4 + P1 #5).
 *
 * Context:
 * - **P1 #4** — the "Modifier les métadonnées" header CTA used a
 *   `CalendarDays` icon. On compact widths (sub-md, where the text
 *   label collapses), the icon became the sole affordance and
 *   suggested "date" while the button edits date + type + sourceKind.
 *   Fix: swap to `Pencil` (standard edit affordance).
 * - **P1 #5** — at sub-lg the 3-col grid collapsed to a vertical
 *   stack but the outer container was `overflow-hidden`, clipping
 *   any content past the dialog's height (the empty-state CTAs in
 *   `main` were sandwiched under the tabs aside on 900x600 / 390x844).
 *   The columns also had `min-h-0 + overflow-y-auto` so they shrank
 *   below their content and any overflow was clipped inside each
 *   column. Fix: gate `min-h-0` + `overflow-y-auto` + `overflow-hidden`
 *   to lg+ so at sub-lg each column grows to natural content height
 *   and the outer grid scrolls (instead of clipping).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "..", "document-extraction-audit-dialog.tsx"),
  "utf8"
);

const STRIPPED = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("B12.3 P1 #4 — Modifier les métadonnées icon swap", () => {
  it("imports Pencil from lucide-react (not CalendarDays)", () => {
    // Pencil is the standard edit affordance. CalendarDays suggested
    // "date" which under-sold what the button actually edits (date +
    // type + sourceKind).
    expect(SOURCE).toMatch(
      /import\s*\{[\s\S]*?\bPencil\b[\s\S]*?\}\s*from\s*["']lucide-react["']/
    );
  });

  it("does NOT import CalendarDays from lucide-react (cleanup)", () => {
    // The icon swap must be complete — leaving CalendarDays in the
    // imports would silently allow a future refactor to revert the
    // affordance without noise.
    expect(SOURCE).not.toMatch(
      /import\s*\{[\s\S]*?\bCalendarDays\b[\s\S]*?\}\s*from\s*["']lucide-react["']/
    );
  });

  it("renders <Pencil /> inside the Modifier les métadonnées button", () => {
    // Anchor the swap at the actual call site. The button is the one
    // with aria-label="Modifier les métadonnées du document".
    const buttonMatch = STRIPPED.match(
      /aria-label=["']Modifier les métadonnées du document["'][\s\S]{0,400}?<\/Button>/
    );
    expect(buttonMatch).not.toBeNull();
    expect(buttonMatch?.[0]).toMatch(/<Pencil\b/);
    expect(buttonMatch?.[0]).not.toMatch(/<CalendarDays\b/);
  });
});

describe("B12.3 P1 #5 — Audit dialog grid + columns growth at sub-lg", () => {
  it("Outer grid uses overflow-y-auto by default and lg:overflow-hidden", () => {
    // Default (sub-lg) = scroll the whole vertical stack. lg+ = restore
    // the original clipping (3-col layout fits side-by-side, each
    // column has its own internal scroll).
    const gridMatch = STRIPPED.match(
      /<div\s+className=["']grid[^"']*overflow-y-auto[^"']*lg:overflow-hidden[^"']*lg:grid-cols-/
    );
    expect(gridMatch).not.toBeNull();
  });

  it("main element has lg-gated min-h-0 + lg-gated overflow-y-auto", () => {
    // At sub-lg main grows to natural content height (so the
    // EmptyDocumentPreview's `min-h-[320px]` is respected). At lg+
    // main has its own internal scroll inside the 3-col grid.
    const mainMatch = STRIPPED.match(
      /<main\s+className=["'][^"']*lg:min-h-0[^"']*lg:overflow-y-auto[^"']*["']/
    );
    expect(mainMatch).not.toBeNull();
    // Sanity: main must NOT carry an unscoped min-h-0 or overflow-y-auto
    // (those are the patterns that caused the clipping pre-fix).
    expect(mainMatch?.[0]).not.toMatch(/(?<!lg:)\bmin-h-0\b/);
    expect(mainMatch?.[0]).not.toMatch(/(?<!lg:)\boverflow-y-auto\b/);
  });

  it("left aside (page list) has lg-gated min-h-0 (grows at sub-lg)", () => {
    // The left aside hosts the search/filters + page list. At sub-lg
    // it must grow to its natural content (it sits in a vertical
    // stack with the outer scroll). At lg+ min-h-0 lets it shrink
    // within the 3-col layout.
    const asideMatch = STRIPPED.match(
      /<aside\s+className=["'][^"']*lg:min-h-0[^"']*lg:border-b-0[^"']*lg:border-r["']/
    );
    expect(asideMatch).not.toBeNull();
    expect(asideMatch?.[0]).not.toMatch(/(?<!lg:)\bmin-h-0\b/);
  });

  it("right aside (tabs panel) has lg-gated overflow-hidden + lg-gated min-h-0", () => {
    // Mirror of the left aside: the right aside (Extraction/Corpus/Liens
    // tabs) grows at sub-lg, has its own overflow-hidden at lg+ where
    // the inner TabsContent scrolls.
    const asideMatch = STRIPPED.match(
      /<aside\s+className=["'][^"']*lg:min-h-0[^"']*lg:overflow-hidden["']/
    );
    expect(asideMatch).not.toBeNull();
    expect(asideMatch?.[0]).not.toMatch(/(?<!lg:)\bmin-h-0\b/);
    expect(asideMatch?.[0]).not.toMatch(/(?<!lg:)\boverflow-hidden\b/);
  });

  it("inner page-list scroll container is lg-gated", () => {
    // The `min-h-[180px] flex-1 ... overflow-y-auto p-2` page list
    // container. At sub-lg the outer scroll handles everything, so
    // this inner scroll is gated to lg+.
    const innerMatch = STRIPPED.match(
      /<div\s+className=["']min-h-\[180px\][^"']*lg:overflow-y-auto["']/
    );
    expect(innerMatch).not.toBeNull();
    expect(innerMatch?.[0]).not.toMatch(/(?<!lg:)\boverflow-y-auto\b/);
  });

  it("all TabsContent inner scrolls are lg-gated (Extraction/Corpus/Liens/Model)", () => {
    // The four TabsContent panels each have their own internal scroll
    // at lg+, growing inline at sub-lg. Anchor the contract on every
    // panel to prevent partial regression.
    const tabsContents = [
      ...STRIPPED.matchAll(/<TabsContent\s+value=["'][^"']+["']\s+className=["']([^"']+)["']/g),
    ];
    expect(tabsContents.length).toBeGreaterThanOrEqual(4);
    for (const m of tabsContents) {
      const className = m[1];
      expect(className).toMatch(/lg:overflow-y-auto/);
      expect(className).not.toMatch(/(?<!lg:)\boverflow-y-auto\b/);
    }
  });
});
