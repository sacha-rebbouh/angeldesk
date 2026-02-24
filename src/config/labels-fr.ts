/**
 * F61: French labels — single source of truth for all UI text.
 * Target: French-speaking Business Angels.
 */

export const AGENT_LABELS_FR: Record<string, string> = {
  // Base
  "red-flag-detector": "Détection de risques",
  "document-extractor": "Extraction de documents",
  "deal-scorer": "Scoring du deal",
  // Tier 1
  "financial-auditor": "Audit financier",
  "team-investigator": "Investigation équipe",
  "competitive-intel": "Intelligence concurrentielle",
  "deck-forensics": "Analyse du pitch deck",
  "market-intelligence": "Intelligence marché",
  "tech-stack-dd": "DD Stack technique",
  "tech-ops-dd": "DD Opérations tech",
  "legal-regulatory": "Juridique & réglementaire",
  "cap-table-auditor": "Audit cap table",
  "gtm-analyst": "Analyse GTM",
  "customer-intel": "Intelligence client",
  "exit-strategist": "Stratégie de sortie",
  "question-master": "Questions au fondateur",
  // Tier 2
  "saas-expert": "Expert SaaS",
  "marketplace-expert": "Expert Marketplace",
  "fintech-expert": "Expert FinTech",
  "healthtech-expert": "Expert HealthTech",
  "ai-expert": "Expert IA",
  "deeptech-expert": "Expert DeepTech",
  "climate-expert": "Expert Climate",
  "hardware-expert": "Expert Hardware & IoT",
  "gaming-expert": "Expert Gaming",
  "consumer-expert": "Expert D2C & Consumer",
  "blockchain-expert": "Expert Blockchain",
  "creator-expert": "Expert Creator Economy",
  "general-expert": "Expert généraliste",
  // Tier 3
  "contradiction-detector": "Détection de contradictions",
  "scenario-modeler": "Modélisation de scénarios",
  "synthesis-deal-scorer": "Scoring de synthèse",
  "devils-advocate": "Avocat du diable",
  "memo-generator": "Génération du mémo",
  // Tier 0
  "fact-extractor": "Extraction de faits",
  "deck-coherence-checker": "Vérification cohérence deck",
};

export const MATURITY_LABELS_FR: Record<string, string> = {
  emerging: "Émergent",
  growing: "En croissance",
  mature: "Mature",
  declining: "En déclin",
};

export const ASSESSMENT_LABELS_FR: Record<string, string> = {
  exceptional: "Exceptionnel",
  above_average: "Au-dessus de la moyenne",
  average: "Dans la moyenne",
  below_average: "En-dessous de la moyenne",
  concerning: "Préoccupant",
};

export const SEVERITY_LABELS_FR: Record<string, string> = {
  critical: "Critique",
  major: "Majeur",
  minor: "Mineur",
};

export const CONFIDENCE_FACTOR_LABELS_FR: Record<string, string> = {
  "Data Availability": "Disponibilité des données",
  "Evidence Quality": "Qualité des preuves",
  "Benchmark Match": "Correspondance benchmarks",
  "Source Reliability": "Fiabilité des sources",
  "Temporal Relevance": "Pertinence temporelle",
};
