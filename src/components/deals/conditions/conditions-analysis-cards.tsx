"use client";

import React, { useState, useCallback } from "react";
import {
  ChevronDown, ChevronUp, CheckCircle,
  AlertTriangle, Lightbulb, MessageSquare, Shield, Layers,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getScoreColor, getScoreBarColor, getScoreLabel, getSeverityStyle } from "@/lib/ui-configs";
import { ScoreRing } from "@/components/ui/score-ring";
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
  ValuationFindings,
} from "./types";

// ── Conditions-specific helpers (not duplicating ui-configs) ──

function getVerdictConfig(score: number) {
  if (score >= 80) return { label: "Conditions favorables", color: "text-green-700", accentColor: "bg-emerald-500" };
  if (score >= 60) return { label: "Conditions acceptables", color: "text-blue-700", accentColor: "bg-blue-500" };
  if (score >= 40) return { label: "Conditions a negocier", color: "text-amber-700", accentColor: "bg-amber-500" };
  return { label: "Conditions defavorables", color: "text-red-700", accentColor: "bg-red-500" };
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

/** Compact horizontal bar for dimension scores (pattern from verdict-panel MiniBar) */
function MiniBar({ score }: { score: number }) {
  return (
    <div className="w-16 h-1.5 rounded-full bg-muted/60 overflow-hidden">
      <div
        className={cn("h-full rounded-full", getScoreBarColor(score))}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

// ── Hero Card (replaces VerdictSummary + ScoreCard) ──

export const ConditionsHeroCard = React.memo(function ConditionsHeroCard({
  score,
  breakdown,
  narrative,
  valuation,
  redFlagCount,
  onOpenSimulator,
  onOpenComparator,
}: {
  score: number;
  breakdown: ScoreBreakdownItem[] | null;
  narrative: NarrativeData | null;
  valuation: ValuationFindings | null;
  redFlagCount: number;
  onOpenSimulator: () => void;
  onOpenComparator: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const verdict = getVerdictConfig(score);
  const hasMoreInfo = !!(narrative?.summary || (narrative?.keyInsights && narrative.keyInsights.length > 0));

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {/* Top accent line */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px]", verdict.accentColor)} />

      <div className="p-6">
        {/* Main row: ScoreRing left, details right */}
        <div className="flex items-start gap-6 sm:gap-8">
          {/* Score Ring */}
          <div className="shrink-0">
            <ScoreRing score={score} />
            <p className="text-center mt-2">
              <Badge variant="outline" className="text-[10px] font-medium tracking-wide uppercase">
                {getScoreLabel(score)}
              </Badge>
            </p>
          </div>

          {/* Right column */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Verdict + one-liner */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cn("text-lg font-semibold", verdict.color)}>{verdict.label}</p>
                {narrative?.oneLiner && (
                  <p className="text-sm text-muted-foreground mt-0.5">{narrative.oneLiner}</p>
                )}
              </div>
              {redFlagCount > 0 && (
                <Badge variant="destructive" className="text-xs shrink-0">
                  {redFlagCount} red flag{redFlagCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Dimension breakdown (compact MiniBar rows) */}
            {breakdown && breakdown.length > 0 && (
              <div className="space-y-2">
                {breakdown.map((item) => (
                  <div key={item.criterion} className="flex items-center gap-3 text-[13px]">
                    <span className="w-28 shrink-0 text-foreground/65 font-medium truncate">
                      {item.criterion}
                      <span className="text-[10px] ml-1 text-muted-foreground/50">
                        ({Math.round(item.weight * 100)}%)
                      </span>
                    </span>
                    <MiniBar score={item.score} />
                    <span className={cn("font-bold tabular-nums text-xs", getScoreColor(item.score))}>
                      {item.score}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Valuation quick view */}
            {valuation && valuation.verdict && (
              <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-1">
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
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-5 pt-4 border-t border-border/40">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onOpenSimulator}>
            Simuler la dilution
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onOpenComparator}>
            Comparer au marche
          </Button>
        </div>

        {/* Collapsible "En savoir plus" (absorbs old InsightsCard narrative content) */}
        {hasMoreInfo && (
          <Collapsible open={showMore} onOpenChange={setShowMore}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                En savoir plus
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                {narrative?.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{narrative.summary}</p>
                )}
                {narrative?.keyInsights && narrative.keyInsights.length > 0 && (
                  <ul className="space-y-1.5">
                    {narrative.keyInsights.map((insight, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1">•</span>
                        <span className="text-muted-foreground">{insight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
});

// ── Negotiation Advice ──

export const NegotiationAdviceCard = React.memo(function NegotiationAdviceCard({
  advice,
  talkingPoints,
  resolutionMap,
  onResolve,
  onUnresolve,
  isResolving = false,
}: {
  advice: NegotiationAdviceItem[];
  talkingPoints?: string[];
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

  if (advice.length === 0 && (!talkingPoints || talkingPoints.length === 0)) return null;

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Conseils de negociation</CardTitle>
          {advice.length > 0 && (
            <Badge variant="outline" className="text-xs">{advice.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Talking points from narrative.forNegotiation */}
        {talkingPoints && talkingPoints.length > 0 && (
          <div className="space-y-1.5 pb-3 border-b mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Arguments cles</p>
            {talkingPoints.map((point, idx) => (
              <p key={idx} className="text-sm text-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5 shrink-0">•</span>
                {point}
              </p>
            ))}
          </div>
        )}

        {/* Advice items with resolution tracking */}
        {advice.map((item, idx) => {
          const key = conditionsAlertKey("negotiation", item.point);
          const resolution = resolutionMap?.[key];
          const style = getSeverityStyle(item.priority);
          return (
            <div
              key={key}
              className={cn("rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors", resolution && "opacity-60")}
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <Badge variant="outline" className={cn("shrink-0 text-xs", style.badge)}>
                    {style.label}
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
          const style = getSeverityStyle(flag.severity);
          return (
            <div key={flag.id} className={cn("rounded-lg border border-red-200/50 p-3 space-y-1.5", resolution && "opacity-60")}>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className={cn("shrink-0 text-xs", style.badge)}>
                  {style.label}
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
    case "HIGH": return "Élevé";
    case "MEDIUM": return "Modéré";
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
              <span className={cn("text-sm font-semibold", getScoreColor(ta.score))}>
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

// ── Cross-Reference Insights (collapsible, replaces old InsightsCard) ──

export const CrossReferenceInsightsCard = React.memo(function CrossReferenceInsightsCard({
  insights,
}: {
  insights: Array<{ insight: string; sourceAgent: string; impact: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (insights.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                <CardTitle className="text-base">Cross-references IA</CardTitle>
                <Badge variant="outline" className="text-xs">{insights.length}</Badge>
              </div>
              {isOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {insights.map((item, idx) => (
              <div key={idx} className="text-sm rounded bg-muted/50 p-2">
                <p className="text-muted-foreground">{item.insight}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Source : {item.sourceAgent} — Impact : {item.impact}
                </p>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
          const style = getSeverityStyle(q.priority);
          return (
            <div
              key={q.id ?? idx}
              className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <Badge variant="outline" className={cn("shrink-0 text-xs", style.badge)}>
                    {style.label}
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
