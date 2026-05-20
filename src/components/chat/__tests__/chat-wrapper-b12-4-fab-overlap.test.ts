/**
 * Phase B12.4 P1 #7 — Chat IA FAB overlap fix on the deal page.
 *
 * Context: B12.1.1 audit observed the floating Chat IA button
 * (`fixed right-4 bottom-4 h-12`) partially covered the tap target
 * of an Evidence Health action ("Renseigner la date — <doc>") on
 * 390x844. The tap target's effective width shrank by ~30%, causing
 * mis-taps that opened Chat IA instead of the intended action.
 *
 * Fix: when the FAB is visible (i.e. when the chat is closed), add
 * `pb-20 md:pb-0` to the content wrapper so the page content gets
 * ~80px of bottom padding on mobile / narrow viewports. md+ keeps
 * zero padding because the FAB sits at the right edge with plenty
 * of horizontal space (overlap is rare on wider screens).
 *
 * The FAB position itself is unchanged (still `fixed right-4 bottom-4`).
 * Only the underlying content shrinks to make room.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "..", "chat-wrapper.tsx"),
  "utf8"
);

const STRIPPED = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("B12.4 P1 #7 — Chat IA FAB overlap fix", () => {
  it("defines a mobile-only bottom padding token gated on the FAB visibility", () => {
    // The padding class is conditional on `!isOpen` (FAB visible).
    // When the chat opens, the FAB hides and the padding lifts so
    // the chat panel doesn't have an empty 80px strip at the bottom.
    expect(STRIPPED).toMatch(
      /mobileFabPadding\s*=\s*!isOpen\s*\?\s*["']pb-20 md:pb-0["']\s*:\s*["']["']/
    );
  });

  it("applies the mobile FAB padding to the content wrapper (split-view branch)", () => {
    // The split-view branch renders `<div className={cn(...children-wrapper...)}>`.
    // The mobileFabPadding token must be included in that wrapper's
    // class list, otherwise the content can still overlap on mobile.
    const splitViewMatch = STRIPPED.match(
      /<div className=\{cn\(\s*"flex-1 min-w-0 transition-all duration-300",\s*mobileFabPadding,/
    );
    expect(splitViewMatch).not.toBeNull();
  });

  it("FAB position is unchanged (still fixed right-4 bottom-4 h-12 z-40)", () => {
    // Anchor that B12.4 didn't accidentally relocate the FAB. The fix
    // is purely about padding the content beneath it — the FAB
    // itself stays anchored at the bottom-right corner.
    const fabMatches = [...STRIPPED.matchAll(
      /className="fixed right-4 bottom-4 z-40 h-12 rounded-full shadow-lg gap-2 px-5"/g
    )];
    // Two branches render the FAB (with-children + without-children).
    expect(fabMatches.length).toBe(2);
  });

  it("FAB still renders behind the !isOpen gate (so it disappears when the chat opens)", () => {
    // The padding lift relies on the FAB being hidden when isOpen.
    // If the FAB were always visible, the padding would leak even
    // when not needed.
    const gatedFabs = [...STRIPPED.matchAll(
      /\{!isOpen\s*&&\s*\(\s*<Button[\s\S]*?aria-label="Ouvrir le chat IA"/g
    )];
    expect(gatedFabs.length).toBe(2);
  });
});
