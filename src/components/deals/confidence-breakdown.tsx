"use client";

import { useMemo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database,
  FileCheck,
  BarChart3,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { ConfidenceScore, ConfidenceFactor } from "@/scoring/types";
import { getScoreColor, getScoreBgColor } from "@/lib/format-utils";

interface ConfidenceBreakdownProps {
  confidence: ConfidenceScore;
  showDetails?: boolean;
  compact?: boolean;
  onRequestImprovement?: (factor: string) => void;
}

const FACTOR_ICONS: Record<string, React.ReactNode> = {
  "Data Availability": <Database className="h-4 w-4" />,
  "Evidence Quality": <FileCheck className="h-4 w-4" />,
  "Benchmark Match": <BarChart3 className="h-4 w-4" />,
  "Source Reliability": <Shield className="h-4 w-4" />,
  "Temporal Relevance": <Clock className="h-4 w-4" />,
};

const FACTOR_IMPROVEMENTS: Record<string, string> = {
  "Data Availability": "Demander plus de données au fondateur (financials, métriques)",
  "Evidence Quality": "Vérifier les claims avec des sources externes",
  "Benchmark Match": "Affiner le secteur/stage pour des comparables plus précis",
  "Source Reliability": "Croiser avec d'autres sources (Crunchbase, LinkedIn)",
  "Temporal Relevance": "Demander des données plus récentes",
};

function getLevelBadge(level: string): { text: string; variant: "success" | "warning" | "danger" | "info" } {
  switch (level) {
    case "high":
      return { text: "Haute", variant: "success" };
    case "medium":
      return { text: "Moyenne", variant: "info" };
    case "low":
      return { text: "Basse", variant: "warning" };
    default:
      return { text: "Insuffisante", variant: "danger" };
  }
}

function FactorBar({ factor }: { factor: ConfidenceFactor }) {
  const icon = FACTOR_ICONS[factor.name] ?? <Info className="h-4 w-4" />;
  const improvement = FACTOR_IMPROVEMENTS[factor.name];
  const isLow = factor.score < 60;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={cn("shrink-0", getScoreColor(factor.score))}>
                {icon}
              </span>
              <span className="font-medium truncate">{factor.name}</span>
              {isLow && (
                <AlertCircle className="h-3 w-3 text-orange-500 shrink-0" />
              )}
            </div>
            <span className={cn("font-bold", getScoreColor(factor.score))}>
              {factor.score}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                factor.score >= 80 ? "bg-green-500" :
                factor.score >= 60 ? "bg-blue-500" :
                factor.score >= 40 ? "bg-yellow-500" :
                factor.score >= 20 ? "bg-orange-500" : "bg-red-500"
              )}
              style={{ width: `${factor.score}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{factor.reason}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <div className="space-y-2">
          <p className="font-medium">{factor.name}</p>
          <p className="text-sm">{factor.reason}</p>
          {isLow && improvement && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-orange-600">Pour améliorer:</p>
              <p className="text-xs">{improvement}</p>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CompactConfidenceBadge({ confidence }: { confidence: ConfidenceScore }) {
  const levelInfo = getLevelBadge(confidence.level);
  const lowestFactor = useMemo(() => {
    if (confidence.factors.length === 0) return null;
    return confidence.factors.reduce((min, f) => f.score < min.score ? f : min);
  }, [confidence.factors]);

  const colors = {
    success: "bg-green-100 text-green-800 border-green-300",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
    danger: "bg-red-100 text-red-800 border-red-300",
    info: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn("cursor-help", colors[levelInfo.variant])}
          >
            {confidence.score}%
            {lowestFactor && lowestFactor.score < 50 && (
              <AlertCircle className="h-3 w-3 ml-1" />
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-72 p-0">
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Confiance: {levelInfo.text}</span>
              <span className={cn("font-bold", getScoreColor(confidence.score))}>
                {confidence.score}%
              </span>
            </div>
            <div className="space-y-2">
              {confidence.factors.map((factor, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    {FACTOR_ICONS[factor.name]}
                    <span className="truncate">{factor.name}</span>
                  </div>
                  <span className={cn("font-medium", getScoreColor(factor.score))}>
                    {factor.score}%
                  </span>
                </div>
              ))}
            </div>
            {lowestFactor && lowestFactor.score < 50 && (
              <div className="pt-2 border-t text-xs">
                <p className="text-orange-600 font-medium">Point faible: {lowestFactor.name}</p>
                <p className="text-muted-foreground">{lowestFactor.reason}</p>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConfidenceBreakdown({
  confidence,
  showDetails = true,
  compact = false,
}: ConfidenceBreakdownProps) {
  const [expanded, setExpanded] = useState(false);
  const levelInfo = getLevelBadge(confidence.level);

  const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  // Sort factors by score (lowest first to highlight issues)
  const sortedFactors = useMemo(() => {
    return [...confidence.factors].sort((a, b) => a.score - b.score);
  }, [confidence.factors]);

  // Find factors that need improvement
  const weakFactors = useMemo(() => {
    return sortedFactors.filter(f => f.score < 60);
  }, [sortedFactors]);

  // Calculate overall health
  const healthStatus = useMemo(() => {
    if (confidence.score >= 75) return { icon: CheckCircle2, text: "Analyse fiable", color: "text-green-600" };
    if (confidence.score >= 50) return { icon: Info, text: "Confiance modérée", color: "text-blue-600" };
    return { icon: AlertCircle, text: "Vérification recommandée", color: "text-orange-600" };
  }, [confidence.score]);

  if (compact) {
    return <CompactConfidenceBadge confidence={confidence} />;
  }

  const colors = {
    success: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    danger: "bg-red-50 border-red-200",
    info: "bg-blue-50 border-blue-200",
  };

  return (
    <div className={cn("rounded-lg border p-4", colors[levelInfo.variant])}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <healthStatus.icon className={cn("h-5 w-5", healthStatus.color)} />
          <div>
            <p className="font-medium">{healthStatus.text}</p>
            <p className="text-xs text-muted-foreground">
              {weakFactors.length > 0
                ? `${weakFactors.length} facteur${weakFactors.length > 1 ? "s" : ""} à améliorer`
                : "Tous les facteurs sont satisfaisants"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className={cn("text-2xl font-bold", getScoreColor(confidence.score))}>
              {confidence.score}%
            </p>
            <Badge variant="outline" className={cn("text-xs", colors[levelInfo.variant])}>
              {levelInfo.text}
            </Badge>
          </div>
        </div>
      </div>

      {/* Visual bar */}
      <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            confidence.score >= 75 ? "bg-green-500" :
            confidence.score >= 50 ? "bg-blue-500" :
            confidence.score >= 25 ? "bg-yellow-500" : "bg-red-500"
          )}
          style={{ width: `${confidence.score}%` }}
        />
      </div>

      {/* Expand/Collapse */}
      {showDetails && (
        <>
          <button
            onClick={toggleExpanded}
            className="w-full flex items-center justify-center gap-1 mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "Masquer le détail" : "Voir le détail"}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expanded && (
            <div className="mt-4 space-y-4">
              {/* Factor breakdown */}
              <TooltipProvider>
                <div className="space-y-3">
                  {sortedFactors.map((factor, i) => (
                    <FactorBar key={i} factor={factor} />
                  ))}
                </div>
              </TooltipProvider>

              {/* Improvement suggestions */}
              {weakFactors.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-sm font-medium mb-2">Actions pour améliorer la confiance:</p>
                  <ul className="space-y-1">
                    {weakFactors.map((factor, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0 mt-0.5">•</span>
                        <span>
                          <strong>{factor.name}:</strong>{" "}
                          {FACTOR_IMPROVEMENTS[factor.name] ?? "Vérifier les données sources"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Export compact version for inline use
export function ConfidenceBadge({ confidence }: { confidence: ConfidenceScore }) {
  return <CompactConfidenceBadge confidence={confidence} />;
}
