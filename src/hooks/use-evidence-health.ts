"use client";

/**
 * Phase 8 — React Query hook over GET /api/deals/[dealId]/evidence-health.
 *
 * Returns the `EvidenceHealthBundle` (report + byDocument map). Used by
 * <EvidenceHealthPanel> at the deal level AND by per-doc badges in the
 * documents-tab. A single network call for both surfaces — no duplication.
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { clerkFetch } from "@/lib/clerk-fetch";
import type { EvidenceHealthBundle } from "@/services/evidence";

type ApiResponse = { data: EvidenceHealthBundle };

export function useEvidenceHealth(dealId: string, options?: { enabled?: boolean }) {
  return useQuery<EvidenceHealthBundle>({
    queryKey: queryKeys.evidenceHealth.byDeal(dealId),
    queryFn: async () => {
      // Codex round 24 P2 — clerkFetch ensures Clerk session is propagated
      // correctly in preview/prod (raw fetch can mask auth via stale cookies).
      const res = await clerkFetch(`/api/deals/${dealId}/evidence-health`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      return json.data;
    },
    enabled: options?.enabled !== false && Boolean(dealId),
    staleTime: 30_000,
  });
}
