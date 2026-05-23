import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(
  path.resolve(__dirname, "../orientation-solidity-display.tsx"),
  "utf-8",
);

/**
 * Source guard — OrientationSolidityDisplay.
 *
 * Le composant ne doit JAMAIS importer ni référencer les anti-patterns du
 * modèle décisionnel (confidence, score numérique, ScoreBadge, getScoreColor,
 * getScoreLabel) sous peine de recréer l'axe "Confiance" auto-évalué (§28).
 *
 * Lecture brute du fichier source via fs.readFileSync — pas de RTL DOM
 * testing (cohérent avec l'infra Vitest Node).
 */

const BANNED_COMPONENT_STRINGS = [
  // Anti-pattern doctrinal §28 — auto-évaluation "Confiance"
  "confidence",
  "Confidence",
  "Confiance",
  // Primitive numérique legacy à ne pas réintroduire ici
  "ScoreBadge",
  // Helpers mono-axe à bannir sur cette surface
  "getScoreColor",
  "getScoreLabel",
  // Le label fallback ne doit JAMAIS être importé brut depuis ui-configs.
  // La seule façon d'obtenir "Solidité à qualifier" est via le helper avec
  // { showUnqualified: true }.
  "EVIDENCE_SOLIDITY_UNQUALIFIED_LABEL",
];

const REQUIRED_COMPONENT_STRINGS = [
  // Types canoniques importés
  "Orientation",
  "EvidenceSolidity",
  // Prop fallback explicite (pas de fabrication implicite)
  "showUnqualified",
  // Early-return si pas d'orientation reconnue
  "return null",
  // Config canonique orientation
  "RECOMMENDATION_CONFIG",
  // Helper solidité — décide rendu et style
  "getEvidenceSolidityConfig",
  // Helper solidité — seul accès autorisé au label fallback (opt-in)
  "getEvidenceSolidityLabel",
];

describe("orientation-solidity-display — source guard", () => {
  it.each(BANNED_COMPONENT_STRINGS)(
    "le composant ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(componentSource).not.toContain(banned);
    },
  );

  it.each(REQUIRED_COMPONENT_STRINGS)(
    "le composant contient la chaîne requise : %s",
    (required) => {
      expect(componentSource).toContain(required);
    },
  );
});
