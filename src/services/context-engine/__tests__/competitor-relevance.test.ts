import { describe, expect, it } from "vitest";
import {
  applyRelevanceVerdicts,
  filterCompetitorsByCategoryRelevance,
  parseRelevanceVerdicts,
  sanitizeLegacyCompetitiveLandscape,
} from "../competitor-relevance";
import type { Competitor, CompetitiveLandscape, DataSource } from "../types";

function makeSource(type: DataSource["type"], name: string): DataSource {
  return { type, name, retrievedAt: "2026-06-21T00:00:00.000Z", confidence: 0.8 };
}

function makeCompetitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    name: "TestComp",
    positioning: "Test positioning",
    overlap: "partial",
    source: makeSource("web_search", "Web Search (Perplexity)"),
    ...overrides,
  };
}

// Candidats reproduisant le snapshot HelloCoco (agents conversationnels e-commerce)
const helloCocoCandidates: Competitor[] = [
  makeCompetitor({
    name: "Mistral AI",
    overlap: "partial",
    source: makeSource("dealroom", "Seedtable"),
  }),
  makeCompetitor({
    name: "Ankorstore",
    overlap: "partial",
    source: makeSource("dealroom", "Seedtable"),
  }),
  makeCompetitor({
    name: "Dataiku",
    overlap: "direct", // hardcodé par french-tech — jamais évalué
    source: makeSource("crunchbase", "French Tech"),
  }),
  makeCompetitor({
    name: "Yacla",
    overlap: "partial",
    source: makeSource("web_search", "Web Search (Perplexity)"),
  }),
  makeCompetitor({
    name: "Support Flow",
    overlap: "partial",
    source: makeSource("web_search", "Web Search (Perplexity)"),
  }),
];

describe("applyRelevanceVerdicts", () => {
  it("ne garde que direct/partial avec justification ; none et adjacent sont supprimés", () => {
    const verdicts = [
      { name: "Mistral AI", overlap: "none" as const, justification: "Fournisseur de modèles, pas un concurrent de catégorie" },
      { name: "Ankorstore", overlap: "none" as const, justification: "Marketplace B2B wholesale, catégorie différente" },
      { name: "Dataiku", overlap: "none" as const, justification: "Plateforme data science entreprise, autre catégorie" },
      { name: "Yacla", overlap: "adjacent" as const, justification: "Lead-gen ads, pas d'agents conversationnels" },
      { name: "Support Flow", overlap: "partial" as const, justification: "Agents IA support client e-commerce, use case partagé" },
    ];

    const kept = applyRelevanceVerdicts(helloCocoCandidates, verdicts);

    expect(kept.map((c) => c.name)).toEqual(["Support Flow"]);
    expect(kept[0].overlap).toBe("partial");
    expect(kept[0].overlapJustification).toContain("support client");
  });

  it("un candidat sans verdict est supprimé (fail-closed par candidat)", () => {
    const kept = applyRelevanceVerdicts(helloCocoCandidates, [
      { name: "Support Flow", overlap: "direct", justification: "Même catégorie" },
    ]);
    expect(kept.map((c) => c.name)).toEqual(["Support Flow"]);
  });

  it("le verdict du juge remplace l'overlap hardcodé du connecteur", () => {
    const kept = applyRelevanceVerdicts(
      [makeCompetitor({ name: "X", overlap: "partial" })],
      [{ name: "X", overlap: "direct", justification: "Même produit, même acheteur" }]
    );
    expect(kept[0].overlap).toBe("direct");
  });

  it("matche les noms sans sensibilité à la casse", () => {
    const kept = applyRelevanceVerdicts(
      [makeCompetitor({ name: "Support Flow" })],
      [{ name: "support flow", overlap: "direct", justification: "ok" }]
    );
    expect(kept).toHaveLength(1);
  });

  it("un verdict direct/partial SANS justification est supprimé (pas de concurrent non justifié)", () => {
    const kept = applyRelevanceVerdicts(
      [makeCompetitor({ name: "X" }), makeCompetitor({ name: "Y" })],
      [
        { name: "X", overlap: "direct", justification: "" },
        { name: "Y", overlap: "partial", justification: "   " },
      ]
    );
    expect(kept).toEqual([]);
  });
});

describe("parseRelevanceVerdicts", () => {
  it("parse un tableau JSON strict", () => {
    const verdicts = parseRelevanceVerdicts(
      '[{"name": "A", "overlap": "direct", "justification": "j"}]'
    );
    expect(verdicts).toEqual([{ name: "A", overlap: "direct", justification: "j" }]);
  });

  it("parse un tableau JSON entouré de fences markdown", () => {
    const verdicts = parseRelevanceVerdicts(
      '```json\n[{"name": "A", "overlap": "none", "justification": "j"}]\n```'
    );
    expect(verdicts).toHaveLength(1);
  });

  it("retourne null sur contenu invalide ou entrées malformées", () => {
    expect(parseRelevanceVerdicts("pas du json")).toBeNull();
    expect(parseRelevanceVerdicts('[{"name": "A", "overlap": "banana"}]')).toBeNull();
    expect(parseRelevanceVerdicts('{"name": "A"}')).toBeNull();
  });
});

describe("filterCompetitorsByCategoryRelevance — fail-closed", () => {
  it("sans juge LLM disponible : AUCUN concurrent restitué (liste vide, pas de liste non évaluée)", async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const kept = await filterCompetitorsByCategoryRelevance(helloCocoCandidates, {
        companyName: "HelloCoco",
        sector: "ai",
      });
      // Yacla (web_search) tombe aussi : fail-closed intégral, DoD « Dataiku/Yacla/Dolead ne sortent plus »
      expect(kept).toEqual([]);
    } finally {
      if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
    }
  });
});

describe("sanitizeLegacyCompetitiveLandscape", () => {
  it("purge TOUS les concurrents legacy sans justification, y compris web_search (snapshot HelloCoco)", () => {
    const legacy: CompetitiveLandscape = {
      competitors: helloCocoCandidates,
      marketConcentration: "moderate",
      competitiveAdvantages: [],
      competitiveRisks: [],
    };

    const sanitized = sanitizeLegacyCompetitiveLandscape(legacy);

    expect(sanitized).toBeDefined();
    expect(sanitized!.competitors).toEqual([]);
  });

  it("garde les concurrents jugés (avec overlapJustification), quelle que soit la source", () => {
    const judged: CompetitiveLandscape = {
      competitors: [
        makeCompetitor({
          name: "Chatbase",
          overlap: "direct",
          overlapJustification: "Agents IA e-commerce, même catégorie",
          source: makeSource("crunchbase", "French Tech"),
        }),
      ],
      marketConcentration: "fragmented",
      competitiveAdvantages: [],
      competitiveRisks: [],
    };

    const sanitized = sanitizeLegacyCompetitiveLandscape(judged);
    expect(sanitized!.competitors).toHaveLength(1);
  });

  it("retourne undefined pour une entrée absente", () => {
    expect(sanitizeLegacyCompetitiveLandscape(undefined)).toBeUndefined();
    expect(sanitizeLegacyCompetitiveLandscape(null)).toBeUndefined();
  });
});
