/**
 * Phase B0/B1 — Static guards on file-upload.tsx instrumentation surface.
 *
 * Cheap grep-based contracts so the next refactor cannot silently regress:
 *   - Diagnostic button ALWAYS rendered (Codex round B0/B1 P1).
 *   - "file reference missing" branch instruments `upload_failed`
 *     (Codex round B0/B1 P2).
 *   - Upload button blocked while any item is still selected/validating
 *     (Codex round B0/B1 P2).
 *
 * Component-level tests would require JSDOM + react-dropzone + clerk
 * mocks. Grep guards catch the regression at zero infrastructure cost
 * and stay aligned with the same convention used in the evidence-health
 * invalidation guards.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("file-upload.tsx — Codex B0/B1 fix-up guards", () => {
  const source = readFileSync(
    join(__dirname, "..", "file-upload.tsx"),
    "utf8"
  );

  it("Codex round B0/B1 P1 — file-upload.tsx must NOT re-introduce a queue-gated diagnostic button", () => {
    // The diagnostic button has moved to the dialog's sticky footer (B4 —
    // see document-upload-dialog-b4-guards.test.ts for the new
    // "always rendered" contract). The original B0/B1 P1 anti-pattern was
    // gating the button on `queue.length > 0 || erroredCount > 0`. Even
    // though the button is no longer here, the anti-pattern guard stays
    // so a future regression that re-inlines a gated button is caught.
    expect(source).not.toMatch(/queue\.length\s*>\s*0\s*\|\|\s*erroredCount\s*>\s*0/);
    // The handler is also no longer here — it moved to the dialog. Catch
    // accidental re-introduction of a duplicate handler in file-upload.tsx.
    expect(source).not.toMatch(/handleCopyDiagnostic\s*=\s*useCallback/);
  });

  it("Codex round B0/B1 P2 — 'file reference missing' branch records upload_failed", () => {
    // The orphan-File branch must be visible in the diagnostic. The fix
    // wires an explicit `instrumentation.record({ event: "upload_failed" })`
    // before returning the error.
    expect(source).toMatch(
      /Référence fichier introuvable dans la queue[\s\S]{0,500}instrumentation\.record\([\s\S]{0,200}event:\s*["']upload_failed["']/
    );
  });

  it("Codex round B0/B1 P2 — upload button disabled while validations in flight", () => {
    // Compute `inFlightValidationCount` (selected | validating) and pass it
    // into the disabled condition. Prevents the user firing handleUploadAll
    // on a partial validated set.
    expect(source).toMatch(
      /inFlightValidationCount\s*=\s*queue\.filter\([\s\S]{0,200}["']selected["'][\s\S]{0,80}["']validating["']/
    );
    expect(source).toMatch(/disabled=\{[^}]*inFlightValidationCount\s*>\s*0[^}]*\}/);
  });

  it("Codex B2.1 P1 — single-extraction tracker `lastPendingExtraction` no longer exists", () => {
    // The old model tracked at most one pending PDF via `lastPendingExtraction`,
    // silently losing N-1 files when multiple PDF async ran in the same batch.
    // The fix replaced it with a multi-pending map. Guard ensures we don't
    // regress to single-tracking on next refactor.
    expect(source).not.toMatch(/\blastPendingExtraction\b/);
    expect(source).not.toMatch(/\bsetExtractionPending\b/);
    expect(source).not.toMatch(/\bdeferredCountsRef\b/);
  });

  it("Codex B2.1 P1 — multi-pending state shape (Record<fileId, PendingExtraction>)", () => {
    // Multi-pending requires a per-file map, not a single object. The shape
    // must carry a metadata snapshot so the poller never re-reads a stale
    // queue.
    expect(source).toMatch(/extractionsPending[\s\S]{0,200}Record<string,\s*PendingExtraction>/);
    expect(source).toMatch(/interface\s+PendingExtraction\s*\{[\s\S]{0,400}progressId:\s*string/);
  });

  it("Codex B2.1 P1 — multi-poller orchestrator + cleanup-on-unmount", () => {
    // pollersRef tracks one cancel function per fileId. The sync effect
    // starts pollers for new entries and stops pollers when entries are
    // removed (after settlement). A SEPARATE empty-deps effect cancels
    // all on unmount.
    expect(source).toMatch(/pollersRef\s*=\s*useRef<Map<string,/);
    expect(source).toMatch(/startPoller\(fileId,\s*pending\)/);
    expect(source).toMatch(/for\s+\(\s*const\s+cancel\s+of\s+current\.values\(\)\s*\)\s*cancel\(\)/);
  });

  it("Codex B2.1 P1 — batch lifecycle uses the pure controller (testable in isolation)", () => {
    // The batch lifecycle (one start, N settles, one onAllComplete) is in
    // @/lib/upload-batch so it can be unit-tested without React. The
    // component must use that controller, not maintain ad-hoc batch state
    // inside refs.
    expect(source).toMatch(
      /import\s+\{\s*createUploadBatch[^}]*\}\s+from\s+["']@\/lib\/upload-batch["']/
    );
    expect(source).toMatch(/batch\.start\(/);
    expect(source).toMatch(/batch\.settle\(/);
  });

  it("B2.2 — handleRetry exists and starts a mini-batch via the controller", () => {
    // Per-file retry MUST go through batch.start([item.id]) so the
    // multi-pending lifecycle stays intact (a PDF async retry still
    // registers in extractionsPending via uploadFile).
    expect(source).toMatch(/const\s+handleRetry\s*=\s*useCallback\(/);
    // Must call batch.start with the single fileId.
    expect(source).toMatch(/batch\.start\(\[item\.id\]\)/);
  });

  it("B2.2 — retry button gated on isUploading AND inFlightValidationCount", () => {
    // Same preconditions as the main upload button — never invite an action
    // that would corrupt an in-flight batch or fire on a partial validated set.
    expect(source).toMatch(/title="Réessayer"/);
    expect(source).toMatch(/disabled=\{[^}]*isUploading[^}]*inFlightValidationCount\s*>\s*0[^}]*\}/);
  });

  it("B2.2 — retry preserves item metadata snapshot (documentType, customType, name)", () => {
    // handleRetry passes a snapshot built from the queue item — never
    // re-runs createQueueItem (which would forget the user's documentType
    // choice). The state is reset to "validated" with error cleared so the
    // first dispatch doesn't surface a stale failure message.
    expect(source).toMatch(/retryItem:\s*UploadQueueItem\s*=\s*\{\s*\.\.\.item,\s*state:\s*"validated"/);
  });

  it("B2.2 — upload_retry_started recorded BEFORE the new upload_started", () => {
    // Diagnostic chain "first attempt → fail → retry → success/fail" requires
    // upload_retry_started to be recorded before uploadFile (which records
    // upload_started internally). The window is generous (~1200 chars) to
    // tolerate intervening setIsUploading / setUploadStartedAt / spread snapshot.
    expect(source).toMatch(
      /event:\s*"upload_retry_started"[\s\S]{0,1500}uploadFile\(retryItem\)/
    );
  });

  it("Codex B2.2 P3 — handleRetry checks validatingCount directly (defense-in-depth)", () => {
    // The button is also disabled in the UI, but a race between drop and
    // click could otherwise fire on a half-validated set. handleRetry must
    // compute validatingCount itself and bail with onError.
    expect(source).toMatch(
      /handleRetry[\s\S]{0,800}validatingCount\s*=\s*queue\.filter\([\s\S]{0,200}["']selected["'][\s\S]{0,80}["']validating["']/
    );
  });

  it("B2.3 — handleCancel exists and dispatches the 3 cases (pre-upload / uploading / extracting)", () => {
    expect(source).toMatch(/const\s+handleCancel\s*=\s*useCallback\(/);
    // Pre-upload → removeFile.
    expect(source).toMatch(/removeFile\(item\.id\)/);
    // Uploading → abort the AbortController.
    expect(source).toMatch(/uploadAbortRef\.current\.get\(item\.id\)[\s\S]{0,200}\.abort\(\)/);
    // Extracting → cancel the per-file poller.
    expect(source).toMatch(/pollersRef\.current\.get\(item\.id\)[\s\S]{0,200}pollersRef\.current\.delete\(item\.id\)/);
  });

  it("B2.3 — cancelled file calls batch.settleCancelled (not batch.settle)", () => {
    // Cancelled must NEVER bump errorCount — that would mislead the user
    // who deliberately cancelled. The batch controller's settleCancelled
    // decrements pending without touching success/error counts. The
    // handleUploadAll loop checks `cancelled` first and routes accordingly.
    expect(source).toMatch(/batch\.settleCancelled\(item\.id\)/);
    expect(source).toMatch(/if\s*\(\s*cancelled\s*\)[\s\S]{0,400}batch\.settleCancelled\(item\.id\)/);
  });

  it("B2.3 — AbortController wired through clerkFetch (signal) and putBlob (abortSignal)", () => {
    // Each upload-in-flight registers an AbortController so the cancel
    // button actually aborts the network request rather than letting it
    // finish in the background.
    expect(source).toMatch(/new\s+AbortController\(\)/);
    expect(source).toMatch(/uploadAbortRef\.current\.set\(item\.id,\s*abortController\)/);
    // The controller's signal must be forwarded into the upload helpers.
    expect(source).toMatch(/abortController\.signal/);
    // putBlob takes `abortSignal` (Vercel Blob SDK naming); clerkFetch / fetch
    // takes `signal`.
    expect(source).toMatch(/abortSignal:\s*signal/);
    expect(source).toMatch(/signal,?\s*\n\s*\}\)/); // forwarded into clerkFetch RequestInit
  });

  it("B2.3 — uploadFile distinguishes AbortError (cancelled) from generic error", () => {
    // The catch block checks `abortController.signal.aborted` and sets state
    // to "cancelled" instead of "error", returns `cancelled: true`, and
    // records `upload_cancelled` (NOT upload_failed).
    expect(source).toMatch(
      /abortController\.signal\.aborted[\s\S]{0,400}state:\s*"cancelled"[\s\S]{0,400}event:\s*"upload_cancelled"/
    );
  });

  it("B2.3 — cancel during extracting surfaces 'continues server-side' message", () => {
    // The user spec requires a clear message so the user understands the
    // server-side OCR may still complete. NEVER claim server-side deletion.
    expect(source).toMatch(/continuer côté serveur/);
  });

  it("Codex B2.3.1 P1 — handleCancel pre-upload mid-batch calls settleCancelled BEFORE removeFile", () => {
    // The bug: cancelling a validated file mid-batch only called removeFile,
    // leaving batch.pendingIds() containing the id. The for-loop arrived,
    // uploadFile found the sidecar gone, logged upload_failed.
    // Fix: check `batch.isInFlight() && batch.pendingIds().includes(item.id)`,
    // record upload_cancelled, dispatch state=cancelled, settleCancelled,
    // THEN removeFile.
    expect(source).toMatch(
      /batch\.isInFlight\(\)\s*&&\s*batch\.pendingIds\(\)\.includes\(item\.id\)[\s\S]{0,500}batch\.settleCancelled\(item\.id\)/
    );
  });

  it("Codex B2.3.1 P1 — handleUploadAll delegates to runBatchUploadLoop (skip cancelled-before-turn enforced)", () => {
    // The loop is extracted into a pure helper for testability. The helper
    // checks `batch.pendingIds().includes(item.id)` and skips items already
    // settled out-of-band (e.g. by cancel). Test in upload-batch-loop.test.ts
    // covers the [A uploaded, B cancelled before turn] scenario.
    expect(source).toMatch(
      /import\s+\{\s*runBatchUploadLoop\s*\}\s+from\s+["']@\/lib\/upload-batch-loop["']/
    );
    expect(source).toMatch(/await\s+runBatchUploadLoop\(readyItems,/);
  });

  it("Codex B2.3.1 P2 — encryptFileForServer accepts AbortSignal and checks abort at every await", () => {
    // SubtleCrypto can't be aborted natively. Best-effort: throw an
    // AbortError-shaped DOMException before each long-running step so a
    // user clicking cancel during encryption doesn't have to wait for the
    // full operation to finish.
    expect(source).toMatch(
      /async\s+function\s+encryptFileForServer\(\s*file:\s*File,\s*signal:\s*AbortSignal\s*\)/
    );
    expect(source).toMatch(/throwIfAborted\(signal\)/);
    expect(source).toMatch(/AbortError/);
  });

  it("B2.4 — `saved` state removed everywhere (state machine cleanup)", () => {
    // The spec says: soit utiliser réellement `saved`, soit le retirer.
    // We retired it. Any reintroduction must come with a real dispatch site.
    expect(source).not.toMatch(/['"]saved['"]/);
  });

  it("B2.4 — HTTP failures classified via classifyHttpError (no generic 'Upload failed' thrown)", () => {
    // parseUploadApiResponse throws UploadError with a category-bearing
    // classification. The old `Upload failed (${status})` string must be gone.
    expect(source).toMatch(
      /import\s+\{[\s\S]{0,200}UploadError[\s\S]{0,200}classifyHttpError[\s\S]{0,200}\}\s+from\s+["']@\/lib\/upload-error-classification["']/
    );
    expect(source).toMatch(/classifyHttpError\(response\.status,\s*rawBody\)/);
    expect(source).toMatch(/throw\s+new\s+UploadError\(/);
    expect(source).not.toMatch(/Upload failed \(\$\{response\.status\}\)/);
  });

  it("B2.4 — blob transfer failure wrapped as UploadError with category=blob_transfer", () => {
    expect(source).toMatch(/new\s+UploadError\(\s*["']blob_transfer["']/);
    expect(source).toMatch(/new\s+UploadError\(\s*["']blob_token["']/);
  });

  it("B2.4 — extraction poller failure uses classifyExtractionFailure (≠ upload failure)", () => {
    // Enqueue / extraction failures MUST be tagged extraction, never upload.
    // The classifier always returns category=extraction with an actionLabel
    // Réessayer.
    expect(source).toMatch(/classifyExtractionFailure\(lastSnapshot\?\.message/);
    expect(source).toMatch(/errorCategory:\s*extractionFailure\.category/);
  });

  it("B2.4 — uploadFile catch dispatches errorCategory + errorActionLabel + errorActionData", () => {
    // The dispatch payload at the catch site MUST include the structured
    // envelope so the UI can render duplicate cues, action labels, etc.
    expect(source).toMatch(
      /dispatch\(\{[\s\S]{0,400}state:\s*"error"[\s\S]{0,400}errorCategory:\s*classification\.category[\s\S]{0,400}errorActionLabel:\s*classification\.actionLabel[\s\S]{0,400}errorActionData:\s*classification\.actionData/
    );
  });

  it("B2.4 — duplicate UI renders the actionable cue (not just 'Upload failed')", () => {
    // The per-row error block surfaces errorCategory as a badge AND the
    // errorActionLabel as an "Action conseillée" line. Without this the
    // duplicate-doc path falls back to a generic red error.
    expect(source).toMatch(/item\.errorCategory[\s\S]{0,800}duplicate/);
    expect(source).toMatch(/Action conseillée[\s\S]{0,3000}item\.errorActionLabel/);
  });

  it("Codex B2.4.1 P1 — token-route errors preserve their HTTP classification (auth/blocked/etc.)", () => {
    // The /api/documents/upload/client route shares the same auth/quota/
    // business gates as the main upload. A 409 there must surface as
    // `blocked`, a 401 as `auth`, etc. — not silently as `blob_token`.
    // The fix preserves tokenClassification.category unless the classifier
    // returned `unknown` (which signals a real token-minting problem).
    expect(source).toMatch(
      /tokenClassification\.category\s*===\s*["']unknown["']\s*\?\s*["']blob_token["']\s*:\s*tokenClassification\.category/
    );
  });

  it("B3.2 — recovery wired (load on mount + save on change + restore_session dispatched)", () => {
    expect(source).toMatch(
      /import\s+\{[\s\S]{0,400}loadUploadSession[\s\S]{0,400}saveUploadSession[\s\S]{0,400}\}\s+from\s+["']@\/lib\/upload-session-storage["']/
    );
    expect(source).toMatch(/recoveryAttemptedRef[\s\S]{0,400}loadUploadSession\(dealId\)/);
    expect(source).toMatch(/dispatch\(\{\s*kind:\s*["']restore_session["']/);
  });

  it("B3.2 + B3.2.1 P1 — persistence includes pre-server states AND uploading; excludes extracting/completed/cancelled", () => {
    // Renamed from the obsolete B3.2 guard. After B3.2.1 the persistable
    // set EXPLICITLY includes `uploading` so refresh mid-transfer is
    // recoverable. Items past server-side handoff (`extracting`) or
    // terminal (`completed` / `cancelled`) stay excluded — B3.1 polling
    // or the server doc list handles those.
    expect(source).toMatch(
      /queue[\s\S]{0,200}\.filter\([\s\S]{0,1200}item\.state\s*===\s*["']selected["'][\s\S]{0,200}["']validating["'][\s\S]{0,200}["']validated["'][\s\S]{0,200}["']uploading["'][\s\S]{0,200}["']error["']/
    );
    expect(source).toMatch(/saveUploadSession\(dealId,\s*instrumentation\.sessionId,\s*persistable\)/);
  });

  it("B3.2 — re-selection wired (hidden input + button + attach_file_to_item)", () => {
    expect(source).toMatch(/reselectInputRef[\s\S]{0,200}HTMLInputElement/);
    expect(source).toMatch(/handleReselectAttach[\s\S]{0,1500}filesByIdRef\.current\.set\(itemId,\s*file\)/);
    expect(source).toMatch(/dispatch\(\{\s*kind:\s*["']attach_file_to_item["']/);
    expect(source).toMatch(/triggerReselectFor\(item\.id\)/);
  });

  it("B3.2 — needsReselect items: visual cue + retry gated until file attached", () => {
    // Restored items show muted/amber until re-attached. The B2.2 retry
    // button must be gated on `!item.needsReselect` so user can't retry
    // a row that has no File yet.
    expect(source).toMatch(/item\.needsReselect[\s\S]{0,200}border-amber-300/);
    expect(source).toMatch(/item\.state\s*===\s*["']error["']\s*&&\s*!item\.needsReselect/);
  });

  it("Codex B3.2.1 P1 — startValidationForItem helper reused by onDrop AND handleReselectAttach", () => {
    // Was inlined twice → reselect path forgot to trigger validation, items
    // got stuck in 'selected' forever. The shared helper enforces one path.
    expect(source).toMatch(/const\s+startValidationForItem\s*=\s*useCallback\(/);
    expect(source).toMatch(/items\.forEach\(\(item\)\s*=>\s*\{\s*startValidationForItem\(item\)/);
    expect(source).toMatch(/startValidationForItem\(refreshedItem\)/);
  });

  it("Codex B3.2.1 P1 — uploading state IS persisted (refresh mid-transfer recovery)", () => {
    // Without this, a page refresh during the upload transfer (before
    // the server creates the Document) would leave NO local item to
    // re-select AND NO server-side PROCESSING doc for B3.1 polling.
    expect(source).toMatch(
      /persistable[\s\S]{0,200}\.filter\([\s\S]{0,1000}item\.state\s*===\s*["']uploading["']/
    );
  });

  it("Codex B3.2.1 P2 — reselect mismatch carries refreshedMetadata + dispatches it", () => {
    // Stale snapshot would otherwise drive validation (size cap) + upload-
    // route choice (server vs blob). The reducer now applies the
    // refreshedMetadata so subsequent code sees the REAL file.
    expect(source).toMatch(/refreshedMetadata\s*=\s*\(nameMismatch\s*\|\|\s*sizeMismatch\)/);
    expect(source).toMatch(/dispatch\(\{\s*kind:\s*["']attach_file_to_item["'],\s*id:\s*itemId,\s*refreshedMetadata\s*\}\)/);
  });

  it("Codex B2.4.1 P2 — errorActionData is wired to a Button, not just text", () => {
    // The classifier emits actionData for actionable errors (today: duplicate).
    // Without a real button + callback prop, "Voir le document existant"
    // was just a label the user couldn't click.
    expect(source).toMatch(/onViewExistingDocument\?:\s*\(/);
    expect(source).toMatch(
      /actionData\?\.kind\s*===\s*["']view_existing_document["'][\s\S]{0,1000}onViewExistingDocument\(/
    );
    expect(source).toMatch(/Button[\s\S]{0,800}onClick=\{[\s\S]{0,400}onViewExistingDocument\(\{/);
  });
});
