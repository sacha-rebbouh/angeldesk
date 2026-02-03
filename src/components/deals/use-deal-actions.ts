"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface DealIdentifier {
  id: string;
  name: string;
}

export function useDealActions() {
  const queryClient = useQueryClient();
  const [renameDeal, setRenameDeal] = useState<DealIdentifier | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteDeal, setDeleteDeal] = useState<DealIdentifier | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRename = useCallback(async () => {
    if (!renameDeal || !newName.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/deals/${renameDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to rename");
      }

      toast.success("Deal renommé");
      setRenameDeal(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(renameDeal.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renommage");
    } finally {
      setIsLoading(false);
    }
  }, [renameDeal, newName, queryClient]);

  const handleDelete = useCallback(async () => {
    if (!deleteDeal) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/deals/${deleteDeal.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to delete");
      }

      toast.success("Deal supprimé");
      setDeleteDeal(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    } finally {
      setIsLoading(false);
    }
  }, [deleteDeal, queryClient]);

  const openRename = useCallback((deal: DealIdentifier, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameDeal(deal);
    setNewName(deal.name);
  }, []);

  const openDelete = useCallback((deal: DealIdentifier, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDeal(deal);
  }, []);

  return {
    renameDeal,
    setRenameDeal,
    newName,
    setNewName,
    deleteDeal,
    setDeleteDeal,
    isLoading,
    handleRename,
    handleDelete,
    openRename,
    openDelete,
  };
}
