"use client";

import { useMemo, memo, useState, useCallback } from "react";
import { AlertTriangle, ShieldAlert, ChevronRight, ChevronDown, Users, CheckCircle2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAgentName, getSeverityColor } from "@/lib/format-utils";
import { consolidateRedFlagsFromAgents, type ConsolidatedFlag, type AgentRedFlagsInput } from "@/services/red-flag-dedup/consolidate";
import { ResolutionDialog } from "./resolution-dialog";
import { ResolutionBadge } from "./resolution-badge";
import type { AlertResolution, CreateResolutionInput } from "@/hooks/use-resolutions";

interface RedFlagsSummaryProps {
  agentResults: AgentRedFlagsInput[];
  resolutionMap?: Record<string, AlertResolution>;
  onResolve?: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve?: (alertKey: string) => Promise<unknown>;
  isResolving?: boolean;
}

import { SEVERITY_STYLES, SEVERITY_ORDER } from "@/lib/ui-configs";

// ConsolidatedFlag imported from @/services/red-flag-dedup/consolidate

/**
 * RedFlagsSummary - Vue consolidee et DEDUPLIQUEE de tous les red flags.
 * Supports resolution: BA can mark flags as RESOLVED or ACCEPTED.
 */
export const RedFlagsSummary = memo(function RedFlagsSummary({
  agentResults,
  resolutionMap,
  onResolve,
  onUnresolve,
  isResolving = false,
}: RedFlagsSummaryProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [dialogFlag, setDialogFlag] = useState<ConsolidatedFlag | null>(null);
  const [showResolved, setShowResolved] = useState(true);

  // Consolidate and deduplicate red flags by topic (shared logic)
  const consolidatedFlags = useMemo(() => {
    const consolidated = consolidateRedFlagsFromAgents(agentResults);
    return consolidated.sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      return b.detectedBy.length - a.detectedBy.length;
    });
  }, [agentResults]);

  // Counts
  const counts = useMemo(() => {
    const rawTotal = agentResults.reduce((sum, a) => sum + a.redFlags.length, 0);
    let resolvedCount = 0;
    for (const f of consolidatedFlags) {
      if (resolutionMap?.[f.alertKey]) resolvedCount++;
    }
    return {
      CRITICAL: consolidatedFlags.filter(f => f.severity === "CRITICAL").length,
      HIGH: consolidatedFlags.filter(f => f.severity === "HIGH").length,
      MEDIUM: consolidatedFlags.filter(f => f.severity === "MEDIUM").length,
      LOW: consolidatedFlags.filter(f => f.severity === "LOW").length,
      consolidated: consolidatedFlags.length,
      raw: rawTotal,
      resolved: resolvedCount,
      open: consolidatedFlags.length - resolvedCount,
    };
  }, [consolidatedFlags, agentResults, resolutionMap]);

  const handleResolve = useCallback(async (flag: ConsolidatedFlag, status: "RESOLVED" | "ACCEPTED", justification: string) => {
    if (!onResolve) return;
    await onResolve({
      alertKey: flag.alertKey,
      alertType: "RED_FLAG",
      status,
      justification,
      alertTitle: flag.title,
      alertSeverity: flag.severity,
      alertCategory: flag.topic,
    });
  }, [onResolve]);

  if (counts.consolidated === 0) return null;

  const hasCritical = counts.CRITICAL > 0;
  const hasHigh = counts.HIGH > 0;

  const toggleTopic = useCallback((topic: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }, []);

  return (
    <>
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
                Red Flags ({counts.open}/{counts.consolidated})
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {counts.resolved > 0 && (
                <button
                  type="button"
                  onClick={() => setShowResolved(prev => !prev)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {counts.resolved} traite{counts.resolved > 1 ? "s" : ""}
                  <span className="text-[10px]">({showResolved ? "masquer" : "afficher"})</span>
                </button>
              )}
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
            const resolution = resolutionMap?.[flag.alertKey];
            const flagIsResolved = !!resolution;

            // Skip resolved flags if hidden
            if (flagIsResolved && !showResolved) return null;

            return (
              <div
                key={flag.topic}
                className={cn(
                  "p-3 rounded-lg border transition-opacity",
                  flagIsResolved ? "bg-muted/30 border-muted opacity-60" : `${style.bg} ${style.border}`,
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4 shrink-0 mt-0.5",
                    flagIsResolved ? "text-muted-foreground" : style.icon,
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn(
                        "font-medium text-sm",
                        flagIsResolved ? "text-muted-foreground line-through" : style.text,
                      )}>
                        {flag.title}
                      </span>
                      {flagIsResolved && resolution ? (
                        <ResolutionBadge
                          status={resolution.status as "RESOLVED" | "ACCEPTED"}
                          justification={resolution.justification}
                          onRevert={onUnresolve ? () => onUnresolve(flag.alertKey) : undefined}
                        />
                      ) : (
                        <>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] shrink-0", getSeverityColor(flag.severity))}
                          >
                            {style.label}
                          </Badge>
                          {onResolve && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => setDialogFlag(flag)}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Traiter
                            </Button>
                          )}
                        </>
                      )}
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
                    {!flagIsResolved && (
                      <>
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
                      </>
                    )}
                    {/* Show duplicate details when expanded */}
                    {hasMultiple && !flagIsResolved && (
                      <button
                        type="button"
                        onClick={() => toggleTopic(flag.topic)}
                        className="text-xs text-muted-foreground mt-2 flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                        {isExpanded ? "Masquer" : "Voir"} les {flag.duplicates.length} detections
                      </button>
                    )}
                    {isExpanded && !flagIsResolved && (
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

      {/* Resolution Dialog */}
      {dialogFlag && (
        <ResolutionDialog
          open={!!dialogFlag}
          onOpenChange={(open) => { if (!open) setDialogFlag(null); }}
          alertTitle={dialogFlag.title}
          alertSeverity={SEVERITY_STYLES[dialogFlag.severity]?.label ?? dialogFlag.severity}
          alertDescription={dialogFlag.description}
          onSubmit={(status, justification) => handleResolve(dialogFlag, status, justification)}
          isSubmitting={isResolving}
        />
      )}
    </>
  );
});
