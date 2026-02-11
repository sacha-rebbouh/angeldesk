"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Globe,
  BarChart3,
  Info,
  ArrowRight,
} from "lucide-react";

type DataCompleteness = "complete" | "partial" | "minimal";

interface DataCompletenessGuideProps {
  completeness: DataCompleteness;
  limitations?: string[];
}

const IMPROVEMENT_SUGGESTIONS: { pattern: RegExp; suggestion: string; icon: "upload" | "form" | "web" }[] = [
  { pattern: /pitch\s?deck|deck|presentation|document/i, suggestion: "Uploadez votre pitch deck (PDF)", icon: "upload" },
  { pattern: /financ|revenue|arr|mrr|chiffre|tresorerie|bilan|resultat/i, suggestion: "Renseignez l'ARR et le taux de croissance", icon: "form" },
  { pattern: /valoris|valuation|valo|pre-money/i, suggestion: "Renseignez la valorisation pré-money", icon: "form" },
  { pattern: /equipe|team|fondateur|cto|ceo|linkedin/i, suggestion: "Ajoutez les profils LinkedIn des fondateurs", icon: "web" },
  { pattern: /site\s?web|website|url|domaine/i, suggestion: "Renseignez le site web de la startup", icon: "form" },
  { pattern: /cap\s?table|dilution|term\s?sheet|vesting/i, suggestion: "Uploadez la cap table ou le term sheet", icon: "upload" },
  { pattern: /concurr|compet|marche|market|tam|sam/i, suggestion: "Ajoutez une description du marché et des concurrents", icon: "form" },
  { pattern: /client|customer|contrat|churn|retention/i, suggestion: "Uploadez des données clients (métriques, témoignages)", icon: "upload" },
  { pattern: /techno|stack|infra|code|github|repo/i, suggestion: "Renseignez la stack technique dans la description", icon: "form" },
  { pattern: /secteur|sector|industry/i, suggestion: "Sélectionnez le secteur du deal", icon: "form" },
  { pattern: /geograph|pays|region|location/i, suggestion: "Renseignez la géographie", icon: "form" },
  { pattern: /montant|amount|lev[ée]e|round/i, suggestion: "Renseignez le montant demandé", icon: "form" },
];

const ICON_MAP = {
  upload: <FileUp className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />,
  form: <BarChart3 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />,
  web: <Globe className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />,
};

const COMPLETENESS_CONFIG: Record<DataCompleteness, {
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}> = {
  complete: {
    label: "Données complètes",
    shortLabel: "Complètes",
    color: "bg-green-100 text-green-800",
    description: "Toutes les données nécessaires sont disponibles.",
  },
  partial: {
    label: "Données partielles",
    shortLabel: "Partielles",
    color: "bg-yellow-100 text-yellow-800",
    description: "Certaines données manquent. L'analyse reste fiable mais peut être améliorée.",
  },
  minimal: {
    label: "Données minimales",
    shortLabel: "Minimales",
    color: "bg-red-100 text-red-800",
    description: "Très peu de données disponibles. L'analyse est limitée et moins fiable.",
  },
};

export const DataCompletenessGuide = memo(function DataCompletenessGuide({
  completeness,
  limitations = [],
}: DataCompletenessGuideProps) {
  const config = COMPLETENESS_CONFIG[completeness];

  const suggestions = useMemo(() => {
    if (completeness === "complete" || limitations.length === 0) return [];

    const seen = new Set<string>();
    const result: { suggestion: string; icon: "upload" | "form" | "web" }[] = [];

    for (const limitation of limitations) {
      for (const mapping of IMPROVEMENT_SUGGESTIONS) {
        if (mapping.pattern.test(limitation) && !seen.has(mapping.suggestion)) {
          seen.add(mapping.suggestion);
          result.push({ suggestion: mapping.suggestion, icon: mapping.icon });
        }
      }
    }

    if (result.length === 0) {
      result.push({
        suggestion: "Uploadez votre pitch deck pour enrichir l'analyse",
        icon: "upload" as const,
      });
    }

    return result.slice(0, 4);
  }, [completeness, limitations]);

  if (completeness === "complete") {
    return (
      <Badge variant="outline" className={cn("text-xs", config.color)}>
        {config.label}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex" aria-label={`Complétude des données : ${config.label}`}>
          <Badge
            variant="outline"
            className={cn(
              "text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1",
              config.color
            )}
          >
            {config.shortLabel}
            <Info className="h-3 w-3 opacity-60" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 p-0"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-2">
            <AlertCircle className={cn(
              "h-5 w-5 shrink-0 mt-0.5",
              completeness === "minimal" ? "text-red-500" : "text-amber-500"
            )} />
            <div>
              <p className="text-sm font-medium">{config.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.description}
              </p>
            </div>
          </div>

          {/* Limitations actuelles */}
          {limitations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Non analysé
              </p>
              <ul className="space-y-1">
                {limitations.slice(0, 5).map((limitation, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-red-400 mt-0.5">-</span>
                    <span>{limitation}</span>
                  </li>
                ))}
                {limitations.length > 5 && (
                  <li className="text-xs text-muted-foreground/60 ml-4">
                    +{limitations.length - 5} autre{limitations.length - 5 > 1 ? "s" : ""}...
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Suggestions d'amelioration */}
          {suggestions.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pour améliorer cette analyse
              </p>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {ICON_MAP[s.icon]}
                    <span>{s.suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="border-t pt-2">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              Modifiez le deal ou uploadez des documents dans l&apos;onglet Documents
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
