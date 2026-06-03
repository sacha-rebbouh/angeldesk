/**
 * Fixture HOSTILE réutilisable — un `results` Avekapeti-like qui contient
 * délibérément tout ce que la doctrine bannit en surface :
 *  - noms d'agents techniques dans des `location`/`source` (data-driven leak)
 *  - enums bruts (catégories thèse)
 *  - red flag SANS titre (déclenche le fallback générique)
 *  - claims/preuves longs (déclenchent les troncatures)
 *
 * Utilisé par les guards runtime des phases qui câblent la sanitization
 * (sources Phase 4, catégories Phase 2, mémo Phase 7) et par le guard final.
 */
import type { ResultsMap } from "../../lib/extractors";

export const HOSTILE_RESULTS: ResultsMap = {
  "deck-forensics": {
    success: true,
    data: {
      narrative: { keyInsights: ["Écart de CA 2024 entre documents fournis (3M€ vs 2.4M€)."] },
      redFlags: [
        {
          // PAS de title → doit déclencher un fallback dérivé, jamais "Risque identifié" nu
          severity: "CRITICAL",
          impact:
            "Le chiffre d'affaires de 3M€ est 'DECLARED' et contredit par l'analyse du BP Excel. Toutes les métriques de rentabilité (marge, EBITDA) sont soit déclarées, soit projetées pour le futur, ce qui rend la base de valorisation invalide et l'équation économique du projet inconnue.",
          location: "Fact Store & deck-forensics",
          evidence: "deck-forensics: 'Le BP Excel montre un CA cumulé 2024 différent du chiffre rond annoncé dans le deck'",
        },
      ],
    },
  },
  "competitive-intel": {
    success: true,
    data: { narrative: { keyInsights: ["Concurrents directs bien financés non mentionnés (Popchef, Foodles)."] }, redFlags: [] },
  },
  "contradiction-detector": {
    success: true,
    data: {
      findings: {
        contradictions: [
          {
            topic: "Concurrents",
            severity: "CRITICAL",
            statement1: { text: "Aucun concurrent direct n'est mentionné dans le pitch deck.", location: "Pitch Deck (général)" },
            statement2: {
              text: "Identification de concurrents directs et bien financés comme Popchef (20M€ levés) et Foodles (100M€ levés), ainsi que de nombreux autres acteurs (Sodexo Live!, Tout & Bon, Room Saveur).",
              location: "competitive-intel & market-intelligence outputs",
            },
            implication: "Crédibilité du fondateur remise en cause. Le positionnement et le 'moat' ne peuvent être évalués de manière fiable.",
          },
        ],
      },
    },
  },
};

export const HOSTILE_THESIS: Record<string, unknown> = {
  verdict: "contrasted",
  confidence: 50,
  reformulated:
    "parie que les entreprises BtoB vont privilégier des solutions de restauration responsables. a atteint un chiffre d'affaires de 3M EUR (déclaré, non vérifié).",
  problem: "les entreprises recherchent des solutions alignées RSE mais les prestataires traditionnels ne suivent pas.",
  solution: "propose une marketplace BtoB qui connecte des chefs indépendants aux entreprises.",
  alerts: [
    { severity: "CRITICAL", category: "assumption_fragile", title: "Valorisation et montant de levée incohérents", detail: "..." },
    { severity: "HIGH", category: "unit_economics", title: "Ratio LTV/CAC à valider", detail: "..." },
  ],
  loadBearing: [
    { id: "lb1", statement: "Le ratio LTV/CAC de 16x reste durable à scale.", status: "declared", impact: "...", validationPath: "Demander les cohortes." },
  ],
};

/** Liste plate des chaînes "source"/"location" piégées du fixture (pour les guards). */
export const HOSTILE_SOURCE_STRINGS = [
  "Fact Store & deck-forensics",
  "deck-forensics: 'Le BP Excel montre un CA cumulé 2024 différent du chiffre rond annoncé dans le deck'",
  "Pitch Deck (général)",
  "competitive-intel & market-intelligence outputs",
];

/** Catégories brutes piégées du fixture. */
export const HOSTILE_CATEGORIES = ["assumption_fragile", "unit_economics"];
