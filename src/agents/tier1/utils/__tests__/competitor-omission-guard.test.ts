import { describe, expect, it } from "vitest";
import {
  filterMissedCompetitors,
  applyOmissionRedFlagGuard,
} from "../competitor-omission-guard";

type Missed = { name: string; funding?: number; whyRelevant: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" };

type Flag = {
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  evidence?: string;
};

// Reproduit les données HelloCoco : Jasper/Anthropic inventés par le LLM,
// non vérifiés en Funding DB, absents de la liste Context Engine jugée.
const helloCocoMissed: Missed[] = [
  { name: "Jasper", funding: 125_000_000, whyRelevant: "Concurrent direct sur l'IA marketing.", severity: "CRITICAL" },
  { name: "Anthropic (Claude)", funding: 18_000_000_000, whyRelevant: "Substitut technologique majeur via API.", severity: "HIGH" },
];

describe("filterMissedCompetitors", () => {
  it("supprime les entités absentes de la liste Context Engine jugée (cas HelloCoco)", () => {
    const { kept, dropped } = filterMissedCompetitors(helloCocoMissed, []);

    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.name)).toEqual(["Jasper", "Anthropic (Claude)"]);
  });

  it("une entité existante en Funding DB mais hors liste CE jugée est supprimée (existence ≠ pertinence catégorie)", () => {
    // Scénario Codex : Mistral AI existe en Funding DB avec severity CRITICAL,
    // mais n'est pas un concurrent de catégorie — la vérification DB ne doit
    // pas suffire à soutenir un red flag CRITICAL.
    const missed: Missed[] = [
      { name: "Mistral AI", funding: 600_000_000, whyRelevant: "Acteur IA majeur en France.", severity: "CRITICAL" },
    ];

    const { kept, dropped } = filterMissedCompetitors(missed, ["Support Flow", "Zaion"]);
    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.name)).toEqual(["Mistral AI"]);
  });

  it("garde une entité présente dans la liste Context Engine jugée (matching insensible à la casse)", () => {
    const missed: Missed[] = [
      { name: "Support Flow", whyRelevant: "Agents IA support e-commerce.", severity: "MEDIUM" },
    ];

    const { kept } = filterMissedCompetitors(missed, ["support flow"]);
    expect(kept).toHaveLength(1);
  });
});

describe("applyOmissionRedFlagGuard", () => {
  const omissionFlag: Flag = {
    category: "competition",
    severity: "CRITICAL",
    title: "Omission de concurrents massifs",
    description: "Jasper ($125M+ funding) et les agents natifs d'OpenAI ne sont pas mentionnés.",
    evidence: "Context Engine identifie Jasper et Anthropic comme menaces directes.",
  };

  it("supprime un red flag omission quand aucune omission vérifiée ne subsiste (cas HelloCoco)", () => {
    const { flags, guardNotes } = applyOmissionRedFlagGuard([omissionFlag], []);

    expect(flags).toEqual([]);
    expect(guardNotes.length).toBeGreaterThan(0);
  });

  it("plafonne à HIGH un red flag omission CRITICAL quand les omissions restantes ne sont pas CRITICAL", () => {
    const surviving: Missed[] = [
      { name: "Intercom", whyRelevant: "Même catégorie, vérifié en DB.", severity: "HIGH" },
    ];

    const { flags } = applyOmissionRedFlagGuard([omissionFlag], surviving);

    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("HIGH");
  });

  it("laisse CRITICAL quand une omission vérifiée CRITICAL subsiste", () => {
    const surviving: Missed[] = [
      { name: "Intercom", whyRelevant: "Concurrent direct vérifié.", severity: "CRITICAL" },
    ];

    const { flags } = applyOmissionRedFlagGuard([omissionFlag], surviving);
    expect(flags[0].severity).toBe("CRITICAL");
  });

  it("ne touche pas aux red flags non liés à une omission de concurrent", () => {
    const otherFlag: Flag = {
      category: "transparency",
      severity: "HIGH",
      title: "Incohérence de l'ARR déclaré",
      description: "Le deck revendique 1M€ d'ARR alors que le MRR annualisé est de 804k€.",
      evidence: "Calcul financier : 67k€ * 12 = 804k€.",
    };

    const { flags } = applyOmissionRedFlagGuard([otherFlag], []);
    expect(flags).toEqual([otherFlag]);
  });

  it("détecte le thème d'omission porté uniquement par le champ evidence", () => {
    const evidenceOnlyFlag: Flag = {
      category: "competition",
      severity: "CRITICAL",
      title: "Paysage concurrentiel incomplet",
      description: "Le deck ne présente pas une vue complète du marché.",
      evidence: "Des concurrents majeurs sont omis de l'analyse concurrentielle du deck.",
    };

    const { flags } = applyOmissionRedFlagGuard([evidenceOnlyFlag], []);
    expect(flags).toEqual([]);
  });

  it("ne touche pas un red flag competition sans thème d'omission", () => {
    const positioning: Flag = {
      category: "competition",
      severity: "HIGH",
      title: "Position concurrentielle fragile",
      description: "Le moat revendiqué n'est pas prouvé.",
      evidence: "Aucune donnée propriétaire démontrée.",
    };

    const { flags } = applyOmissionRedFlagGuard([positioning], []);
    expect(flags).toEqual([positioning]);
  });
});
