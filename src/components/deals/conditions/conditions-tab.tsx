"use client";

import React, { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, Brain, Layers, TrendingDown, Target, Clock, Handshake,
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
  ConditionsHeroCard,
  ConditionsQuestionsCard,
  NegotiationAdviceCard,
  RedFlagsCard,
  CrossReferenceInsightsCard,
  StructuredAssessmentCard,
} from "./conditions-analysis-cards";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [pendingMode, setPendingMode] = useState<DealMode | null>(null);

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

  const validateTerms = useCallback((formData: DealTermsData): string | null => {
    if (formData.dilutionPct != null && (formData.dilutionPct < 0 || formData.dilutionPct > 100)) {
      return "La dilution doit etre entre 0% et 100%";
    }
    if (formData.vestingCliffMonths != null && formData.vestingDurationMonths != null
        && formData.vestingCliffMonths > formData.vestingDurationMonths) {
      return "Le cliff ne peut pas depasser la duree du vesting";
    }
    if (formData.esopPct != null && (formData.esopPct < 0 || formData.esopPct > 100)) {
      return "L'ESOP doit etre entre 0% et 100%";
    }
    if (formData.valuationPre != null && formData.valuationPre <= 0) {
      return "La valorisation doit etre positive";
    }
    if (formData.amountRaised != null && formData.amountRaised <= 0) {
      return "Le montant leve doit etre positif";
    }
    return null;
  }, []);

  const handleSave = useCallback(() => {
    const error = validateTerms(form);
    if (error) {
      toast.error(error);
      return;
    }
    if (mode === "STRUCTURED") {
      saveMutation.mutate({ terms: form, mode, tranches });
    } else {
      saveMutation.mutate({ terms: form, mode });
    }
  }, [form, mode, tranches, saveMutation, validateTerms]);

  const handleApplyTermSheet = useCallback((suggestions: Partial<DealTermsData>) => {
    setForm(prev => ({ ...prev, ...suggestions }));
    setHasChanges(true);
  }, []);

  const handleModeSwitch = useCallback((newMode: DealMode) => {
    if (newMode === mode) return;
    if (hasChanges) {
      setPendingMode(newMode);
    } else {
      setMode(newMode);
    }
  }, [mode, hasChanges]);

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
    const questions = data?.questions ?? [];
    const valuation = data?.conditionsAnalysis?.valuation ?? null;

    return (
      <div className="space-y-4">
        {/* Hero — verdict at a glance (replaces VerdictSummary + ScoreCard) */}
        <ConditionsHeroCard
          score={conditionsScore}
          breakdown={breakdown}
          narrative={narrative}
          valuation={valuation}
          redFlagCount={redFlags.length}
          onOpenSimulator={() => setActiveSubTab("simulator")}
          onOpenComparator={() => setActiveSubTab("comparator")}
        />

        {structuredAssessment && <StructuredAssessmentCard assessment={structuredAssessment} />}

        <NegotiationAdviceCard
          advice={negotiationAdvice}
          talkingPoints={narrative?.forNegotiation}
          resolutionMap={resolutionMap}
          onResolve={resolveAlert}
          onUnresolve={unresolveAlert}
          isResolving={isResolving}
        />

        {questions.length > 0 && <ConditionsQuestionsCard questions={questions} />}

        <RedFlagsCard
          redFlags={redFlags}
          resolutionMap={resolutionMap}
          onResolve={resolveAlert}
          onUnresolve={unresolveAlert}
          isResolving={isResolving}
        />

        <CrossReferenceInsightsCard insights={crossRefInsights} />
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
          <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
            <button
              className="flex flex-col items-start gap-2 rounded-lg border-2 border-primary/20 p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => { setMode("SIMPLE"); setHasChanges(true); }}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Conditions simples</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Un seul instrument, protections standard. Ideal pour la majorite des deals early stage.
              </p>
            </button>
            <button
              className="flex flex-col items-start gap-2 rounded-lg border-2 border-muted p-4 text-left hover:border-primary/30 hover:bg-muted/50 transition-colors"
              onClick={() => { setMode("STRUCTURED"); setHasChanges(true); }}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Deal structure</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Multi-tranches avec conditions differentes (CCA + equity, options, milestones).
              </p>
            </button>
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
              onClick={() => handleModeSwitch("SIMPLE")}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Simple
            </Button>
            <Button
              variant={mode === "STRUCTURED" ? "default" : "outline"}
              size="sm"
              onClick={() => handleModeSwitch("STRUCTURED")}
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
              <TrendingDown className="mr-1.5 h-3.5 w-3.5" />
              Simulateur
            </TabsTrigger>
            <TabsTrigger value="comparator">
              <Target className="mr-1.5 h-3.5 w-3.5" />
              Comparateur
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conditions" className="space-y-6">
            {/* Term sheet suggestions banner */}
            {termSheetDoc && (
              <TermSheetSuggestions
                dealId={dealId}
                termSheetDocId={termSheetDoc.id}
                termSheetDocName={termSheetDoc.name}
                onApply={handleApplyTermSheet}
              />
            )}

            {/* AI Analysis */}
            {analysisSection}
            {!analysisSection && data?.terms && (
              <div className="rounded-lg border border-dashed border-primary/20 bg-primary/5 p-6 text-center space-y-2">
                <Brain className="mx-auto h-8 w-8 text-primary/30" />
                <p className="text-sm font-medium">Analyse IA non disponible</p>
                <p className="text-xs text-muted-foreground">
                  Cliquez &quot;Sauvegarder et analyser&quot; pour obtenir le score, les red flags et les conseils de negociation.
                </p>
              </div>
            )}

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

            {/* Spacer for sticky button */}
            {hasChanges && <div className="h-16" />}
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

      {/* Mode switch confirmation dialog */}
      <AlertDialog open={pendingMode !== null} onOpenChange={(open) => { if (!open) setPendingMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non sauvegardees</AlertDialogTitle>
            <AlertDialogDescription>
              Vous avez des modifications non sauvegardees. Changer de mode les effacera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingMode) {
                setMode(pendingMode);
                setHasChanges(true);
              }
              setPendingMode(null);
            }}>
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
});
