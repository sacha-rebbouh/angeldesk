import type {
  FrameworkClaim,
  FrameworkLens,
  FrameworkLensAvailability,
  ThesisAxisEvaluation,
} from "./types";
import {
  isFrameworkLensEvaluated,
  isThesisAxisUnavailable,
} from "./types";

export function formatFrameworkVerdictToken(
  name: string,
  lens: { verdict: string; availability?: FrameworkLensAvailability | null }
): string {
  return isFrameworkLensEvaluated(lens)
    ? `${name}=${lens.verdict}`
    : `${name}=indisponible`;
}

export function formatAxisVerdictToken(
  name: string,
  axis: { verdict: string; sourceFrameworks: ThesisAxisEvaluation["sourceFrameworks"] }
): string {
  return isThesisAxisUnavailable(axis)
    ? `${name}=indisponible`
    : `${name}=${axis.verdict}`;
}

export function formatAxisPromptLine(
  label: string,
  axis: { verdict: string; summary: string; sourceFrameworks: ThesisAxisEvaluation["sourceFrameworks"] }
): string {
  return isThesisAxisUnavailable(axis)
    ? `- **${label}** : indisponible (incident systeme, ignorer comme signal metier)\n`
    : `- **${label}** : ${axis.verdict} — ${axis.summary}\n`;
}

export function formatFrameworkPromptLine(
  label: string,
  lens: { verdict: string; availability?: FrameworkLensAvailability | null }
): string {
  return isFrameworkLensEvaluated(lens)
    ? `- **${label}** : ${lens.verdict}`
    : `- **${label}** : indisponible`;
}

export function formatDetailedFrameworkSection(
  name: string,
  lens: {
    availability?: FrameworkLensAvailability | null;
    verdict: string;
    confidence: number;
    summary: string;
    failures: string[];
    strengths: string[];
  }
): string {
  if (!isFrameworkLensEvaluated(lens)) {
    return `#### ${name}\n- Evaluation indisponible (incident systeme, pas un signal metier)\n`;
  }

  let section = `#### ${name}\n`;
  section += `- Verdict : ${lens.verdict} (confiance ${lens.confidence}/100)\n`;
  section += `- Synthese : ${lens.summary}\n`;
  if (lens.strengths.length > 0) {
    section += `- Points d'adherence :\n${lens.strengths.map((s) => `  - ${s}`).join("\n")}\n`;
  }
  if (lens.failures.length > 0) {
    section += `- Points de fragilite :\n${lens.failures.map((f) => `  - ${f}`).join("\n")}\n`;
  }
  return section;
}

export function formatReconcilerLensSection(
  name: string,
  lens: {
    availability?: FrameworkLensAvailability | null;
    summary: string;
    claims: FrameworkClaim[];
  }
): string {
  if (!isFrameworkLensEvaluated(lens)) {
    return `**${name}:** indisponible — ignorer dans la reconciliation\n`;
  }

  const claims = lens.claims.map((claim) => `${claim.claim} (${claim.status})`).join(" | ");
  return `**${name}:** ${lens.summary}\nClaims: ${claims}\n`;
}
