import { describe, it, expect } from "vitest";
import {
  getSectorProfile,
  filterRedFlagsBySector,
  applySectorRedFlagFilter,
  isTechDDApplicable,
  buildNotApplicableKeywords,
} from "../sector-profiles";

describe("getSectorProfile — résolution sectorielle", () => {
  it("mappe 'food' → consumer", () => {
    expect(getSectorProfile("food").family).toBe("consumer");
  });

  it("mappe 'foodtech' → consumer (pas pure-tech malgré le suffixe -tech)", () => {
    expect(getSectorProfile("foodtech").family).toBe("consumer");
  });

  it("mappe 'agroalimentaire' → consumer", () => {
    expect(getSectorProfile("agroalimentaire").family).toBe("consumer");
  });

  it("mappe 'SaaS B2B' → pure-tech (matching par mot-clé saas)", () => {
    expect(getSectorProfile("SaaS B2B").family).toBe("pure-tech");
  });

  it("mappe 'biotech' → bio", () => {
    expect(getSectorProfile("biotech").family).toBe("bio");
  });

  it("mappe 'fashion' → consumer", () => {
    expect(getSectorProfile("fashion").family).toBe("consumer");
  });

  it("mappe 'hardware' → hardware-tech", () => {
    expect(getSectorProfile("hardware").family).toBe("hardware-tech");
  });

  it("retourne unknown pour un secteur non listé", () => {
    expect(getSectorProfile("nonexistent-sector-xyz").family).toBe("unknown");
  });

  it("retourne unknown pour null/undefined", () => {
    expect(getSectorProfile(null).family).toBe("unknown");
    expect(getSectorProfile(undefined).family).toBe("unknown");
  });
});

describe("isTechDDApplicable — applicabilité DD technique", () => {
  it("vrai pour pure-tech", () => {
    expect(isTechDDApplicable("saas")).toBe(true);
  });

  it("vrai pour platform-tech (marketplace)", () => {
    expect(isTechDDApplicable("marketplace")).toBe(true);
  });

  it("faux pour consumer (food)", () => {
    expect(isTechDDApplicable("food")).toBe(false);
  });

  it("faux pour bio", () => {
    expect(isTechDDApplicable("biotech")).toBe(false);
  });

  it("faux pour climate", () => {
    expect(isTechDDApplicable("climate")).toBe(false);
  });

  it("vrai pour unknown (DD standard par défaut)", () => {
    expect(isTechDDApplicable(null)).toBe(true);
  });
});

describe("buildNotApplicableKeywords — extraction de mots-clés", () => {
  it("extrait les keywords pour consumer (food)", () => {
    const profile = getSectorProfile("food");
    const keywords = buildNotApplicableKeywords(profile);
    expect(keywords).toEqual(expect.arrayContaining(["nrr", "churn", "arr"]));
  });

  it("retourne une liste vide pour pure-tech (toutes métriques pertinentes)", () => {
    const profile = getSectorProfile("saas");
    const keywords = buildNotApplicableKeywords(profile);
    expect(keywords).toEqual([]);
  });

  it("inclut les mots-clés SaaS + cap-table non-applicables pour bio", () => {
    const profile = getSectorProfile("biotech");
    const keywords = buildNotApplicableKeywords(profile);
    // Le profil bio est hand-maintenu (filterKeywords) — on vérifie qu'il
    // contient au moins NRR/ARR/MRR (métriques SaaS) et dette technique
    // (stack logicielle non pertinente pour bio).
    expect(keywords).toEqual(expect.arrayContaining(["nrr", "arr", "mrr", "dette technique"]));
  });
});

describe("filterRedFlagsBySector — filtre déterministe", () => {
  it("filtre 'NRR declining' sur consumer (food)", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered, trace } = filterRedFlagsBySector(
      [{ title: "NRR declining month over month", category: "retention", severity: "HIGH" }],
      profile,
    );
    expect(kept).toHaveLength(0);
    expect(filtered).toHaveLength(1);
    expect(trace[0].matchedKeyword).toBe("nrr");
  });

  it("filtre 'Churn elevated' sur consumer (food)", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered } = filterRedFlagsBySector(
      [{ title: "Churn elevated vs SaaS benchmark", severity: "HIGH" }],
      profile,
    );
    expect(kept).toHaveLength(0);
    expect(filtered).toHaveLength(1);
  });

  it("garde 'Cap table fragmented' sur consumer (vrai signal cap-table)", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered } = filterRedFlagsBySector(
      [
        {
          title: "Cap table fragmented with 12 entries and no lead investor",
          category: "cap_table",
          severity: "HIGH",
        },
      ],
      profile,
    );
    expect(kept).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it("garde 'Founder absent du registre' sur consumer (vrai signal légal)", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered } = filterRedFlagsBySector(
      [{ title: "Founder absent du registre officiel KBIS", severity: "HIGH" }],
      profile,
    );
    expect(kept).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it("ne filtre RIEN sur pure-tech (SaaS)", () => {
    const profile = getSectorProfile("saas");
    const { kept, filtered } = filterRedFlagsBySector(
      [
        { title: "NRR declining", severity: "HIGH" },
        { title: "Churn elevated", severity: "HIGH" },
        { title: "No CTO identified", severity: "CRITICAL" },
      ],
      profile,
    );
    expect(kept).toHaveLength(3);
    expect(filtered).toHaveLength(0);
  });

  it("ne filtre RIEN sur unknown (DD standard par défaut)", () => {
    const profile = getSectorProfile(null);
    const { kept, filtered } = filterRedFlagsBySector(
      [{ title: "NRR declining", severity: "HIGH" }],
      profile,
    );
    expect(kept).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });

  it("filtre 'Dette technique' sur bio", () => {
    const profile = getSectorProfile("biotech");
    const { kept, filtered, trace } = filterRedFlagsBySector(
      [{ title: "Dette technique logicielle élevée", severity: "HIGH" }],
      profile,
    );
    expect(kept).toHaveLength(0);
    expect(filtered).toHaveLength(1);
    expect(trace[0].matchedKeyword).toContain("dette technique");
  });

  it("filtre 'TAM SaaS' sur consumer (food)", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered, trace } = filterRedFlagsBySector(
      [{ title: "TAM SaaS basé sur comptes × ARPU semble surévalué", severity: "MEDIUM" }],
      profile,
    );
    expect(kept).toHaveLength(0);
    expect(filtered).toHaveLength(1);
    expect(trace[0].matchedKeyword).toContain("tam saas");
  });

  it("préserve un mix kept + filtered correctement", () => {
    const profile = getSectorProfile("food");
    const { kept, filtered } = filterRedFlagsBySector(
      [
        { title: "NRR declining", severity: "HIGH" },          // filtré
        { title: "Cap table fragmented", severity: "HIGH" },   // kept
        { title: "Churn elevated", severity: "MEDIUM" },        // filtré
        { title: "Supply chain unverified", severity: "HIGH" }, // kept
      ],
      profile,
    );
    expect(kept).toHaveLength(2);
    expect(filtered).toHaveLength(2);
    expect(kept.map((r) => r.title)).toEqual(["Cap table fragmented", "Supply chain unverified"]);
  });
});

describe("applySectorRedFlagFilter — sucre syntaxique avec logging", () => {
  it("retourne uniquement les flags conservés", () => {
    const flags = [
      { title: "NRR declining", severity: "HIGH" },
      { title: "Cap table fragmented", severity: "HIGH" },
    ];
    const kept = applySectorRedFlagFilter(flags, "food", "test-agent");
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Cap table fragmented");
  });

  it("passe through pour les secteurs tech sans filtrer", () => {
    const flags = [
      { title: "NRR declining", severity: "HIGH" },
      { title: "Cap table fragmented", severity: "HIGH" },
    ];
    const kept = applySectorRedFlagFilter(flags, "saas", "test-agent");
    expect(kept).toHaveLength(2);
  });

  it("gère un secteur null sans crasher", () => {
    const flags = [{ title: "Any flag", severity: "MEDIUM" }];
    const kept = applySectorRedFlagFilter(flags, null, "test-agent");
    expect(kept).toHaveLength(1);
  });
});
