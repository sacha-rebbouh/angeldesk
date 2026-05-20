/**
 * Phase B3.1 — Document polling derivation unit tests.
 *
 * Closes the "doc PROCESSING au load → polling" + "doc PENDING au load →
 * polling" contracts from the user spec.
 */
import { describe, expect, it } from "vitest";
import {
  derivePollingDocumentIds,
  isTerminalDocumentStatus,
  type DocumentPollingInput,
} from "../document-polling";

const mk = (id: string, status: string): DocumentPollingInput => ({
  id,
  processingStatus: status,
});

describe("derivePollingDocumentIds", () => {
  it("liste vide → liste vide", () => {
    expect(derivePollingDocumentIds([])).toEqual([]);
  });

  it("PROCESSING uniquement → polled", () => {
    expect(derivePollingDocumentIds([mk("a", "PROCESSING")])).toEqual(["a"]);
  });

  it("B3.1 — PENDING uniquement → polled (Inngest pas encore picked up)", () => {
    expect(derivePollingDocumentIds([mk("a", "PENDING")])).toEqual(["a"]);
  });

  it("mix PROCESSING + PENDING → tous polled, ordre lex", () => {
    expect(
      derivePollingDocumentIds([mk("z", "PROCESSING"), mk("a", "PENDING"), mk("m", "PROCESSING")])
    ).toEqual(["a", "m", "z"]);
  });

  it("COMPLETED ignoré (terminal)", () => {
    expect(derivePollingDocumentIds([mk("a", "COMPLETED")])).toEqual([]);
  });

  it("FAILED ignoré (terminal — retry est explicite, pas polling)", () => {
    expect(derivePollingDocumentIds([mk("a", "FAILED")])).toEqual([]);
  });

  it("statut inconnu ignoré (default to terminal)", () => {
    expect(derivePollingDocumentIds([mk("a", "WEIRD")])).toEqual([]);
  });

  it("mix complet : seuls PROCESSING + PENDING gardés", () => {
    expect(
      derivePollingDocumentIds([
        mk("a", "COMPLETED"),
        mk("b", "PROCESSING"),
        mk("c", "FAILED"),
        mk("d", "PENDING"),
      ])
    ).toEqual(["b", "d"]);
  });

  it("retourne un id stable : 2 appels avec mêmes inputs → mêmes outputs", () => {
    const input: DocumentPollingInput[] = [mk("c", "PROCESSING"), mk("a", "PENDING")];
    const first = derivePollingDocumentIds(input);
    const second = derivePollingDocumentIds(input);
    expect(first).toEqual(second);
    expect(first.join("|")).toBe(second.join("|"));
  });
});

describe("isTerminalDocumentStatus", () => {
  it("PROCESSING / PENDING → false", () => {
    expect(isTerminalDocumentStatus("PROCESSING")).toBe(false);
    expect(isTerminalDocumentStatus("PENDING")).toBe(false);
  });

  it("COMPLETED / FAILED → true", () => {
    expect(isTerminalDocumentStatus("COMPLETED")).toBe(true);
    expect(isTerminalDocumentStatus("FAILED")).toBe(true);
  });

  it("statut inconnu → true (défensif — on arrête de poller)", () => {
    expect(isTerminalDocumentStatus("WEIRD")).toBe(true);
  });
});
