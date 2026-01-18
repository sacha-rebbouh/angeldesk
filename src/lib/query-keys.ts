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
} as const;

// Type helper for extracting query key types
export type QueryKeys = typeof queryKeys;
