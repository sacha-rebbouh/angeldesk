/**
 * Negotiation Services
 *
 * Post-processing services for generating negotiation strategies
 * based on analysis results.
 */

export {
  generateNegotiationStrategy,
  updatePointStatus,
  calculateImprovedScore,
} from "./strategist";

export type {
  NegotiationStrategy,
  NegotiationPoint,
  Dealbreaker,
  TradeOff,
  AnalysisResults,
} from "./strategist";
