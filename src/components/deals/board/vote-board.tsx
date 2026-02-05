"use client";

import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BoardVerdictResult,
  InitialAnalysis,
  BoardVerdictType,
  BoardMemberConfig,
} from "@/agents/board/types";
import { getBoardMembers } from "@/agents/board/types";

// Provider display names and icons
const PROVIDER_LABELS: Record<string, { label: string; short: string }> = {
  anthropic: { label: "Anthropic", short: "Claude" },
  openai: { label: "OpenAI", short: "GPT" },
  google: { label: "Google", short: "Gemini" },
  mistral: { label: "Mistral", short: "Mistral" },
};

interface VoteBoardProps {
  result: BoardVerdictResult | null;
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  isRunning: boolean;
}

function getVerdictIcon(verdict: BoardVerdictType) {
  switch (verdict) {
    case "GO":
      return <CheckCircle2 className="h-6 w-6 text-green-500" />;
    case "NO_GO":
      return <XCircle className="h-6 w-6 text-red-500" />;
    case "NEED_MORE_INFO":
      return <HelpCircle className="h-6 w-6 text-amber-500" />;
  }
}

function getVerdictLabel(verdict: BoardVerdictType) {
  switch (verdict) {
    case "GO":
      return "GO";
    case "NO_GO":
      return "NO GO";
    case "NEED_MORE_INFO":
      return "NEED MORE INFO";
  }
}

function getVerdictBgColor(verdict: BoardVerdictType) {
  switch (verdict) {
    case "GO":
      return "bg-green-50 border-green-200";
    case "NO_GO":
      return "bg-red-50 border-red-200";
    case "NEED_MORE_INFO":
      return "bg-amber-50 border-amber-200";
  }
}

function getConsensusLabel(level: string) {
  switch (level) {
    case "UNANIMOUS":
      return "Unanime (4/4)";
    case "STRONG":
      return "Majorite (3/4)";
    case "SPLIT":
      return "Partage (2/2)";
    case "MINORITY":
      return "Minorite (1/3)";
    default:
      return level;
  }
}

export const VoteBoard = memo(function VoteBoard({ result, memberAnalyses, isRunning }: VoteBoardProps) {
  // Get board members config (test vs prod based on environment)
  const boardMembersConfig = useMemo(() => getBoardMembers(), []);

  // Merge member configs with analyses/votes
  const members = useMemo(() => {
    return boardMembersConfig.map((config) => {
      const analysis = memberAnalyses[config.id];
      const vote = result?.votes.find((v) => v.memberId === config.id);

      return {
        ...config,
        analysis: analysis?.analysis,
        vote,
        isLoading: isRunning && !analysis && !vote,
      };
    });
  }, [boardMembersConfig, memberAnalyses, result, isRunning]);

  const hasAnyData = members.some((m) => m.analysis || m.vote);
  if (!hasAnyData && !isRunning) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Votes du Board</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Member cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>

        {/* Global verdict banner */}
        {result && (
          <div
            className={cn(
              "mt-4 rounded-lg border-2 p-4 text-center",
              getVerdictBgColor(result.verdict)
            )}
          >
            <div className="flex items-center justify-center gap-3">
              {getVerdictIcon(result.verdict)}
              <div>
                <p className="text-xl font-bold">
                  Verdict: {getVerdictLabel(result.verdict)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {getConsensusLabel(result.consensusLevel)} • {result.totalRounds} round{result.totalRounds > 1 ? "s" : ""} de debat
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

interface MemberCardProps {
  member: {
    id: string;
    name: string;
    color: string;
    provider: "anthropic" | "openai" | "google" | "mistral";
    analysis?: InitialAnalysis;
    vote?: {
      verdict: BoardVerdictType;
      confidence: number;
      justification: string;
    };
    isLoading: boolean;
  };
}

function MemberCard({ member }: MemberCardProps) {
  const verdict = member.vote?.verdict ?? member.analysis?.verdict;
  const confidence = member.vote?.confidence ?? member.analysis?.confidence;
  const providerInfo = PROVIDER_LABELS[member.provider];

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4 transition-all",
        verdict ? getVerdictBgColor(verdict) : "border-gray-200 bg-gray-50"
      )}
      style={{
        borderLeftColor: member.color,
        borderLeftWidth: "4px",
      }}
    >
      {/* Header with provider badge */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold" style={{ color: member.color }}>
            {member.name}
          </span>
          {member.isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Badge variant="outline" className="mt-1 text-xs font-normal">
          {providerInfo?.label ?? member.provider}
        </Badge>
      </div>

      {/* Verdict */}
      {verdict ? (
        <>
          <div className="flex items-center gap-2">
            {getVerdictIcon(verdict)}
            <span className="font-bold">{getVerdictLabel(verdict)}</span>
          </div>

          {/* Confidence */}
          {confidence !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Confiance</span>
                <span>{confidence}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    verdict === "GO"
                      ? "bg-green-500"
                      : verdict === "NO_GO"
                        ? "bg-red-500"
                        : "bg-amber-500"
                  )}
                  style={{ width: `${confidence}%` }}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          {member.isLoading ? "Analyse en cours..." : "En attente"}
        </div>
      )}
    </div>
  );
}
