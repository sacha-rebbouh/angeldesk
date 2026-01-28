// ═══════════════════════════════════════════════════════════════════════
// FACT STORE - PUBLIC API
// Event sourcing system for deal facts
// ═══════════════════════════════════════════════════════════════════════

// Types
export * from './types';

// Fact Keys Taxonomy
export * from './fact-keys';

// Persistence (CRUD)
export {
  // Create
  createFactEvent,
  createFactEventsBatch,
  createSupersessionEvent,
  // Read
  getFactEvents,
  getFactEventById,
  getFactEventHistory,
  getLatestFactEvents,
  // Update (via supersession)
  markAsSuperseded,
  // Helpers
  toFactEventRecord,
  getFactEventStats,
  hasFactEvents,
  getFactKeysForDeal,
} from './persistence';

// Matching & Supersession Logic
export {
  // Main matching
  matchFact,
  matchFactsBatch,
  // Contradiction detection
  detectContradiction,
  detectAllContradictions,
  // Helpers
  getSourcePriority,
  compareSourcePriority,
  shouldPersistFact,
  needsHumanReview,
  getSourcesByPriority,
} from './matching';

// Current Facts (Materialized View)
export {
  // Main functions
  getCurrentFacts,
  getCurrentFactByKey,
  getCurrentFactsByCategory,
  getCurrentFactsBySource,
  getDisputedFacts,
  // Formatting for agents
  formatFactStoreForAgents,
  formatFactStoreAsJSON,
  getFactStoreSummary,
  // Value extraction
  getFactValue,
  getFactValues,
  checkFactCompleteness,
  // Metric helpers
  getKeyFinancialMetrics,
  getKeyTractionMetrics,
} from './current-facts';
