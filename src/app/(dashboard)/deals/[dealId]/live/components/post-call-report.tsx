"use client";

import { useMemo, useState, useCallback, memo } from "react";
import {
  FileText,
  Key,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  ListChecks,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { SEVERITY_CONFIG } from "@/lib/live/ui-constants";
import type { PostCallReport as PostCallReportData } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface PostCallReportProps {
  sessionId: string;
  summary?: PostCallReportData;
}

// =============================================================================
// Constants
// =============================================================================

const OWNER_CONFIG: Record<string, { label: string; className: string }> = {
  ba: {
    label: "Business Angel",
    className:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
  },
  founder: {
    label: "Fondateur",
    className:
      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
  },
  shared: {
    label: "Partagé",
    className:
      "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600",
  },
};

// =============================================================================
// Collapsible Section
// =============================================================================

const CollapsibleSection = memo(function CollapsibleSection({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex items-center gap-2 w-full text-left group"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold tracking-tight group-hover:text-foreground/80">
          {title}
        </span>
        {count != null && count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {count}
          </Badge>
        )}
      </button>
      {isOpen && <div className="pl-6">{children}</div>}
    </div>
  );
});

// =============================================================================
// Sub-sections
// =============================================================================

const ExecutiveSummary = memo(function ExecutiveSummary({
  text,
}: {
  text: string;
}) {
  return (
    <CollapsibleSection title="Résumé" icon={FileText} defaultOpen>
      <p className="text-sm leading-relaxed text-foreground/80">{text}</p>
    </CollapsibleSection>
  );
});

const KeyPoints = memo(function KeyPoints({
  points,
}: {
  points: PostCallReportData["keyPoints"];
}) {
  if (points.length === 0) return null;
  return (
    <CollapsibleSection
      title="Points clés"
      icon={Key}
      count={points.length}
      defaultOpen
    >
      <div className="space-y-3">
        {points.map((point, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/60 bg-card p-3 space-y-1.5"
          >
            <h4 className="text-sm font-medium">{point.topic ?? "Point"}</h4>
            <p className="text-sm text-muted-foreground">{point.summary ?? ""}</p>
            {Array.isArray(point.speakerQuotes) && point.speakerQuotes.length > 0 && (
              <div className="space-y-1 mt-1">
                {point.speakerQuotes.map((quote, qi) => (
                  <div
                    key={qi}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="italic">&quot;{quote}&quot;</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
});

const NewInformation = memo(function NewInformation({
  facts,
}: {
  facts: PostCallReportData["newInformation"];
}) {
  if (facts.length === 0) return null;
  return (
    <CollapsibleSection
      title="Nouvelles informations"
      icon={Lightbulb}
      count={facts.length}
      defaultOpen
    >
      <div className="space-y-2">
        {facts.map((fact, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3"
          >
            <Zap className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm">{fact.fact}</p>
              <p className="text-xs text-muted-foreground">
                Impact : {fact.impact}
              </p>
              {Array.isArray(fact.agentsAffected) && fact.agentsAffected.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-1">
                  {fact.agentsAffected.map((agent) => (
                    <Badge
                      key={agent}
                      variant="outline"
                      className="text-[10px] px-1.5"
                    >
                      {agent}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
});

const Contradictions = memo(function Contradictions({
  items,
}: {
  items: PostCallReportData["contradictions"];
}) {
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      title="Contradictions"
      icon={AlertTriangle}
      count={items.length}
      defaultOpen
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim (deck)</TableHead>
              <TableHead>Claim (call)</TableHead>
              <TableHead className="w-24">Sévérité</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => {
              const severity =
                SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.medium;
              return (
                <TableRow key={i}>
                  <TableCell className="text-sm whitespace-normal">
                    {item.claimInDeck}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {item.claimInCall}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={severity.className}>
                      {severity.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </CollapsibleSection>
  );
});

const QuestionsAsked = memo(function QuestionsAsked({
  items,
}: {
  items: PostCallReportData["questionsAsked"];
}) {
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      title="Questions posées"
      icon={HelpCircle}
      count={items.length}
    >
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/60 bg-card p-3 space-y-1"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{item.question}</p>
              {item.wasFromCoaching && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
                >
                  via coaching
                </Badge>
              )}
            </div>
            {item.answer && (
              <p className="text-sm text-muted-foreground">{item.answer}</p>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
});

const RemainingQuestions = memo(function RemainingQuestions({
  items,
}: {
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      title="Questions restantes"
      icon={HelpCircle}
      count={items.length}
    >
      <ul className="space-y-1.5">
        {items.map((q, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-foreground/80"
          >
            <span className="text-muted-foreground mt-0.5 shrink-0">
              {i + 1}.
            </span>
            {typeof q === "string" ? q : (q as Record<string, unknown>).question as string ?? JSON.stringify(q)}
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
});

const ActionItems = memo(function ActionItems({
  items,
}: {
  items: PostCallReportData["actionItems"];
}) {
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      title="Actions à suivre"
      icon={ListChecks}
      count={items.length}
    >
      <div className="space-y-2">
        {items.map((item, i) => {
          const ownerConfig =
            OWNER_CONFIG[item.owner] ?? OWNER_CONFIG.shared;
          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3"
            >
              <ListChecks className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm">{item.description}</p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={ownerConfig.className}
                  >
                    {ownerConfig.label}
                  </Badge>
                  {item.deadline && (
                    <span className="text-xs text-muted-foreground">
                      Échéance : {item.deadline}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
});

const SessionStats = memo(function SessionStats({
  stats,
}: {
  stats: PostCallReportData["sessionStats"];
}) {
  // stats.duration is already in minutes — do NOT divide by 60
  const durationMin = useMemo(
    () => Math.round(stats.duration),
    [stats.duration]
  );
  const topicsChecklist = stats.topicsChecklist ?? { total: 0, covered: 0 };
  const coveragePct = useMemo(
    () =>
      topicsChecklist.total > 0
        ? Math.round(
            (topicsChecklist.covered / topicsChecklist.total) * 100
          )
        : 0,
    [topicsChecklist]
  );

  return (
    <CollapsibleSection title="Statistiques" icon={BarChart3}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock label="Durée" value={`${durationMin} min`} />
        <StatBlock
          label="Interventions"
          value={String(stats.totalUtterances)}
        />
        <StatBlock
          label="Cards coaching"
          value={`${stats.coachingCardsAddressed}/${stats.coachingCardsGenerated}`}
        />
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Couverture topics
          </span>
          <div className="flex items-center gap-2">
            <Progress value={coveragePct} className="h-1.5 flex-1" />
            <span className="text-xs font-medium tabular-nums">
              {coveragePct}%
            </span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
});

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const ConfidenceDelta = memo(function ConfidenceDelta({
  delta,
}: {
  delta: PostCallReportData["confidenceDelta"];
}) {
  const before = delta?.before ?? 0;
  const after = delta?.after ?? 0;
  const diff = after - before;
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  return (
    <CollapsibleSection title="Delta confiance" icon={TrendingUp}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Avant :</span>
          <Badge variant="outline" className="tabular-nums">
            {before}
          </Badge>
        </div>
        <span className="text-muted-foreground">→</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Après :</span>
          <Badge variant="outline" className="tabular-nums">
            {after}
          </Badge>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums",
            isPositive &&
              "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
            !isPositive &&
              !isNeutral &&
              "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
            isNeutral &&
              "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
          )}
        >
          {isPositive ? "+" : ""}
          {diff}
        </Badge>
      </div>
      {delta.reason && (
        <p className="text-xs text-muted-foreground mt-2">{delta.reason}</p>
      )}
    </CollapsibleSection>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export default memo(function PostCallReport({
  sessionId,
  summary,
}: PostCallReportProps) {
  // Processing state — no summary yet
  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rapport post-call
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">
              Génération du rapport en cours...
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              L&apos;analyse de la transcription et la synthèse sont en cours de
              traitement.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rapport post-call
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Executive Summary */}
          {summary.executiveSummary && (
            <ExecutiveSummary text={summary.executiveSummary} />
          )}

          {/* Key Points */}
          <KeyPoints points={Array.isArray(summary.keyPoints) ? summary.keyPoints : []} />

          {/* New Information */}
          <NewInformation facts={Array.isArray(summary.newInformation) ? summary.newInformation : []} />

          {/* Contradictions */}
          <Contradictions items={Array.isArray(summary.contradictions) ? summary.contradictions : []} />

          {/* Questions Asked */}
          <QuestionsAsked items={Array.isArray(summary.questionsAsked) ? summary.questionsAsked : []} />

          {/* Remaining Questions */}
          <RemainingQuestions items={Array.isArray(summary.remainingQuestions) ? summary.remainingQuestions : []} />

          {/* Action Items */}
          <ActionItems items={Array.isArray(summary.actionItems) ? summary.actionItems : []} />

          {/* Session Stats */}
          {summary.sessionStats && <SessionStats stats={summary.sessionStats} />}

          {/* Confidence Delta */}
          {summary.confidenceDelta && <ConfidenceDelta delta={summary.confidenceDelta} />}
        </div>
      </CardContent>
    </Card>
  );
});
