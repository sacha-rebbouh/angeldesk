"use client";

import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

interface DealComparisonProps {
  dealIds: string[];
  onClose: () => void;
}

interface DealComparisonData {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
  valuationPre: number | null;
  arr: number | null;
  growthRate: number | null;
  redFlagCount: number;
  criticalRedFlagCount: number;
}

async function fetchComparisonData(
  dealIds: string[]
): Promise<{ data: DealComparisonData[] }> {
  const response = await fetch(
    `/api/deals/compare?ids=${dealIds.join(",")}`
  );
  if (!response.ok) throw new Error("Failed to fetch comparison data");
  return response.json();
}

const DIMENSION_LABELS: Record<string, string> = {
  globalScore: "Score Global",
  teamScore: "Équipe",
  marketScore: "Marché",
  productScore: "Produit",
  financialsScore: "Financier",
};

export const DealComparison = memo(function DealComparison({
  dealIds,
  onClose,
}: DealComparisonProps) {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.deals.lists(), "compare", ...dealIds],
    queryFn: () => fetchComparisonData(dealIds),
    enabled: dealIds.length >= 2,
    staleTime: 60_000,
  });

  const deals = data?.data ?? [];

  // Find best scores for highlighting
  const bestScores = useMemo(() => {
    const best: Record<string, number> = {};
    const dimensions = [
      "globalScore",
      "teamScore",
      "marketScore",
      "productScore",
      "financialsScore",
    ];
    for (const dim of dimensions) {
      let max = -1;
      for (const deal of deals) {
        const val = (deal as unknown as Record<string, unknown>)[dim] as number | null;
        if (val != null && val > max) max = val;
      }
      best[dim] = max;
    }
    return best;
  }, [deals]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Chargement de la comparaison...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Comparaison de deals</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                  Dimension
                </th>
                {deals.map((deal) => (
                  <th
                    key={deal.id}
                    className="text-center py-2 px-4 font-medium"
                  >
                    <div>{deal.name}</div>
                    <Badge variant="outline" className="text-xs mt-1">
                      {deal.sector ?? "N/A"}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  {deals.map((deal) => {
                    const val = (deal as unknown as Record<string, unknown>)[key] as
                      | number
                      | null;
                    const isBest =
                      val != null &&
                      val === bestScores[key] &&
                      deals.length > 1;
                    return (
                      <td key={deal.id} className="text-center py-2 px-4">
                        {val != null ? (
                          <span
                            className={cn(
                              "font-medium",
                              isBest && "text-green-600 font-bold",
                              val < 40 && !isBest && "text-red-600"
                            )}
                          >
                            {val}/100
                            {isBest && deals.length > 1 && " *"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Red Flags row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">Red Flags</td>
                {deals.map((deal) => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    <span
                      className={cn(
                        "font-medium",
                        deal.criticalRedFlagCount > 0 && "text-red-600"
                      )}
                    >
                      {deal.redFlagCount}
                      {deal.criticalRedFlagCount > 0 && (
                        <span className="text-xs text-red-500 ml-1">
                          ({deal.criticalRedFlagCount} critiques)
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
              {/* Valorisation row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">
                  Valorisation
                </td>
                {deals.map((deal) => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.valuationPre
                      ? `${(deal.valuationPre / 1_000_000).toFixed(1)}M`
                      : "--"}
                  </td>
                ))}
              </tr>
              {/* ARR row */}
              <tr className="border-b">
                <td className="py-2 pr-4 text-muted-foreground">ARR</td>
                {deals.map((deal) => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.arr
                      ? `${(deal.arr / 1_000).toFixed(0)}K`
                      : "--"}
                  </td>
                ))}
              </tr>
              {/* Growth row */}
              <tr>
                <td className="py-2 pr-4 text-muted-foreground">Croissance</td>
                {deals.map((deal) => (
                  <td key={deal.id} className="text-center py-2 px-4">
                    {deal.growthRate != null ? `${deal.growthRate}%` : "--"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          * Meilleur score dans la dimension
        </p>
      </CardContent>
    </Card>
  );
});
