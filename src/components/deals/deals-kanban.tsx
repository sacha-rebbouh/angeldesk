"use client";

import { memo, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/shared/score-badge";
import { getStatusLabel, getStageLabel, formatCurrencyEUR } from "@/lib/format-utils";

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

interface DealsKanbanProps {
  deals: Deal[];
}

const COLUMNS: { key: string; color: string }[] = [
  { key: "SCREENING", color: "border-t-blue-500" },
  { key: "ANALYZING", color: "border-t-yellow-500" },
  { key: "IN_DD", color: "border-t-purple-500" },
  { key: "INVESTED", color: "border-t-green-500" },
  { key: "PASSED", color: "border-t-gray-400" },
  { key: "ARCHIVED", color: "border-t-gray-300" },
];

export const DealsKanban = memo(function DealsKanban({ deals }: DealsKanbanProps) {
  const router = useRouter();

  const columns = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    for (const col of COLUMNS) {
      grouped[col.key] = [];
    }
    for (const deal of deals) {
      if (grouped[deal.status]) {
        grouped[deal.status].push(deal);
      } else {
        // Unknown status → put in SCREENING
        grouped["SCREENING"]?.push(deal);
      }
    }
    return COLUMNS.map(col => ({
      ...col,
      label: getStatusLabel(col.key),
      deals: grouped[col.key] ?? [],
    }));
  }, [deals]);

  const handleCardClick = useCallback((dealId: string) => {
    router.push(`/deals/${dealId}`);
  }, [router]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
      {columns.map(col => (
        <div
          key={col.key}
          className={cn(
            "flex-shrink-0 w-[280px] rounded-xl border border-t-4 bg-muted/30",
            col.color
          )}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">{col.label}</h3>
            <Badge variant="secondary" className="text-xs">
              {col.deals.length}
            </Badge>
          </div>

          {/* Cards */}
          <div className="p-2 space-y-2 min-h-[100px]">
            {col.deals.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Aucun deal</p>
            ) : (
              col.deals.map(deal => (
                <KanbanCard
                  key={deal.id}
                  deal={deal}
                  onClick={handleCardClick}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

const KanbanCard = memo(function KanbanCard({
  deal,
  onClick,
}: {
  deal: Deal;
  onClick: (id: string) => void;
}) {
  const criticalFlags = deal.redFlags.filter(
    f => f.severity === "CRITICAL" || f.severity === "HIGH"
  ).length;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onClick(deal.id)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(deal.id); } }}
      className="rounded-lg border bg-card p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Name + score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium leading-tight line-clamp-2">{deal.name}</span>
        {deal.globalScore ? (
          <ScoreBadge score={deal.globalScore} size="sm" />
        ) : null}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap mb-2">
        {deal.sector && <span>{deal.sector}</span>}
        {deal.stage && (
          <>
            {deal.sector && <span className="text-muted-foreground/40">·</span>}
            <span>{getStageLabel(deal.stage)}</span>
          </>
        )}
        {deal.valuationPre != null && Number(deal.valuationPre) > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{formatCurrencyEUR(deal.valuationPre)}</span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true, locale: fr })}
        </span>
        <div className="flex items-center gap-2">
          {criticalFlags > 0 && (
            <div className="flex items-center gap-0.5 text-destructive text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>{criticalFlags}</span>
            </div>
          )}
          {deal.website && (
            <a
              href={deal.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
});
