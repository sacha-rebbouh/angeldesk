import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalContent = readFileSync(
  path.resolve(__dirname, "../credit-purchase-modal.tsx"),
  "utf-8",
);

/**
 * Doctrine source guard — Phase 1 credit purchase modal.
 *
 * Le flow est en mailto: (pas Stripe). Le titre « Acheter des crédits » est
 * remplacé par « Demander des crédits » pour cohérence.
 */

describe("doctrine phase 1 — credit purchase modal source guard", () => {
  it("credit-purchase-modal.tsx ne contient pas l'ancien titre « Acheter des crédits »", () => {
    expect(modalContent).not.toContain("Acheter des crédits");
  });

  it("credit-purchase-modal.tsx contient le nouveau titre « Demander des crédits »", () => {
    expect(modalContent).toContain("Demander des crédits");
  });
});
