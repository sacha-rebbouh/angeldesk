"use client";

import React, { memo, useState, useCallback, useMemo } from "react";
import { CheckCircle, ShieldCheck, ChevronDown, ChevronUp, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FounderResponseInput } from "./founder-response-input";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import { ResolutionBadge } from "@/components/deals/resolution-badge";
import { ResolutionDialog } from "@/components/deals/resolution-dialog";
import type { CreateResolutionInput } from "@/hooks/use-resolutions";
import type { UnifiedAlert } from "./unified-alert";
import { alertTypeLabel, severityLabel, severityBorderColor, severityBgColor } from "./unified-alert";

interface SuiviDDAlertCardProps {
  alert: UnifiedAlert;
  onResolve: (input: CreateResolutionInput) => Promise<unknown>;
  onUnresolve: (alertKey: string) => Promise<unknown>;
  isResolving: boolean;
  responseAnswer?: string;
  responseStatus?: "answered" | "not_applicable" | "refused" | "pending";
  onResponseChange?: (questionId: string, answer: string, status: "answered" | "not_applicable" | "refused" | "pending") => void;
}

export const SuiviDDAlertCard = memo(function SuiviDDAlertCard({
  alert,
  onResolve,
  onUnresolve,
  isResolving,
  responseAnswer,
  responseStatus,
  onResponseChange,
}: SuiviDDAlertCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPreset, setDialogPreset] = useState<"RESOLVED" | "ACCEPTED">("RESOLVED");

  const isResolved = !!alert.resolution;

  const handleResolve = useCallback(async (status: "RESOLVED" | "ACCEPTED", justification: string) => {
    await onResolve({
      alertKey: alert.alertKey,
      alertType: alert.alertType,
      status,
      justification,
      alertTitle: alert.title,
      alertSeverity: alert.severity,
      alertCategory: alert.subType,
    });
    setDialogOpen(false);
  }, [onResolve, alert.alertKey, alert.alertType, alert.title, alert.severity, alert.subType]);

  const openDialog = useCallback((preset: "RESOLVED" | "ACCEPTED") => {
    setDialogPreset(preset);
    setDialogOpen(true);
  }, []);

  const handleUnresolve = useCallback(() => onUnresolve(alert.alertKey), [onUnresolve, alert.alertKey]);

  const hasDetails = useMemo(
    () => !!(alert.description || alert.evidence || alert.impact || alert.resolutionPath || alert.suggestedArgument),
    [alert.description, alert.evidence, alert.impact, alert.resolutionPath, alert.suggestedArgument],
  );

  return (
    <>
      <div className={cn(
        "rounded-lg border-l-4 border bg-card p-4 transition-opacity",
        severityBorderColor(alert.severity),
        isResolved && "opacity-50",
      )}>
        {/* Header row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={cn("text-[10px] text-white border-0 shrink-0", severityBgColor(alert.severity))}>
                {severityLabel(alert.severity)}
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {alert.mergedFrom
                  ? [...new Set(alert.mergedFrom)].map(alertTypeLabel).join(" + ")
                  : alertTypeLabel(alert.alertType)}
              </Badge>
              {alert.dealBreakerLevel && (
                <Badge variant="outline" className="text-[10px] shrink-0 text-red-700 border-red-200">
                  {alert.dealBreakerLevel === "ABSOLUTE" ? "Dealbreaker" : "Conditionnel"}
                </Badge>
              )}
              <span className={cn("font-medium text-sm", isResolved && "line-through text-muted-foreground")}>
                {alert.title}
              </span>
            </div>

            {/* Source agents */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
              {alert.detectedBy && alert.detectedBy.length > 1 ? (
                <>
                  <Users className="h-3 w-3" />
                  <span>{alert.detectedBy.length} agents</span>
                  <span className="text-muted-foreground/50">·</span>
                  {alert.detectedBy.map((a, i) => (
                    <React.Fragment key={a}>
                      {i > 0 && <span className="text-muted-foreground/50">·</span>}
                      {formatAgentName(a)}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <span>{formatAgentName(alert.source)}</span>
              )}
              {alert.duplicateCount && alert.duplicateCount > 1 && (
                <Badge variant="secondary" className="text-[10px] h-4">
                  {alert.duplicateCount} detections
                </Badge>
              )}
            </div>
          </div>

          {/* Resolution status / buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isResolved && alert.resolution ? (
              <ResolutionBadge
                status={alert.resolution.status as "RESOLVED" | "ACCEPTED"}
                justification={alert.resolution.justification}
                onRevert={handleUnresolve}
              />
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => openDialog("RESOLVED")}
                >
                  <CheckCircle className="h-3 w-3" />
                  Resolu
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => openDialog("ACCEPTED")}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Accepte
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Expandable details (always visible, even when resolved) */}
        {hasDetails && (
          <>
            {expanded && (
              <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {alert.evidence && (
                  <p><span className="font-medium text-foreground/80">Evidence :</span> {alert.evidence}</p>
                )}
                {alert.impact && (
                  <p><span className="font-medium text-foreground/80">Impact :</span> {alert.impact}</p>
                )}
                {alert.description && !alert.evidence && (
                  <p>{alert.description}</p>
                )}
                {alert.resolutionPath && (
                  <p className="text-blue-700"><span className="font-medium">Piste de resolution :</span> {alert.resolutionPath}</p>
                )}
                {alert.suggestedArgument && (
                  <p className="text-blue-700"><span className="font-medium">Argument de nego :</span> {alert.suggestedArgument}</p>
                )}
                {alert.leverageSource && (
                  <p className="text-xs text-muted-foreground/70"><span className="font-medium">Levier :</span> {alert.leverageSource}</p>
                )}
              </div>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(prev => !prev)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Masquer" : "Details"}
            </button>
          </>
        )}

        {/* Linked question + response (visible even when resolved, but read-only) */}
        {alert.linkedQuestion && (
          <div className="mt-3 rounded-md border bg-blue-50/50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">{alert.linkedQuestion.question}</p>
            </div>
            {onResponseChange && (
              <FounderResponseInput
                questionId={alert.linkedQuestion!.questionId}
                answer={responseAnswer ?? ""}
                status={responseStatus ?? "pending"}
                disabled={isResolved}
                onChange={onResponseChange}
              />
            )}
            {!onResponseChange && alert.linkedResponse?.answer && (
              <p className="text-sm text-muted-foreground pl-5">
                <span className="font-medium">Reponse :</span> {alert.linkedResponse.answer}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Resolution dialog */}
      <ResolutionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        alertTitle={alert.title}
        alertSeverity={severityLabel(alert.severity)}
        alertDescription={alert.description}
        onSubmit={handleResolve}
        isSubmitting={isResolving}
        existingStatus={dialogPreset}
      />
    </>
  );
});
