"use client";

import { memo } from "react";
import { AnalysisErrorBoundary } from "@/components/error-boundary";
import { AnalysisPanel } from "./analysis-panel";

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface SavedAnalysis {
  id: string;
  type: string;
  mode: string | null;
  status: string;
  totalAgents: number;
  completedAgents: number;
  summary: string | null;
  results: Record<string, AgentResult> | null;
  startedAt: string | null;
  completedAt: string | null;
  totalCost: string | null;
  totalTimeMs: number | null;
  createdAt: string;
}

interface AnalysisPanelWrapperProps {
  dealId: string;
  dealName: string;
  currentStatus: string;
  analyses?: SavedAnalysis[];
}

export const AnalysisPanelWrapper = memo(function AnalysisPanelWrapper({
  dealId,
  dealName,
  currentStatus,
  analyses,
}: AnalysisPanelWrapperProps) {
  return (
    <AnalysisErrorBoundary dealId={dealId}>
      <AnalysisPanel
        dealId={dealId}
        dealName={dealName}
        currentStatus={currentStatus}
        analyses={analyses}
      />
    </AnalysisErrorBoundary>
  );
});
