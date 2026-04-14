"use client";

import { useMemo, memo, useState, useCallback } from "react";
import { CheckCircle2, XCircle, HelpCircle, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/shared/provider-icon";
import type {
  BoardVerdictResult,
  InitialAnalysis,
  BoardVerdictType,
} from "@/agents/board/types";
import { getBoardMembers } from "@/agents/board/types";

const PROVIDER_LABELS: Record<string, { label: string; short: string }> = {
  anthropic: { label: "Anthropic", short: "Claude" },
  openai: { label: "OpenAI", short: "GPT" },
  google: { label: "Google", short: "Gemini" },
  xai: { label: "xAI", short: "Grok" },
};

interface VoteBoardProps {
  result: BoardVerdictResult | null;
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  failedMembers?: { memberId: string; memberName: string; error: string }[];
  isRunning: boolean;
}

function getVerdictIcon(verdict: BoardVerdictType, size = "h-6 w-6") {
  switch (verdict) {
    case "VERY_FAVORABLE":
    case "FAVORABLE":
      return <CheckCircle2 className={cn(size, "text-emerald-400")} />;
    case "CONTRASTED":
      return <HelpCircle className={cn(size, "text-amber-400")} />;
    case "VIGILANCE":
      return <AlertCircle className={cn(size, "text-orange-400")} />;
    case "ALERT_DOMINANT":
      return <XCircle className={cn(size, "text-red-400")} />;
    case "NEED_MORE_INFO":
      return <HelpCircle className={cn(size, "text-amber-400")} />;
  }
}

function getVerdictLabel(verdict: BoardVerdictType) {
  switch (verdict) {
    case "VERY_FAVORABLE":
      return "Signaux très favorables";
    case "FAVORABLE":
      return "Signaux favorables";
    case "CONTRASTED":
      return "Signaux contrastés";
    case "VIGILANCE":
      return "Vigilance requise";
    case "ALERT_DOMINANT":
      return "Signaux d'alerte dominants";
    case "NEED_MORE_INFO":
      return "Informations insuffisantes";
  }
}

function getVerdictColors(verdict: BoardVerdictType) {
  switch (verdict) {
    case "VERY_FAVORABLE":
      return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/20" };
    case "FAVORABLE":
      return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/20" };
    case "CONTRASTED":
      return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-amber-500/20" };
    case "VIGILANCE":
      return { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", glow: "shadow-orange-500/20" };
    case "ALERT_DOMINANT":
      return { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", glow: "shadow-red-500/20" };
    case "NEED_MORE_INFO":
      return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-amber-500/20" };
  }
}

function getConsensusLabel(level: string) {
  switch (level) {
    case "UNANIMOUS":
      return "Unanime";
    case "STRONG":
      return "Majorité forte";
    case "SPLIT":
      return "Partage";
    case "MINORITY":
      return "Minoritaire";
    default:
      return level;
  }
}

export const VoteBoard = memo(function VoteBoard({ result, memberAnalyses, failedMembers = [], isRunning }: VoteBoardProps) {
  const boardMembersConfig = useMemo(() => getBoardMembers(), []);

  const failedIds = useMemo(() => new Set(failedMembers.map((f) => f.memberId)), [failedMembers]);

  const members = useMemo(() => {
    return boardMembersConfig.map((config) => {
      const analysis = memberAnalyses[config.id];
      const vote = result?.votes.find((v) => v.memberId === config.id);
      const failed = failedIds.has(config.id);
      const failedInfo = failedMembers.find((f) => f.memberId === config.id);

      return {
        ...config,
        analysis: analysis?.analysis,
        vote,
        isLoading: isRunning && !analysis && !vote && !failed,
        isFailed: failed,
        failedError: failedInfo?.error,
      };
    });
  }, [boardMembersConfig, memberAnalyses, result, isRunning, failedIds, failedMembers]);

  const hasAnyData = members.some((m) => m.analysis || m.vote || m.isFailed);
  if (!hasAnyData && !isRunning) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="px-6 py-5 space-y-5">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Votes du Board
        </h3>

        {/* Member cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>

        {/* Global verdict banner */}
        {result && <VerdictBanner result={result} />}
      </div>
    </div>
  );
});

interface MemberCardProps {
  member: {
    id: string;
    name: string;
    color: string;
    provider: "anthropic" | "openai" | "google" | "xai";
    analysis?: InitialAnalysis;
    vote?: {
      verdict: BoardVerdictType;
      confidence: number;
      justification: string;
    };
    isLoading: boolean;
    isFailed: boolean;
    failedError?: string;
  };
}

const MemberCard = memo(function MemberCard({ member }: MemberCardProps) {
  const verdict = member.vote?.verdict ?? member.analysis?.verdict;
  const confidence = member.vote?.confidence ?? member.analysis?.confidence;
  const justification = member.vote?.justification;
  const verdictColors = verdict ? getVerdictColors(verdict) : null;
  const [justificationExpanded, setJustificationExpanded] = useState(false);
  const toggleJustification = useCallback(() => setJustificationExpanded(prev => !prev), []);

  // Failed state
  if (member.isFailed) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 backdrop-blur">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 ring-1 ring-red-500/30">
            <ProviderIcon provider={member.provider} className="h-5 w-5 text-red-400/60" />
          </div>
          <div>
            <span className="text-sm font-medium text-red-400">{member.name}</span>
            <p className="text-[11px] text-red-400/50">Échec</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-red-400/70">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{member.failedError ?? "Erreur inconnue"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 backdrop-blur transition-all duration-300",
        verdictColors
          ? cn(verdictColors.bg, verdictColors.border)
          : "border-slate-700/50 bg-slate-800/30"
      )}
    >
      {/* Header — provider icon + name */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: member.color }}
        >
          <ProviderIcon provider={member.provider} className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-sm font-medium text-white">{member.name}</span>
          <p className="text-[11px] text-slate-500">
            {PROVIDER_LABELS[member.provider]?.label ?? member.provider}
          </p>
        </div>
        {member.isLoading && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-500" />
        )}
      </div>

      {/* Verdict */}
      {verdict ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {getVerdictIcon(verdict, "h-5 w-5")}
            <span className={cn("text-lg font-bold", verdictColors?.text)}>
              {getVerdictLabel(verdict)}
            </span>
          </div>

          {/* Confidence gauge — SVG arc */}
          {confidence !== undefined && (
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0">
                <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
                  {/* Background track */}
                  <circle
                    cx="24" cy="24" r="18"
                    fill="none"
                    strokeWidth="4"
                    className="stroke-slate-700/50"
                  />
                  {/* Filled arc */}
                  <circle
                    cx="24" cy="24" r="18"
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(confidence / 100) * 113.1} 113.1`}
                    className={cn(
                      "transition-all duration-700",
                      verdict === "VERY_FAVORABLE" && "stroke-emerald-400",
                      verdict === "FAVORABLE" && "stroke-emerald-400",
                      verdict === "CONTRASTED" && "stroke-amber-400",
                      verdict === "VIGILANCE" && "stroke-orange-400",
                      verdict === "ALERT_DOMINANT" && "stroke-red-400",
                      verdict === "NEED_MORE_INFO" && "stroke-amber-400"
                    )}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                  {confidence}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider">Confiance</p>
                {justification && (
                  <div className="mt-0.5">
                    <p
                      className={cn(
                        "text-xs text-slate-400",
                        !justificationExpanded && "line-clamp-2"
                      )}
                    >
                      {justification}
                    </p>
                    {justification.length > 80 && (
                      <button
                        type="button"
                        onClick={toggleJustification}
                        aria-expanded={justificationExpanded}
                        aria-label="Afficher la justification complète"
                        className="mt-1 flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {justificationExpanded ? (
                          <>
                            Réduire <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            Lire la suite <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-5 text-sm text-slate-500">
          {member.isLoading ? "Analyse en cours..." : "En attente"}
        </div>
      )}
    </div>
  );
});

function VerdictBanner({ result }: { result: BoardVerdictResult }) {
  const colors = getVerdictColors(result.verdict);

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border p-5 text-center",
      colors.bg, colors.border
    )}>
      {/* Subtle glow */}
      <div className={cn("absolute inset-0 opacity-20 blur-3xl", colors.bg)} />

      <div className="relative flex flex-col items-center gap-2">
        {getVerdictIcon(result.verdict, "h-8 w-8")}
        <p className={cn("text-2xl font-bold tracking-tight", colors.text)}>
          Profil de signal : {getVerdictLabel(result.verdict)}
        </p>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{getConsensusLabel(result.consensusLevel)}</span>
          <span className="text-slate-600">|</span>
          <span>{result.totalRounds} round{result.totalRounds > 1 ? "s" : ""} de débat</span>
          {result.totalCost > 0 && (
            <>
              <span className="text-slate-600">|</span>
              <span>${result.totalCost.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
