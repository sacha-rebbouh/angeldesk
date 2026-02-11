/**
 * MEMO FACT ANCHORING - Pre-processeur deterministe (NO LLM) (F41)
 *
 * Extrait du fact store les donnees verifiees qui DOIVENT apparaitre dans le memo.
 * Le LLM ne peut PAS modifier ces chiffres, seulement les contextualiser.
 */

import type { CurrentFact } from "@/services/fact-store/types";

export interface AnchoredMemoData {
  verifiedMetrics: {
    key: string;
    displayValue: string;
    reliability: string;
    source: string;
    isProjection: boolean;
  }[];

  projections: {
    key: string;
    displayValue: string;
    projectionPercent?: number;
    warning: string;
  }[];

  unverifiable: {
    key: string;
    displayValue: string;
    reason: string;
  }[];

  financialSectionTemplate: string;
}

export function buildAnchoredMemoData(
  facts: CurrentFact[]
): AnchoredMemoData {
  const verifiedMetrics: AnchoredMemoData["verifiedMetrics"] = [];
  const projections: AnchoredMemoData["projections"] = [];
  const unverifiable: AnchoredMemoData["unverifiable"] = [];

  for (const fact of facts) {
    const reliability = fact.reliability?.reliability ?? "DECLARED";
    const isProjection = fact.reliability?.isProjection ?? false;

    if (reliability === "AUDITED" || reliability === "VERIFIED") {
      verifiedMetrics.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reliability,
        source: fact.currentSource,
        isProjection: false,
      });
    } else if (isProjection || reliability === "PROJECTED") {
      projections.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        projectionPercent: fact.reliability?.temporalAnalysis?.projectionPercent,
        warning: `Ce chiffre est une PROJECTION (fiabilite: ${reliability}). ${fact.reliability?.reasoning ?? ""}`,
      });
    } else if (reliability === "UNVERIFIABLE") {
      unverifiable.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reason: fact.reliability?.reasoning ?? "Source non verifiable",
      });
    } else {
      // DECLARED or ESTIMATED
      verifiedMetrics.push({
        key: fact.factKey,
        displayValue: fact.currentDisplayValue,
        reliability,
        source: fact.currentSource,
        isProjection,
      });
    }
  }

  // Generate financial section template with anchored figures
  const financialFacts = facts.filter(f => f.category === "FINANCIAL");
  const financialLines = financialFacts.map(f => {
    const rel = f.reliability?.reliability ?? "DECLARED";
    const marker = rel === "PROJECTED" ? " [PROJECTION]" : rel === "ESTIMATED" ? " [ESTIME]" : "";
    return `- ${f.factKey}: ${f.currentDisplayValue}${marker} (Source: ${f.currentSource}, Fiabilite: ${rel})`;
  });

  const financialSectionTemplate = financialLines.length > 0
    ? `## CHIFFRES ANCRES DU FACT STORE (NE PAS MODIFIER)\n${financialLines.join("\n")}`
    : "";

  return { verifiedMetrics, projections, unverifiable, financialSectionTemplate };
}
