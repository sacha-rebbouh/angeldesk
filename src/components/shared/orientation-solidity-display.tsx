"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  RECOMMENDATION_CONFIG,
  getEvidenceSolidityConfig,
  getEvidenceSolidityLabel,
  type EvidenceSolidity,
  type Orientation,
} from "@/lib/ui-configs";

/**
 * OrientationSolidityDisplay — primitive du modèle UI décisionnel à 2 axes.
 *
 * Axe 1 : orientation du signal (5 valeurs canoniques, cf. RECOMMENDATION_CONFIG).
 * Axe 2 : solidité des preuves (5 valeurs qualifiées EvidenceSolidity, ou absence).
 *
 * Règles critiques :
 *   - Si l'orientation est absente / non reconnue, le composant retourne null.
 *   - Si la solidité est absente / non reconnue et `showUnqualified !== true`,
 *     la chip solidité n'est PAS rendue (pas de fabrication de mesure).
 *   - Si `showUnqualified === true`, la chip solidité est rendue avec le
 *     fallback "Solidité à qualifier" (style neutre).
 *
 * Ce composant ne dépend d'aucune primitive numérique mono-axe et ne
 * réintroduit pas l'axe d'auto-évaluation banni par la doctrine §28.
 */

interface OrientationSolidityDisplayProps {
  /** Orientation du signal. Si absente / non reconnue, le composant ne s'affiche pas. */
  orientation: Orientation | string | null | undefined;
  /** Solidité des preuves. Si absente / non reconnue, la chip n'est pas rendue (sauf showUnqualified). */
  solidity?: EvidenceSolidity | string | null;
  /** Si `true`, force l'affichage de la chip solidité même en l'absence de valeur qualifiée. */
  showUnqualified?: boolean;
  /** Taille des chips. */
  size?: "sm" | "md" | "lg";
  /** Disposition des chips. */
  layout?: "row" | "column";
}

const SIZE_CLASSES: Record<NonNullable<OrientationSolidityDisplayProps["size"]>, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-base px-3 py-1.5 font-semibold",
};

const UNQUALIFIED_STYLE = "text-slate-700 bg-slate-50 border-slate-200";

export const OrientationSolidityDisplay = memo(function OrientationSolidityDisplay({
  orientation,
  solidity,
  showUnqualified = false,
  size = "md",
  layout = "row",
}: OrientationSolidityDisplayProps) {
  const orientationCfg =
    typeof orientation === "string" ? (RECOMMENDATION_CONFIG[orientation] ?? null) : null;

  if (!orientationCfg) {
    return null;
  }

  const solidityCfg = getEvidenceSolidityConfig(solidity);
  const renderSolidity = solidityCfg != null || showUnqualified === true;
  const solidityLabel = renderSolidity
    ? getEvidenceSolidityLabel(solidity, { showUnqualified: true })
    : null;

  return (
    <div
      className={cn(
        "inline-flex gap-2",
        layout === "column" ? "flex-col items-start" : "flex-row items-center flex-wrap",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-medium",
          orientationCfg.color,
          orientationCfg.bg,
          SIZE_CLASSES[size],
        )}
      >
        {orientationCfg.label}
      </span>
      {renderSolidity && solidityLabel != null ? (
        <span
          className={cn(
            "inline-flex items-center rounded-full border font-medium",
            solidityCfg ? solidityCfg.color : null,
            solidityCfg ? solidityCfg.bg : UNQUALIFIED_STYLE,
            SIZE_CLASSES[size],
          )}
        >
          {solidityLabel}
        </span>
      ) : null}
    </div>
  );
});

OrientationSolidityDisplay.displayName = "OrientationSolidityDisplay";
