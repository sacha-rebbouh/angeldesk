import { NextResponse } from "next/server";

import type { CorpusNotReadyError } from "@/services/documents/readiness-gate";

/**
 * HTTP-layer helper: converts a CorpusNotReadyError into a 409 NextResponse.
 * Lives in src/lib/api/ (not in readiness-gate.ts) so that background jobs,
 * webhooks, live flows can import the gate helpers without pulling
 * next/server into their bundle.
 */
export function corpusNotReadyResponse(error: CorpusNotReadyError) {
  return NextResponse.json(
    {
      error: "Corpus extraction not ready for this deal",
      reasonCode: error.reasonCode,
      documentReadiness: error.readiness,
      snapshotDetail: error.snapshotDetail,
    },
    { status: 409 }
  );
}
