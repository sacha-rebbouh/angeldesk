/**
 * Phase A slice A6 — Service Evidence Solidity minimal (D2 verrouillé).
 *
 * Calcule de façon DÉTERMINISTE la `evidenceSolidity` d'un dossier Tier 3.
 * Phase A se limite à `contradictory` / `insufficient` / `null`. Aucune
 * fabrication depuis score / confidence / overallScore / confidenceLevel.
 *
 * Inputs strictement bornés (cf. source-guard test anti-fabrication) :
 * - Signaux déterministes EvidenceLedger.coverage :
 *   - `factCount` : nombre de facts extraits du factStore
 *   - `documentArtifactCount` : nombre d'artefacts documentaires extraits
 *   - `lowReliabilityFactCount` : facts en DECLARED/PROJECTED/ESTIMATED/
 *     UNVERIFIABLE (signal que la base de preuves est non vérifiée)
 *   - `extractionWarningCount` : nombre d'avertissements d'extraction
 * - Signaux cross-agent (contradictions du Tier 3 contradiction-detector) :
 *   - `criticalContradictionCount` : nombre de contradictions CRITICAL
 *   - `highContradictionCount` : nombre de contradictions HIGH
 *
 * Règles métier A6 (déterministes, conservatrices) :
 *
 *   1. `criticalContradictionCount >= 2` ou
 *      (`criticalContradictionCount >= 1 && highContradictionCount >= 2`)
 *      → `contradictory` (contradictions exploitables suffisantes)
 *
 *   2. Données manquantes :
 *      - `factCount + documentArtifactCount === 0` → `insufficient`
 *      - `factCount >= 1 && lowReliabilityFactCount === factCount`
 *        → `insufficient` (tous les facts sont en bas de la pyramide
 *        reliability — base de preuves non vérifiée)
 *      - `extractionWarningCount >= 5 && factCount < 3`
 *        → `insufficient` (signal extraction dégradée massive vs corpus
 *        de facts trop limité)
 *
 *   3. Sinon → `null` (pas qualifiable en A6 — strong/moderate/low
 *      différés à un slice ultérieur cf. plan v12)
 *
 * NE LIT PAS et NE DEVRA JAMAIS LIRE : `score`, `overallScore`,
 * `confidence`, `confidenceLevel`. Verrouillé mécaniquement par
 * `__tests__/no-confidence-input.guard.test.ts`.
 *
 * Asymétrie API :
 * - `computeEvidenceSolidity` : fonction pure prenant des inputs typés.
 * - `buildEvidenceSolidityForContext` : helper qui extrait les inputs
 *   depuis le `EnrichedAgentContext` (evidenceLedger + previousResults)
 *   et délègue à `computeEvidenceSolidity`. Renvoie `{value: null,
 *   rationale: null}` si le contexte ne fournit aucun signal exploitable.
 *
 * Override pour Contradiction Detector :
 * CD lui-même est l'auteur des contradictions consommées par le service.
 * Il fournit ses propres counts via `selfContradictionsOverride` pour
 * éviter une lecture circulaire de `previousResults["contradiction-detector"]`
 * (qui serait absent dans son propre run).
 */

import type { EnrichedAgentContext } from "@/agents/types";

/**
 * Valeurs émissibles de evidenceSolidity en Phase A (D2 verrouillé).
 * `strong` / `moderate` / `low` ne sont PAS émissibles en Phase A.
 */
export type EvidenceSolidityEmitted = "contradictory" | "insufficient";

export interface EvidenceSolidityResult {
  value: EvidenceSolidityEmitted | null;
  /** Rationale doctrinale. `null` quand value === null. Non-vide sinon. */
  rationale: string | null;
}

export interface EvidenceSolidityInputs {
  // Depuis `EvidenceLedger.coverage`
  factCount: number;
  documentArtifactCount: number;
  lowReliabilityFactCount: number;
  extractionWarningCount: number;
  // Depuis `previousResults["contradiction-detector"].findings.contradictions`
  // (ou override local pour Contradiction Detector lui-même).
  criticalContradictionCount: number;
  highContradictionCount: number;
}

/**
 * Calcule `evidenceSolidity` depuis des inputs déterministes (fonction pure).
 *
 * D2 verrouillé : retourne uniquement `contradictory`, `insufficient`, ou `null`.
 */
export function computeEvidenceSolidity(input: EvidenceSolidityInputs): EvidenceSolidityResult {
  const {
    factCount,
    documentArtifactCount,
    lowReliabilityFactCount,
    extractionWarningCount,
    criticalContradictionCount,
    highContradictionCount,
  } = input;

  // Règle 1 : contradictions exploitables.
  if (criticalContradictionCount >= 2) {
    return {
      value: "contradictory",
      rationale: `${criticalContradictionCount} contradictions CRITICAL détectées entre les sources de preuves disponibles.`,
    };
  }
  if (criticalContradictionCount >= 1 && highContradictionCount >= 2) {
    return {
      value: "contradictory",
      rationale: `1 contradiction CRITICAL + ${highContradictionCount} contradictions HIGH détectées entre les sources.`,
    };
  }

  // Règle 2 : base de preuves insuffisante.
  if (factCount + documentArtifactCount === 0) {
    return {
      value: "insufficient",
      rationale: "Aucun fact extrait ni artefact documentaire n'est disponible dans le ledger de preuves.",
    };
  }
  if (factCount >= 1 && lowReliabilityFactCount === factCount) {
    return {
      value: "insufficient",
      rationale: `Tous les facts disponibles (${factCount}) sont classés DECLARED / PROJECTED / ESTIMATED / UNVERIFIABLE — pas de preuve auditée ou vérifiée.`,
    };
  }
  if (extractionWarningCount >= 5 && factCount < 3) {
    return {
      value: "insufficient",
      rationale: `${extractionWarningCount} avertissements d'extraction documentaire pour seulement ${factCount} fact${factCount > 1 ? "s" : ""} exploitable${factCount > 1 ? "s" : ""}.`,
    };
  }

  // Règle 3 : pas qualifiable en A6.
  return { value: null, rationale: null };
}

/**
 * Helper Tier 3 — extrait les inputs depuis le contexte agent et délègue
 * à `computeEvidenceSolidity`.
 *
 * @param context contexte agent enrichi (avec `evidenceLedger` et
 *   `previousResults` typiquement attachés par l'orchestrator).
 * @param options optionnel — `selfContradictionsOverride` pour
 *   Contradiction Detector (qui passe ses propres counts au lieu de lire
 *   son propre output via previousResults).
 */
export function buildEvidenceSolidityForContext(
  context: EnrichedAgentContext,
  options: {
    selfContradictionsOverride?: {
      critical: number;
      high: number;
    };
  } = {},
): EvidenceSolidityResult {
  // Phase A slice A6 round 2 — Les contradictions sont un signal déterministe
  // autonome (cross-agent ou self-override CD). Elles doivent qualifier
  // `contradictory` MÊME si le ledger est absent. Précédemment, le helper
  // retournait null avant de lire les contradictions — bug doctrinal corrigé.
  const contradictionCounts = resolveContradictionCounts(context, options.selfContradictionsOverride);

  // Phase 1 — Évaluer le signal `contradictory` (autonome, ne dépend pas du
  // ledger). On bypass artificiellement les règles `insufficient` en
  // fournissant factCount/artifactCount synthétiques non-zéro : compute
  // reste pur, ne fabrique rien, n'utilise pas score/confidence.
  const contradictoryOnly = computeEvidenceSolidity({
    factCount: 1,
    documentArtifactCount: 1,
    lowReliabilityFactCount: 0,
    extractionWarningCount: 0,
    criticalContradictionCount: contradictionCounts.critical,
    highContradictionCount: contradictionCounts.high,
  });
  if (contradictoryOnly.value === "contradictory") {
    return contradictoryOnly;
  }

  // Phase 2 — Pour `insufficient`, on exige un ledger réellement présent.
  // Un contexte sans `evidenceLedger` du tout signifie "pas de signal de
  // couverture exploitable", pas "couverture nulle" — la sémantique est
  // différente et on retourne `null` pour ne pas fabriquer un verdict
  // insufficient artificiel.
  const ledger = context.evidenceLedger;
  const coverage = ledger?.coverage;
  if (!coverage) {
    return { value: null, rationale: null };
  }

  return computeEvidenceSolidity({
    factCount: coverage.factCount ?? 0,
    documentArtifactCount: coverage.documentArtifactCount ?? 0,
    lowReliabilityFactCount: coverage.lowReliabilityFactCount ?? 0,
    extractionWarningCount: coverage.extractionWarningCount ?? 0,
    criticalContradictionCount: contradictionCounts.critical,
    highContradictionCount: contradictionCounts.high,
  });
}

/**
 * Lit les counts de contradictions depuis `previousResults`
 * (contradiction-detector output) ou utilise un override local pour CD.
 *
 * Retourne `{ critical: 0, high: 0 }` si absent (signal non disponible).
 */
function resolveContradictionCounts(
  context: EnrichedAgentContext,
  override: { critical: number; high: number } | undefined,
): { critical: number; high: number } {
  if (override) {
    return { critical: override.critical, high: override.high };
  }

  const cdResult = context.previousResults?.["contradiction-detector"];
  if (!cdResult?.success || !("data" in cdResult) || !cdResult.data) {
    return { critical: 0, high: 0 };
  }

  // Lecture structurellement defensive : on ne dépend pas du typage
  // strict de ContradictionDetectorData ici pour rester découplé.
  const data = cdResult.data as {
    findings?: {
      contradictions?: Array<{ severity?: string }>;
    };
  };
  const contradictions = Array.isArray(data.findings?.contradictions)
    ? data.findings.contradictions
    : [];

  let critical = 0;
  let high = 0;
  for (const item of contradictions) {
    if (item?.severity === "CRITICAL") critical += 1;
    else if (item?.severity === "HIGH") high += 1;
  }
  return { critical, high };
}
