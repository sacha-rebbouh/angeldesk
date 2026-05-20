/**
 * Phase B3.1 — Document polling derivation.
 *
 * Returns the sorted list of document ids that are NOT yet in a terminal
 * state from the server's point of view, i.e. the ids the Documents tab
 * should poll on `/api/documents/[id]` until they settle. Pure helper so
 * the "PROCESSING + PENDING are polled, COMPLETED + FAILED are not" rule
 * is unit-testable without React.
 *
 * Why include PENDING:
 *   - PENDING = Inngest hasn't picked the extraction up yet. Without
 *     polling, a PENDING that transitions to PROCESSING (then COMPLETED)
 *     stays as PENDING in the UI forever, until another mutation refetches
 *     the deal payload.
 *   - PROCESSING = the durable extraction is actively running.
 *
 * Why exclude FAILED:
 *   - FAILED is terminal. The user must explicitly hit retry (which calls
 *     POST /api/documents/[id]/process) — automatic polling on FAILED
 *     would never observe a transition without a server-side change.
 */

export type DocumentPollableStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | string;

export interface DocumentPollingInput {
  id: string;
  processingStatus: DocumentPollableStatus;
}

/** Statuses that warrant repeated polling. */
const NON_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["PENDING", "PROCESSING"]);

/**
 * Returns a stable, sorted (lex by id) list of polling-eligible document
 * ids. Empty input → empty array. Deterministic ordering matters because
 * the consumer uses `.join("|")` as a useEffect dependency key — stability
 * avoids spawning a fresh poller every render.
 */
export function derivePollingDocumentIds(docs: readonly DocumentPollingInput[]): string[] {
  return docs
    .filter((doc) => NON_TERMINAL_STATUSES.has(doc.processingStatus))
    .map((doc) => doc.id)
    .sort();
}

/**
 * Whether a snapshot represents a terminal state. Used by the polling
 * tick to decide whether to fire the "transition" handlers and stop
 * watching this doc.
 */
export function isTerminalDocumentStatus(status: DocumentPollableStatus): boolean {
  return !NON_TERMINAL_STATUSES.has(status);
}
