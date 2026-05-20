import { createHash } from "crypto";
import type { EvidenceSignalKind } from "@prisma/client";
import { canonicalJSONStringify } from "./canonical-json";

export interface SignalHashInput {
  extractorVersion: string;
  kind: EvidenceSignalKind;
  valueJson: unknown;
  evidenceText: string | null;
  pageNumber: number | null;
  sheetName: string | null;
  charOffset: number | null;
}

/**
 * Deterministic signal hash used as the unique-key tail in
 * @@unique([documentId, documentVersion, signalScopeKey, kind, signalHash]).
 *
 * The hash is computed on the PLAINTEXT canonical form BEFORE encryption.
 *
 * Encoding rules:
 *  - parts are wrapped in a canonical JSON array (NOT join('|')) to avoid
 *    delimiter ambiguity if a string part ever contains '|'.
 *  - text values (evidenceText, sheetName) are trimmed + NFC normalized.
 *  - valueJson goes through canonicalJSONStringify (sorted keys + NFC on
 *    string values).
 *  - extractorVersion is included so a parser upgrade produces a distinct hash.
 *  - sourceTextHash is NOT included (redundant with evidenceText).
 */
export function computeSignalHash(input: SignalHashInput): string {
  const parts: unknown[] = [
    input.extractorVersion,
    input.kind,
    canonicalJSONStringify(input.valueJson),
    (input.evidenceText ?? "").trim().normalize("NFC"),
    input.pageNumber,
    (input.sheetName ?? "").trim().normalize("NFC") || null,
    input.charOffset,
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
