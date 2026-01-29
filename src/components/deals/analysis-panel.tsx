"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, Play, CheckCircle, XCircle, ChevronDown, ChevronUp, Clock, History, Crown, AlertCircle, AlertTriangle, FileWarning, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ProTeaserBanner } from "@/components/shared/pro-teaser";
import { AnalysisProgress } from "./analysis-progress";
import { TimelineVersions } from "./timeline-versions";
import { FounderResponses, type AgentQuestion, type QuestionResponse } from "./founder-responses";
import { DeltaIndicator } from "./delta-indicator";
import { ChangedSection } from "./changed-section";
import { CreditModal } from "@/components/credits/credit-modal";

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

interface StalenessInfo {
  hasAnalysis: boolean;
  staleness: {
    isStale: boolean;
    newDocumentCount: number;
    message: string | null;
    analyzedDocumentIds: string[];
    analysisId: string;
    analysisType: string;
  } | null;
  unanalyzedDocuments: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
  }>;
}

interface QuotaData {
  plan: "FREE" | "PRO";
  analyses: { used: number; limit: number };
  boards: { used: number; limit: number };
  availableTiers: string[];
  resetsAt: string;
}

interface FounderResponsesData {
  dealId: string;
  responsesCount: number;
  responses: Array<{
    id: string;
    questionId: string;
    answer: string;
    category: string;
    createdAt: string;
  }>;
  freeNotes: { content: string; createdAt: string } | null;
}

async function fetchQuota(): Promise<{ data: QuotaData }> {
  const response = await fetch("/api/credits");
  if (!response.ok) throw new Error("Failed to fetch quota");
  return response.json();
}

async function fetchFounderResponses(dealId: string): Promise<{ data: FounderResponsesData }> {
  const response = await fetch(`/api/founder-responses/${dealId}`);
  if (!response.ok) throw new Error("Failed to fetch founder responses");
  return response.json();
}

async function submitFounderResponses(
  dealId: string,
  responses: QuestionResponse[],
  freeNotes: string
): Promise<void> {
  const response = await fetch(`/api/founder-responses/${dealId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, freeNotes }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to submit responses");
  }
}

async function runAnalysis(dealId: string, type: string): Promise<{ data: AnalysisResult }> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, type }),
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

async function fetchStaleness(dealId: string): Promise<StalenessInfo> {
  const response = await fetch(`/api/deals/${dealId}/staleness`);
  if (!response.ok) throw new Error("Failed to fetch staleness");
  return response.json();
}

// Helper to map question category from LLM output to UI format
function mapQuestionCategory(category: string): AgentQuestion["category"] {
  const normalizedCategory = category.toUpperCase();
  const validCategories: AgentQuestion["category"][] = [
    "FINANCIAL",
    "TEAM",
    "MARKET",
    "PRODUCT",
    "LEGAL",
    "TRACTION",
    "OTHER",
  ];
  if (validCategories.includes(normalizedCategory as AgentQuestion["category"])) {
    return normalizedCategory as AgentQuestion["category"];
  }
  return "OTHER";
}

// Helper to map question priority from LLM output to UI format
function mapQuestionPriority(priority: string): AgentQuestion["priority"] {
  const normalizedPriority = priority.toUpperCase();
  if (normalizedPriority === "MUST_ASK" || normalizedPriority === "HIGH" || normalizedPriority === "CRITICAL") {
    return "HIGH";
  }
  if (normalizedPriority === "SHOULD_ASK" || normalizedPriority === "MEDIUM") {
    return "MEDIUM";
  }
  return "LOW";
}

export function AnalysisPanel({ dealId, currentStatus, analyses = [] }: AnalysisPanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [liveResult, setLiveResult] = useState<AnalysisResult | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"results" | "founder-responses">("results");
  const [isSubmittingResponses, setIsSubmittingResponses] = useState(false);

  // Fetch usage status
  const { data: usageData } = useQuery({
    queryKey: queryKeys.usage.analyze(),
    queryFn: fetchUsageStatus,
  });

  const usage = usageData?.usage;

  // Fetch quota (for FREE users)
  const { data: quotaData } = useQuery({
    queryKey: queryKeys.quota.all,
    queryFn: fetchQuota,
  });

  const quota = quotaData?.data;

  // Fetch founder responses
  const { data: founderResponsesData } = useQuery({
    queryKey: queryKeys.founderResponses.byDeal(dealId),
    queryFn: () => fetchFounderResponses(dealId),
  });

  const existingResponses = useMemo(() => {
    const responses = founderResponsesData?.data?.responses ?? [];
    return responses.map((r) => ({
      questionId: r.questionId,
      answer: r.answer,
    }));
  }, [founderResponsesData]);

  // Fetch staleness info (are there new documents since last analysis?)
  const { data: stalenessData } = useQuery({
    queryKey: queryKeys.staleness.byDeal(dealId),
    queryFn: () => fetchStaleness(dealId),
    // Refetch when analyses list changes
    enabled: analyses.length > 0,
  });

  const staleness = stalenessData?.staleness;
  const isAnalysisStale = staleness?.isStale ?? false;

  // Determine analysis type based on subscription plan
  const subscriptionPlan: SubscriptionPlan = (usage?.subscriptionStatus as SubscriptionPlan) ?? "FREE";
  const planConfig = PLAN_ANALYSIS_CONFIG[subscriptionPlan];
  const analysisType = getAnalysisTypeForPlan(subscriptionPlan);

  // Check if this is an update (has previous analysis)
  const hasExistingAnalysis = analyses.some((a) => a.status === "COMPLETED");
  const isUpdate = hasExistingAnalysis;

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
    mutationFn: () => runAnalysis(dealId, analysisType),
    onSuccess: (response) => {
      setLiveResult(response.data);
      setSelectedAnalysisId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.analyze() });
      queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
      toast.success("Analyse terminee");
    },
    onError: (error: Error & { upgradeRequired?: boolean }) => {
      if (error.upgradeRequired) {
        toast.error(error.message, {
          action: {
            label: "Passer PRO",
            onClick: () => router.push("/pricing"),
          },
        });
      } else {
        toast.error(error.message);
      }
    },
  });

  // Handle analysis button click - check quota for FREE users
  const handleAnalyzeClick = useCallback(() => {
    // For FREE users, check if quota is exhausted
    if (subscriptionPlan === "FREE" && quota) {
      const remaining = quota.analyses.limit - quota.analyses.used;
      if (remaining <= 0) {
        setShowCreditModal(true);
        return;
      }
    }
    // Quota available or PRO user - run directly
    setLiveResult(null);
    setSelectedAnalysisId(null);
    mutation.mutate();
  }, [subscriptionPlan, quota, mutation]);

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

  // Handle founder responses submission
  const handleSubmitFounderResponses = useCallback(
    async (responses: QuestionResponse[], freeNotes: string) => {
      setIsSubmittingResponses(true);
      try {
        await submitFounderResponses(dealId, responses, freeNotes);
        queryClient.invalidateQueries({ queryKey: queryKeys.founderResponses.byDeal(dealId) });
        toast.success("Reponses enregistrees");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erreur lors de l'enregistrement");
      } finally {
        setIsSubmittingResponses(false);
      }
    },
    [dealId, queryClient]
  );

  // mutation.isPending = user just clicked "Analyze" and we're waiting for response
  // currentStatus === "ANALYZING" = deal has this status in DB (could be stuck/legacy)
  // Only show progress stepper for active mutations, not stuck DB status
  const isAnalyzing = mutation.isPending;
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

  // Prepare timeline versions data (for multi-version display)
  const timelineVersions = useMemo(() => {
    return completedAnalyses
      .map((analysis, index) => {
        // Extract global score from synthesis-deal-scorer if available
        const scorerResult = analysis.results?.["synthesis-deal-scorer"];
        const score = scorerResult?.success && scorerResult.data
          ? (scorerResult.data as { score?: { value?: number } })?.score?.value ?? 0
          : 0;

        return {
          id: analysis.id,
          version: completedAnalyses.length - index, // Most recent = highest version number
          completedAt: new Date(analysis.completedAt ?? analysis.createdAt),
          score,
          triggerType: index === completedAnalyses.length - 1 ? "INITIAL" as const : "UPDATE" as const,
        };
      })
      .reverse(); // Oldest first for timeline display
  }, [completedAnalyses]);

  // Get current analysis ID for timeline selection
  const currentAnalysisId = useMemo(() => {
    if (selectedAnalysisId) return selectedAnalysisId;
    if (liveResult) return null;
    return completedAnalyses[0]?.id ?? null;
  }, [selectedAnalysisId, liveResult, completedAnalyses]);

  // Get previous analysis for delta comparison
  const previousAnalysis = useMemo(() => {
    if (completedAnalyses.length < 2) return null;
    const currentIndex = completedAnalyses.findIndex((a) => a.id === currentAnalysisId);
    if (currentIndex === -1 || currentIndex === completedAnalyses.length - 1) return null;
    return completedAnalyses[currentIndex + 1];
  }, [completedAnalyses, currentAnalysisId]);

  // Extract current and previous scores for DeltaIndicator
  const currentScore = useMemo(() => {
    if (!displayedResult?.results) return 0;
    const scorerResult = displayedResult.results["synthesis-deal-scorer"];
    if (!scorerResult?.success || !scorerResult.data) return 0;
    return (scorerResult.data as { score?: { value?: number } })?.score?.value ?? 0;
  }, [displayedResult]);

  const previousScore = useMemo(() => {
    if (!previousAnalysis?.results) return 0;
    const scorerResult = previousAnalysis.results["synthesis-deal-scorer"];
    if (!scorerResult?.success || !scorerResult.data) return 0;
    return (scorerResult.data as { score?: { value?: number } })?.score?.value ?? 0;
  }, [previousAnalysis]);

  // Extract questions from question-master agent results
  const founderQuestions = useMemo((): AgentQuestion[] => {
    if (!displayedResult?.results) return [];
    const questionMasterResult = displayedResult.results["question-master"];
    if (!questionMasterResult?.success || !questionMasterResult.data) return [];

    const data = questionMasterResult.data as {
      findings?: {
        founderQuestions?: Array<{
          id: string;
          question: string;
          category: string;
          priority: string;
          context?: { sourceAgent?: string };
        }>;
      };
    };

    const questions = data.findings?.founderQuestions ?? [];
    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      category: mapQuestionCategory(q.category),
      priority: mapQuestionPriority(q.priority),
      agentSource: q.context?.sourceAgent ?? "question-master",
    }));
  }, [displayedResult]);

  return (
    <div className="space-y-4">
      {/* Quota Modal for FREE users */}
      {quota && (
        <CreditModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
          type="LIMIT_REACHED"
          action={isUpdate ? "UPDATE" : "ANALYSIS"}
          current={quota.analyses.used}
          limit={quota.analyses.limit}
        />
      )}

      {/* Timeline Versions - show if multiple analyses */}
      {timelineVersions.length > 1 && currentAnalysisId && (
        <Card>
          <CardContent className="py-2">
            <TimelineVersions
              analyses={timelineVersions}
              currentAnalysisId={currentAnalysisId}
              onSelectVersion={handleSelectAnalysis}
            />
          </CardContent>
        </Card>
      )}

      {/* Stale Analysis Warning Banner */}
      {isAnalysisStale && staleness && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileWarning className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {staleness.message}
                  </p>
                  <p className="text-sm text-amber-700">
                    De nouveaux documents ont ete ajoutes depuis la derniere analyse. Relancez une analyse pour les inclure.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={handleAnalyzeClick}
                disabled={isRunning || !canRunAnalysis}
              >
                <Play className="mr-2 h-4 w-4" />
                Relancer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                onClick={() => router.push("/pricing")}
              >
                <Crown className="mr-2 h-4 w-4" />
                Passer PRO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Progress - shown during active mutation */}
      {isAnalyzing && (
        <Card>
          <CardHeader>
            <CardTitle>Analyse en cours...</CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisProgress
              isRunning={isAnalyzing}
              analysisType={analysisType === "tier1_complete" ? "tier1_complete" : "full_analysis"}
            />
          </CardContent>
        </Card>
      )}

      {/* Results Display with Tabs - FIRST (when available) */}
      {displayedResult && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "results" | "founder-responses")}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">
                    {displayedResult.isLive ? "Resultats" : "Analyse sauvegardee"}
                  </CardTitle>
                  {/* Delta Indicator for score when previous version exists */}
                  {previousScore > 0 && currentScore > 0 && (
                    <DeltaIndicator
                      currentValue={currentScore}
                      previousValue={previousScore}
                      unit="/100"
                    />
                  )}
                </div>
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
              {/* Tabs Navigation */}
              <TabsList className="mt-3">
                <TabsTrigger value="results">Resultats</TabsTrigger>
                <TabsTrigger value="founder-responses" className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Reponses Fondateur
                  {founderQuestions.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {founderQuestions.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Results Tab Content */}
              <TabsContent value="results" className="mt-0 space-y-4">
                {/* Early Warnings Panel - Show prominently at top */}
                {displayedResult.earlyWarnings && displayedResult.earlyWarnings.length > 0 && (
                  <EarlyWarningsPanel
                    warnings={displayedResult.earlyWarnings}
                    hasCritical={displayedResult.hasCriticalWarnings}
                  />
                )}

                {/* Tier 2 Results - Sector Expert Analysis (PRO only) */}
                {isTier2Analysis && displayedResult.success && Object.keys(tier2Results).length > 0 && (
                  <ChangedSection
                    isNew={!previousAnalysis}
                    isChanged={previousAnalysis !== null}
                    changeType="neutral"
                  >
                    <Tier2Results results={tier2Results} subscriptionPlan={subscriptionPlan} />
                  </ChangedSection>
                )}

                {/* Tier 1 Results - 12 Investigation Agents (FREE sees limited items + teasers) */}
                {isTier1Analysis && displayedResult.success && Object.keys(tier1Results).length > 0 && (
                  <Tier1Results results={tier1Results} subscriptionPlan={subscriptionPlan} />
                )}

                {/* Tier 3 Results - Synthesis Agents (Score, Scenarios, Devil's Advocate, Memo) */}
                {isTier3Analysis && displayedResult.success && Object.keys(tier3Results).length > 0 && (
                  <Tier3Results results={tier3Results} subscriptionPlan={subscriptionPlan} />
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

                {/* PRO Upsell Banner for FREE users */}
                {subscriptionPlan === "FREE" && displayedResult.success && (
                  <ProTeaserBanner />
                )}
              </TabsContent>

              {/* Founder Responses Tab Content */}
              <TabsContent value="founder-responses" className="mt-0">
                <FounderResponses
                  dealId={dealId}
                  questions={founderQuestions}
                  existingResponses={existingResponses}
                  onSubmit={handleSubmitFounderResponses}
                  isSubmitting={isSubmittingResponses}
                />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      )}

      {/* Launch Analysis Card - AFTER results */}
      {!isAnalyzing && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {displayedResult ? "Relancer une analyse" : "Analyse IA"}
                </CardTitle>
                <CardDescription className="text-sm">
                  {planConfig.description}
                </CardDescription>
              </div>
              <Button
                onClick={handleAnalyzeClick}
                disabled={!canRunAnalysis}
                size="default"
              >
                {!canRunAnalysis ? (
                  <>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Limite atteinte
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {displayedResult ? "Relancer" : "Analyser"}
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {/* History Toggle */}
          {completedAnalyses.length > 1 && (
            <CardContent className="pt-0">
              <div className="border rounded-lg">
                <button
                  onClick={toggleHistory}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Historique ({completedAnalyses.length})
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
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
