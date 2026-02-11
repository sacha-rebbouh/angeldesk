"use client";

import { memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusColor, getStatusLabel } from "@/lib/format-utils";
import { useDealActions } from "./use-deal-actions";
import { DealRenameDialog, DealDeleteDialog } from "./deal-action-dialogs";

interface Deal {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  status: string;
  redFlags: { severity: string }[];
}

interface RecentDealsListProps {
  deals: Deal[];
}

export const RecentDealsList = memo(function RecentDealsList({ deals }: RecentDealsListProps) {
  const router = useRouter();
  const {
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
  } = useDealActions();

  return (
    <>
      <div className="space-y-2">
        {deals.map((deal) => {
          const criticalFlags = deal.redFlags.filter(
            (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
          ).length;

          return (
            <div
              key={deal.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/deals/${deal.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/deals/${deal.id}`); } }}
              className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{deal.name}</span>
                  <Badge variant="secondary" className={getStatusColor(deal.status)}>
                    {getStatusLabel(deal.status)}
                  </Badge>
                  {criticalFlags > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {criticalFlags}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {deal.sector ?? "Secteur non défini"} • {deal.stage ?? "Stade non défini"}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => openRename(deal, e)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Renommer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => openDelete(deal, e)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      <DealRenameDialog
        dealName={renameDeal?.name}
        isOpen={!!renameDeal}
        onClose={() => setRenameDeal(null)}
        newName={newName}
        onNewNameChange={setNewName}
        onConfirm={handleRename}
        isLoading={isLoading}
      />

      <DealDeleteDialog
        dealName={deleteDeal?.name}
        isOpen={!!deleteDeal}
        onClose={() => setDeleteDeal(null)}
        onConfirm={handleDelete}
        isLoading={isLoading}
      />
    </>
  );
});
