import { describe, expect, it } from "vitest";

import {
  AGENT_TECHNICAL_NAMES,
  capitalizeFirstMeaningfulChar,
  humanizeInlineAgentNames,
  isLegalRegistryUnavailableSignal,
  presentableSource,
  sanitizeSourceLabel,
  scrubAgentNamesFromText,
} from "../lib/presentation";
import { thesisAlertCategoryLabel } from "@/lib/ui-configs";

describe("sanitizeSourceLabel", () => {
  it("retire les noms d'agents, conserve les documents", () => {
    expect(sanitizeSourceLabel("Pitch Deck (général) · competitive-intel & market-intelligence outputs")).toBe(
      "Pitch Deck (général)",
    );
  });

  it("renvoie un fallback non-sourcé quand tout est de la machinerie", () => {
    expect(sanitizeSourceLabel("competitive-intel & market-intelligence outputs")).toBe(
      "Synthèse interne non sourcée",
    );
    expect(sanitizeSourceLabel("deck-forensics")).toBe("Synthèse interne non sourcée");
    expect(sanitizeSourceLabel("ai-expert")).toBe("Synthèse interne non sourcée");
  });

  it("réécrit le jargon machinerie interne", () => {
    expect(sanitizeSourceLabel("Fact Store & deck-forensics")).toBe("Base de faits interne");
    expect(sanitizeSourceLabel("Rapport Context Engine: 'Pappers indisponible'")).toContain("Recherche externe");
  });

  it("conserve les vrais noms de documents", () => {
    expect(sanitizeSourceLabel("Mail 3 (24/02/2026)")).toBe("Mail 3 (24/02/2026)");
    expect(sanitizeSourceLabel("Table de capi Septembre 2024.png")).toBe("Table de capi Septembre 2024.png");
  });

  it("fallback honnête sur entrée vide", () => {
    expect(sanitizeSourceLabel(null)).toBe("Provenance documentaire non disponible");
    expect(sanitizeSourceLabel("")).toBe("Provenance documentaire non disponible");
  });

  it("scrub les noms d'agents EMBARQUÉS dans une phrase (finding Codex)", () => {
    // Nom technique au milieu d'une phrase, pas un segment isolé.
    expect(sanitizeSourceLabel("Source: competitive-intel outputs")).toBe("Synthèse interne non sourcée");
    expect(sanitizeSourceLabel("Analyse issue de market-intelligence outputs")).toBe(
      "Synthèse interne non sourcée",
    );
    // Document réel + résidu agent embarqué → garder le document seul.
    expect(sanitizeSourceLabel("Pitch Deck · analyse de competitive-intel")).toBe("Pitch Deck");
  });

  it("INVARIANT : aucune sortie ne contient de nom d'agent technique", () => {
    const hostile = [
      "Pitch Deck (général) · competitive-intel & market-intelligence outputs",
      "Fact Store & deck-forensics",
      "deck-forensics: 'Le BP Excel montre un écart'",
      "financial-auditor & cap-table-auditor outputs",
      "thesis-reconciler",
      "saas-expert outputs",
      "Source: competitive-intel outputs",
      "Analyse issue de market-intelligence outputs",
      "Données via team-investigator et financial-auditor",
    ];
    for (const raw of hostile) {
      const out = sanitizeSourceLabel(raw).toLowerCase();
      for (const name of AGENT_TECHNICAL_NAMES) {
        expect(out, `"${raw}" → "${out}" contient "${name}"`).not.toContain(name);
      }
      expect(out).not.toMatch(/-expert\b/);
    }
  });
});

describe("humanizeInlineAgentNames", () => {
  it("nettoie une location de contradiction", () => {
    expect(humanizeInlineAgentNames("competitive-intel & market-intelligence outputs")).toBe(
      "Synthèse interne non sourcée",
    );
  });
});

describe("préfixe 'agent:' / 'source:' (finding Codex Phase 4)", () => {
  it("presentableSource ne laisse jamais 'agent' résiduel", () => {
    expect(presentableSource("agent: competitive-intel outputs")).toBeNull();
    expect(presentableSource("Source: deck-forensics")).toBeNull();
  });

  it("scrubAgentNamesFromText retire le préfixe label + le nom d'agent", () => {
    expect(scrubAgentNamesFromText("agent: deck-forensics output")).toBe("");
    expect(scrubAgentNamesFromText("Source: competitive-intel — 4 concurrents identifiés")).toBe(
      "4 concurrents identifiés",
    );
  });

  it("scrub d'un title runtime piégé", () => {
    const cleaned = scrubAgentNamesFromText("competitive-intel: Omission de concurrents majeurs");
    expect(cleaned).toBe("Omission de concurrents majeurs");
  });
});

describe("capitalizeFirstMeaningfulChar", () => {
  it("capitalise la première lettre significative", () => {
    expect(capitalizeFirstMeaningfulChar("parie que les entreprises")).toBe("Parie que les entreprises");
    expect(capitalizeFirstMeaningfulChar("propose une marketplace")).toBe("Propose une marketplace");
    expect(capitalizeFirstMeaningfulChar("à vérifier")).toBe("À vérifier");
  });

  it("préserve l'espace de tête et ne touche pas le reste", () => {
    expect(capitalizeFirstMeaningfulChar("  propose une")).toBe("  Propose une");
    expect(capitalizeFirstMeaningfulChar("la thèse repose. avec une croissance")).toBe(
      "La thèse repose. avec une croissance",
    );
  });

  it("ne casse rien sur chiffres/vide", () => {
    expect(capitalizeFirstMeaningfulChar("3M EUR")).toBe("3M EUR");
    expect(capitalizeFirstMeaningfulChar("")).toBe("");
  });
});

describe("isLegalRegistryUnavailableSignal (#6 — signature explicite, jamais floue)", () => {
  it("reconnaît « connecteur/registre indisponible » (token connecteur ET échec outil)", () => {
    expect(isLegalRegistryUnavailableSignal("Le registre officiel français (Pappers.fr) est indisponible.")).toBe(true);
    expect(isLegalRegistryUnavailableSignal("Pappers.fr: Registre officiel FR indisponible: K-bis, dirigeants non vérifiés.")).toBe(true);
    expect(isLegalRegistryUnavailableSignal("Le greffe n'a pas pu être interrogé pour ce dossier.")).toBe(true);
    expect(isLegalRegistryUnavailableSignal("Impossible de vérifier la société au registre du commerce.")).toBe(true);
    // blob réel devils-advocate Avekapeti : titre ambigu + description qui nomme le registre down
    expect(
      isLegalRegistryUnavailableSignal("Absence de Vérification Légale (K-bis). Le registre officiel (Pappers.fr) est indisponible."),
    ).toBe(true);
  });

  it("NE déclasse PAS un vrai risque légal (token connecteur SANS échec outil)", () => {
    expect(isLegalRegistryUnavailableSignal("Procédure collective active au greffe")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("Non-conformité RGPD au registre du commerce")).toBe(false);
  });

  it("NE déclasse PAS un manque côté fondateur/document (aucun connecteur en échec)", () => {
    // titre ambigu seul, sans connecteur nommé en échec → pas de reclassement (resserrement Codex)
    expect(isLegalRegistryUnavailableSignal("Absence de Vérification Légale (K-bis)")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("Absence de vérification du K-bis par le fondateur")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("K-bis non fourni par le fondateur")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("K-bis non vérifié par le fondateur")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("K-bis indisponible dans la data room")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("Le fondateur n'a pas pu fournir le K-bis")).toBe(false);
  });

  it("NE déclasse PAS une non-vérification non-registre", () => {
    expect(isLegalRegistryUnavailableSignal("Équipe dirigeante non vérifiée")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("Données financières incohérentes et non vérifiées")).toBe(false);
    expect(isLegalRegistryUnavailableSignal("Métriques de traction indisponibles")).toBe(false);
  });

  it("entrée vide → false", () => {
    expect(isLegalRegistryUnavailableSignal(null)).toBe(false);
    expect(isLegalRegistryUnavailableSignal("")).toBe(false);
  });
});

describe("thesisAlertCategoryLabel", () => {
  it("mappe les 8 catégories canoniques", () => {
    expect(thesisAlertCategoryLabel("assumption_fragile")).toBe("Hypothèse fragile");
    expect(thesisAlertCategoryLabel("ASSUMPTION_FRAGILE")).toBe("Hypothèse fragile");
    expect(thesisAlertCategoryLabel("unit_economics")).toBe("Économie unitaire");
    expect(thesisAlertCategoryLabel("why_now")).toBe("Timing");
  });

  it("fallback humanisé pour catégorie inconnue, jamais d'enum brut", () => {
    expect(thesisAlertCategoryLabel("nouvelle_categorie")).toBe("Nouvelle categorie");
    expect(thesisAlertCategoryLabel(null)).toBeNull();
  });
});
