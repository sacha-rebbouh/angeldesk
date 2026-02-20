"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BarChart3, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

interface PercentileComparatorProps {
  dealId: string;
}

interface BenchmarkResponse {
  stage: string;
  source: string;
  valuation: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    dealValue: number | null;
    percentile: number | null;
  };
  dilution: { median: number; dealValue: number | null };
  instrument: { standard: string; dealValue: string | null; assessment: string | null };
  protections: { standard: string; score: number | null };
  governance: { standard: string; score: number | null };
}

function formatEUR(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("fr-FR");
}

function getPercentileColor(pct: number): string {
  if (pct <= 25) return "bg-green-500";
  if (pct <= 50) return "bg-blue-500";
  if (pct <= 75) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

// Percentile bar with markers at P25, P50, P75
function PercentileBar({
  label,
  percentile,
  p25Label,
  p50Label,
  p75Label,
  dealLabel,
}: {
  label: string;
  percentile: number | null;
  p25Label: string;
  p50Label: string;
  p75Label: string;
  dealLabel: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {percentile != null && (
          <Badge variant="outline" className={cn("text-xs", getPercentileColor(percentile).replace("bg-", "text-"))}>
            P{percentile}
          </Badge>
        )}
      </div>
      <div className="relative h-6 rounded-full bg-gradient-to-r from-green-100 via-blue-100 via-yellow-100 to-red-100 overflow-visible">
        {/* Tick markers at P25, P50, P75 */}
        {[25, 50, 75].map(p => (
          <div
            key={p}
            className="absolute top-0 h-full w-px bg-muted-foreground/30"
            style={{ left: `${p}%` }}
          />
        ))}

        {/* Deal position marker */}
        {percentile != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
            style={{ left: `${Math.min(Math.max(percentile, 2), 98)}%` }}
          >
            <div className={cn("h-5 w-5 rounded-full border-2 border-white shadow-md", getPercentileColor(percentile))} />
          </div>
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>{p25Label}</span>
        <span>{p50Label}</span>
        <span>{p75Label}</span>
      </div>

      {/* Deal value */}
      {dealLabel && (
        <p className="text-xs text-muted-foreground">
          Votre deal : <span className="font-medium text-foreground">{dealLabel}</span>
        </p>
      )}
    </div>
  );
}

export const PercentileComparator = React.memo(function PercentileComparator({
  dealId,
}: PercentileComparatorProps) {
  const { data, isLoading } = useQuery<BenchmarkResponse>({
    queryKey: queryKeys.dealTerms.benchmarks(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms/benchmarks`);
      if (!res.ok) throw new Error("Failed to fetch benchmarks");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">Erreur de chargement des benchmarks</p>
      </div>
    );
  }

  const hasTerms = data.valuation.dealValue != null || data.instrument.dealValue != null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Positionnement percentile — {data.stage.replace("_", " ")}
          </CardTitle>
          <CardDescription className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            Source : {data.source}
          </CardDescription>
        </CardHeader>
      </Card>

      {!hasTerms && (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          <p className="text-sm">Renseignez les conditions du deal pour voir votre positionnement</p>
        </div>
      )}

      {/* Valuation percentile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Valorisation pre-money</CardTitle>
        </CardHeader>
        <CardContent>
          <PercentileBar
            label="Position par rapport au marche"
            percentile={data.valuation.percentile}
            p25Label={`P25: ${formatEUR(data.valuation.p25)}`}
            p50Label={`Mediane: ${formatEUR(data.valuation.p50)}`}
            p75Label={`P75: ${formatEUR(data.valuation.p75)}`}
            dealLabel={data.valuation.dealValue != null ? `${formatEUR(data.valuation.dealValue)} EUR` : null}
          />
        </CardContent>
      </Card>

      {/* Instrument */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Instrument</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Standard pour {data.stage.replace("_", " ")} :</span>
            <Badge variant="secondary">{data.instrument.standard}</Badge>
          </div>
          {data.instrument.dealValue && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Votre deal :</span>
              <Badge variant="outline">{data.instrument.dealValue.replace(/_/g, " ")}</Badge>
            </div>
          )}
          {data.instrument.assessment && (
            <p className="text-xs text-muted-foreground italic">{data.instrument.assessment}</p>
          )}
        </CardContent>
      </Card>

      {/* Protections & Governance scores */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Protections investisseur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.protections.score != null ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn("text-2xl font-bold", getScoreColor(data.protections.score))}>
                    {data.protections.score}
                  </span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getPercentileColor(100 - data.protections.score))}
                    style={{ width: `${data.protections.score}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Non evalue</p>
            )}
            <p className="text-xs text-muted-foreground">Standard : {data.protections.standard}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gouvernance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.governance.score != null ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn("text-2xl font-bold", getScoreColor(data.governance.score))}>
                    {data.governance.score}
                  </span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getPercentileColor(100 - data.governance.score))}
                    style={{ width: `${data.governance.score}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Non evalue</p>
            )}
            <p className="text-xs text-muted-foreground">Standard : {data.governance.standard}</p>
          </CardContent>
        </Card>
      </div>

      {/* Dilution benchmark */}
      {data.dilution.dealValue != null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dilution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Mediane du marche :</span>
              <span className="font-medium">{data.dilution.median}%</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Votre deal :</span>
              <span className={cn(
                "font-medium",
                data.dilution.dealValue <= data.dilution.median ? "text-green-600" : "text-orange-600"
              )}>
                {data.dilution.dealValue}%
                {data.dilution.dealValue <= data.dilution.median
                  ? " (en-dessous de la mediane)"
                  : " (au-dessus de la mediane)"
                }
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
