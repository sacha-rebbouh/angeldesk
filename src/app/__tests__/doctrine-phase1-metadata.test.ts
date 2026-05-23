import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const layoutContent = readFileSync(
  path.resolve(__dirname, "../layout.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 metadata (RootLayout).
 *
 * Le `<title>` et `<meta name="description">` exposés au SEO et aux liens
 * partagés sont des surfaces publiques critiques. Aucun claim oraculaire ou
 * persona dépréciée ne doit y être réintroduit.
 */

const BANNED_METADATA_STRINGS = [
  // Persona dépréciée (BA solo n'est plus le centre stratégique)
  "Business Angels",
  "Business Angel",
  // Framing oraculaire
  "fonds VC",
  "DD d'un fonds VC",
  // Claim de vitesse banni
  "en 1 heure",
  "1 heure chrono",
  // Anciens titres
  "Due Diligence IA",
];

const REQUIRED_METADATA_STRINGS = [
  // Canonical §3 — phrase publique verrouillée
  "Copilote analytique",
  "investisseurs privés",
];

describe("doctrine phase 1 — metadata source guard", () => {
  it.each(BANNED_METADATA_STRINGS)(
    "src/app/layout.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(layoutContent).not.toContain(banned);
    },
  );

  it.each(REQUIRED_METADATA_STRINGS)(
    "src/app/layout.tsx contient la chaîne canonique : %s",
    (required) => {
      expect(layoutContent).toContain(required);
    },
  );
});
