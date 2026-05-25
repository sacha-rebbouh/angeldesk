import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legalContent = readFileSync(
  path.resolve(__dirname, "../page.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 confidentialité.
 *
 * La page de confidentialité reste minimale tant que l'audit légal n'est pas
 * réalisé. Aucun article RGPD spécifique, aucun claim provider / région /
 * chiffrement, aucune durée de conservation précise.
 */

const BANNED_LEGAL_STRINGS = [
  // Articles RGPD spécifiques
  "Art. 6.1.b",
  "Art. 6.1.f",
  "Art. 6.1.c",
  "Article 15",
  "Article 16",
  "Article 17",
  "Article 18",
  "Article 20",
  "Article 21",
  "Article 7.3",
  // Claims sécurité non audités
  "AES-256-GCM",
  "Authentification multi-facteur",
  "Sanitization des entrees",
  "Circuit breaker",
  // Sous-traitants & garanties
  "DPA + SCCs",
  "Heberge en UE",
  "Francfort",
  // Durées de conservation précises
  "30 jours",
  "Duree du compte",
  "10 ans",
];

const REQUIRED_LEGAL_STRINGS = [
  // Référence RGPD générale (acceptable)
  "RGPD",
  // Contact DPO
  "dpo@angeldesk.io",
];

describe("doctrine phase 1 — legal confidentialité source guard", () => {
  it.each(BANNED_LEGAL_STRINGS)(
    "legal/confidentialite/page.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(legalContent).not.toContain(banned);
    },
  );

  it.each(REQUIRED_LEGAL_STRINGS)(
    "legal/confidentialite/page.tsx contient la chaîne attendue : %s",
    (required) => {
      expect(legalContent).toContain(required);
    },
  );
});
