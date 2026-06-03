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
    data: {
      narrative: { keyInsights: ["Concurrents directs bien financés non mentionnés (Popchef, Foodles)."] },
      redFlags: [
        {
          // title runtime contenant un nom d'agent → doit être scrubé dans RankRow.title
          severity: "CRITICAL",
          title: "competitive-intel: Omission de concurrents majeurs bien financés",
          description: "Popchef (20M€) et Foodles (100M€) sont absents du deck.",
          location: "market-intelligence outputs",
          evidence: "Source: competitive-intel — 4 concurrents directs identifiés",
        },
      ],
    },
  },
  // Deux flags de MÊME topic (valorisation) sur des agents distincts → doivent
  // être dédupliqués par topic dans les ranks consolidés (#21 « sans doublons »).
  "financial-auditor": {
    success: true,
    data: {
      redFlags: [
        { severity: "CRITICAL", title: "Instabilité de la valorisation (10M€ → 6M€ en 3 mois)", description: "Valorisation incohérente entre documents.", location: "Mail 3 (24/02/2026)" },
      ],
    },
  },
  "cap-table-auditor": {
    success: true,
    data: {
      redFlags: [
        { severity: "CRITICAL", title: "Volatilité extrême de la valorisation", description: "Base de valorisation non justifiée.", location: "Table de capi Septembre 2024.png" },
      ],
    },
  },
  // Question Master : priorités d'investigation dont les champs contiennent des
  // noms d'agents (action/rationale) → doivent être scrubés (#22).
  "question-master": {
    success: true,
    data: {
      topPriorities: [
        {
          action: "Exiger le K-bis (Source: legal-regulatory)",
          rationale: "Selon competitive-intel, le registre est indisponible.",
          deadline: "Immédiat",
          priority: "CRITICAL",
        },
      ],
    },
  },
  // #6 — devils-advocate (hors dimensions Tier 1) : un flag « registre Pappers
  // INDISPONIBLE » (limite outil) DOIT être reclassé hors des risques société +
  // déclencher la notice « couverture légale à vérifier ». Le décoy « Équipe non
  // vérifiée » (token d'indisponibilité MAIS pas de token registre) DOIT rester
  // un risque critique (vrai sujet de diligence).
  "devils-advocate": {
    success: true,
    data: {
      redFlags: [
        {
          severity: "CRITICAL",
          title: "Absence de Vérification Légale (K-bis)",
          description: "Le registre officiel français (Pappers.fr) est indisponible pour ce deal, empêchant la vérification du K-bis et des dirigeants légaux.",
          evidence: "Source externe non vérifiée: 'Pappers.fr: Registre officiel FR indisponible: K-bis, dirigeants et données légales non vérifiés.'",
        },
        {
          severity: "CRITICAL",
          title: "Équipe Dirigeante Non Vérifiée",
          description: "Les profils de la fondatrice et du CTO sont 'unverified' selon la recherche externe.",
        },
      ],
    },
  },
  // #6 — legal-regulatory (dimension Tier 1, donc carté) : porte AUSSI un flag
  // « registre indisponible » (filtré des concerns de la carte) + un décoy avec
  // token registre MAIS sans indisponibilité (« procédure collective au greffe »
  // = vrai risque) qui DOIT rester.
  "legal-regulatory": {
    success: true,
    data: {
      redFlags: [
        {
          severity: "CRITICAL",
          title: "Vérification au registre du commerce impossible",
          description: "Le greffe / registre officiel n'a pas pu être interrogé : K-bis non vérifié.",
        },
        {
          severity: "CRITICAL",
          title: "Procédure collective active au greffe",
          description: "Une procédure collective active est inscrite pour la société.",
        },
      ],
    },
  },
  // deck-coherence-checker : alimente la table de preuves (evidence-collector) avec
  // un texte PRESCRIPTIF « décision » (sujet = le deck/les données) → reformulé au rendu.
  "deck-coherence-checker": {
    success: true,
    data: {
      coherenceScore: 29,
      issues: [
        {
          title: "Cohérence documentaire faible",
          description: "Le deck est trop incohérent pour baser une décision d'investissement.",
          severity: "critical",
        },
      ],
    },
  },
  "contradiction-detector": {
    success: true,
    data: {
      // Red flag HARDCODÉ historique au texte PRESCRIPTIF « décision » (doctrine) →
      // doit être reformulé au rendu (jamais « pour prendre une décision » en surface).
      redFlags: [
        {
          severity: "HIGH",
          title: "Score de consistance insuffisant",
          description: "Score de consistance de 29/100 - l'analyse n'est pas suffisamment fiable pour prendre une decision.",
          impact: "Les donnees du deal sont trop incoherentes pour baser une decision d'investissement.",
        },
      ],
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
          {
            // Les DEUX locations sont des noms d'agents → aucune source inline présentable
            // → la colonne Source NE doit PAS afficher "Recoupement de sources" (fausse provenance).
            topic: "Métriques financières",
            severity: "HIGH",
            statement1: { text: "Marge brute annoncée à 40%.", location: "financial-auditor outputs" },
            statement2: { text: "Marge brute recalculée à 28%.", location: "deck-forensics analysis" },
            implication: "Écart de marge non expliqué.",
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
    // impact au texte PRESCRIPTIF (sujet = l'analyse/les données, PAS l'investisseur) → doit être reformulé au rendu
    { id: "lb1", statement: "Le ratio LTV/CAC de 16x reste durable à scale.", status: "declared", impact: "Sans cohortes réelles, l'analyse n'est pas fiable pour prendre une décision.", validationPath: "Demander les cohortes." },
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
