"use client";

import { useMemo, memo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, HelpCircle, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
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
    case "GO":
      return <CheckCircle2 className={cn(size, "text-emerald-400")} />;
    case "NO_GO":
      return <XCircle className={cn(size, "text-red-400")} />;
    case "NEED_MORE_INFO":
      return <HelpCircle className={cn(size, "text-amber-400")} />;
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

function getVerdictColors(verdict: BoardVerdictType) {
  switch (verdict) {
    case "GO":
      return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/20" };
    case "NO_GO":
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
      return "Majorite forte";
    case "SPLIT":
      return "Partage";
    case "MINORITY":
      return "Minoritaire";
    default:
      return level;
  }
}

// Provider icon SVGs
function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M17.304 3.541l-5.296 16.459h3.366L20.67 3.541h-3.366zm-10.608 0L1.4 20h3.366l1.058-3.286h5.417L12.3 20h3.366L10.37 3.541H6.696zm2.985 4.17l1.867 5.8h-3.74l1.873-5.8z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.516a5.986 5.986 0 00-5.712 4.14 6.044 6.044 0 00-4.041 2.926 6.048 6.048 0 00.749 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.288 23.5a6.048 6.048 0 005.712-4.138 6.047 6.047 0 004.042-2.928 6.048 6.048 0 00-.76-6.613zM13.29 21.538a4.49 4.49 0 01-2.888-1.054l.144-.08 4.802-2.772a.778.778 0 00.394-.676v-6.765l2.03 1.172a.071.071 0 01.038.053v5.607a4.504 4.504 0 01-4.52 4.515zm-9.697-4.138a4.49 4.49 0 01-.537-3.016l.144.083 4.802 2.773a.78.78 0 00.787 0l5.862-3.384v2.342a.073.073 0 01-.03.06L9.78 19.044a4.504 4.504 0 01-6.187-1.644zM2.372 7.878A4.49 4.49 0 014.714 5.87v5.716a.776.776 0 00.393.676l5.862 3.385-2.03 1.17a.071.071 0 01-.067.005L3.93 13.844a4.504 4.504 0 01-1.558-6.166zm16.656 3.879l-5.862-3.384 2.03-1.172a.071.071 0 01.067-.006l4.94 2.852a4.494 4.494 0 01-.679 8.133v-5.743a.78.78 0 00-.396-.68zm2.02-3.026l-.144-.083-4.802-2.772a.78.78 0 00-.787 0l-5.862 3.384V6.918a.073.073 0 01.03-.06l4.94-2.852a4.498 4.498 0 016.724 4.66l.001.065zm-12.7 4.18l-2.03-1.171a.071.071 0 01-.038-.053V6.08a4.497 4.497 0 017.407-3.443l-.144.08-4.802 2.773a.778.778 0 00-.393.676v6.765l.001-.04zm1.1-2.383l2.61-1.506 2.61 1.507v3.012l-2.61 1.506-2.61-1.506V10.528z" />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 11.01v3.32h5.47c-.24 1.26-1.01 2.33-2.16 3.04l3.49 2.71c2.03-1.87 3.2-4.62 3.2-7.89 0-.76-.07-1.49-.2-2.19H12z" />
          <path d="M5.84 14.09l-.78.6-2.78 2.16C4.56 20.63 8.03 23 12 23c3.24 0 5.95-1.07 7.93-2.91l-3.49-2.71c-.97.65-2.21 1.04-3.56 1.04-2.74 0-5.06-1.85-5.89-4.34l-.15.01z" />
          <path d="M2.28 6.85C1.47 8.45 1 10.17 1 12s.47 3.55 1.28 5.15l3.62-2.81C5.55 13.46 5.33 12.75 5.33 12s.22-1.46.57-2.34L2.28 6.85z" />
          <path d="M12 5.58c1.54 0 2.93.53 4.02 1.57l3.01-3.01C17.07 2.18 14.76 1 12 1 8.03 1 4.56 3.37 2.28 6.85l3.62 2.81C6.7 7.43 9.02 5.58 12 5.58z" />
        </svg>
      );
    case "xai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M2.2 2L10.7 14.3L2.6 22H4.4L11.5 15.5L17.2 22H22L13 9.2L20.4 2H18.6L12.2 8L7 2H2.2ZM5.2 3.5H6.8L19 20.5H17.4L5.2 3.5Z" />
        </svg>
      );
    default:
      return null;
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
            <p className="text-[11px] text-red-400/50">Echec</p>
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
                      verdict === "GO" && "stroke-emerald-400",
                      verdict === "NO_GO" && "stroke-red-400",
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
          Verdict: {getVerdictLabel(result.verdict)}
        </p>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{getConsensusLabel(result.consensusLevel)}</span>
          <span className="text-slate-600">|</span>
          <span>{result.totalRounds} round{result.totalRounds > 1 ? "s" : ""} de debat</span>
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
