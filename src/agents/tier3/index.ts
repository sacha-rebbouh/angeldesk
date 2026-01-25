/**
 * Tier 3 Sector Experts
 * Dynamic agents activated based on deal sector
 */

// Export types
export * from "./types";
export * from "./base-sector-expert";

// Export individual sector experts
export { saasExpert } from "./saas-expert";
export { marketplaceExpert } from "./marketplace-expert";
export { fintechExpert } from "./fintech-expert";
export { healthtechExpert } from "./healthtech-expert";
export { deeptechExpert } from "./deeptech-expert";
export { climateExpert } from "./climate-expert";
export { hardwareExpert } from "./hardware-expert";
export { gamingExpert } from "./gaming-expert";
export { consumerExpert } from "./consumer-expert";

// Registry of all sector experts
import { saasExpert } from "./saas-expert";
import { marketplaceExpert } from "./marketplace-expert";
import { fintechExpert } from "./fintech-expert";
import { healthtechExpert } from "./healthtech-expert";
import { deeptechExpert } from "./deeptech-expert";
import { climateExpert } from "./climate-expert";
import { hardwareExpert } from "./hardware-expert";
import { gamingExpert } from "./gaming-expert";
import { consumerExpert } from "./consumer-expert";
import type { SectorExpertType, SectorExpertResult } from "./types";
import type { EnrichedAgentContext } from "../types";

// Type for any sector expert
export type AnySectorExpert = {
  name: SectorExpertType;
  run: (context: EnrichedAgentContext) => Promise<SectorExpertResult>
};

// All sector experts indexed by their type
export const SECTOR_EXPERTS: Record<
  SectorExpertType,
  { name: SectorExpertType; run: (context: EnrichedAgentContext) => Promise<SectorExpertResult> }
> = {
  "saas-expert": saasExpert,
  "marketplace-expert": marketplaceExpert,
  "fintech-expert": fintechExpert,
  "healthtech-expert": healthtechExpert,
  "deeptech-expert": deeptechExpert,
  "climate-expert": climateExpert,
  "hardware-expert": hardwareExpert,
  "gaming-expert": gamingExpert,
  "consumer-expert": consumerExpert,
};

// Shared sector patterns for matching
const SECTOR_PATTERNS: [SectorExpertType, string[]][] = [
  ["saas-expert", ["saas", "b2b software", "enterprise software", "software", "hrtech", "hr tech", "legaltech", "legal tech", "regtech"]],
  ["marketplace-expert", ["marketplace", "platform", "two-sided", "proptech", "prop tech", "real estate tech"]],
  ["fintech-expert", ["fintech", "payments", "banking", "insurance", "insurtech", "lending", "wealthtech", "neobank"]],
  ["healthtech-expert", ["healthtech", "medtech", "biotech", "healthcare", "digital health", "femtech", "mental health"]],
  ["deeptech-expert", ["deeptech", "ai/ml", "ai", "ml", "machine learning", "quantum", "blockchain", "web3", "cybersecurity", "cyber", "security"]],
  ["climate-expert", ["cleantech", "climate", "energy", "sustainability", "greentech", "agritech", "agtech", "foodtech", "food tech"]],
  ["hardware-expert", ["hardware", "iot", "robotics", "manufacturing", "industrial", "spacetech", "space tech", "drones"]],
  ["gaming-expert", ["gaming", "esports", "metaverse", "vr", "ar", "entertainment", "media tech"]],
  ["consumer-expert", ["consumer", "d2c", "social", "e-commerce", "retail", "food", "edtech", "ed tech", "education", "lifestyle"]],
];

// Get the appropriate sector expert for a deal
// Returns dynamic expert as fallback for unknown sectors
export function getSectorExpertForDeal(
  sector: string | null | undefined,
  useDynamicFallback: boolean = true
): AnySectorExpert | null {
  if (!sector) return null;

  const normalizedSector = sector.toLowerCase().trim();

  // Check each expert's sector patterns
  for (const [expertType, patterns] of SECTOR_PATTERNS) {
    for (const pattern of patterns) {
      if (normalizedSector.includes(pattern)) {
        return SECTOR_EXPERTS[expertType];
      }
    }
  }

  // No fallback - return null if no matching expert found
  return null;
}

// Get all matching sector experts (a deal might match multiple)
// If no specialized experts match and useDynamicFallback is true, returns dynamic expert
export function getAllSectorExpertsForDeal(
  sector: string | null | undefined,
  useDynamicFallback: boolean = true
): AnySectorExpert[] {
  if (!sector) return [];

  const normalizedSector = sector.toLowerCase().trim();
  const matches: AnySectorExpert[] = [];

  for (const [expertType, patterns] of SECTOR_PATTERNS) {
    for (const pattern of patterns) {
      if (normalizedSector.includes(pattern)) {
        matches.push(SECTOR_EXPERTS[expertType]);
        break; // Only add each expert once
      }
    }
  }

  return matches;
}
