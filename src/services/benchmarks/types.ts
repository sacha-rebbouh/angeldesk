/**
 * Benchmarks Service - Types
 *
 * Centralisation de tous les benchmarks utilisés par les agents.
 * Avant: valeurs hard-codées éparpillées dans 5+ fichiers
 * Après: un seul endroit, différencié par secteur/stage
 */

// Stages de financement
export type FundingStage = "PRE_SEED" | "SEED" | "SERIES_A" | "SERIES_B" | "SERIES_C" | "LATER";

// Secteurs supportés
export type Sector =
  | "SaaS"
  | "Fintech"
  | "Marketplace"
  | "Healthtech"
  | "Deeptech"
  | "Climate"
  | "Consumer"
  | "Hardware"
  | "Gaming"
  | "Other";

// Structure d'un benchmark avec percentiles
export interface PercentileBenchmark {
  p25: number;
  median: number;
  p75: number;
  source?: string; // Source de la donnée (ex: "OpenVC 2024", "First Round")
  sourceUrl?: string;          // URL du rapport source
  lastUpdated?: string;        // ISO date de la derniere mise a jour
  expiresAt?: string;          // ISO date d'expiration (lastUpdated + 12 mois)
  dataYear?: number;           // Annee des donnees (ex: 2024, 2025)
}

// Benchmarks financiers
export interface FinancialBenchmarks {
  arrGrowthYoY: PercentileBenchmark;        // Croissance ARR annuelle (%)
  nrr: PercentileBenchmark;                  // Net Revenue Retention (%)
  grossRetention: PercentileBenchmark;       // Gross Retention (%)
  burnMultiple: PercentileBenchmark;         // Burn Multiple (x)
  valuationMultiple: PercentileBenchmark;    // Multiple de valorisation (xARR)
  ltvCacRatio: PercentileBenchmark;          // LTV/CAC Ratio (x)
  cacPaybackMonths: PercentileBenchmark;     // CAC Payback (mois)
  dilution: PercentileBenchmark;             // Dilution par round (%)
}

// Benchmarks de sortie (M&A, IPO)
export interface ExitBenchmarks {
  revenueMultiple: PercentileBenchmark;      // Multiple de revenu à la sortie
  timeToLiquidityYears: {
    bestCase: number;
    baseCase: number;
    worstCase: number;
  };
}

// Benchmarks équipe
export interface TeamBenchmarks {
  minFounders: number;                       // Nombre minimum de fondateurs recommandé
  optimalFounders: number;                   // Nombre optimal de fondateurs
  technicalCofounderRequired: boolean;       // CTO/tech cofounder nécessaire ?
}

// Configuration complète d'un secteur/stage
export interface SectorStageBenchmarks {
  financial: FinancialBenchmarks;
  exit: ExitBenchmarks;
  team: TeamBenchmarks;
}

// Map complète des benchmarks par secteur et stage
export type BenchmarkConfig = {
  [sector in Sector]?: {
    [stage in FundingStage]?: Partial<SectorStageBenchmarks>;
  };
};

// Préférences utilisateur (BA)
export interface BAPreferences {
  // Investment profile
  typicalTicketPercent: number;              // % du round que le BA investit typiquement
  maxTicketAmount: number;                   // Montant max d'investissement
  minTicketAmount: number;                   // Montant min d'investissement

  // Sectors d'intérêt
  preferredSectors: Sector[];
  excludedSectors: Sector[];

  // Stage preferences
  preferredStages: FundingStage[];

  // Geography
  preferredGeographies: string[];

  // Risk tolerance (1-5, 1=conservateur, 5=agressif)
  riskTolerance: number;

  // Time horizon for liquidity (years)
  expectedHoldingPeriod: number;

  /** Thèse d'investissement libre du BA (F72) */
  investmentThesis?: string;

  /** Co-investissement préféré */
  coInvestmentPreference?: "solo" | "syndicate" | "club_deal";

  /** Portfolio actuel - noms des sociétés déjà investies (pour overlap detection) */
  portfolioCompanies?: string[];

  /** Critères "must-have" pour investir */
  mustHaveCriteria?: string[];
}

// Valeurs par défaut pour un BA
export const DEFAULT_BA_PREFERENCES: BAPreferences = {
  typicalTicketPercent: 0.10,    // 10% du round
  maxTicketAmount: 50000,        // 50K€ max
  minTicketAmount: 5000,         // 5K€ min
  preferredSectors: [],
  excludedSectors: [],
  preferredStages: ["PRE_SEED", "SEED"],
  preferredGeographies: ["France", "Europe"],
  riskTolerance: 3,
  expectedHoldingPeriod: 7,      // 7 ans
};
