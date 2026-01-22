// Query Key Factory Pattern for React Query
// Ensures consistent and type-safe query keys across the application

export const queryKeys = {
  // User queries
  user: {
    all: ["user"] as const,
    current: () => [...queryKeys.user.all, "current"] as const,
    byId: (id: string) => [...queryKeys.user.all, id] as const,
  },

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
  },

  // Document queries
  documents: {
    all: ["documents"] as const,
    byId: (id: string) => [...queryKeys.documents.all, id] as const,
    byDeal: (dealId: string) =>
      [...queryKeys.documents.all, "deal", dealId] as const,
  },

  // Benchmark queries
  benchmarks: {
    all: ["benchmarks"] as const,
    bySectorStage: (sector: string, stage: string) =>
      [...queryKeys.benchmarks.all, sector, stage] as const,
  },

  // Usage queries (for analyze usage limits)
  usage: {
    all: ["usage"] as const,
    analyze: () => ["analyze", "usage"] as const,
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
} as const;

// Type helper for extracting query key types
export type QueryKeys = typeof queryKeys;
