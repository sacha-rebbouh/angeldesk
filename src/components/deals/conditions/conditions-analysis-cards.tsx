"use client";

import React, { useState, useCallback } from "react";
import {
  Brain, ChevronDown, ChevronUp, CheckCircle,
  AlertTriangle, Lightbulb, MessageSquare, Shield, Layers,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { conditionsAlertKey } from "@/services/alert-resolution/alert-keys";
import { ResolutionBadge } from "@/components/deals/resolution-badge";
import { ResolutionDialog } from "@/components/deals/resolution-dialog";
import type { AlertResolution, CreateResolutionInput } from "@/hooks/use-resolutions";
import type {
  ScoreBreakdownItem,
  NegotiationAdviceItem,
  RedFlagItem,
  NarrativeData,
  ConditionsFindings,
  QuestionItem,
} from "./types";

// ── Color helpers ──

function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-800 border-red-200";
    case "high": return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default: return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "critical": return "Critique";
    case "high": return "Haute";
    case "medium": return "Moyenne";
    default: return "Basse";
  }
}

// ── Score Card ──

export const ConditionsScoreCard = React.memo(function ConditionsScoreCard({
  score,
  breakdown,
  narrative,
}: {
  score: number;
  breakdown: ScoreBreakdownItem[] | null;
  narrative: NarrativeData | null;
}) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Analyse IA des conditions</CardTitle>
          </div>
          <span className={cn("text-3xl font-bold", getScoreTextColor(score))}>
            {score}<span className="text-sm font-normal text-muted-foreground">/100</span>
          </span>
        </div>
        {narrative?.oneLiner && (
          <CardDescription className="mt-1">{narrative.oneLiner}</CardDescription>
        )}
      </CardHeader>
      {breakdown && breakdown.length > 0 && (
        <CardContent className="pt-0 space-y-3">
          {breakdown.map((item) => (
            <div key={item.criterion} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.criterion}
                  <span className="text-xs ml-1 text-muted-foreground/60">({Math.round(item.weight * 100)}%)</span>
                </span>
                <span className={cn("font-semibold", getScoreTextColor(item.score))}>
                  {item.score}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getScoreBarColor(item.score))}
                  style={{ width: `${Math.min(item.score, 100)}%` }}
                />
              </div>
              {item.justification && (
                <p className="text-xs text-muted-foreground/80 leading-relaxed">{item.justification}</p>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
});

// ── Negotiation Advice ──

export const NegotiationAdviceCard = React.memo(function NegotiationAdviceCard({
  advice,
  resolutionMap,
  onResolve,
  onUnresolve,
  isResolving = false,
}: {
  advice: NegotiationAdviceItem[];
  resolutionMap?: Record<string, AlertResolution>;
  onResolve?: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve?: (alertKey: string) => Promise<unknown>;
  isResolving?: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [dialogState, setDialogState] = useState<{
    alertKey: string; title: string; severity: string; description?: string;
  } | null>(null);

  const handleResolve = useCallback(async (
    alertKey: string, title: string, severity: string, status: "RESOLVED" | "ACCEPTED", justification: string,
  ) => {
    if (!onResolve) return;
    await onResolve({ alertKey, alertType: "CONDITIONS", status, justification, alertTitle: title, alertSeverity: severity });
  }, [onResolve]);

  if (advice.length === 0) return null;

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Conseils de negociation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {advice.map((item, idx) => {
          const key = conditionsAlertKey("negotiation", item.point);
          const resolution = resolutionMap?.[key];
          return (
            <div
              key={key}
              className={cn("rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors", resolution && "opacity-60")}
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <Badge variant="outline" className={cn("shrink-0 text-xs", getSeverityColor(item.priority))}>
                    {getPriorityLabel(item.priority)}
                  </Badge>
                  <span className={cn("text-sm font-medium", resolution && "line-through")}>{item.point}</span>
                </div>
                {resolution ? (
                  <ResolutionBadge
                    status={resolution.status as "RESOLVED" | "ACCEPTED"}
                    justification={resolution.justification}
                    onRevert={onUnresolve ? () => { onUnresolve(key); } : undefined}
                    compact
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    {onResolve && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDialogState({ alertKey: key, title: item.point, severity: item.priority.toUpperCase(), description: item.suggestedArgument }); }}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Traiter
                      </Button>
                    )}
                    {expandedIdx === idx
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>
              {expandedIdx === idx && !resolution && (
                <div className="mt-2 pl-2 border-l-2 border-primary/20 space-y-1.5">
                  <p className="text-sm text-muted-foreground">{item.suggestedArgument}</p>
                  {item.leverageSource && (
                    <p className="text-xs text-muted-foreground/70">
                      <span className="font-medium">Source :</span> {item.leverageSource}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
    {dialogState && (
      <ResolutionDialog
        open={!!dialogState}
        onOpenChange={(open) => { if (!open) setDialogState(null); }}
        alertTitle={dialogState.title}
        alertSeverity={dialogState.severity}
        alertDescription={dialogState.description}
        onSubmit={(status, justification) =>
          handleResolve(dialogState.alertKey, dialogState.title, dialogState.severity, status, justification)
        }
        isSubmitting={isResolving}
      />
    )}
    </>
  );
});

// ── Red Flags ──

export const RedFlagsCard = React.memo(function RedFlagsCard({
  redFlags,
  resolutionMap,
  onResolve,
  onUnresolve,
  isResolving = false,
}: {
  redFlags: RedFlagItem[];
  resolutionMap?: Record<string, AlertResolution>;
  onResolve?: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve?: (alertKey: string) => Promise<unknown>;
  isResolving?: boolean;
}) {
  const [dialogState, setDialogState] = useState<{
    alertKey: string; title: string; severity: string; description?: string;
  } | null>(null);

  const handleResolve = useCallback(async (
    alertKey: string, title: string, severity: string, status: "RESOLVED" | "ACCEPTED", justification: string,
  ) => {
    if (!onResolve) return;
    await onResolve({ alertKey, alertType: "CONDITIONS", status, justification, alertTitle: title, alertSeverity: severity });
  }, [onResolve]);

  if (redFlags.length === 0) return null;

  return (
    <>
    <Card className="border-red-200/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <CardTitle className="text-base">Red flags conditions</CardTitle>
          <Badge variant="destructive" className="text-xs">{redFlags.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {redFlags.map((flag) => {
          const key = conditionsAlertKey("redFlag", flag.title, flag.category);
          const resolution = resolutionMap?.[key];
          return (
            <div key={flag.id} className={cn("rounded-lg border border-red-200/50 p-3 space-y-1.5", resolution && "opacity-60")}>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className={cn("shrink-0 text-xs", getSeverityColor(flag.severity))}>
                  {getPriorityLabel(flag.severity)}
                </Badge>
                <span className={cn("text-sm font-medium flex-1", resolution && "line-through")}>{flag.title}</span>
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
                    onClick={() => setDialogState({ alertKey: key, title: flag.title, severity: flag.severity.toUpperCase(), description: flag.description })}
                  >
                    <CheckCircle className="h-3 w-3" />
                    Traiter
                  </Button>
                ) : null}
              </div>
              {!resolution && (
                <>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  {flag.evidence && (
                    <p className="text-xs text-muted-foreground/70">
                      <span className="font-medium">Preuve :</span> {flag.evidence}
                    </p>
                  )}
                  {flag.question && (
                    <div className="flex items-start gap-1.5 mt-1 bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-200">{flag.question}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
    {dialogState && (
      <ResolutionDialog
        open={!!dialogState}
        onOpenChange={(open) => { if (!open) setDialogState(null); }}
        alertTitle={dialogState.title}
        alertSeverity={dialogState.severity}
        alertDescription={dialogState.description}
        onSubmit={(status, justification) =>
          handleResolve(dialogState.alertKey, dialogState.title, dialogState.severity, status, justification)
        }
        isSubmitting={isResolving}
      />
    )}
    </>
  );
});

// ── Structured Assessment ──

function getTriggerRiskColor(level: string): string {
  switch (level) {
    case "HIGH": return "bg-red-100 text-red-800 border-red-200";
    case "MEDIUM": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default: return "bg-green-100 text-green-800 border-green-200";
  }
}

function getTriggerRiskLabel(level: string): string {
  switch (level) {
    case "HIGH": return "Eleve";
    case "MEDIUM": return "Modere";
    default: return "Faible";
  }
}

export const StructuredAssessmentCard = React.memo(function StructuredAssessmentCard({
  assessment,
}: {
  assessment: NonNullable<ConditionsFindings["structuredAssessment"]>;
}) {
  return (
    <Card className="border-indigo-200/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            <CardTitle className="text-base">Analyse multi-tranche</CardTitle>
          </div>
          <Badge variant="outline" className={cn("text-xs", getTriggerRiskColor(assessment.triggerRiskLevel))}>
            Risque triggers : {getTriggerRiskLabel(assessment.triggerRiskLevel)}
          </Badge>
        </div>
        <CardDescription className="mt-1">{assessment.overallStructureVerdict}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {assessment.blendedEffectiveValuation != null && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Valorisation effective blended</p>
            <p className="text-lg font-bold">
              {assessment.blendedEffectiveValuation.toLocaleString("fr-FR")} EUR
            </p>
          </div>
        )}

        {assessment.trancheAssessments.map((ta) => (
          <div key={ta.trancheLabel} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{ta.trancheLabel}</span>
              <span className={cn("text-sm font-semibold", getScoreTextColor(ta.score))}>
                {ta.score}/100
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", getScoreBarColor(ta.score))}
                style={{ width: `${Math.min(ta.score, 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{ta.assessment}</p>
            {ta.risks.length > 0 && (
              <ul className="space-y-1">
                {ta.risks.map((risk, rIdx) => (
                  <li key={rIdx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
                    {risk}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
});

// ── Insights ──

export const InsightsCard = React.memo(function InsightsCard({
  insights,
  narrative,
}: {
  insights: Array<{ insight: string; sourceAgent: string; impact: string }>;
  narrative: NarrativeData | null;
}) {
  const hasInsights = insights.length > 0;
  const hasNarrative = narrative?.keyInsights && narrative.keyInsights.length > 0;
  if (!hasInsights && !hasNarrative) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-500" />
          <CardTitle className="text-base">Insights IA</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">{narrative.summary}</p>
        )}
        {hasNarrative && (
          <ul className="space-y-1.5">
            {narrative!.keyInsights!.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground">{insight}</span>
              </li>
            ))}
          </ul>
        )}
        {hasInsights && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">Cross-references agents :</p>
            {insights.map((item, idx) => (
              <div key={idx} className="text-sm rounded bg-muted/50 p-2">
                <p className="text-muted-foreground">{item.insight}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Source : {item.sourceAgent} — Impact : {item.impact}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ── Verdict Summary (Top of analysis — TL;DR for BA) ──

function getVerdictConfig(score: number): { label: string; color: string; bgColor: string; borderColor: string } {
  if (score >= 80) return { label: "Conditions favorables", color: "text-green-700", bgColor: "bg-green-50 dark:bg-green-950/30", borderColor: "border-green-200 dark:border-green-800" };
  if (score >= 60) return { label: "Conditions acceptables", color: "text-blue-700", bgColor: "bg-blue-50 dark:bg-blue-950/30", borderColor: "border-blue-200 dark:border-blue-800" };
  if (score >= 40) return { label: "Conditions a negocier", color: "text-yellow-700", bgColor: "bg-yellow-50 dark:bg-yellow-950/30", borderColor: "border-yellow-200 dark:border-yellow-800" };
  return { label: "Conditions defavorables", color: "text-red-700", bgColor: "bg-red-50 dark:bg-red-950/30", borderColor: "border-red-200 dark:border-red-800" };
}

function getValuationLabel(verdict: string): { label: string; color: string } {
  switch (verdict) {
    case "UNDERVALUED": return { label: "Sous-evalue", color: "text-green-600" };
    case "FAIR": return { label: "Fair market", color: "text-blue-600" };
    case "AGGRESSIVE": return { label: "Agressif", color: "text-orange-600" };
    case "VERY_AGGRESSIVE": return { label: "Tres agressif", color: "text-red-600" };
    default: return { label: verdict, color: "text-muted-foreground" };
  }
}

export const ConditionsVerdictSummary = React.memo(function ConditionsVerdictSummary({
  score,
  narrative,
  topAdvice,
  valuation,
  redFlagCount,
  onOpenSimulator,
  onOpenComparator,
}: {
  score: number;
  narrative: NarrativeData | null;
  topAdvice: NegotiationAdviceItem[];
  valuation: { assessedValue: number | null; percentileVsDB: number | null; verdict: string; rationale: string; benchmarkUsed: string } | null;
  redFlagCount: number;
  onOpenSimulator: () => void;
  onOpenComparator: () => void;
}) {
  const verdict = getVerdictConfig(score);

  return (
    <Card className={cn("border-2", verdict.borderColor, verdict.bgColor)}>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header: Score + Verdict */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("text-3xl font-bold", verdict.color)}>
              {score}<span className="text-sm font-normal text-muted-foreground">/100</span>
            </div>
            <div>
              <p className={cn("font-semibold", verdict.color)}>{verdict.label}</p>
              {narrative?.oneLiner && (
                <p className="text-sm text-muted-foreground mt-0.5">{narrative.oneLiner}</p>
              )}
            </div>
          </div>
          {redFlagCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {redFlagCount} red flag{redFlagCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Valuation quick view */}
        {valuation && valuation.verdict && (
          <div className="rounded-lg bg-background/60 border p-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Valorisation</span>
              <span className={cn("font-semibold", getValuationLabel(valuation.verdict).color)}>
                {getValuationLabel(valuation.verdict).label}
                {valuation.percentileVsDB != null && (
                  <span className="text-muted-foreground font-normal ml-1.5">
                    (P{valuation.percentileVsDB})
                  </span>
                )}
              </span>
            </div>
            {valuation.rationale && (
              <p className="text-xs text-muted-foreground">{valuation.rationale}</p>
            )}
          </div>
        )}

        {/* Top 3 negotiation priorities */}
        {topAdvice.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Points cles a negocier</p>
            {topAdvice.map((advice, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className={cn("shrink-0 text-[10px] mt-0.5", getSeverityColor(advice.priority))}>
                  {getPriorityLabel(advice.priority)}
                </Badge>
                <span className="text-foreground">{advice.point}</span>
              </div>
            ))}
          </div>
        )}

        {/* forNegotiation talking points */}
        {narrative?.forNegotiation && narrative.forNegotiation.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arguments de negociation</p>
            {narrative.forNegotiation.map((point, idx) => (
              <p key={idx} className="text-sm text-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5 shrink-0">•</span>
                {point}
              </p>
            ))}
          </div>
        )}

        {/* Quick action links */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onOpenSimulator}>
            Simuler la dilution
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onOpenComparator}>
            Comparer au marche
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

// ── Questions to Ask ──

export const ConditionsQuestionsCard = React.memo(function ConditionsQuestionsCard({
  questions,
}: {
  questions: QuestionItem[];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (questions.length === 0) return null;

  return (
    <Card className="border-amber-200/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">Questions a poser au fondateur</CardTitle>
          <Badge variant="outline" className="text-xs border-amber-200 text-amber-700">
            {questions.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {questions.map((q, idx) => {
          const isExpanded = expandedIdx === idx;
          return (
            <div
              key={q.id ?? idx}
              className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <Badge variant="outline" className={cn("shrink-0 text-xs", getSeverityColor(q.priority))}>
                    {getPriorityLabel(q.priority)}
                  </Badge>
                  <span className="text-sm font-medium">{q.question}</span>
                </div>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
              </div>
              {isExpanded && (q.context || q.whatToLookFor) && (
                <div className="mt-2 pl-2 border-l-2 border-amber-200/50 space-y-1.5">
                  {q.context && (
                    <p className="text-sm text-muted-foreground">{q.context}</p>
                  )}
                  {q.whatToLookFor && (
                    <p className="text-xs text-muted-foreground/70">
                      <span className="font-medium">A surveiller :</span> {q.whatToLookFor}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});
