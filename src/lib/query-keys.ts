// Query Key Factory Pattern for React Query
// Ensures consistent and type-safe query keys across the application

export const queryKeys = {
  // Deal queries
  deals: {
    all: ["deals"] as const,
    lists: () => [...queryKeys.deals.all, "list"] as const,
    list: (filters?: { status?: string; stage?: string }) =>
      [...queryKeys.deals.lists(), filters] as const,
    details: () => [...queryKeys.deals.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.deals.details(), id] as const,
    analyses: (dealId: string) =>
      [...queryKeys.deals.detail(dealId), "analyses"] as const,
    documents: (dealId: string) =>
      [...queryKeys.deals.detail(dealId), "documents"] as const,
    redFlags: (dealId: string) =>
      [...queryKeys.deals.detail(dealId), "redFlags"] as const,
    founders: (dealId: string) =>
      [...queryKeys.deals.detail(dealId), "founders"] as const,
  },

  // Analysis queries
  analyses: {
    all: ["analyses"] as const,
    byId: (id: string) => [...queryKeys.analyses.all, id] as const,
    byDeal: (dealId: string) =>
      [...queryKeys.analyses.all, "deal", dealId] as const,
    latest: (dealId: string) =>
      [...queryKeys.analyses.all, "latest", dealId] as const,
  },

  // Document queries
  documents: {
    all: ["documents"] as const,
    byId: (id: string) => [...queryKeys.documents.all, id] as const,
    byDeal: (dealId: string) =>
      [...queryKeys.documents.all, "deal", dealId] as const,
  },

  // Quota queries
  quota: {
    all: ["quota"] as const,
  },

  // Founder responses
  founderResponses: {
    all: ["founderResponses"] as const,
    byDeal: (dealId: string) => [...queryKeys.founderResponses.all, dealId] as const,
  },

  // Staleness queries
  staleness: {
    all: ["staleness"] as const,
    byDeal: (dealId: string) => [...queryKeys.staleness.all, dealId] as const,
  },

  // Usage queries (for analyze usage limits)
  usage: {
    all: ["usage"] as const,
    analyze: () => [...queryKeys.usage.all, "analyze"] as const,
  },

  // User preferences
  userPreferences: {
    all: ["userPreferences"] as const,
  },

  // Deal terms queries
  dealTerms: {
    all: ["dealTerms"] as const,
    byDeal: (dealId: string) => ["dealTerms", dealId] as const,
    versions: (dealId: string) => ["dealTerms", dealId, "versions"] as const,
    benchmarks: (dealId: string) => ["dealTerms", dealId, "benchmarks"] as const,
    simulation: (dealId: string) => ["dealTerms", dealId, "simulation"] as const,
    extraction: (dealId: string) => ["dealTerms", dealId, "extraction"] as const,
  },

  // Facts queries
  facts: {
    all: ["facts"] as const,
    byDeal: (dealId: string) => ["facts", dealId] as const,
  },

  // Fact reviews queries
  factReviews: {
    all: ["fact-reviews"] as const,
    byDeal: (dealId: string) => ["fact-reviews", dealId] as const,
  },

  // Board queries
  board: {
    all: ["board"] as const,
    credits: () => ["board", "credits"] as const,
    session: (sessionId: string) => ["board", "session", sessionId] as const,
    dealSessions: (dealId: string) => ["board", "deal", dealId] as const,
  },

  // Costs queries (admin dashboard)
  costs: {
    all: ["costs"] as const,
    stats: (days: number, startDate?: string, endDate?: string) =>
      [...queryKeys.costs.all, "stats", days, startDate, endDate] as const,
    users: (days: number, params?: { sortBy?: string; sortOrder?: string }) =>
      [...queryKeys.costs.all, "users", days, params] as const,
    userDetail: (userId: string, days: number) =>
      [...queryKeys.costs.all, "user", userId, days] as const,
    dealDetail: (dealId: string) =>
      [...queryKeys.costs.all, "deal", dealId] as const,
    alerts: (params?: { acknowledged?: boolean; type?: string }) =>
      [...queryKeys.costs.all, "alerts", params] as const,
    boards: (days: number) =>
      [...queryKeys.costs.all, "boards", days] as const,
  },

  // Admin queries
  admin: {
    all: ["admin"] as const,
    users: () => [...queryKeys.admin.all, "users"] as const,
    usersList: (params?: { limit?: number; offset?: number }) =>
      [...queryKeys.admin.users(), "list", params] as const,
  },

  // Alert resolutions
  resolutions: {
    all: ["resolutions"] as const,
    byDeal: (dealId: string) => ["resolutions", dealId] as const,
  },

  // Chat queries
  chat: {
    all: ["chat"] as const,
    conversations: (dealId: string) =>
      [...queryKeys.chat.all, "conversations", dealId] as const,
    messages: (dealId: string, conversationId: string) =>
      [...queryKeys.chat.all, "messages", dealId, conversationId] as const,
  },

  // Live coaching queries
  live: {
    all: ["live"] as const,
    sessions: (dealId: string) => ["live", "sessions", dealId] as const,
    session: (sessionId: string) => ["live", "session", sessionId] as const,
    cards: (sessionId: string) => ["live", "cards", sessionId] as const,
    context: (dealId: string) => ["live", "context", dealId] as const,
    summary: (sessionId: string) => ["live", "summary", sessionId] as const,
  },
} as const;

// Type helper for extracting query key types
export type QueryKeys = typeof queryKeys;
