import { describe, expect, it } from "vitest";

import { completionActionForStatus } from "../analysis-completion-policy";

describe("completionActionForStatus — politique commerciale post-analyse (statut terminal)", () => {
  it("COMPLETED → notify (livré : email + facturé), MÊME avec des agents imparfaits", () => {
    // Régression ciblée : un Deep Dive COMPLETED avec ≥1 agent `success:false` était remboursé
    // à tort + sans email (gate sur allSuccess). La policy se base sur le STATUT, pas sur les
    // agents → COMPLETED = livré, peu importe que certains agents aient échoué.
    expect(completionActionForStatus("COMPLETED")).toBe("notify");
  });

  it("FAILED → refund (non livré)", () => {
    expect(completionActionForStatus("FAILED")).toBe("refund");
  });

  it("statut non terminal / inconnu / null|undefined → none (jamais de refund à l'aveugle)", () => {
    expect(completionActionForStatus("RUNNING")).toBe("none");
    expect(completionActionForStatus("PENDING")).toBe("none");
    expect(completionActionForStatus(null)).toBe("none");
    expect(completionActionForStatus(undefined)).toBe("none");
    expect(completionActionForStatus("WHATEVER")).toBe("none");
  });
});
