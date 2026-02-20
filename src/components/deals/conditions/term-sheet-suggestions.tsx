"use client";

import React, { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Loader2, FileText, Check, X, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DealTermsData } from "./types";

interface TermSheetSuggestionsProps {
  dealId: string;
  termSheetDocId: string;
  termSheetDocName: string;
  onApply: (suggestions: Partial<DealTermsData>) => void;
}

interface SuggestionField {
  key: string;
  label: string;
  value: unknown;
  confidence: number;
}

const FIELD_LABELS: Record<string, string> = {
  valuationPre: "Valorisation pre-money",
  amountRaised: "Montant leve",
  dilutionPct: "Dilution",
  instrumentType: "Instrument",
  instrumentDetails: "Details instrument",
  liquidationPref: "Liquidation preference",
  antiDilution: "Anti-dilution",
  proRataRights: "Pro-rata rights",
  informationRights: "Information rights",
  boardSeat: "Board seat",
  founderVesting: "Founder vesting",
  vestingDurationMonths: "Vesting duration",
  vestingCliffMonths: "Cliff",
  esopPct: "ESOP",
  dragAlong: "Drag-along",
  tagAlong: "Tag-along",
  ratchet: "Ratchet",
  payToPlay: "Pay-to-play",
  milestoneTranches: "Milestone tranches",
  nonCompete: "Non-compete",
  customConditions: "Conditions supplementaires",
};

function formatValue(key: string, value: unknown): string {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  if (typeof value === "number") {
    if (key.includes("Pct") || key === "esopPct") return `${value}%`;
    if (key.includes("Months")) return `${value} mois`;
    if (key.includes("valuation") || key.includes("amount") || key.includes("Raised")) {
      return `${value.toLocaleString("fr-FR")} EUR`;
    }
    return String(value);
  }
  return String(value ?? "");
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return "text-green-600 bg-green-100";
  if (confidence >= 50) return "text-yellow-600 bg-yellow-100";
  return "text-red-600 bg-red-100";
}

export const TermSheetSuggestions = React.memo(function TermSheetSuggestions({
  dealId,
  termSheetDocId,
  termSheetDocName,
  onApply,
}: TermSheetSuggestionsProps) {
  const [dismissed, setDismissed] = useState(false);
  const [extractedFields, setExtractedFields] = useState<SuggestionField[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/terms/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: termSheetDocId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur lors de l'extraction");
      }
      return res.json() as Promise<{
        suggestions: Record<string, unknown>;
        confidence: Record<string, number>;
        documentName: string;
      }>;
    },
    onSuccess: (result) => {
      const fields: SuggestionField[] = [];
      const suggestions = result.suggestions;
      const confidence = result.confidence ?? {};

      for (const [key, value] of Object.entries(suggestions)) {
        if (key === "confidence" || value == null) continue;
        const conf = confidence[key] ?? 50;
        fields.push({
          key,
          label: FIELD_LABELS[key] ?? key,
          value,
          confidence: conf,
        });
      }

      // Sort by confidence desc
      fields.sort((a, b) => b.confidence - a.confidence);
      setExtractedFields(fields);

      // Pre-select fields with confidence >= 70
      setSelectedKeys(new Set(
        fields.filter((f: SuggestionField) => f.confidence >= 70).map((f: SuggestionField) => f.key)
      ));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleApply = useCallback(() => {
    if (!extractedFields) return;
    const partial: Partial<DealTermsData> = {};
    for (const field of extractedFields) {
      if (selectedKeys.has(field.key)) {
        (partial as Record<string, unknown>)[field.key] = field.value;
      }
    }
    onApply(partial);
    setDismissed(true);
    toast.success(`${selectedKeys.size} champ(s) applique(s) depuis le term sheet`);
  }, [extractedFields, selectedKeys, onApply]);

  const toggleField = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (dismissed) return null;

  // Not yet extracted: show suggestion banner
  if (!extractedFields) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Term sheet detecte : {termSheetDocName}</p>
            <p className="text-xs text-muted-foreground">
              L&apos;IA peut extraire les conditions du document et pre-remplir le formulaire
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDismissed(true)}
          >
            Ignorer
          </Button>
          <Button
            size="sm"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
          >
            {extractMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Extraction...
              </>
            ) : (
              <>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Extraire les conditions
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Extracted: show review card
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {extractedFields.length} condition(s) extraite(s)
          </span>
          <Badge variant="outline" className="text-xs">
            {termSheetDocName}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDismissed(true)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-1.5 max-h-[300px] overflow-y-auto">
        {extractedFields.map((field: SuggestionField) => (
          <label
            key={field.key}
            className={cn(
              "flex items-center gap-3 rounded-md border p-2 cursor-pointer transition-colors text-sm",
              selectedKeys.has(field.key)
                ? "border-primary/30 bg-primary/10"
                : "border-transparent hover:bg-muted/50"
            )}
          >
            <input
              type="checkbox"
              checked={selectedKeys.has(field.key)}
              onChange={() => toggleField(field.key)}
              className="h-4 w-4 rounded border-primary"
            />
            <span className="text-muted-foreground min-w-[140px]">{field.label}</span>
            <span className="font-medium flex-1">{formatValue(field.key, field.value)}</span>
            <Badge
              variant="outline"
              className={cn("text-[10px] shrink-0", getConfidenceColor(field.confidence))}
            >
              {field.confidence}%
            </Badge>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {selectedKeys.size} / {extractedFields.length} selectionne(s)
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleApply} disabled={selectedKeys.size === 0}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Appliquer ({selectedKeys.size})
          </Button>
        </div>
      </div>
    </div>
  );
});
