"use client";

import { useMemo, memo } from "react";
import { AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAgentName, getSeverityColor } from "@/lib/format-utils";

// Red flag structure from agents
interface RedFlag {
  id?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description?: string;
  evidence?: string;
  category?: string;
  question?: string;
  impact?: string;
}

interface AgentRedFlags {
  agentName: string;
  redFlags: RedFlag[];
}

interface RedFlagsSummaryProps {
  agentResults: AgentRedFlags[];
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
};

const SEVERITY_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  label: string;
}> = {
  CRITICAL: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: "text-red-600",
    label: "Critique",
  },
  HIGH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    icon: "text-orange-500",
    label: "Eleve",
  },
  MEDIUM: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    icon: "text-yellow-500",
    label: "Moyen",
  },
};

/**
 * RedFlagsSummary - Vue consolidee de TOUS les red flags de tous les agents.
 *
 * Affichee en HAUT des resultats Tier 1, avant les cartes individuelles.
 * Trie par severite (CRITICAL en premier).
 * Affiche l'agent source pour chaque flag.
 */
export const RedFlagsSummary = memo(function RedFlagsSummary({
  agentResults,
}: RedFlagsSummaryProps) {
  // Consolider et trier tous les red flags
  const consolidatedFlags = useMemo(() => {
    const allFlags: (RedFlag & { agentName: string })[] = [];

    for (const agent of agentResults) {
      for (const rf of agent.redFlags) {
        allFlags.push({ ...rf, agentName: agent.agentName });
      }
    }

    // Trier par severite (CRITICAL > HIGH > MEDIUM)
    allFlags.sort((a, b) => {
      const orderA = SEVERITY_ORDER[a.severity] ?? 3;
      const orderB = SEVERITY_ORDER[b.severity] ?? 3;
      return orderA - orderB;
    });

    return allFlags;
  }, [agentResults]);

  // Compteurs par severite
  const counts = useMemo(() => ({
    CRITICAL: consolidatedFlags.filter(f => f.severity === "CRITICAL").length,
    HIGH: consolidatedFlags.filter(f => f.severity === "HIGH").length,
    MEDIUM: consolidatedFlags.filter(f => f.severity === "MEDIUM").length,
    total: consolidatedFlags.length,
  }), [consolidatedFlags]);

  // Ne rien afficher s'il n'y a aucun red flag
  if (counts.total === 0) return null;

  // Determiner le niveau d'alerte global
  const hasCritical = counts.CRITICAL > 0;
  const hasHigh = counts.HIGH > 0;

  return (
    <Card className={cn(
      "border-2",
      hasCritical ? "border-red-300 bg-gradient-to-b from-red-50/80 to-white" :
      hasHigh ? "border-orange-300 bg-gradient-to-b from-orange-50/50 to-white" :
      "border-yellow-300 bg-gradient-to-b from-yellow-50/50 to-white"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className={cn(
              "h-6 w-6",
              hasCritical ? "text-red-600" : hasHigh ? "text-orange-500" : "text-yellow-500"
            )} />
            <CardTitle className="text-lg">
              Red Flags ({counts.total})
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {counts.CRITICAL > 0 && (
              <Badge className="bg-red-500 text-white border-0">
                {counts.CRITICAL} Critique{counts.CRITICAL > 1 ? "s" : ""}
              </Badge>
            )}
            {counts.HIGH > 0 && (
              <Badge className="bg-orange-500 text-white border-0">
                {counts.HIGH} Eleve{counts.HIGH > 1 ? "s" : ""}
              </Badge>
            )}
            {counts.MEDIUM > 0 && (
              <Badge className="bg-yellow-500 text-black border-0">
                {counts.MEDIUM} Moyen{counts.MEDIUM > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Vue consolidee de tous les risques detectes par les {agentResults.filter(a => a.redFlags.length > 0).length} agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {consolidatedFlags.map((flag, i) => {
          const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.MEDIUM;
          return (
            <div
              key={`${flag.agentName}-${flag.id ?? i}`}
              className={cn(
                "p-3 rounded-lg border",
                style.bg,
                style.border,
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", style.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn("font-medium text-sm", style.text)}>
                      {flag.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] shrink-0", getSeverityColor(flag.severity))}
                    >
                      {style.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] shrink-0 bg-muted">
                      {formatAgentName(flag.agentName)}
                    </Badge>
                  </div>
                  {flag.evidence && (
                    <p className="text-xs text-muted-foreground">{flag.evidence}</p>
                  )}
                  {flag.impact && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Impact :</span> {flag.impact}
                    </p>
                  )}
                  {flag.question && (
                    <p className="text-xs mt-1.5 flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-blue-500" />
                      <span className="text-blue-700">{flag.question}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});

RedFlagsSummary.displayName = "RedFlagsSummary";
