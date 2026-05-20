/**
 * Phase B3.1 — Static guards on documents-tab.tsx for PROCESSING/PENDING
 * polling, retry-extraction wiring, and badge label consistency.
 *
 * Component-level tests of the polling tick require JSDOM + clerkFetch
 * mocks (scope of B14). For B3.1 we lock the wire with grep + a pure
 * helper test (document-polling.test.ts) covering the derivation rule.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("documents-tab — B3.1 polling + retry wiring", () => {
  const source = readFileSync(
    join(__dirname, "..", "documents-tab.tsx"),
    "utf8"
  );

  it("B3.1 — uses derivePollingDocumentIds (PENDING + PROCESSING both polled)", () => {
    // PENDING was previously ignored. The pure helper enforces both.
    expect(source).toMatch(
      /import\s+\{[\s\S]{0,200}derivePollingDocumentIds[\s\S]{0,200}\}\s+from\s+["']@\/lib\/document-polling["']/
    );
    expect(source).toMatch(/derivePollingDocumentIds\(/);
    // The old hand-rolled filter on PROCESSING ONLY must be gone.
    expect(source).not.toMatch(/\.filter\(\s*\(\s*document\s*\)\s*=>\s*document\.processingStatus\s*===\s*["']PROCESSING["']\s*\)/);
  });

  it("B3.1 — handleRetryExtraction posts to /api/documents/[id]/process with optimistic state", () => {
    expect(source).toMatch(/const\s+handleRetryExtraction\s*=\s*useCallback\(/);
    expect(source).toMatch(
      /clerkFetch\(`\/api\/documents\/\$\{documentId\}\/process`,\s*\{\s*method:\s*["']POST["']/
    );
    // Optimistic local transition to PROCESSING before the request lands.
    expect(source).toMatch(/processingStatus:\s*["']PROCESSING["']/);
    // Revert on failure — captures previousStatus before the request so
    // the revert is independent of any other state change in flight.
    expect(source).toMatch(/processingStatus:\s*previousStatus/);
  });

  it("B3.1 — retry invalidates deal detail + evidenceHealth + readiness", () => {
    // Same triad as the existing mutations (B2.1/8.2) so the docs tab
    // stays in sync end-to-end after a retry.
    expect(source).toMatch(/handleRetryExtraction[\s\S]{0,2000}queryKeys\.deals\.detail\(dealId\)/);
    expect(source).toMatch(/handleRetryExtraction[\s\S]{0,2000}queryKeys\.evidenceHealth\.byDeal\(dealId\)/);
    expect(source).toMatch(/handleRetryExtraction[\s\S]{0,2000}deal-document-readiness/);
  });

  it("Codex B3.3.1 P1 — retry strictly gated: PDF + (FAILED || (PENDING && stale)); never PROCESSING; never non-PDF", () => {
    // The previous gate was too loose: PROCESSING retry was a silent no-op
    // (server 409, client B3.1.1 treats 409 as success), and non-PDF retry
    // was a guaranteed 400. The fix scopes the button strictly so the user
    // never gets a fake success.
    expect(source).toMatch(
      /doc\.mimeType\s*===\s*["']application\/pdf["']\s*&&[\s\S]{0,400}doc\.processingStatus\s*===\s*["']FAILED["']\s*\|\|[\s\S]{0,400}doc\.processingStatus\s*===\s*["']PENDING["']\s*&&[\s\S]{0,400}isDocumentStale\(/
    );
    // PROCESSING retry must NOT exist in the gate.
    expect(source).not.toMatch(
      /doc\.processingStatus\s*===\s*["']PROCESSING["']\s*&&[\s\S]{0,200}handleRetryExtraction/
    );
    // aria-label per-doc for SR.
    expect(source).toMatch(/aria-label=\{`Relancer l'extraction de \$\{doc\.name\}`\}/);
  });

  it("B3.1 — badge labels are user-facing French aligned with the modal", () => {
    // Aligned with the upload modal language so users don't see "Traitement..."
    // in one place and "Extraction en cours" in another.
    expect(source).toMatch(/["']Extraction en cours["']/);
    expect(source).toMatch(/["']Extraction échouée["']/);
    expect(source).toMatch(/["']En attente d'extraction["']/);
    expect(source).not.toMatch(/["']Traitement\.\.\.["']/);
  });

  it("Codex B3.1.1 P1 — retry concurrency guard (Set blocks double-click race)", () => {
    // The set is consulted both for the synchronous bail (early return in
    // handleRetryExtraction) AND for the button's disabled attribute. The
    // race fixed here: double-click → req A wins, req B gets 409 → req B's
    // catch was reverting local to FAILED while server is actually
    // PROCESSING.
    expect(source).toMatch(/retryingDocumentIds[\s\S]{0,200}useState<ReadonlySet<string>>/);
    expect(source).toMatch(/if\s*\(\s*retryingDocumentIds\.has\(documentId\)\s*\)\s*return/);
    expect(source).toMatch(/disabled=\{retryingDocumentIds\.has\(doc\.id\)\}/);
  });

  it("Codex B3.1.1 P1 — 409 from /process is treated as success, NOT revert", () => {
    // 409 = server already has the doc in a running run. Our optimistic
    // PROCESSING is correct, so we just refetch instead of reverting.
    expect(source).toMatch(
      /response\.status\s*===\s*409[\s\S]{0,400}invalidateAfterRetry\(\)/
    );
  });

  it("Codex B3.1.1 P2 — poller uses isTerminalDocumentStatus (not !== PROCESSING)", () => {
    // The old predicate matched PENDING as "terminal", firing a fake
    // transition every tick. The helper enforces the real rule.
    expect(source).toMatch(
      /import\s+\{[\s\S]{0,200}isTerminalDocumentStatus[\s\S]{0,200}\}\s+from\s+["']@\/lib\/document-polling["']/
    );
    expect(source).toMatch(
      /isTerminalDocumentStatus\(document\.processingStatus\)/
    );
    // The old check must be gone.
    expect(source).not.toMatch(/document\.processingStatus\s*!==\s*["']PROCESSING["']/);
  });

  it("Codex B3.3.2 P1 — client distinguishes 409 reasons (only already_processing = success)", () => {
    // The previous code treated ALL 409s as success — masked real errors
    // (not_stale, analysis_running, wrong_status). Fix: parse the body
    // and only short-circuit when reason === "already_processing".
    expect(source).toMatch(
      /response\.status\s*===\s*409[\s\S]{0,800}body\.reason\s*===\s*["']already_processing["'][\s\S]{0,200}invalidateAfterRetry\(\)/
    );
    // Other 409 reasons MUST revert the optimistic state + toast.
    expect(source).toMatch(
      /response\.status\s*===\s*409[\s\S]{0,2000}setLocalDocuments\([\s\S]{0,400}previousStatus[\s\S]{0,400}toast\.error/
    );
  });

  it("B3.3 — staleness helper imported + 'Bloqué depuis' badge rendered", () => {
    // The badge is informational and shows for ALL stale PROCESSING/PENDING
    // (PDF or not). The retry BUTTON is gated separately (PDF + PENDING
    // only — see the B3.3.1 guard) to avoid silent no-ops.
    expect(source).toMatch(
      /import\s+\{[\s\S]{0,200}isDocumentStale[\s\S]{0,200}\}\s+from\s+["']@\/lib\/document-staleness["']/
    );
    expect(source).toMatch(/Bloqué depuis/);
  });
});
