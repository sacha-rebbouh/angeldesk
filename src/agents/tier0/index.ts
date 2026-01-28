/**
 * TIER 0 - Pre-Analysis Agents
 *
 * Ces agents s'executent AVANT tous les autres agents.
 * Ils preparent les donnees pour l'analyse.
 *
 * Agents:
 * - fact-extractor: Extraction structuree des faits avec confidence scoring
 */

export { FactExtractorAgent, factExtractorAgent } from "./fact-extractor";
export type {
  FactExtractorInput,
  FactExtractorOutput,
  FactExtractorDocument,
  FounderResponse,
} from "./fact-extractor";
