import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ctaButtonContent = readFileSync(
  path.resolve(__dirname, "../pricing-cta-button.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 PricingCtaButton.
 *
 * Le variant `banner` a été retiré en même temps que le free tier banner.
 * Le label par défaut « Commencer gratuitement » et l'icône `Gift` sont
 * également bannis.
 */

const BANNED_CTA_STRINGS = [
  // Label oraculaire
  "Commencer gratuitement",
  // Variant banner retiré
  'variant === "banner"',
  // Icon Gift retiré
  "Gift",
];

describe("doctrine phase 1 — pricing CTA button source guard", () => {
  it.each(BANNED_CTA_STRINGS)(
    "pricing-cta-button.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(ctaButtonContent).not.toContain(banned);
    },
  );
});
