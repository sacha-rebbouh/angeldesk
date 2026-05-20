/**
 * Phase B12.5 P2 #8 — file picker truncation fix.
 *
 * Context: B12.1 observed "Au...oisi" truncation of the native
 * <input type="file"> button label on 390x844 (the browser-set
 * "Aucun fichier choisi" string is set by the OS/browser and is
 * unstyle-able). The visible <Button> is the accessible control;
 * the native input is PROGRAMMATIC ONLY: clicked via ref. B12.5.1
 * (Codex fix-up) — the hidden input also carries `tabIndex={-1}`
 * + `aria-hidden="true"` so a keyboard user tabbing from the
 * visible Button doesn't land on an invisible `sr-only` control
 * with no focus indicator.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "..", "attachment-input.tsx"),
  "utf8"
);

const STRIPPED = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("B12.5 P2 #8 — Custom file picker replaces native truncation", () => {
  it("declares a fileInputRef to programmatically click the hidden input", () => {
    expect(STRIPPED).toMatch(/const fileInputRef\s*=\s*useRef<HTMLInputElement>\(null\)/);
  });

  it("renders a <Button> with explicit French label 'Sélectionner' (not the native browser label)", () => {
    // Anchor the visible label — must NOT depend on the browser's
    // default i18n which truncated to "Au...oisi" on narrow widths.
    const buttonMatch = STRIPPED.match(
      /<Button[\s\S]{0,400}aria-label=["']Sélectionner des fichiers joints["'][\s\S]{0,300}Sélectionner[\s\S]{0,100}<\/Button>/
    );
    expect(buttonMatch).not.toBeNull();
  });

  it("the visible Button triggers fileInputRef.current?.click() onClick", () => {
    expect(STRIPPED).toMatch(
      /onClick=\{\s*\(\)\s*=>\s*fileInputRef\.current\?\.click\(\)\s*\}/
    );
  });

  it("the native <Input type=\"file\"> is hidden via `sr-only` AND removed from tab order (B12.5.1 Codex P2)", () => {
    // The visible <Button> is the accessible control (carries
    // aria-label + label text + keyboard focus). The native input is
    // PROGRAMMATIC ONLY: clicked via ref. To prevent a keyboard user
    // from tabbing into an invisible `sr-only` control with no focus
    // indicator, we add `tabIndex={-1}` + `aria-hidden="true"` so the
    // input drops out of both the tab order and the accessibility tree.
    const refIdx = STRIPPED.indexOf("ref={fileInputRef}");
    expect(refIdx).toBeGreaterThan(0);
    const inputBlock = STRIPPED.slice(refIdx, refIdx + 600);
    expect(inputBlock).toMatch(/className=["']sr-only["']/);
    expect(inputBlock).toMatch(/tabIndex=\{-1\}/);
    expect(inputBlock).toMatch(/aria-hidden=["']true["']/);
  });

  it("preserves the existing accept + multiple + onChange contract", () => {
    // Anchor that the relocation didn't drop the file-type allowlist
    // or the multi-select behaviour. The <Input> is JSX self-closing
    // so we grab a generous block after `ref={fileInputRef}` and
    // assert each attribute appears somewhere in it.
    const refIdx = STRIPPED.indexOf("ref={fileInputRef}");
    expect(refIdx).toBeGreaterThan(0);
    // Take ~600 chars after the ref attribute — enough to cover the
    // full Input props block without overshooting into other JSX.
    const inputBlock = STRIPPED.slice(refIdx, refIdx + 600);
    expect(inputBlock).toMatch(/\bmultiple\b/);
    expect(inputBlock).toMatch(/accept=\{ACCEPTED_ATTACHMENT_TYPES\}/);
    expect(inputBlock).toMatch(/onChange=/);
  });
});
