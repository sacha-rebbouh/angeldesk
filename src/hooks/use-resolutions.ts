"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback, useRef } from "react";
import { queryKeys } from "@/lib/query-keys";

export interface AlertResolution {
  id: string;
  dealId: string;
  userId: string;
  alertKey: string;
  alertType: "RED_FLAG" | "DEVILS_ADVOCATE" | "CONDITIONS";
  status: "RESOLVED" | "ACCEPTED";
  justification: string;
  alertTitle: string;
  alertSeverity: string;
  alertCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResolutionInput {
  alertKey: string;
  alertType: "RED_FLAG" | "DEVILS_ADVOCATE" | "CONDITIONS";
  status: "RESOLVED" | "ACCEPTED";
  justification: string;
  alertTitle: string;
  alertSeverity: string;
  alertCategory?: string;
}

export function useResolutions(dealId: string) {
  const queryClient = useQueryClient();

  const {
    data: resolutions = [],
    isLoading,
    error,
  } = useQuery<AlertResolution[]>({
    queryKey: queryKeys.resolutions.byDeal(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/resolutions`);
      if (!res.ok) throw new Error("Failed to fetch resolutions");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Lookup map: alertKey → resolution (plain object for stable React comparison)
  const resolutionMap = useMemo(() => {
    const record: Record<string, AlertResolution> = {};
    for (const r of resolutions) {
      record[r.alertKey] = r;
    }
    return record;
  }, [resolutions]);

  // Create/update mutation
  const createMutation = useMutation({
    mutationFn: async (input: CreateResolutionInput) => {
      const res = await fetch(`/api/deals/${dealId}/resolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error ?? body?.details?.[0]?.message ?? `Erreur ${res.status}`;
        throw new Error(msg);
      }
      return res.json() as Promise<AlertResolution>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resolutions.byDeal(dealId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.deals.detail(dealId),
      });
    },
  });

  // Delete mutation (revert to OPEN)
  const deleteMutation = useMutation({
    mutationFn: async (alertKey: string) => {
      const res = await fetch(
        `/api/deals/${dealId}/resolutions/${encodeURIComponent(alertKey)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resolutions.byDeal(dealId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.deals.detail(dealId),
      });
    },
  });

  const getResolution = useCallback(
    (alertKey: string) => resolutionMap[alertKey] ?? null,
    [resolutionMap],
  );

  const isResolved = useCallback(
    (alertKey: string) => alertKey in resolutionMap,
    [resolutionMap],
  );

  const counts = useMemo(() => {
    const result = {
      total: resolutions.length,
      resolved: 0,
      accepted: 0,
      byType: { RED_FLAG: 0, DEVILS_ADVOCATE: 0, CONDITIONS: 0 } as Record<string, number>,
    };
    for (const r of resolutions) {
      if (r.status === "RESOLVED") result.resolved++;
      else result.accepted++;
      result.byType[r.alertType] = (result.byType[r.alertType] ?? 0) + 1;
    }
    return result;
  }, [resolutions]);

  const createMutationRef = useRef(createMutation);
  createMutationRef.current = createMutation;
  const resolve = useCallback(
    (input: CreateResolutionInput) => createMutationRef.current.mutateAsync(input),
    [],
  );

  const deleteMutationRef = useRef(deleteMutation);
  deleteMutationRef.current = deleteMutation;
  const unresolve = useCallback(
    (alertKey: string) => deleteMutationRef.current.mutateAsync(alertKey),
    [],
  );

  return {
    resolutions,
    resolutionMap,
    isLoading,
    error,
    getResolution,
    isResolved,
    counts,
    resolve,
    unresolve,
    isResolving: createMutation.isPending,
    isUnresolving: deleteMutation.isPending,
  };
}
