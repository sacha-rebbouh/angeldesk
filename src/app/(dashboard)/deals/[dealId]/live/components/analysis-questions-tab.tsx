"use client";

import { useMemo, memo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Tag, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query-keys";
import type { DealContext } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface AnalysisQuestionsTabProps {
  dealId: string;
}

interface QuestionItem {
  question: string;
  priority: "high" | "medium" | "low";
  category: string;
  context: string;
}

interface ContextResponse {
  data: DealContext;
}

// =============================================================================
// Constants
// =============================================================================

const PRIORITY_CONFIG: Record<
  string,
  { label: string; className: string; sortOrder: number }
> = {
  high: {
    label: "Élevée",
    className:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
    sortOrder: 0,
  },
  medium: {
    label: "Moyenne",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
    sortOrder: 1,
  },
  low: {
    label: "Basse",
    className:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
    sortOrder: 2,
  },
};

// =============================================================================
// API
// =============================================================================

async function fetchDealContext(dealId: string): Promise<ContextResponse> {
  const res = await fetch(`/api/coaching/context?dealId=${dealId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de charger le contexte");
  }
  return res.json();
}

// =============================================================================
// Sub-components
// =============================================================================

const QuestionCard = memo(function QuestionCard({
  question,
}: {
  question: QuestionItem;
}) {
  const priorityConfig =
    PRIORITY_CONFIG[question.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3">
      <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm leading-snug">{question.question}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={priorityConfig.className}>
            {priorityConfig.label}
          </Badge>
          <Badge
            variant="outline"
            className="text-muted-foreground border-muted"
          >
            <Tag className="h-3 w-3 mr-1" />
            {question.category}
          </Badge>
        </div>
        {question.context && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {question.context}
          </p>
        )}
      </div>
    </div>
  );
});

const CategorySection = memo(function CategorySection({
  category,
  questions,
  defaultOpen,
}: {
  category: string;
  questions: QuestionItem[];
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const sortedQuestions = useMemo(
    () =>
      [...questions].sort(
        (a, b) =>
          (PRIORITY_CONFIG[a.priority]?.sortOrder ?? 1) -
          (PRIORITY_CONFIG[b.priority]?.sortOrder ?? 1)
      ),
    [questions]
  );

  const highCount = useMemo(
    () => questions.filter((q) => q.priority === "high").length,
    [questions]
  );

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
        <h3 className="text-sm font-semibold tracking-tight group-hover:text-foreground/80">
          {category}
        </h3>
        <Badge variant="secondary" className="text-[10px] px-1.5">
          {questions.length}
        </Badge>
        {highCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700"
          >
            {highCount} prioritaire{highCount > 1 ? "s" : ""}
          </Badge>
        )}
      </button>
      {isOpen && (
        <div className="space-y-2 pl-6">
          {sortedQuestions.map((q, i) => (
            <QuestionCard key={i} question={q} />
          ))}
        </div>
      )}
    </div>
  );
});

function QuestionsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2 pl-6">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function AnalysisQuestionsTab({
  dealId,
}: AnalysisQuestionsTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.live.context(dealId),
    queryFn: () => fetchDealContext(dealId),
    staleTime: 5 * 60_000,
  });

  const questions = data?.data?.questionsToAsk ?? [];

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, QuestionItem[]> = {};
    for (const q of questions) {
      const cat = q.category || "Autre";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(q);
    }
    // Sort categories: those with high-priority questions first
    const entries = Object.entries(groups).sort((a, b) => {
      const aHigh = a[1].filter((q) => q.priority === "high").length;
      const bHigh = b[1].filter((q) => q.priority === "high").length;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return b[1].length - a[1].length;
    });
    return entries;
  }, [questions]);

  // --- Loading ---
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Questions d&apos;analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionsLoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  // --- Error ---
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Questions d&apos;analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Impossible de charger les questions
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Empty ---
  if (groupedByCategory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Questions d&apos;analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-2xl bg-muted/50 p-4">
              <HelpCircle className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="mt-4 text-sm font-medium">
              Aucune question d&apos;analyse disponible
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Lancez une analyse complète pour obtenir des questions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Content ---
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          Questions d&apos;analyse
          <Badge variant="secondary" className="ml-1">
            {questions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {groupedByCategory.map(([category, categoryQuestions], i) => (
            <CategorySection
              key={category}
              category={category}
              questions={categoryQuestions}
              defaultOpen={i < 3}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
