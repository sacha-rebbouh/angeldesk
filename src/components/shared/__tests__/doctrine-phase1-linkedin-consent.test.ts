import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dialogContent = readFileSync(
  path.resolve(__dirname, "../linkedin-consent-dialog.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 LinkedIn consent dialog.
 *
 * Retrait des claims juridiques non audités (Art. 6.1.f, base légale,
 * suppression « à tout moment »).
 */

const BANNED_LINKEDIN_STRINGS = [
  // Article RGPD spécifique
  "Art. 6.1.f",
  // Claim juridique non audité
  "Base légale",
  // Promesse non audité
  "supprimables à tout moment",
];

describe("doctrine phase 1 — LinkedIn consent dialog source guard", () => {
  it.each(BANNED_LINKEDIN_STRINGS)(
    "linkedin-consent-dialog.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(dialogContent).not.toContain(banned);
    },
  );
});
