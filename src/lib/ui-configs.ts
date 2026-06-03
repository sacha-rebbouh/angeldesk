/**
 * Centralized UI configuration constants.
 * Single source of truth for severity styles, colors, and labels.
 */

// =============================================================================
// Severity Styles — used by red-flags-summary, early-warnings, tier3-results
// =============================================================================

export const SEVERITY_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  badge: string;
  label: string;
}> = {
  CRITICAL: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-800 border-red-300",
    label: "Critique",
  },
  HIGH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    icon: "text-orange-500",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    label: "Élevé",
  },
  MEDIUM: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    icon: "text-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    label: "Moyen",
  },
  LOW: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: "text-blue-400",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    label: "Bas",
  },
};

/** Sorting order for severity levels (lower = more severe) */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Get severity style by key (case-insensitive).
 * Falls back to MEDIUM if key not found.
 */
export function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity.toUpperCase()] ?? SEVERITY_STYLES.MEDIUM;
}

// =============================================================================
// Score Thresholds — canonical scale used across the app
// =============================================================================

/**
 * Canonical score color mapping.
 * Use this everywhere for consistent score coloring.
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

/**
 * Canonical score label mapping.
 * Aligned with score-badge.tsx SCORE_SCALE.
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Solide";
  if (score >= 40) return "À approfondir";
  if (score >= 20) return "Points d'attention";
  return "Zone d'alerte";
}

/**
 * Canonical score bar color mapping (for progress bars).
 */
export function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

// =============================================================================
// Orientation du signal — 5 valeurs canoniques (axe 1 du modèle 2 axes)
// =============================================================================

/** Valeurs canoniques de l'orientation du signal. */
export const ORIENTATION_VALUES = [
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
] as const;

export type Orientation = (typeof ORIENTATION_VALUES)[number];

// =============================================================================
// Recommendation Config — centralized for verdict-panel & tier3-results
// =============================================================================

export const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  very_favorable: { label: "Signaux très favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  favorable: { label: "Signaux favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  contrasted: { label: "Signaux contrastés", color: "text-amber-800", bg: "bg-amber-50 border-amber-300" },
  vigilance: { label: "Vigilance requise", color: "text-blue-800", bg: "bg-blue-50 border-blue-300" },
  alert_dominant: { label: "Signaux d'alerte dominants", color: "text-red-800", bg: "bg-red-50 border-red-300" },
};

// Verdict Config — maps synthesis scorer verdict values to badge display
// Used by tier3-results VerdictBadge
export const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  very_favorable: { label: "Signaux très favorables", color: "bg-green-100 text-green-800 border-green-300" },
  favorable: { label: "Signaux favorables", color: "bg-blue-100 text-blue-800 border-blue-300" },
  contrasted: { label: "Signaux contrastés", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  vigilance: { label: "Vigilance requise", color: "bg-orange-100 text-orange-800 border-orange-300" },
  alert_dominant: { label: "Signaux d'alerte dominants", color: "bg-red-100 text-red-800 border-red-300" },
};

// Thesis Verdict Config — thesis-first (Tier 0.5). Meme mapping que RECOMMENDATION_CONFIG
// mais avec libelles orientes "these" pour clarifier la distinction entre verdict these
// (jugement structurel de la promesse de la societe) et verdict global (score final).
export const THESIS_VERDICT_CONFIG: Record<string, { label: string; shortLabel: string; color: string; bg: string; description: string }> = {
  very_favorable: {
    label: "Thèse très solide",
    shortLabel: "Très solide",
    color: "text-green-800",
    bg: "bg-green-50 border-green-300",
    description: "Les 3 frameworks convergent. Hypotheses porteuses majoritairement verifiees.",
  },
  favorable: {
    label: "Thèse solide",
    shortLabel: "Solide",
    color: "text-green-800",
    bg: "bg-green-50 border-green-300",
    description: "Les 3 frameworks s'alignent avec quelques reserves mineures.",
  },
  contrasted: {
    label: "Thèse contrastée",
    shortLabel: "Contrastée",
    color: "text-amber-800",
    bg: "bg-amber-50 border-amber-300",
    description: "Les frameworks divergent. Points d'attention a clarifier avant decision.",
  },
  vigilance: {
    label: "Thèse fragile",
    shortLabel: "Fragile",
    color: "text-blue-800",
    bg: "bg-blue-50 border-blue-300",
    description: "Plusieurs hypotheses porteuses speculatives. Vigilance requise.",
  },
  alert_dominant: {
    label: "Thèse non validée",
    shortLabel: "Non validée",
    color: "text-red-800",
    bg: "bg-red-50 border-red-300",
    description: "Signaux d'alerte dominants sur la these structurelle. Score global masque.",
  },
};

// Alert Signal Labels — analytical framing (no prescriptive language)
export const ALERT_SIGNAL_LABELS: Record<string, string> = {
  // New signal profile keys
  alert_dominant: "ANOMALIE MAJEURE",
  vigilance: "INVESTIGATION REQUISE",
  contrasted: "POINTS D'ATTENTION",
  favorable: "CONFORME",
  very_favorable: "CONFORME",
  // Legacy keys for backward compatibility
  STOP: "ANOMALIE MAJEURE",
  INVESTIGATE_FURTHER: "INVESTIGATION REQUISE",
  PROCEED_WITH_CAUTION: "POINTS D'ATTENTION",
  PROCEED: "CONFORME",
};

// Tier 1 Signal Intensity — Phase A slice A7b-3.
// 4 valeurs natives émises par les agents Tier 1 (helper A7b-1
// `deriveTier1SignalIntensity`) : low / elevated / high / critical.
// L'UI Tier 1 lit `data.signalIntensity` natif ; `alertSignal.recommendation`
// reste consommé uniquement en fallback read-only pour les analyses
// persistées avant A7b-2.
export type Tier1SignalIntensityValue = "low" | "elevated" | "high" | "critical";

export const TIER1_SIGNAL_INTENSITY_LABELS: Record<Tier1SignalIntensityValue, string> = {
  critical: "ANOMALIE MAJEURE",
  high: "INVESTIGATION REQUISE",
  elevated: "POINTS D'ATTENTION",
  low: "CONFORME",
};

// Tailwind classes par intensité — alignées sur le système existant
// (rouge / orange / jaune / vert) déjà utilisé par les blocs alertSignal
// inline. Centraliser ici évite la duplication des 5 sites dans
// tier1-results.tsx.
export const TIER1_SIGNAL_INTENSITY_BLOCK_CLASS: Record<Tier1SignalIntensityValue, string> = {
  critical: "bg-red-50 border-red-200",
  high: "bg-orange-50 border-orange-200",
  elevated: "bg-yellow-50 border-yellow-200",
  low: "bg-green-50 border-green-200",
};

export const TIER1_SIGNAL_INTENSITY_BADGE_CLASS: Record<Tier1SignalIntensityValue, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  elevated: "bg-yellow-100 text-yellow-800",
  low: "bg-green-100 text-green-800",
};

// Mapping legacy → intensity, utilisé uniquement en fallback read-only
// (analyses persistées pré-A7b-2 où le runtime n'émettait pas encore
// `signalIntensity` natif). À NE PAS utiliser dans un chemin LLM ou un
// builder runtime — la dérivation runtime canonique passe par le helper
// `deriveTier1SignalIntensity` (A7b-1).
export const TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY: Record<string, Tier1SignalIntensityValue> = {
  STOP: "critical",
  INVESTIGATE_FURTHER: "high",
  PROCEED_WITH_CAUTION: "elevated",
  PROCEED: "low",
};

/**
 * Résout une intensité Tier 1 à partir des champs sources.
 *
 * Priorité :
 *   1. `signalIntensity` natif (post-A7b-2) — chemin canonique.
 *   2. `legacyRecommendation` (analyses persistées pré-A7b-2) — fallback
 *      read-only documenté. Mappe `PROCEED|...|STOP` vers l'intensité
 *      correspondante.
 *   3. `null` si aucune des deux n'est exploitable.
 *
 * IMPORTANT : ce helper est strictement read-only. Aucune écriture, aucune
 * dérivation runtime ne doit passer par lui — il sert uniquement à
 * permettre aux consumers UI/PDF d'afficher de manière homogène les
 * analyses anciennes et nouvelles. Toute logique métier doit utiliser
 * `deriveTier1SignalIntensity` du helper A7b-1.
 */
export function resolveTier1SignalIntensity(
  signalIntensity: string | null | undefined,
  legacyRecommendation: string | null | undefined,
): Tier1SignalIntensityValue | null {
  if (
    signalIntensity === "low" ||
    signalIntensity === "elevated" ||
    signalIntensity === "high" ||
    signalIntensity === "critical"
  ) {
    return signalIntensity;
  }
  if (typeof legacyRecommendation === "string" && legacyRecommendation in TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY) {
    return TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY[legacyRecommendation];
  }
  return null;
}

// Readiness Labels — analytical framing
export const READINESS_LABELS: Record<string, string> = {
  READY_TO_INVEST: "Données suffisantes",
  NEEDS_MORE_DD: "Investigation complémentaire",
  SIGNIFICANT_CONCERNS: "Points d'attention majeurs",
  DO_NOT_PROCEED: "Alertes critiques",
};

// =============================================================================
// Tier 2 — Sector fit labels (Phase A slice A8b)
// =============================================================================
//
// Source de vérité pour les libellés user-facing du verdict sectoriel
// canonique exposé par `ExtendedSectorData.verdict.recommendation`
// (5 valeurs : STRONG_FIT | GOOD_FIT | MODERATE_FIT | POOR_FIT |
// NOT_RECOMMENDED).
//
// Consumers :
//   - UI : `src/components/deals/tier2-results.tsx` (`SECTOR_FIT_CONFIG`
//     emprunte ces libellés ; les classes Tailwind + icônes restent
//     locales au consumer pour permettre l'évolution du design system).
//   - PDF : `src/lib/pdf/pdf-sections/tier2-expert.tsx` (`<ExtendedVerdict>`
//     remplace le rendu brut `verdict.recommendation.replace(/_/g, " ")`
//     par un lookup ici).
//
// Wording doctrinaire (cf. § doctrine 2 strates) : tous les libellés sont
// formulés en termes d'adéquation sectorielle (fit), pas en termes
// d'instruction d'investissement. `NOT_RECOMMENDED` est verbalisé "Hors
// profil sectoriel" et non "Ne pas investir" (l'enum interne canonique
// n'est PAS renommé en Phase A — décision Codex A8 audit point 1).

export type Tier2SectorFitValue =
  | "STRONG_FIT"
  | "GOOD_FIT"
  | "MODERATE_FIT"
  | "POOR_FIT"
  | "NOT_RECOMMENDED";

export const TIER2_SECTOR_FIT_LABELS: Record<Tier2SectorFitValue, string> = {
  STRONG_FIT: "Forte adéquation sectorielle",
  GOOD_FIT: "Bonne adéquation sectorielle",
  MODERATE_FIT: "Adéquation sectorielle modérée",
  POOR_FIT: "Adéquation sectorielle faible",
  NOT_RECOMMENDED: "Hors profil sectoriel",
};

/**
 * Résout un libellé Tier 2 doctrinaire à partir d'une valeur sectorielle
 * canonique. Retourne `null` si la valeur n'est pas dans l'enum (cas
 * dégradé — le consumer décide d'afficher un fallback ou rien).
 *
 * Lecture seule — aucune dérivation runtime ne doit transiter par ce
 * helper.
 */
export function getTier2SectorFitLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (value in TIER2_SECTOR_FIT_LABELS) {
    return TIER2_SECTOR_FIT_LABELS[value as Tier2SectorFitValue];
  }
  return null;
}

// =============================================================================
// Evidence Solidity — axe 2 du modèle 2 axes (solidité des preuves)
// =============================================================================
//
// Distinct de `thesisSolidityScore` du Board (numérique 0-100). Ici on parle de
// la solidité des preuves agrégées pour qualifier un signal (sources, fraîcheur,
// cross-référence, contradiction documentaire).
//
// Règle critique : il n'y a PAS de valeur canonique "unknown".
//   - 5 valeurs qualifiées : strong | moderate | low | contradictory | insufficient
//   - absence = null | undefined (côté contrat)
//   - fallback affichable "Solidité à qualifier" uniquement si la surface le demande
//     explicitement (cf. getEvidenceSolidityLabel + flag showUnqualified du composant)

/** Valeurs canoniques de la solidité des preuves. */
export const EVIDENCE_SOLIDITY_VALUES = [
  "strong",
  "moderate",
  "low",
  "contradictory",
  "insufficient",
] as const;

export type EvidenceSolidity = (typeof EVIDENCE_SOLIDITY_VALUES)[number];

export const EVIDENCE_SOLIDITY_CONFIG: Record<EvidenceSolidity, {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  description: string;
}> = {
  strong: {
    label: "Preuves solides",
    shortLabel: "Solides",
    color: "text-emerald-800",
    bg: "bg-emerald-50 border-emerald-300",
    description: "Sources documentaires multiples avec cross-référence.",
  },
  moderate: {
    label: "Preuves partielles",
    shortLabel: "Partielles",
    color: "text-blue-800",
    bg: "bg-blue-50 border-blue-300",
    description: "Sources présentes mais lacunes ou incertitudes.",
  },
  low: {
    label: "Preuves faibles",
    shortLabel: "Faibles",
    color: "text-amber-800",
    bg: "bg-amber-50 border-amber-300",
    description: "Peu de sources, fraîcheur ou fiabilité limitée.",
  },
  contradictory: {
    label: "Preuves contradictoires",
    shortLabel: "Contradictoires",
    color: "text-orange-800",
    bg: "bg-orange-50 border-orange-300",
    description: "Sources en désaccord direct. Investigation requise.",
  },
  insufficient: {
    label: "Données insuffisantes",
    shortLabel: "Insuffisantes",
    color: "text-slate-800",
    bg: "bg-slate-50 border-slate-300",
    description: "Trop peu d'éléments pour qualifier les preuves.",
  },
};

/**
 * Fallback label volontairement NON exporté. La seule façon de l'obtenir est
 * d'appeler `getEvidenceSolidityLabel(value, { showUnqualified: true })`. Cela
 * empêche une surface en aval d'importer le label brut et de l'afficher sans
 * passer par le flag opt-in.
 */
const EVIDENCE_SOLIDITY_UNQUALIFIED_LABEL = "Solidité à qualifier";

const EVIDENCE_SOLIDITY_KEY_SET: ReadonlySet<string> = new Set(EVIDENCE_SOLIDITY_VALUES);

/**
 * Retourne la config solidité pour une valeur qualifiée, ou `null` si la
 * valeur est absente / non reconnue. Pas de fallback ici — c'est à l'appelant
 * de décider d'afficher ou non un état non qualifié.
 */
export function getEvidenceSolidityConfig(
  value: EvidenceSolidity | string | null | undefined,
): (typeof EVIDENCE_SOLIDITY_CONFIG)[EvidenceSolidity] | null {
  if (value == null) return null;
  if (!EVIDENCE_SOLIDITY_KEY_SET.has(value)) return null;
  return EVIDENCE_SOLIDITY_CONFIG[value as EvidenceSolidity];
}

/**
 * Retourne le label long FR pour une valeur de solidité, ou `null` si la
 * valeur est absente / non reconnue.
 *
 * Le label fallback ("Solidité à qualifier") n'est PAS exporté en tant que
 * constante. La seule façon de l'obtenir est de passer explicitement
 * `{ showUnqualified: true }` ici. Cela évite qu'une surface importe le label
 * brut et l'affiche sans passer par le flag opt-in.
 */
export function getEvidenceSolidityLabel(
  value: EvidenceSolidity | string | null | undefined,
  options?: { showUnqualified?: boolean },
): string | null {
  const cfg = getEvidenceSolidityConfig(value);
  if (cfg) return cfg.label;
  return options?.showUnqualified === true ? EVIDENCE_SOLIDITY_UNQUALIFIED_LABEL : null;
}

// =============================================================================
// Enum FR Labels — centralized translations for agent output enums
// English business terms (Burn Rate, ARR, Churn) stay in EN with tooltips
// =============================================================================

/** Burn efficiency labels */
export const BURN_EFFICIENCY_LABELS: Record<string, string> = {
  EFFICIENT: "Efficace",
  MODERATE: "Modéré",
  INEFFICIENT: "Inefficace",
};

/** Competitive moat labels */
export const MOAT_LABELS: Record<string, string> = {
  STRONG_MOAT: "Fort avantage concurrentiel",
  MODERATE_MOAT: "Avantage modéré",
  WEAK_MOAT: "Avantage faible",
  NO_MOAT: "Pas d'avantage identifié",
  NARROW_MOAT: "Avantage étroit",
};

/** Product-market fit labels */
export const PMF_LABELS: Record<string, string> = {
  STRONG: "Fort",
  MODERATE: "Modéré",
  WEAK: "Faible",
  EARLY: "Précoce",
  NONE: "Non identifié",
};

/** Channel diversification labels */
export const DIVERSIFICATION_LABELS: Record<string, string> = {
  HIGH: "Élevée",
  MODERATE: "Modérée",
  LOW: "Faible",
  DIVERSIFIED: "Diversifié",
  CONCENTRATED: "Concentré",
};

/** Concentration level labels */
export const CONCENTRATION_LABELS: Record<string, string> = {
  LOW: "Faible",
  MODERATE: "Modérée",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

/** Generic level/strength labels */
export const LEVEL_LABELS: Record<string, string> = {
  HIGH: "Élevé",
  MODERATE: "Modéré",
  LOW: "Faible",
  STRONG: "Fort",
  WEAK: "Faible",
  CRITICAL: "Critique",
  NONE: "Aucun",
};

/**
 * Get FR label for any enum value.
 * Falls back to the original value with underscores replaced by spaces.
 */
export function getEnumLabel(value: string, labels?: Record<string, string>): string {
  if (labels && value in labels) return labels[value];
  if (value in LEVEL_LABELS) return LEVEL_LABELS[value];
  return value.replace(/_/g, " ");
}

// =============================================================================
// Thesis alert categories — libellés FR user-facing pour ThesisAlertCategory
// (src/agents/thesis/types.ts). Affichés dans la Section 2 « Alertes thèse ».
// L'enum brut (ex. "ASSUMPTION_FRAGILE") ne doit JAMAIS être rendu tel quel.
// =============================================================================
export const THESIS_ALERT_CATEGORY_LABELS: Record<string, string> = {
  why_now: "Timing",
  problem_reality: "Réalité du problème",
  solution_fit: "Adéquation solution",
  moat: "Défensibilité",
  unit_economics: "Économie unitaire",
  team_dependency: "Dépendance équipe",
  market_size: "Taille de marché",
  assumption_fragile: "Hypothèse fragile",
};

/**
 * Libellé FR pour une catégorie d'alerte thèse. Fallback humanisé (underscores
 * → espaces, capitalisation) pour toute catégorie non mappée — jamais d'enum brut.
 */
export function thesisAlertCategoryLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  const key = category.toLowerCase();
  if (key in THESIS_ALERT_CATEGORY_LABELS) return THESIS_ALERT_CATEGORY_LABELS[key];
  const humanized = key.replace(/_/g, " ").trim();
  return humanized.length > 0 ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : null;
}

// =============================================================================
// Fact key display labels — libellés FR courts pour la taxonomie FACT_KEYS
// (src/services/fact-store/fact-keys.ts). Affichés dans la colonne « Affirmation »
// de la table Preuves consolidées. Les acronymes métier (ARR/MRR/CAC/LTV/EBITDA/
// TAM…) restent en EN. Doit rester aligné sur FACT_KEYS — clés inconnues =>
// fallback humanisé par getFactKeyLabel().
// =============================================================================
export const FACT_KEY_LABELS: Record<string, string> = {
  "company.name": "Nom de la société",
  // Financial
  "financial.arr": "ARR",
  "financial.mrr": "MRR",
  "financial.revenue": "Chiffre d'affaires",
  "financial.revenue_growth_yoy": "Croissance du CA (YoY)",
  "financial.revenue_growth_mom": "Croissance du CA (MoM)",
  "financial.burn_rate": "Burn rate",
  "financial.runway_months": "Runway (mois)",
  "financial.gross_margin": "Marge brute",
  "financial.net_margin": "Marge nette",
  "financial.ebitda": "EBITDA",
  "financial.cash_position": "Trésorerie",
  "financial.debt": "Dette",
  "financial.valuation_pre": "Valorisation pre-money",
  "financial.valuation_post": "Valorisation post-money",
  "financial.valuation_multiple": "Multiple de valorisation",
  "financial.amount_raised_total": "Total levé à ce jour",
  "financial.amount_raising": "Montant recherché",
  "financial.dilution_current_round": "Dilution (tour en cours)",
  "financial.post_money_ownership_founders": "Détention fondateurs (post-money)",
  // Traction
  "traction.churn_monthly": "Churn mensuel",
  "traction.churn_annual": "Churn annuel",
  "traction.nrr": "NRR",
  "traction.grr": "GRR",
  "traction.cac": "CAC",
  "traction.ltv": "LTV",
  "traction.ltv_cac_ratio": "Ratio LTV/CAC",
  "traction.payback_months": "Payback (mois)",
  "traction.customers_count": "Nombre de clients",
  "traction.users_count": "Nombre d'utilisateurs",
  "traction.dau": "DAU",
  "traction.mau": "MAU",
  "traction.conversion_rate": "Taux de conversion",
  "traction.arpu": "ARPU",
  "traction.arppu": "ARPPU",
  // Team
  "team.size": "Effectif",
  "team.headcount": "Effectif",
  "team.founders_count": "Nombre de fondateurs",
  "team.technical_count": "Effectif technique",
  "team.technical_ratio": "Ratio technique",
  "team.ceo.name": "CEO",
  "team.ceo.linkedin": "LinkedIn du CEO",
  "team.ceo.background": "Parcours du CEO",
  "team.ceo.previous_exits": "Exits précédents du CEO",
  "team.cto.name": "CTO",
  "team.cto.linkedin": "LinkedIn du CTO",
  "team.cto.background": "Parcours du CTO",
  "team.advisors_count": "Nombre de conseillers",
  "team.advisors": "Conseillers",
  "team.vesting_months": "Vesting (mois)",
  "team.cliff_months": "Cliff (mois)",
  // Market
  "market.tam": "TAM",
  "market.sam": "SAM",
  "market.som": "SOM",
  "market.cagr": "CAGR du marché",
  "market.geography_primary": "Géographie principale",
  "market.geography_expansion": "Expansion géographique",
  "market.segment": "Segment",
  "market.vertical": "Verticale",
  "market.b2b_or_b2c": "Modèle (B2B/B2C)",
  "market.timing_assessment": "Timing de marché",
  // Product
  "product.name": "Produit",
  "product.tagline": "Tagline",
  "product.stage": "Stade produit",
  "product.launch_date": "Date de lancement",
  "product.tech_stack": "Stack technique",
  "product.moat": "Moat",
  "product.ip_patents_count": "Brevets (IP)",
  "product.nps": "NPS",
  "product.time_to_value_days": "Time-to-value (jours)",
  "product.integration_count": "Intégrations",
  // Competition
  "competition.main_competitor": "Concurrent principal",
  "competition.competitors_count": "Nombre de concurrents",
  "competition.competitor_count": "Nombre de concurrents",
  "competition.competitors_list": "Liste des concurrents",
  "competition.competitors_funded": "Concurrents financés",
  "competition.differentiation": "Différenciation",
  "competition.market_position": "Position de marché",
  "competition.switching_cost": "Coût de changement",
  "competition.big_tech_threat": "Menace des Big Tech",
  // Legal
  "legal.incorporation_country": "Pays d'incorporation",
  "legal.incorporation_date": "Date d'incorporation",
  "legal.legal_structure": "Structure juridique",
  "legal.patents_filed": "Brevets déposés",
  "legal.patents_granted": "Brevets accordés",
  "legal.pending_litigation": "Litiges en cours",
  "legal.regulatory_approvals": "Agréments réglementaires",
  "legal.compliance_certifications": "Certifications de conformité",
  // Other
  "other.founding_date": "Date de création",
  "other.headquarters": "Siège social",
  "other.website": "Site web",
  "other.sector": "Secteur",
};

/**
 * Libellé FR court pour une clé fact-key. Fallback gracieux pour toute clé non
 * mappée : dernier segment, underscores → espaces, première lettre en majuscule.
 */
export function getFactKeyLabel(key: string): string {
  if (key in FACT_KEY_LABELS) return FACT_KEY_LABELS[key];
  const last = key.split(".").pop() ?? key;
  const humanized = last.replace(/_/g, " ").trim();
  return humanized.length > 0 ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : key;
}

// =============================================================================
// Next steps — le memo-generator sérialise chaque étape en "[PRIORITY] [OWNER] action".
// Source unique du parsing + des libellés FR (badges), partagée par toutes les
// surfaces de rendu (Tier 3 web, mémo V2, mémo complet, PDF).
// =============================================================================
export const NEXT_STEP_PRIORITY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immédiat",
  BEFORE_TERM_SHEET: "Avant term sheet",
  DURING_DD: "Pendant la DD",
};

export const NEXT_STEP_OWNER_LABELS: Record<string, string> = {
  INVESTOR: "Investisseur",
  FOUNDER: "Fondateur",
};

export type ParsedNextStep = { priority: string | null; owner: string | null; text: string };

/** Parse "[IMMEDIATE] [INVESTOR] action" → { priority, owner, text }. */
export function parseNextStep(raw: string): ParsedNextStep {
  const match = raw.match(/^(?:\[([A-Z_]+)\])?\s*(?:\[([A-Z_]+)\])?\s*([\s\S]+)$/);
  if (!match) return { priority: null, owner: null, text: raw };
  let priority: string | null = null;
  let owner: string | null = null;
  for (const tag of [match[1], match[2]]) {
    if (!tag) continue;
    if (tag in NEXT_STEP_PRIORITY_LABELS) priority = tag;
    else if (tag in NEXT_STEP_OWNER_LABELS) owner = tag;
  }
  return { priority, owner, text: match[3].trim() };
}

export function nextStepPriorityLabel(priority: string | null): string | null {
  return priority ? NEXT_STEP_PRIORITY_LABELS[priority] ?? priority : null;
}

export function nextStepOwnerLabel(owner: string | null): string | null {
  return owner ? NEXT_STEP_OWNER_LABELS[owner] ?? owner : null;
}
