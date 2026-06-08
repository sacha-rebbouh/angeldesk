// Modèle de progression partagé entre le tracker inline (analysis-progress.tsx) et
// l'overlay « analyse en cours » (analysis-running-overlay.tsx). Source UNIQUE des seuils
// d'agents → étape courante, pour éviter toute dérive entre les deux surfaces.

export type AnalysisProgressType = "tier1_complete" | "full_analysis";

export interface ProgressStep {
  id: string;
  label: string;
  /** Seuil cumulé d'agents : l'étape est terminée quand completedAgents >= threshold. */
  threshold: number;
}

// Seuils reflétant la sémantique runtime thesis-first affichée dans l'UI :
// corpus T0 -> these -> analyse approfondie -> expertise sectorielle -> synthese.
const STEP_THRESHOLDS_PRO = {
  corpus: 2, // fact-extractor + document-extractor
  thesis: 3, // + thesis-extractor
  tier1: 16, // + 13 Tier1 agents
  tier2: 17, // + 1 sector expert
  tier3: 24, // + 7 Tier3 agents incl. thesis-reconciler
} as const;

const STEP_THRESHOLDS_FREE = {
  corpus: 2, // fact-extractor + document-extractor
  investigation: 15, // + 13 Tier1 agents
  scoring: 16, // legacy scoring/finalisation step
} as const;

export function getProgressSteps(analysisType: AnalysisProgressType): ProgressStep[] {
  if (analysisType === "tier1_complete") {
    return [
      { id: "corpus", label: "Construction du corpus T0", threshold: STEP_THRESHOLDS_FREE.corpus },
      { id: "investigation", label: "Analyse initiale", threshold: STEP_THRESHOLDS_FREE.investigation },
      { id: "scoring", label: "Cloture & scoring", threshold: STEP_THRESHOLDS_FREE.scoring },
    ];
  }

  return [
    { id: "corpus", label: "Construction du corpus T0", threshold: STEP_THRESHOLDS_PRO.corpus },
    { id: "thesis", label: "These d'investissement", threshold: STEP_THRESHOLDS_PRO.thesis },
    { id: "tier1", label: "Analyse approfondie", threshold: STEP_THRESHOLDS_PRO.tier1 },
    { id: "tier2", label: "Expertise sectorielle", threshold: STEP_THRESHOLDS_PRO.tier2 },
    { id: "tier3", label: "Synthese finale", threshold: STEP_THRESHOLDS_PRO.tier3 },
  ];
}

/**
 * Étape en cours déduite du nombre d'agents complétés : la 1ʳᵉ étape pas encore franchie
 * (completedAgents < threshold). Si tous les seuils sont franchis, on reste sur la dernière.
 */
export function getCurrentStepLabel(
  completedAgents: number,
  analysisType: AnalysisProgressType,
): string {
  const steps = getProgressSteps(analysisType);
  for (const step of steps) {
    if (completedAgents < step.threshold) return step.label;
  }
  return steps[steps.length - 1].label;
}
