"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalysisCompleteView } from "./analysis-complete-view";
import { AnalysisInvestorView } from "./analysis-investor-view";
import { AnalysisMemoFull } from "./analysis-memo-full";

interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

interface AnalysisThesis {
  reformulated?: string | null;
  problem?: string | null;
  solution?: string | null;
  whyNow?: string | null;
  moat?: string | null;
  verdict?: string | null;
  confidence?: number | null;
}

interface AnalysisPreviewTabsProps {
  dealName: string;
  results: Record<string, AgentResult>;
  thesis?: AnalysisThesis | null;
  totalTimeMs?: number | null;
  totalCost?: number | null;
}

export const AnalysisPreviewTabs = memo(function AnalysisPreviewTabs({
  dealName,
  results,
  thesis,
  totalTimeMs,
  totalCost,
}: AnalysisPreviewTabsProps) {
  const entries = Object.entries(results);
  const memoLabel = results["memo-generator"]?.success ? "Mémo d’investissement" : "Dossier de décision";

  return (
    <Tabs defaultValue="investor" className="gap-4">
      <TabsList className="flex w-full justify-start overflow-x-auto">
        <TabsTrigger value="investor">Vue investisseur</TabsTrigger>
        <TabsTrigger value="memo" className="gap-1.5">
          {memoLabel}
        </TabsTrigger>
        <TabsTrigger value="complete" className="gap-1.5">
          Analyses détaillées
          <Badge variant="secondary" className="ml-1 text-xs">{entries.length}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="investor" className="mt-0">
        <AnalysisInvestorView
          dealName={dealName}
          results={results}
          thesis={thesis}
          totalTimeMs={totalTimeMs}
          totalCost={totalCost}
        />
      </TabsContent>

      <TabsContent value="memo" className="mt-0">
        <AnalysisMemoFull
          dealName={dealName}
          results={results}
          totalTimeMs={totalTimeMs}
          totalCost={totalCost}
        />
      </TabsContent>

      <TabsContent value="complete" className="mt-0">
        <AnalysisCompleteView results={results} />
      </TabsContent>
    </Tabs>
  );
});
