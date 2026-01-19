"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { Tier1Results } from "./tier1-results";

interface AnalysisResult {
  sessionId: string;
  success: boolean;
  summary: string;
  totalCost: number;
  totalTimeMs: number;
  results: Record<string, {
    agentName: string;
    success: boolean;
    executionTimeMs: number;
    cost: number;
    error?: string;
    data?: unknown;
  }>;
}

interface AnalysisPanelProps {
  dealId: string;
  currentStatus: string;
}

const ANALYSIS_TYPES = [
  { value: "screening", label: "Screening rapide", description: "~30s" },
  { value: "extraction", label: "Extraction documents", description: "~1min" },
  { value: "full_dd", label: "Due Diligence complete", description: "~2min" },
  { value: "tier1_complete", label: "Investigation Tier 1", description: "12 agents en parallele" },
];

async function runAnalysis(dealId: string, type: string): Promise<{ data: AnalysisResult }> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, type }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to run analysis");
  }

  return response.json();
}

export function AnalysisPanel({ dealId, currentStatus }: AnalysisPanelProps) {
  const queryClient = useQueryClient();
  const [analysisType, setAnalysisType] = useState("screening");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);

  const mutation = useMutation({
    mutationFn: () => runAnalysis(dealId, analysisType),
    onSuccess: (response) => {
      setResult(response.data);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      toast.success("Analyse terminee");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleRunAnalysis = useCallback(() => {
    setResult(null);
    mutation.mutate();
  }, [mutation]);

  const toggleAgentDetails = useCallback(() => {
    setShowAgentDetails(prev => !prev);
  }, []);

  const isRunning = mutation.isPending || currentStatus === "ANALYZING";

  // Check if this is a Tier 1 analysis
  const isTier1Analysis = useMemo(() => {
    if (!result) return false;
    return Object.keys(result.results).some(name =>
      ["financial-auditor", "team-investigator", "competitive-intel", "market-intelligence"].includes(name)
    );
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyse IA</CardTitle>
        <CardDescription>
          Lancez une analyse automatisee du deal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Select value={analysisType} onValueChange={setAnalysisType} disabled={isRunning}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYSIS_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label} ({type.description})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleRunAnalysis} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Lancer l&apos;analyse
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  {result.success ? "Analyse reussie" : "Analyse echouee"}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {(result.totalTimeMs / 1000).toFixed(1)}s | ${result.totalCost.toFixed(4)}
              </div>
            </div>

            {/* Tier 1 Results - Detailed View */}
            {isTier1Analysis && result.success && (
              <Tier1Results results={result.results} />
            )}

            {/* Agent Results - Collapsible for Tier 1 */}
            {isTier1Analysis ? (
              <div className="border rounded-lg">
                <button
                  onClick={toggleAgentDetails}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-sm">
                    Details des agents ({Object.keys(result.results).length})
                  </span>
                  {showAgentDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showAgentDetails && (
                  <div className="p-3 pt-0 border-t space-y-2">
                    {Object.entries(result.results).map(([name, agentResult]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          {agentResult.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium">{formatAgentName(name)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {(agentResult.executionTimeMs / 1000).toFixed(1)}s
                          </span>
                          {agentResult.error && (
                            <Badge variant="destructive">{agentResult.error}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(result.results).map(([name, agentResult]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2">
                      {agentResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{formatAgentName(name)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {(agentResult.executionTimeMs / 1000).toFixed(1)}s
                      </span>
                      {agentResult.error && (
                        <Badge variant="destructive">{agentResult.error}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {result.summary && !isTier1Analysis && (
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">Resume</h4>
                <div className="text-sm whitespace-pre-wrap">{result.summary}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatAgentName(name: string): string {
  const names: Record<string, string> = {
    "deal-screener": "Deal Screener",
    "red-flag-detector": "Red Flag Detector",
    "document-extractor": "Document Extractor",
    "deal-scorer": "Deal Scorer",
    "financial-auditor": "Financial Auditor",
    "team-investigator": "Team Investigator",
    "competitive-intel": "Competitive Intel",
    "deck-forensics": "Deck Forensics",
    "market-intelligence": "Market Intelligence",
    "technical-dd": "Technical DD",
    "legal-regulatory": "Legal & Regulatory",
    "cap-table-auditor": "Cap Table Auditor",
    "gtm-analyst": "GTM Analyst",
    "customer-intel": "Customer Intel",
    "exit-strategist": "Exit Strategist",
    "question-master": "Question Master",
  };
  return names[name] ?? name;
}
