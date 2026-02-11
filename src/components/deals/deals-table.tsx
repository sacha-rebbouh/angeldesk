"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ChevronRight, ExternalLink, MoreHorizontal, Pencil, Trash2, BarChart3, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreBadge } from "@/components/shared/score-badge";
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
import { DealComparison } from "./deal-comparison";

interface Deal {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  valuationPre: number | string | null;
  status: string;
  website: string | null;
  updatedAt: Date;
  redFlags: { severity: string; title?: string }[];
  globalScore?: number | null;
}

type SortField = "name" | "sector" | "stage" | "valuationPre" | "status" | "globalScore" | "updatedAt";
type SortDir = "asc" | "desc";

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

  // Deal comparison state (F51)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  // Filters & Sort (F89)
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const availableSectors = useMemo(() => {
    const sectors = new Set(deals.map(d => d.sector).filter(Boolean) as string[]);
    return Array.from(sectors).sort();
  }, [deals]);

  const availableStages = useMemo(() => {
    const stages = new Set(deals.map(d => d.stage).filter(Boolean) as string[]);
    return Array.from(stages).sort();
  }, [deals]);

  const filteredDeals = useMemo(() => {
    let result = [...deals];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.sector?.toLowerCase().includes(q))
      );
    }
    if (sectorFilter !== "all") {
      result = result.filter(d => d.sector === sectorFilter);
    }
    if (stageFilter !== "all") {
      result = result.filter(d => d.stage === stageFilter);
    }
    if (scoreMin) {
      const min = parseInt(scoreMin, 10);
      if (!isNaN(min)) {
        result = result.filter(d => (d.globalScore ?? 0) >= min);
      }
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "globalScore":
          cmp = (a.globalScore ?? 0) - (b.globalScore ?? 0);
          break;
        case "valuationPre":
          cmp = (Number(a.valuationPre) || 0) - (Number(b.valuationPre) || 0);
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          cmp = String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [deals, searchQuery, sectorFilter, stageFilter, scoreMin, sortField, sortDir]);

  const SortIcon = useCallback(({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  }, [sortField, sortDir]);

  const handleToggleFilters = useCallback(() => setShowFilters(v => !v), []);
  const handleClearFilters = useCallback(() => { setSectorFilter("all"); setStageFilter("all"); setScoreMin(""); }, []);
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value), []);
  const handleScoreMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setScoreMin(e.target.value), []);

  const toggleDealSelection = useCallback((dealId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDeals(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) {
        next.delete(dealId);
      } else if (next.size < 3) {
        next.add(dealId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDeals(new Set());
    setShowComparison(false);
  }, []);

  return (
    <>
      {/* Comparison view (F51) */}
      {showComparison && selectedDeals.size >= 2 && (
        <div className="mb-4">
          <DealComparison
            dealIds={Array.from(selectedDeals)}
            onClose={clearSelection}
          />
        </div>
      )}

      {/* Search and Filters (F89) */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un deal..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleToggleFilters}>
            <Filter className="h-4 w-4 mr-1" />
            Filtres
          </Button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 border">
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Secteur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les secteurs</SelectItem>
                {availableSectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les stages</SelectItem>
                {availableStages.map(s => <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Score min"
              value={scoreMin}
              onChange={handleScoreMinChange}
              className="w-[100px]"
            />
            {(sectorFilter !== "all" || stageFilter !== "all" || scoreMin) && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="h-3 w-3 mr-1" /> Réinitialiser
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mobile: Card view (F91) */}
      <div className="md:hidden space-y-2">
        {filteredDeals.map((deal) => {
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
              className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm truncate flex-1">{deal.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {deal.globalScore ? (
                    <ScoreBadge score={deal.globalScore} size="sm" />
                  ) : null}
                  <Badge variant="secondary" className={cn("text-xs", getStatusColor(deal.status))}>
                    {getStatusLabel(deal.status)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {deal.sector && <span>{deal.sector}</span>}
                {deal.stage && <><span>•</span><span>{getStageLabel(deal.stage)}</span></>}
                {deal.valuationPre && <><span>•</span><span>{formatCurrencyEUR(deal.valuationPre)}</span></>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true, locale: fr })}
                </span>
                {criticalFlags > 0 && (
                  <div className="flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{criticalFlags} alerte{criticalFlags > 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]" />
              <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                <span className="flex items-center">Nom <SortIcon field="name" /></span>
              </TableHead>
              <TableHead className="hidden sm:table-cell cursor-pointer" onClick={() => handleSort("sector")}>
                <span className="flex items-center">Secteur <SortIcon field="sector" /></span>
              </TableHead>
              <TableHead className="hidden lg:table-cell cursor-pointer" onClick={() => handleSort("stage")}>
                <span className="flex items-center">Stade <SortIcon field="stage" /></span>
              </TableHead>
              <TableHead className="hidden md:table-cell cursor-pointer" onClick={() => handleSort("valuationPre")}>
                <span className="flex items-center">Valorisation <SortIcon field="valuationPre" /></span>
              </TableHead>
              <TableHead className="hidden sm:table-cell cursor-pointer" onClick={() => handleSort("globalScore")}>
                <span className="flex items-center">Score <SortIcon field="globalScore" /></span>
              </TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Alertes</TableHead>
              <TableHead className="hidden md:table-cell cursor-pointer" onClick={() => handleSort("updatedAt")}>
                <span className="flex items-center">Mis à jour <SortIcon field="updatedAt" /></span>
              </TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeals.map((deal) => {
              const criticalFlags = deal.redFlags.filter(
                (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
              ).length;

              return (
                <TableRow
                  key={deal.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/deals/${deal.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/deals/${deal.id}`); } }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={selectedDeals.has(deal.id)}
                      onChange={() => {}}
                      onClick={(e) => toggleDealSelection(deal.id, e as unknown as React.MouseEvent)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
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
                  <TableCell className="hidden sm:table-cell">{deal.sector ?? "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{getStageLabel(deal.stage)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatCurrencyEUR(deal.valuationPre)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {deal.globalScore ? (
                      <ScoreBadge score={deal.globalScore} size="sm" />
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getStatusColor(deal.status)}>
                      {getStatusLabel(deal.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {criticalFlags > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-destructive cursor-help">
                              <AlertTriangle className="h-4 w-4" />
                              <span>{criticalFlags}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p className="font-medium mb-1">
                              {criticalFlags} alerte{criticalFlags > 1 ? "s" : ""} critique{criticalFlags > 1 ? "s" : ""}
                            </p>
                            <ul className="text-sm space-y-0.5">
                              {deal.redFlags
                                .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
                                .slice(0, 3)
                                .map((f, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-red-400">•</span>
                                    <span>{f.title ?? `Red flag ${f.severity}`}</span>
                                  </li>
                                ))}
                              {criticalFlags > 3 && (
                                <li className="text-xs text-muted-foreground">
                                  +{criticalFlags - 3} autre{criticalFlags - 3 > 1 ? "s" : ""}...
                                </li>
                              )}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
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
      </div>

      {/* Floating comparison bar (F51) */}
      {selectedDeals.size >= 2 && !showComparison && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-lg">
            <span className="text-sm font-medium">
              {selectedDeals.size} deal{selectedDeals.size > 1 ? "s" : ""} selectionne{selectedDeals.size > 1 ? "s" : ""}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowComparison(true)}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Comparer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-primary-foreground hover:text-primary-foreground/80"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

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
