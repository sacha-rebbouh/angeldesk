"use client";

import { useState, useCallback, useRef, useReducer, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Play, Square, Loader2, Crown, Sparkles, Zap, Shield, Vote, MessageSquareMore, Lightbulb } from "lucide-react";
import { VoteBoard } from "./vote-board";
import { KeyPointsSection } from "./key-points-section";
import { DebateViewer } from "./debate-viewer";
import { BoardProgress } from "./board-progress";
import { BoardTeaser } from "./board-teaser";
import { BOARD_MEMBERS_PROD, BOARD_MEMBERS_TEST } from "@/agents/board/types";
import type {
  BoardProgressEvent,
  BoardVerdictResult,
  InitialAnalysis,
  DebateResponse,
} from "@/agents/board/types";

interface BoardCreditsStatus {
  canUseBoard: boolean;
  reason?: string;
  monthlyAllocation: number;
  usedThisMonth: number;
  remainingMonthly: number;
  extraCredits: number;
  totalAvailable: number;
  subscriptionStatus: "FREE" | "PRO" | "ENTERPRISE";
  nextResetDate: string;
}

// Saved session shape from API
interface SavedBoardSession {
  id: string;
  dealId: string;
  status: string;
  verdict: string;
  consensusLevel: string;
  stoppingReason: string;
  votes: {
    memberId: string;
    modelId: string;
    memberName: string;
    color: string;
    initialAnalysis: InitialAnalysis | null;
    finalVote: string | null;
    finalConfidence: number | null;
    justification: string | null;
  }[];
  rounds: {
    roundNumber: number;
    roundType: string;
    responses: { memberId: string; memberName: string; response: DebateResponse }[];
  }[];
  consensusPoints: string[];
  frictionPoints: string[];
  questionsForFounder: string[];
  totalRounds: number;
  totalCost: string | null;
  totalTimeMs: number | null;
  completedAt: string | null;
}

interface AIBoardPanelProps {
  dealId: string;
  dealName: string;
}

// Reducer for events — avoids O(n²) spread in SSE loop
function eventsReducer(state: BoardProgressEvent[], action: { type: "add"; event: BoardProgressEvent } | { type: "reset" }): BoardProgressEvent[] {
  if (action.type === "reset") return [];
  return [...state, action.event];
}

// Build a lookup from ModelKey to config ID (e.g., "SONNET" → "claude", "HAIKU" → "claude")
// Include BOTH prod and test configs so saved sessions from either env can be hydrated
const modelKeyToConfigId = [...BOARD_MEMBERS_PROD, ...BOARD_MEMBERS_TEST].reduce(
  (acc, m) => {
    acc[m.modelKey] = m.id;
    return acc;
  },
  {} as Record<string, string>
);

/**
 * Hydrate saved session into component-compatible formats
 */
function hydrateSavedSession(session: SavedBoardSession) {
  // Map memberAnalyses: modelId → config ID
  const memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }> = {};
  for (const vote of session.votes) {
    const configId = modelKeyToConfigId[vote.modelId];
    if (configId && vote.initialAnalysis) {
      memberAnalyses[configId] = {
        memberName: vote.memberName,
        analysis: vote.initialAnalysis,
      };
    }
  }

  // Map debateResponses from rounds
  const debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[] = [];
  for (const round of session.rounds) {
    if (!Array.isArray(round.responses)) continue;
    for (const r of round.responses) {
      debateResponses.push({
        roundNumber: round.roundNumber,
        memberId: r.memberId,
        memberName: r.memberName,
        response: r.response,
      });
    }
  }

  // Map verdict result
  const result: BoardVerdictResult = {
    verdict: session.verdict as BoardVerdictResult["verdict"],
    consensusLevel: session.consensusLevel as BoardVerdictResult["consensusLevel"],
    stoppingReason: session.stoppingReason as BoardVerdictResult["stoppingReason"],
    votes: session.votes
      .filter((v) => v.finalVote)
      .map((v) => ({
        memberId: modelKeyToConfigId[v.modelId] ?? v.memberId,
        memberName: v.memberName,
        color: v.color,
        verdict: v.finalVote as BoardVerdictResult["verdict"],
        confidence: v.finalConfidence ?? 0,
        justification: v.justification ?? "",
      })),
    consensusPoints: session.consensusPoints ?? [],
    frictionPoints: session.frictionPoints ?? [],
    questionsForFounder: session.questionsForFounder ?? [],
    totalRounds: session.totalRounds ?? 0,
    totalCost: parseFloat(session.totalCost ?? "0"),
    totalTimeMs: session.totalTimeMs ?? 0,
  };

  return { memberAnalyses, debateResponses, result };
}

export function AIBoardPanel({ dealId, dealName }: AIBoardPanelProps) {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const [events, dispatchEvents] = useReducer(eventsReducer, []);
  const [liveResult, setLiveResult] = useState<BoardVerdictResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch credits status + latest saved session for this deal
  const { data: boardData, isLoading: isLoadingBoard } = useQuery({
    queryKey: queryKeys.board.dealSessions(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/board?dealId=${dealId}`);
      if (!res.ok) throw new Error("Failed to fetch board data");
      const data = await res.json();
      return {
        credits: data.status as BoardCreditsStatus,
        savedSession: data.latestSession as SavedBoardSession | null,
      };
    },
  });

  const creditsData = boardData?.credits;

  // Hydrate saved session
  const savedHydrated = useMemo(() => {
    if (!boardData?.savedSession) return null;
    return hydrateSavedSession(boardData.savedSession);
  }, [boardData?.savedSession]);

  // Determine what to display: live (from SSE) or saved (from DB)
  const isLiveSession = isRunning || events.length > 0;

  // Extract live data from SSE events
  const liveMemberAnalyses = useMemo(() => {
    return events
      .filter((e) => e.type === "member_analysis_completed" && e.analysis)
      .reduce(
        (acc, e) => {
          if (e.memberId && e.analysis) {
            acc[e.memberId] = {
              memberName: e.memberName ?? e.memberId,
              analysis: e.analysis,
            };
          }
          return acc;
        },
        {} as Record<string, { memberName: string; analysis: InitialAnalysis }>
      );
  }, [events]);

  const liveDebateResponses = useMemo(() => {
    return events
      .filter((e) => e.type === "debate_response" && e.debateResponse)
      .map((e) => ({
        roundNumber: e.roundNumber ?? 1,
        memberId: e.memberId ?? "",
        memberName: e.memberName ?? "",
        response: e.debateResponse!,
      }));
  }, [events]);

  // Extract failed members from events
  const failedMembers = useMemo(() => {
    return events
      .filter((e) => e.type === "member_analysis_failed")
      .map((e) => ({ memberId: e.memberId ?? "", memberName: e.memberName ?? "", error: e.error ?? "" }));
  }, [events]);

  // Resolve displayed data: live overrides saved
  const memberAnalyses = isLiveSession ? liveMemberAnalyses : (savedHydrated?.memberAnalyses ?? {});
  const debateResponses = isLiveSession ? liveDebateResponses : (savedHydrated?.debateResponses ?? []);
  const result = isLiveSession ? liveResult : (savedHydrated?.result ?? null);

  const hasResults = result !== null || Object.keys(memberAnalyses).length > 0;

  // When a live session completes, invalidate to refresh saved data
  const prevLiveResultRef = useRef<BoardVerdictResult | null>(null);
  useEffect(() => {
    if (liveResult && !prevLiveResultRef.current) {
      // Live result just arrived — invalidate so next mount loads from DB
      queryClient.invalidateQueries({ queryKey: queryKeys.board.dealSessions(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.board.credits() });
    }
    prevLiveResultRef.current = liveResult;
  }, [liveResult, dealId, queryClient]);

  const startBoard = useCallback(async () => {
    setIsRunning(true);
    dispatchEvents({ type: "reset" });
    setLiveResult(null);
    currentSessionIdRef.current = null;

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start board");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            let eventData: BoardProgressEvent;
            try {
              eventData = JSON.parse(line.slice(6)) as BoardProgressEvent;
            } catch {
              continue;
            }

            if (eventData.sessionId && !currentSessionIdRef.current) {
              currentSessionIdRef.current = eventData.sessionId;
            }

            dispatchEvents({ type: "add", event: eventData });

            if (eventData.type === "verdict_reached" && eventData.verdict) {
              setLiveResult(eventData.verdict);
              setIsRunning(false);
            }

            if (eventData.type === "error") {
              setIsRunning(false);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("Board aborted");
      } else {
        console.error("Board error:", error);
      }
      setIsRunning(false);
    }
  }, [dealId]);

  const stopBoard = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (currentSessionIdRef.current) {
      try {
        await fetch(`/api/board/${currentSessionIdRef.current}`, {
          method: "POST",
        });
      } catch (error) {
        console.error("Failed to stop board:", error);
      }
    }

    setIsRunning(false);
  }, []);

  // Show teaser for FREE users
  if (!isLoadingBoard && creditsData?.subscriptionStatus === "FREE") {
    return <BoardTeaser dealName={dealName} />;
  }

  // Loading state
  if (isLoadingBoard) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-12">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header — War Room style */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Subtle grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Icon with glow */}
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-amber-500/20 blur-xl" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-semibold text-white tracking-tight">
                    AI Board
                  </h2>
                  <Badge className="border-0 bg-amber-500/15 text-amber-400 hover:bg-amber-500/20 text-[11px] font-medium px-2 py-0.5">
                    <Crown className="mr-1 h-3 w-3" />
                    Premium
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-400">
                  4 LLMs TOP deliberent sur ce deal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              {/* Credits display */}
              {creditsData && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    {creditsData.totalAvailable} credit{creditsData.totalAvailable !== 1 ? "s" : ""}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {creditsData.usedThisMonth}/{creditsData.monthlyAllocation} ce mois
                  </p>
                </div>
              )}

              {/* Action button */}
              {isRunning ? (
                <Button
                  variant="destructive"
                  onClick={stopBoard}
                  className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Arreter
                </Button>
              ) : (
                <Button
                  onClick={startBoard}
                  disabled={!creditsData?.canUseBoard}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-amber-500/25 border-0 font-medium disabled:opacity-40"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {hasResults && !isRunning ? "Reconvoquer" : "Convoquer le Board"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress indicator during run */}
      {isRunning && <BoardProgress events={events} />}

      {/* Results section with clear phase separators */}
      {hasResults && (
        <>
          {/* Phase 1: Votes individuels */}
          <SectionDivider
            icon={<Vote className="h-4 w-4" />}
            label="Votes individuels"
          />
          <VoteBoard
            result={result}
            memberAnalyses={memberAnalyses}
            failedMembers={failedMembers}
            isRunning={isRunning}
          />

          {/* Phase 2: Points cles */}
          {result && (
            <>
              <SectionDivider
                icon={<Lightbulb className="h-4 w-4" />}
                label="Synthèse"
              />
              <KeyPointsSection
                consensusPoints={result.consensusPoints}
                frictionPoints={result.frictionPoints}
                questionsForFounder={result.questionsForFounder}
              />
            </>
          )}

          {/* Phase 3: Historique du debat */}
          {debateResponses.length > 0 && (
            <>
              <SectionDivider
                icon={<MessageSquareMore className="h-4 w-4" />}
                label={`Debat — ${Math.max(0, ...debateResponses.map(r => r.roundNumber))} round${Math.max(0, ...debateResponses.map(r => r.roundNumber)) > 1 ? "s" : ""}`}
              />
              <DebateViewer
                memberAnalyses={memberAnalyses}
                debateResponses={debateResponses}
              />
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!isRunning && !hasResults && (
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950">
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-2xl scale-150" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700/50 bg-slate-800/50 backdrop-blur">
                <Shield className="h-9 w-9 text-amber-500/70" />
              </div>
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">
              Pas encore de deliberation
            </h3>
            <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
              Convoquez le AI Board pour une analyse approfondie par 4 LLMs de premier plan.
              Ils delibereront jusqu&apos;a atteindre un verdict commun.
            </p>
            <p className="mt-5 text-xs text-slate-500 flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              Cout estime: ~2$ par session
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Visual separator between board phases */
function SectionDivider({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-slate-700/50 to-transparent" />
    </div>
  );
}
