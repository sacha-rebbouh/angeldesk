import type {
  FrameworkLens,
  NormalizedThesisEvaluation,
  ThesisAxisEvaluation,
  ThesisAxisKey,
  ThesisExtractorOutput,
  ThesisVerdict,
} from "@/agents/thesis/types";
import { THESIS_VERDICT_ORDER, worstVerdict } from "@/agents/thesis/types";

type MinimalThesisInput = Pick<
  ThesisExtractorOutput,
  | "verdict"
  | "confidence"
  | "ycLens"
  | "thielLens"
  | "angelDeskLens"
>;

const AXIS_META: Record<ThesisAxisKey, { label: string }> = {
  thesis_quality: { label: "Thesis Quality" },
  investor_profile_fit: { label: "Investor Profile Fit" },
  deal_accessibility: { label: "Deal Accessibility" },
};

const PREFIX_BY_AXIS: Record<ThesisAxisKey, string[]> = {
  thesis_quality: ["[THESIS QUALITY]"],
  investor_profile_fit: ["[INVESTOR PROFILE FIT]"],
  deal_accessibility: ["[DEAL ACCESSIBILITY]"],
};

const FIT_KEYWORDS = [
  "family office",
  "ba solo",
  "groupe d'angels",
  "syndicate",
  "syndicat",
  "profil investisseur",
  "fit investisseur",
  "hors mandat",
  "mandat",
  "exclusions du ba",
  "preferences investisseur",
];

const ACCESSIBILITY_KEYWORDS = [
  "ticket",
  "allocation",
  "instrument",
  "dilution",
  "liquidite",
  "liquidity",
  "horizon",
  "safe",
  "convertible",
  "liquidation preference",
  "drag-along",
  "pro-rata",
  "minimum",
  "capex",
];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripAxisPrefixes(value: string): string {
  let cleaned = value.trim();
  for (const prefixes of Object.values(PREFIX_BY_AXIS)) {
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim();
      }
    }
  }
  return cleaned;
}

function includesKeyword(value: string, keywords: string[]): boolean {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function collectAxisItems(
  values: string[],
  axis: ThesisAxisKey
): string[] {
  const explicitPrefixes = PREFIX_BY_AXIS[axis];

  return values
    .filter((value) => {
      const normalized = normalizeText(value);
      if (explicitPrefixes.some((prefix) => normalized.startsWith(prefix))) {
        return true;
      }
      if (axis === "investor_profile_fit") {
        return includesKeyword(normalized, FIT_KEYWORDS);
      }
      if (axis === "deal_accessibility") {
        return includesKeyword(normalized, ACCESSIBILITY_KEYWORDS);
      }
      return !includesKeyword(normalized, FIT_KEYWORDS) && !includesKeyword(normalized, ACCESSIBILITY_KEYWORDS);
    })
    .map(stripAxisPrefixes);
}

function collectAxisClaimTexts(
  lens: FrameworkLens,
  axis: ThesisAxisKey
): string[] {
  return collectAxisItems(lens.claims.map((claim) => claim.claim), axis);
}

function deriveSignalVerdict(
  failureCount: number,
  strengthCount: number,
  fallback: ThesisVerdict
): ThesisVerdict {
  if (failureCount >= 3 && failureCount > strengthCount) return "alert_dominant";
  if (failureCount >= 2 && failureCount > strengthCount) return "vigilance";
  if (failureCount >= 1 && strengthCount === 0) return "contrasted";
  if (strengthCount >= 3 && failureCount === 0) return "very_favorable";
  if (strengthCount >= 1 && failureCount === 0) return "favorable";
  return fallback;
}

function pickSummary(
  summaries: string[],
  fallback: string
): string {
  const firstMeaningful = summaries
    .map((summary) => stripAxisPrefixes(summary))
    .find((summary) => summary.length > 0);
  return firstMeaningful ?? fallback;
}

export function normalizeThesisEvaluation(
  thesis: MinimalThesisInput
): NormalizedThesisEvaluation {
  const qualityFailures = [
    ...collectAxisItems(thesis.ycLens.failures, "thesis_quality"),
    ...collectAxisItems(thesis.thielLens.failures, "thesis_quality"),
    ...collectAxisItems(thesis.angelDeskLens.failures, "thesis_quality"),
  ];
  const qualityStrengths = [
    ...collectAxisItems(thesis.ycLens.strengths, "thesis_quality"),
    ...collectAxisItems(thesis.thielLens.strengths, "thesis_quality"),
    ...collectAxisItems(thesis.angelDeskLens.strengths, "thesis_quality"),
  ];
  const qualityClaims = [
    ...collectAxisClaimTexts(thesis.ycLens, "thesis_quality"),
    ...collectAxisClaimTexts(thesis.thielLens, "thesis_quality"),
    ...collectAxisClaimTexts(thesis.angelDeskLens, "thesis_quality"),
  ];

  const fitFailures = collectAxisItems(thesis.angelDeskLens.failures, "investor_profile_fit");
  const fitStrengths = collectAxisItems(thesis.angelDeskLens.strengths, "investor_profile_fit");
  const fitClaims = collectAxisClaimTexts(thesis.angelDeskLens, "investor_profile_fit");

  const accessibilityFailures = collectAxisItems(thesis.angelDeskLens.failures, "deal_accessibility");
  const accessibilityStrengths = collectAxisItems(thesis.angelDeskLens.strengths, "deal_accessibility");
  const accessibilityClaims = collectAxisClaimTexts(thesis.angelDeskLens, "deal_accessibility");

  return {
    thesisQuality: {
      key: "thesis_quality",
      label: AXIS_META.thesis_quality.label,
      verdict: worstVerdict([thesis.verdict, thesis.ycLens.verdict, thesis.thielLens.verdict]),
      confidence: Math.round((thesis.confidence + thesis.ycLens.confidence + thesis.thielLens.confidence) / 3),
      summary: pickSummary(
        [thesis.ycLens.summary, thesis.thielLens.summary, thesis.angelDeskLens.summary],
        "La qualite intrinseque de la these doit etre lue a partir des hypotheses structurelles et de leur executabilite."
      ),
      strengths: qualityStrengths,
      failures: qualityFailures,
      claims: qualityClaims,
      sourceFrameworks: ["yc", "thiel", "angel-desk"],
    },
    investorProfileFit: {
      key: "investor_profile_fit",
      label: AXIS_META.investor_profile_fit.label,
      verdict: deriveSignalVerdict(fitFailures.length, fitStrengths.length, "contrasted"),
      confidence: thesis.angelDeskLens.confidence,
      summary: pickSummary(
        fitClaims.length > 0 ? fitClaims : [thesis.angelDeskLens.summary],
        "Le fit investisseur doit decrire quels profils prives sont compatibles ou non, sans polluer le jugement sur la these."
      ),
      strengths: fitStrengths,
      failures: fitFailures,
      claims: fitClaims,
      sourceFrameworks: ["angel-desk"],
    },
    dealAccessibility: {
      key: "deal_accessibility",
      label: AXIS_META.deal_accessibility.label,
      verdict: deriveSignalVerdict(accessibilityFailures.length, accessibilityStrengths.length, "contrasted"),
      confidence: thesis.angelDeskLens.confidence,
      summary: pickSummary(
        accessibilityClaims.length > 0 ? accessibilityClaims : [thesis.angelDeskLens.summary],
        "L'accessibilite du deal couvre ticket, instrument, dilution, liquidite et horizon de sortie."
      ),
      strengths: accessibilityStrengths,
      failures: accessibilityFailures,
      claims: accessibilityClaims,
      sourceFrameworks: ["angel-desk"],
    },
  };
}

export function getMostSevereAxis(
  evaluation: NormalizedThesisEvaluation
): ThesisAxisEvaluation {
  const axes = [
    evaluation.thesisQuality,
    evaluation.investorProfileFit,
    evaluation.dealAccessibility,
  ];

  return axes.reduce((worst, current) => (
    THESIS_VERDICT_ORDER.indexOf(current.verdict) > THESIS_VERDICT_ORDER.indexOf(worst.verdict)
      ? current
      : worst
  ), axes[0]);
}
