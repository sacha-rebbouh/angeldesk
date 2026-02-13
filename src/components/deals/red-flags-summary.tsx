"use client";

import { useMemo, memo, useState } from "react";
import { AlertTriangle, ShieldAlert, ChevronRight, ChevronDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAgentName, getSeverityColor } from "@/lib/format-utils";
import { inferRedFlagTopic } from "@/services/red-flag-dedup";

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

/** A consolidated red flag with dedup info */
interface ConsolidatedFlag {
  topic: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description?: string;
  evidence?: string;
  impact?: string;
  question?: string;
  detectedBy: string[];
  /** All individual red flags that were merged into this one */
  duplicates: (RedFlag & { agentName: string })[];
}

/**
 * RedFlagsSummary - Vue consolidee et DEDUPLIQUEE de tous les red flags.
 *
 * Utilise inferRedFlagTopic() pour regrouper les red flags qui parlent du meme sujet
 * (ex: ARR/MRR inconsistency detectee par 5 agents differents = 1 seul red flag).
 * Affiche le nombre d'agents qui ont detecte chaque red flag comme signal de confiance.
 */
export const RedFlagsSummary = memo(function RedFlagsSummary({
  agentResults,
}: RedFlagsSummaryProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // Consolidate and deduplicate red flags by topic
  const consolidatedFlags = useMemo(() => {
    const topicMap = new Map<string, ConsolidatedFlag>();

    for (const agent of agentResults) {
      for (const rf of agent.redFlags) {
        const topic = inferRedFlagTopic(rf.title, rf.category);
        const existing = topicMap.get(topic);

        if (existing) {
          // Merge: keep highest severity, longest description, all agents
          if (SEVERITY_ORDER[rf.severity] < SEVERITY_ORDER[existing.severity]) {
            existing.severity = rf.severity;
          }
          if (!existing.detectedBy.includes(agent.agentName)) {
            existing.detectedBy.push(agent.agentName);
          }
          // Keep the most detailed description
          if (rf.description && (!existing.description || rf.description.length > existing.description.length)) {
            existing.description = rf.description;
          }
          // Keep evidence if more specific
          if (rf.evidence && (!existing.evidence || rf.evidence.length > existing.evidence.length)) {
            existing.evidence = rf.evidence;
          }
          // Keep impact if more detailed
          if (rf.impact && (!existing.impact || rf.impact.length > existing.impact.length)) {
            existing.impact = rf.impact;
          }
          // Keep question if better
          if (rf.question && (!existing.question || rf.question.length > existing.question.length)) {
            existing.question = rf.question;
          }
          existing.duplicates.push({ ...rf, agentName: agent.agentName });
        } else {
          topicMap.set(topic, {
            topic,
            severity: rf.severity,
            title: rf.title,
            description: rf.description,
            evidence: rf.evidence,
            impact: rf.impact,
            question: rf.question,
            detectedBy: [agent.agentName],
            duplicates: [{ ...rf, agentName: agent.agentName }],
          });
        }
      }
    }

    // Sort: severity first, then detection count (more agents = higher confidence)
    return Array.from(topicMap.values()).sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      return b.detectedBy.length - a.detectedBy.length;
    });
  }, [agentResults]);

  // Counts
  const counts = useMemo(() => {
    const rawTotal = agentResults.reduce((sum, a) => sum + a.redFlags.length, 0);
    return {
      CRITICAL: consolidatedFlags.filter(f => f.severity === "CRITICAL").length,
      HIGH: consolidatedFlags.filter(f => f.severity === "HIGH").length,
      MEDIUM: consolidatedFlags.filter(f => f.severity === "MEDIUM").length,
      consolidated: consolidatedFlags.length,
      raw: rawTotal,
    };
  }, [consolidatedFlags, agentResults]);

  if (counts.consolidated === 0) return null;

  const hasCritical = counts.CRITICAL > 0;
  const hasHigh = counts.HIGH > 0;

  const toggleTopic = (topic: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

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
              Red Flags ({counts.consolidated})
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {counts.raw > counts.consolidated && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {counts.raw} bruts → {counts.consolidated} uniques
              </Badge>
            )}
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
        {consolidatedFlags.map((flag) => {
          const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.MEDIUM;
          const isExpanded = expandedTopics.has(flag.topic);
          const hasMultiple = flag.detectedBy.length > 1;

          return (
            <div
              key={flag.topic}
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
                    {flag.detectedBy.map(agent => (
                      <Badge key={agent} variant="outline" className="text-[10px] shrink-0 bg-muted">
                        {formatAgentName(agent)}
                      </Badge>
                    ))}
                    {hasMultiple && (
                      <Badge variant="secondary" className="text-[10px] shrink-0 gap-0.5">
                        <Users className="h-3 w-3" />
                        {flag.detectedBy.length} agents
                      </Badge>
                    )}
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
                  {/* Show duplicate details when expanded */}
                  {hasMultiple && (
                    <button
                      onClick={() => toggleTopic(flag.topic)}
                      className="text-xs text-muted-foreground mt-2 flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                      {isExpanded ? "Masquer" : "Voir"} les {flag.duplicates.length} detections
                    </button>
                  )}
                  {isExpanded && (
                    <div className="mt-2 pl-2 border-l-2 border-muted space-y-1">
                      {flag.duplicates.map((dup, i) => (
                        <div key={`${dup.agentName}-${i}`} className="text-xs text-muted-foreground">
                          <span className="font-medium">{formatAgentName(dup.agentName)}:</span>{" "}
                          {dup.title !== flag.title ? dup.title : dup.evidence ?? dup.description ?? "—"}
                        </div>
                      ))}
                    </div>
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
