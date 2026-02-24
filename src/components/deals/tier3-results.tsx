"use client";

import { useMemo, useCallback, memo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { VERDICT_CONFIG, getSeverityStyle } from "@/lib/ui-configs";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExpandableSection } from "@/components/shared/expandable-section";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Minus,
  Scale,
  Brain,
  FileText,
  Target,
  ShieldAlert,
  Eye,
  Zap,
} from "lucide-react";
import type {
  ContradictionDetectorData,
  SynthesisDealScorerData,
  DevilsAdvocateData,
  MemoGeneratorData,
  DetectedContradiction,
  DataGap,
} from "@/agents/types";
import { ProTeaserInline, ProTeaserSection } from "@/components/shared/pro-teaser";
import { getDisplayLimits, type SubscriptionPlan } from "@/lib/analysis-constants";
import { devilsAdvocateAlertKey } from "@/services/alert-resolution/alert-keys";
import { ResolutionBadge } from "./resolution-badge";
import { ResolutionDialog } from "./resolution-dialog";
import { AdjustedScoreBadge } from "./adjusted-score-badge";
import type { AlertResolution, CreateResolutionInput } from "@/hooks/use-resolutions";

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
  resolutionMap?: Record<string, import("@/hooks/use-resolutions").AlertResolution>;
  resolutions?: import("@/hooks/use-resolutions").AlertResolution[];
  onResolve?: (input: import("@/hooks/use-resolutions").CreateResolutionInput) => Promise<unknown>;
  onUnresolve?: (alertKey: string) => Promise<unknown>;
  isResolving?: boolean;
}

const VerdictBadge = memo(function VerdictBadge({ verdict }: { verdict: string }) {
  const c = VERDICT_CONFIG[verdict] ?? { label: verdict, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-sm px-3 py-1", c.color)}>{c.label}</Badge>;
});

// Hoisted config (without icons - they'll be resolved at render)
const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string }> = {
  invest: { label: "Signaux favorables", color: "bg-green-500 text-white" },
  pass: { label: "Signaux d'alerte dominants", color: "bg-red-500 text-white" },
  wait: { label: "Investigation complémentaire", color: "bg-yellow-500 text-white" },
  negotiate: { label: "Signaux contrastés", color: "bg-blue-500 text-white" },
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
    <Badge className={cn("text-sm px-3 py-1.5 flex items-center gap-1.5 shrink-0", c.color)}>
      {icon}
      {c.label}
    </Badge>
  );
});

// Synthesis Deal Scorer Card - Main scoring synthesis (includes DA kill reasons)
const SynthesisScorerCard = memo(function SynthesisScorerCard({
  data,
  devilsData,
  strengthsLimit = Infinity,
  weaknessesLimit = Infinity,
  showFullScore = true,
  hideCriticalRisks = false,
  resolutions,
  resolutionMap,
  onResolve,
  onUnresolve,
  isResolving = false,
}: {
  data: SynthesisDealScorerData;
  devilsData?: DevilsAdvocateData | null;
  strengthsLimit?: number;
  weaknessesLimit?: number;
  showFullScore?: boolean;
  hideCriticalRisks?: boolean;
  resolutions?: AlertResolution[];
  resolutionMap?: Record<string, AlertResolution>;
  onResolve?: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve?: (alertKey: string) => Promise<unknown>;
  isResolving?: boolean;
}) {
  const visibleStrengths = useMemo(() => data.keyStrengths.slice(0, strengthsLimit), [data.keyStrengths, strengthsLimit]);
  const hiddenStrengthsCount = Math.max(0, data.keyStrengths.length - strengthsLimit);
  const visibleWeaknesses = useMemo(() => data.keyWeaknesses.slice(0, weaknessesLimit), [data.keyWeaknesses, weaknessesLimit]);
  const hiddenWeaknessesCount = Math.max(0, data.keyWeaknesses.length - weaknessesLimit);

  // DA data merged into Scorer
  const absoluteKillReasons = useMemo(() => (devilsData?.findings?.killReasons ?? []).filter(kr => kr.dealBreakerLevel === "ABSOLUTE"), [devilsData]);
  const conditionalKillReasons = useMemo(() => (devilsData?.findings?.killReasons ?? []).filter(kr => kr.dealBreakerLevel === "CONDITIONAL"), [devilsData]);
  const allConcerns = useMemo(() => [
    ...(devilsData?.findings?.concernsSummary?.absolute ?? []).map(c => ({ text: c, level: "absolute" as const })),
    ...(devilsData?.findings?.concernsSummary?.conditional ?? []).map(c => ({ text: c, level: "conditional" as const })),
    ...(devilsData?.findings?.concernsSummary?.serious ?? []).map(c => ({ text: c, level: "serious" as const })),
  ], [devilsData]);
  const skepticismScore = devilsData?.findings?.skepticismAssessment?.score ?? 0;

  const [daDialogState, setDaDialogState] = useState<{
    alertKey: string; title: string; severity: string; description?: string;
  } | null>(null);

  const handleDAResolve = useCallback(async (
    alertKey: string, title: string, severity: string, status: "RESOLVED" | "ACCEPTED", justification: string,
  ) => {
    if (!onResolve) return;
    await onResolve({ alertKey, alertType: "DEVILS_ADVOCATE", status, justification, alertTitle: title, alertSeverity: severity });
  }, [onResolve]);

  return (
    <>
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
            {resolutions && resolutions.length > 0 && (
              <AdjustedScoreBadge originalScore={data.overallScore} resolutions={resolutions} />
            )}
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
              Analyse automatisée à titre informatif uniquement. Ne constitue pas un conseil en investissement.
            </p>
          </div>
          <RecommendationBadge action={data.investmentRecommendation.action} />
        </div>

        {/* Dimension Scores - Only for PRO */}
        {showFullScore ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Scores par dimension</p>
            <div className="grid gap-2">
              {data.dimensionScores.map((dim) => (
                <div key={dim.dimension} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{dim.dimension}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          dim.score >= 80 ? "bg-green-500" :
                          dim.score >= 60 ? "bg-blue-500" :
                          dim.score >= 40 ? "bg-yellow-500" : "bg-red-500"
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <p className="text-xs text-muted-foreground">Deals Comparés</p>
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

        {/* DA Skepticism — merged from Devil's Advocate */}
        {devilsData && skepticismScore > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                Niveau de scepticisme
              </p>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full",
                      skepticismScore <= 30 ? "bg-green-500" :
                      skepticismScore <= 50 ? "bg-yellow-500" :
                      skepticismScore <= 70 ? "bg-orange-500" : "bg-red-500"
                    )}
                    style={{ width: `${skepticismScore}%` }}
                  />
                </div>
                <span className={cn(
                  "text-sm font-bold",
                  skepticismScore <= 30 ? "text-green-700" :
                  skepticismScore <= 50 ? "text-yellow-700" :
                  skepticismScore <= 70 ? "text-orange-700" : "text-red-700"
                )}>
                  {skepticismScore}/100
                </span>
              </div>
            </div>
          </div>
        )}

        {/* DA Absolute Kill Reasons — merged from Devil's Advocate */}
        {absoluteKillReasons.length > 0 && (
          <div className="pt-3 border-t">
            <div className="p-4 rounded-lg bg-gradient-to-r from-red-500 to-rose-600 text-white">
              <p className="font-bold mb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Risques critiques ({absoluteKillReasons.length})
              </p>
              <ul className="space-y-3">
                {absoluteKillReasons.map((kr) => {
                  const key = devilsAdvocateAlertKey("killReason", kr.reason);
                  const resolution = resolutionMap?.[key];
                  return (
                    <li key={key} className={cn("p-3 rounded backdrop-blur", resolution ? "bg-white/5 opacity-60" : "bg-white/10")}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("font-medium", resolution && "line-through")}>{kr.reason}</span>
                        {resolution ? (
                          <ResolutionBadge
                            status={resolution.status as "RESOLVED" | "ACCEPTED"}
                            justification={resolution.justification}
                            onRevert={onUnresolve ? () => onUnresolve(key) : undefined}
                            compact
                          />
                        ) : onResolve ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1 border-red-300 text-red-100 hover:bg-red-800 hover:text-white shrink-0"
                            onClick={() => setDaDialogState({ alertKey: key, title: kr.reason, severity: "CRITICAL", description: kr.evidence })}
                          >
                            <CheckCircle className="h-3 w-3" />
                            Traiter
                          </Button>
                        ) : null}
                      </div>
                      {!resolution && kr.evidence && (
                        <p className="text-sm mt-1 text-red-100">
                          <span className="font-medium">Evidence:</span> {kr.evidence}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* DA Conditional Kill Reasons — merged from Devil's Advocate */}
        {conditionalKillReasons.length > 0 && (
          <div className="pt-3 border-t">
            <div className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200">
              <p className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Risques conditionnels ({conditionalKillReasons.length})
              </p>
              <ul className="space-y-3">
                {conditionalKillReasons.slice(0, 5).map((kr) => {
                  const key = devilsAdvocateAlertKey("killReason", kr.reason);
                  const resolution = resolutionMap?.[key];
                  return (
                    <li key={key} className={cn("p-3 bg-white/70 rounded border border-amber-100", resolution && "opacity-60")}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("font-medium text-amber-900", resolution && "line-through")}>{kr.reason}</span>
                        {resolution ? (
                          <ResolutionBadge
                            status={resolution.status as "RESOLVED" | "ACCEPTED"}
                            justification={resolution.justification}
                            onRevert={onUnresolve ? () => onUnresolve(key) : undefined}
                            compact
                          />
                        ) : onResolve ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1 shrink-0"
                            onClick={() => setDaDialogState({ alertKey: key, title: kr.reason, severity: "HIGH", description: kr.condition })}
                          >
                            <CheckCircle className="h-3 w-3" />
                            Traiter
                          </Button>
                        ) : null}
                      </div>
                      {!resolution && kr.condition && (
                        <div className="mt-2 p-2 bg-amber-100/50 rounded text-xs">
                          <span className="font-medium text-amber-800">Condition:</span>{" "}
                          <span className="text-amber-700">{kr.condition}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* DA Top Concerns — merged from Devil's Advocate */}
        {allConcerns.length > 0 && (
          <div className="pt-3 border-t">
            <ExpandableSection title="Points de vigilance" count={allConcerns.length}>
              <ul className="space-y-2 mt-2">
                {allConcerns.slice(0, 8).map((c) => {
                  const key = devilsAdvocateAlertKey("concern", c.text);
                  const resolution = resolutionMap?.[key];
                  return (
                    <li key={key} className={cn("p-2 bg-white/70 rounded border text-sm flex items-start gap-2", resolution && "opacity-60")}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0 mt-1.5",
                        c.level === "absolute" ? "bg-red-500" :
                        c.level === "conditional" ? "bg-orange-500" : "bg-yellow-500"
                      )} />
                      <span className={cn("flex-1 text-muted-foreground", resolution && "line-through")}>{c.text}</span>
                      {resolution ? (
                        <ResolutionBadge
                          status={resolution.status as "RESOLVED" | "ACCEPTED"}
                          justification={resolution.justification}
                          onRevert={onUnresolve ? () => onUnresolve(key) : undefined}
                          compact
                        />
                      ) : onResolve ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] gap-0.5 shrink-0"
                          onClick={() => setDaDialogState({
                            alertKey: key,
                            title: c.text,
                            severity: c.level === "absolute" ? "CRITICAL" : c.level === "conditional" ? "HIGH" : "MEDIUM",
                          })}
                        >
                          Traiter
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </ExpandableSection>
          </div>
        )}
      </CardContent>
    </Card>

    {/* DA Resolution Dialog */}
    {daDialogState && (
      <ResolutionDialog
        open={!!daDialogState}
        onOpenChange={(open) => { if (!open) setDaDialogState(null); }}
        alertTitle={daDialogState.title}
        alertSeverity={daDialogState.severity}
        alertDescription={daDialogState.description}
        onSubmit={(status, justification) =>
          handleDAResolve(daDialogState.alertKey, daDialogState.title, daDialogState.severity, status, justification)
        }
        isSubmitting={isResolving}
      />
    )}
    </>
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
          <CardTitle className="text-lg text-red-900">Signaux d&apos;alerte dominants</CardTitle>
        </div>
        <CardDescription>Risques majeurs identifiés sur ce deal</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Absolute Kill Reasons */}
        {absoluteKills.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Risques critiques ({absoluteKills.length})
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

// Contradiction Detector Card
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
            <CardTitle className="text-lg">Cohérence & Contradictions</CardTitle>
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
          Cross-validation de toutes les analyses - détection d&apos;incohérences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            consistencyScore >= 80 ? "bg-green-50 border-green-200" :
            consistencyScore >= 60 ? "bg-yellow-50 border-yellow-200" :
            "bg-red-50 border-red-200"
          )}>
            <div className="flex items-start gap-2">
              {consistencyScore >= 80 ? (
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              ) : consistencyScore >= 60 ? (
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
                  {contradictions.map((c: DetectedContradiction, idx: number) => (
                    <tr key={`${c.topic}-${idx}`} className={cn(
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
              <p className="text-sm text-green-700">Les analyses des 12 agents sont cohérentes entre elles.</p>
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

// Hoisted config for MemoGeneratorCard — distinct from RECOMMENDATION_CONFIG (which covers scorer actions)
const MEMO_RECOMMENDATION_CONFIG: Record<string, { label: string; color: string }> = {
  invest: { label: "Signaux favorables", color: "bg-green-500 text-white" },
  pass: { label: "Signaux d'alerte dominants", color: "bg-red-500 text-white" },
  more_dd_needed: { label: "Investigation complémentaire", color: "bg-yellow-500 text-white" },
};

// Parse red flag string: "[CRITICAL] Some text (agent-name)" → { severity, text, source }
function parseRedFlag(raw: string): { severity: string; text: string; source: string | null } {
  const match = raw.match(/^\[([A-Z]+)\]\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
  if (!match) return { severity: "MEDIUM", text: raw, source: null };
  return { severity: match[1], text: match[2].trim(), source: match[3]?.trim() ?? null };
}

// Parse next step string: "[PRIORITY] [OWNER] Text" → { priority, owner, text }
function parseNextStep(raw: string): { priority: string | null; owner: string | null; text: string } {
  const match = raw.match(/^(?:\[([A-Z_]+)\])?\s*(?:\[([A-Z_]+)\])?\s*(.+)$/);
  if (!match) return { priority: null, owner: null, text: raw };
  return { priority: match[1] ?? null, owner: match[2] ?? null, text: match[3].trim() };
}

// Priority badge config for next steps
const PRIORITY_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  IMMEDIATE: { label: "Immédiat", className: "bg-red-100 text-red-800 border-red-300" },
  BEFORE_TERM_SHEET: { label: "Avant term sheet", className: "bg-amber-100 text-amber-800 border-amber-300" },
  DURING_DD: { label: "Pendant DD", className: "bg-blue-100 text-blue-800 border-blue-300" },
};

// Owner badge config for next steps
const OWNER_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  INVESTOR: { label: "Investisseur", className: "border-slate-300 text-slate-700" },
  FOUNDER: { label: "Fondateur", className: "border-violet-300 text-violet-700" },
};

// Memo Generator Card
const MemoGeneratorCard = memo(function MemoGeneratorCard({ data }: { data: MemoGeneratorData }) {
  const rec = MEMO_RECOMMENDATION_CONFIG[data.executiveSummary.recommendation] ??
    { label: data.executiveSummary.recommendation, color: "bg-gray-500 text-white" };

  const parsedRedFlags = useMemo(
    () => data.dueDiligenceFindings.redFlags.map(parseRedFlag),
    [data.dueDiligenceFindings.redFlags],
  );

  const parsedNextSteps = useMemo(
    () => data.nextSteps.map(parseNextStep),
    [data.nextSteps],
  );

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg">Memo d&apos;investissement</CardTitle>
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
            <p className="text-sm font-medium">{`Probl\u00e8me`}</p>
            <p className="text-sm text-muted-foreground">{data.companyOverview.problem}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Solution</p>
            <p className="text-sm text-muted-foreground">{data.companyOverview.solution}</p>
          </div>
        </div>

        {/* Investment Highlights */}
        <ExpandableSection title="Points forts du deal" count={data.investmentHighlights.length} defaultOpen>
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
          <p className="text-sm font-medium mb-2">{`Th\u00e8se d'investissement`}</p>
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
            <p className="text-sm font-medium mb-2">{`Points de n\u00e9gociation`}</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.dealTerms.negotiationPoints.slice(0, 3).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Due Diligence Findings */}
        {(data.dueDiligenceFindings.outstanding.length > 0 || data.dueDiligenceFindings.redFlags.length > 0) && (
          <div className="space-y-4">
            {data.dueDiligenceFindings.outstanding.length > 0 && (
              <div>
                <p className="text-sm font-medium text-yellow-800 mb-2">{`DD \u00e0 compl\u00e9ter`}</p>
                <div className="space-y-2">
                  {data.dueDiligenceFindings.outstanding.map((o, i) => (
                    <div key={i} className="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                      <p className="text-sm text-yellow-800">{o}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.dueDiligenceFindings.redFlags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-800 mb-2">Red Flags</p>
                <div className="space-y-2">
                  {parsedRedFlags.map((rf, i) => {
                    const style = getSeverityStyle(rf.severity);
                    return (
                      <div key={i} className={cn("p-3 rounded-lg border flex items-start gap-3", style.bg, style.border)}>
                        <Badge variant="outline" className={cn("text-xs shrink-0 mt-0.5", style.badge)}>
                          {style.label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm", style.text)}>{rf.text}</p>
                          {rf.source && (
                            <p className="text-xs text-muted-foreground mt-1">Source : {rf.source}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Next Steps */}
        {data.nextSteps.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">{`Prochaines \u00e9tapes`}</p>
            <div className="space-y-2">
              {parsedNextSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {step.priority && PRIORITY_BADGE_CONFIG[step.priority] && (
                      <Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE_CONFIG[step.priority].className)}>
                        {PRIORITY_BADGE_CONFIG[step.priority].label}
                      </Badge>
                    )}
                    {step.owner && OWNER_BADGE_CONFIG[step.owner] && (
                      <Badge variant="outline" className={cn("text-xs", OWNER_BADGE_CONFIG[step.owner].className)}>
                        {OWNER_BADGE_CONFIG[step.owner].label}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{step.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Main Tier 3 Results Component - Synthesis Agents (3 cards: Verdict, Coherence, Memo)
export const Tier3Results = memo(function Tier3Results({ results, subscriptionPlan = "FREE", totalAgentsRun, resolutionMap, resolutions, onResolve, onUnresolve, isResolving }: Tier3ResultsProps) {
  const getAgentData = useCallback(<T,>(agentName: string): T | null => {
    const result = results[agentName];
    if (!result?.success || !result.data) return null;
    return result.data as T;
  }, [results]);

  const scorerData = getAgentData<SynthesisDealScorerData>("synthesis-deal-scorer");
  const devilsData = getAgentData<DevilsAdvocateData>("devils-advocate");
  const contradictionData = getAgentData<ContradictionDetectorData>("contradiction-detector");
  const memoData = getAgentData<MemoGeneratorData>("memo-generator");

  // Get display limits based on plan
  const displayLimits = useMemo(() => getDisplayLimits(subscriptionPlan), [subscriptionPlan]);
  const isFree = subscriptionPlan === "FREE";

  const successfulAgents = useMemo(() => {
    return Object.values(results).filter(r => r.success).length;
  }, [results]);

  // Header metrics (simplified — no scenario data)
  const headerMetrics = useMemo(() => {
    const daSkepticism = devilsData?.findings?.skepticismAssessment != null
      ? devilsData.findings.skepticismAssessment.score
      : undefined;
    const daIsFallback = devilsData?.findings?.skepticismAssessment?.isFallback ?? false;
    const derivedSkepticism = scorerData
      ? Math.max(0, Math.min(100, 100 - scorerData.overallScore))
      : null;
    const killReasons = devilsData?.findings?.killReasons?.filter(kr => kr.dealBreakerLevel === "ABSOLUTE")?.length ?? 0;
    const contradictions = contradictionData?.findings?.contradictions?.filter(c => c.severity === "CRITICAL" || c.severity === "HIGH")?.length ?? 0;

    return {
      skepticism: daSkepticism ?? derivedSkepticism ?? 0,
      skepticismSource: daSkepticism != null
        ? (daIsFallback ? "da-derived" as const : "da" as const)
        : derivedSkepticism != null ? "derived" as const : "none" as const,
      killReasons,
      contradictions,
    };
  }, [devilsData, contradictionData, scorerData]);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <CardHeader className="pb-3 relative">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                <Target className="h-7 w-7 text-primary" />
                Synthèse Due Diligence
              </CardTitle>
              <CardDescription className="text-slate-300 mt-1">
                {totalAgentsRun ?? successfulAgents} agents d&apos;analyse • Score, Risques, Memo
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Skepticism Score */}
            <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
              <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Scepticisme</div>
              {headerMetrics.skepticismSource === "none" ? (
                <>
                  <div className="text-3xl font-bold text-slate-500">—</div>
                  <div className="text-xs text-slate-500 mt-1">Donnees indisponibles</div>
                </>
              ) : (
                <>
                  <div className={cn(
                    "text-3xl font-bold",
                    headerMetrics.skepticism <= 30 ? "text-green-400" :
                    headerMetrics.skepticism <= 50 ? "text-yellow-400" :
                    headerMetrics.skepticism <= 70 ? "text-orange-400" : "text-red-400"
                  )}>
                    {headerMetrics.skepticism}/100
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {headerMetrics.skepticismSource === "da" ? "Devil's Advocate" :
                     headerMetrics.skepticismSource === "da-derived" ? "Devil's Advocate (estime)" :
                     "Estime depuis le score"}
                  </div>
                </>
              )}
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
                {headerMetrics.killReasons > 0 ? "Risques critiques" : headerMetrics.contradictions > 0 ? "Contradictions" : "Pas de blocage"}
              </div>
            </div>

            {/* Data Reliability */}
            {scorerData && (
              <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
                <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Fiabilité données</div>
                <div className="text-3xl font-bold text-white">{scorerData.confidence}%</div>
                <div className="text-xs text-slate-400 mt-1">Completude des sources</div>
              </div>
            )}
          </div>

          {/* Recommendation Banner */}
          {scorerData && (
            <div className="flex items-center justify-between bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-4">
                <RecommendationBadge action={scorerData.investmentRecommendation.action} />
                <p className="text-sm text-slate-200 max-w-xl">{scorerData.investmentRecommendation.rationale}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3 Tabs: Verdict | Cohérence | Memo */}
      <Tabs defaultValue="verdict" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="verdict">Verdict</TabsTrigger>
          <TabsTrigger value="coherence">Cohérence</TabsTrigger>
          <TabsTrigger value="memo">Mémo</TabsTrigger>
        </TabsList>

        {/* Tab 1: Verdict — Scorer (with DA merged) + NoGo if applicable */}
        <TabsContent value="verdict" className="space-y-4 mt-4">
          {(() => {
            const showNoGo = !isFree && scorerData && (scorerData.overallScore ?? 100) < 35;
            return (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {scorerData && (
                    <SynthesisScorerCard
                      data={scorerData}
                      devilsData={devilsData}
                      strengthsLimit={displayLimits.strengths}
                      weaknessesLimit={displayLimits.weaknesses}
                      showFullScore={displayLimits.score}
                      hideCriticalRisks={!!showNoGo}
                      resolutions={resolutions}
                      resolutionMap={resolutionMap}
                      onResolve={onResolve}
                      onUnresolve={onUnresolve}
                      isResolving={isResolving}
                    />
                  )}
                </div>
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
        </TabsContent>

        {/* Tab 2: Coherence — Contradictions */}
        <TabsContent value="coherence" className="space-y-4 mt-4">
          {isFree ? (
            <ProTeaserSection
              title="Contradictions détectées"
              description={contradictionData
                ? `${contradictionData.findings?.contradictions?.length ?? 0} contradiction(s) identifiée(s) entre les analyses`
                : "Détection automatique des incohérences"}
              icon={Zap}
              previewText={contradictionData ? `Score coherence: ${contradictionData.findings?.consistencyAnalysis?.overallScore ?? contradictionData.score?.value ?? 0}/100` : undefined}
            />
          ) : (
            contradictionData && <ContradictionDetectorCard data={contradictionData} />
          )}
        </TabsContent>

        {/* Tab 3: Memo */}
        <TabsContent value="memo" className="space-y-4 mt-4">
          {isFree ? (
            <ProTeaserSection
              title="Memo d'investissement"
              description="Memo d'investissement complet et exportable en PDF"
              icon={FileText}
              previewText={memoData ? memoData.executiveSummary.oneLiner : undefined}
            />
          ) : (
            memoData && <MemoGeneratorCard data={memoData} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
});
