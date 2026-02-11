"use client";

import { useMemo, useCallback, memo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExpandableSection } from "@/components/shared/expandable-section";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Scale,
  Brain,
  FileText,
  BarChart3,
  Target,
  Lightbulb,
  ShieldAlert,
  Eye,
  Zap,
} from "lucide-react";
import type {
  ContradictionDetectorData,
  ScenarioModelerData,
  SynthesisDealScorerData,
  DevilsAdvocateData,
  MemoGeneratorData,
  DetectedContradiction,
  DataGap,
  ScenarioV2,
  SensitivityAnalysisV2,
} from "@/agents/types";
import { ProTeaserInline, ProTeaserSection } from "@/components/shared/pro-teaser";
import { getDisplayLimits, type SubscriptionPlan } from "@/lib/analysis-constants";

interface Tier3ResultsProps {
  results: Record<string, {
    agentName: string;
    success: boolean;
    executionTimeMs: number;
    cost: number;
    error?: string;
    data?: unknown;
  }>;
  subscriptionPlan?: SubscriptionPlan;
  totalAgentsRun?: number;
}

// Hoisted color function - pure, no need for useCallback
function getSkepticismColor(s: number): string {
  if (s <= 20) return "bg-green-100 text-green-800";
  if (s <= 40) return "bg-blue-100 text-blue-800";
  if (s <= 60) return "bg-yellow-100 text-yellow-800";
  if (s <= 80) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

const SkepticismBadge = memo(function SkepticismBadge({ score }: { score: number }) {
  return (
    <span className={cn("rounded-full border px-3 py-1.5 text-lg font-bold", getSkepticismColor(score))}>
      {score}/100
    </span>
  );
});

// Hoisted config
const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  strong_pass: { label: "Forte conviction", color: "bg-green-100 text-green-800 border-green-300" },
  pass: { label: "Favorable", color: "bg-blue-100 text-blue-800 border-blue-300" },
  conditional_pass: { label: "Conditionnel", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  weak_pass: { label: "Réservé", color: "bg-orange-100 text-orange-800 border-orange-300" },
  no_go: { label: "Ne pas investir", color: "bg-red-100 text-red-800 border-red-300" },
};

const VerdictBadge = memo(function VerdictBadge({ verdict }: { verdict: string }) {
  const c = VERDICT_CONFIG[verdict] ?? { label: verdict, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-sm px-3 py-1", c.color)}>{c.label}</Badge>;
});

// Hoisted config (without icons - they'll be resolved at render)
const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string }> = {
  invest: { label: "Investir", color: "bg-green-500 text-white" },
  pass: { label: "Passer", color: "bg-red-500 text-white" },
  wait: { label: "Attendre", color: "bg-yellow-500 text-white" },
  negotiate: { label: "Négocier", color: "bg-blue-500 text-white" },
};

const RECOMMENDATION_ICONS: Record<string, React.ReactNode> = {
  invest: <CheckCircle className="h-4 w-4" />,
  pass: <XCircle className="h-4 w-4" />,
  wait: <Minus className="h-4 w-4" />,
  negotiate: <Scale className="h-4 w-4" />,
};

const RecommendationBadge = memo(function RecommendationBadge({ action }: { action: string }) {
  const c = RECOMMENDATION_CONFIG[action] ?? { label: action, color: "bg-gray-500 text-white" };
  const icon = RECOMMENDATION_ICONS[action] ?? null;
  return (
    <Badge className={cn("text-sm px-3 py-1.5 flex items-center gap-1.5", c.color)}>
      {icon}
      {c.label}
    </Badge>
  );
});

// Synthesis Deal Scorer Card - Main scoring synthesis
const SynthesisScorerCard = memo(function SynthesisScorerCard({
  data,
  strengthsLimit = Infinity,
  weaknessesLimit = Infinity,
  showFullScore = true,
  hideCriticalRisks = false,
}: {
  data: SynthesisDealScorerData;
  strengthsLimit?: number;
  weaknessesLimit?: number;
  showFullScore?: boolean;
  hideCriticalRisks?: boolean;
}) {
  const visibleStrengths = data.keyStrengths.slice(0, strengthsLimit);
  const hiddenStrengthsCount = Math.max(0, data.keyStrengths.length - strengthsLimit);
  const visibleWeaknesses = data.keyWeaknesses.slice(0, weaknessesLimit);
  const hiddenWeaknessesCount = Math.max(0, data.keyWeaknesses.length - weaknessesLimit);

  return (
    <Card className="md:col-span-2 border-2 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <CardTitle className="text-xl">Score Final</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <VerdictBadge verdict={data.verdict} />
            <ScoreBadge score={data.overallScore} size="lg" />
          </div>
        </div>
        <CardDescription>Score final — analyse multi-tiers avec consensus et réflexion</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-muted-foreground">Recommandation</p>
            <p className="text-lg font-medium mt-1">{data.investmentRecommendation.rationale}</p>
            <p className="text-xs text-muted-foreground mt-2 italic">
              Analyse automatisee a titre informatif uniquement. Ne constitue pas un conseil en investissement.
            </p>
          </div>
          <RecommendationBadge action={data.investmentRecommendation.action} />
        </div>

        {/* Dimension Scores - Only for PRO */}
        {showFullScore ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Scores par dimension</p>
            <div className="grid gap-2">
              {data.dimensionScores.map((dim, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{dim.dimension}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          dim.score >= 70 ? "bg-green-500" :
                          dim.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{dim.score}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ProTeaserSection
            title="Score détaillé par dimension"
            description={`${data.dimensionScores.length} dimensions analysées avec benchmarks`}
            icon={Target}
            previewText={data.comparativeRanking.similarDealsAnalyzed > 0
              ? `Score global: ${data.overallScore}/100 - Top ${data.comparativeRanking.percentileSector}% du secteur`
              : `Score global: ${data.overallScore}/100`
            }
          />
        )}

        {/* Comparative Ranking - Only for PRO, hidden if not enough comparables */}
        {showFullScore && data.comparativeRanking.similarDealsAnalyzed >= 3 && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-2xl font-bold">{data.comparativeRanking.percentileOverall}%</p>
                <p className="text-xs text-muted-foreground">Position globale</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-2xl font-bold">{data.comparativeRanking.percentileSector}%</p>
                <p className="text-xs text-muted-foreground">Position dans le secteur</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-2xl font-bold">{data.comparativeRanking.similarDealsAnalyzed}</p>
                <p className="text-xs text-muted-foreground">Deals Compares</p>
              </div>
            </div>
          </div>
        )}

        {/* Strengths & Weaknesses - Limited for FREE */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Points forts
            </p>
            <ul className="space-y-1">
              {visibleStrengths.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-green-500 mt-1">+</span> {s}
                </li>
              ))}
            </ul>
            {hiddenStrengthsCount > 0 && (
              <ProTeaserInline hiddenCount={hiddenStrengthsCount} itemLabel="points forts" />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600 flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Points faibles
            </p>
            <ul className="space-y-1">
              {visibleWeaknesses.map((w, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-red-500 mt-1">-</span> {w}
                </li>
              ))}
            </ul>
            {hiddenWeaknessesCount > 0 && (
              <ProTeaserInline hiddenCount={hiddenWeaknessesCount} itemLabel="faiblesses" />
            )}
          </div>
        </div>

        {/* Critical Risks (hidden when NoGoReasonsCard shows them) */}
        {!hideCriticalRisks && data.criticalRisks.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Risques critiques
            </p>
            <ul className="space-y-1">
              {data.criticalRisks.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conditions if present */}
        {data.investmentRecommendation.conditions && data.investmentRecommendation.conditions.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-blue-600 mb-2">Conditions</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.investmentRecommendation.conditions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// NO_GO Reasons Card - Shows why a deal is NO_GO when optimistic scenarios are hidden
const NoGoReasonsCard = memo(function NoGoReasonsCard({
  scorerData,
  devilsData,
  contradictionData,
}: {
  scorerData: SynthesisDealScorerData | null;
  devilsData: DevilsAdvocateData | null;
  contradictionData: ContradictionDetectorData | null;
}) {
  const killReasons = devilsData?.findings?.killReasons ?? [];
  const absoluteKills = killReasons.filter(kr => kr.dealBreakerLevel === "ABSOLUTE");
  const conditionalKills = killReasons.filter(kr => kr.dealBreakerLevel === "CONDITIONAL");
  const criticalRisks = scorerData?.criticalRisks ?? [];
  const topConcerns = [
    ...(devilsData?.findings?.concernsSummary?.absolute ?? []),
    ...(devilsData?.findings?.concernsSummary?.conditional ?? []),
  ];
  const criticalContradictions = (contradictionData?.findings?.contradictions ?? [])
    .filter((c: DetectedContradiction) => c.severity === "CRITICAL" || c.severity === "HIGH");

  const hasContent = absoluteKills.length > 0 || conditionalKills.length > 0 ||
    criticalRisks.length > 0 || topConcerns.length > 0 || criticalContradictions.length > 0;

  if (!hasContent) return null;

  return (
    <Card className="md:col-span-2 border-2 border-red-200 bg-gradient-to-b from-red-50/50 to-white">
      <CardHeader className="pb-2 bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-red-600" />
          <CardTitle className="text-lg text-red-900">Pourquoi NO_GO</CardTitle>
        </div>
        <CardDescription>Raisons principales de passer ce deal</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Absolute Kill Reasons */}
        {absoluteKills.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Dealbreakers ({absoluteKills.length})
            </p>
            <div className="space-y-2">
              {absoluteKills.map((kr, i) => (
                <div key={i} className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-900">{kr.reason}</p>
                  {kr.evidence && <p className="text-xs text-red-700 mt-1">{kr.evidence}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditional Kill Reasons */}
        {conditionalKills.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Risques majeurs ({conditionalKills.length})
            </p>
            <div className="space-y-2">
              {conditionalKills.map((kr, i) => (
                <div key={i} className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-sm font-medium text-orange-900">{kr.reason}</p>
                  {kr.evidence && <p className="text-xs text-orange-700 mt-1">{kr.evidence}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critical Risks from Scorer */}
        {criticalRisks.length > 0 && absoluteKills.length === 0 && conditionalKills.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Risques critiques ({criticalRisks.length})
            </p>
            <ul className="space-y-1.5">
              {criticalRisks.map((r, i) => (
                <li key={i} className="text-sm text-red-800 flex items-start gap-2 p-2 rounded bg-red-50 border border-red-100">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Critical Contradictions */}
        {criticalContradictions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
              <Zap className="h-4 w-4" /> Contradictions ({criticalContradictions.length})
            </p>
            <div className="space-y-2">
              {criticalContradictions.slice(0, 3).map((c: DetectedContradiction, i: number) => (
                <div key={i} className="p-2 rounded bg-amber-50 border border-amber-200 text-sm">
                  <p className="font-medium text-amber-900">{c.topic}</p>
                  <p className="text-xs text-amber-700 mt-1">{c.analysis}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Concerns */}
        {topConcerns.length > 0 && absoluteKills.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Eye className="h-4 w-4" /> Points de vigilance
            </p>
            <ul className="space-y-1">
              {topConcerns.slice(0, 5).map((c, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Scenario Modeler Card - Hoisted configs
const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  bull: <TrendingUp className="h-5 w-5 text-green-600" />,
  base: <Minus className="h-5 w-5 text-blue-600" />,
  bear: <TrendingDown className="h-5 w-5 text-red-600" />,
};

const SCENARIO_COLORS: Record<string, string> = {
  bull: "border-green-200 bg-green-50",
  base: "border-blue-200 bg-blue-50",
  bear: "border-red-200 bg-red-50",
};

// Extended scenario colors with catastrophic
const SCENARIO_COLORS_EXTENDED: Record<string, string> = {
  BULL: "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50",
  BASE: "border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50",
  BEAR: "border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50",
  CATASTROPHIC: "border-red-200 bg-gradient-to-r from-red-50 to-rose-50",
};

const SCENARIO_ICONS_EXTENDED: Record<string, React.ReactNode> = {
  BULL: <TrendingUp className="h-5 w-5 text-green-600" />,
  BASE: <Minus className="h-5 w-5 text-blue-600" />,
  BEAR: <TrendingDown className="h-5 w-5 text-orange-600" />,
  CATASTROPHIC: <XCircle className="h-5 w-5 text-red-600" />,
};

const ScenarioModelerCard = memo(function ScenarioModelerCard({ data, overallScore, skepticism }: { data: ScenarioModelerData; overallScore?: number; skepticism?: number }) {
  // Access findings with fallbacks for backwards compatibility
  const scenarios = data.findings?.scenarios ?? [];
  const breakEvenAnalysis = data.findings?.breakEvenAnalysis;
  const sensitivityAnalysis = data.findings?.sensitivityAnalysis ?? [];
  const basedOnComparables = data.findings?.basedOnComparables ?? [];
  const probabilityWeighted = data.findings?.probabilityWeightedOutcome;
  const rawConfidence = data.meta?.confidenceLevel ?? data.score?.value ?? 75;
  // If confidence is 0 or absurdly low, derive from overall score
  const confidenceLevel = rawConfidence > 0 ? rawConfidence : (overallScore ?? 0);
  const isNoGo = (overallScore ?? 100) < 35;

  // Calculate expected return (with and without failure scenario)
  const expectedReturn = useMemo(() => {
    if (!scenarios.length) return null;

    // Full calculation (all scenarios including failure)
    let expMult = 0;
    let expIRR = 0;

    // Success-only calculation (excluding failure/catastrophe scenarios)
    let successMult = 0;
    let successIRR = 0;
    let successProbTotal = 0;

    for (const s of scenarios) {
      const prob = (s.probability?.value ?? 0) / 100;
      const multiple = s.investorReturn?.multiple ?? 0;
      const irr = s.investorReturn?.irr ?? 0;

      expMult += prob * multiple;
      expIRR += prob * irr;

      // Exclude failure scenarios from "success" calculation
      const scenarioName = (s.name ?? "").toLowerCase();
      const isFailure = scenarioName === "catastrophic" ||
                        scenarioName.includes("failure") ||
                        scenarioName.includes("catastrophe") ||
                        scenarioName.includes("catastrophic") ||
                        multiple <= 0;
      if (!isFailure) {
        successMult += prob * multiple;
        successIRR += prob * irr;
        successProbTotal += prob;
      }
    }

    // Normalize success metrics by success probability
    const normalizedSuccessIRR = successProbTotal > 0 ? successIRR / successProbTotal : 0;
    const normalizedSuccessMult = successProbTotal > 0 ? successMult / successProbTotal : 0;

    return {
      multiple: expMult,
      irr: expIRR,
      successMultiple: normalizedSuccessMult,
      successIRR: normalizedSuccessIRR,
      successProbability: successProbTotal * 100,
    };
  }, [scenarios]);

  return (
    <Card className="border-2 border-indigo-100">
      <CardHeader className="pb-2 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg">Modélisation Scénarios</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-sm bg-white cursor-help">
                    Fiabilité données : {confidenceLevel}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">Qualité des données d&apos;entrée</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ce score mesure la complétude et la fiabilité des données utilisées pour cette analyse.
                    Ce n&apos;est PAS une probabilité de succès du deal.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <CardDescription>{isNoGo ? "Scénarios de risque" : "4 scénarios avec calculs ROI détaillés"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Expected Return Summary */}
        {expectedReturn && (probabilityWeighted || expectedReturn.multiple > 0) && (
          isNoGo ? (
            <div className="p-4 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-300" />
                <span className="text-sm font-medium text-red-200">Retour Espéré</span>
              </div>
              <div className="text-3xl font-bold text-red-300">—</div>
              <p className="text-sm text-red-200 mt-2">
                Deal évalué NO_GO (score {overallScore}/100). Seuls les scénarios de risque (BEAR, CATASTROPHIC) sont affichés.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-indigo-100">Retour Theorique (estimatif)</span>
                <Badge className="bg-white/20 text-white border-white/30">
                  {data.findings?.mostLikelyScenario ?? "BASE"} le plus probable
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xl font-bold">
                    {Number(probabilityWeighted?.expectedMultiple ?? expectedReturn.multiple ?? 0).toFixed(1)}x
                  </div>
                  <div className="text-xs text-indigo-200 mt-1">
                    Multiple pondéré (tous scénarios)
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-emerald-300">
                    {Number(expectedReturn.successIRR ?? 0).toFixed(0)}%
                  </div>
                  <div className="text-xs text-indigo-200 mt-1">
                    IRR si succes ({Number(expectedReturn.successProbability ?? 0).toFixed(0)}% de chances)
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-indigo-200">IRR ajusté au risque (inclut échec total):</span>
                  <span className={cn(
                    "font-semibold",
                    Number(expectedReturn.irr ?? 0) < 10 ? "text-amber-300" : "text-white"
                  )}>
                    {Number(probabilityWeighted?.expectedIRR ?? expectedReturn.irr ?? 0).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-indigo-300 mt-1">
                  = Moyenne pondérée de tous les scénarios, y compris perte totale ({(100 - Number(expectedReturn.successProbability ?? 0)).toFixed(0)}% de risque)
                </p>
              </div>
              {probabilityWeighted?.riskAdjustedAssessment && (
                <p className="text-sm text-indigo-100 mt-3 border-t border-white/20 pt-3">
                  {probabilityWeighted.riskAdjustedAssessment}
                </p>
              )}
              <p className="text-xs text-indigo-200/70 mt-2 border-t border-white/10 pt-2">
                Projection estimative basee sur des hypotheses. ~70% des startups early-stage echouent.
                Le rendement reel peut etre significativement different.
              </p>
            </div>
          )
        )}

        {/* Scenarios Grid */}
        {isNoGo && (
          <p className="text-xs text-muted-foreground italic">Seuls les scénarios de risque sont affichés pour un deal NO_GO.</p>
        )}
        <div className="space-y-3">
          {scenarios.filter((s: ScenarioV2) => !isNoGo || s.name === "CATASTROPHIC" || s.name === "BEAR").map((scenario: ScenarioV2, i: number) => {
            const investorReturn = scenario.investorReturn;
            const multiple = investorReturn?.multiple ?? 0;
            const probability = scenario.probability?.value ?? 0;
            const comparable = scenario.basedOnComparable;
            const investment = investorReturn?.initialInvestment ?? 0;
            // Recalculer les proceeds depuis le multiple pour garantir la coherence
            const computedProceeds = Math.round(investment * multiple);
            const years = investorReturn?.holdingPeriodYears ?? 6;
            // IRR coherent avec le multiple: (multiple^(1/years) - 1) * 100
            const computedIRR = multiple > 0
              ? Math.round((Math.pow(multiple, 1 / years) - 1) * 1000) / 10
              : -100;

            return (
              <div key={i} className={cn("p-4 rounded-lg border-2 transition-all hover:shadow-md", SCENARIO_COLORS_EXTENDED[scenario.name] ?? "border-gray-200 bg-gray-50")}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {SCENARIO_ICONS_EXTENDED[scenario.name] ?? <Minus className="h-5 w-5" />}
                    <span className="font-bold text-base">{scenario.name}</span>
                    <Badge variant="outline" className={cn(
                      "font-bold",
                      scenario.name === "BULL" ? "bg-green-100 text-green-800 border-green-300" :
                      scenario.name === "BASE" ? "bg-blue-100 text-blue-800 border-blue-300" :
                      scenario.name === "BEAR" ? "bg-orange-100 text-orange-800 border-orange-300" :
                      "bg-red-100 text-red-800 border-red-300"
                    )}>
                      {probability}% de chances
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "text-2xl font-bold",
                      multiple >= 5 ? "text-green-600" :
                      multiple >= 2 ? "text-blue-600" :
                      multiple >= 1 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {multiple.toFixed(1)}x
                    </span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3">{scenario.description}</p>

                {/* Hypotheses */}
                {scenario.assumptions && scenario.assumptions.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 px-1">
                    {scenario.assumptions.map((a, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <span className="text-muted-foreground">{a.assumption}:</span>
                        <span className="font-medium">{a.value}</span>
                        <span className="text-muted-foreground/60">({a.source})</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Retour potentiel */}
                <div className="p-3 bg-white/50 rounded border text-sm mb-3">
                  <div className="text-xs text-muted-foreground mb-1.5">
                    Retour potentiel ({probability}% de chances)
                  </div>
                  {investment > 0 ? (
                    <div className="font-bold text-base">
                      €{investment.toLocaleString()} → €{computedProceeds.toLocaleString()}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        (x{multiple.toFixed(1)} en {years} ans{computedIRR > 0 ? `, soit ${computedIRR.toFixed(0)}%/an` : ""})
                      </span>
                    </div>
                  ) : (
                    <div className="font-bold text-base">{multiple.toFixed(1)}x</div>
                  )}
                  {scenario.probability?.rationale && (
                    <p className="text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
                      {scenario.probability.rationale}
                    </p>
                  )}
                </div>

                {/* Calcul ROI détaillé (expandable) */}
                {investorReturn && investment > 0 && (
                  <ExpandableSection title="Calcul ROI détaillé" count={1}>
                    <div className="mt-2 p-3 bg-white/70 rounded border text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground">Investissement:</span> €{investment.toLocaleString()}</div>
                        <div><span className="text-muted-foreground">Part au capital:</span> {investorReturn.ownershipAtEntry?.toFixed(2)}%</div>
                        <div><span className="text-muted-foreground">Dilution estimee:</span> {investorReturn.dilutionToExit}%</div>
                        <div><span className="text-muted-foreground">Part a la sortie:</span> {investorReturn.ownershipAtExit?.toFixed(2)}%</div>
                        <div><span className="text-muted-foreground">Retour brut:</span> €{computedProceeds.toLocaleString()}</div>
                        <div><span className="text-muted-foreground">Duree:</span> {years} ans</div>
                      </div>
                      <div className="border-t pt-2 mt-2">
                        <div className="text-muted-foreground mb-1">Calcul:</div>
                        <code className="text-xs bg-gray-100 p-1 rounded block">
                          €{investment.toLocaleString()} × {multiple.toFixed(1)} = €{computedProceeds.toLocaleString()} → IRR = ({multiple.toFixed(1)}^(1/{years}) - 1) = {computedIRR.toFixed(1)}%/an
                        </code>
                      </div>
                    </div>
                  </ExpandableSection>
                )}

                {/* Based on Comparable */}
                {comparable && (
                  <div className="mt-2 p-2 bg-slate-100 rounded text-xs flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">Base sur: </span>
                      <span className="text-slate-700">{comparable.company}</span>
                      <span className="text-muted-foreground"> - {comparable.trajectory}</span>
                      <div className="text-muted-foreground mt-1">{comparable.relevance}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Comparables Used - hidden for NO_GO */}
        {!isNoGo && basedOnComparables.length > 0 && (
          <ExpandableSection title="Comparables utilisés" count={basedOnComparables.length}>
            <div className="mt-2 space-y-2">
              {basedOnComparables.map((c, i) => (
                <div key={i} className="p-3 border rounded bg-slate-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{c.company}</span>
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      c.outcome === "success" ? "bg-green-100 text-green-800" :
                      c.outcome === "moderate_success" ? "bg-blue-100 text-blue-800" :
                      c.outcome === "struggle" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    )}>
                      {c.outcome}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.sector} • {c.stage}</p>
                  <p className="text-xs text-slate-600 mt-1">{c.trajectory}</p>
                  {c.keyMetrics && (
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      {c.keyMetrics.seedValuation && (
                        <div className="p-1 bg-white rounded">Seed: €{(c.keyMetrics.seedValuation / 1000000).toFixed(1)}M</div>
                      )}
                      {c.keyMetrics.timeToExit && (
                        <div className="p-1 bg-white rounded">Exit apres {c.keyMetrics.timeToExit} ans</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Break-even - hidden for NO_GO */}
        {!isNoGo && breakEvenAnalysis && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-slate-50 to-gray-50 border">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-medium">Break-even Analysis</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                breakEvenAnalysis.achievability === "ACHIEVABLE" ? "bg-green-100 text-green-800" :
                breakEvenAnalysis.achievability === "CHALLENGING" ? "bg-yellow-100 text-yellow-800" :
                breakEvenAnalysis.achievability === "UNLIKELY" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              )}>
                {breakEvenAnalysis.achievability}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-2 bg-white rounded border">
                <div className="text-xs text-muted-foreground">Mois to BE</div>
                <div className="font-bold text-lg">{breakEvenAnalysis.monthsToBreakeven}</div>
              </div>
              <div className="p-2 bg-white rounded border">
                <div className="text-xs text-muted-foreground">Growth requis</div>
                <div className="font-bold text-lg">{breakEvenAnalysis.requiredGrowthRate}%</div>
              </div>
              <div className="p-2 bg-white rounded border">
                <div className="text-xs text-muted-foreground">Burn to BE</div>
                <div className="font-bold text-lg">€{(breakEvenAnalysis.burnUntilBreakeven / 1000000).toFixed(1)}M</div>
              </div>
            </div>
            {breakEvenAnalysis.achievabilityRationale && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{breakEvenAnalysis.achievabilityRationale}</p>
            )}
          </div>
        )}

        {/* Sensitivity Analysis - hidden for NO_GO */}
        {!isNoGo && sensitivityAnalysis.length > 0 && (
          <ExpandableSection title="Analyse de sensibilité" count={sensitivityAnalysis.length}>
            <div className="space-y-2 mt-2">
              {sensitivityAnalysis.map((s: SensitivityAnalysisV2, i: number) => (
                <div key={i} className="p-3 border rounded bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{s.variable}</span>
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      (s.impactLevel === "CRITICAL" || s.impactLevel === "HIGH") ? "bg-red-100 text-red-800" :
                      s.impactLevel === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    )}>
                      Impact: {s.impactLevel}
                    </Badge>
                  </div>
                  {s.impactRationale && (
                    <p className="text-xs text-muted-foreground">{s.impactRationale}</p>
                  )}
                  {s.impactOnValuation && s.impactOnValuation.length > 0 && (
                    <div className="flex gap-2 mt-2 text-xs">
                      {s.impactOnValuation.map((impact, j) => (
                        <div key={j} className="p-1 bg-gray-100 rounded">
                          {impact.change}: €{(impact.newValuation / 1000000).toFixed(1)}M
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Devil's Advocate Card - REFONTE v2.0 with WOW factor
const DevilsAdvocateCard = memo(function DevilsAdvocateCard({
  data,
  objectionsLimit = Infinity,
}: {
  data: DevilsAdvocateData;
  objectionsLimit?: number;
}) {
  // Map new structure to display elements
  const allConcerns = [
    ...(data.findings?.concernsSummary?.absolute ?? []).map(c => ({ text: c, level: "absolute" as const })),
    ...(data.findings?.concernsSummary?.conditional ?? []).map(c => ({ text: c, level: "conditional" as const })),
    ...(data.findings?.concernsSummary?.serious ?? []).map(c => ({ text: c, level: "serious" as const })),
  ];
  const visibleConcerns = allConcerns.slice(0, objectionsLimit);
  const hiddenConcernsCount = Math.max(0, allConcerns.length - objectionsLimit);
  const isFree = objectionsLimit !== Infinity;

  // Kill reasons as dealbreakers
  const absoluteKillReasons = (data.findings?.killReasons ?? []).filter(kr => kr.dealBreakerLevel === "ABSOLUTE");
  const conditionalKillReasons = (data.findings?.killReasons ?? []).filter(kr => kr.dealBreakerLevel === "CONDITIONAL");

  // Counter arguments (was challengedAssumptions)
  const counterArguments = data.findings?.counterArguments ?? [];

  // Blind spots
  const blindSpots = data.findings?.blindSpots ?? [];

  // Questions
  const questions = data.questions ?? [];

  // Skepticism score and breakdown
  const skepticismScore = data.findings?.skepticismAssessment?.score ?? 0;
  const skepticismVerdict = data.findings?.skepticismAssessment?.verdict ?? "CAUTIOUS";
  const skepticismBreakdown = data.findings?.skepticismAssessment?.scoreBreakdown ?? [];

  // Worst case
  const worstCase = data.findings?.worstCaseScenario;

  return (
    <Card className="border-2 border-purple-100">
      {/* Header with Skepticism Gauge */}
      <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            <CardTitle className="text-lg">Devil&apos;s Advocate</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {/* Skepticism Gauge */}
            <div className="flex items-center gap-2">
              <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    skepticismScore <= 30 ? "bg-green-500" :
                    skepticismScore <= 50 ? "bg-yellow-500" :
                    skepticismScore <= 70 ? "bg-orange-500" : "bg-red-500"
                  )}
                  style={{ width: `${skepticismScore}%` }}
                />
              </div>
              <SkepticismBadge score={skepticismScore} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <CardDescription>Challenge systematique de la these d&apos;investissement</CardDescription>
          <Badge variant="outline" className={cn(
            "text-xs",
            skepticismVerdict === "CAUTIOUSLY_OPTIMISTIC" || skepticismVerdict === "NEUTRAL" ? "bg-green-100 text-green-800" :
            skepticismVerdict === "CAUTIOUS" ? "bg-yellow-100 text-yellow-800" :
            skepticismVerdict === "SKEPTICAL" ? "bg-orange-100 text-orange-800" :
            "bg-red-100 text-red-800"
          )}>
            {skepticismVerdict.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Skepticism Breakdown (mini bar chart) */}
        {skepticismBreakdown.length > 0 && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-slate-50 to-gray-50 border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Decomposition du scepticisme</p>
            <div className="space-y-2">
              {skepticismBreakdown.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs w-24 truncate" title={item.factor}>{item.factor}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        item.contribution <= 10 ? "bg-green-400" :
                        item.contribution <= 20 ? "bg-yellow-400" :
                        item.contribution <= 30 ? "bg-orange-400" : "bg-red-400"
                      )}
                      style={{ width: `${Math.min(100, item.contribution * 2)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">+{item.contribution}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kill Reasons (Dealbreakers) - ABSOLUTE - Most Important */}
        {absoluteKillReasons.length > 0 && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-red-500 to-rose-600 text-white">
            <p className="font-bold mb-3 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              DEALBREAKERS ABSOLUS ({absoluteKillReasons.length})
            </p>
            <ul className="space-y-3">
              {absoluteKillReasons.map((kr, i) => (
                <li key={i} className="p-3 bg-white/10 rounded backdrop-blur">
                  <span className="font-medium">{kr.reason}</span>
                  {kr.evidence && (
                    <p className="text-sm mt-1 text-red-100">
                      <span className="font-medium">Evidence:</span> {kr.evidence}
                    </p>
                  )}
                  {kr.sourceAgent && (
                    <Badge className="mt-2 bg-white/20 text-white border-white/30 text-xs">
                      Source: {kr.sourceAgent}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Concerns - Limited for FREE */}
        {allConcerns.length > 0 && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200">
            <p className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Top Concerns ({allConcerns.length})
            </p>
            <ul className="space-y-2">
              {visibleConcerns.map((c, i) => (
                <li key={i} className="p-2 bg-white/70 rounded border border-orange-100 flex items-start gap-2">
                  <span className="bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-orange-900">{c.text}</span>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0",
                    c.level === "absolute" ? "bg-red-100 text-red-800 border-red-300" :
                    c.level === "conditional" ? "bg-orange-100 text-orange-800 border-orange-300" :
                    "bg-yellow-100 text-yellow-800 border-yellow-300"
                  )}>
                    {c.level}
                  </Badge>
                </li>
              ))}
            </ul>
            {hiddenConcernsCount > 0 && (
              <div className="mt-3">
                <ProTeaserInline hiddenCount={hiddenConcernsCount} itemLabel="objections" />
              </div>
            )}
          </div>
        )}

        {/* Kill Reasons - CONDITIONAL */}
        {conditionalKillReasons.length > 0 && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200">
            <p className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Dealbreakers Conditionnels ({conditionalKillReasons.length})
            </p>
            <ul className="space-y-3">
              {conditionalKillReasons.slice(0, 5).map((kr, i) => (
                <li key={i} className="p-3 bg-white/70 rounded border border-amber-100">
                  <span className="font-medium text-amber-900">{kr.reason}</span>
                  {kr.condition && (
                    <div className="mt-2 p-2 bg-amber-100/50 rounded text-xs">
                      <span className="font-medium text-amber-800">Condition:</span>{" "}
                      <span className="text-amber-700">{kr.condition}</span>
                    </div>
                  )}
                  {kr.questionToFounder && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-xs flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-blue-700">{kr.questionToFounder}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Counter Arguments with Comparable Failures - THE WOW FACTOR */}
        {isFree ? (
          <ProTeaserSection
            title="Contre-arguments avec comparables echecs"
            description={`${counterArguments.length} theses challengees avec exemples d'echecs reels`}
            icon={Brain}
          />
        ) : (
          counterArguments.length > 0 && (
            <ExpandableSection title="Contre-arguments sources" count={counterArguments.length} defaultOpen>
              <div className="space-y-3 mt-3">
                {counterArguments.slice(0, 6).map((ca, i) => (
                  <div key={i} className="p-4 border-2 rounded-lg bg-white hover:shadow-md transition-shadow">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{ca.thesis}</p>
                        <p className="text-xs text-muted-foreground mt-1">Source: {ca.thesisSource}</p>
                      </div>
                      <Badge variant="outline" className={cn(
                        "shrink-0 ml-2",
                        ca.probability === "HIGH" ? "bg-red-100 text-red-800 border-red-300" :
                        ca.probability === "MEDIUM" ? "bg-orange-100 text-orange-800 border-orange-300" :
                        "bg-green-100 text-green-800 border-green-300"
                      )}>
                        Proba: {ca.probability}
                      </Badge>
                    </div>

                    {/* Counter Argument */}
                    <div className="p-3 bg-slate-50 rounded border-l-4 border-purple-400 mb-3">
                      <p className="text-sm text-slate-700">{ca.counterArgument}</p>
                      {ca.evidence && (
                        <p className="text-xs text-slate-500 mt-2">
                          <span className="font-medium">Evidence:</span> {ca.evidence}
                        </p>
                      )}
                    </div>

                    {/* Comparable Failure - THE KEY VALUE */}
                    {ca.comparableFailure && (
                      <div className="p-3 bg-gradient-to-r from-red-50 to-rose-50 rounded border border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="font-medium text-sm text-red-800">Comparable Echec Reel</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Entreprise:</span>
                            <span className="ml-1 font-medium text-red-700">{ca.comparableFailure.company}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Secteur:</span>
                            <span className="ml-1">{ca.comparableFailure.sector}</span>
                          </div>
                          {ca.comparableFailure.fundingRaised && (
                            <div>
                              <span className="text-muted-foreground">Funding leve:</span>
                              <span className="ml-1">€{(ca.comparableFailure.fundingRaised / 1000000).toFixed(1)}M</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Source:</span>
                            <span className="ml-1">{ca.comparableFailure.source}</span>
                          </div>
                        </div>
                        <div className="mt-2 p-2 bg-white/50 rounded">
                          <p className="text-xs"><span className="font-medium">Similarite:</span> {ca.comparableFailure.similarity}</p>
                          <p className="text-xs text-red-600 mt-1"><span className="font-medium">Outcome:</span> {ca.comparableFailure.outcome}</p>
                          {ca.comparableFailure.lessonsLearned && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-medium">Lecon:</span> {ca.comparableFailure.lessonsLearned}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mitigation if available */}
                    {ca.mitigationPossible && ca.mitigation && (
                      <div className="mt-2 p-2 bg-green-50 rounded border border-green-200 flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-green-700">
                          <span className="font-medium">Mitigation possible:</span> {ca.mitigation}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ExpandableSection>
          )
        )}

        {/* Blind Spots - PRO only */}
        {!isFree && blindSpots.length > 0 && (
          <ExpandableSection title="Blind Spots identifies" count={blindSpots.length}>
            <div className="space-y-2 mt-3">
              {blindSpots.map((b, i) => (
                <div key={i} className="p-3 border-2 rounded-lg bg-purple-50/50 border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm flex items-center gap-2">
                      <Eye className="h-4 w-4 text-purple-500" /> {b.area}
                    </p>
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      b.urgency === "IMMEDIATE" ? "bg-red-100 text-red-800 border-red-300" :
                      b.urgency === "BEFORE_DECISION" ? "bg-orange-100 text-orange-800 border-orange-300" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {b.urgency?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{b.description}</p>
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs flex items-start gap-2">
                    <Target className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-blue-700">{b.recommendedAction}</span>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Critical & High Questions - PRO only */}
        {!isFree && questions.filter(q => q.priority === "CRITICAL" || q.priority === "HIGH").length > 0 && (
          <ExpandableSection
            title="Questions importantes pour le fondateur"
            count={questions.filter(q => q.priority === "CRITICAL" || q.priority === "HIGH").length}
          >
            <ul className="space-y-2 mt-3">
              {questions.filter(q => q.priority === "CRITICAL" || q.priority === "HIGH").map((q, i) => (
                <li key={i} className={cn(
                  "p-3 border-2 rounded-lg",
                  q.priority === "CRITICAL"
                    ? "bg-red-50/50 border-red-200"
                    : "bg-yellow-50/50 border-yellow-200"
                )}>
                  <div className="flex items-start gap-2">
                    <Lightbulb className={cn(
                      "h-5 w-5 shrink-0",
                      q.priority === "CRITICAL" ? "text-red-500" : "text-yellow-500"
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">{q.question}</p>
                        <Badge variant="outline" className={cn(
                          "text-xs shrink-0",
                          q.priority === "CRITICAL"
                            ? "bg-red-100 text-red-800 border-red-300"
                            : "bg-yellow-100 text-yellow-800 border-yellow-300"
                        )}>
                          {q.priority}
                        </Badge>
                      </div>
                      {q.context && (
                        <p className="text-xs text-muted-foreground mt-1">Contexte: {q.context}</p>
                      )}
                      {q.whatToLookFor && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                          <span className="font-medium text-red-700">Red flag si:</span>{" "}
                          <span className="text-red-600">{q.whatToLookFor}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}

        {/* Worst Case Scenario - PRO only - THE DRAMATIC FINALE */}
        {!isFree && worstCase && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-gray-900 via-red-900 to-gray-900 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-red-500/20 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-6 w-6 text-red-400" />
                <span className="font-bold text-lg">Scenario Catastrophe</span>
              </div>
              <p className="font-medium text-lg text-white mb-2">{worstCase.name}</p>
              <p className="text-sm text-gray-300 mb-4">{worstCase.description}</p>

              {/* Triggers */}
              {worstCase.triggers && worstCase.triggers.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Declencheurs possibles:</p>
                  <div className="flex flex-wrap gap-2">
                    {worstCase.triggers.slice(0, 4).map((t, i) => (
                      <Badge key={i} className={cn(
                        "text-xs",
                        t.probability === "HIGH" ? "bg-red-500/30 text-red-200" :
                        t.probability === "MEDIUM" ? "bg-orange-500/30 text-orange-200" :
                        "bg-yellow-500/30 text-yellow-200"
                      )}>
                        {t.trigger}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/10 rounded">
                  <div className="text-xs text-gray-400">Probabilite</div>
                  <div className="text-2xl font-bold text-red-400">{worstCase.probability}%</div>
                </div>
                <div className="p-3 bg-white/10 rounded">
                  <div className="text-xs text-gray-400">Perte estimee</div>
                  <div className="text-2xl font-bold text-red-400">
                    {worstCase.lossAmount?.totalLoss ? "100%" : worstCase.lossAmount?.estimatedLoss ?? "N/A"}
                  </div>
                </div>
              </div>

              {/* Loss calculation */}
              {worstCase.lossAmount?.calculation && (
                <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-white/20">
                  Calcul: {worstCase.lossAmount.calculation}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Contradiction Detector Card - Hoisted config
const CONTRADICTION_SEVERITY_COLORS: Record<string, string> = {
  minor: "bg-gray-100 text-gray-800",
  moderate: "bg-yellow-100 text-yellow-800",
  major: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const ContradictionDetectorCard = memo(function ContradictionDetectorCard({ data }: { data: ContradictionDetectorData }) {
  // Access findings with fallbacks for backwards compatibility
  const contradictions = data.findings?.contradictions ?? [];
  const dataGaps = data.findings?.dataGaps ?? [];
  const consistencyScore = data.findings?.consistencyAnalysis?.overallScore ?? data.score?.value ?? 0;
  const summaryAssessment = data.narrative?.summary ?? data.narrative?.keyInsights?.[0] ?? "";
  const consistencyBreakdown = data.findings?.consistencyAnalysis?.breakdown ?? [];
  const redFlagConvergence = data.findings?.redFlagConvergence ?? [];
  const agentSummary = data.findings?.agentOutputsSummary ?? [];

  // Count by severity
  const criticalCount = contradictions.filter(c => c.severity === "CRITICAL").length;
  const highCount = contradictions.filter(c => c.severity === "HIGH").length;
  const mediumCount = contradictions.filter(c => c.severity === "MEDIUM").length;

  return (
    <Card className="border-2 border-amber-100">
      <CardHeader className="pb-2 bg-gradient-to-r from-amber-50 to-yellow-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-600" />
            <CardTitle className="text-lg">Coherence & Contradictions</CardTitle>
          </div>
          {/* Consistency Score Gauge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    consistencyScore >= 80 ? "bg-green-500" :
                    consistencyScore >= 60 ? "bg-yellow-500" :
                    consistencyScore >= 40 ? "bg-orange-500" : "bg-red-500"
                  )}
                  style={{ width: `${consistencyScore}%` }}
                />
              </div>
            </div>
            <ScoreBadge score={consistencyScore} size="lg" />
          </div>
        </div>
        <CardDescription>
          Cross-validation de toutes les analyses - detection d&apos;incoherences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-white border text-center">
            <div className="text-2xl font-bold">{contradictions.length}</div>
            <div className="text-xs text-muted-foreground">Contradictions</div>
          </div>
          <div className={cn("p-3 rounded-lg text-center", criticalCount > 0 ? "bg-red-50 border-2 border-red-200" : "bg-white border")}>
            <div className={cn("text-2xl font-bold", criticalCount > 0 ? "text-red-600" : "text-green-600")}>{criticalCount}</div>
            <div className="text-xs text-muted-foreground">Critiques</div>
          </div>
          <div className={cn("p-3 rounded-lg text-center", highCount > 0 ? "bg-orange-50 border-2 border-orange-200" : "bg-white border")}>
            <div className={cn("text-2xl font-bold", highCount > 0 ? "text-orange-600" : "text-green-600")}>{highCount}</div>
            <div className="text-xs text-muted-foreground">Majeurs</div>
          </div>
          <div className="p-3 rounded-lg bg-white border text-center">
            <div className="text-2xl font-bold">{dataGaps.length}</div>
            <div className="text-xs text-muted-foreground">Gaps</div>
          </div>
        </div>

        {/* Summary Assessment */}
        {summaryAssessment && (
          <div className={cn(
            "p-4 rounded-lg border-2",
            consistencyScore >= 70 ? "bg-green-50 border-green-200" :
            consistencyScore >= 50 ? "bg-yellow-50 border-yellow-200" :
            "bg-red-50 border-red-200"
          )}>
            <div className="flex items-start gap-2">
              {consistencyScore >= 70 ? (
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              ) : consistencyScore >= 50 ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
              )}
              <p className="text-sm">{summaryAssessment}</p>
            </div>
          </div>
        )}

        {/* Contradictions - Table format */}
        {contradictions.length > 0 ? (
          <ExpandableSection title="Contradictions détectées" count={contradictions.length} defaultOpen>
            <div className="mt-3 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Sujet</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Le deck dit...</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Les agents trouvent...</th>
                    <th className="text-center p-3 font-medium text-muted-foreground w-24">Severite</th>
                  </tr>
                </thead>
                <tbody>
                  {contradictions.map((c: DetectedContradiction, i: number) => (
                    <tr key={i} className={cn(
                      "border-b last:border-b-0",
                      c.severity === "CRITICAL" ? "bg-red-50/50" :
                      c.severity === "HIGH" ? "bg-orange-50/50" : "bg-yellow-50/30"
                    )}>
                      <td className="p-3 font-medium">{c.topic}</td>
                      <td className="p-3 text-muted-foreground">{c.statement1.text}</td>
                      <td className="p-3 text-muted-foreground">{c.statement2.text}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={cn(
                          "text-xs font-bold",
                          c.severity === "CRITICAL" ? "bg-red-100 text-red-800 border-red-300" :
                          c.severity === "HIGH" ? "bg-orange-100 text-orange-800 border-orange-300" :
                          "bg-yellow-100 text-yellow-800 border-yellow-300"
                        )}>
                          {c.severity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ExpandableSection>
        ) : (
          <div className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Aucune contradiction majeure</p>
              <p className="text-sm text-green-700">Les analyses des 12 agents sont coherentes entre elles.</p>
            </div>
          </div>
        )}

        {/* Data Gaps */}
        {dataGaps.length > 0 && (
          <ExpandableSection title="Données manquantes" count={dataGaps.length}>
            <div className="space-y-2 mt-3">
              {dataGaps.map((g: DataGap, i: number) => (
                <div key={i} className={cn(
                  "p-3 rounded-lg border-2",
                  (g.importance === "CRITICAL" || g.importance === "HIGH") ? "border-red-200 bg-red-50" :
                  g.importance === "MEDIUM" ? "border-yellow-200 bg-yellow-50" :
                  "border-gray-200 bg-gray-50"
                )}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{g.area}</p>
                      <p className="text-xs text-muted-foreground mt-1">{g.recommendation}</p>
                      {g.impactOnAnalysis && (
                        <p className="text-xs text-blue-600 mt-2">
                          <span className="font-medium">Impact:</span> {g.impactOnAnalysis}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-xs shrink-0 ml-2",
                      (g.importance === "CRITICAL" || g.importance === "HIGH") ? "bg-red-100 text-red-800 border-red-300" :
                      g.importance === "MEDIUM" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {g.importance}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Memo Generator Card
const MemoGeneratorCard = memo(function MemoGeneratorCard({ data }: { data: MemoGeneratorData }) {
  const recommendationConfig = {
    invest: { label: "Investir", color: "bg-green-500 text-white" },
    pass: { label: "Passer", color: "bg-red-500 text-white" },
    more_dd_needed: { label: "DD supplementaire", color: "bg-yellow-500 text-white" },
  };
  const rec = recommendationConfig[data.executiveSummary.recommendation] ??
    { label: data.executiveSummary.recommendation, color: "bg-gray-500 text-white" };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg">Investment Memo</CardTitle>
          </div>
          <Badge className={cn("text-sm px-3 py-1", rec.color)}>{rec.label}</Badge>
        </div>
        <CardDescription>Memo d&apos;investissement complet</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Executive Summary */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
          <p className="text-lg font-medium mb-2">&quot;{data.executiveSummary.oneLiner}&quot;</p>
          <ul className="space-y-1">
            {data.executiveSummary.keyPoints.map((p, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Company Overview */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Probleme</p>
            <p className="text-sm text-muted-foreground">{data.companyOverview.problem}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Solution</p>
            <p className="text-sm text-muted-foreground">{data.companyOverview.solution}</p>
          </div>
        </div>

        {/* Investment Highlights */}
        <ExpandableSection title="Investment Highlights" count={data.investmentHighlights.length} defaultOpen>
          <div className="space-y-2 mt-2">
            {data.investmentHighlights.map((h, i) => (
              <div key={i} className="p-2 border rounded bg-green-50">
                <p className="text-sm font-medium text-green-800">{h.highlight}</p>
                <p className="text-xs text-green-600 mt-1">{h.evidence}</p>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Key Risks */}
        <ExpandableSection title="Risques clés" count={data.keyRisks.length} defaultOpen>
          <div className="space-y-2 mt-2">
            {data.keyRisks.map((r, i) => (
              <div key={i} className="p-2 border rounded">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{r.risk}</p>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0 ml-2",
                    r.residualRisk === "high" ? "bg-red-100 text-red-800" :
                    r.residualRisk === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800"
                  )}>
                    {r.residualRisk}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Mitigation: {r.mitigation}</p>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Investment Thesis */}
        <div className="p-4 rounded-lg bg-muted">
          <p className="text-sm font-medium mb-2">These d&apos;investissement</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.investmentThesis}</p>
        </div>

        {/* Deal Terms */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg border">
            <p className="text-sm font-medium mb-2">Termes du deal</p>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Valorisation:</span> {data.dealTerms.valuation}</p>
              <p><span className="text-muted-foreground">Taille du round:</span> {data.dealTerms.roundSize}</p>
            </div>
          </div>
          <div className="p-3 rounded-lg border">
            <p className="text-sm font-medium mb-2">Points de negociation</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.dealTerms.negotiationPoints.slice(0, 3).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Due Diligence Findings */}
        {(data.dueDiligenceFindings.outstanding.length > 0 || data.dueDiligenceFindings.redFlags.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            {data.dueDiligenceFindings.outstanding.length > 0 && (
              <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                <p className="text-sm font-medium text-yellow-800 mb-2">DD a completer</p>
                <ul className="text-sm text-yellow-700 list-disc list-inside">
                  {data.dueDiligenceFindings.outstanding.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            )}
            {data.dueDiligenceFindings.redFlags.length > 0 && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                <p className="text-sm font-medium text-red-800 mb-2">Red Flags</p>
                <ul className="text-sm text-red-700 list-disc list-inside">
                  {data.dueDiligenceFindings.redFlags.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Next Steps */}
        {data.nextSteps.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">Prochaines etapes</p>
            <ul className="space-y-1">
              {data.nextSteps.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Calculate expected return from scenarios
function calculateExpectedReturn(scenarios: ScenarioV2[]): {
  expectedMultiple: number;
  expectedIRR: number;
  calculation: string;
} {
  if (!scenarios?.length) return { expectedMultiple: 0, expectedIRR: 0, calculation: "" };

  let expectedMultiple = 0;
  let expectedIRR = 0;
  const parts: string[] = [];

  for (const s of scenarios) {
    const prob = (s.probability?.value ?? 0) / 100;
    const mult = s.investorReturn?.multiple ?? 0;
    const irr = s.investorReturn?.irr ?? 0;

    expectedMultiple += prob * mult;
    expectedIRR += prob * irr;

    if (prob > 0) {
      parts.push(`${(prob * 100).toFixed(0)}%×${mult.toFixed(1)}x`);
    }
  }

  return {
    expectedMultiple,
    expectedIRR,
    calculation: parts.join(" + ") + ` = ${expectedMultiple.toFixed(1)}x`,
  };
}

// Get the color class for IRR display
function getIRRColorClass(irr: number): string {
  if (irr >= 50) return "text-green-400";
  if (irr >= 30) return "text-emerald-400";
  if (irr >= 15) return "text-blue-400";
  if (irr >= 0) return "text-yellow-400";
  return "text-red-400";
}

// Main Tier 3 Results Component - Synthesis Agents
export function Tier3Results({ results, subscriptionPlan = "FREE", totalAgentsRun }: Tier3ResultsProps) {
  const getAgentData = useCallback(<T,>(agentName: string): T | null => {
    const result = results[agentName];
    if (!result?.success || !result.data) return null;
    return result.data as T;
  }, [results]);

  const scorerData = getAgentData<SynthesisDealScorerData>("synthesis-deal-scorer");
  const scenarioData = getAgentData<ScenarioModelerData>("scenario-modeler");
  const devilsData = getAgentData<DevilsAdvocateData>("devils-advocate");
  const contradictionData = getAgentData<ContradictionDetectorData>("contradiction-detector");
  const memoData = getAgentData<MemoGeneratorData>("memo-generator");

  // Get display limits based on plan
  const displayLimits = useMemo(() => getDisplayLimits(subscriptionPlan), [subscriptionPlan]);
  const isFree = subscriptionPlan === "FREE";

  const successfulAgents = useMemo(() => {
    return Object.values(results).filter(r => r.success).length;
  }, [results]);

  // Calculate expected return from scenarios, adjusted by skepticism
  const expectedReturn = useMemo(() => {
    if (!scenarioData?.findings?.scenarios) return null;
    const raw = calculateExpectedReturn(scenarioData.findings.scenarios);

    // Apply skepticism adjustment — confidence-weighted expected return
    // A skepticism score IS a probability of failure. If devil's advocate says 88/100,
    // there's roughly an 88% chance the deal goes wrong.
    // We use skepticism directly as a loss probability:
    //   skepticism 50 → multiply by 0.50 (2.2x from 4.4x)
    //   skepticism 70 → multiply by 0.30 (1.3x from 4.4x)
    //   skepticism 88 → multiply by 0.12 (0.5x from 4.4x)
    //   skepticism 95 → multiply by 0.05 (0.2x from 4.4x)
    const skepticism = devilsData?.findings?.skepticismAssessment?.score ?? 0;
    if (skepticism > 0) {
      const survivalRate = Math.pow(1 - skepticism / 100, 2); // squared for extra pessimism
      raw.expectedMultiple = raw.expectedMultiple * survivalRate;
      raw.expectedIRR = raw.expectedIRR * survivalRate;
      if (skepticism > 40) {
        raw.calculation = raw.calculation + ` (×${(survivalRate * 100).toFixed(0)}% survie)`;
      }
    }

    return raw;
  }, [scenarioData, devilsData]);

  // Get key metrics for impactful header
  const headerMetrics = useMemo(() => {
    const baseScenario = scenarioData?.findings?.scenarios?.find(s => s.name === "BASE");
    const bullScenario = scenarioData?.findings?.scenarios?.find(s => s.name === "BULL");
    const skepticism = devilsData?.findings?.skepticismAssessment?.score ?? 0;
    const killReasons = devilsData?.findings?.killReasons?.filter(kr => kr.dealBreakerLevel === "ABSOLUTE")?.length ?? 0;
    const contradictions = contradictionData?.findings?.contradictions?.filter(c => c.severity === "CRITICAL" || c.severity === "HIGH")?.length ?? 0;

    return {
      baseIRR: baseScenario?.investorReturn?.irr ?? 0,
      bullIRR: bullScenario?.investorReturn?.irr ?? 0,
      baseMultiple: baseScenario?.investorReturn?.multiple ?? 0,
      bullMultiple: bullScenario?.investorReturn?.multiple ?? 0,
      skepticism,
      killReasons,
      contradictions,
    };
  }, [scenarioData, devilsData, contradictionData]);

  return (
    <div className="space-y-6">
      {/* Impactful Summary Header - Shows the VALUE immediately */}
      <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <CardHeader className="pb-3 relative">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                <Target className="h-7 w-7 text-primary" />
                Synthese Due Diligence
              </CardTitle>
              <CardDescription className="text-slate-300 mt-1">
                {totalAgentsRun ?? successfulAgents} agents d&apos;analyse • Score, Scenarios, Risques, Memo
              </CardDescription>
            </div>
            {scorerData && (
              <div className="text-right">
                <div className="text-4xl font-bold text-white">{scorerData.overallScore}<span className="text-xl text-slate-400">/100</span></div>
                <VerdictBadge verdict={
                  scorerData.overallScore >= 85 ? "strong_pass" :
                  scorerData.overallScore >= 70 ? "pass" :
                  scorerData.overallScore >= 55 ? "conditional_pass" :
                  scorerData.overallScore >= 40 ? "weak_pass" : "no_go"
                } />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative">
          {/* Key Metrics Grid - The WOW factor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {/* Expected Return */}
            {expectedReturn && (
              <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10 relative">
                <Badge className="absolute -top-2 -right-2 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 border-0">
                  PROJECTION
                </Badge>
                <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Rendement Theorique (estimatif)</div>
                {expectedReturn.expectedMultiple < 1 ? (
                  <>
                    <div className="text-3xl font-bold text-slate-500">—</div>
                    <div className="text-xs text-slate-500 mt-1">Retour improbable</div>
                  </>
                ) : (
                  <>
                    <div className={cn("text-3xl font-bold",
                      Number(expectedReturn.expectedMultiple ?? 0) >= 5 ? "text-emerald-400" :
                      Number(expectedReturn.expectedMultiple ?? 0) >= 3 ? "text-green-400" :
                      Number(expectedReturn.expectedMultiple ?? 0) >= 2 ? "text-yellow-400" :
                      "text-orange-400"
                    )}>{Number(expectedReturn.expectedMultiple ?? 0).toFixed(1)}x</div>
                    <div className="text-xs text-slate-400 mt-1">Pondere par scenarios</div>
                  </>
                )}
              </div>
            )}

            {/* Expected IRR */}
            {expectedReturn && expectedReturn.expectedIRR !== 0 && (
              <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10 relative">
                <Badge className="absolute -top-2 -right-2 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 border-0">
                  PROJECTION
                </Badge>
                <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">IRR Theorique (estimatif)</div>
                <div className={cn("text-3xl font-bold", getIRRColorClass(Number(expectedReturn.expectedIRR ?? 0)))}>
                  {Number(expectedReturn.expectedIRR ?? 0).toFixed(0)}%
                </div>
                <div className="text-xs text-slate-400 mt-1">Moyenne pondérée</div>
              </div>
            )}

            {/* Skepticism Score */}
            <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Scepticisme</div>
              <div className={cn(
                "text-3xl font-bold",
                headerMetrics.skepticism <= 30 ? "text-green-400" :
                headerMetrics.skepticism <= 50 ? "text-yellow-400" :
                headerMetrics.skepticism <= 70 ? "text-orange-400" : "text-red-400"
              )}>
                {headerMetrics.skepticism}/100
              </div>
              <div className="text-xs text-slate-400 mt-1">Devil&apos;s Advocate</div>
            </div>

            {/* Risk Indicators */}
            <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Alertes</div>
              <div className="flex items-center gap-2">
                {headerMetrics.killReasons > 0 && (
                  <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-1 rounded text-sm font-bold">
                    <XCircle className="h-4 w-4" /> {headerMetrics.killReasons}
                  </span>
                )}
                {headerMetrics.contradictions > 0 && (
                  <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-sm font-bold">
                    <Zap className="h-4 w-4" /> {headerMetrics.contradictions}
                  </span>
                )}
                {headerMetrics.killReasons === 0 && headerMetrics.contradictions === 0 && (
                  <span className="flex items-center gap-1 bg-green-500/20 text-green-400 px-2 py-1 rounded text-sm font-bold">
                    <CheckCircle className="h-4 w-4" /> OK
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {headerMetrics.killReasons > 0 ? "Dealbreakers" : headerMetrics.contradictions > 0 ? "Contradictions" : "Pas de blocage"}
              </div>
            </div>
          </div>

          {/* Warning projection */}
          {expectedReturn && expectedReturn.expectedMultiple >= 1 && (
            <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                <strong>Attention :</strong> Ces projections sont <strong>theoriques et estimatives</strong>,
                basees sur les claims du fondateur et des scenarios modelises.
                En realite, <strong>~70% des startups early-stage echouent</strong> (source : CB Insights, Harvard Business School).
                Le rendement reel peut etre significativement different, y compris une perte totale du capital.
              </p>
            </div>
          )}

          {/* Recommendation Banner */}
          {scorerData && (
            <div className="flex items-center justify-between bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-4">
                <RecommendationBadge action={scorerData.investmentRecommendation.action} />
                <p className="text-sm text-slate-200 max-w-xl">{scorerData.investmentRecommendation.rationale}</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="border-white/20 text-white cursor-help">
                      Fiabilité données : {scorerData.confidence}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">Qualité des données d&apos;entrée</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ce score mesure la complétude et la fiabilité des données disponibles,
                      pas la probabilité de succès du deal.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Results */}
      <Tabs defaultValue="synthesis" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="synthesis">Score & Scenarios</TabsTrigger>
          <TabsTrigger value="challenge">Challenge</TabsTrigger>
          <TabsTrigger value="memo">Memo</TabsTrigger>
        </TabsList>

        <TabsContent value="synthesis" className="space-y-4 mt-4">
          {(() => {
            const showNoGo = !isFree && scorerData && (scorerData.overallScore ?? 100) < 35;
            return (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {scorerData && (
                    <SynthesisScorerCard
                      data={scorerData}
                      strengthsLimit={displayLimits.strengths}
                      weaknessesLimit={displayLimits.weaknesses}
                      showFullScore={displayLimits.score}
                      hideCriticalRisks={!!showNoGo}
                    />
                  )}
                </div>
                {/* NO_GO: full-width "Pourquoi NO_GO" card */}
                {showNoGo && (
                  <NoGoReasonsCard
                    scorerData={scorerData}
                    devilsData={devilsData}
                    contradictionData={contradictionData}
                  />
                )}
              </>
            );
          })()}

          {(() => {
            const isNoGoLayout = !isFree && scorerData && (scorerData.overallScore ?? 100) < 35;
            return (
              <div className={cn("grid gap-4", isNoGoLayout ? "md:grid-cols-1" : "md:grid-cols-2")}>
                {/* Scenarios - PRO only */}
                {isFree ? (
                  <ProTeaserSection
                    title="Scénarios modélisés"
                    description="3 scenarios Bull/Base/Bear avec projections ROI et IRR"
                    icon={BarChart3}
                    previewText={scenarioData ? `Fiabilité : ${scenarioData.meta?.confidenceLevel ?? scenarioData.score?.value ?? 75}%` : undefined}
                  />
                ) : (
                  scenarioData && <ScenarioModelerCard data={scenarioData} overallScore={scorerData?.overallScore} skepticism={devilsData?.findings?.skepticismAssessment?.score} />
                )}

                {/* Contradictions - PRO only (FREE sees count teaser) */}
                {isFree ? (
                  <ProTeaserSection
                    title="Contradictions détectées"
                    description={contradictionData
                      ? `${contradictionData.findings?.contradictions?.length ?? 0} contradiction(s) identifiee(s) entre les analyses`
                      : "Détection automatique des incohérences"}
                    icon={Zap}
                    previewText={contradictionData ? `Score coherence: ${contradictionData.findings?.consistencyAnalysis?.overallScore ?? contradictionData.score?.value ?? 0}/100` : undefined}
                  />
                ) : (
                  contradictionData && <ContradictionDetectorCard data={contradictionData} />
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="challenge" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-1">
            {devilsData && (
              <DevilsAdvocateCard
                data={devilsData}
                objectionsLimit={displayLimits.devilsAdvocate}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="memo" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-1">
            {/* Memo - PRO only */}
            {isFree ? (
              <ProTeaserSection
                title="Investment Memo"
                description="Memo d'investissement complet et exportable en PDF"
                icon={FileText}
                previewText={memoData ? memoData.executiveSummary.oneLiner : undefined}
              />
            ) : (
              memoData && <MemoGeneratorCard data={memoData} />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
