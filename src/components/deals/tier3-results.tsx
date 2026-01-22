"use client";

import { memo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ExpandableSection } from "@/components/shared/expandable-section";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Lightbulb,
  ShieldAlert,
  Scale,
  HelpCircle,
  Target,
  BarChart3,
  Briefcase,
  Compass,
} from "lucide-react";
import type { SectorExpertData } from "@/agents/tier3/types";
import {
  SECTOR_CONFIG,
  MATURITY_CONFIG,
  ASSESSMENT_CONFIG,
  SEVERITY_CONFIG,
  type SectorExpertType,
} from "@/lib/analysis-constants";

// =============================================================================
// HOISTED CONFIGS - Prevent recreation on every render
// =============================================================================

const POTENTIAL_COLORS: Record<string, string> = {
  high: "border-green-200 bg-green-50",
  medium: "border-blue-200 bg-blue-50",
  low: "border-gray-200 bg-gray-50",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  very_high: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  must_ask: "border-red-200 bg-red-50",
  should_ask: "border-yellow-200 bg-yellow-50",
  nice_to_have: "border-gray-200 bg-gray-50",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  technical: <Briefcase className="h-3 w-3" />,
  business: <Target className="h-3 w-3" />,
  regulatory: <Scale className="h-3 w-3" />,
  competitive: <BarChart3 className="h-3 w-3" />,
};

const TIMING_COLORS: Record<string, string> = {
  early: "bg-purple-100 text-purple-800",
  optimal: "bg-green-100 text-green-800",
  late: "bg-orange-100 text-orange-800",
};

// =============================================================================

interface Tier3ResultsProps {
  results: Record<string, {
    agentName: string;
    success: boolean;
    executionTimeMs: number;
    cost: number;
    error?: string;
    data?: unknown;
  }>;
}

const MaturityBadge = memo(function MaturityBadge({ maturity }: { maturity: SectorExpertData["sectorMaturity"] }) {
  const c = MATURITY_CONFIG[maturity as keyof typeof MATURITY_CONFIG] ?? { label: maturity, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-xs", c.color)}>{c.label}</Badge>;
});

// Assessment icons - hoisted as constant
const ASSESSMENT_ICONS: Record<string, React.ReactNode> = {
  exceptional: <TrendingUp className="h-3 w-3" />,
  above_average: <TrendingUp className="h-3 w-3" />,
  average: <BarChart3 className="h-3 w-3" />,
  below_average: <AlertTriangle className="h-3 w-3" />,
  concerning: <XCircle className="h-3 w-3" />,
};

const AssessmentBadge = memo(function AssessmentBadge({ assessment }: { assessment: SectorExpertData["keyMetrics"][0]["assessment"] }) {
  const c = ASSESSMENT_CONFIG[assessment as keyof typeof ASSESSMENT_CONFIG] ?? { label: assessment, color: "text-gray-500" };
  const icon = ASSESSMENT_ICONS[assessment] ?? null;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", c.color)}>
      {icon}
      {c.label}
    </span>
  );
});

const SeverityBadge = memo(function SeverityBadge({ severity }: { severity: "critical" | "major" | "minor" }) {
  const c = SEVERITY_CONFIG[severity] ?? { label: severity, color: "bg-gray-100 text-gray-800" };
  return <Badge variant="outline" className={cn("text-xs", c.color)}>{c.label}</Badge>;
});

const KeyMetricsSection = memo(function KeyMetricsSection({ metrics }: { metrics: SectorExpertData["keyMetrics"] }) {
  return (
    <div className="space-y-3">
      {metrics.map((metric, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{metric.metricName}</span>
            <AssessmentBadge assessment={metric.assessment} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Value: <span className="font-mono">{metric.value ?? "N/A"}</span></span>
            <span>Benchmark: P25={metric.sectorBenchmark.p25}, Median={metric.sectorBenchmark.median}, P75={metric.sectorBenchmark.p75}</span>
          </div>
          <p className="text-xs text-muted-foreground">{metric.sectorContext}</p>
        </div>
      ))}
    </div>
  );
});

const SectorRedFlagsSection = memo(function SectorRedFlagsSection({ redFlags }: { redFlags: SectorExpertData["sectorRedFlags"] }) {
  if (redFlags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <CheckCircle className="h-4 w-4" />
        No sector-specific red flags identified
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {redFlags.map((flag, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-red-50 border border-red-100 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-red-800">{flag.flag}</span>
            <SeverityBadge severity={flag.severity} />
          </div>
          <p className="text-xs text-red-700">{flag.sectorReason}</p>
        </div>
      ))}
    </div>
  );
});

const OpportunitiesSection = memo(function OpportunitiesSection({ opportunities }: { opportunities: SectorExpertData["sectorOpportunities"] }) {
  return (
    <div className="space-y-3">
      {opportunities.map((opp, idx) => (
        <div key={idx} className={cn("p-3 rounded-lg border", POTENTIAL_COLORS[opp.potential])}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">{opp.opportunity}</span>
            <Badge variant="outline" className="text-xs capitalize">{opp.potential} potential</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{opp.reasoning}</p>
        </div>
      ))}
    </div>
  );
});

const RegulatorySection = memo(function RegulatorySection({ regulatory }: { regulatory: SectorExpertData["regulatoryEnvironment"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Complexity:</span>
        <Badge variant="outline" className={cn("text-xs capitalize", COMPLEXITY_COLORS[regulatory.complexity])}>
          {regulatory.complexity.replace("_", " ")}
        </Badge>
      </div>

      {regulatory.keyRegulations.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Key Regulations:</p>
          <div className="flex flex-wrap gap-1">
            {regulatory.keyRegulations.map((reg, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">{reg}</Badge>
            ))}
          </div>
        </div>
      )}

      {regulatory.complianceRisks.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2 text-orange-700">Compliance Risks:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {regulatory.complianceRisks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {regulatory.upcomingChanges.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Upcoming Changes:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {regulatory.upcomingChanges.map((change, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Compass className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

const SectorDynamicsSection = memo(function SectorDynamicsSection({ dynamics }: { dynamics: SectorExpertData["sectorDynamics"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Competition</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.competitionIntensity}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Consolidation</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.consolidationTrend}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Barrier to Entry</p>
          <Badge variant="outline" className="text-xs capitalize">{dynamics.barrierToEntry}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Typical Exit Multiple</p>
          <span className="text-sm font-bold">{dynamics.typicalExitMultiple}x</span>
        </div>
      </div>

      {dynamics.recentExits.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Recent Exits:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {dynamics.recentExits.map((exit, idx) => (
              <li key={idx}>{exit}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

const SectorQuestionsSection = memo(function SectorQuestionsSection({ questions }: { questions: SectorExpertData["sectorQuestions"] }) {
  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={idx} className={cn("p-3 rounded-lg border", PRIORITY_COLORS[q.priority])}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {CATEGORY_ICONS[q.category]}
              <Badge variant="outline" className="text-xs capitalize">{q.category}</Badge>
            </div>
            <Badge variant="outline" className="text-xs capitalize">{q.priority.replace("_", " ")}</Badge>
          </div>
          <p className="font-medium text-sm mb-2">{q.question}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 bg-green-50 rounded">
              <p className="text-green-700 font-medium mb-1">Expected Answer:</p>
              <p className="text-green-600">{q.expectedAnswer}</p>
            </div>
            <div className="p-2 bg-red-50 rounded">
              <p className="text-red-700 font-medium mb-1">Red Flag Answer:</p>
              <p className="text-red-600">{q.redFlagAnswer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

const SectorFitSection = memo(function SectorFitSection({ fit }: { fit: SectorExpertData["sectorFit"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Sector Fit Score</span>
        <ScoreBadge score={fit.score} size="lg" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Timing:</span>
        <Badge variant="outline" className={cn("text-xs capitalize", TIMING_COLORS[fit.sectorTiming])}>
          {fit.sectorTiming}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-green-700 mb-2">Strengths:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {fit.strengths.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-red-700 mb-2">Weaknesses:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {fit.weaknesses.map((w, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
});

export function Tier3Results({ results }: Tier3ResultsProps) {
  // Find the sector expert result (there should only be one)
  const sectorExpertEntry = Object.entries(results).find(([name]) =>
    name.endsWith("-expert") && name !== "document-extractor"
  );

  if (!sectorExpertEntry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            Tier 3 - Sector Analysis
          </CardTitle>
          <CardDescription>No sector expert analysis available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No sector-specific expert was activated for this deal.
            This may be because the deal sector doesn&apos;t match any of our specialized experts.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [agentName, result] = sectorExpertEntry;
  const expertType = agentName as SectorExpertType;
  const config = SECTOR_CONFIG[expertType];

  if (!result.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">{config?.emoji ?? "🔍"}</span>
            {config?.displayName ?? agentName}
          </CardTitle>
          <CardDescription>Sector analysis failed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{result.error ?? "Unknown error"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = result.data as SectorExpertData;

  return (
    <Card className="overflow-hidden">
      {/* Header with gradient */}
      <div className={cn("bg-gradient-to-r p-6 text-white", config?.color ?? "from-gray-500 to-gray-600")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{config?.emoji ?? "🔍"}</span>
            <div>
              <h2 className="text-xl font-bold">{config?.displayName ?? agentName}</h2>
              <p className="text-sm opacity-90">{data.sectorName} Sector Analysis</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Sector Score</p>
            <p className="text-4xl font-bold">{data.sectorScore}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <MaturityBadge maturity={data.sectorMaturity} />
          <span className="text-xs opacity-75">
            Analysis completed in {(result.executionTimeMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      <CardContent className="p-6 space-y-4">
        {/* Executive Summary */}
        <div className="p-4 bg-muted/30 rounded-lg">
          <p className="text-sm leading-relaxed">{data.executiveSummary}</p>
        </div>

        {/* Expandable Sections */}
        <div className="space-y-3">
          <ExpandableSection
            title={`Key Metrics (${data.keyMetrics.length})`}
            icon={<BarChart3 className="h-4 w-4" />}
            defaultOpen={true}
          >
            <KeyMetricsSection metrics={data.keyMetrics} />
          </ExpandableSection>

          <ExpandableSection
            title={`Sector Red Flags (${data.sectorRedFlags.length})`}
            icon={<ShieldAlert className="h-4 w-4" />}
            defaultOpen={data.sectorRedFlags.length > 0}
          >
            <SectorRedFlagsSection redFlags={data.sectorRedFlags} />
          </ExpandableSection>

          <ExpandableSection
            title={`Opportunities (${data.sectorOpportunities.length})`}
            icon={<Lightbulb className="h-4 w-4" />}
          >
            <OpportunitiesSection opportunities={data.sectorOpportunities} />
          </ExpandableSection>

          <ExpandableSection
            title="Regulatory Environment"
            icon={<Scale className="h-4 w-4" />}
          >
            <RegulatorySection regulatory={data.regulatoryEnvironment} />
          </ExpandableSection>

          <ExpandableSection
            title="Sector Dynamics"
            icon={<Target className="h-4 w-4" />}
          >
            <SectorDynamicsSection dynamics={data.sectorDynamics} />
          </ExpandableSection>

          <ExpandableSection
            title={`Due Diligence Questions (${data.sectorQuestions.length})`}
            icon={<HelpCircle className="h-4 w-4" />}
          >
            <SectorQuestionsSection questions={data.sectorQuestions} />
          </ExpandableSection>

          <ExpandableSection
            title="Sector Fit Analysis"
            icon={<CheckCircle className="h-4 w-4" />}
            defaultOpen={true}
          >
            <SectorFitSection fit={data.sectorFit} />
          </ExpandableSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t">
          <span>Cost: ${result.cost.toFixed(4)}</span>
          <span>Execution: {(result.executionTimeMs / 1000).toFixed(1)}s</span>
        </div>
      </CardContent>
    </Card>
  );
}
