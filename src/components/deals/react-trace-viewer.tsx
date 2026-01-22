"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Brain,
  Lightbulb,
  Play,
  Eye,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Target,
  Clock,
  Zap,
  Search,
  Database,
  Calculator,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import type {
  ReasoningTrace,
  ReasoningStep,
  ThoughtType,
  SelfCritiqueResult,
} from "@/agents/react/types";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";

// ============================================================================
// TYPES
// ============================================================================

interface ReActData {
  reasoningTrace: ReasoningTrace;
  findings: ScoredFinding[];
  confidence: ConfidenceScore;
  expectedVariance?: number;
}

interface ReActTraceViewerProps {
  agentName: string;
  data: ReActData;
  defaultExpanded?: boolean;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ConfidenceBadge({ confidence }: { confidence: ConfidenceScore }) {
  const colors: Record<string, string> = {
    high: "bg-green-100 text-green-800 border-green-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-orange-100 text-orange-800 border-orange-300",
    insufficient: "bg-red-100 text-red-800 border-red-300",
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={cn("font-mono", colors[confidence.level] ?? colors.medium)}>
        {confidence.score}/100
      </Badge>
      <span className="text-xs text-muted-foreground capitalize">
        {confidence.level.replace("_", " ")}
      </span>
    </div>
  );
}

function PercentileBadge({ percentile }: { percentile: number }) {
  const getColor = useCallback((p: number) => {
    if (p >= 75) return "bg-green-100 text-green-800";
    if (p >= 50) return "bg-blue-100 text-blue-800";
    if (p >= 25) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }, []);

  const getIcon = useCallback((p: number) => {
    if (p >= 75) return <TrendingUp className="h-3 w-3" />;
    if (p >= 25) return <Minus className="h-3 w-3" />;
    return <TrendingDown className="h-3 w-3" />;
  }, []);

  return (
    <Badge variant="outline" className={cn("text-xs flex items-center gap-1", getColor(percentile))}>
      {getIcon(percentile)}
      P{percentile}
    </Badge>
  );
}

function ThoughtTypeBadge({ type }: { type: ThoughtType }) {
  const config: Record<ThoughtType, { label: string; color: string; icon: React.ReactNode }> = {
    planning: { label: "Planning", color: "bg-purple-100 text-purple-800", icon: <Target className="h-3 w-3" /> },
    analysis: { label: "Analyse", color: "bg-blue-100 text-blue-800", icon: <Search className="h-3 w-3" /> },
    hypothesis: { label: "Hypothese", color: "bg-cyan-100 text-cyan-800", icon: <Lightbulb className="h-3 w-3" /> },
    evaluation: { label: "Evaluation", color: "bg-amber-100 text-amber-800", icon: <BarChart3 className="h-3 w-3" /> },
    synthesis: { label: "Synthese", color: "bg-green-100 text-green-800", icon: <Zap className="h-3 w-3" /> },
    self_critique: { label: "Critique", color: "bg-orange-100 text-orange-800", icon: <Eye className="h-3 w-3" /> },
  };

  const c = config[type] ?? { label: type, color: "bg-gray-100 text-gray-800", icon: null };

  return (
    <Badge variant="outline" className={cn("text-xs flex items-center gap-1", c.color)}>
      {c.icon}
      {c.label}
    </Badge>
  );
}

function ToolIcon({ toolName }: { toolName: string }) {
  const icons: Record<string, React.ReactNode> = {
    searchBenchmarks: <Database className="h-4 w-4 text-indigo-500" />,
    analyzeSection: <FileText className="h-4 w-4 text-blue-500" />,
    crossReference: <Search className="h-4 w-4 text-purple-500" />,
    calculateMetric: <Calculator className="h-4 w-4 text-green-500" />,
    writeMemory: <Database className="h-4 w-4 text-amber-500" />,
    readMemory: <Database className="h-4 w-4 text-amber-500" />,
  };

  return icons[toolName] ?? <Play className="h-4 w-4 text-gray-500" />;
}

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
  count,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <div className="border rounded-lg">
      <button
        onClick={toggleOpen}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <span className="font-medium text-sm flex items-center gap-2">
          {title} {count !== undefined && <span className="text-muted-foreground">({count})</span>}
          {badge}
        </span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen && <div className="p-3 pt-0 border-t">{children}</div>}
    </div>
  );
}

// ============================================================================
// REASONING STEP COMPONENT
// ============================================================================

function ReasoningStepView({ step, isLast }: { step: ReasoningStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative pl-6 pb-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 w-0.5 h-[calc(100%-12px)] bg-border" />
      )}

      {/* Step number circle */}
      <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
        {step.stepNumber}
      </div>

      <div className="space-y-2">
        {/* Thought */}
        <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">THOUGHT</span>
            <ThoughtTypeBadge type={step.thought.type} />
          </div>
          <p className="text-sm text-purple-900">{step.thought.content}</p>
        </div>

        {/* Action (if present) */}
        {step.action && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <Play className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">ACTION</span>
              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                {step.action.toolName}
              </Badge>
            </div>
            <p className="text-sm text-blue-800 mb-2">{step.action.reasoning}</p>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              {expanded ? "Masquer" : "Voir"} parametres
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {expanded && (
              <pre className="mt-2 p-2 bg-blue-100 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(step.action.parameters, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Observation (if present) */}
        {step.observation && (
          <div
            className={cn(
              "p-3 rounded-lg border",
              step.observation.success
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">OBSERVATION</span>
              {step.observation.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs text-muted-foreground">
                {step.observation.executionTimeMs}ms
              </span>
            </div>
            {step.observation.error ? (
              <p className="text-sm text-red-700">{step.observation.error}</p>
            ) : (
              <div className="text-sm text-green-900">
                {typeof step.observation.result === "object" ? (
                  <pre className="p-2 bg-green-100 rounded text-xs overflow-auto max-h-32">
                    {JSON.stringify(step.observation.result, null, 2)}
                  </pre>
                ) : (
                  String(step.observation.result)
                )}
              </div>
            )}
          </div>
        )}

        {/* Confidence after step */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Target className="h-3 w-3" />
          Confiance apres cette etape: {step.confidenceAfterStep}%
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FINDING CARD COMPONENT
// ============================================================================

function FindingCard({ finding }: { finding: ScoredFinding }) {
  const [expanded, setExpanded] = useState(false);

  const assessmentConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    exceptional: { color: "text-green-600", icon: <TrendingUp className="h-4 w-4" /> },
    above_average: { color: "text-blue-600", icon: <TrendingUp className="h-4 w-4" /> },
    average: { color: "text-gray-600", icon: <Minus className="h-4 w-4" /> },
    below_average: { color: "text-orange-600", icon: <TrendingDown className="h-4 w-4" /> },
    concerning: { color: "text-red-600", icon: <AlertTriangle className="h-4 w-4" /> },
    suspicious: { color: "text-red-700", icon: <AlertTriangle className="h-4 w-4" /> },
  };

  const config = assessmentConfig[finding.assessment] ?? {
    color: "text-gray-600",
    icon: <Info className="h-4 w-4" />,
  };

  return (
    <div className="p-3 border rounded-lg space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1", config.color)}>
            {config.icon}
            <span className="font-medium text-sm">{finding.metric}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {finding.percentile !== undefined && <PercentileBadge percentile={finding.percentile} />}
          <Badge variant="outline" className="text-xs capitalize">
            {finding.assessment.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {/* Value */}
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">
          {typeof finding.value === "number"
            ? finding.value.toLocaleString()
            : String(finding.value)}
        </span>
        {finding.unit && <span className="text-sm text-muted-foreground">{finding.unit}</span>}
      </div>

      {/* Benchmark comparison */}
      {finding.benchmarkData && (
        <div className="p-2 rounded bg-muted">
          <div className="flex items-center gap-1 mb-1">
            <Database className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">Benchmark</span>
            <span className="text-xs text-muted-foreground">({finding.benchmarkData.source})</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">P25:</span>{" "}
              <span className="font-medium">{finding.benchmarkData.p25}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Median:</span>{" "}
              <span className="font-medium">{finding.benchmarkData.median}</span>
            </div>
            <div>
              <span className="text-muted-foreground">P75:</span>{" "}
              <span className="font-medium">{finding.benchmarkData.p75}</span>
            </div>
          </div>
        </div>
      )}

      {/* Confidence */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Confiance:</span>
        <Badge
          variant="outline"
          className={cn(
            finding.confidence.level === "high"
              ? "bg-green-100 text-green-800"
              : finding.confidence.level === "medium"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          )}
        >
          {finding.confidence.score}%
        </Badge>
      </div>

      {/* Evidence (expandable) */}
      {finding.evidence.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            {expanded ? "Masquer" : "Voir"} evidence ({finding.evidence.length})
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1">
              {finding.evidence.map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                  <span>{e.content} <span className="text-muted-foreground/60">({e.source})</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ReActTraceViewer({ agentName, data, defaultExpanded = false }: ReActTraceViewerProps) {
  const { reasoningTrace, findings, confidence, expectedVariance } = data;

  const findingsWithBenchmark = useMemo(
    () => findings.filter((f) => f.benchmarkData),
    [findings]
  );

  const findingsWithoutBenchmark = useMemo(
    () => findings.filter((f) => !f.benchmarkData),
    [findings]
  );

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Trace ReAct</CardTitle>
            <Badge variant="outline" className="text-xs bg-primary/10">
              {reasoningTrace.totalIterations} iterations
            </Badge>
          </div>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <CardDescription className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {(reasoningTrace.executionTimeMs / 1000).toFixed(1)}s
          </span>
          {expectedVariance !== undefined && (
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Variance attendue: ±{expectedVariance} pts
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Confidence Factors */}
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-xs font-medium mb-2">Facteurs de confiance</p>
          <div className="flex flex-wrap gap-1">
            {confidence.factors.map((factor, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {factor.name}: {factor.score}%
              </Badge>
            ))}
          </div>
        </div>

        {/* Findings with benchmarks */}
        {findingsWithBenchmark.length > 0 && (
          <ExpandableSection
            title="Findings avec benchmarks"
            count={findingsWithBenchmark.length}
            defaultOpen={defaultExpanded}
            badge={
              <Badge variant="outline" className="ml-2 text-xs bg-green-100 text-green-800">
                Ancres
              </Badge>
            }
          >
            <div className="space-y-3 mt-3">
              {findingsWithBenchmark.map((finding, i) => (
                <FindingCard key={i} finding={finding} />
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Findings without benchmarks */}
        {findingsWithoutBenchmark.length > 0 && (
          <ExpandableSection
            title="Autres findings"
            count={findingsWithoutBenchmark.length}
          >
            <div className="space-y-3 mt-3">
              {findingsWithoutBenchmark.map((finding, i) => (
                <FindingCard key={i} finding={finding} />
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Reasoning Trace Timeline */}
        <ExpandableSection
          title="Timeline de raisonnement"
          count={reasoningTrace.steps.length}
          defaultOpen={false}
        >
          <div className="mt-4">
            {reasoningTrace.steps.map((step, i) => (
              <ReasoningStepView
                key={step.stepNumber}
                step={step}
                isLast={i === reasoningTrace.steps.length - 1}
              />
            ))}
          </div>
        </ExpandableSection>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// COMPACT VERSION FOR INLINE DISPLAY
// ============================================================================

interface ReActBadgeProps {
  confidence: ConfidenceScore;
  findingsCount: number;
  onClick?: () => void;
}

export function ReActBadge({ confidence, findingsCount, onClick }: ReActBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
    >
      <Brain className="h-3 w-3 text-primary" />
      <span className="text-xs font-medium">ReAct</span>
      <Badge
        variant="outline"
        className={cn(
          "text-xs",
          confidence.level === "high"
            ? "bg-green-100 text-green-800"
            : confidence.level === "medium"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-red-100 text-red-800"
        )}
      >
        {confidence.score}%
      </Badge>
      <span className="text-xs text-muted-foreground">{findingsCount} findings</span>
    </button>
  );
}
