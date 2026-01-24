"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Passé",
    INVESTED: "Investi",
    ARCHIVED: "Archivé",
  };
  return labels[status] ?? status;
}

export function RecentDealsList({ deals }: RecentDealsListProps) {
  const router = useRouter();
  const [renameDeal, setRenameDeal] = useState<Deal | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteDeal, setDeleteDeal] = useState<Deal | null>(null);
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
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renommage");
    } finally {
      setIsLoading(false);
    }
  }, [renameDeal, newName, router]);

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
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    } finally {
      setIsLoading(false);
    }
  }, [deleteDeal, router]);

  const openRename = useCallback((deal: Deal, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameDeal(deal);
    setNewName(deal.name);
  }, []);

  const openDelete = useCallback((deal: Deal, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDeal(deal);
  }, []);

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
              onClick={() => router.push(`/deals/${deal.id}`)}
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

      {/* Rename Dialog */}
      <Dialog open={!!renameDeal} onOpenChange={(open) => !open && setRenameDeal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer le deal</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau nom"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDeal(null)}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={isLoading || !newName.trim()}>
              {isLoading ? "..." : "Renommer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDeal} onOpenChange={(open) => !open && setDeleteDeal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce deal ?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteDeal?.name}&quot; et toutes ses données (documents, analyses, red flags) seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
