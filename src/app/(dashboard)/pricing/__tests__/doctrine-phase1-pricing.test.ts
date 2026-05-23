import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pricingContent = readFileSync(
  path.resolve(__dirname, "../pricing-content.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 pricing-content.
 *
 * Garde-fou contre la réintroduction de claims commerciaux non audités sur
 * la page pricing (free tier banner, bandeau Quick Scan, compliance / SLA).
 */

const BANNED_PRICING_STRINGS = [
  // Free tier banner (section retirée)
  "1 Deep Dive offert sur votre premier deal",
  "20 agents d&apos;analyse",
  "41 expertises disponibles",
  // Quick Scan transition banner (section retirée)
  "Quick Scan remplacé par Deep Dive thesis-first",
  "sans surcout",
  "remboursement partiel de 3 credits",
  "17 avril 2026",
  // Institutional claims non audités
  "Exports compliance / audit trail",
  "Support dédié + SLA",
  // Remboursement automatique non audité
  "remboursés automatiquement si une action échoue",
  // PricingCtaButton variant banner orphelin (retrait Phase 1)
  'variant="banner"',
];

const REQUIRED_PRICING_STRINGS = [
  // Reformulation remboursement
  "selon les CGU",
];

describe("doctrine phase 1 — pricing source guard", () => {
  it.each(BANNED_PRICING_STRINGS)(
    "pricing-content.tsx ne contient pas la chaîne bannie : %s",
    (banned) => {
      expect(pricingContent).not.toContain(banned);
    },
  );

  it.each(REQUIRED_PRICING_STRINGS)(
    "pricing-content.tsx contient la chaîne attendue : %s",
    (required) => {
      expect(pricingContent).toContain(required);
    },
  );
});
