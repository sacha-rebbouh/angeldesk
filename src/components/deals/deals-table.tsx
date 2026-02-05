"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ChevronRight, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusColor, getStatusLabel, getStageLabel, formatCurrencyEUR } from "@/lib/format-utils";
import { useDealActions } from "./use-deal-actions";
import { DealRenameDialog, DealDeleteDialog } from "./deal-action-dialogs";

interface Deal {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  valuationPre: number | string | null;
  status: string;
  website: string | null;
  updatedAt: Date;
  redFlags: { severity: string }[];
}

interface DealsTableProps {
  deals: Deal[];
}

export const DealsTable = memo(function DealsTable({ deals }: DealsTableProps) {
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Secteur</TableHead>
            <TableHead>Stade</TableHead>
            <TableHead>Valorisation</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Alerts</TableHead>
            <TableHead>Mis à jour</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => {
            const criticalFlags = deal.redFlags.filter(
              (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
            ).length;

            return (
              <TableRow
                key={deal.id}
                className="cursor-pointer"
                onClick={() => router.push(`/deals/${deal.id}`)}
              >
                <TableCell className="font-medium">
                  {deal.name}
                  {deal.website && (
                    <a
                      href={deal.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  )}
                </TableCell>
                <TableCell>{deal.sector ?? "-"}</TableCell>
                <TableCell>{getStageLabel(deal.stage)}</TableCell>
                <TableCell>{formatCurrencyEUR(deal.valuationPre)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={getStatusColor(deal.status)}>
                    {getStatusLabel(deal.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {criticalFlags > 0 ? (
                    <div className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{criticalFlags}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(deal.updatedAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
