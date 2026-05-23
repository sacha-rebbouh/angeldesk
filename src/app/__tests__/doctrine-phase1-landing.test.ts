import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileContent = readFileSync(
  path.resolve(__dirname, "../page.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 landing.
 *
 * Garde-fou contre la réintroduction de claims oraculaires bannis par la
 * doctrine 2026-05-20 (cf. docs-doctrine/angeldesk-strategic-pivot.md).
 * Lit le contenu source de src/app/page.tsx et vérifie l'absence de chaînes
 * contextualisées exactes, et la présence des reformulations canoniques.
 */

const BANNED_LANDING_STRINGS = [
  // Hero : oracular framing
  "Votre équipe d&apos;analystes IA",
  "qu&apos;un fonds VC",
  "ferait en 2 jours",
  "vos analystes IA font le travail",
  "Analyser mon premier deal",
  // Trust Indicators (section retirée)
  "5 analyses gratuites",
  "Résultats en 2 minutes",
  // Features (anciennes formulations)
  "Une due diligence complète, comme si vous aviez une équipe d&apos;analystes",
  "1 heure chrono",
  "50+ comparables",
  "base de 50K+ deals",
  "Zéro faux positifs",
  "score de confiance supérieur à 80%",
  // How it works
  "13 agents spécialisés",
  // CTA section
  "Votre prochain deal, analysé en 1 heure",
  "Rejoignez les Business Angels",
  "Créer un compte gratuit",
  // Header CTA
  "Commencer gratuitement",
  // Social Proof (section retirée)
  "Confidence minimum",
  "Agents IA spécialisés",
  "Deals dans notre base",
  "Temps d&apos;analyse moyen",
];

const REQUIRED_LANDING_STRINGS = [
  // Canonical §3 — phrase publique verrouillée
  "copilote analytique",
  "investisseurs privés",
  // Reformulations doctrine
  "signaux d&apos;alerte",
];

describe("doctrine phase 1 — landing source guard", () => {
  it.each(BANNED_LANDING_STRINGS)(
    "src/app/page.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(fileContent).not.toContain(banned);
    },
  );

  it.each(REQUIRED_LANDING_STRINGS)(
    "src/app/page.tsx contient la chaîne canonique : %s",
    (required) => {
      expect(fileContent).toContain(required);
    },
  );
});
