"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  RefreshCw,
  GitCompareArrows,
  Target,
  RotateCcw,
  Loader2,
  Zap,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SEVERITY_CONFIG } from "@/lib/live/ui-constants";
import type { DeltaReport, PostCallReport } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface PostCallReanalysisProps {
  sessionId: string;
  dealId: string;
  summary?: PostCallReport;
}

type ReanalysisMode = "delta" | "targeted" | "full";

interface ReanalyzeResponse {
  data: DeltaReport | { agents: string[]; status: string };
}

// =============================================================================
// API
// =============================================================================

async function triggerReanalyze(
  sessionId: string,
  mode: ReanalysisMode
): Promise<ReanalyzeResponse> {
  const res = await fetch("/api/coaching/reanalyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, mode }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de lancer la ré-analyse");
  }
  return res.json();
}

// =============================================================================
// Delta Report Display
// =============================================================================

const DeltaReportDisplay = memo(function DeltaReportDisplay({
  report,
}: {
  report: DeltaReport;
}) {
  const confidenceDiff = report.confidenceChange.after - report.confidenceChange.before;
  const isPositive = confidenceDiff > 0;
  const isNeutral = confidenceDiff === 0;

  return (
    <div className="space-y-4 mt-4 rounded-lg border border-border/60 bg-card p-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <GitCompareArrows className="h-4 w-4" />
        Rapport delta
      </h4>

      {/* New Facts */}
      {report.newFacts.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nouveaux faits ({report.newFacts.length})
          </span>
          <div className="space-y-1.5">
            {report.newFacts.map((fact, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm"
              >
                <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <span>{fact.fact}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    \u2014 {fact.impact}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions */}
      {report.contradictions.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contradictions ({report.contradictions.length})
          </span>
          <div className="space-y-1.5">
            {report.contradictions.map((c, i) => {
              const severity =
                SEVERITY_CONFIG[c.severity] ?? SEVERITY_CONFIG.medium;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm rounded-lg border border-border/40 p-2"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
                  <div className="min-w-0 space-y-0.5">
                    <div>
                      <span className="text-muted-foreground">Deck :</span>{" "}
                      {c.claimInDeck}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Call :</span>{" "}
                      {c.claimInCall}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[10px]", severity.className)}
                  >
                    {severity.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resolved Questions */}
      {report.resolvedQuestions.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Questions résolues ({report.resolvedQuestions.length})
          </span>
          <div className="space-y-1.5">
            {report.resolvedQuestions.map((rq, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm"
              >
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <span className="font-medium">{rq.question}</span>
                  <p className="text-xs text-muted-foreground">{rq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impacted Agents */}
      {report.impactedAgents.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Agents impactés
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {report.impactedAgents.map((agent) => (
              <Badge key={agent} variant="outline" className="text-xs">
                {agent}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Confidence Change */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/40">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Confiance :</span>
        <Badge variant="outline" className="tabular-nums">
          {report.confidenceChange.before}
        </Badge>
        <span className="text-muted-foreground">\u2192</span>
        <Badge variant="outline" className="tabular-nums">
          {report.confidenceChange.after}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums",
            isPositive &&
              "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
            !isPositive &&
              !isNeutral &&
              "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
            isNeutral &&
              "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
          )}
        >
          {isPositive ? "+" : ""}
          {confidenceDiff}
        </Badge>
        {report.confidenceChange.reason && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            \u2014 {report.confidenceChange.reason}
          </span>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// Agent Status Display (for targeted/full reanalysis)
// =============================================================================

const AgentStatusDisplay = memo(function AgentStatusDisplay({
  agents,
  status,
}: {
  agents: string[];
  status: string;
}) {
  return (
    <div className="space-y-3 mt-4 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <RefreshCw
          className={cn(
            "h-4 w-4",
            status === "running" && "animate-spin text-blue-500",
            status === "completed" && "text-emerald-500"
          )}
        />
        <span className="text-sm font-medium">
          {status === "running"
            ? "Ré-analyse en cours..."
            : status === "completed"
              ? "Ré-analyse terminée"
              : "Ré-analyse lancée"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {agents.map((agent) => (
          <Badge key={agent} variant="outline" className="text-xs">
            {agent}
          </Badge>
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export default memo(function PostCallReanalysis({
  sessionId,
  dealId,
  summary,
}: PostCallReanalysisProps) {
  const [deltaReport, setDeltaReport] = useState<DeltaReport | null>(null);
  const [agentResults, setAgentResults] = useState<{
    agents: string[];
    status: string;
  } | null>(null);

  const impactedAgentCount = useMemo(() => {
    if (!Array.isArray(summary?.newInformation)) return 0;
    const agentSet = new Set<string>();
    for (const info of summary.newInformation) {
      const agents = Array.isArray(info.agentsAffected) ? info.agentsAffected : [];
      for (const agent of agents) {
        agentSet.add(agent);
      }
    }
    return agentSet.size;
  }, [summary?.newInformation]);

  const deltaMutation = useMutation({
    mutationFn: () => triggerReanalyze(sessionId, "delta"),
    onSuccess: (res) => {
      setDeltaReport(res.data as DeltaReport);
    },
  });

  const targetedMutation = useMutation({
    mutationFn: () => triggerReanalyze(sessionId, "targeted"),
    onSuccess: (res) => {
      setAgentResults(res.data as { agents: string[]; status: string });
    },
  });

  const fullMutation = useMutation({
    mutationFn: () => triggerReanalyze(sessionId, "full"),
    onSuccess: (res) => {
      setAgentResults(res.data as { agents: string[]; status: string });
    },
  });

  const handleDelta = useCallback(() => {
    setDeltaReport(null);
    deltaMutation.mutate();
  }, [deltaMutation]);

  const handleTargeted = useCallback(() => {
    setAgentResults(null);
    targetedMutation.mutate();
  }, [targetedMutation]);

  const handleFull = useCallback(() => {
    setAgentResults(null);
    fullMutation.mutate();
  }, [fullMutation]);

  const anyPending =
    deltaMutation.isPending ||
    targetedMutation.isPending ||
    fullMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Ré-analyse post-call
        </CardTitle>
        {impactedAgentCount > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {impactedAgentCount} agent{impactedAgentCount > 1 ? "s" : ""}{" "}
            potentiellement impacté{impactedAgentCount > 1 ? "s" : ""} par les
            nouvelles informations.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelta}
              disabled={anyPending}
              className="gap-1.5"
            >
              {deltaMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitCompareArrows className="h-4 w-4" />
              )}
              Voir le delta
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTargeted}
              disabled={anyPending}
              className="gap-1.5"
            >
              {targetedMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              Relancer analyse ciblée
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFull}
              disabled={anyPending}
              className="gap-1.5"
            >
              {fullMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Relancer analyse complète
            </Button>
          </div>

          {/* Error displays */}
          {deltaMutation.isError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
              {deltaMutation.error instanceof Error
                ? deltaMutation.error.message
                : "Erreur lors du calcul du delta"}
            </div>
          )}
          {targetedMutation.isError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
              {targetedMutation.error instanceof Error
                ? targetedMutation.error.message
                : "Erreur lors de la ré-analyse ciblée"}
            </div>
          )}
          {fullMutation.isError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
              {fullMutation.error instanceof Error
                ? fullMutation.error.message
                : "Erreur lors de la ré-analyse complète"}
            </div>
          )}

          {/* Delta report results */}
          {deltaReport && <DeltaReportDisplay report={deltaReport} />}

          {/* Agent status results (for targeted/full) */}
          {agentResults && (
            <AgentStatusDisplay
              agents={agentResults.agents}
              status={agentResults.status}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
});
