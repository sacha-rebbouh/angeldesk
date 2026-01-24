"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Loader2, Play, CheckCircle, XCircle, ChevronDown, ChevronUp, Clock, History, Brain, Crown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  formatAgentName,
  formatAnalysisMode,
  formatDate,
  formatErrorMessage,
  categorizeResults,
  PLAN_ANALYSIS_CONFIG,
  getAnalysisTypeForPlan,
  type SubscriptionPlan,
} from "@/lib/analysis-constants";
import {
  Tier1ResultsSkeleton,
  Tier2ResultsSkeleton,
  Tier3ResultsSkeleton,
} from "./loading-skeletons";
import { EarlyWarningsPanel } from "./early-warnings-panel";

// Dynamic imports for heavy Tier components - reduces initial bundle by ~50KB
const Tier1Results = dynamic(
  () => import("./tier1-results").then((mod) => ({ default: mod.Tier1Results })),
  { loading: () => <Tier1ResultsSkeleton /> }
);

const Tier2Results = dynamic(
  () => import("./tier2-results").then((mod) => ({ default: mod.Tier2Results })),
  { loading: () => <Tier2ResultsSkeleton /> }
);

const Tier3Results = dynamic(
  () => import("./tier3-results").then((mod) => ({ default: mod.Tier3Results })),
  { loading: () => <Tier3ResultsSkeleton /> }
);

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface EarlyWarning {
  id: string;
  timestamp: string | Date;
  agentName: string;
  severity: "critical" | "high" | "medium";
  category:
    | "founder_integrity"
    | "legal_existential"
    | "financial_critical"
    | "market_dead"
    | "product_broken"
    | "deal_structure";
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  recommendation: "investigate" | "likely_dealbreaker" | "absolute_dealbreaker";
  questionsToAsk?: string[];
}

interface AnalysisResult {
  sessionId: string;
  success: boolean;
  summary: string;
  totalCost: number;
  totalTimeMs: number;
  results: Record<string, AgentResult>;
  earlyWarnings?: EarlyWarning[];
  hasCriticalWarnings?: boolean;
}

interface SavedAnalysis {
  id: string;
  type: string;
  mode: string | null;
  status: string;
  totalAgents: number;
  completedAgents: number;
  summary: string | null;
  results: Record<string, AgentResult> | null;
  startedAt: string | null;
  completedAt: string | null;
  totalCost: string | null;
  totalTimeMs: number | null;
  createdAt: string;
}

interface AnalysisPanelProps {
  dealId: string;
  currentStatus: string;
  analyses?: SavedAnalysis[];
}

interface UsageStatus {
  canAnalyze: boolean;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingDeals: number;
  maxTier: 1 | 2 | 3;
  subscriptionStatus: "FREE" | "PRO" | "ENTERPRISE";
  isUnlimited: boolean;
  nextResetDate: string;
}

interface AnalyzeError {
  error: string;
  upgradeRequired?: boolean;
  maxAllowedTier?: number;
  remainingDeals?: number;
}

async function runAnalysis(dealId: string, type: string, useReAct: boolean): Promise<{ data: AnalysisResult }> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, type, useReAct }),
  });

  if (!response.ok) {
    const error: AnalyzeError = await response.json();
    const err = new Error(error.error ?? "Failed to run analysis") as Error & { upgradeRequired?: boolean };
    err.upgradeRequired = error.upgradeRequired;
    throw err;
  }

  return response.json();
}

async function fetchUsageStatus(): Promise<{ usage: UsageStatus }> {
  const response = await fetch("/api/analyze");
  if (!response.ok) throw new Error("Failed to fetch usage");
  return response.json();
}

export function AnalysisPanel({ dealId, currentStatus, analyses = [] }: AnalysisPanelProps) {
  const queryClient = useQueryClient();
  const [useReAct, setUseReAct] = useState(false);
  const [liveResult, setLiveResult] = useState<AnalysisResult | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch usage status
  const { data: usageData } = useQuery({
    queryKey: ["analyze", "usage"],
    queryFn: fetchUsageStatus,
  });

  const usage = usageData?.usage;

  // Determine analysis type based on subscription plan
  const subscriptionPlan: SubscriptionPlan = (usage?.subscriptionStatus as SubscriptionPlan) ?? "FREE";
  const planConfig = PLAN_ANALYSIS_CONFIG[subscriptionPlan];
  const analysisType = getAnalysisTypeForPlan(subscriptionPlan);

  // Get the currently displayed result (either live or from saved)
  const displayedResult = useMemo(() => {
    if (liveResult) {
      return {
        results: liveResult.results,
        success: liveResult.success,
        summary: liveResult.summary,
        totalTimeMs: liveResult.totalTimeMs,
        totalCost: liveResult.totalCost,
        isLive: true,
        earlyWarnings: liveResult.earlyWarnings,
        hasCriticalWarnings: liveResult.hasCriticalWarnings,
      };
    }

    if (selectedAnalysisId) {
      const saved = analyses.find(a => a.id === selectedAnalysisId);
      if (saved?.results) {
        return {
          results: saved.results,
          success: saved.status === "COMPLETED",
          summary: saved.summary ?? "",
          totalTimeMs: saved.totalTimeMs ?? 0,
          totalCost: parseFloat(saved.totalCost ?? "0"),
          isLive: false,
          earlyWarnings: undefined,
          hasCriticalWarnings: undefined,
        };
      }
    }

    // Auto-select the most recent completed analysis with results
    const latestWithResults = analyses.find(a => a.status === "COMPLETED" && a.results);
    if (latestWithResults?.results) {
      return {
        results: latestWithResults.results,
        success: true,
        summary: latestWithResults.summary ?? "",
        totalTimeMs: latestWithResults.totalTimeMs ?? 0,
        totalCost: parseFloat(latestWithResults.totalCost ?? "0"),
        isLive: false,
        analysisId: latestWithResults.id,
        earlyWarnings: undefined,
        hasCriticalWarnings: undefined,
      };
    }

    return null;
  }, [liveResult, selectedAnalysisId, analyses]);

  const mutation = useMutation({
    mutationFn: () => runAnalysis(dealId, analysisType, useReAct),
    onSuccess: (response) => {
      setLiveResult(response.data);
      setSelectedAnalysisId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: ["analyze", "usage"] });
      toast.success(useReAct ? "Analyse ReAct terminee" : "Analyse terminee");
    },
    onError: (error: Error & { upgradeRequired?: boolean }) => {
      if (error.upgradeRequired) {
        toast.error(error.message, {
          action: {
            label: "Passer PRO",
            onClick: () => window.location.href = "/pricing",
          },
        });
      } else {
        toast.error(error.message);
      }
    },
  });

  const handleRunAnalysis = useCallback(() => {
    setLiveResult(null);
    setSelectedAnalysisId(null);
    mutation.mutate();
  }, [mutation]);

  const handleSelectAnalysis = useCallback((analysisId: string) => {
    setSelectedAnalysisId(analysisId);
    setLiveResult(null);
  }, []);

  const toggleAgentDetails = useCallback(() => {
    setShowAgentDetails(prev => !prev);
  }, []);

  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev);
  }, []);

  const isRunning = mutation.isPending || currentStatus === "ANALYZING";

  // Check analysis type from results - using hoisted categorizeResults function
  const { isTier1Analysis, isTier2Analysis, isTier3Analysis, tier1Results, tier2Results, tier3Results } = useMemo(() => {
    if (!displayedResult?.results) {
      return {
        isTier1Analysis: false,
        isTier2Analysis: false,
        isTier3Analysis: false,
        tier1Results: {},
        tier2Results: {},
        tier3Results: {},
      };
    }

    const categorized = categorizeResults(displayedResult.results);
    return {
      isTier1Analysis: categorized.isTier1,
      isTier2Analysis: categorized.isTier2,
      isTier3Analysis: categorized.isTier3,
      tier1Results: categorized.tier1Results as Record<string, AgentResult>,
      tier2Results: categorized.tier2Results as Record<string, AgentResult>,
      tier3Results: categorized.tier3Results as Record<string, AgentResult>,
    };
  }, [displayedResult]);

  // Filter completed analyses for history
  const completedAnalyses = useMemo(() => {
    return analyses.filter(a => a.status === "COMPLETED" && a.results);
  }, [analyses]);

  // Can run analysis if user has remaining deals
  const canRunAnalysis = usage ? usage.canAnalyze : true;

  return (
    <div className="space-y-4">
      {/* Usage Status Banner for FREE users */}
      {usage && !usage.isUnlimited && (
        <Card className={usage.remainingDeals === 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {usage.remainingDeals === 0 ? (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium">
                    {usage.remainingDeals === 0
                      ? "Limite mensuelle atteinte"
                      : `${usage.remainingDeals} analyse${usage.remainingDeals > 1 ? "s" : ""} restante${usage.remainingDeals > 1 ? "s" : ""} ce mois`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Plan FREE : {usage.monthlyLimit} deals/mois. PRO = analyses illimitees + synthese + expert sectoriel
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                onClick={() => window.location.href = "/pricing"}
              >
                <Crown className="mr-2 h-4 w-4" />
                Passer PRO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Launch Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse IA</CardTitle>
          <CardDescription>
            {planConfig.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleRunAnalysis}
            disabled={isRunning || !canRunAnalysis}
            size="lg"
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyse en cours...
              </>
            ) : !canRunAnalysis ? (
              <>
                <AlertCircle className="mr-2 h-4 w-4" />
                Limite atteinte
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Analyser ce deal
              </>
            )}
          </Button>

          {/* ReAct Mode Toggle - for PRO users */}
          {subscriptionPlan !== "FREE" && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Brain className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <Label htmlFor="react-mode" className="text-sm font-medium cursor-pointer">
                  Mode ReAct
                </Label>
                <p className="text-xs text-muted-foreground">
                  Scores reproductibles (variance &lt; 5 points), traces de raisonnement
                </p>
              </div>
              <Switch
                id="react-mode"
                checked={useReAct}
                onCheckedChange={setUseReAct}
                disabled={isRunning}
              />
            </div>
          )}

          {/* History Toggle */}
          {completedAnalyses.length > 0 && (
            <div className="border rounded-lg">
              <button
                onClick={toggleHistory}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-sm flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Historique des analyses ({completedAnalyses.length})
                </span>
                {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showHistory && (
                <div className="p-3 pt-0 border-t space-y-2">
                  {completedAnalyses.map((analysis) => (
                    <button
                      key={analysis.id}
                      onClick={() => handleSelectAnalysis(analysis.id)}
                      className={`w-full flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors ${
                        selectedAnalysisId === analysis.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">
                          {formatAnalysisMode(analysis.mode ?? analysis.type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(analysis.completedAt ?? analysis.createdAt)}
                        {analysis.totalTimeMs && (
                          <span>({(analysis.totalTimeMs / 1000).toFixed(0)}s)</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Display */}
      {displayedResult && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {displayedResult.isLive ? "Resultats" : "Analyse sauvegardee"}
              </CardTitle>
              <div className="flex items-center gap-2">
                {displayedResult.success ? (
                  <Badge variant="default" className="bg-green-500">Reussi</Badge>
                ) : (
                  <Badge variant="destructive">Echoue</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {(displayedResult.totalTimeMs / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Early Warnings Panel - Show prominently at top */}
            {displayedResult.earlyWarnings && displayedResult.earlyWarnings.length > 0 && (
              <EarlyWarningsPanel
                warnings={displayedResult.earlyWarnings}
                hasCritical={displayedResult.hasCriticalWarnings}
              />
            )}

            {/* Tier 2 Results - Detailed View */}
            {isTier2Analysis && displayedResult.success && Object.keys(tier2Results).length > 0 && (
              <Tier2Results results={tier2Results} />
            )}

            {/* Tier 1 Results - Detailed View */}
            {isTier1Analysis && displayedResult.success && Object.keys(tier1Results).length > 0 && (
              <Tier1Results results={tier1Results} />
            )}

            {/* Tier 3 Results - Sector Expert */}
            {isTier3Analysis && displayedResult.success && Object.keys(tier3Results).length > 0 && (
              <Tier3Results results={tier3Results} />
            )}

            {/* Agent Results - Collapsible for Tier 1/2/3 */}
            {(isTier1Analysis || isTier2Analysis || isTier3Analysis) ? (
              <div className="border rounded-lg">
                <button
                  onClick={toggleAgentDetails}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-sm">
                    Details des agents ({Object.keys(displayedResult.results).length})
                  </span>
                  {showAgentDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showAgentDetails && (
                  <div className="p-3 pt-0 border-t space-y-2">
                    {Object.entries(displayedResult.results).map(([name, agentResult]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          {agentResult.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium">{formatAgentName(name)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {(agentResult.executionTimeMs / 1000).toFixed(1)}s
                          </span>
                          {agentResult.error && (
                            <Badge variant="destructive" className="max-w-[200px] truncate" title={agentResult.error}>
                              {formatErrorMessage(agentResult.error)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(displayedResult.results).map(([name, agentResult]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2">
                      {agentResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{formatAgentName(name)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {(agentResult.executionTimeMs / 1000).toFixed(1)}s
                      </span>
                      {agentResult.error && (
                        <Badge variant="destructive" className="max-w-[200px] truncate" title={agentResult.error}>
                          {formatErrorMessage(agentResult.error)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {displayedResult.summary && !isTier1Analysis && !isTier2Analysis && (
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Resume</h4>
                <div className="text-sm whitespace-pre-wrap">{displayedResult.summary}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
