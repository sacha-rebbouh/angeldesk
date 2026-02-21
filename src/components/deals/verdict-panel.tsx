"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Brain, Handshake, ShieldAlert, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSeverityStyle, getScoreColor, getScoreLabel, RECOMMENDATION_CONFIG } from "@/lib/ui-configs";
import { ScoreRing } from "@/components/ui/score-ring";

interface RedFlagItem {
  title: string;
  severity: string;
  confidence?: number;
}

interface ConditionIssue {
  label: string;
  current: string;
  benchmark?: string;
}

interface DimensionScore {
  label: string;
  score: number;
}

interface VerdictPanelProps {
  score: number | null;
  recommendation: string | null;
  redFlags: RedFlagItem[];
  conditionIssues: ConditionIssue[];
  hasAnalysis: boolean;
  /** Sub-scores so the verdict can highlight weak dimensions */
  dimensionScores?: DimensionScore[];
}

// ScoreRing imported from @/components/ui/score-ring

/** Small inline bar for dimension weaknesses */
function MiniBar({ score }: { score: number }) {
  const barColor = score >= 60
    ? "bg-blue-500"
    : score >= 40
      ? "bg-amber-500"
      : score >= 20
        ? "bg-orange-500"
        : "bg-red-500";
  return (
    <div className="w-16 h-1.5 rounded-full bg-muted/60 overflow-hidden">
      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${score}%` }} />
    </div>
  );
}

export const VerdictPanel = memo(function VerdictPanel({
  score,
  recommendation,
  redFlags,
  conditionIssues,
  hasAnalysis,
  dimensionScores,
}: VerdictPanelProps) {

  const recConfig = useMemo(() => {
    if (!recommendation) return null;
    return RECOMMENDATION_CONFIG[recommendation.toLowerCase()] ?? null;
  }, [recommendation]);

  const criticalFlags = useMemo(
    () => redFlags.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH"),
    [redFlags],
  );

  // Weak dimensions: scores under 50 sorted ascending (worst first)
  const weakDimensions = useMemo(() => {
    if (!dimensionScores) return [];
    return dimensionScores
      .filter(d => d.score < 50)
      .sort((a, b) => a.score - b.score);
  }, [dimensionScores]);

  // No analysis yet — show prompt
  if (!hasAnalysis) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/15 bg-card">
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="rounded-2xl bg-muted/50 p-4">
            <Brain className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <p className="mt-5 text-sm font-semibold">Aucune analyse effectuée</p>
          <p className="mt-1.5 text-xs text-muted-foreground max-w-xs">
            Lancez une analyse IA pour obtenir le verdict complet du deal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {/* Subtle top accent line */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[2px]",
        score != null && score >= 80 ? "bg-emerald-500" :
        score != null && score >= 60 ? "bg-blue-500" :
        score != null && score >= 40 ? "bg-amber-500" :
        score != null && score >= 20 ? "bg-orange-500" :
        "bg-red-500"
      )} />

      <div className="p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5">
              <Brain className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight">Verdict</h3>
          </div>
          {recConfig && (
            <Badge className={cn(
              "text-xs font-semibold px-3 py-1 rounded-md border",
              recConfig.color, recConfig.bg,
            )}>
              {recConfig.label}
            </Badge>
          )}
        </div>

        {/* Score + Summary area */}
        <div className="flex items-start gap-8">
          {/* Score Ring */}
          {score != null && score > 0 && (
            <div className="shrink-0">
              <ScoreRing score={score} />
              <p className="text-center mt-2">
                <Badge variant="outline" className="text-[10px] font-medium tracking-wide uppercase">
                  {getScoreLabel(score)}
                </Badge>
              </p>
            </div>
          )}

          {/* Right column: weaknesses + flags + conditions + steps */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Weak Dimensions — THE KEY SECTION: shows WHY the score is low */}
            {weakDimensions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingDown className="h-4 w-4 text-orange-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-orange-600/80">
                    Points faibles
                  </span>
                </div>
                <div className="space-y-2">
                  {weakDimensions.map((dim, i) => (
                    <div key={i} className="flex items-center gap-3 text-[13px]">
                      <span className="w-20 shrink-0 text-foreground/65 font-medium">{dim.label}</span>
                      <MiniBar score={dim.score} />
                      <span className={cn("font-bold tabular-nums text-xs", getScoreColor(dim.score))}>
                        {dim.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Critical Red Flags */}
            {criticalFlags.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-600/80">
                    {criticalFlags.length} risque{criticalFlags.length > 1 ? "s" : ""} critique{criticalFlags.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {criticalFlags.slice(0, 5).map((flag, i) => {
                    const style = getSeverityStyle(flag.severity);
                    return (
                      <div key={i} className="flex items-center gap-2.5 text-[13px] group">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          flag.severity === "CRITICAL" ? "bg-red-500" : "bg-orange-400"
                        )} />
                        <span className="text-foreground/70 leading-snug">{flag.title}</span>
                        {flag.confidence != null && (
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0",
                            style.badge
                          )}>
                            {Math.round(flag.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conditions Issues */}
            {conditionIssues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Handshake className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-600/80">
                    Conditions à négocier
                  </span>
                </div>
                <div className="space-y-1.5">
                  {conditionIssues.slice(0, 3).map((issue, i) => (
                    <div key={i} className="text-[13px] text-foreground/70 leading-snug">
                      <span className="font-medium text-foreground/85">{issue.label}:</span>{" "}
                      {issue.current}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
});
