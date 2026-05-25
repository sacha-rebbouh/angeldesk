/**
 * Phase A slice A8b — Source guard consumers Tier 2 UI/PDF.
 *
 * Vérifie mécaniquement le contrat user-facing Tier 2 :
 *
 *   1. **UI `tier2-results.tsx`** :
 *      - Consomme `result._extended.verdict` (canal canonique), pas
 *        `data.verdict` (qui n'existe pas sur `SectorExpertData`).
 *      - `SECTOR_FIT_CONFIG` importe les libellés depuis
 *        `TIER2_SECTOR_FIT_LABELS` (single source of truth doctrinaire).
 *
 *   2. **PDF `tier2-expert.tsx`** :
 *      - Consomme `result._extended` (`ext.verdict`).
 *      - Le libellé `verdict.recommendation` passe par
 *        `getTier2SectorFitLabel`, plus de rendu brut
 *        `verdict.recommendation.replace(/_/g, " ")`.
 *
 *   3. **Garde-fou data.verdict Tier 2** : ni UI ni PDF n'utilisent
 *      `data.verdict` comme canal principal user-facing (décision Codex
 *      A8 audit point 4 — `data.verdict` ne doit pas être repeuplé ni
 *      réintroduit comme faux canal Tier 2).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const TIER2_UI_PATH = "src/components/deals/tier2-results.tsx";
const TIER2_PDF_PATH = "src/lib/pdf/pdf-sections/tier2-expert.tsx";

describe("Phase A A8b — UI consumer tier2-results.tsx", () => {
  const source = loadFile(TIER2_UI_PATH);

  it("importe `TIER2_SECTOR_FIT_LABELS` depuis ui-configs (source de vérité doctrinaire)", () => {
    expect(/import\s*\{[^}]*TIER2_SECTOR_FIT_LABELS[^}]*\}\s*from\s*["']@\/lib\/ui-configs["']/.test(source)).toBe(true);
  });

  it("`SECTOR_FIT_CONFIG` utilise `TIER2_SECTOR_FIT_LABELS` pour le `label` des 5 valeurs", () => {
    // Chaque entrée du config doit référencer TIER2_SECTOR_FIT_LABELS.X
    // (au lieu de hardcoder un libellé inline).
    const required = ["STRONG_FIT", "GOOD_FIT", "MODERATE_FIT", "POOR_FIT", "NOT_RECOMMENDED"];
    for (const key of required) {
      const pattern = new RegExp(`label\\s*:\\s*TIER2_SECTOR_FIT_LABELS\\.${key}\\b`);
      expect(pattern.test(source)).toBe(true);
    }
  });

  it("consomme `_extended.verdict` (canal canonique user-facing)", () => {
    // Le composant doit lire result._extended OU extended.verdict.
    expect(/result\._extended|extended\.verdict|extended\?\.verdict/.test(source)).toBe(true);
  });

  it("ne consomme PAS `data.verdict` Tier 2 comme canal principal (Codex A8 audit point 4)", () => {
    // Garde-fou : aucun accès `data.verdict` Tier 2. Les sous-champs
    // métier `data.findings.X.verdict` ou similaires restent autorisés
    // (chemin d'au moins 2 segments avant `verdict`).
    expect(/\bdata\.verdict\b/.test(source)).toBe(false);
    expect(/\bdata\?\.verdict\b/.test(source)).toBe(false);
  });
});

describe("Phase A A8b — PDF consumer tier2-expert.tsx", () => {
  const source = loadFile(TIER2_PDF_PATH);

  it("importe `getTier2SectorFitLabel` depuis ui-configs", () => {
    expect(/import\s*\{[^}]*getTier2SectorFitLabel[^}]*\}\s*from\s*["']@\/lib\/ui-configs["']/.test(source)).toBe(true);
  });

  it("appelle `getTier2SectorFitLabel(verdict.recommendation)` pour le rendu principal", () => {
    expect(/getTier2SectorFitLabel\s*\(\s*verdict\.recommendation\s*\)/.test(source)).toBe(true);
  });

  it("ne contient PLUS le rendu brut `verdict.recommendation.replace(/_/g, \" \")`", () => {
    expect(/verdict\.recommendation\s*\)\s*\.replace\s*\(\s*\/_\/g\s*,\s*["']\s*["']\s*\)/.test(source)).toBe(false);
    // Variante sans wrap dans `s()` :
    expect(/verdict\.recommendation\.replace\s*\(\s*\/_\/g/.test(source)).toBe(false);
  });

  it("fallback doctrinaire neutre — n'expose JAMAIS la valeur brute via `?? s(verdict.recommendation)`", () => {
    // Codex A8b round 2 — interdiction stricte : si l'enum sort du
    // canonique 5-valeurs, le PDF doit afficher un libellé doctrinaire
    // neutre, pas la valeur brute. Bannit le pattern de fallback raw qui
    // ré-exposerait l'enum technique au lecteur.
    expect(/\?\?\s*s\s*\(\s*verdict\.recommendation\s*\)/.test(source)).toBe(false);
  });

  it("fallback PDF est une chaîne neutre doctrinaire (`Profil sectoriel à qualifier` ou équivalent)", () => {
    // Garde-fou positif : le fallback doit être une chaîne littérale
    // doctrinaire (pas une référence dynamique). Pattern attendu :
    // `?? "Profil sectoriel à qualifier"` ou `?? "À qualifier"`.
    const neutralFallbackPattern = /\?\?\s*["'](Profil sectoriel à qualifier|À qualifier)["']/;
    expect(neutralFallbackPattern.test(source)).toBe(true);
  });

  it("consomme `_extended.verdict` via `ext.verdict` (canal canonique)", () => {
    expect(/ext\?\.verdict|ext\.verdict|result\._extended/.test(source)).toBe(true);
  });

  it("ne consomme PAS `data.verdict` Tier 2 comme canal principal (Codex A8 audit point 4)", () => {
    expect(/\bdata\.verdict\b/.test(source)).toBe(false);
    expect(/\bdata\?\.verdict\b/.test(source)).toBe(false);
  });
});

describe("Phase A A8b — Documentation contrat `_extended.verdict` (types.ts)", () => {
  const source = loadFile("src/agents/tier2/types.ts");

  it("`ExtendedSectorData.verdict` documenté comme canal user-facing canonique", () => {
    // La docstring doit explicitement nommer `_extended.verdict` comme
    // canal user-facing et explicitement nommer le path à éviter
    // (`data.verdict`).
    expect(/canal user-facing/i.test(source)).toBe(true);
    expect(/data\.verdict/.test(source)).toBe(true);
  });

  it("garde-fou `NOT_RECOMMENDED` reste défini sur le canonique", () => {
    // A8b NE renomme PAS le canonique (cf. Codex A8 audit point 1).
    expect(/"NOT_RECOMMENDED"/.test(source)).toBe(true);
  });
});
