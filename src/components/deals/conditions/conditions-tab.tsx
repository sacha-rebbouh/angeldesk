"use client";

import React, { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, Brain, Layers, BarChart3, Clock, Handshake,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { useResolutions } from "@/hooks/use-resolutions";
import { SimpleModeForm } from "./simple-mode-form";
import { StructuredModeForm } from "./structured-mode-form";
import { TermSheetSuggestions } from "./term-sheet-suggestions";
import {
  ConditionsScoreCard,
  NegotiationAdviceCard,
  RedFlagsCard,
  InsightsCard,
  StructuredAssessmentCard,
} from "./conditions-analysis-cards";
import type {
  DealTermsData,
  DealMode,
  TermsResponse,
  TrancheData,
} from "./types";
import { EMPTY_TERMS } from "./types";

// Lazy-load heavy sub-tab components (Recharts, timeline, benchmarks API)
const DilutionSimulator = dynamic(() => import("./dilution-simulator").then(m => ({ default: m.DilutionSimulator })), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>,
});
const PercentileComparator = dynamic(() => import("./percentile-comparator").then(m => ({ default: m.PercentileComparator })), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>,
});
const VersionTimeline = dynamic(() => import("./version-timeline").then(m => ({ default: m.VersionTimeline })), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>,
});

interface ConditionsTabProps {
  dealId: string;
  stage?: string | null;
  initialData?: TermsResponse;
  termSheetDoc?: { id: string; name: string } | null;
}

export const ConditionsTab = React.memo(function ConditionsTab({ dealId, stage, initialData, termSheetDoc }: ConditionsTabProps) {
  const queryClient = useQueryClient();
  const {
    resolutionMap,
    resolve: resolveAlert,
    unresolve: unresolveAlert,
    isResolving,
  } = useResolutions(dealId);
  const [form, setForm] = useState<DealTermsData>(EMPTY_TERMS);
  const [mode, setMode] = useState<DealMode>("SIMPLE");
  const [tranches, setTranches] = useState<TrancheData[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("conditions");

  // Fetch existing terms — uses SSR-prefetched initialData to avoid spinner on first render
  const { data, isLoading } = useQuery<TermsResponse>({
    queryKey: queryKeys.dealTerms.byDeal(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms`);
      if (!res.ok) throw new Error("Failed to fetch terms");
      return res.json();
    },
    initialData,
    staleTime: 60_000,
  });

  // Initialize form when data loads
  React.useEffect(() => {
    if (data?.terms) {
      setForm(data.terms);
      setHasChanges(false);
    }
    if (data?.mode) {
      setMode(data.mode);
    }
    if (data?.tranches) {
      setTranches(data.tranches);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: { terms: Partial<DealTermsData>; mode: DealMode; tranches?: TrancheData[] }) => {
      const res = await fetch(`/api/deals/${dealId}/terms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur lors de la sauvegarde");
      }
      return res.json() as Promise<TermsResponse & { analysisStatus: string }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.dealTerms.byDeal(dealId), result);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dealTerms.versions(dealId) });
      setHasChanges(false);
      if (result.analysisStatus === "success") {
        toast.success("Conditions sauvegardees et analysees par l'IA");
      } else if (result.analysisStatus === "timeout") {
        toast.warning("Conditions sauvegardees. L'analyse IA a pris trop de temps — reessayez.");
      } else {
        toast.warning("Conditions sauvegardees. L'analyse IA a echoue — reessayez.");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateField = useCallback(<K extends keyof DealTermsData>(key: K, value: DealTermsData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    if (mode === "STRUCTURED") {
      saveMutation.mutate({ terms: form, mode, tranches });
    } else {
      saveMutation.mutate({ terms: form, mode });
    }
  }, [form, mode, tranches, saveMutation]);

  // AI Analysis section (memoized)
  const analysisSection = useMemo(() => {
    const conditionsScore = data?.conditionsScore;
    if (conditionsScore == null) return null;

    const breakdown = data?.conditionsBreakdown ?? null;
    const negotiationAdvice = data?.negotiationAdvice ?? data?.conditionsAnalysis?.negotiationAdvice ?? [];
    const redFlags = data?.redFlags ?? [];
    const crossRefInsights = data?.conditionsAnalysis?.crossReferenceInsights ?? [];
    const narrative = data?.narrative ?? null;
    const structuredAssessment = data?.conditionsAnalysis?.structuredAssessment ?? null;

    return (
      <div className="space-y-4">
        <ConditionsScoreCard score={conditionsScore} breakdown={breakdown} narrative={narrative} />
        {structuredAssessment && <StructuredAssessmentCard assessment={structuredAssessment} />}
        {negotiationAdvice.length > 0 && (
          <NegotiationAdviceCard
            advice={negotiationAdvice}
            resolutionMap={resolutionMap}
            onResolve={resolveAlert}
            onUnresolve={unresolveAlert}
            isResolving={isResolving}
          />
        )}
        {redFlags.length > 0 && (
          <RedFlagsCard
            redFlags={redFlags}
            resolutionMap={resolutionMap}
            onResolve={resolveAlert}
            onUnresolve={unresolveAlert}
            isResolving={isResolving}
          />
        )}
        <InsightsCard insights={crossRefInsights} narrative={narrative} />
      </div>
    );
  }, [data, resolutionMap, resolveAlert, unresolveAlert, isResolving]);

  // Empty state
  const isEmpty = !data?.terms && !data?.conditionsScore && (data?.tranches ?? []).length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Onboarding empty state
  if (isEmpty && !hasChanges) {
    return (
      <TooltipProvider>
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <Handshake className="h-16 w-16 text-muted-foreground/30" />
          <div>
            <h3 className="text-lg font-semibold">Conditions du deal</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Renseignez les conditions d&apos;investissement (valorisation, instrument, protections)
              pour obtenir une analyse IA complete avec score, red flags et conseils de negociation.
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { setMode("SIMPLE"); setHasChanges(true); }}>
              <FileText className="mr-2 h-4 w-4" />
              Remplir les conditions
            </Button>
            <Button variant="outline" onClick={() => { setMode("STRUCTURED"); setHasChanges(true); }}>
              <Layers className="mr-2 h-4 w-4" />
              Deal structure (multi-tranches)
            </Button>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Top bar: Mode + Save */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "SIMPLE" ? "default" : "outline"}
              size="sm"
              onClick={() => { setMode("SIMPLE"); setHasChanges(true); }}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Simple
            </Button>
            <Button
              variant={mode === "STRUCTURED" ? "default" : "outline"}
              size="sm"
              onClick={() => { setMode("STRUCTURED"); setHasChanges(true); }}
            >
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              Structure
            </Button>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyse IA des conditions...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                {hasChanges ? "Sauvegarder et analyser" : "Aucune modification"}
              </>
            )}
          </Button>
        </div>

        {/* Sub-tabs */}
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList>
            <TabsTrigger value="conditions">
              <Handshake className="mr-1.5 h-3.5 w-3.5" />
              Conditions
            </TabsTrigger>
            <TabsTrigger value="simulator">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Simulateur
            </TabsTrigger>
            <TabsTrigger value="comparator">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Comparateur
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conditions" className="space-y-6">
            {/* Term sheet suggestions banner */}
            {termSheetDoc && isEmpty && (
              <TermSheetSuggestions
                dealId={dealId}
                termSheetDocId={termSheetDoc.id}
                termSheetDocName={termSheetDoc.name}
                onApply={(suggestions) => {
                  setForm(prev => ({ ...prev, ...suggestions }));
                  setHasChanges(true);
                }}
              />
            )}

            {/* AI Analysis */}
            {analysisSection}

            {/* Form based on mode */}
            {mode === "SIMPLE" ? (
              <SimpleModeForm form={form} updateField={updateField} />
            ) : (
              <StructuredModeForm
                tranches={tranches}
                onTranchesChange={(updated) => {
                  setTranches(updated);
                  setHasChanges(true);
                }}
              />
            )}

            {/* Bottom save button (sticky) */}
            {hasChanges && (
              <div className="sticky bottom-4 flex justify-end">
                <Button
                  size="lg"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="shadow-lg"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyse IA des conditions...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Sauvegarder et analyser
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="simulator">
            <DilutionSimulator
              dealId={dealId}
              initialPreMoney={form.valuationPre}
              initialInvestment={form.amountRaised}
              initialEsop={form.esopPct}
            />
          </TabsContent>

          <TabsContent value="comparator">
            <PercentileComparator dealId={dealId} />
          </TabsContent>

          <TabsContent value="history">
            <VersionTimeline dealId={dealId} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
});
