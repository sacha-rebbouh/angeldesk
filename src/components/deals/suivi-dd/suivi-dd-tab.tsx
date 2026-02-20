"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Save, Play, ChevronDown, ChevronUp, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FounderResponseInput } from "./founder-response-input";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import { queryKeys } from "@/lib/query-keys";
import type { AlertResolution, CreateResolutionInput } from "@/hooks/use-resolutions";
import type { AgentQuestion, QuestionResponse } from "@/components/deals/founder-responses";
import type { TermsResponse } from "@/components/deals/conditions/types";

type ResponseStatus = "answered" | "not_applicable" | "refused" | "pending";
import { SuiviDDDashboard } from "./suivi-dd-dashboard";
import { SuiviDDFilters, INITIAL_FILTERS, type FilterState } from "./suivi-dd-filters";
import { SuiviDDAlertCard } from "./suivi-dd-alert-card";
import { useUnifiedAlerts } from "./use-unified-alerts";

interface AgentResultFull {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

export interface SuiviDDTabProps {
  dealId: string;
  displayedResult: {
    results: Record<string, AgentResultFull>;
    success: boolean;
  } | null;
  resolutionMap: Record<string, AlertResolution>;
  resolutions: AlertResolution[];
  onResolve: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve: (alertKey: string) => Promise<unknown>;
  isResolving: boolean;
  founderQuestions: AgentQuestion[];
  existingResponses: QuestionResponse[];
  onSaveResponses: (responses: QuestionResponse[], freeNotes: string) => Promise<void>;
  onSubmitAndReanalyze: (responses: QuestionResponse[], freeNotes: string) => Promise<void>;
  isSubmittingResponses: boolean;
  isReanalyzing: boolean;
  currentScore: number;
}

export const SuiviDDTab = memo(function SuiviDDTab({
  dealId,
  displayedResult,
  resolutionMap,
  resolutions,
  onResolve,
  onUnresolve,
  isResolving,
  founderQuestions,
  existingResponses,
  onSaveResponses,
  onSubmitAndReanalyze,
  isSubmittingResponses,
  isReanalyzing,
  currentScore,
}: SuiviDDTabProps) {
  // Fetch conditions data
  const { data: conditionsData } = useQuery<TermsResponse>({
    queryKey: queryKeys.dealTerms.byDeal(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms`);
      if (!res.ok) throw new Error("Failed to fetch terms");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Build unified alerts
  const { alerts, unlinkedQuestions, counts, progressPct } = useUnifiedAlerts({
    results: displayedResult?.results ?? null,
    conditionsData: conditionsData ?? null,
    resolutionMap,
    founderQuestions,
    existingResponses,
  });

  // Filters
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const filterCounts = useMemo(
    () => ({ byType: counts.byType }),
    [counts.byType.RED_FLAG, counts.byType.DEVILS_ADVOCATE, counts.byType.CONDITIONS],
  );

  // Response editing state: questionId → { answer, status }
  const [responseEdits, setResponseEdits] = useState<Record<string, { answer: string; status: ResponseStatus }>>({});
  const [freeNotes, setFreeNotes] = useState("");
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Initialize response edits from existing responses
  const getResponseValue = useCallback((questionId: string): { answer: string; status: ResponseStatus } => {
    if (responseEdits[questionId]) return responseEdits[questionId];
    const existing = existingResponses.find(r => r.questionId === questionId);
    if (existing) return { answer: existing.answer, status: existing.status };
    return { answer: "", status: "pending" };
  }, [responseEdits, existingResponses]);

  const handleResponseChange = useCallback((questionId: string, answer: string, status: ResponseStatus) => {
    setResponseEdits(prev => ({ ...prev, [questionId]: { answer, status } }));
  }, []);

  // Build responses array for save
  const buildResponsesArray = useCallback((): QuestionResponse[] => {
    const map = new Map<string, QuestionResponse>();
    // Start with existing
    for (const r of existingResponses) {
      map.set(r.questionId, { ...r });
    }
    // Apply edits
    for (const [qId, edit] of Object.entries(responseEdits)) {
      map.set(qId, {
        questionId: qId,
        answer: edit.answer,
        status: edit.status,
      });
    }
    return Array.from(map.values());
  }, [existingResponses, responseEdits]);

  const hasEdits = useMemo(() => Object.keys(responseEdits).length > 0 || freeNotes.length > 0, [responseEdits, freeNotes]);

  const handleSave = useCallback(async () => {
    await onSaveResponses(buildResponsesArray(), freeNotes.trim());
    setResponseEdits({});
    setFreeNotes("");
  }, [onSaveResponses, buildResponsesArray, freeNotes]);

  const handleReanalyze = useCallback(async () => {
    await onSubmitAndReanalyze(buildResponsesArray(), freeNotes.trim());
    setResponseEdits({});
    setFreeNotes("");
  }, [onSubmitAndReanalyze, buildResponsesArray, freeNotes]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (!filters.severities.has(a.severity)) return false;
      // For merged alerts, match if ANY of the merged types is selected
      const alertTypes = a.mergedFrom ?? [a.alertType];
      if (!alertTypes.some(t => filters.types.has(t))) return false;
      if (filters.status === "open" && a.resolution) return false;
      if (filters.status === "resolved" && a.resolution?.status !== "RESOLVED") return false;
      if (filters.status === "accepted" && a.resolution?.status !== "ACCEPTED") return false;
      return true;
    });
  }, [alerts, filters]);

  // Empty state
  if (!displayedResult?.success && counts.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <p className="text-muted-foreground">Aucune alerte a afficher. Lancez une analyse pour commencer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dashboard */}
      <SuiviDDDashboard
        counts={counts}
        progressPct={progressPct}
        currentScore={currentScore}
        resolutions={resolutions}
      />

      {/* Filters */}
      <SuiviDDFilters
        filters={filters}
        onChange={setFilters}
        counts={filterCounts}
      />

      {/* Alert list */}
      {filteredAlerts.length > 0 ? (
        <div className="space-y-2">
          {filteredAlerts.map(alert => {
            const qId = alert.linkedQuestion?.questionId;
            const respVal = qId ? getResponseValue(qId) : undefined;
            return (
              <SuiviDDAlertCard
                key={alert.id}
                alert={alert}
                onResolve={onResolve}
                onUnresolve={onUnresolve}
                isResolving={isResolving}
                responseAnswer={respVal?.answer}
                responseStatus={respVal?.status}
                onResponseChange={handleResponseChange}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucune alerte ne correspond aux filtres selectionnes.
          </CardContent>
        </Card>
      )}

      {/* Unlinked questions */}
      {unlinkedQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              aria-expanded={showUnlinked}
              onClick={() => setShowUnlinked(prev => !prev)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Questions complementaires
                <Badge variant="secondary" className="text-xs">{unlinkedQuestions.length}</Badge>
              </CardTitle>
              {showUnlinked ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </CardHeader>
          {showUnlinked && (
            <CardContent className="space-y-3 pt-0">
              {unlinkedQuestions.map(q => {
                const respVal = getResponseValue(q.id);
                return (
                  <div key={q.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={q.priority === "CRITICAL" ? "destructive" : q.priority === "HIGH" ? "default" : "secondary"}
                        className="text-xs shrink-0"
                      >
                        {q.priority}
                      </Badge>
                      <p className="text-sm">{q.question}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {formatAgentName(q.agentSource)}
                    </div>
                    <FounderResponseInput
                      questionId={q.id}
                      answer={respVal.answer}
                      status={respVal.status}
                      onChange={handleResponseChange}
                    />
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Free notes */}
      <Card>
        <CardHeader className="pb-2">
          <button
            type="button"
            aria-expanded={showNotes}
            onClick={() => setShowNotes(prev => !prev)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm">Notes libres</CardTitle>
            {showNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {showNotes && (
          <CardContent className="pt-0">
            <Textarea
              placeholder="Notes d'appel, emails, messages..."
              className="min-h-[80px] text-sm"
              value={freeNotes}
              onChange={(e) => setFreeNotes(e.target.value)}
            />
          </CardContent>
        )}
      </Card>

      {/* Action bar */}
      <div className={cn(
        "sticky bottom-4 flex justify-end gap-2 transition-opacity",
        !hasEdits && "opacity-50 pointer-events-none",
      )}>
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={!hasEdits || isSubmittingResponses}
        >
          {isSubmittingResponses ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Sauvegarder
        </Button>
        <Button
          onClick={handleReanalyze}
          disabled={!hasEdits || isReanalyzing}
        >
          {isReanalyzing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Re-analyser avec les reponses
        </Button>
      </div>
    </div>
  );
});
