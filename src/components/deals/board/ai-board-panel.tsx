"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Play, Square, Loader2, Crown, Sparkles } from "lucide-react";
import { VoteBoard } from "./vote-board";
import { KeyPointsSection } from "./key-points-section";
import { DebateViewer } from "./debate-viewer";
import { BoardProgress } from "./board-progress";
import { BoardTeaser } from "./board-teaser";
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

interface AIBoardPanelProps {
  dealId: string;
  dealName: string;
}

// Query key factory
const boardKeys = {
  all: ["board"] as const,
  credits: () => [...boardKeys.all, "credits"] as const,
  session: (sessionId: string) => [...boardKeys.all, "session", sessionId] as const,
  dealSessions: (dealId: string) => [...boardKeys.all, "deal", dealId] as const,
};

export function AIBoardPanel({ dealId, dealName }: AIBoardPanelProps) {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<BoardProgressEvent[]>([]);
  const [result, setResult] = useState<BoardVerdictResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch credits status
  const { data: creditsData, isLoading: isLoadingCredits } = useQuery({
    queryKey: boardKeys.credits(),
    queryFn: async () => {
      const res = await fetch("/api/board");
      if (!res.ok) throw new Error("Failed to fetch credits");
      const data = await res.json();
      return data.status as BoardCreditsStatus;
    },
  });

  // Fetch existing session for this deal (if any)
  const { data: existingSession } = useQuery({
    queryKey: boardKeys.dealSessions(dealId),
    queryFn: async () => {
      // Get sessions for this deal from the list
      // For now we'll check if there's a completed session
      return null; // TODO: implement session history
    },
    enabled: false, // Disabled for now
  });

  const startBoard = useCallback(async () => {
    setIsRunning(true);
    setEvents([]);
    setResult(null);

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
            const eventData = JSON.parse(line.slice(6)) as BoardProgressEvent;

            if (eventData.sessionId && !currentSessionId) {
              setCurrentSessionId(eventData.sessionId);
            }

            setEvents((prev) => [...prev, eventData]);

            if (eventData.type === "verdict_reached" && eventData.verdict) {
              setResult(eventData.verdict);
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

    // Invalidate credits after run
    queryClient.invalidateQueries({ queryKey: boardKeys.credits() });
  }, [dealId, currentSessionId, queryClient]);

  const stopBoard = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (currentSessionId) {
      try {
        await fetch(`/api/board/${currentSessionId}`, {
          method: "POST",
        });
      } catch (error) {
        console.error("Failed to stop board:", error);
      }
    }

    setIsRunning(false);
  }, [currentSessionId]);

  // Extract data from events
  const memberAnalyses = events
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

  const debateResponses = events
    .filter((e) => e.type === "debate_response" && e.debateResponse)
    .map((e) => ({
      roundNumber: e.roundNumber ?? 1,
      memberId: e.memberId ?? "",
      memberName: e.memberName ?? "",
      response: e.debateResponse!,
    }));

  // Show teaser for FREE users
  if (!isLoadingCredits && creditsData?.subscriptionStatus === "FREE") {
    return <BoardTeaser dealName={dealName} />;
  }

  // Loading state
  if (isLoadingCredits) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  AI Board
                  <Badge variant="secondary" className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800">
                    <Crown className="mr-1 h-3 w-3" />
                    Premium
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  4 LLMs TOP deliberent sur ce deal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Credits display */}
              {creditsData && (
                <div className="text-right text-sm">
                  <p className="font-medium">
                    {creditsData.totalAvailable} credit{creditsData.totalAvailable !== 1 ? "s" : ""} disponible{creditsData.totalAvailable !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {creditsData.usedThisMonth}/{creditsData.monthlyAllocation} utilises ce mois
                  </p>
                </div>
              )}

              {/* Action button */}
              {isRunning ? (
                <Button variant="destructive" onClick={stopBoard}>
                  <Square className="mr-2 h-4 w-4" />
                  Arreter
                </Button>
              ) : (
                <Button
                  onClick={startBoard}
                  disabled={!creditsData?.canUseBoard}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Convoquer le Board
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress indicator during run */}
      {isRunning && <BoardProgress events={events} />}

      {/* Results section */}
      {(result || Object.keys(memberAnalyses).length > 0) && (
        <>
          {/* Vote Board - jury cards */}
          <VoteBoard
            result={result}
            memberAnalyses={memberAnalyses}
            isRunning={isRunning}
          />

          {/* Key Points - consensus, friction, questions */}
          {result && (
            <KeyPointsSection
              consensusPoints={result.consensusPoints}
              frictionPoints={result.frictionPoints}
              questionsForFounder={result.questionsForFounder}
            />
          )}

          {/* Debate Viewer - multi-view */}
          {debateResponses.length > 0 && (
            <DebateViewer
              memberAnalyses={memberAnalyses}
              debateResponses={debateResponses}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {!isRunning && !result && Object.keys(memberAnalyses).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
              <Users className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              Pas encore de deliberation
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Convoquez le AI Board pour une analyse approfondie par 4 LLMs de premier plan.
              Ils delibereront jusqu&apos;a atteindre un verdict commun.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Cout estime: ~2-5$ par session
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
