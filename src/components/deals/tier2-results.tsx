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
} from "@/agents/types";

interface Tier2ResultsProps {
  results: Record<string, {
    agentName: string;
    success: boolean;
    executionTimeMs: number;
    cost: number;
    error?: string;
    data?: unknown;
  }>;
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
  strong_pass: { label: "Strong Pass", color: "bg-green-100 text-green-800 border-green-300" },
  pass: { label: "Pass", color: "bg-blue-100 text-blue-800 border-blue-300" },
  conditional_pass: { label: "Conditional", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  weak_pass: { label: "Weak Pass", color: "bg-orange-100 text-orange-800 border-orange-300" },
  no_go: { label: "No Go", color: "bg-red-100 text-red-800 border-red-300" },
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
  negotiate: { label: "Negocier", color: "bg-blue-500 text-white" },
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
const SynthesisScorerCard = memo(function SynthesisScorerCard({ data }: { data: SynthesisDealScorerData }) {
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
        <CardDescription>Synthese de tous les agents Tier 1</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-muted-foreground">Recommandation</p>
            <p className="text-lg font-medium mt-1">{data.investmentRecommendation.rationale}</p>
          </div>
          <RecommendationBadge action={data.investmentRecommendation.action} />
        </div>

        {/* Dimension Scores */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Scores par dimension</p>
          <div className="grid gap-2">
            {data.dimensionScores.map((dim, i) => (
              <div key={i} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{dim.dimension}</span>
                  <Badge variant="outline" className="text-xs">{dim.weight}%</Badge>
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

        {/* Comparative Ranking */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-2xl font-bold">{data.comparativeRanking.percentileOverall}%</p>
            <p className="text-xs text-muted-foreground">Percentile Global</p>
          </div>
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-2xl font-bold">{data.comparativeRanking.percentileSector}%</p>
            <p className="text-xs text-muted-foreground">Percentile Secteur</p>
          </div>
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-2xl font-bold">{data.comparativeRanking.similarDealsAnalyzed}</p>
            <p className="text-xs text-muted-foreground">Deals Compares</p>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Points forts
            </p>
            <ul className="space-y-1">
              {data.keyStrengths.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-green-500 mt-1">+</span> {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600 flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Points faibles
            </p>
            <ul className="space-y-1">
              {data.keyWeaknesses.map((w, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-red-500 mt-1">-</span> {w}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Critical Risks */}
        {data.criticalRisks.length > 0 && (
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

const ScenarioModelerCard = memo(function ScenarioModelerCard({ data }: { data: ScenarioModelerData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg">Scenarios</CardTitle>
          </div>
          <Badge variant="outline" className="text-sm">
            Confiance: {data.confidenceLevel}%
          </Badge>
        </div>
        <CardDescription>Bull / Base / Bear avec projections ROI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scenarios */}
        <div className="space-y-3">
          {data.scenarios.map((scenario, i) => (
            <div key={i} className={cn("p-3 rounded-lg border", SCENARIO_COLORS[scenario.name])}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {SCENARIO_ICONS[scenario.name]}
                  <span className="font-medium capitalize">{scenario.name}</span>
                  <Badge variant="outline" className="text-xs">{scenario.probability}%</Badge>
                </div>
                <span className="text-sm font-bold">{scenario.returnAnalysis.multiple.toFixed(1)}x</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{scenario.description}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Y5 Revenue:</span>
                  <span className="ml-1 font-medium">
                    {(scenario.financialProjections.year5.revenue / 1000000).toFixed(1)}M
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Exit:</span>
                  <span className="ml-1 font-medium">
                    {(scenario.exitScenario.valuation / 1000000).toFixed(0)}M
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">IRR:</span>
                  <span className={cn(
                    "ml-1 font-medium",
                    scenario.returnAnalysis.irr >= 30 ? "text-green-600" :
                    scenario.returnAnalysis.irr >= 15 ? "text-blue-600" : "text-red-600"
                  )}>
                    {scenario.returnAnalysis.irr.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Break-even */}
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-sm font-medium mb-2">Break-even Analysis</p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Mois:</span>
              <span className="ml-1 font-medium">{data.breakEvenAnalysis.monthsToBreakeven}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Croissance requise:</span>
              <span className="ml-1 font-medium">{data.breakEvenAnalysis.requiredGrowthRate}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Burn:</span>
              <span className="ml-1 font-medium">
                {(data.breakEvenAnalysis.burnUntilBreakeven / 1000000).toFixed(1)}M
              </span>
            </div>
          </div>
        </div>

        {/* Sensitivity Analysis */}
        {data.sensitivityAnalysis.length > 0 && (
          <ExpandableSection title="Analyse de sensibilite" count={data.sensitivityAnalysis.length}>
            <div className="space-y-2 mt-2">
              {data.sensitivityAnalysis.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 border rounded">
                  <span className="font-medium">{s.variable}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      s.impact === "high" ? "bg-red-100 text-red-800" :
                      s.impact === "medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    )}>
                      {s.impact}
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

// Devil's Advocate Card
const DevilsAdvocateCard = memo(function DevilsAdvocateCard({ data }: { data: DevilsAdvocateData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Devil&apos;s Advocate</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Scepticisme:</span>
            <SkepticismBadge score={data.overallSkepticism} />
          </div>
        </div>
        <CardDescription>Challenge de la these d&apos;investissement</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Concerns */}
        {data.topConcerns.length > 0 && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-1">
              <ShieldAlert className="h-4 w-4" /> Top Concerns
            </p>
            <ul className="space-y-1">
              {data.topConcerns.map((c, i) => (
                <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                  <span className="font-bold">{i + 1}.</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dealbreakers */}
        {data.dealbreakers.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm font-medium text-red-800 mb-2 flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Dealbreakers potentiels
            </p>
            <ul className="space-y-1">
              {data.dealbreakers.map((d, i) => (
                <li key={i} className="text-sm text-red-700">{d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Challenged Assumptions */}
        <ExpandableSection title="Hypotheses challengees" count={data.challengedAssumptions.length} defaultOpen>
          <div className="space-y-2 mt-2">
            {data.challengedAssumptions.slice(0, 5).map((a, i) => (
              <div key={i} className="p-2 border rounded">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{a.assumption}</p>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0 ml-2",
                    a.impact === "critical" ? "bg-red-100 text-red-800" :
                    a.impact === "high" ? "bg-orange-100 text-orange-800" :
                    a.impact === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800"
                  )}>
                    {a.impact}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.challenge}</p>
                {a.mitigation && (
                  <p className="text-xs text-green-600 mt-1">Mitigation: {a.mitigation}</p>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Blind Spots */}
        <ExpandableSection title="Blind Spots identifies" count={data.blindSpots.length}>
          <div className="space-y-2 mt-2">
            {data.blindSpots.map((b, i) => (
              <div key={i} className="p-2 border rounded">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Eye className="h-3 w-3 text-purple-500" /> {b.area}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{b.description}</p>
                <p className="text-xs text-blue-600 mt-1">Recommandation: {b.recommendation}</p>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Questions Requiring Answers */}
        {data.questionsRequiringAnswers.length > 0 && (
          <ExpandableSection title="Questions critiques" count={data.questionsRequiringAnswers.length}>
            <ul className="space-y-1 mt-2">
              {data.questionsRequiringAnswers.map((q, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  {q}
                </li>
              ))}
            </ul>
          </ExpandableSection>
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">Coherence</CardTitle>
          </div>
          <ScoreBadge score={data.consistencyScore} size="lg" />
        </div>
        <CardDescription>Detection des contradictions entre analyses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-sm">{data.summaryAssessment}</p>
        </div>

        {/* Contradictions */}
        {data.contradictions.length > 0 ? (
          <ExpandableSection title="Contradictions detectees" count={data.contradictions.length} defaultOpen>
            <div className="space-y-3 mt-2">
              {data.contradictions.map((c, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{c.topic}</span>
                    <Badge variant="outline" className={cn("text-xs", CONTRADICTION_SEVERITY_COLORS[c.severity])}>
                      {c.severity}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2 bg-red-50 rounded">
                      <span className="font-medium text-red-700">{c.claim1.agent}:</span>
                      <span className="text-red-600 ml-1">{c.claim1.statement}</span>
                    </div>
                    <div className="p-2 bg-blue-50 rounded">
                      <span className="font-medium text-blue-700">{c.claim2.agent}:</span>
                      <span className="text-blue-600 ml-1">{c.claim2.statement}</span>
                    </div>
                  </div>
                  {c.resolution && (
                    <p className="text-xs text-green-600 mt-2">Resolution: {c.resolution}</p>
                  )}
                  {c.needsVerification && (
                    <Badge variant="outline" className="mt-2 text-xs bg-yellow-100 text-yellow-800">
                      Verification requise
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        ) : (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-700">Aucune contradiction majeure detectee</span>
          </div>
        )}

        {/* Data Gaps */}
        {data.dataGaps.length > 0 && (
          <ExpandableSection title="Donnees manquantes" count={data.dataGaps.length}>
            <div className="space-y-2 mt-2">
              {data.dataGaps.map((g, i) => (
                <div key={i} className="flex items-start justify-between p-2 border rounded">
                  <div>
                    <p className="text-sm font-medium">{g.area}</p>
                    <p className="text-xs text-muted-foreground">{g.recommendation}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-xs shrink-0 ml-2",
                    g.importance === "high" ? "bg-red-100 text-red-800" :
                    g.importance === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-gray-100 text-gray-800"
                  )}>
                    {g.importance}
                  </Badge>
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
        <ExpandableSection title="Risques cles" count={data.keyRisks.length} defaultOpen>
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

// Main Tier 2 Results Component
export function Tier2Results({ results }: Tier2ResultsProps) {
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

  const successfulAgents = useMemo(() => {
    return Object.values(results).filter(r => r.success).length;
  }, [results]);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Synthese Tier 2</CardTitle>
            {scorerData && <ScoreBadge score={scorerData.overallScore} size="lg" />}
          </div>
          <CardDescription>
            {successfulAgents} agents de synthese executes
          </CardDescription>
        </CardHeader>
        {scorerData && (
          <CardContent>
            <div className="flex items-center gap-4">
              <VerdictBadge verdict={scorerData.verdict} />
              <RecommendationBadge action={scorerData.investmentRecommendation.action} />
              <span className="text-sm text-muted-foreground">
                Confiance: {scorerData.confidence}%
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabbed Results */}
      <Tabs defaultValue="synthesis" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="synthesis">Score & Scenarios</TabsTrigger>
          <TabsTrigger value="challenge">Challenge</TabsTrigger>
          <TabsTrigger value="memo">Memo</TabsTrigger>
        </TabsList>

        <TabsContent value="synthesis" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {scorerData && <SynthesisScorerCard data={scorerData} />}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {scenarioData && <ScenarioModelerCard data={scenarioData} />}
            {contradictionData && <ContradictionDetectorCard data={contradictionData} />}
          </div>
        </TabsContent>

        <TabsContent value="challenge" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-1">
            {devilsData && <DevilsAdvocateCard data={devilsData} />}
          </div>
        </TabsContent>

        <TabsContent value="memo" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-1">
            {memoData && <MemoGeneratorCard data={memoData} />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
