// ============================================================================
// CREDIT SYSTEM — Pack-based credits (replaces old quota system)
// ============================================================================

// --- Credit costs per action ---
// Thesis-first (2026-04-17) : QUICK_SCAN est deprecated (tier retire). Le type
// reste pour les historiques de transactions mais n'est plus consomme a la
// creation d'une nouvelle analyse. THESIS_REBUTTAL + THESIS_REEXTRACT ajoutes.
export type CreditActionType =
  | 'QUICK_SCAN'      // DEPRECATED — tier retire, conserve pour historique
  | 'DEEP_DIVE'       // Tier 0.5 (thesis) + Tier 1+2+3 + reconciler
  | 'AI_BOARD'        // 4 LLMs en debat, inclut round THESIS_DEBATE
  | 'LIVE_COACHING'   // Session 30 min
  | 'RE_ANALYSIS'     // Re-analyse avec nouvelles donnees
  | 'THESIS_REBUTTAL' // Contestation BA sur reformulation these
  | 'THESIS_REEXTRACT' // Auto re-extraction sur nouveau doc upload
  | 'EXTRACTION_STANDARD_PAGE' // Standard OCR page
  | 'EXTRACTION_HIGH_PAGE'     // High fidelity extraction page
  | 'EXTRACTION_SUPREME_PAGE'  // Supreme extraction page
  | 'CHAT'            // Chat IA (gratuit)
  | 'PDF_EXPORT';     // Export PDF (gratuit)

export const CREDIT_COSTS: Record<CreditActionType, number> = {
  QUICK_SCAN: 1, // deprecated mais valeur conservee pour historique
  DEEP_DIVE: 5,
  AI_BOARD: 10,
  LIVE_COACHING: 8,
  RE_ANALYSIS: 3,
  THESIS_REBUTTAL: 1,
  THESIS_REEXTRACT: 1,
  EXTRACTION_STANDARD_PAGE: 0,
  EXTRACTION_HIGH_PAGE: 1,
  EXTRACTION_SUPREME_PAGE: 2,
  CHAT: 0,
  PDF_EXPORT: 0,
} as const;

// --- Credit packs ---
export interface CreditPackConfig {
  name: string;
  displayName: string;
  credits: number;
  priceEur: number;
  perCredit: number;
  description: string;
  highlight?: boolean; // Recommended pack
}

export const CREDIT_PACKS: CreditPackConfig[] = [
  {
    name: 'starter',
    displayName: 'Starter',
    credits: 10,
    priceEur: 49,
    perCredit: 4.90,
    description: '2 Deep Dives, ou 1 Deep Dive + 5 Quick Scans',
  },
  {
    name: 'standard',
    displayName: 'Standard',
    credits: 30,
    priceEur: 99,
    perCredit: 3.30,
    description: '1 deal full package + 4 crédits restants',
  },
  {
    name: 'pro',
    displayName: 'Pro',
    credits: 60,
    priceEur: 179,
    perCredit: 2.98,
    description: '2 deals full + 8 crédits de screening',
    highlight: true,
  },
  {
    name: 'expert',
    displayName: 'Expert',
    credits: 125,
    priceEur: 329,
    perCredit: 2.63,
    description: '4 deals full + 21 crédits de screening',
  },
  {
    name: 'fund',
    displayName: 'Fund',
    credits: 300,
    priceEur: 749,
    perCredit: 2.50,
    description: '11 deals full + 14 crédits',
  },
] as const;

// --- Free tier ---
export const FREE_TIER = {
  initialCredits: 5, // 1 Deep Dive offert
  requiresCard: false,
} as const;

// --- Credit rules ---
export const CREDIT_RULES = {
  expiryMonths: 6,
  autoRefillDiscount: 0.15, // 15% discount
  rolloverMax: 2, // Can accumulate up to 2x pack on auto-refill
} as const;

// --- Feature access by pack tier ---
// API access requires Expert+ (125+ credits lifetime purchased)
export const FEATURE_ACCESS = {
  api: { minTotalPurchased: 125, rateLimits: { starter: 0, standard: 0, pro: 0, expert: 1000, fund: 1000 } },
  negotiation: { minTotalPurchased: 60 },  // Available from Pro
} as const;

// --- Result types ---
export interface CreditCheckResult {
  allowed: boolean;
  reason: 'OK' | 'INSUFFICIENT_CREDITS' | 'NO_ACCOUNT';
  balance: number;
  cost: number;
  balanceAfter: number;
}

export interface CreditBalanceInfo {
  balance: number;
  totalPurchased: number;
  lastPackName: string | null;
  autoRefill: boolean;
  expiresAt: Date | null;
  freeCreditsGranted: boolean;
}

// --- Full deal package cost ---
export const FULL_DEAL_PACKAGE_CREDITS =
  CREDIT_COSTS.DEEP_DIVE +
  CREDIT_COSTS.AI_BOARD +
  CREDIT_COSTS.LIVE_COACHING +
  CREDIT_COSTS.RE_ANALYSIS; // = 26

// --- Mapping from old analysis types to credit actions ---
export function getActionForAnalysisType(analysisType: string): CreditActionType {
  switch (analysisType) {
    case 'tier1_complete':
    case 'extraction':
      return 'QUICK_SCAN';
    case 'full_analysis':
    case 'full_dd':
    case 'tier2_sector':
    case 'tier3_synthesis':
      return 'DEEP_DIVE';
    default:
      return 'QUICK_SCAN';
  }
}
