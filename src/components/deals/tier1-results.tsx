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
} from "lucide-react";
import type {
  FinancialAuditData,
  TeamInvestigatorData,
  CompetitiveIntelData,
  DeckForensicsData,
  MarketIntelData,
  TechnicalDDData,
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


// Financial Auditor Card
const FinancialAuditCard = memo(function FinancialAuditCard({
  data,
  reactData,
  onShowTrace
}: {
  data: FinancialAuditData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Financial Audit</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.overallScore} size="lg" />
        </div>
        <CardDescription>Métriques vs benchmarks sectoriels</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valuation Analysis */}
        {data.valuationAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Valorisation</span>
              <StatusBadge
                status={data.valuationAnalysis.verdict.replace("_", " ")}
                variant={
                  data.valuationAnalysis.verdict === "fair" ? "success" :
                  data.valuationAnalysis.verdict === "aggressive" ? "warning" : "danger"
                }
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Multiple implicite: {data.valuationAnalysis.impliedMultiple.toFixed(1)}x
              (median: {data.valuationAnalysis.benchmarkMultipleMedian.toFixed(1)}x)
            </div>
          </div>
        )}

        {/* Metrics Validation */}
        <ExpandableSection title={`Metriques (${data.metricsValidation.length})`}>
          <div className="space-y-2 mt-2">
            {data.metricsValidation.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{m.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">P{m.percentile}</span>
                  <StatusBadge
                    status={m.assessment.replace("_", " ")}
                    variant={
                      m.assessment === "exceptional" || m.assessment === "above_average" ? "success" :
                      m.assessment === "average" ? "info" :
                      m.assessment === "suspicious" ? "danger" : "warning"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Red Flags */}
        {data.financialRedFlags.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-2">Red Flags</p>
            <ul className="space-y-1">
              {data.financialRedFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Team Investigator Card
const TeamInvestigatorCard = memo(function TeamInvestigatorCard({
  data,
  reactData,
  onShowTrace
}: {
  data: TeamInvestigatorData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.overallTeamScore} size="lg" />
        </div>
        <CardDescription>Background check et complémentarité</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team Composition */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.teamComposition.technicalStrength}</div>
            <div className="text-xs text-muted-foreground">Tech</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.teamComposition.businessStrength}</div>
            <div className="text-xs text-muted-foreground">Business</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.teamComposition.complementarity}</div>
            <div className="text-xs text-muted-foreground">Complémentarité</div>
          </div>
        </div>

        {/* Founder Profiles */}
        <ExpandableSection title={`Fondateurs (${data.founderProfiles.length})`} defaultOpen>
          <div className="space-y-3 mt-2">
            {data.founderProfiles.map((f, i) => (
              <div key={i} className="p-2 border rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{f.name}</span>
                  <Badge variant="outline">{f.role}</Badge>
                </div>
                <div className="flex gap-2 text-xs">
                  <span>Domain: {f.domainExpertise}/100</span>
                  <span>Startup XP: {f.entrepreneurialExperience}/100</span>
                </div>
                {f.redFlags.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">
                    {f.redFlags.map((rf, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {rf}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Gaps */}
        {data.teamComposition.gaps.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Gaps identifiés</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.teamComposition.gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Competitive Intel Card
const CompetitiveIntelCard = memo(function CompetitiveIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: CompetitiveIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.competitiveScore} size="lg" />
        </div>
        <CardDescription>Paysage concurrentiel et moat</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Moat Assessment */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Moat</span>
            <Badge variant="outline">{data.moatAssessment.type}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-background">
              <div
                className="h-full rounded-full bg-purple-500"
                style={{ width: `${data.moatAssessment.strength}%` }}
              />
            </div>
            <span className="text-sm font-medium">{data.moatAssessment.strength}/100</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{data.moatAssessment.sustainability}</p>
        </div>

        {/* Concentration */}
        <div className="flex items-center justify-between text-sm">
          <span>Concentration du marche</span>
          <StatusBadge
            status={data.marketConcentration}
            variant={
              data.marketConcentration === "fragmented" ? "success" :
              data.marketConcentration === "monopolistic" ? "danger" : "info"
            }
          />
        </div>

        {/* Competitors */}
        <ExpandableSection title={`Concurrents (${data.competitorMap.length})`}>
          <div className="space-y-2 mt-2">
            {data.competitorMap.map((c, i) => (
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
                      c.threat === "high" ? "bg-red-100 text-red-800" :
                      c.threat === "medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    )}
                  >
                    {c.threat}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ExpandableSection>
      </CardContent>
    </Card>
  );
});

// Deck Forensics Card
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
        {/* Narrative Scores */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.narrativeAnalysis.storyStrength}</div>
            <div className="text-xs text-muted-foreground">Story</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.narrativeAnalysis.emotionalAppeal}</div>
            <div className="text-xs text-muted-foreground">Emotion</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-lg font-bold">{data.presentationQuality.professionalismScore}</div>
            <div className="text-xs text-muted-foreground">Pro</div>
          </div>
        </div>

        {/* Claim Verification */}
        <ExpandableSection title={`Claims vérifiés (${data.claimVerification.length})`}>
          <div className="space-y-2 mt-2">
            {data.claimVerification.map((c, i) => (
              <div key={i} className="flex items-start justify-between p-2 border rounded">
                <span className="text-sm flex-1">{c.claim}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-2 shrink-0",
                    c.status === "verified" ? "bg-green-100 text-green-800" :
                    c.status === "contradicted" ? "bg-red-100 text-red-800" :
                    c.status === "exaggerated" ? "bg-orange-100 text-orange-800" :
                    "bg-gray-100 text-gray-800"
                  )}
                >
                  {c.status}
                </Badge>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* Inconsistencies */}
        {data.narrativeAnalysis.inconsistencies.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Incohérences</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.narrativeAnalysis.inconsistencies.map((inc, i) => (
                <li key={i}>{inc}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Market Intelligence Card
const MarketIntelCard = memo(function MarketIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: MarketIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.marketScore} size="lg" />
        </div>
        <CardDescription>Validation TAM / SAM / SOM et timing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Market Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Validation marche</span>
            <StatusBadge
              status={data.marketSizeValidation.discrepancy}
              variant={
                data.marketSizeValidation.discrepancy === "none" ? "success" :
                data.marketSizeValidation.discrepancy === "minor" ? "info" :
                data.marketSizeValidation.discrepancy === "major" ? "danger" : "warning"
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">{data.marketSizeValidation.assessment}</p>
        </div>

        {/* Timing */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Maturité :</span>{" "}
              <span className="font-medium">{data.timingAnalysis.marketMaturity}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Timing :</span>{" "}
              <span className={cn(
                "font-medium",
                data.timingAnalysis.timing === "optimal" ? "text-green-600" :
                data.timingAnalysis.timing === "good" ? "text-blue-600" :
                data.timingAnalysis.timing === "late" ? "text-red-600" : "text-orange-600"
              )}>
                {data.timingAnalysis.timing}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{data.timingAnalysis.windowOfOpportunity}</p>
        </div>

        {/* Trends */}
        <ExpandableSection title={`Tendances (${data.marketTrends.length})`}>
          <div className="space-y-2 mt-2">
            {data.marketTrends.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{t.trend}</span>
                <Badge variant="outline" className={cn(
                  t.direction === "positive" ? "bg-green-100 text-green-800" :
                  t.direction === "negative" ? "bg-red-100 text-red-800" :
                  "bg-gray-100 text-gray-800"
                )}>
                  {t.direction}
                </Badge>
              </div>
            ))}
          </div>
        </ExpandableSection>
      </CardContent>
    </Card>
  );
});

// Technical DD Card
const TechnicalDDCard = memo(function TechnicalDDCard({
  data,
  reactData,
  onShowTrace
}: {
  data: TechnicalDDData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg">Technical DD</CardTitle>
            {reactData && onShowTrace && (
              <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
            )}
          </div>
          <ScoreBadge score={data.technicalScore} size="lg" />
        </div>
        <CardDescription>Stack, dette technique, risques</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stack */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Tech Stack</span>
            <StatusBadge
              status={data.techStackAssessment.appropriateness}
              variant={
                data.techStackAssessment.appropriateness === "excellent" ? "success" :
                data.techStackAssessment.appropriateness === "good" ? "success" :
                data.techStackAssessment.appropriateness === "acceptable" ? "info" : "warning"
              }
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {data.techStackAssessment.stack.map((s, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
            ))}
          </div>
        </div>

        {/* Product Maturity */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-xs text-muted-foreground">Maturité</div>
            <div className="font-medium">{data.productMaturity.stage}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-xs text-muted-foreground">Dette tech</div>
            <div className={cn(
              "font-medium",
              data.technicalDebt.estimated === "low" ? "text-green-600" :
              data.technicalDebt.estimated === "critical" ? "text-red-600" :
              data.technicalDebt.estimated === "high" ? "text-orange-600" : "text-yellow-600"
            )}>
              {data.technicalDebt.estimated}
            </div>
          </div>
        </div>

        {/* Risks */}
        {data.technicalRisks.length > 0 && (
          <ExpandableSection title={`Risques techniques (${data.technicalRisks.length})`}>
            <div className="space-y-2 mt-2">
              {data.technicalRisks.map((r, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <span>{r.risk}</span>
                  <Badge variant="outline" className={cn(
                    r.severity === "high" ? "bg-red-100 text-red-800" :
                    r.severity === "medium" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800"
                  )}>
                    {r.severity}
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

// Legal & Regulatory Card
const LegalRegulatoryCard = memo(function LegalRegulatoryCard({
  data,
  reactData,
  onShowTrace
}: {
  data: LegalRegulatoryData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.legalScore} size="lg" />
        </div>
        <CardDescription>Structure juridique et compliance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Structure */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{data.structureAnalysis.entityType}</span>
            <p className="text-xs text-muted-foreground">{data.structureAnalysis.jurisdiction}</p>
          </div>
          <StatusBadge
            status={data.structureAnalysis.appropriateness}
            variant={
              data.structureAnalysis.appropriateness === "appropriate" ? "success" :
              data.structureAnalysis.appropriateness === "concerning" ? "danger" : "warning"
            }
          />
        </div>

        {/* Regulatory Exposure */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Exposition reglementaire</span>
            <Badge variant="outline" className={cn(
              data.regulatoryExposure.riskLevel === "low" ? "bg-green-100 text-green-800" :
              data.regulatoryExposure.riskLevel === "critical" ? "bg-red-100 text-red-800" :
              data.regulatoryExposure.riskLevel === "high" ? "bg-orange-100 text-orange-800" :
              "bg-yellow-100 text-yellow-800"
            )}>
              {data.regulatoryExposure.riskLevel}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Compliance: {data.regulatoryExposure.complianceStatus.replace("_", " ")}
          </div>
        </div>

        {/* Critical Issues */}
        {data.criticalIssues.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-2">Issues critiques</p>
            <ul className="space-y-1">
              {data.criticalIssues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Cap Table Auditor Card
const CapTableAuditCard = memo(function CapTableAuditCard({
  data,
  reactData,
  onShowTrace
}: {
  data: CapTableAuditData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.capTableScore} size="lg" />
        </div>
        <CardDescription>Dilution, terms, investisseurs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ownership Breakdown */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Repartition</span>
          <div className="flex h-4 rounded-full overflow-hidden">
            <div className="bg-blue-500" style={{ width: `${data.ownershipBreakdown.founders}%` }} />
            <div className="bg-green-500" style={{ width: `${data.ownershipBreakdown.employees}%` }} />
            <div className="bg-purple-500" style={{ width: `${data.ownershipBreakdown.investors}%` }} />
            <div className="bg-yellow-500" style={{ width: `${data.ownershipBreakdown.optionPool}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Fondateurs: {data.ownershipBreakdown.founders}%</span>
            <span>Investisseurs: {data.ownershipBreakdown.investors}%</span>
            <span>Pool: {data.ownershipBreakdown.optionPool}%</span>
          </div>
        </div>

        {/* Dilution */}
        <div className="flex items-center justify-between text-sm">
          <span>Dilution fondateurs</span>
          <StatusBadge
            status={data.founderDilution.concern}
            variant={
              data.founderDilution.concern === "none" ? "success" :
              data.founderDilution.concern === "significant" ? "danger" : "warning"
            }
          />
        </div>

        {/* Round Terms */}
        {data.roundTerms.concerns.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Concerns sur les terms</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.roundTerms.concerns.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {data.structuralRedFlags.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-1">Red Flags</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.structuralRedFlags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// GTM Analyst Card
const GTMAnalystCard = memo(function GTMAnalystCard({
  data,
  reactData,
  onShowTrace
}: {
  data: GTMAnalystData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.gtmScore} size="lg" />
        </div>
        <CardDescription>Go-to-market et efficacité commerciale</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Approche</span>
            <Badge variant="outline">{data.strategyAssessment.approach.replace("_", " ")}</Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.strategyAssessment.channels.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
            ))}
          </div>
        </div>

        {/* Growth */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-xs text-muted-foreground">Croissance</div>
            <div className="text-lg font-bold">{data.growthPotential.currentGrowthRate}%</div>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <div className="text-xs text-muted-foreground">Durabilité</div>
            <div className="text-lg font-bold">{data.growthPotential.sustainabilityScore}/100</div>
          </div>
        </div>

        {/* Risks */}
        {data.gtmRisks.length > 0 && (
          <ExpandableSection title={`Risques GTM (${data.gtmRisks.length})`}>
            <ul className="space-y-1 mt-2">
              {data.gtmRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </ExpandableSection>
        )}
      </CardContent>
    </Card>
  );
});

// Customer Intel Card
const CustomerIntelCard = memo(function CustomerIntelCard({
  data,
  reactData,
  onShowTrace
}: {
  data: CustomerIntelData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.customerScore} size="lg" />
        </div>
        <CardDescription>Base clients et PMF signals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PMF */}
        <div className="p-3 rounded-lg bg-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Product-Market Fit</span>
            <Badge variant="outline" className={cn(
              data.productMarketFit.strength === "strong" ? "bg-green-100 text-green-800" :
              data.productMarketFit.strength === "moderate" ? "bg-blue-100 text-blue-800" :
              data.productMarketFit.strength === "weak" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            )}>
              {data.productMarketFit.strength}
            </Badge>
          </div>
          {data.productMarketFit.signals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.productMarketFit.signals.slice(0, 3).map((s, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Retention */}
        {data.retentionMetrics.netRevenueRetention && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground">NRR</div>
              <div className={cn(
                "text-lg font-bold",
                (data.retentionMetrics.netRevenueRetention ?? 0) >= 100 ? "text-green-600" : "text-orange-600"
              )}>
                {data.retentionMetrics.netRevenueRetention}%
              </div>
            </div>
            {data.retentionMetrics.churnRate && (
              <div className="p-2 rounded-lg bg-muted">
                <div className="text-xs text-muted-foreground">Churn</div>
                <div className={cn(
                  "text-lg font-bold",
                  data.retentionMetrics.churnRate <= 5 ? "text-green-600" : "text-orange-600"
                )}>
                  {data.retentionMetrics.churnRate}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notable Customers */}
        {data.customerProfile.notableCustomers.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1">Clients notables</p>
            <div className="flex flex-wrap gap-1">
              {data.customerProfile.notableCustomers.map((c, i) => (
                <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Exit Strategist Card
const ExitStrategistCard = memo(function ExitStrategistCard({
  data,
  reactData,
  onShowTrace
}: {
  data: ExitStrategistData;
  reactData?: ReActMetadata;
  onShowTrace?: () => void;
}) {
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
          <ScoreBadge score={data.exitScore} size="lg" />
        </div>
        <CardDescription>Scénarios de sortie et ROI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Exit Scenarios */}
        <div className="space-y-2">
          {data.exitScenarios.slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2 border rounded">
              <div>
                <span className="text-sm font-medium">{s.scenario.replace("_", " ")}</span>
                <p className="text-xs text-muted-foreground">{s.timeframe}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className={cn(
                  s.probability === "high" ? "bg-green-100 text-green-800" :
                  s.probability === "medium" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                )}>
                  {s.probability}
                </Badge>
                {s.estimatedValue && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(s.estimatedValue / 1000000).toFixed(0)}M
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Strategic Buyers */}
        {data.acquirerAnalysis.strategicBuyers.length > 0 && (
          <ExpandableSection title={`Acquéreurs potentiels (${data.acquirerAnalysis.strategicBuyers.length})`}>
            <div className="flex flex-wrap gap-1 mt-2">
              {data.acquirerAnalysis.strategicBuyers.map((b, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Risks */}
        {data.liquidityRisks.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-orange-600 mb-1">Risques liquidité</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {data.liquidityRisks.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// Question Master Card
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
  const mustAskQuestions = useMemo(
    () => data.founderQuestions.filter(q => q.priority === "must_ask"),
    [data.founderQuestions]
  );

  const visibleQuestions = mustAskQuestions.slice(0, questionLimit);
  const hiddenQuestionsCount = Math.max(0, mustAskQuestions.length - questionLimit);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-violet-600" />
          <CardTitle className="text-lg">Questions Strategiques</CardTitle>
          {reactData && onShowTrace && (
            <ReActIndicator reactData={reactData} onShowTrace={onShowTrace} />
          )}
        </div>
        <CardDescription>Questions killer et points de négociation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Priorities */}
        {data.topPriorities.length > 0 && (
          <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
            <p className="text-sm font-medium text-violet-800 mb-2">Priorités</p>
            <ul className="space-y-1">
              {data.topPriorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-violet-700">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Must Ask Questions - Limited for FREE */}
        <ExpandableSection title={`Questions essentielles (${mustAskQuestions.length})`} defaultOpen>
          <div className="space-y-2 mt-2">
            {visibleQuestions.map((q, i) => (
              <div key={i} className="p-2 border rounded">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 text-xs">{q.category}</Badge>
                  <span className="text-sm">{q.question}</span>
                </div>
                {q.redFlagTrigger && (
                  <p className="text-xs text-red-600 mt-1">
                    Red flag si: {q.redFlagTrigger}
                  </p>
                )}
              </div>
            ))}
            {/* PRO Teaser for hidden questions */}
            {hiddenQuestionsCount > 0 && (
              <ProTeaserInline hiddenCount={hiddenQuestionsCount} itemLabel="questions" />
            )}
          </div>
        </ExpandableSection>

        {/* Negotiation Points - PRO only shows details */}
        {data.negotiationPoints.length > 0 && questionLimit !== Infinity ? (
          <ProTeaserSection
            title="Points de negociation"
            description={`${data.negotiationPoints.length} points de negociation identifies`}
            icon={Lightbulb}
          />
        ) : data.negotiationPoints.length > 0 && (
          <ExpandableSection title={`Points de négociation (${data.negotiationPoints.length})`}>
            <div className="space-y-2 mt-2">
              {data.negotiationPoints.map((n, i) => (
                <div key={i} className="p-2 border rounded">
                  <p className="text-sm font-medium">{n.point}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Levier: {n.leverage}
                  </p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Dealbreakers */}
        {data.dealbreakers.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-red-600 mb-2">Dealbreakers potentiels</p>
            <ul className="space-y-1">
              {data.dealbreakers.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
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
  const technicalData = getAgentData<TechnicalDDData>("technical-dd");
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
    if (financialData) scoreList.push({ name: "Financial", score: financialData.overallScore, icon: <DollarSign className="h-4 w-4" /> });
    if (teamData) scoreList.push({ name: "Team", score: teamData.overallTeamScore, icon: <Users className="h-4 w-4" /> });
    if (competitiveData) scoreList.push({ name: "Competitive", score: competitiveData.competitiveScore, icon: <Target className="h-4 w-4" /> });
    if (marketData) scoreList.push({ name: "Market", score: marketData.marketScore, icon: <Globe className="h-4 w-4" /> });
    if (technicalData) scoreList.push({ name: "Technical", score: technicalData.technicalScore, icon: <Code className="h-4 w-4" /> });
    if (legalData) scoreList.push({ name: "Legal", score: legalData.legalScore, icon: <Scale className="h-4 w-4" /> });
    if (capTableData) scoreList.push({ name: "Cap Table", score: capTableData.capTableScore, icon: <PieChart className="h-4 w-4" /> });
    if (gtmData) scoreList.push({ name: "GTM", score: gtmData.gtmScore, icon: <Rocket className="h-4 w-4" /> });
    if (customerData) scoreList.push({ name: "Customer", score: customerData.customerScore, icon: <UserCheck className="h-4 w-4" /> });
    if (exitData) scoreList.push({ name: "Exit", score: exitData.exitScore, icon: <TrendingUp className="h-4 w-4" /> });
    return scoreList;
  }, [financialData, teamData, competitiveData, marketData, technicalData, legalData, capTableData, gtmData, customerData, exitData]);

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
    "technical-dd": () => setOpenTraceAgent("technical-dd"),
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
            {technicalData && (
              <TechnicalDDCard
                data={technicalData}
                reactData={getReactData("technical-dd")}
                onShowTrace={traceHandlers["technical-dd"]}
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
