"use client";

import { memo } from "react";
import { ShieldCheck, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdjustedScoreBadge } from "@/components/deals/adjusted-score-badge";
import type { AlertResolution } from "@/hooks/use-resolutions";
import type { AlertCounts } from "./unified-alert";
import { severityBgColor, severityLabel } from "./unified-alert";

interface SuiviDDDashboardProps {
  counts: AlertCounts;
  progressPct: number;
  currentScore: number;
  resolutions: AlertResolution[];
}

export const SuiviDDDashboard = memo(function SuiviDDDashboard({
  counts,
  progressPct,
  currentScore,
  resolutions,
}: SuiviDDDashboardProps) {
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Progression Due Diligence</span>
          </div>
          <div className="flex items-center gap-2">
            {typeof currentScore === "number" && resolutions.length > 0 && (
              <AdjustedScoreBadge originalScore={currentScore} resolutions={resolutions} />
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {counts.resolved + counts.accepted}/{counts.total} alertes traitees
            </span>
            <span className="font-medium">{progressPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Severity badges + questions stat */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(sev => {
            const data = counts.bySeverity[sev];
            if (!data || data.total === 0) return null;
            return (
              <Badge key={sev} className={`${severityBgColor(sev)} text-white border-0 text-xs`}>
                {severityLabel(sev)} : {data.open}/{data.total}
              </Badge>
            );
          })}
          {counts.questionsTotal > 0 && (
            <Badge variant="outline" className="text-xs gap-1 ml-auto">
              <MessageSquare className="h-3 w-3" />
              {counts.questionsAnswered}/{counts.questionsTotal} reponses
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
