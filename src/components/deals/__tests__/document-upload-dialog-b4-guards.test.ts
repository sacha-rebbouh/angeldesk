/**
 * Phase B4 — Static guards on document-upload-dialog.tsx + file-upload.tsx
 * UI/UX contract.
 *
 * The B4 refactor is purely UI/UX (no state-machine touch). Grep-based
 * guards prevent the next refactor from silently breaking the spec
 * deliverables:
 *
 *   1. Modal sticky footer with diagnostic + smart close-button label.
 *   2. Queue list scrolls internally so the upload action stays visible
 *      with 6+ files.
 *   3. Cancelled state has its own styling + is dismissible.
 *   4. Per-row progress bars for in-flight (uploading/extracting) files.
 *   5. Diagnostic button stays unconditional (never gated on queue state).
 *   6. Close-button label never says "Terminé" while in-flight/error
 *      (the prescriptive trap: a half-extracted batch claiming success).
 *
 * Component-level rendering tests would need JSDOM + react-dropzone + a
 * full clerk mock — out of scope for B4 (B14 covers full E2E). These
 * static guards enforce the contract at zero infra cost.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const dialogSource = readFileSync(
  join(__dirname, "..", "document-upload-dialog.tsx"),
  "utf8"
);
const fileUploadSource = readFileSync(
  join(__dirname, "..", "file-upload.tsx"),
  "utf8"
);

describe("document-upload-dialog.tsx — B4 deliverable #1 (compact stable modal)", () => {
  it("widens the modal to sm:max-w-2xl so 6+ files don't compress the row action cluster", () => {
    // Previously sm:max-w-xl was cramped once the queue had ≥4 files
    // with their type-selector + retry + cancel cluster.
    expect(dialogSource).toMatch(/sm:max-w-2xl/);
  });

  it("DialogContent caps at max-h-[85vh] and uses flex-col so the footer can stay sticky", () => {
    // Without the cap, a tall queue would overflow viewport on laptop.
    // Without flex-col, the footer couldn't anchor at the bottom.
    expect(dialogSource).toMatch(/max-h-\[85vh\]/);
    expect(dialogSource).toMatch(/flex flex-col/);
  });

  it("renders a sticky footer with shrink-0 + border-t so content scroll never hides it", () => {
    // The middle of the dialog is the only scrollable region. Header +
    // footer both shrink-0 so they remain visible regardless of content
    // height.
    expect(dialogSource).toMatch(/shrink-0[\s\S]{0,100}border-t/);
  });
});

describe("document-upload-dialog.tsx — B4 deliverable #3 (clear global state)", () => {
  it("subscribes to queueSummary via onQueueSummaryChange (single source of truth)", () => {
    // The dialog never reads the queue directly — FileUpload pushes a
    // fresh QueueSummary on every change. Prevents the dialog and the
    // file-tab from drifting on the counts.
    expect(dialogSource).toMatch(/onQueueSummaryChange=\{setQueueSummary\}/);
    expect(dialogSource).toMatch(/const\s+\[queueSummary,\s*setQueueSummary\]/);
  });

  it("close-button label NEVER says 'Terminé' while inFlightCount or validatingCount > 0", () => {
    // Hard spec rule: a half-extracted batch must not claim success.
    // The label computation collapses anything-in-flight → "Fermer".
    expect(dialogSource).toMatch(
      /if\s*\(\s*inFlightCount\s*>\s*0\s*\|\|\s*validatingCount\s*>\s*0\s*\)\s*return\s*["']Fermer["']/
    );
  });

  it("close-button label says 'Fermer' (not 'Terminé') while errorCount > 0", () => {
    // An error-only outcome is not a success either.
    expect(dialogSource).toMatch(
      /if\s*\(\s*errorCount\s*>\s*0\s*\)\s*return\s*["']Fermer["']/
    );
  });

  it("close-button label says 'Terminé' only when nothing is in flight, no errors, AND something completed", () => {
    // Reaching this branch implies all the earlier guards (in-flight,
    // error) returned false. The composition of the function makes the
    // "Terminé" path the strictly-clean-success one.
    expect(dialogSource).toMatch(
      /if\s*\(\s*hasUploaded\s*\|\|\s*completedCount\s*>\s*0\s*\)\s*return\s*["']Terminé["']/
    );
  });

  it("close-button aria-label tells the user about in-flight uploads when fermer", () => {
    // Visual label is short ("Fermer"); the screen-reader / hover label
    // explains the state so the user isn't blindly closing on uploads in
    // flight.
    expect(dialogSource).toMatch(
      /inFlightCount\s*>\s*0[\s\S]{0,300}upload[\s\S]{0,200}en cours côté serveur/
    );
  });

  it("footer summary line surfaces completed / inFlight / error / cancelled counts", () => {
    // The summary line drives the user's read of the batch state in one
    // glance. Each counter type must contribute (only non-zero values
    // render, which is a runtime concern).
    expect(dialogSource).toMatch(/queueSummary\.completedCount\s*>\s*0/);
    expect(dialogSource).toMatch(/queueSummary\.inFlightCount\s*>\s*0/);
    expect(dialogSource).toMatch(/queueSummary\.errorCount\s*>\s*0/);
    expect(dialogSource).toMatch(/queueSummary\.cancelledCount\s*>\s*0/);
  });

  it("REMOVED auto-close-on-success setTimeout (B4 — user decides when to close)", () => {
    // The previous handleAllComplete fired a 500 ms auto-close. With per-
    // file extraction states visible inline, the user benefits from
    // seeing the final state. They close manually via the smart-label
    // button. Catch a regression that re-introduces the timer.
    expect(dialogSource).not.toMatch(/setTimeout\([\s\S]{0,300}onOpenChange\(false\)/);
  });
});

describe("document-upload-dialog.tsx — B4 deliverable #4 (diagnostic visible but discreet)", () => {
  it("diagnostic button lives in the dialog footer (unconditionally rendered)", () => {
    // Previously inside FileUpload (could scroll out of view with a long
    // queue). Now in the sticky footer = always visible, always
    // accessible — preserving the original B0/B1 P1 contract at the
    // dialog level.
    expect(dialogSource).toMatch(/Copier diagnostic/);
    expect(dialogSource).toMatch(/handleCopyDiagnostic/);
    expect(dialogSource).toMatch(/ClipboardCopy/);
  });

  it("diagnostic button has an aria-label spelling out what it does", () => {
    // Icon + short text → spell out the support intent for assistive tech.
    expect(dialogSource).toMatch(/aria-label="Copier le diagnostic d'upload[^"]*"/);
  });

  it("diagnostic button uses the redactedDiagnostic helper (no raw event leaks)", () => {
    // The redactedDiagnostic helper strips token / URL / OCR text by
    // construction. A future refactor that calls a non-redacted helper
    // would leak secrets into the clipboard.
    expect(dialogSource).toMatch(/instrumentation\.redactedDiagnostic\(\)/);
  });

  it("diagnostic button is rendered OUTSIDE the scrollable content region", () => {
    // It must sit in the sticky footer block (shrink-0 + border-t).
    // Anchor on the structural order: footer block opens with the
    // ClipboardCopy button before the close-button.
    expect(dialogSource).toMatch(
      /shrink-0\s+border-t[\s\S]{0,1500}ClipboardCopy[\s\S]{0,2000}Fermer|Terminé|Annuler/
    );
  });
});

describe("file-upload.tsx — B4 deliverable #1 (no layout shift on dense queues)", () => {
  it("queue list scrolls internally once queue.length >= 4 (upload action stays visible)", () => {
    // With ≥4 files, the inner list takes max-h-[40vh] with its own
    // overflow-y-auto — the upload button (below) is never pushed past
    // the dialog's visible area on laptop.
    expect(fileUploadSource).toMatch(
      /queue\.length\s*>=\s*4[\s\S]{0,300}max-h-\[40vh\][\s\S]{0,100}overflow-y-auto/
    );
  });

  it("queue summary header is shown only when queue.length >= 4 (1-3 files stay minimal)", () => {
    // Below 4 files the per-row coloured tiles already carry the state;
    // adding a counter line would be noise. At ≥4 the counter line is
    // the only way to read totals at a glance.
    expect(fileUploadSource).toMatch(/queue\.length\s*>=\s*4\s*&&\s*\(/);
  });

  it("queue summary line exposes role=status + aria-live=polite for assistive tech", () => {
    // Live region so screen-readers announce counter changes without
    // hijacking the user's focus.
    expect(fileUploadSource).toMatch(/role="status"[\s\S]{0,200}aria-live="polite"/);
  });
});

describe("file-upload.tsx — B4 deliverable #2 (lisible multi-file queue)", () => {
  it("emits a QueueSummary on every queue / extraction change via onQueueSummaryChange", () => {
    // The dialog footer + summary line read this snapshot. Without it the
    // dialog can't render counts.
    expect(fileUploadSource).toMatch(/onQueueSummaryChange\?:\s*\(summary:\s*QueueSummary\)/);
    expect(fileUploadSource).toMatch(/onQueueSummaryChangeRef\.current\?\.\(queueSummary\)/);
  });

  it("QueueSummary type exposes the 8 counters the dialog needs (completed / error / cancelled / inFlight / validating / ready / needsReselect / total)", () => {
    // Frozen contract — adding a counter is fine, REMOVING one breaks
    // the dialog footer. Keep an explicit assertion.
    expect(fileUploadSource).toMatch(/export\s+interface\s+QueueSummary\s*\{/);
    [
      "total",
      "completedCount",
      "errorCount",
      "cancelledCount",
      "inFlightCount",
      "validatingCount",
      "readyCount",
      "needsReselectCount",
    ].forEach((key) => {
      expect(fileUploadSource).toMatch(new RegExp(`\\b${key}:\\s*number`));
    });
  });

  it("each row has per-file progress when state is uploading or extracting", () => {
    // Per-row progress = user sees WHICH file is moving (vs an aggregate
    // bar at the bottom that doesn't identify the file).
    expect(fileUploadSource).toMatch(
      /rowUploadProgress\s*=\s*[\s\S]{0,200}state\s*===\s*["']uploading["']/
    );
    expect(fileUploadSource).toMatch(
      /rowExtractionProgress\s*=\s*[\s\S]{0,200}state\s*===\s*["']extracting["']/
    );
    expect(fileUploadSource).toMatch(/rowProgress\s*&&\s*\([\s\S]{0,400}<Progress\s+value=\{rowProgress\.percent\}/);
  });

  it("Status icon coverage: every state in the state machine has a distinct icon (no missing case)", () => {
    // selected/validated → FileIcon, validating/uploading/extracting →
    // Loader2, completed → CheckCircle2, error → AlertCircle,
    // cancelled (B4) → Ban. The renderer's else-tail is the FileIcon
    // fallback for selected/validated — explicit checks here catch the
    // sneakiest regression: dropping a branch.
    expect(fileUploadSource).toMatch(/state\s*===\s*["']validating["'][\s\S]{0,200}Loader2/);
    expect(fileUploadSource).toMatch(/state\s*===\s*["']completed["'][\s\S]{0,200}CheckCircle2/);
    expect(fileUploadSource).toMatch(/state\s*===\s*["']error["'][\s\S]{0,200}AlertCircle/);
    expect(fileUploadSource).toMatch(/state\s*===\s*["']cancelled["'][\s\S]{0,200}Ban/);
  });

  it("Cancelled rows have their own slate styling (distinct from error red)", () => {
    // Distinct color so user immediately reads "neither success nor
    // failure". Without this, the cancelled row was invisible after the
    // toast faded.
    expect(fileUploadSource).toMatch(
      /state\s*===\s*["']cancelled["'][\s\S]{0,200}border-slate-300[\s\S]{0,100}bg-slate-50/
    );
  });

  it("Cancelled rows expose a textual cue (in case the user missed the toast)", () => {
    // The toast from onError fires once; the inline cue stays so the user
    // can re-read it.
    expect(fileUploadSource).toMatch(/state\s*===\s*["']cancelled["'][\s\S]{0,400}Annulé localement/);
  });

  it("Cancelled rows are DISMISSIBLE via the X button (handleCancel Case 1 includes cancelled)", () => {
    // The Case 1 branch in handleCancel now includes `cancelled` so the
    // X click removes the row entirely. Was a silent no-op before B4.
    expect(fileUploadSource).toMatch(
      /item\.state\s*===\s*["']selected["'][\s\S]{0,300}["']error["'][\s\S]{0,100}["']cancelled["'][\s\S]{0,500}removeFile\(item\.id\)/
    );
  });

  it("X button is rendered for cancelled rows (not just hidden because completed/cancelled bail-out)", () => {
    // The OR-chain on the JSX side must include cancelled now.
    expect(fileUploadSource).toMatch(
      /\(isEditable\s*\|\|[\s\S]{0,200}item\.state\s*===\s*["']uploading["'][\s\S]{0,200}item\.state\s*===\s*["']extracting["'][\s\S]{0,200}item\.state\s*===\s*["']cancelled["']\s*\)\s*&&/
    );
  });

  it("Filenames are still truncated with a title attribute (preserves B0/B1 a11y)", () => {
    // Previously confirmed by an instrumentation guard — re-asserted
    // here because B4 reshaped the row markup and could have dropped it.
    expect(fileUploadSource).toMatch(/flex-1\s+truncate\s+text-sm[\s\S]{0,100}title=\{item\.name\}/);
  });
});

describe("file-upload.tsx — B4 deliverable #2 (preserved B0-B3 guarantees)", () => {
  it("DOES NOT re-introduce a single-file lastPendingExtraction tracker (B2.1 contract)", () => {
    // B4 is UI-only; the multi-pending map MUST stay the source of truth.
    expect(fileUploadSource).not.toMatch(/\blastPendingExtraction\b/);
  });

  it("uses clerkFetch (not raw fetch) for auth-bearing requests (no auth leak via stale cookies)", () => {
    // Confirmed elsewhere; re-anchored here because B4 touched the file
    // upload module.
    expect(fileUploadSource).toMatch(/clerkFetch\(/);
  });

  it("preserves the multi-poller orchestrator + ref-based cancel registry", () => {
    expect(fileUploadSource).toMatch(/pollersRef\s*=\s*useRef<Map<string,/);
    expect(fileUploadSource).toMatch(/startPoller\(fileId,\s*pending\)/);
  });
});
