/**
 * Phase B12.2.b — Static guards on the Upload Email/Note submit
 * relocation to the dialog's sticky footer.
 *
 * Context: B12.1 P0 #1 + #2 — the "Ajouter l'email au corpus" and
 * "Ajouter la note au corpus" buttons used to live at the bottom of
 * each form (inside the scroll container). On 1366x768 / 390x844 /
 * 900x600 the user had to scroll past 600-700px of form fields to
 * reach the submit, and the sticky footer only carried "Annuler" +
 * "Copier diagnostic" — no submit cue. Two distinct P0s, one per tab.
 *
 * The fix uses HTML form-association: each form has an id
 * (`upload-email-form` / `upload-note-form`), the in-form Button
 * is removed, and the dialog renders a contextual submit Button in
 * the sticky footer with `type="submit" form="<id>"`. State
 * (canSubmit, isSubmitting, attachmentCount) is surfaced via an
 * `onStateChange` callback so the footer button can mirror the
 * legacy disabled / loading / suffix behaviour.
 *
 * These guards are read-source-as-text — cheap and durable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const EMAIL_FORM = readFileSync(
  join(__dirname, "..", "corpus", "email-form.tsx"),
  "utf8"
);
const NOTE_FORM = readFileSync(
  join(__dirname, "..", "corpus", "note-form.tsx"),
  "utf8"
);
const DIALOG = readFileSync(
  join(__dirname, "..", "document-upload-dialog.tsx"),
  "utf8"
);

const STRIP_COMMENTS = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const EMAIL_STRIPPED = STRIP_COMMENTS(EMAIL_FORM);
const NOTE_STRIPPED = STRIP_COMMENTS(NOTE_FORM);
const DIALOG_STRIPPED = STRIP_COMMENTS(DIALOG);

describe("B12.2.b — Email form submit relocation guards", () => {
  it("exports a stable form id constant (UPLOAD_EMAIL_FORM_ID) for the dialog to reference", () => {
    expect(EMAIL_FORM).toMatch(
      /export const UPLOAD_EMAIL_FORM_ID\s*=\s*["']upload-email-form["']/
    );
  });

  it("renders a <form> with id={UPLOAD_EMAIL_FORM_ID} and an onSubmit handler", () => {
    // The form must wrap the content (not the legacy <div>) so the
    // footer Button with `type="submit" form="upload-email-form"`
    // triggers it.
    expect(EMAIL_STRIPPED).toMatch(
      /<form[^>]*id=\{UPLOAD_EMAIL_FORM_ID\}[^>]*onSubmit=\{handleFormSubmit\}/
    );
  });

  it("does NOT render a primary 'Ajouter ... au corpus' Button inside the form (relocated to dialog footer)", () => {
    // The Button visible to the user must NOT contain the submit
    // label inside the form anymore. The "Re-tenter l'extraction"
    // Button stays — it's a secondary action, not the form submit.
    expect(EMAIL_STRIPPED).not.toMatch(
      /<Button[^>]*onClick=\{submit\}[^>]*>[\s\S]*?Ajouter[\s\S]*?au corpus[\s\S]*?<\/Button>/
    );
  });

  it("calls onStateChange with canSubmit / isSubmitting / attachmentCount on every relevant change", () => {
    // The parent dialog drives the footer button's disabled state +
    // label suffix from this callback. Anchor the contract.
    expect(EMAIL_STRIPPED).toMatch(
      /onStateChange\?\.\(\s*\{\s*canSubmit:[^,]+,\s*isSubmitting,\s*attachmentCount:[^}]+\}\s*\)/
    );
  });

  it("handleFormSubmit calls event.preventDefault() then void submit()", () => {
    // preventDefault stops the browser's default page reload; submit()
    // is the existing async POST. Pre-B12.2.b the button used
    // onClick={submit} directly; the form-onSubmit pattern keeps the
    // async behaviour identical.
    expect(EMAIL_STRIPPED).toMatch(
      /handleFormSubmit\s*=\s*useCallback\s*\(\s*\([^)]*\)\s*=>\s*\{\s*event\.preventDefault\(\);\s*void submit\(\);\s*\}/
    );
  });
});

describe("B12.2.b — Note form submit relocation guards", () => {
  it("exports a stable form id constant (UPLOAD_NOTE_FORM_ID)", () => {
    expect(NOTE_FORM).toMatch(
      /export const UPLOAD_NOTE_FORM_ID\s*=\s*["']upload-note-form["']/
    );
  });

  it("renders a <form> with id={UPLOAD_NOTE_FORM_ID} and an onSubmit handler", () => {
    expect(NOTE_STRIPPED).toMatch(
      /<form[^>]*id=\{UPLOAD_NOTE_FORM_ID\}[^>]*onSubmit=\{handleFormSubmit\}/
    );
  });

  it("does NOT render a primary 'Ajouter la note au corpus' Button inside the form", () => {
    expect(NOTE_STRIPPED).not.toMatch(
      /<Button[^>]*onClick=\{submit\}[^>]*>[\s\S]*?Ajouter la note[\s\S]*?au corpus[\s\S]*?<\/Button>/
    );
  });

  it("calls onStateChange with canSubmit / isSubmitting / attachmentCount", () => {
    expect(NOTE_STRIPPED).toMatch(
      /onStateChange\?\.\(\s*\{\s*canSubmit:[^,]+,\s*isSubmitting,\s*attachmentCount:[^}]+\}\s*\)/
    );
  });

  it("handleFormSubmit calls event.preventDefault() then void submit()", () => {
    expect(NOTE_STRIPPED).toMatch(
      /handleFormSubmit\s*=\s*useCallback\s*\(\s*\([^)]*\)\s*=>\s*\{\s*event\.preventDefault\(\);\s*void submit\(\);\s*\}/
    );
  });
});

describe("B12.2.b — DocumentUploadDialog footer submit relocation guards", () => {
  it("imports UPLOAD_EMAIL_FORM_ID + UPLOAD_NOTE_FORM_ID + state types", () => {
    expect(DIALOG).toMatch(
      /import\s*\{[^}]*UPLOAD_EMAIL_FORM_ID[^}]*\}\s*from\s*["']\.\/corpus\/email-form["']/
    );
    expect(DIALOG).toMatch(
      /import\s*\{[^}]*UPLOAD_NOTE_FORM_ID[^}]*\}\s*from\s*["']\.\/corpus\/note-form["']/
    );
    expect(DIALOG).toMatch(/\btype\s+EmailFormState\b/);
    expect(DIALOG).toMatch(/\btype\s+NoteFormState\b/);
  });

  it("tracks the active tab (controlled Tabs value + onValueChange)", () => {
    // The footer button is conditional on the active tab; without
    // a controlled Tabs, the dialog can't know which contextual
    // submit to render.
    expect(DIALOG_STRIPPED).toMatch(
      /<Tabs[\s\S]*?value=\{activeTab\}[\s\S]*?onValueChange=/
    );
  });

  it("renders an EMAIL submit Button in the sticky footer with type=\"submit\" form={UPLOAD_EMAIL_FORM_ID}", () => {
    // The footer Button must associate to the form via the HTML
    // form attribute — that's the mechanism that triggers
    // EmailForm's onSubmit even though the button lives outside
    // the <form>. Pair this with `type="submit"` so a click
    // actually submits (not just focuses).
    expect(DIALOG_STRIPPED).toMatch(
      /<Button[^>]*type=["']submit["'][^>]*form=\{UPLOAD_EMAIL_FORM_ID\}/
    );
  });

  it("renders a NOTE submit Button in the sticky footer with type=\"submit\" form={UPLOAD_NOTE_FORM_ID}", () => {
    expect(DIALOG_STRIPPED).toMatch(
      /<Button[^>]*type=["']submit["'][^>]*form=\{UPLOAD_NOTE_FORM_ID\}/
    );
  });

  it("each contextual submit is gated by the active tab (so the Fichier tab footer is unchanged)", () => {
    // `activeTab === "email"` / `activeTab === "note"` gating means
    // the Fichier tab keeps its legacy footer (diagnostic + close
    // only). Anchor the gates so a future refactor can't surface
    // both submits at once.
    expect(DIALOG_STRIPPED).toMatch(
      /\{\s*activeTab\s*===\s*["']email["']\s*&&\s*\(\s*<Button[^>]*form=\{UPLOAD_EMAIL_FORM_ID\}/
    );
    expect(DIALOG_STRIPPED).toMatch(
      /\{\s*activeTab\s*===\s*["']note["']\s*&&\s*\(\s*<Button[^>]*form=\{UPLOAD_NOTE_FORM_ID\}/
    );
  });

  it("contextual submits live inside the sticky footer (after the body scroll container)", () => {
    // The footer is the shrink-0 + border-t div that comes AFTER
    // the body's `flex-1 overflow-y-auto min-h-0` container. Anchor
    // that the submit Button references appear after the scroll
    // container in source order — if they ever escape back into the
    // scroll container, we'd be regressing P0 #1 / #2.
    const scrollIdx = DIALOG_STRIPPED.indexOf("overflow-y-auto min-h-0");
    expect(scrollIdx).toBeGreaterThan(0);
    const stickyFooterIdx = DIALOG_STRIPPED.indexOf("shrink-0 border-t", scrollIdx);
    expect(stickyFooterIdx).toBeGreaterThan(scrollIdx);
    const emailFormBtnIdx = DIALOG_STRIPPED.indexOf("form={UPLOAD_EMAIL_FORM_ID}");
    expect(emailFormBtnIdx).toBeGreaterThan(stickyFooterIdx);
    const noteFormBtnIdx = DIALOG_STRIPPED.indexOf("form={UPLOAD_NOTE_FORM_ID}");
    expect(noteFormBtnIdx).toBeGreaterThan(stickyFooterIdx);
  });
});
