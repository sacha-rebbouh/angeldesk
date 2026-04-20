export interface AnalysisScores {
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
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
