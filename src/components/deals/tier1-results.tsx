"use client";

import { useMemo, useCallback, useState, memo } from "react";
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
import { formatAgentName } from "@/lib/format-utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExpandableSection } from "@/components/shared/expandable-section";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DollarSign,
  Users,
  Target,
  FileSearch,
  Globe,
  Code,
  Scale,
  PieChart,
  Rocket,
  UserCheck,
  TrendingUp,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
  X,
  Server,
  Shield,
} from "lucide-react";
import type {
  FinancialAuditData,
  TeamInvestigatorData,
  CompetitiveIntelData,
  DeckForensicsData,
  MarketIntelData,
  TechStackDDData,
  TechOpsDDData,
  LegalRegulatoryData,
  CapTableAuditData,
  GTMAnalystData,
  CustomerIntelData,
  ExitStrategistData,
  QuestionMasterData,
} from "@/agents/types";
import type { ReasoningTrace } from "@/agents/react/types";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { ReActTraceViewer } from "./react-trace-viewer";
import { ProTeaserInline, ProTeaserSection } from "@/components/shared/pro-teaser";
import { getDisplayLimits, type SubscriptionPlan } from "@/lib/analysis-constants";
import { BarChart3, FileText, Lightbulb } from "lucide-react";

interface ReActMetadata {
  reasoningTrace: ReasoningTrace;
  findings: ScoredFinding[];
  confidence: ConfidenceScore;
  expectedVariance?: number;
}

interface AgentResultWithReAct {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
  _react?: ReActMetadata;
}

interface Tier1ResultsProps {
  results: Record<string, AgentResultWithReAct>;
  subscriptionPlan?: SubscriptionPlan;
}

// ReAct Badge Component - Shows when agent has ReAct metadata
const ReActIndicator = memo(function ReActIndicator({
  reactData,
  onShowTrace
}: {
  reactData: ReActMetadata;
  onShowTrace: () => void;
}) {
  const confidenceColor = useMemo(() => {
    const level = reactData.confidence.level;
    if (level === "high") return "bg-green-100 text-green-800 border-green-300";
    if (level === "medium") return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-red-100 text-red-800 border-red-300";
  }, [reactData.confidence.level]);

  const benchmarkedFindings = useMemo(
    () => reactData.findings.filter(f => f.benchmarkData).length,
    [reactData.findings]
  );

  return (
    <button
      onClick={onShowTrace}
      className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
    >
      <Brain className="h-4 w-4 text-primary" />
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className={cn("text-xs", confidenceColor)}>
          {reactData.confidence.score}%
        </Badge>
        {benchmarkedFindings > 0 && (
          <span className="text-xs text-muted-foreground">
            {benchmarkedFindings} benchmarks
          </span>
        )}
      </div>
    </button>
  );
});

// Slide-over panel for ReAct trace
const ReActTracePanel = memo(function ReActTracePanel({
  agentName,
  reactData,
  onClose
}: {
  agentName: string;
  reactData: ReActMetadata;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-background shadow-xl overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Trace ReAct - {formatAgentName(agentName)}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-64px)] p-4">
          <ReActTraceViewer
            agentName={agentName}
            data={reactData}
            defaultExpanded={true}
          />
        </div>
      </div>
    </div>
  );
});


// Format number with K/M suffix
function formatAmount(value: number | undefined | null): string {
  if (value == null) return "N/A";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K€`;
  return `${value.toFixed(0)}€`;
}

// Financial Auditor Card - Rich display
const FinancialAuditCard = memo(function FinancialAuditCard({
  data,
  reactData,
  onShowTrace
}: {
  data: FinancialAuditData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  // Separate metrics by status (using new structure: data.findings.metrics)
  const availableMetrics = data.findings?.metrics?.filter((m: { status: string }) => m.status === "available") ?? [];
  const criticalFlags = data.redFlags?.filter((f: { severity: string }) => f.severity === "CRITICAL") ?? [];
  const otherFlags = data.redFlags?.filter((f: { severity: string }) => f.severity !== "CRITICAL") ?? [];

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Audit Financier</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-xs",
              data.meta?.dataCompleteness === "complete" ? "bg-green-100 text-green-800" :
              data.meta?.dataCompleteness === "partial" ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            )}>
              {data.meta?.dataCompleteness === "complete" ? "Données complètes" :
               data.meta?.dataCompleteness === "partial" ? "Données partielles" :
               "Données minimales"}
            </Badge>
            <ScoreBadge score={data.score?.value ?? 0} size="lg" />
          </div>
        </div>
        {/* Summary */}
        <p className="text-sm text-muted-foreground mt-2">{data.narrative?.summary}</p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Alert Signal */}
        {data.alertSignal && (
          <div className={cn(
            "p-3 rounded-lg border",
            data.alertSignal.recommendation === "STOP" ? "bg-red-50 border-red-200" :
            data.alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-50 border-orange-200" :
            data.alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          )}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                data.alertSignal.recommendation === "STOP" ? "bg-red-100 text-red-800" :
                data.alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-100 text-orange-800" :
                data.alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-100 text-yellow-800" :
                "bg-green-100 text-green-800"
              )}>
                {data.alertSignal.recommendation?.replace(/_/g, " ")}
              </Badge>
              <span className="text-sm">{data.alertSignal.justification}</span>
            </div>
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableMetrics.slice(0, 4).map((m: { metric: string; reportedValue?: number; percentile?: number }, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground truncate">{m.metric}</div>
              <div className="text-lg font-bold mt-1">
                {typeof m.reportedValue === "number"
                  ? formatAmount(m.reportedValue)
                  : m.reportedValue ?? "N/A"}
              </div>
              {m.percentile != null && (
                <div className="text-xs text-muted-foreground">P{m.percentile}</div>
              )}
            </div>
          ))}
        </div>

        {/* Burn & Runway */}
        {(data.findings?.burn?.monthlyBurn || data.findings?.burn?.runway) && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Burn & Runway</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                data.findings.burn.efficiency === "EFFICIENT" ? "bg-green-100 text-green-800" :
                data.findings.burn.efficiency === "MODERATE" ? "bg-yellow-100 text-yellow-800" :
                data.findings.burn.efficiency === "INEFFICIENT" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              )}>
                {data.findings.burn.efficiency}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Burn mensuel</div>
                <div className="font-semibold">{formatAmount(data.findings.burn.monthlyBurn)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Runway</div>
                <div className="font-semibold">
                  {data.findings.burn.runway ? `${data.findings.burn.runway} mois` : "N/A"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Burn Multiple</div>
                <div className="font-semibold">
                  {data.findings.burn.burnMultiple?.toFixed(2) ?? "N/A"}
                </div>
              </div>
            </div>
            {data.findings.burn.assessment && (
              <p className="text-xs text-muted-foreground mt-2">{data.findings.burn.assessment}</p>
            )}
          </div>
        )}

        {/* Valuation */}
        {data.findings?.valuation && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Valorisation</span>
              <StatusBadge
                status={data.findings.valuation.verdict?.replace(/_/g, " ") ?? "N/A"}
                variant={
                  data.findings.valuation.verdict === "FAIR" || data.findings.valuation.verdict === "UNDERVALUED" ? "success" :
                  data.findings.valuation.verdict === "AGGRESSIVE" ? "warning" :
                  data.findings.valuation.verdict === "VERY_AGGRESSIVE" ? "danger" : "info"
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Valo demandée:</span>{" "}
                <span className="font-medium">{formatAmount(data.findings.valuation.requested)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Multiple implicite:</span>{" "}
                <span className="font-medium">
                  {data.findings.valuation.impliedMultiple?.toFixed(1) ?? "N/A"}x
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  (bench: {data.findings.valuation.benchmarkMultiple}x)
                </span>
              </div>
            </div>
            {data.findings.valuation.comparables?.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                Comparables: {data.findings.valuation.comparables.slice(0, 2).map((c: { name: string; multiple: number }) => `${c.name} (${c.multiple}x)`).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Projections Analysis */}
        {data.findings?.projections && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Projections</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                data.findings.projections.realistic ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              )}>
                {data.findings.projections.realistic ? "Réalistes" : "Questionnables"}
              </Badge>
            </div>
            {data.findings.projections.assumptions?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Hypothèses:</span>{" "}
                {data.findings.projections.assumptions.slice(0, 2).join(", ")}
              </div>
            )}
            {data.findings.projections.concerns?.length > 0 && (
              <div className="text-xs text-orange-600 mt-1">
                ⚠️ {data.findings.projections.concerns.slice(0, 2).join(" | ")}
              </div>
            )}
          </div>
        )}

        {/* Detailed Metrics */}
        <ExpandableSection title={`Détail des métriques (${data.findings?.metrics?.length ?? 0})`}>
          <div className="space-y-3 mt-2">
            {data.findings?.metrics?.map((m: { metric: string; status: string; reportedValue?: number; assessment?: string; calculation?: string }, i: number) => (
              <div key={i} className="p-2 rounded border bg-card">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{m.metric}</span>
                  <div className="flex items-center gap-2">
                    {m.reportedValue != null && (
                      <span className="text-sm font-semibold">
                        {typeof m.reportedValue === "number" ? formatAmount(m.reportedValue) : m.reportedValue}
                      </span>
                    )}
                    <StatusBadge
                      status={m.status}
                      variant={
                        m.status === "available" ? "success" :
                        m.status === "suspicious" ? "danger" : "warning"
                      }
                    />
                  </div>
                </div>
                {m.calculation && (
                  <p className="text-xs text-blue-600 mt-1">📊 {m.calculation}</p>
                )}
                {m.assessment && (
                  <p className="text-xs text-muted-foreground mt-1">{m.assessment}</p>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Red Flags - Critical first */}
        {data.redFlags?.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-sm font-medium text-red-600 mb-2">
              Red Flags ({data.redFlags.length})
            </p>
            <div className="space-y-2">
              {criticalFlags.map((flag: { title: string; evidence: string; question: string; impact: string }, i: number) => (
                <div key={`critical-${i}`} className="p-2 rounded bg-red-50 border border-red-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-red-800">{flag.title}</span>
                      <Badge variant="outline" className="ml-2 text-xs bg-red-100 text-red-800">CRITIQUE</Badge>
                      <p className="text-xs text-red-700 mt-1">{flag.evidence}</p>
                      {flag.question && (
                        <p className="text-xs text-red-600 mt-1">❓ {flag.question}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {otherFlags.map((flag: { severity: string; title: string; evidence: string }, i: number) => (
                <div key={`other-${i}`} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className={cn(
                    "h-4 w-4 shrink-0 mt-0.5",
                    flag.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                  )} />
                  <div>
                    <span className="font-medium">{flag.title}</span>
                    <span className="text-muted-foreground ml-1">- {flag.evidence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions for Founder */}
        {data.questions?.length > 0 && (
          <ExpandableSection title={`Questions à poser (${data.questions.length})`}>
            <div className="space-y-2 mt-2">
              {data.questions.map((q: { priority: string; question: string; context: string; whatToLookFor: string }, i: number) => (
                <div key={i} className="p-2 rounded border bg-card">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      q.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                      q.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {q.priority}
                    </Badge>
                    <p className="text-sm font-medium">{q.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{q.context}</p>
                  {q.whatToLookFor && (
                    <p className="text-xs text-orange-600 mt-1">👀 À surveiller: {q.whatToLookFor}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights & Negotiation */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
          <div>
            <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.narrative?.keyInsights?.slice(0, 3).map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-blue-500">•</span> {r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-green-600 mb-1">Pour négocier</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.narrative?.forNegotiation?.slice(0, 3).map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-green-500">•</span> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// Team Investigator Card - Updated for v2.0 structure
const TeamInvestigatorCard = memo(function TeamInvestigatorCard({
  data,
  reactData,
  onShowTrace
}: {
  data: TeamInvestigatorData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const founderProfiles = data.findings?.founderProfiles ?? [];
  const teamComposition = data.findings?.teamComposition;
  const gaps = teamComposition?.gaps ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Team Investigation</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Background check et complémentarité</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Team Composition */}
        {teamComposition && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-lg font-bold">{teamComposition.technicalStrength}</div>
              <div className="text-xs text-muted-foreground">Tech</div>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-lg font-bold">{teamComposition.businessStrength}</div>
              <div className="text-xs text-muted-foreground">Business</div>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-lg font-bold">{teamComposition.complementarityScore}</div>
              <div className="text-xs text-muted-foreground">Complémentarité</div>
            </div>
          </div>
        )}

        {/* Founder Profiles */}
        <ExpandableSection title={`Fondateurs (${founderProfiles.length})`} defaultOpen>
          <div className="space-y-3 mt-2">
            {founderProfiles.map((f, i) => (
              <div key={i} className="p-2 border rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{f.name}</span>
                  <Badge variant="outline">{f.role}</Badge>
                </div>
                <div className="flex gap-2 text-xs">
                  <span>Domain: {f.scores?.domainExpertise ?? 0}/100</span>
                  <span>Startup XP: {f.scores?.entrepreneurialExperience ?? 0}/100</span>
                </div>
                {f.linkedinVerified && (
                  <div className="text-xs text-green-600 mt-1">✓ LinkedIn vérifié</div>
                )}
                {f.redFlags && f.redFlags.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">
                    {f.redFlags.map((rf, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {rf.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Gaps identifiés</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {gaps.map((g, i) => <li key={i}>{g.gap}</li>)}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                      {rf.question && (
                        <p className="text-xs text-blue-600 mt-1">❓ {rf.question}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Competitive Intel Card - Updated for v2.0 structure
const CompetitiveIntelCard = memo(function CompetitiveIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: CompetitiveIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const competitors = data.findings?.competitors ?? [];
  const moatAnalysis = data.findings?.moatAnalysis;
  const marketStructure = data.findings?.marketStructure;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Competitive Intel</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Paysage concurrentiel et moat</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Moat Assessment */}
        {moatAnalysis && (
          <div className="p-3 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Moat</span>
              <Badge variant="outline">{moatAnalysis.primaryMoatType?.replace(/_/g, " ")}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-purple-500"
                  style={{ width: `${moatAnalysis.overallMoatStrength ?? 0}%` }}
                />
              </div>
              <span className="text-sm font-medium">{moatAnalysis.overallMoatStrength ?? 0}/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{moatAnalysis.moatJustification}</p>
            <Badge variant="outline" className={cn(
              "mt-2 text-xs",
              moatAnalysis.moatVerdict === "STRONG_MOAT" ? "bg-green-100 text-green-800" :
              moatAnalysis.moatVerdict === "EMERGING_MOAT" ? "bg-blue-100 text-blue-800" :
              moatAnalysis.moatVerdict === "WEAK_MOAT" ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            )}>
              {moatAnalysis.moatVerdict?.replace(/_/g, " ")}
            </Badge>
          </div>
        )}

        {/* Market Concentration */}
        {marketStructure && (
          <div className="flex items-center justify-between text-sm">
            <span>Concentration du marche</span>
            <StatusBadge
              status={marketStructure.concentration}
              variant={
                marketStructure.concentration === "fragmented" ? "success" :
                marketStructure.concentration === "monopolistic" ? "danger" : "info"
              }
            />
          </div>
        )}

        {/* Competitors */}
        <ExpandableSection title={`Concurrents (${competitors.length})`}>
          <div className="space-y-2 mt-2">
            {competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <span className="font-medium text-sm">{c.name}</span>
                  <p className="text-xs text-muted-foreground">{c.positioning}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline" className="text-xs">{c.overlap}</Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      c.threatLevel === "CRITICAL" || c.threatLevel === "HIGH" ? "bg-red-100 text-red-800" :
                      c.threatLevel === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    )}
                  >
                    {c.threatLevel}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Deck Forensics Card - Updated for v2.0 structure
const DeckForensicsCard = memo(function DeckForensicsCard({
  data,
  reactData,
  onShowTrace
}: {
  data: DeckForensicsData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-indigo-600" />
          <CardTitle className="text-lg">Deck Forensics</CardTitle>
          {reactData && onShowTrace && (
            <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
          )}
        </div>
        <CardDescription>Analyse narrative et vérification claims</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Assessment */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Crédibilité</span>
            <ScoreBadge score={data.score?.value ?? 0} />
          </div>
          <p className="text-sm text-muted-foreground">{data.narrative?.summary}</p>
        </div>

        {/* Narrative Analysis */}
        {data.findings?.narrativeAnalysis && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-lg font-bold">{data.findings.narrativeAnalysis.storyCoherence}</div>
              <div className="text-xs text-muted-foreground">Cohérence</div>
            </div>
            {data.findings.deckQuality && (
              <>
                <div className="p-2 rounded-lg bg-muted">
                  <div className="text-lg font-bold">{data.findings.deckQuality.professionalismScore}</div>
                  <div className="text-xs text-muted-foreground">Professionnalisme</div>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <div className="text-lg font-bold">{data.findings.deckQuality.transparencyScore}</div>
                  <div className="text-xs text-muted-foreground">Transparence</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Claim Verification */}
        {data.findings?.claimVerification && (
          <ExpandableSection title={`Vérification des claims (${data.findings.claimVerification.length})`}>
            <div className="space-y-2 mt-2">
              {data.findings.claimVerification.map((c: { claim: string; status: string; investorImplication: string; location: string }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-start justify-between">
                    <span className="text-sm flex-1">{c.claim}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-2 shrink-0",
                        c.status === "VERIFIED" ? "bg-green-100 text-green-800" :
                        c.status === "CONTRADICTED" ? "bg-red-100 text-red-800" :
                        c.status === "EXAGGERATED" || c.status === "MISLEADING" ? "bg-orange-100 text-orange-800" :
                        "bg-gray-100 text-gray-800"
                      )}
                    >
                      {c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.investorImplication}</p>
                  <p className="text-xs text-blue-600 mt-1">📍 {c.location}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Inconsistencies */}
        {data.findings?.inconsistencies && data.findings.inconsistencies.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Incohérences</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {data.findings.inconsistencies.map((inc: { issue: string; severity: string; location1: string; location2: string }, i: number) => (
                <li key={i} className="p-2 rounded border">
                  <span className={cn(
                    "font-medium",
                    inc.severity === "CRITICAL" ? "text-red-600" : inc.severity === "MAJOR" ? "text-orange-600" : "text-yellow-600"
                  )}>
                    [{inc.severity}]
                  </span>{" "}
                  {inc.issue}
                  <p className="text-xs mt-1">📍 {inc.location1} vs {inc.location2}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf: { severity: string; title: string; evidence: string; question: string }, i: number) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                      {rf.question && (
                        <p className="text-xs text-blue-600 mt-1">❓ {rf.question}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}

        {/* Key Insights */}
        {data.narrative?.keyInsights && data.narrative.keyInsights.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-blue-500">•</span> {insight}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Market Intelligence Card (v2.0 - Refonte)
const MarketIntelCard = memo(function MarketIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: MarketIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const { findings, score, narrative, redFlags } = data;
  const timingAssessmentColors: Record<string, string> = {
    EXCELLENT: "text-green-600",
    GOOD: "text-blue-600",
    NEUTRAL: "text-gray-600",
    POOR: "text-orange-600",
    TERRIBLE: "text-red-600",
  };
  const trendColors: Record<string, string> = {
    HEATING: "bg-green-100 text-green-800",
    STABLE: "bg-blue-100 text-blue-800",
    COOLING: "bg-orange-100 text-orange-800",
    FROZEN: "bg-red-100 text-red-800",
  };
  const discrepancyVariants: Record<string, "success" | "info" | "warning" | "danger"> = {
    NONE: "success",
    MINOR: "info",
    SIGNIFICANT: "warning",
    MAJOR: "danger",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-cyan-600" />
            <CardTitle className="text-lg">Market Intelligence</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={score.value} size="lg" />
        </div>
        <CardDescription>Validation TAM / SAM / SOM et timing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Market Size Validation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Validation marche</span>
            <StatusBadge
              status={findings.marketSize.discrepancyLevel}
              variant={discrepancyVariants[findings.marketSize.discrepancyLevel] || "warning"}
            />
          </div>
          <p className="text-xs text-muted-foreground">{findings.marketSize.overallAssessment}</p>
        </div>

        {/* Timing Analysis */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Maturite :</span>{" "}
              <span className="font-medium capitalize">{findings.timing.marketMaturity}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Timing :</span>{" "}
              <span className={cn("font-medium", timingAssessmentColors[findings.timing.assessment] || "text-gray-600")}>
                {findings.timing.assessment}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{findings.timing.windowRemaining}</p>
        </div>

        {/* Funding Trends */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Tendance Funding {findings.fundingTrends.sectorName}</span>
            <Badge variant="outline" className={trendColors[findings.fundingTrends.trend] || "bg-gray-100"}>
              {findings.fundingTrends.trend}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{findings.fundingTrends.trendAnalysis}</p>
          {findings.fundingTrends.totalFunding.value > 0 && (
            <div className="text-xs grid grid-cols-2 gap-2 mt-1">
              <span>Funding: {(findings.fundingTrends.totalFunding.value / 1000000).toFixed(0)}M ({findings.fundingTrends.totalFunding.yoyChange > 0 ? "+" : ""}{findings.fundingTrends.totalFunding.yoyChange}% YoY)</span>
              <span>Deals: {findings.fundingTrends.dealCount.value} ({findings.fundingTrends.dealCount.yoyChange > 0 ? "+" : ""}{findings.fundingTrends.dealCount.yoyChange}% YoY)</span>
            </div>
          )}
        </div>

        {/* Red Flags */}
        {redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${redFlags.length})`}>
            <div className="space-y-2 mt-2">
              {redFlags.map((rf, i) => (
                <div key={i} className="p-2 rounded border-l-2 border-red-500 bg-red-50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      rf.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                      rf.severity === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {rf.severity}
                    </Badge>
                    <span className="text-sm font-medium">{rf.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{rf.description}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights */}
        {narrative.keyInsights.length > 0 && (
          <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200">
            <p className="text-sm font-medium text-cyan-700 mb-1">Insights cles</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-cyan-500">•</span> {insight}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Tech Stack DD Card - Split from Technical DD v2.0
const TechStackDDCard = memo(function TechStackDDCard({
  data,
  reactData,
  onShowTrace
}: {
  data: TechStackDDData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const techStack = data.findings?.techStack;
  const scalability = data.findings?.scalability;
  const technicalDebt = data.findings?.technicalDebt;
  const technicalRisks = data.findings?.technicalRisks ?? [];

  // Collect all stack technologies
  const allStackTechs = [
    ...(techStack?.frontend?.technologies ?? []),
    ...(techStack?.backend?.technologies ?? []),
    ...(techStack?.backend?.frameworks ?? []),
  ].filter(Boolean);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Tech Stack DD</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Stack technique, scalabilité, dette</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Stack */}
        {allStackTechs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tech Stack</span>
              {techStack?.overallAssessment && (
                <Badge variant="outline" className={cn(
                  techStack.overallAssessment === "MODERN" ? "bg-green-100 text-green-800" :
                  techStack.overallAssessment === "ADEQUATE" ? "bg-blue-100 text-blue-800" :
                  techStack.overallAssessment === "OUTDATED" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {techStack.overallAssessment}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {allStackTechs.map((s: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Scalability & Technical Debt */}
        <div className="grid grid-cols-2 gap-3">
          {scalability && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Architecture</div>
              <div className="font-medium capitalize">{scalability.currentArchitecture?.replace(/_/g, " ")}</div>
            </div>
          )}
          {technicalDebt && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Dette tech</div>
              <div className={cn(
                "font-medium",
                technicalDebt.level === "LOW" ? "text-green-600" :
                technicalDebt.level === "CRITICAL" ? "text-red-600" :
                technicalDebt.level === "HIGH" ? "text-orange-600" : "text-yellow-600"
              )}>
                {technicalDebt.level}
              </div>
            </div>
          )}
        </div>

        {/* Bottlenecks */}
        {scalability?.bottlenecks && scalability.bottlenecks.length > 0 && (
          <ExpandableSection title={`Bottlenecks (${scalability.bottlenecks.length})`}>
            <div className="space-y-2 mt-2">
              {scalability.bottlenecks.map((b, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <div>
                    <span className="font-medium">{b.component}</span>
                    <p className="text-xs text-muted-foreground">{b.issue}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    b.severity === "CRITICAL" || b.severity === "HIGH" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  )}>
                    {b.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Technical Risks */}
        {technicalRisks.length > 0 && (
          <ExpandableSection title={`Risques techniques (${technicalRisks.length})`}>
            <div className="space-y-2 mt-2">
              {technicalRisks.map((r, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <span>{r.risk}</span>
                  <Badge variant="outline" className={cn(
                    r.severity === "CRITICAL" || r.severity === "HIGH" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  )}>
                    {r.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Tech Ops DD Card - Split from Technical DD v2.0
const TechOpsDDCard = memo(function TechOpsDDCard({
  data,
  reactData,
  onShowTrace
}: {
  data: TechOpsDDData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const productMaturity = data.findings?.productMaturity;
  const teamCapability = data.findings?.teamCapability;
  const security = data.findings?.security;
  const ipProtection = data.findings?.ipProtection;
  const technicalRisks = data.findings?.technicalRisks ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Tech Ops DD</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Maturité, équipe, sécurité, IP</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Product Maturity & Team */}
        <div className="grid grid-cols-2 gap-3">
          {productMaturity && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Maturité produit</div>
              <div className="font-medium capitalize">{productMaturity.stage}</div>
            </div>
          )}
          {teamCapability && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Équipe tech</div>
              <div className="font-medium">{teamCapability.teamSize?.current ?? 0} personnes</div>
            </div>
          )}
        </div>

        {/* Security & Seniority */}
        <div className="grid grid-cols-2 gap-3">
          {security && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Sécurité</div>
              <div className={cn(
                "font-medium",
                security.posture === "EXCELLENT" || security.posture === "GOOD" ? "text-green-600" :
                security.posture === "BASIC" ? "text-yellow-600" :
                security.posture === "POOR" ? "text-red-600" : "text-muted-foreground"
              )}>
                {security.posture}
              </div>
            </div>
          )}
          {teamCapability?.seniorityLevel && (
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Séniorité</div>
              <div className={cn(
                "font-medium",
                teamCapability.seniorityLevel.assessment === "SENIOR" ? "text-green-600" :
                teamCapability.seniorityLevel.assessment === "MID" || teamCapability.seniorityLevel.assessment === "MIXED" ? "text-yellow-600" :
                teamCapability.seniorityLevel.assessment === "JUNIOR" ? "text-orange-600" : "text-muted-foreground"
              )}>
                {teamCapability.seniorityLevel.assessment}
              </div>
            </div>
          )}
        </div>

        {/* Key Person Risk */}
        {teamCapability?.keyPersonRisk?.exists && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium text-sm">Key Person Risk</span>
            </div>
            {teamCapability.keyPersonRisk.persons && teamCapability.keyPersonRisk.persons.length > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Personnes clés: {teamCapability.keyPersonRisk.persons.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Team Gaps */}
        {teamCapability?.gaps && teamCapability.gaps.length > 0 && (
          <ExpandableSection title={`Gaps équipe (${teamCapability.gaps.length})`}>
            <div className="space-y-2 mt-2">
              {teamCapability.gaps.map((g, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <div>
                    <span className="font-medium">{g.gap}</span>
                    <p className="text-xs text-muted-foreground">{g.impact}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    g.severity === "CRITICAL" || g.severity === "HIGH" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  )}>
                    {g.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* IP Protection */}
        {ipProtection && (ipProtection.patents?.granted > 0 || ipProtection.patents?.pending > 0 || ipProtection.tradeSecrets?.exists) && (
          <div className="p-3 rounded-lg bg-muted">
            <div className="text-sm font-medium mb-2">Propriété intellectuelle</div>
            <div className="flex gap-4 text-xs">
              {(ipProtection.patents?.granted ?? 0) > 0 && (
                <span><strong>{ipProtection.patents?.granted}</strong> brevets</span>
              )}
              {(ipProtection.patents?.pending ?? 0) > 0 && (
                <span><strong>{ipProtection.patents?.pending}</strong> en attente</span>
              )}
              {ipProtection.tradeSecrets?.exists && (
                <span className="text-green-600">Trade secrets ✓</span>
              )}
            </div>
          </div>
        )}

        {/* Technical Risks */}
        {technicalRisks.length > 0 && (
          <ExpandableSection title={`Risques (${technicalRisks.length})`}>
            <div className="space-y-2 mt-2">
              {technicalRisks.map((r, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <span>{r.risk}</span>
                  <Badge variant="outline" className={cn(
                    r.severity === "CRITICAL" || r.severity === "HIGH" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  )}>
                    {r.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Legal & Regulatory Card - Updated for v2.0 structure
const LegalRegulatoryCard = memo(function LegalRegulatoryCard({
  data,
  reactData,
  onShowTrace
}: {
  data: LegalRegulatoryData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const structureAnalysis = data.findings?.structureAnalysis;
  const regulatoryRisks = data.findings?.regulatoryRisks ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">Legal & Regulatory</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Structure juridique et compliance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Structure */}
        {structureAnalysis && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{structureAnalysis.entityType}</span>
              <p className="text-xs text-muted-foreground">{structureAnalysis.jurisdiction}</p>
            </div>
            <StatusBadge
              status={structureAnalysis.appropriateness}
              variant={
                structureAnalysis.appropriateness === "APPROPRIATE" ? "success" :
                structureAnalysis.appropriateness === "CONCERNING" ? "danger" : "warning"
              }
            />
          </div>
        )}

        {/* Regulatory Risks */}
        {regulatoryRisks.length > 0 && (
          <div className="p-3 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Risques réglementaires</span>
              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                {regulatoryRisks.length} risque(s)
              </Badge>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {regulatoryRisks.slice(0, 2).map((r: { regulation: string }, i: number) => (
                <li key={i}>• {r.regulation}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-2">Red Flags ({data.redFlags.length})</p>
            <ul className="space-y-1">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className={cn(
                    "h-4 w-4 shrink-0 mt-0.5",
                    rf.severity === "CRITICAL" ? "text-red-600" :
                    rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                  )} />
                  <div>
                    <span className="font-medium">{rf.title}</span>
                    {rf.evidence && <p className="text-xs">{rf.evidence}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Cap Table Auditor Card - v2.0 Refonte
const CapTableAuditCard = memo(function CapTableAuditCard({
  data,
  reactData,
  onShowTrace
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; // Support both v1 and v2 structures
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  // Detect v2.0 structure (has findings, meta, score object)
  const isV2 = data.findings && data.meta && typeof data.score === "object";

  // v2.0 data extraction
  const findings = isV2 ? data.findings : null;
  const scoreValue = isV2 ? data.score?.value : data.capTableScore;
  const redFlags = isV2 ? data.redFlags : null;
  const narrative = isV2 ? data.narrative : null;
  const alertSignal = isV2 ? data.alertSignal : null;
  const questions = isV2 ? data.questions : null;

  // Ownership breakdown - v2.0 structure
  const ownership = findings?.ownershipBreakdown;
  const foundersTotal = ownership?.totalFoundersOwnership ?? data.ownershipBreakdown?.founders ?? 0;
  const investorsTotal = ownership?.totalInvestorsOwnership ?? data.ownershipBreakdown?.investors ?? 0;
  const optionPoolSize = ownership?.optionPool?.size ?? data.ownershipBreakdown?.optionPool ?? 0;
  const employeesAllocated = ownership?.employees?.allocated ?? data.ownershipBreakdown?.employees ?? 0;

  // Dilution projection - v2.0
  const dilution = findings?.dilutionProjection;

  // Round terms - v2.0
  const roundTerms = findings?.roundTerms;

  // Data availability (v2.0 only)
  const dataAvailability = findings?.dataAvailability;

  // Structural issues (v2.0)
  const structuralIssues = findings?.structuralIssues ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-pink-600" />
            <CardTitle className="text-lg">Cap Table Audit</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isV2 && data.meta?.dataCompleteness && (
              <Badge variant="outline" className={cn(
                "text-xs",
                data.meta.dataCompleteness === "complete" ? "bg-green-100 text-green-800" :
                data.meta.dataCompleteness === "partial" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              )}>
                {data.meta.dataCompleteness === "complete" ? "Données complètes" :
                 data.meta.dataCompleteness === "partial" ? "Données partielles" :
                 "Données minimales"}
              </Badge>
            )}
            <ScoreBadge score={scoreValue ?? 0} size="lg" />
          </div>
        </div>
        <CardDescription>Dilution, terms, investisseurs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground">{narrative.summary}</p>
        )}

        {/* Alert Signal */}
        {alertSignal && (
          <div className={cn(
            "p-3 rounded-lg border",
            alertSignal.recommendation === "STOP" ? "bg-red-50 border-red-200" :
            alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-50 border-orange-200" :
            alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          )}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                alertSignal.recommendation === "STOP" ? "bg-red-100 text-red-800" :
                alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-100 text-orange-800" :
                alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-100 text-yellow-800" :
                "bg-green-100 text-green-800"
              )}>
                {alertSignal.recommendation?.replace(/_/g, " ")}
              </Badge>
              <span className="text-sm">{alertSignal.justification}</span>
            </div>
          </div>
        )}

        {/* Data Availability Warning (v2.0) */}
        {dataAvailability && !dataAvailability.capTableProvided && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-medium text-red-800">Cap Table non fournie</span>
                <p className="text-xs text-red-700 mt-1">{dataAvailability.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Ownership Breakdown */}
        {(foundersTotal > 0 || investorsTotal > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Répartition</span>
              {ownership?.checksumValid === false && (
                <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                  Checksum invalide
                </Badge>
              )}
            </div>
            <div className="flex h-4 rounded-full overflow-hidden">
              <div className="bg-blue-500" style={{ width: `${foundersTotal}%` }} title="Fondateurs" />
              <div className="bg-green-500" style={{ width: `${employeesAllocated}%` }} title="Employés" />
              <div className="bg-purple-500" style={{ width: `${investorsTotal}%` }} title="Investisseurs" />
              <div className="bg-yellow-500" style={{ width: `${optionPoolSize}%` }} title="Option Pool" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fondateurs: {foundersTotal.toFixed(1)}%</span>
              <span>Investisseurs: {investorsTotal.toFixed(1)}%</span>
              <span>Pool: {optionPoolSize.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Founders Detail (v2.0) */}
        {ownership?.founders && ownership.founders.length > 0 && (
          <ExpandableSection title={`Fondateurs (${ownership.founders.length})`}>
            <div className="space-y-2 mt-2">
              {ownership.founders.map((f: { name: string; percentage: number; vesting: string; accelerationClause: boolean }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.name}</span>
                    <span className="text-sm font-bold">{f.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                    <span>Vesting: {f.vesting}</span>
                    {f.accelerationClause && (
                      <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">Accélération</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Dilution Projection (v2.0) */}
        {dilution && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Projection Dilution</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-muted">
                <div className="text-muted-foreground">Actuel</div>
                <div className="font-bold">{dilution.currentFounderOwnership?.toFixed(1)}%</div>
              </div>
              {dilution.postThisRound && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-muted-foreground">Post-round</div>
                  <div className="font-bold">{dilution.postThisRound.ownership?.toFixed(1)}%</div>
                  <div className="text-red-600">-{dilution.postThisRound.dilution?.toFixed(1)}%</div>
                </div>
              )}
              {dilution.atSeriesA && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-muted-foreground">Série A</div>
                  <div className="font-bold">{dilution.atSeriesA.ownership?.toFixed(1)}%</div>
                  <div className="text-red-600">-{dilution.atSeriesA.dilution?.toFixed(1)}%</div>
                </div>
              )}
              {dilution.atExit && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-muted-foreground">Exit</div>
                  <div className="font-bold">{dilution.atExit.ownership?.toFixed(1)}%</div>
                </div>
              )}
            </div>
            {dilution.postThisRound?.calculation && (
              <p className="text-xs text-blue-600 mt-2">📊 {dilution.postThisRound.calculation}</p>
            )}
          </div>
        )}

        {/* Round Terms (v2.0) */}
        {roundTerms && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Terms du Round</span>
              {roundTerms.toxicity && (
                <Badge variant="outline" className={cn(
                  "text-xs",
                  roundTerms.toxicity === "CLEAN" ? "bg-green-100 text-green-800" :
                  roundTerms.toxicity === "STANDARD" ? "bg-blue-100 text-blue-800" :
                  roundTerms.toxicity === "AGGRESSIVE" ? "bg-orange-100 text-orange-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {roundTerms.toxicity}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {roundTerms.liquidationPreference && (
                <div>
                  <span className="text-muted-foreground">Liq. Pref:</span>{" "}
                  <span className={cn(
                    "font-medium",
                    roundTerms.liquidationPreference.isStandard ? "text-green-600" : "text-orange-600"
                  )}>
                    {roundTerms.liquidationPreference.multiple}x
                  </span>
                </div>
              )}
              {roundTerms.antiDilution && (
                <div>
                  <span className="text-muted-foreground">Anti-dilution:</span>{" "}
                  <span className="font-medium">{roundTerms.antiDilution.type}</span>
                </div>
              )}
              {roundTerms.participatingPreferred !== undefined && (
                <div>
                  <span className="text-muted-foreground">Participating:</span>{" "}
                  <span className={cn(
                    "font-medium",
                    roundTerms.participatingPreferred ? "text-red-600" : "text-green-600"
                  )}>
                    {roundTerms.participatingPreferred ? "Oui ⚠️" : "Non ✓"}
                  </span>
                </div>
              )}
              {roundTerms.proRataRights !== undefined && (
                <div>
                  <span className="text-muted-foreground">Pro-rata:</span>{" "}
                  <span className="font-medium">{roundTerms.proRataRights ? "Oui ✓" : "Non"}</span>
                </div>
              )}
            </div>
            {roundTerms.redFlagTerms && roundTerms.redFlagTerms.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-medium text-red-600 mb-1">Terms problématiques</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {roundTerms.redFlagTerms.map((t: { term: string; issue: string }, i: number) => (
                    <li key={i}>• <span className="font-medium">{t.term}:</span> {t.issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Investors Analysis (v2.0) */}
        {ownership?.investors && ownership.investors.length > 0 && (
          <ExpandableSection title={`Investisseurs (${ownership.investors.length})`}>
            <div className="space-y-2 mt-2">
              {ownership.investors.map((inv: { name: string; percentage: number; round: string; type: string; hasProRata: boolean; hasBoard: boolean }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{inv.name}</span>
                    <span className="text-sm">{inv.percentage?.toFixed(1)}%</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">{inv.round}</Badge>
                    <Badge variant="outline" className="text-xs">{inv.type}</Badge>
                    {inv.hasProRata && <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">Pro-rata</Badge>}
                    {inv.hasBoard && <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800">Board</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Structural Issues (v2.0) */}
        {structuralIssues.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-2">Issues structurelles ({structuralIssues.length})</p>
            <div className="space-y-2">
              {structuralIssues.map((issue: { issue: string; severity: string; impact: string; recommendation: string }, i: number) => (
                <div key={i} className="p-2 rounded border bg-orange-50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      issue.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                      issue.severity === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {issue.severity}
                    </Badge>
                    <span className="text-sm font-medium">{issue.issue}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{issue.impact}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Red Flags (v2.0) */}
        {redFlags && redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${redFlags.length})`}>
            <div className="space-y-2 mt-2">
              {redFlags.map((rf: { severity: string; title: string; evidence: string; question: string; impact: string }, i: number) => (
                <div key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rf.title}</span>
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          rf.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                          rf.severity === "HIGH" ? "bg-orange-100 text-orange-800" :
                          "bg-yellow-100 text-yellow-800"
                        )}>
                          {rf.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                      {rf.impact && <p className="text-xs text-red-600 mt-1">Impact: {rf.impact}</p>}
                      {rf.question && <p className="text-xs text-blue-600 mt-1">❓ {rf.question}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Questions (v2.0) */}
        {questions && questions.length > 0 && (
          <ExpandableSection title={`Questions à poser (${questions.length})`}>
            <div className="space-y-2 mt-2">
              {questions.map((q: { priority: string; question: string; context: string; whatToLookFor: string }, i: number) => (
                <div key={i} className="p-2 rounded border bg-card">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      q.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                      q.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {q.priority}
                    </Badge>
                    <p className="text-sm font-medium">{q.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{q.context}</p>
                  {q.whatToLookFor && (
                    <p className="text-xs text-orange-600 mt-1">👀 À surveiller: {q.whatToLookFor}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights & Negotiation (v2.0) */}
        {narrative && (narrative.keyInsights?.length > 0 || narrative.forNegotiation?.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            {narrative.keyInsights?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-500">•</span> {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrative.forNegotiation?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600 mb-1">Pour négocier</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.forNegotiation.slice(0, 3).map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Fallback for old v1 structure */}
        {!isV2 && data.roundTerms?.concerns?.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Concerns sur les terms</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.roundTerms.concerns.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {!isV2 && data.structuralRedFlags?.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-1">Red Flags</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.structuralRedFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// GTM Analyst Card - v2.0 Refonte
const GTMAnalystCard = memo(function GTMAnalystCard({
  data,
  reactData,
  onShowTrace
}: {
  data: GTMAnalystData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  // v2.0 data extraction
  const findings = data.findings;
  const scoreValue = data.score?.value;
  const redFlags = data.redFlags ?? [];
  const narrative = data.narrative;
  const alertSignal = data.alertSignal;
  const questions = data.questions ?? [];

  // Channels
  const channels = findings?.channels ?? [];
  const channelSummary = findings?.channelSummary;

  // Sales motion
  const salesMotion = findings?.salesMotion;

  // Unit economics
  const unitEconomics = findings?.unitEconomics;

  // Expansion
  const expansion = findings?.expansion;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-lg">GTM Strategy</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.meta?.dataCompleteness && (
              <Badge variant="outline" className={cn(
                "text-xs",
                data.meta.dataCompleteness === "complete" ? "bg-green-100 text-green-800" :
                data.meta.dataCompleteness === "partial" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              )}>
                {data.meta.dataCompleteness === "complete" ? "Complètes" :
                 data.meta.dataCompleteness === "partial" ? "Partielles" : "Minimales"}
              </Badge>
            )}
            <ScoreBadge score={scoreValue ?? 0} size="lg" />
          </div>
        </div>
        <CardDescription>Go-to-market et efficacité commerciale</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground">{narrative.summary}</p>
        )}

        {/* Alert Signal */}
        {alertSignal && (
          <div className={cn(
            "p-3 rounded-lg border",
            alertSignal.recommendation === "STOP" ? "bg-red-50 border-red-200" :
            alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-50 border-orange-200" :
            alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          )}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                alertSignal.recommendation === "STOP" ? "bg-red-100 text-red-800" :
                alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-100 text-orange-800" :
                alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-100 text-yellow-800" :
                "bg-green-100 text-green-800"
              )}>
                {alertSignal.recommendation?.replace(/_/g, " ")}
              </Badge>
              <span className="text-sm">{alertSignal.justification}</span>
            </div>
          </div>
        )}

        {/* Sales Motion */}
        {salesMotion && (
          <div className="p-3 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Motion de vente</span>
              <Badge variant="outline" className={cn(
                salesMotion.appropriateness?.verdict === "APPROPRIATE" ? "bg-green-100 text-green-800" :
                salesMotion.appropriateness?.verdict === "QUESTIONABLE" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              )}>
                {salesMotion.type?.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{salesMotion.typeEvidence}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
              {salesMotion.salesCycle?.length && (
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground">Cycle:</span>{" "}
                  <span className="font-medium">{salesMotion.salesCycle.length}j</span>
                  {salesMotion.salesCycle.benchmark && (
                    <span className="text-muted-foreground ml-1">(bench: {salesMotion.salesCycle.benchmark}j)</span>
                  )}
                </div>
              )}
              {salesMotion.acv?.value && (
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground">ACV:</span>{" "}
                  <span className="font-medium">{formatAmount(salesMotion.acv.value)}</span>
                </div>
              )}
              {salesMotion.winRate?.value && (
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground">Win rate:</span>{" "}
                  <span className="font-medium">{salesMotion.winRate.value}%</span>
                </div>
              )}
              {salesMotion.magicNumber?.value !== undefined && (
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground">Magic #:</span>{" "}
                  <span className={cn(
                    "font-medium",
                    salesMotion.magicNumber.value >= 0.75 ? "text-green-600" :
                    salesMotion.magicNumber.value >= 0.5 ? "text-yellow-600" : "text-red-600"
                  )}>
                    {salesMotion.magicNumber.value.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            {salesMotion.bottlenecks && salesMotion.bottlenecks.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-medium text-orange-600 mb-1">Bottlenecks</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {salesMotion.bottlenecks.slice(0, 2).map((b: { bottleneck: string; impact: string }, i: number) => (
                    <li key={i}>• [{b.impact}] {b.bottleneck}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Channel Summary */}
        {channelSummary && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Canal principal</div>
              <div className="font-medium">{channelSummary.primaryChannel}</div>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">Diversification</div>
              <div className={cn(
                "font-medium",
                channelSummary.channelDiversification === "GOOD" ? "text-green-600" :
                channelSummary.channelDiversification === "MODERATE" ? "text-yellow-600" : "text-red-600"
              )}>
                {channelSummary.channelDiversification}
              </div>
            </div>
          </div>
        )}

        {/* Channels Detail */}
        {channels.length > 0 && (
          <ExpandableSection title={`Canaux d'acquisition (${channels.length})`}>
            <div className="space-y-2 mt-2">
              {channels.map((c: {
                id: string;
                channel: string;
                type: string;
                efficiency: string;
                economics: { cac?: number; ltvCacRatio?: number };
                scalability: { level: string };
                verdict: string;
              }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{c.channel}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">{c.type}</Badge>
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        c.efficiency === "HIGH" ? "bg-green-100 text-green-800" :
                        c.efficiency === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      )}>
                        {c.efficiency}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {c.economics?.cac && <span>CAC: {formatAmount(c.economics.cac)}</span>}
                    {c.economics?.ltvCacRatio && <span>LTV/CAC: {c.economics.ltvCacRatio.toFixed(1)}x</span>}
                    <span>Scalabilité: {c.scalability?.level}</span>
                  </div>
                  {c.verdict && <p className="text-xs text-muted-foreground mt-1">{c.verdict}</p>}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Unit Economics */}
        {unitEconomics && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Unit Economics</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                unitEconomics.overall === "HEALTHY" ? "bg-green-100 text-green-800" :
                unitEconomics.overall === "ACCEPTABLE" ? "bg-blue-100 text-blue-800" :
                unitEconomics.overall === "CONCERNING" ? "bg-orange-100 text-orange-800" :
                "bg-gray-100 text-gray-800"
              )}>
                {unitEconomics.overall}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{unitEconomics.rationale}</p>
            {unitEconomics.keyMetrics && unitEconomics.keyMetrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {unitEconomics.keyMetrics.slice(0, 4).map((m: { metric: string; value?: number; benchmark?: number; assessment: string }, i: number) => (
                  <div key={i} className="p-2 rounded bg-muted text-xs">
                    <div className="text-muted-foreground">{m.metric}</div>
                    <div className="font-medium">
                      {m.value !== undefined ? (typeof m.value === "number" && m.value > 1000 ? formatAmount(m.value) : m.value) : "N/A"}
                      {m.benchmark && <span className="text-muted-foreground ml-1">(bench: {m.benchmark})</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expansion Analysis (GTM) */}
        {expansion && (
          <div className="space-y-2">
            {/* Growth Rate */}
            {expansion.currentGrowthRate && (
              <div className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Croissance</span>
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    expansion.currentGrowthRate.sustainability === "SUSTAINABLE" ? "bg-green-100 text-green-800" :
                    expansion.currentGrowthRate.sustainability === "QUESTIONABLE" ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  )}>
                    {expansion.currentGrowthRate.sustainability}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {expansion.currentGrowthRate.value !== undefined && (
                    <span className="text-lg font-bold">{expansion.currentGrowthRate.value}%</span>
                  )}
                  <span className="text-xs text-muted-foreground">({expansion.currentGrowthRate.period})</span>
                </div>
                {expansion.currentGrowthRate.sustainabilityRationale && (
                  <p className="text-xs text-muted-foreground mt-1">{expansion.currentGrowthRate.sustainabilityRationale}</p>
                )}
              </div>
            )}

            {/* Growth Levers */}
            {expansion.growthLevers && expansion.growthLevers.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {expansion.growthLevers.slice(0, 3).map((lever: { lever: string; potential: string; timeline: string }, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-muted text-center">
                    <div className="text-xs text-muted-foreground truncate">{lever.lever}</div>
                    <div className={cn(
                      "font-medium",
                      lever.potential === "HIGH" ? "text-green-600" :
                      lever.potential === "MEDIUM" ? "text-yellow-600" : "text-red-600"
                    )}>
                      {lever.potential}
                    </div>
                    <div className="text-xs text-muted-foreground">{lever.timeline}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Scaling Constraints */}
            {expansion.scalingConstraints && expansion.scalingConstraints.length > 0 && (
              <div className="text-xs">
                <span className="font-medium text-orange-600">Contraintes scaling: </span>
                {expansion.scalingConstraints.slice(0, 2).map((c: { constraint: string; severity: string }, i: number) => (
                  <span key={i}>
                    [{c.severity}] {c.constraint}{i < Math.min(expansion.scalingConstraints.length, 2) - 1 ? " | " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Red Flags */}
        {redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${redFlags.length})`}>
            <div className="space-y-2 mt-2">
              {redFlags.map((rf, i) => (
                <div key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rf.title}</span>
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          rf.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                          rf.severity === "HIGH" ? "bg-orange-100 text-orange-800" :
                          "bg-yellow-100 text-yellow-800"
                        )}>
                          {rf.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                      {rf.question && <p className="text-xs text-blue-600 mt-1">❓ {rf.question}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Questions */}
        {questions.length > 0 && (
          <ExpandableSection title={`Questions à poser (${questions.length})`}>
            <div className="space-y-2 mt-2">
              {questions.map((q, i) => (
                <div key={i} className="p-2 rounded border bg-card">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      q.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                      q.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {q.priority}
                    </Badge>
                    <p className="text-sm font-medium">{q.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{q.context}</p>
                  {q.whatToLookFor && (
                    <p className="text-xs text-orange-600 mt-1">👀 À surveiller: {q.whatToLookFor}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights & Negotiation */}
        {narrative && (narrative.keyInsights?.length > 0 || narrative.forNegotiation?.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            {narrative.keyInsights?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-500">•</span> {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrative.forNegotiation?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600 mb-1">Pour négocier</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.forNegotiation.slice(0, 3).map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Customer Intel Card - v2.0 Refonte
const CustomerIntelCard = memo(function CustomerIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: CustomerIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  // v2.0 data extraction
  const findings = data.findings;
  const scoreValue = data.score?.value;
  const redFlags = data.redFlags ?? [];
  const narrative = data.narrative;
  const alertSignal = data.alertSignal;
  const questions = data.questions ?? [];

  // Specific findings
  const pmf = findings?.pmf;
  const retention = findings?.retention;
  const customerBase = findings?.customerBase;
  const concentration = findings?.concentration;
  const icp = findings?.icp;
  const expansion = findings?.expansion;
  const claimsValidation = findings?.claimsValidation ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-teal-600" />
            <CardTitle className="text-lg">Customer Intel</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.meta?.dataCompleteness && (
              <Badge variant="outline" className={cn(
                "text-xs",
                data.meta.dataCompleteness === "complete" ? "bg-green-100 text-green-800" :
                data.meta.dataCompleteness === "partial" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              )}>
                {data.meta.dataCompleteness === "complete" ? "Complètes" :
                 data.meta.dataCompleteness === "partial" ? "Partielles" : "Minimales"}
              </Badge>
            )}
            <ScoreBadge score={scoreValue ?? 0} size="lg" />
          </div>
        </div>
        <CardDescription>Base clients et PMF signals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground">{narrative.summary}</p>
        )}

        {/* Alert Signal */}
        {alertSignal && (
          <div className={cn(
            "p-3 rounded-lg border",
            alertSignal.recommendation === "STOP" ? "bg-red-50 border-red-200" :
            alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-50 border-orange-200" :
            alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          )}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                alertSignal.recommendation === "STOP" ? "bg-red-100 text-red-800" :
                alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-100 text-orange-800" :
                alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-100 text-yellow-800" :
                "bg-green-100 text-green-800"
              )}>
                {alertSignal.recommendation?.replace(/_/g, " ")}
              </Badge>
              <span className="text-sm">{alertSignal.justification}</span>
            </div>
          </div>
        )}

        {/* PMF Analysis */}
        {pmf && (
          <div className="p-3 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Product-Market Fit</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                  pmf.pmfVerdict === "STRONG" ? "bg-green-100 text-green-800" :
                  pmf.pmfVerdict === "EMERGING" ? "bg-blue-100 text-blue-800" :
                  pmf.pmfVerdict === "WEAK" ? "bg-orange-100 text-orange-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {pmf.pmfVerdict}
                </Badge>
                <span className="text-sm font-bold">{pmf.pmfScore}/100</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{pmf.pmfJustification}</p>

            {/* Positive Signals */}
            {pmf.positiveSignals && pmf.positiveSignals.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-green-600 mb-1">Signaux positifs</p>
                <div className="flex flex-wrap gap-1">
                  {pmf.positiveSignals.slice(0, 3).map((s: { signal: string; strength: string }, i: number) => (
                    <Badge key={i} variant="secondary" className={cn(
                      "text-xs",
                      s.strength === "STRONG" ? "bg-green-100 text-green-800" :
                      s.strength === "MODERATE" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {s.signal}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* PMF Tests */}
            {pmf.pmfTests && pmf.pmfTests.length > 0 && (
              <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-2">
                {pmf.pmfTests.slice(0, 4).map((t: { test: string; result: string }, i: number) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    {t.result === "PASS" ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : t.result === "FAIL" ? (
                      <XCircle className="h-3 w-3 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-yellow-600" />
                    )}
                    <span className="text-muted-foreground">{t.test}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Retention Metrics */}
        {retention && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Rétention</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                retention.nrr?.verdict === "EXCELLENT" ? "bg-green-100 text-green-800" :
                retention.nrr?.verdict === "GOOD" ? "bg-blue-100 text-blue-800" :
                retention.nrr?.verdict === "CONCERNING" ? "bg-orange-100 text-orange-800" :
                retention.nrr?.verdict === "CRITICAL" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              )}>
                {retention.nrr?.verdict}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              {retention.nrr?.reported && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">NRR</div>
                  <div className={cn(
                    "text-lg font-bold",
                    retention.nrr.reported >= 120 ? "text-green-600" :
                    retention.nrr.reported >= 100 ? "text-blue-600" : "text-orange-600"
                  )}>
                    {retention.nrr.reported}%
                  </div>
                  {retention.nrr.percentile && (
                    <div className="text-xs text-muted-foreground">P{retention.nrr.percentile}</div>
                  )}
                </div>
              )}
              {retention.grossRetention?.reported && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Gross Retention</div>
                  <div className="text-lg font-bold">{retention.grossRetention.reported}%</div>
                </div>
              )}
              {retention.grossRetention?.churnRate !== undefined && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Churn</div>
                  <div className={cn(
                    "text-lg font-bold",
                    retention.grossRetention.churnRate <= 3 ? "text-green-600" :
                    retention.grossRetention.churnRate <= 5 ? "text-yellow-600" : "text-red-600"
                  )}>
                    {retention.grossRetention.churnRate}%
                  </div>
                </div>
              )}
              {retention.cohortTrends && (
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Tendance</div>
                  <div className={cn(
                    "font-medium",
                    retention.cohortTrends.trend === "IMPROVING" ? "text-green-600" :
                    retention.cohortTrends.trend === "STABLE" ? "text-blue-600" :
                    retention.cohortTrends.trend === "DECLINING" ? "text-red-600" : "text-gray-600"
                  )}>
                    {retention.cohortTrends.trend}
                  </div>
                </div>
              )}
            </div>
            {retention.nrr?.calculation && (
              <p className="text-xs text-blue-600 mt-2">📊 {retention.nrr.calculation}</p>
            )}
          </div>
        )}

        {/* Customer Base */}
        {customerBase && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {customerBase.totalCustomers && (
              <div className="p-2 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground">Total clients</div>
                <div className="text-lg font-bold">{customerBase.totalCustomers}</div>
              </div>
            )}
            {customerBase.payingCustomers && (
              <div className="p-2 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground">Payants</div>
                <div className="text-lg font-bold">{customerBase.payingCustomers}</div>
              </div>
            )}
            {customerBase.customerQuality && (
              <div className="p-2 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground">Qualité</div>
                <div className={cn(
                  "font-bold",
                  customerBase.customerQuality === "HIGH" ? "text-green-600" :
                  customerBase.customerQuality === "MEDIUM" ? "text-yellow-600" : "text-red-600"
                )}>
                  {customerBase.customerQuality}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Concentration Risk */}
        {concentration && (
          <div className="p-3 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Concentration</span>
              <Badge variant="outline" className={cn(
                "text-xs",
                concentration.concentrationLevel === "HEALTHY" ? "bg-green-100 text-green-800" :
                concentration.concentrationLevel === "MODERATE" ? "bg-yellow-100 text-yellow-800" :
                concentration.concentrationLevel === "HIGH" ? "bg-orange-100 text-orange-800" :
                "bg-red-100 text-red-800"
              )}>
                {concentration.concentrationLevel}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {concentration.topCustomerRevenue !== undefined && (
                <div>
                  <span className="text-muted-foreground">Top 1:</span>{" "}
                  <span className={cn(
                    "font-medium",
                    concentration.topCustomerRevenue > 30 ? "text-red-600" :
                    concentration.topCustomerRevenue > 20 ? "text-orange-600" : "text-green-600"
                  )}>
                    {concentration.topCustomerRevenue}%
                  </span>
                </div>
              )}
              {concentration.top3CustomersRevenue !== undefined && (
                <div>
                  <span className="text-muted-foreground">Top 3:</span>{" "}
                  <span className="font-medium">{concentration.top3CustomersRevenue}%</span>
                </div>
              )}
              {concentration.top10CustomersRevenue !== undefined && (
                <div>
                  <span className="text-muted-foreground">Top 10:</span>{" "}
                  <span className="font-medium">{concentration.top10CustomersRevenue}%</span>
                </div>
              )}
            </div>
            {concentration.diversificationTrend && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Tendance:</span>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  concentration.diversificationTrend === "IMPROVING" ? "bg-green-100 text-green-800" :
                  concentration.diversificationTrend === "STABLE" ? "bg-blue-100 text-blue-800" :
                  concentration.diversificationTrend === "WORSENING" ? "bg-red-100 text-red-800" :
                  "bg-gray-100 text-gray-800"
                )}>
                  {concentration.diversificationTrend}
                </Badge>
              </div>
            )}
            {concentration.concentrationRationale && (
              <p className="text-xs text-muted-foreground mt-1">{concentration.concentrationRationale}</p>
            )}
          </div>
        )}

        {/* Notable Customers */}
        {customerBase?.notableCustomers && customerBase.notableCustomers.length > 0 && (
          <ExpandableSection title={`Clients notables (${customerBase.notableCustomers.length})`}>
            <div className="space-y-2 mt-2">
              {customerBase.notableCustomers.map((c: {
                id: string;
                name: string;
                type: string;
                verified: boolean;
                relationship: { status: string; since?: string };
                satisfaction: { isReference: boolean; hasExpanded: boolean };
              }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{c.name}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">{c.type}</Badge>
                      {c.verified && <Badge variant="outline" className="text-xs bg-green-100 text-green-800">Vérifié</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                    <span>Status: {c.relationship?.status}</span>
                    {c.relationship?.since && <span>Depuis: {c.relationship.since}</span>}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {c.satisfaction?.isReference && (
                      <Badge variant="secondary" className="text-xs">Référence</Badge>
                    )}
                    {c.satisfaction?.hasExpanded && (
                      <Badge variant="secondary" className="text-xs">Expansion</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Claims Validation */}
        {claimsValidation.length > 0 && (
          <ExpandableSection title={`Vérification des claims (${claimsValidation.length})`}>
            <div className="space-y-2 mt-2">
              {claimsValidation.map((c: {
                claim: string;
                location: string;
                status: string;
                evidence: string;
              }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-start justify-between">
                    <span className="text-sm flex-1">{c.claim}</span>
                    <Badge variant="outline" className={cn(
                      "ml-2 shrink-0 text-xs",
                      c.status === "VERIFIED" ? "bg-green-100 text-green-800" :
                      c.status === "EXAGGERATED" || c.status === "MISLEADING" ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.evidence}</p>
                  <p className="text-xs text-blue-600 mt-1">📍 {c.location}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Expansion Analysis (Customer Intel) */}
        {expansion && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {expansion.upsell && (
              <div className="p-2 rounded-lg bg-muted text-center">
                <div className="text-xs text-muted-foreground">Upsell</div>
                <div className={cn(
                  "font-medium",
                  expansion.upsell.potential === "HIGH" ? "text-green-600" :
                  expansion.upsell.potential === "MEDIUM" ? "text-yellow-600" :
                  expansion.upsell.potential === "LOW" ? "text-red-600" : "text-gray-600"
                )}>
                  {expansion.upsell.potential}
                </div>
              </div>
            )}
            {expansion.crossSell && (
              <div className="p-2 rounded-lg bg-muted text-center">
                <div className="text-xs text-muted-foreground">Cross-sell</div>
                <div className={cn(
                  "font-medium",
                  expansion.crossSell.potential === "HIGH" ? "text-green-600" :
                  expansion.crossSell.potential === "MEDIUM" ? "text-yellow-600" :
                  expansion.crossSell.potential === "LOW" ? "text-red-600" : "text-gray-600"
                )}>
                  {expansion.crossSell.potential}
                </div>
              </div>
            )}
            {expansion.virality && (
              <div className="p-2 rounded-lg bg-muted text-center">
                <div className="text-xs text-muted-foreground">Viralité</div>
                <div className={cn(
                  "font-medium",
                  expansion.virality.verdict === "STRONG" ? "text-green-600" :
                  expansion.virality.verdict === "MODERATE" ? "text-yellow-600" :
                  expansion.virality.verdict === "WEAK" ? "text-orange-600" : "text-gray-600"
                )}>
                  {expansion.virality.verdict}
                </div>
              </div>
            )}
            {expansion.landAndExpand && (
              <div className="p-2 rounded-lg bg-muted text-center">
                <div className="text-xs text-muted-foreground">Land & Expand</div>
                <div className="font-medium text-sm truncate" title={expansion.landAndExpand.strategy}>
                  {expansion.landAndExpand.successRate ? `${expansion.landAndExpand.successRate}%` : "Actif"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Red Flags */}
        {redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${redFlags.length})`}>
            <div className="space-y-2 mt-2">
              {redFlags.map((rf, i) => (
                <div key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rf.title}</span>
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          rf.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                          rf.severity === "HIGH" ? "bg-orange-100 text-orange-800" :
                          "bg-yellow-100 text-yellow-800"
                        )}>
                          {rf.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                      {rf.question && <p className="text-xs text-blue-600 mt-1">❓ {rf.question}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Questions */}
        {questions.length > 0 && (
          <ExpandableSection title={`Questions à poser (${questions.length})`}>
            <div className="space-y-2 mt-2">
              {questions.map((q, i) => (
                <div key={i} className="p-2 rounded border bg-card">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      q.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                      q.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {q.priority}
                    </Badge>
                    <p className="text-sm font-medium">{q.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{q.context}</p>
                  {q.whatToLookFor && (
                    <p className="text-xs text-orange-600 mt-1">👀 À surveiller: {q.whatToLookFor}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights & Negotiation */}
        {narrative && (narrative.keyInsights?.length > 0 || narrative.forNegotiation?.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            {narrative.keyInsights?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-500">•</span> {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrative.forNegotiation?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600 mb-1">Pour négocier</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.forNegotiation.slice(0, 3).map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Exit Strategist Card - Updated for v2.0 structure
const ExitStrategistCard = memo(function ExitStrategistCard({
  data,
  reactData,
  onShowTrace
}: {
  data: ExitStrategistData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  const scenarios = data.findings?.scenarios ?? [];
  const liquidityRisks = data.findings?.liquidityAnalysis?.risks ?? [];
  const activeBuyers = data.findings?.mnaMarket?.activeBuyers ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-lime-600" />
            <CardTitle className="text-lg">Exit Strategy</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.score?.value ?? 0} size="lg" />
        </div>
        <CardDescription>Scénarios de sortie et ROI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {data.narrative?.summary && (
          <p className="text-sm text-muted-foreground">{data.narrative.summary}</p>
        )}

        {/* Exit Scenarios */}
        <div className="space-y-2">
          {scenarios.slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2 border rounded">
              <div>
                <span className="text-sm font-medium">{s.name ?? s.type?.replace(/_/g, " ")}</span>
                <p className="text-xs text-muted-foreground">{s.timeline?.range ?? `${s.timeline?.estimatedYears} ans`}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className={cn(
                  s.probability?.level === "HIGH" ? "bg-green-100 text-green-800" :
                  s.probability?.level === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {s.probability?.level} ({s.probability?.percentage}%)
                </Badge>
                {s.exitValuation?.estimated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(s.exitValuation.estimated / 1000000).toFixed(0)}M
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Active Buyers from M&A Market */}
        {activeBuyers.length > 0 && (
          <ExpandableSection title={`Acheteurs actifs (${activeBuyers.length})`}>
            <div className="space-y-2 mt-2">
              {activeBuyers.map((b, i) => (
                <div key={i} className="p-2 border rounded">
                  <span className="font-medium text-sm">{b.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({b.type})</span>
                  <p className="text-xs text-muted-foreground">{b.recentDeals} deals - {b.focusAreas?.join(", ")}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Liquidity Risks */}
        {liquidityRisks.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Risques liquidité</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {liquidityRisks.slice(0, 3).map((r, i) => <li key={i}>{r.risk}</li>)}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {data.redFlags && data.redFlags.length > 0 && (
          <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
            <ul className="space-y-2 mt-2">
              {data.redFlags.map((rf, i) => (
                <li key={i} className="p-2 rounded border">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      rf.severity === "CRITICAL" ? "text-red-600" :
                      rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
                    )} />
                    <div>
                      <span className="font-medium">{rf.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Question Master Card - v2.0 Refonte
const QuestionMasterCard = memo(function QuestionMasterCard({
  data,
  reactData,
  onShowTrace,
  questionLimit = Infinity,
}: {
  data: QuestionMasterData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
  questionLimit?: number;
}) {
  // v2.0 data extraction
  const findings = data.findings;
  const scoreValue = data.score?.value;
  const narrative = data.narrative;
  const alertSignal = data.alertSignal;

  // Specific findings
  const founderQuestions = findings?.founderQuestions ?? [];
  const referenceChecks = findings?.referenceChecks ?? [];
  const negotiationPoints = findings?.negotiationPoints ?? [];
  const dealbreakers = findings?.dealbreakers ?? [];
  const topPriorities = findings?.topPriorities ?? [];
  const tier1Summary = findings?.tier1Summary;
  const diligenceChecklist = findings?.diligenceChecklist;
  const suggestedTimeline = findings?.suggestedTimeline ?? [];

  // Filter MUST_ASK questions
  const mustAskQuestions = useMemo(
    () => founderQuestions.filter(q => q.priority === "MUST_ASK"),
    [founderQuestions]
  );

  const shouldAskQuestions = useMemo(
    () => founderQuestions.filter(q => q.priority === "SHOULD_ASK"),
    [founderQuestions]
  );

  const visibleMustAsk = mustAskQuestions.slice(0, questionLimit);
  const hiddenMustAskCount = Math.max(0, mustAskQuestions.length - questionLimit);

  // Readiness color mapping
  const readinessColors: Record<string, string> = {
    "READY_TO_INVEST": "bg-green-100 text-green-800 border-green-200",
    "NEEDS_MORE_DD": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "SIGNIFICANT_CONCERNS": "bg-orange-100 text-orange-800 border-orange-200",
    "DO_NOT_PROCEED": "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-violet-600" />
            <CardTitle className="text-lg">Questions Stratégiques</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {tier1Summary?.overallReadiness && (
              <Badge variant="outline" className={cn(
                "text-xs",
                readinessColors[tier1Summary.overallReadiness] ?? "bg-gray-100 text-gray-800"
              )}>
                {tier1Summary.overallReadiness.replace(/_/g, " ")}
              </Badge>
            )}
            <ScoreBadge score={scoreValue ?? 0} size="lg" />
          </div>
        </div>
        <CardDescription>Questions killer, négociation et roadmap DD</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground">{narrative.summary}</p>
        )}

        {/* Alert Signal */}
        {alertSignal && (
          <div className={cn(
            "p-3 rounded-lg border",
            alertSignal.recommendation === "STOP" ? "bg-red-50 border-red-200" :
            alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-50 border-orange-200" :
            alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          )}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-xs",
                alertSignal.recommendation === "STOP" ? "bg-red-100 text-red-800" :
                alertSignal.recommendation === "INVESTIGATE_FURTHER" ? "bg-orange-100 text-orange-800" :
                alertSignal.recommendation === "PROCEED_WITH_CAUTION" ? "bg-yellow-100 text-yellow-800" :
                "bg-green-100 text-green-800"
              )}>
                {alertSignal.recommendation?.replace(/_/g, " ")}
              </Badge>
              <span className="text-sm">{alertSignal.justification}</span>
            </div>
          </div>
        )}

        {/* Tier 1 Summary */}
        {tier1Summary && (
          <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-violet-800">Synthèse Tier 1</span>
              <div className="flex gap-2">
                {tier1Summary.totalCriticalRedFlags > 0 && (
                  <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                    {tier1Summary.totalCriticalRedFlags} CRITICAL
                  </Badge>
                )}
                {tier1Summary.totalHighRedFlags > 0 && (
                  <Badge variant="outline" className="bg-orange-100 text-orange-800 text-xs">
                    {tier1Summary.totalHighRedFlags} HIGH
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-violet-700">{tier1Summary.readinessRationale}</p>
            {tier1Summary.agentsAnalyzed && tier1Summary.agentsAnalyzed.length > 0 && (
              <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-1">
                {tier1Summary.agentsAnalyzed.map((a: {
                  agentName: string;
                  score: number;
                  grade: string;
                  criticalRedFlagsCount: number;
                }, i: number) => (
                  <div key={i} className="p-1 rounded bg-white text-center text-xs">
                    <div className="truncate text-muted-foreground">{a.agentName.replace("-", " ").slice(0, 10)}</div>
                    <div className={cn(
                      "font-bold",
                      a.score >= 70 ? "text-green-600" :
                      a.score >= 50 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {a.grade} ({a.score})
                    </div>
                    {a.criticalRedFlagsCount > 0 && (
                      <div className="text-red-600">{a.criticalRedFlagsCount} crit.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top Priorities */}
        {topPriorities.length > 0 && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">Priorités immédiates</p>
            <ul className="space-y-2">
              {topPriorities.map((p: { priority: number; action: string; rationale: string; deadline: string }, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                  <Badge variant="outline" className="shrink-0 bg-blue-100 text-blue-800 text-xs">
                    #{p.priority}
                  </Badge>
                  <div>
                    <span className="font-medium">{p.action}</span>
                    {p.deadline && <span className="text-xs ml-2 text-blue-500">({p.deadline})</span>}
                    {p.rationale && <p className="text-xs text-blue-600 mt-0.5">{p.rationale}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* MUST ASK Questions */}
        <ExpandableSection title={`Questions MUST ASK (${mustAskQuestions.length})`} defaultOpen>
          <div className="space-y-2 mt-2">
            {visibleMustAsk.map((q: {
              id: string;
              priority: string;
              category: string;
              question: string;
              context: { sourceAgent: string; whyItMatters: string; triggerData: string };
              evaluation: { goodAnswer: string; badAnswer: string; redFlagIfBadAnswer: string; followUpIfBad: string };
              timing: string;
            }, i: number) => (
              <div key={i} className="p-3 border rounded bg-card">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 text-xs bg-red-100 text-red-800">
                    {q.category}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.question}</p>
                    {q.context?.whyItMatters && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Pourquoi:</span> {q.context.whyItMatters}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      {q.evaluation?.goodAnswer && (
                        <div className="p-2 rounded bg-green-50">
                          <span className="font-medium text-green-700">✓ Bonne réponse:</span>
                          <p className="text-green-600">{q.evaluation.goodAnswer}</p>
                        </div>
                      )}
                      {q.evaluation?.badAnswer && (
                        <div className="p-2 rounded bg-red-50">
                          <span className="font-medium text-red-700">✗ Mauvaise réponse:</span>
                          <p className="text-red-600">{q.evaluation.badAnswer}</p>
                        </div>
                      )}
                    </div>
                    {q.evaluation?.redFlagIfBadAnswer && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ Red flag si mauvaise réponse: {q.evaluation.redFlagIfBadAnswer}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">{q.timing?.replace(/_/g, " ")}</Badge>
                      {q.context?.sourceAgent && (
                        <Badge variant="secondary" className="text-xs">Source: {q.context.sourceAgent}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {hiddenMustAskCount > 0 && (
              <ProTeaserInline hiddenCount={hiddenMustAskCount} itemLabel="questions MUST ASK" />
            )}
          </div>
        </ExpandableSection>

        {/* SHOULD ASK Questions */}
        {shouldAskQuestions.length > 0 && (
          <ExpandableSection title={`Questions SHOULD ASK (${shouldAskQuestions.length})`}>
            <div className="space-y-2 mt-2">
              {shouldAskQuestions.slice(0, questionLimit === Infinity ? 10 : 3).map((q: {
                id: string;
                category: string;
                question: string;
                context: { whyItMatters: string };
                timing: string;
              }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="shrink-0 text-xs bg-yellow-100 text-yellow-800">
                      {q.category}
                    </Badge>
                    <div>
                      <p className="text-sm">{q.question}</p>
                      {q.context?.whyItMatters && (
                        <p className="text-xs text-muted-foreground mt-1">{q.context.whyItMatters}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Reference Checks */}
        {referenceChecks.length > 0 && (
          <ExpandableSection title={`Reference Checks (${referenceChecks.length})`}>
            <div className="space-y-2 mt-2">
              {referenceChecks.map((rc: {
                id: string;
                targetType: string;
                priority: string;
                targetProfile: { description: string; howToFind: string };
                questions: { question: string; whatToLookFor: string }[];
                rationale: string;
              }, i: number) => (
                <div key={i} className="p-3 border rounded bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      rc.priority === "CRITICAL" ? "bg-red-100 text-red-800" :
                      rc.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    )}>
                      {rc.priority}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {rc.targetType?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{rc.targetProfile?.description}</p>
                  {rc.targetProfile?.howToFind && (
                    <p className="text-xs text-muted-foreground mt-1">
                      📍 Comment trouver: {rc.targetProfile.howToFind}
                    </p>
                  )}
                  {rc.questions && rc.questions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {rc.questions.slice(0, 2).map((q: { question: string }, j: number) => (
                        <p key={j} className="text-xs text-muted-foreground">• {q.question}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Negotiation Points */}
        {negotiationPoints.length > 0 && questionLimit !== Infinity ? (
          <ProTeaserSection
            title="Points de négociation"
            description={`${negotiationPoints.length} leviers de négociation identifiés`}
            icon={Lightbulb}
          />
        ) : negotiationPoints.length > 0 && (
          <ExpandableSection title={`Points de négociation (${negotiationPoints.length})`}>
            <div className="space-y-2 mt-2">
              {negotiationPoints.map((n: {
                id: string;
                priority: string;
                category: string;
                point: string;
                leverage: { argument: string; evidence: string; sourceAgent: string };
                suggestedApproach: string;
                fallbackPosition: string;
                estimatedImpact?: { description: string; valueRange: string };
              }, i: number) => (
                <div key={i} className="p-3 border rounded bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      n.priority === "HIGH_LEVERAGE" ? "bg-green-100 text-green-800" :
                      n.priority === "MEDIUM_LEVERAGE" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {n.priority?.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{n.category}</Badge>
                  </div>
                  <p className="text-sm font-medium">{n.point}</p>
                  {n.leverage && (
                    <div className="mt-2 p-2 rounded bg-muted text-xs">
                      <p><span className="font-medium">Argument:</span> {n.leverage.argument}</p>
                      {n.leverage.evidence && (
                        <p className="mt-1"><span className="font-medium">Preuve:</span> {n.leverage.evidence}</p>
                      )}
                    </div>
                  )}
                  {n.suggestedApproach && (
                    <p className="text-xs text-blue-600 mt-2">💡 Approche: {n.suggestedApproach}</p>
                  )}
                  {n.estimatedImpact && (
                    <p className="text-xs text-green-600 mt-1">💰 Impact: {n.estimatedImpact.valueRange}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Dealbreakers */}
        {dealbreakers.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm font-medium text-red-800 mb-2">Dealbreakers identifiés ({dealbreakers.length})</p>
            <div className="space-y-2">
              {dealbreakers.map((d: {
                id: string;
                severity: string;
                condition: string;
                description: string;
                resolvable: boolean;
                resolutionPath?: string;
                riskIfIgnored: string;
              }, i: number) => (
                <div key={i} className="p-2 rounded bg-white border border-red-100">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      d.severity === "ABSOLUTE" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"
                    )}>
                      {d.severity}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-red-800 mt-1">{d.description}</p>
                  {d.condition && (
                    <p className="text-xs text-red-600 mt-1">Condition: {d.condition}</p>
                  )}
                  {d.resolvable && d.resolutionPath && (
                    <p className="text-xs text-orange-600 mt-1">✓ Résolvable: {d.resolutionPath}</p>
                  )}
                  {d.riskIfIgnored && (
                    <p className="text-xs text-red-700 mt-1">⚠️ Risque si ignoré: {d.riskIfIgnored}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Due Diligence Checklist */}
        {diligenceChecklist && diligenceChecklist.items && diligenceChecklist.items.length > 0 && (
          <ExpandableSection title={`Checklist DD (${diligenceChecklist.doneItems}/${diligenceChecklist.totalItems})`}>
            <div className="space-y-1 mt-2">
              <div className="flex gap-2 text-xs mb-2">
                <Badge variant="outline" className="bg-green-100 text-green-800">
                  {diligenceChecklist.doneItems} faits
                </Badge>
                <Badge variant="outline" className="bg-red-100 text-red-800">
                  {diligenceChecklist.blockedItems} bloqués
                </Badge>
                <Badge variant="outline" className="bg-orange-100 text-orange-800">
                  {diligenceChecklist.criticalPathItems} critique
                </Badge>
              </div>
              {diligenceChecklist.items.slice(0, 10).map((item: {
                id: string;
                category: string;
                item: string;
                status: string;
                criticalPath: boolean;
              }, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted">
                  {item.status === "DONE" ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : item.status === "BLOCKED" ? (
                    <XCircle className="h-3 w-3 text-red-600" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border border-muted-foreground" />
                  )}
                  <span className={cn(
                    item.status === "DONE" && "text-muted-foreground line-through"
                  )}>
                    {item.item}
                  </span>
                  {item.criticalPath && (
                    <Badge variant="outline" className="text-xs bg-red-100 text-red-800">Critical</Badge>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Suggested Timeline */}
        {suggestedTimeline.length > 0 && (
          <ExpandableSection title={`Timeline suggérée (${suggestedTimeline.length} phases)`}>
            <div className="space-y-2 mt-2">
              {suggestedTimeline.map((phase: {
                phase: string;
                duration: string;
                activities: string[];
                deliverables: string[];
              }, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{phase.phase}</span>
                    <Badge variant="secondary" className="text-xs">{phase.duration}</Badge>
                  </div>
                  {phase.activities && phase.activities.length > 0 && (
                    <div className="mt-1">
                      <span className="text-xs text-muted-foreground">Activités: </span>
                      <span className="text-xs">{phase.activities.join(", ")}</span>
                    </div>
                  )}
                  {phase.deliverables && phase.deliverables.length > 0 && (
                    <div className="mt-1">
                      <span className="text-xs text-muted-foreground">Livrables: </span>
                      <span className="text-xs text-blue-600">{phase.deliverables.join(", ")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Key Insights & Negotiation */}
        {narrative && (narrative.keyInsights?.length > 0 || narrative.forNegotiation?.length > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            {narrative.keyInsights?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Insights clés</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.keyInsights.slice(0, 3).map((insight: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-500">•</span> {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrative.forNegotiation?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-600 mb-1">Pour négocier</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {narrative.forNegotiation.slice(0, 3).map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-green-500">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Main Tier 1 Results Component
export function Tier1Results({ results, subscriptionPlan = "FREE" }: Tier1ResultsProps) {
  // State for tracking which agent's trace panel is open
  const [openTraceAgent, setOpenTraceAgent] = useState<string | null>(null);

  // Get display limits based on plan
  const displayLimits = useMemo(() => getDisplayLimits(subscriptionPlan), [subscriptionPlan]);
  const isFree = subscriptionPlan === "FREE";

  const getAgentData = useCallback(<T,>(agentName: string): T | null => {
    const result = results[agentName];
    if (!result?.success || !result.data) return null;
    return result.data as T;
  }, [results]);

  const getReactData = useCallback((agentName: string): ReActMetadata | undefined => {
    const result = results[agentName];
    if (!result?.success || !result._react) return undefined;
    return result._react;
  }, [results]);

  const financialData = getAgentData<FinancialAuditData>("financial-auditor");
  const teamData = getAgentData<TeamInvestigatorData>("team-investigator");
  const competitiveData = getAgentData<CompetitiveIntelData>("competitive-intel");
  const deckData = getAgentData<DeckForensicsData>("deck-forensics");
  const marketData = getAgentData<MarketIntelData>("market-intelligence");
  const techStackData = getAgentData<TechStackDDData>("tech-stack-dd");
  const techOpsData = getAgentData<TechOpsDDData>("tech-ops-dd");
  const legalData = getAgentData<LegalRegulatoryData>("legal-regulatory");
  const capTableData = getAgentData<CapTableAuditData>("cap-table-auditor");
  const gtmData = getAgentData<GTMAnalystData>("gtm-analyst");
  const customerData = getAgentData<CustomerIntelData>("customer-intel");
  const exitData = getAgentData<ExitStrategistData>("exit-strategist");
  const questionData = getAgentData<QuestionMasterData>("question-master");

  // Count agents with ReAct data
  const reactAgentsCount = useMemo(() => {
    return Object.values(results).filter(r => r._react).length;
  }, [results]);

  // Calculate summary scores
  const scores = useMemo(() => {
    const scoreList: { name: string; score: number; icon: React.ReactNode }[] = [];
    if (financialData) scoreList.push({ name: "Financial", score: financialData.score?.value ?? 0, icon: <DollarSign className="h-4 w-4" /> });
    if (teamData) scoreList.push({ name: "Team", score: teamData.score?.value ?? 0, icon: <Users className="h-4 w-4" /> });
    if (competitiveData) scoreList.push({ name: "Competitive", score: competitiveData.score?.value ?? 0, icon: <Target className="h-4 w-4" /> });
    if (marketData) scoreList.push({ name: "Market", score: marketData.score?.value ?? 0, icon: <Globe className="h-4 w-4" /> });
    if (techStackData) scoreList.push({ name: "Tech Stack", score: techStackData.score?.value ?? 0, icon: <Server className="h-4 w-4" /> });
    if (techOpsData) scoreList.push({ name: "Tech Ops", score: techOpsData.score?.value ?? 0, icon: <Shield className="h-4 w-4" /> });
    if (legalData) scoreList.push({ name: "Legal", score: legalData.score?.value ?? 0, icon: <Scale className="h-4 w-4" /> });
    // v2.0 compatible with fallback to v1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (capTableData) scoreList.push({ name: "Cap Table", score: (capTableData as any).score?.value ?? (capTableData as any).capTableScore ?? 0, icon: <PieChart className="h-4 w-4" /> });
    if (gtmData) scoreList.push({ name: "GTM", score: gtmData.score?.value ?? 0, icon: <Rocket className="h-4 w-4" /> });
    if (customerData) scoreList.push({ name: "Customer", score: customerData.score?.value ?? 0, icon: <UserCheck className="h-4 w-4" /> });
    if (exitData) scoreList.push({ name: "Exit", score: exitData.score?.value ?? 0, icon: <TrendingUp className="h-4 w-4" /> });
    return scoreList;
  }, [financialData, teamData, competitiveData, marketData, techStackData, techOpsData, legalData, capTableData, gtmData, customerData, exitData]);

  const avgScore = useMemo(() => {
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  }, [scores]);

  const handleCloseTrace = useCallback(() => {
    setOpenTraceAgent(null);
  }, []);

  // Memoized callbacks for each agent to avoid inline arrow functions
  const traceHandlers = useMemo(() => ({
    "financial-auditor": () => setOpenTraceAgent("financial-auditor"),
    "team-investigator": () => setOpenTraceAgent("team-investigator"),
    "competitive-intel": () => setOpenTraceAgent("competitive-intel"),
    "deck-forensics": () => setOpenTraceAgent("deck-forensics"),
    "market-intelligence": () => setOpenTraceAgent("market-intelligence"),
    "tech-stack-dd": () => setOpenTraceAgent("tech-stack-dd"),
    "tech-ops-dd": () => setOpenTraceAgent("tech-ops-dd"),
    "legal-regulatory": () => setOpenTraceAgent("legal-regulatory"),
    "cap-table-auditor": () => setOpenTraceAgent("cap-table-auditor"),
    "gtm-analyst": () => setOpenTraceAgent("gtm-analyst"),
    "customer-intel": () => setOpenTraceAgent("customer-intel"),
    "exit-strategist": () => setOpenTraceAgent("exit-strategist"),
    "question-master": () => setOpenTraceAgent("question-master"),
  }), []);

  // Get the react data for the currently open panel
  const openReactData = openTraceAgent ? getReactData(openTraceAgent) : undefined;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Synthèse Investigation Tier 1</CardTitle>
              {reactAgentsCount > 0 && (
                <Badge variant="outline" className="bg-primary/10 text-primary">
                  <Brain className="h-3 w-3 mr-1" />
                  {reactAgentsCount} agents ReAct
                </Badge>
              )}
            </div>
            <ScoreBadge score={avgScore} size="lg" />
          </div>
          <CardDescription>
            {scores.length} agents exécutés avec succès
            {reactAgentsCount > 0 && " - Cliquez sur les badges ReAct pour voir les traces"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {scores.map((s, i) => (
              <div key={i} className="flex flex-col items-center p-2 rounded-lg bg-muted">
                <div className={cn(
                  "mb-1",
                  s.score >= 70 ? "text-green-600" :
                  s.score >= 50 ? "text-yellow-600" : "text-red-600"
                )}>
                  {s.icon}
                </div>
                <span className="text-xs text-muted-foreground">{s.name}</span>
                <span className="text-sm font-bold">{s.score}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Results */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="technical">Technique</TabsTrigger>
          <TabsTrigger value="strategic">Stratégique</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {financialData && (
              <FinancialAuditCard
                data={financialData}
                reactData={getReactData("financial-auditor")}
                onShowTrace={traceHandlers["financial-auditor"]}
              />
            )}
            {teamData && (
              <TeamInvestigatorCard
                data={teamData}
                reactData={getReactData("team-investigator")}
                onShowTrace={traceHandlers["team-investigator"]}
              />
            )}
            {competitiveData && (
              <CompetitiveIntelCard
                data={competitiveData}
                reactData={getReactData("competitive-intel")}
                onShowTrace={traceHandlers["competitive-intel"]}
              />
            )}
            {marketData && (
              <MarketIntelCard
                data={marketData}
                reactData={getReactData("market-intelligence")}
                onShowTrace={traceHandlers["market-intelligence"]}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {gtmData && (
              <GTMAnalystCard
                data={gtmData}
                reactData={getReactData("gtm-analyst")}
                onShowTrace={traceHandlers["gtm-analyst"]}
              />
            )}
            {customerData && (
              <CustomerIntelCard
                data={customerData}
                reactData={getReactData("customer-intel")}
                onShowTrace={traceHandlers["customer-intel"]}
              />
            )}
            {capTableData && (
              <CapTableAuditCard
                data={capTableData}
                reactData={getReactData("cap-table-auditor")}
                onShowTrace={traceHandlers["cap-table-auditor"]}
              />
            )}
            {exitData && (
              <ExitStrategistCard
                data={exitData}
                reactData={getReactData("exit-strategist")}
                onShowTrace={traceHandlers["exit-strategist"]}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="technical" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {techStackData && (
              <TechStackDDCard
                data={techStackData}
                reactData={getReactData("tech-stack-dd")}
                onShowTrace={traceHandlers["tech-stack-dd"]}
              />
            )}
            {techOpsData && (
              <TechOpsDDCard
                data={techOpsData}
                reactData={getReactData("tech-ops-dd")}
                onShowTrace={traceHandlers["tech-ops-dd"]}
              />
            )}
            {legalData && (
              <LegalRegulatoryCard
                data={legalData}
                reactData={getReactData("legal-regulatory")}
                onShowTrace={traceHandlers["legal-regulatory"]}
              />
            )}
            {deckData && (
              <DeckForensicsCard
                data={deckData}
                reactData={getReactData("deck-forensics")}
                onShowTrace={traceHandlers["deck-forensics"]}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="strategic" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {questionData && (
              <QuestionMasterCard
                data={questionData}
                reactData={getReactData("question-master")}
                onShowTrace={traceHandlers["question-master"]}
                questionLimit={displayLimits.criticalQuestions}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ReAct Trace Panel */}
      {openTraceAgent && openReactData && (
        <ReActTracePanel
          agentName={openTraceAgent}
          reactData={openReactData}
          onClose={handleCloseTrace}
        />
      )}
    </div>
  );
}
