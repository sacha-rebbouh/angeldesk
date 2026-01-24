"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

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

  return (
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
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{deal.name}</span>
                <Badge
                  variant="secondary"
                  className={getStatusColor(deal.status)}
                >
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
                {deal.sector ?? "Secteur non défini"} •{" "}
                {deal.stage ?? "Stade non défini"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
