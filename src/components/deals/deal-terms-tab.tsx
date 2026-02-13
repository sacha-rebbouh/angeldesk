"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, Brain, ChevronDown, ChevronUp,
  AlertTriangle, Lightbulb, MessageSquare, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface DealTermsTabProps {
  dealId: string;
  stage?: string | null;
}

interface DealTermsData {
  valuationPre: number | null;
  amountRaised: number | null;
  dilutionPct: number | null;
  instrumentType: string | null;
  instrumentDetails: string | null;
  liquidationPref: string | null;
  antiDilution: string | null;
  proRataRights: boolean | null;
  informationRights: boolean | null;
  boardSeat: string | null;
  founderVesting: boolean | null;
  vestingDurationMonths: number | null;
  vestingCliffMonths: number | null;
  esopPct: number | null;
  dragAlong: boolean | null;
  tagAlong: boolean | null;
  ratchet: boolean | null;
  payToPlay: boolean | null;
  milestoneTranches: boolean | null;
  nonCompete: boolean | null;
  customConditions: string | null;
  notes: string | null;
}

interface ScoreBreakdownItem {
  criterion: string;
  weight: number;
  score: number;
  justification: string;
}

interface NegotiationAdviceItem {
  point: string;
  priority: "critical" | "high" | "medium" | "low";
  suggestedArgument: string;
  leverageSource?: string;
}

interface RedFlagItem {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  evidence?: string;
  impact?: string;
  question?: string;
}

interface ConditionsFindings {
  termsSource?: string;
  negotiationAdvice?: NegotiationAdviceItem[];
  crossReferenceInsights?: Array<{ insight: string; sourceAgent: string; impact: string }>;
  [key: string]: unknown;
}

interface NarrativeData {
  oneLiner?: string;
  summary?: string;
  keyInsights?: string[];
  forNegotiation?: string[];
}

interface TermsResponse {
  terms: DealTermsData | null;
  conditionsScore: number | null;
  conditionsBreakdown: ScoreBreakdownItem[] | null;
  conditionsAnalysis: ConditionsFindings | null;
  negotiationAdvice: NegotiationAdviceItem[] | null;
  redFlags: RedFlagItem[] | null;
  narrative: NarrativeData | null;
  analysisStatus?: "success" | "failed" | "timeout" | null;
}

const EMPTY_TERMS: DealTermsData = {
  valuationPre: null,
  amountRaised: null,
  dilutionPct: null,
  instrumentType: null,
  instrumentDetails: null,
  liquidationPref: null,
  antiDilution: null,
  proRataRights: null,
  informationRights: null,
  boardSeat: null,
  founderVesting: null,
  vestingDurationMonths: null,
  vestingCliffMonths: null,
  esopPct: null,
  dragAlong: null,
  tagAlong: null,
  ratchet: null,
  payToPlay: null,
  milestoneTranches: null,
  nonCompete: null,
  customConditions: null,
  notes: null,
};

function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-800 border-red-200";
    case "high": return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default: return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "critical": return "Critique";
    case "high": return "Haute";
    case "medium": return "Moyenne";
    default: return "Basse";
  }
}

// -- Score Display --
const ConditionsScoreCard = React.memo(function ConditionsScoreCard({
  score,
  breakdown,
  narrative,
}: {
  score: number;
  breakdown: ScoreBreakdownItem[] | null;
  narrative: NarrativeData | null;
}) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Analyse IA des conditions</CardTitle>
          </div>
          <span className={cn("text-3xl font-bold", getScoreTextColor(score))}>
            {score}<span className="text-sm font-normal text-muted-foreground">/100</span>
          </span>
        </div>
        {narrative?.oneLiner && (
          <CardDescription className="mt-1">{narrative.oneLiner}</CardDescription>
        )}
      </CardHeader>
      {breakdown && breakdown.length > 0 && (
        <CardContent className="pt-0 space-y-3">
          {breakdown.map((item) => (
            <div key={item.criterion} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.criterion}
                  <span className="text-xs ml-1 text-muted-foreground/60">({Math.round(item.weight * 100)}%)</span>
                </span>
                <span className={cn("font-semibold", getScoreTextColor(item.score))}>
                  {item.score}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getScoreBarColor(item.score))}
                  style={{ width: `${item.score}%` }}
                />
              </div>
              {item.justification && (
                <p className="text-xs text-muted-foreground/80 leading-relaxed">{item.justification}</p>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
});

// -- Negotiation Advice --
const NegotiationAdviceCard = React.memo(function NegotiationAdviceCard({
  advice,
}: {
  advice: NegotiationAdviceItem[];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (advice.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Conseils de negociation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {advice.map((item, idx) => (
          <div
            key={idx}
            className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1">
                <Badge variant="outline" className={cn("shrink-0 text-xs", getSeverityColor(item.priority))}>
                  {getPriorityLabel(item.priority)}
                </Badge>
                <span className="text-sm font-medium">{item.point}</span>
              </div>
              {expandedIdx === idx
                ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
            </div>
            {expandedIdx === idx && (
              <div className="mt-2 pl-2 border-l-2 border-primary/20 space-y-1.5">
                <p className="text-sm text-muted-foreground">{item.suggestedArgument}</p>
                {item.leverageSource && (
                  <p className="text-xs text-muted-foreground/70">
                    <span className="font-medium">Source :</span> {item.leverageSource}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
});

// -- Red Flags --
const RedFlagsCard = React.memo(function RedFlagsCard({
  redFlags,
}: {
  redFlags: RedFlagItem[];
}) {
  if (redFlags.length === 0) return null;

  return (
    <Card className="border-red-200/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <CardTitle className="text-base">Red flags conditions</CardTitle>
          <Badge variant="destructive" className="text-xs">{redFlags.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {redFlags.map((flag) => (
          <div key={flag.id} className="rounded-lg border border-red-200/50 p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className={cn("shrink-0 text-xs", getSeverityColor(flag.severity))}>
                {getPriorityLabel(flag.severity)}
              </Badge>
              <span className="text-sm font-medium">{flag.title}</span>
            </div>
            <p className="text-sm text-muted-foreground">{flag.description}</p>
            {flag.evidence && (
              <p className="text-xs text-muted-foreground/70">
                <span className="font-medium">Preuve :</span> {flag.evidence}
              </p>
            )}
            {flag.question && (
              <div className="flex items-start gap-1.5 mt-1 bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">{flag.question}</p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
});

// -- Cross-Reference Insights --
const InsightsCard = React.memo(function InsightsCard({
  insights,
  narrative,
}: {
  insights: Array<{ insight: string; sourceAgent: string; impact: string }>;
  narrative: NarrativeData | null;
}) {
  const hasInsights = insights.length > 0;
  const hasNarrative = narrative?.keyInsights && narrative.keyInsights.length > 0;
  if (!hasInsights && !hasNarrative) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-500" />
          <CardTitle className="text-base">Insights IA</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {narrative?.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">{narrative.summary}</p>
        )}
        {hasNarrative && (
          <ul className="space-y-1.5">
            {narrative!.keyInsights!.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground">{insight}</span>
              </li>
            ))}
          </ul>
        )}
        {hasInsights && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">Cross-references agents :</p>
            {insights.map((item, idx) => (
              <div key={idx} className="text-sm rounded bg-muted/50 p-2">
                <p className="text-muted-foreground">{item.insight}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Source : {item.sourceAgent} — Impact : {item.impact}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// -- Main Component --
export const DealTermsTab = React.memo(function DealTermsTab({ dealId, stage }: DealTermsTabProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DealTermsData>(EMPTY_TERMS);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch existing terms
  const { data, isLoading } = useQuery<TermsResponse>({
    queryKey: queryKeys.dealTerms.byDeal(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms`);
      if (!res.ok) throw new Error("Failed to fetch terms");
      return res.json();
    },
    staleTime: 30_000,
  });

  // Initialize form when data loads
  React.useEffect(() => {
    if (data?.terms) {
      setForm(data.terms);
      setHasChanges(false);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (terms: Partial<DealTermsData>) => {
      const res = await fetch(`/api/deals/${dealId}/terms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(terms),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur lors de la sauvegarde");
      }
      return res.json() as Promise<TermsResponse>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.dealTerms.byDeal(dealId), result);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
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

  const { mutate } = saveMutation;
  const handleSave = useCallback(() => {
    // Send all fields including nulls (so user can clear previously set values)
    mutate(form);
  }, [form, mutate]);

  const analysisSection = useMemo(() => {
    const conditionsScore = data?.conditionsScore;
    if (conditionsScore == null) return null;

    const breakdown = data?.conditionsBreakdown ?? null;
    const negotiationAdvice = data?.negotiationAdvice ?? data?.conditionsAnalysis?.negotiationAdvice ?? [];
    const redFlags = data?.redFlags ?? [];
    const crossRefInsights = data?.conditionsAnalysis?.crossReferenceInsights ?? [];
    const narrative = data?.narrative ?? null;

    return (
      <div className="space-y-4">
        <ConditionsScoreCard score={conditionsScore} breakdown={breakdown} narrative={narrative} />
        {negotiationAdvice.length > 0 && <NegotiationAdviceCard advice={negotiationAdvice} />}
        {redFlags.length > 0 && <RedFlagsCard redFlags={redFlags} />}
        <InsightsCard insights={crossRefInsights} narrative={narrative} />
      </div>
    );
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Analysis */}
      {analysisSection}

      {/* Save button */}
      <div className="flex justify-end">
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

      {/* Valorisation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valorisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Pre-money (EUR)</Label>
            <Input
              type="number"
              placeholder="Ex: 5000000"
              value={form.valuationPre ?? ""}
              onChange={e => updateField("valuationPre", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Montant leve (EUR)</Label>
            <Input
              type="number"
              placeholder="Ex: 1000000"
              value={form.amountRaised ?? ""}
              onChange={e => updateField("amountRaised", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Dilution (%)</Label>
            <Input
              type="number"
              placeholder="Ex: 15"
              min={0}
              max={100}
              value={form.dilutionPct ?? ""}
              onChange={e => updateField("dilutionPct", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instrument */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instrument</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type d&apos;instrument</Label>
            <Select
              value={form.instrumentType ?? ""}
              onValueChange={v => updateField("instrumentType", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BSA_AIR">BSA-AIR</SelectItem>
                <SelectItem value="BSA_AIR_WITH_CAP_DISCOUNT">BSA-AIR (cap + discount)</SelectItem>
                <SelectItem value="BSA_AIR_WITH_CAP">BSA-AIR (cap uniquement)</SelectItem>
                <SelectItem value="BSA_AIR_NO_CAP">BSA-AIR (sans cap)</SelectItem>
                <SelectItem value="CONVERTIBLE_NOTE">Convertible Note</SelectItem>
                <SelectItem value="EQUITY_ORDINARY">Actions ordinaires</SelectItem>
                <SelectItem value="EQUITY_PREFERRED">Actions de preference</SelectItem>
                <SelectItem value="LOAN">Pret</SelectItem>
                <SelectItem value="MIXED">Mixte</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Details (si mixte/autre)</Label>
            <Input
              placeholder="Decrire l'instrument"
              value={form.instrumentDetails ?? ""}
              onChange={e => updateField("instrumentDetails", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Protections investisseur */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protections investisseur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Liquidation preference</Label>
              <Select
                value={form.liquidationPref ?? ""}
                onValueChange={v => updateField("liquidationPref", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="1x_non_participating">1x Non-participating</SelectItem>
                  <SelectItem value="1x_participating">1x Participating</SelectItem>
                  <SelectItem value="1x_participating_capped">1x Participating (cap)</SelectItem>
                  <SelectItem value="2x_participating">2x Participating</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Anti-dilution</Label>
              <Select
                value={form.antiDilution ?? ""}
                onValueChange={v => updateField("antiDilution", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="weighted_average_broad">Weighted Average (broad)</SelectItem>
                  <SelectItem value="weighted_average_narrow">Weighted Average (narrow)</SelectItem>
                  <SelectItem value="full_ratchet">Full Ratchet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Pro-rata rights</Label>
              <Switch
                checked={form.proRataRights ?? false}
                onCheckedChange={v => updateField("proRataRights", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Information rights</Label>
              <Switch
                checked={form.informationRights ?? false}
                onCheckedChange={v => updateField("informationRights", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Siege au board</Label>
              <Select
                value={form.boardSeat ?? ""}
                onValueChange={v => updateField("boardSeat", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  <SelectItem value="observer">Observateur</SelectItem>
                  <SelectItem value="full_seat">Siege complet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gouvernance / Fondateurs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gouvernance / Fondateurs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Founder vesting</Label>
              <Switch
                checked={form.founderVesting ?? false}
                onCheckedChange={v => updateField("founderVesting", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Vesting (mois)</Label>
              <Input
                type="number"
                placeholder="48"
                min={0}
                value={form.vestingDurationMonths ?? ""}
                onChange={e => updateField("vestingDurationMonths", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliff (mois)</Label>
              <Input
                type="number"
                placeholder="12"
                min={0}
                value={form.vestingCliffMonths ?? ""}
                onChange={e => updateField("vestingCliffMonths", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>ESOP (%)</Label>
              <Input
                type="number"
                placeholder="10"
                min={0}
                max={100}
                value={form.esopPct ?? ""}
                onChange={e => updateField("esopPct", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Drag-along</Label>
              <Switch
                checked={form.dragAlong ?? false}
                onCheckedChange={v => updateField("dragAlong", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Tag-along</Label>
              <Switch
                checked={form.tagAlong ?? false}
                onCheckedChange={v => updateField("tagAlong", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clauses speciales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clauses speciales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">Ratchet</Label>
                <p className="text-xs text-muted-foreground">Anti-dilution agressive</p>
              </div>
              <Switch
                checked={form.ratchet ?? false}
                onCheckedChange={v => updateField("ratchet", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">Pay-to-play</Label>
                <p className="text-xs text-muted-foreground">Obligation de participer</p>
              </div>
              <Switch
                checked={form.payToPlay ?? false}
                onCheckedChange={v => updateField("payToPlay", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">Tranches / Milestones</Label>
                <p className="text-xs text-muted-foreground">Financement conditionnel</p>
              </div>
              <Switch
                checked={form.milestoneTranches ?? false}
                onCheckedChange={v => updateField("milestoneTranches", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">Non-compete</Label>
                <p className="text-xs text-muted-foreground">Clause de non-concurrence</p>
              </div>
              <Switch
                checked={form.nonCompete ?? false}
                onCheckedChange={v => updateField("nonCompete", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes / champ libre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes et conditions specifiques</CardTitle>
          <CardDescription>
            Renseignez ici toute condition non couverte par les champs ci-dessus
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Conditions supplementaires</Label>
            <Textarea
              placeholder="Ex: Clause de sortie conjointe, earn-out, conditions suspensives..."
              rows={3}
              value={form.customConditions ?? ""}
              onChange={e => updateField("customConditions", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes personnelles</Label>
            <Textarea
              placeholder="Vos notes sur les conditions du deal..."
              rows={3}
              value={form.notes ?? ""}
              onChange={e => updateField("notes", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bottom save button */}
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
    </div>
  );
});
