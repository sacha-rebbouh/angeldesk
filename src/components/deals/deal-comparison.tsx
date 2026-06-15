"use client";

import { memo } from "react";
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
  valuationPre: number | null;
  arr: number | null;
  growthRate: number | null;
  redFlagCount: number;
  criticalRedFlagCount: number;
}

const EMPTY_DEALS: DealComparisonData[] = [];

async function fetchComparisonData(
  dealIds: string[]
): Promise<{ data: DealComparisonData[] }> {
  const response = await fetch(
    `/api/deals/compare?ids=${dealIds.join(",")}`
  );
  if (!response.ok) throw new Error("Failed to fetch comparison data");
  return response.json();
}

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

  const deals = data?.data ?? EMPTY_DEALS;

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
      </CardContent>
    </Card>
  );
});
