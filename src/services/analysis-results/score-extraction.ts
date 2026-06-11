export interface AnalysisScores {
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
}

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
 * when no field could be resolved. Lives here next to extractAnalysisScores so the
 * denormalized read-model (AnalysisSignalSummary) can reuse it without a cycle.
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

function normalizeDimensionLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function extractAnalysisScores(results: unknown): AnalysisScores {
  const scorer = (results as Record<string, unknown> | null | undefined)?.[
    "synthesis-deal-scorer"
  ] as
    | {
        success?: boolean;
        data?: {
          overallScore?: number;
          score?: { value?: number };
          dimensionScores?: Array<{
            dimension?: string | null;
            score?: number | null;
          }>;
        };
      }
    | undefined;

  if (!scorer?.success || !scorer.data) {
    return {
      globalScore: null,
      teamScore: null,
      marketScore: null,
      productScore: null,
      financialsScore: null,
    };
  }

  const scores: AnalysisScores = {
    globalScore: scorer.data.overallScore ?? scorer.data.score?.value ?? null,
    teamScore: null,
    marketScore: null,
    productScore: null,
    financialsScore: null,
  };

  for (const dimension of scorer.data.dimensionScores ?? []) {
    const label = normalizeDimensionLabel(dimension.dimension);
    const value = dimension.score ?? null;

    if (value == null) {
      continue;
    }

    if (label.includes("team") || label.includes("equipe")) {
      scores.teamScore = value;
      continue;
    }

    if (label.includes("market") || label.includes("marche")) {
      scores.marketScore = value;
      continue;
    }

    if (
      label.includes("product") ||
      label.includes("produit") ||
      label.includes("tech")
    ) {
      scores.productScore = value;
      continue;
    }

    if (label.includes("financial") || label.includes("financ")) {
      scores.financialsScore = value;
    }
  }

  return scores;
}
