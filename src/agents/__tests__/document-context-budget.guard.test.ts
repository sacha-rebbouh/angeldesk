/**
 * Source guard — budget de contexte documentaire (dé-scorisation P2-d).
 *
 * L'exception historique `return 140_000` pour synthesis-deal-scorer / memo-generator /
 * devils-advocate autorisait un contexte documentaire géant. Combinée au plafond Vercel
 * 300s, elle alimentait la boucle du step de synthèse (post-mortem prod cmq9lg9un…).
 *
 * Invariants verrouillés mécaniquement :
 * 1. `getGlobalDocumentContextBudget` ne contient plus aucune exception 140_000.
 * 2. Les agents de synthèse (synthesis/memo/devils) ne sont plus special-casés au-dessus
 *    du budget général dans cette fonction → ils retombent sur GENERAL_DOCUMENT_CONTEXT_BUDGET.
 * 3. L'exception financial-auditor (150_000) reste intacte (l'audit financier a besoin
 *    du corpus brut, contrairement aux synthétiseurs qui travaillent sur previousResults).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AGENT_PATH = resolve(__dirname, "../base-agent.ts");
const source = readFileSync(AGENT_PATH, "utf-8");

describe("base-agent — budget de contexte documentaire (dé-scorisation P2-d)", () => {
  const budgetFn = source.match(
    /private getGlobalDocumentContextBudget\(\): number \{[\s\S]*?\n  \}/
  );

  it("la fonction de budget documentaire est trouvable", () => {
    expect(budgetFn, "getGlobalDocumentContextBudget introuvable").not.toBeNull();
  });

  it("ne contient plus l'exception 140_000 (synthesis/memo/devils)", () => {
    expect(budgetFn![0]).not.toContain("140_000");
    expect(budgetFn![0]).not.toContain("140000");
  });

  it("ne special-case plus synthesis-deal-scorer / memo-generator / devils-advocate", () => {
    expect(budgetFn![0]).not.toContain("synthesis-deal-scorer");
    expect(budgetFn![0]).not.toContain("memo-generator");
    expect(budgetFn![0]).not.toContain("devils-advocate");
  });

  it("préserve l'exception financial-auditor (150_000)", () => {
    expect(budgetFn![0]).toContain('this.config.name === "financial-auditor"');
    expect(budgetFn![0]).toContain("150_000");
  });

  it("retombe sur le budget général pour tout agent non special-casé", () => {
    expect(budgetFn![0]).toContain("return GENERAL_DOCUMENT_CONTEXT_BUDGET;");
  });
});
