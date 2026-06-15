export interface CanonicalExtractedInfo {
  sector: string | null;
  stage: string | null;
  instrument: string | null;
  geography: string | null;
  description: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Pure, deterministic extraction of the canonical "extracted info" (sector, stage,
 * instrument, geography, description) from an analysis `results` map. Returns null
 * when no field could be resolved. Used by the denormalized read-model
 * (AnalysisSignalSummary) without a cycle.
 */
export function extractCanonicalExtractedInfo(
  results: unknown
): CanonicalExtractedInfo | null {
  if (!isRecord(results)) {
    return null;
  }

  const extractor = results["document-extractor"];
  if (!isRecord(extractor) || extractor.success !== true || !isRecord(extractor.data)) {
    return null;
  }

  const extractedInfo = extractor.data.extractedInfo;
  if (!isRecord(extractedInfo)) {
    return null;
  }

  const canonicalInfo: CanonicalExtractedInfo = {
    sector: readString(extractedInfo.sector),
    stage: readString(extractedInfo.stage),
    instrument: readString(extractedInfo.instrument),
    geography: readString(extractedInfo.geography),
    description:
      readString(extractedInfo.tagline) ??
      readString(extractedInfo.productDescription),
  };

  return Object.values(canonicalInfo).some((value) => value != null)
    ? canonicalInfo
    : null;
}
