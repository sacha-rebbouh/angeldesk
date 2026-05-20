"use client";

/**
 * Phase 8 — React Query hook over GET /api/deals/[dealId]/evidence-health.
 *
 * Returns the active `EvidenceHealthBundle` (report + byDocument map)
 * plus the user's overlay (resolved + ignored entries — B9.3). Used by
 * <EvidenceHealthPanel> at the deal level AND by per-doc badges in the
 * documents-tab. A single network call for both surfaces — no
 * duplication.
 *
 * B9.3 — the route already applies `partitionBundleByResolutions`
 * server-side, so `report` and `byDocument` are the ACTIVE subset
 * (resolved/ignored signals are NOT in there — they live in the
 * `resolved` / `ignored` arrays for the "Signaux traités" section).
 *
 * B9.3.1 fix-up (Codex B9.3 P1) — `resolvedAt` traverses the wire as
 * an ISO string (NextResponse.json → JSON.parse). Without rehydration
 * the consumers that call `.getTime()` on it would throw the moment
 * the panel renders the "Signaux traités" section. The hook
 * normalises every resolved/ignored entry to a real `Date` before
 * handing the payload to React.
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { clerkFetch } from "@/lib/clerk-fetch";
import type { EvidenceHealthBundle, ResolvedSignalEntry } from "@/services/evidence";

export interface EvidenceHealthHookPayload {
  /** Active report (resolutions filtered out by the server). */
  report: EvidenceHealthBundle["report"];
  /** Active per-doc summaries (same filter). */
  byDocument: EvidenceHealthBundle["byDocument"];
  /** B9.3 — signals the BA marked as resolved (with reason / timestamp). */
  resolved: ResolvedSignalEntry[];
  /** B9.3 — signals the BA marked as ignored (with reason / timestamp). */
  ignored: ResolvedSignalEntry[];
}

/**
 * Wire shape — same as the in-memory payload EXCEPT `resolvedAt` is an
 * ISO string after JSON serialisation. The hook rehydrates before
 * exposing the payload to React (B9.3.1, Codex B9.3 P1).
 */
type WireResolvedEntry = Omit<ResolvedSignalEntry, "resolvedAt"> & { resolvedAt: string | Date };
type WirePayload = Omit<EvidenceHealthHookPayload, "resolved" | "ignored"> & {
  resolved: WireResolvedEntry[];
  ignored: WireResolvedEntry[];
};
type ApiResponse = { data: WirePayload };

/**
 * Rehydrate `resolvedAt` from the wire to a real `Date`. Exported
 * so unit tests can roundtrip a JSON payload and assert the type
 * conversion without needing the React Query machinery.
 *
 * Defensive: accepts both string (production case after JSON parse)
 * and Date (test fixtures / direct consumers) so the function is
 * idempotent and never produces `Invalid Date` from a missing field.
 */
export function rehydrateEvidenceHealthPayload(raw: WirePayload): EvidenceHealthHookPayload {
  return {
    report: raw.report,
    byDocument: raw.byDocument,
    resolved: raw.resolved.map(rehydrateResolvedEntry),
    ignored: raw.ignored.map(rehydrateResolvedEntry),
  };
}

function rehydrateResolvedEntry(entry: WireResolvedEntry): ResolvedSignalEntry {
  const resolvedAt = entry.resolvedAt instanceof Date ? entry.resolvedAt : new Date(entry.resolvedAt);
  // Re-typed via a single `Pick` substitution. Discriminated union
  // members keep their kind tag (`contradiction` | `missing` |
  // `freshness`) — TS can't narrow through spread alone, so we
  // re-assert via the cast.
  return { ...entry, resolvedAt } as ResolvedSignalEntry;
}

export function useEvidenceHealth(dealId: string, options?: { enabled?: boolean }) {
  return useQuery<EvidenceHealthHookPayload>({
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
      // B9.3.1 — rehydrate wire-side ISO strings → Date instances.
      return rehydrateEvidenceHealthPayload(json.data);
    },
    enabled: options?.enabled !== false && Boolean(dealId),
    staleTime: 30_000,
  });
}
