"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, MessageSquare, Shield, Scale, TrendingDown, Target, Briefcase, FileQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAgentName } from "@/lib/format-utils";
import type { EarlyWarning } from "@/types";

interface EarlyWarningsPanelProps {
  warnings: EarlyWarning[];
  hasCritical?: boolean;
}

import { getSeverityStyle } from "@/lib/ui-configs";

const SEVERITY_ICON_MAP = {
  critical: AlertTriangle,
  high: AlertCircle,
  medium: Info,
} as const;

function getSeverityConfig(severity: string) {
  const style = getSeverityStyle(severity);
  const icon = SEVERITY_ICON_MAP[severity as keyof typeof SEVERITY_ICON_MAP] ?? Info;
  return {
    icon,
    color: style.icon,
    bg: `${style.bg} ${style.border}`,
    badge: style.badge,
    label: style.label,
  };
}

const CATEGORY_CONFIG: Record<EarlyWarning["category"], { icon: typeof Shield; label: string }> = {
  founder_integrity: { icon: Shield, label: "Intégrité Fondateurs" },
  legal_existential: { icon: Scale, label: "Risque Légal" },
  financial_critical: { icon: TrendingDown, label: "Financier Critique" },
  market_dead: { icon: Target, label: "Marché" },
  product_broken: { icon: Briefcase, label: "Produit" },
  deal_structure: { icon: FileQuestion, label: "Structure Deal" },
};

const RECOMMENDATION_LABELS = {
  investigate: "À investiguer",
  likely_dealbreaker: "Risque majeur détecté",
  absolute_dealbreaker: "Risque critique détecté",
};

const WarningCard = memo(function WarningCard({ warning }: { warning: EarlyWarning }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  const severityConfig = getSeverityConfig(warning.severity);
  const categoryConfig = CATEGORY_CONFIG[warning.category] ?? { icon: Info, label: "Autre" };
  const SeverityIcon = severityConfig.icon;
  const CategoryIcon = categoryConfig.icon;

  return (
    <div className={cn("rounded-lg border p-4", severityConfig.bg)}>
      <div className="flex items-start gap-3">
        <SeverityIcon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", severityConfig.color)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm">{warning.title}</h4>
            <Badge variant="outline" className={severityConfig.badge}>
              {severityConfig.label}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground mt-1">{warning.description}</p>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CategoryIcon className="h-3 w-3" />
              {categoryConfig.label}
            </span>
            <span>Source: {formatAgentName(warning.agentName)}</span>
            <span>Fiabilité : {warning.confidence}%</span>
          </div>

          {/* Recommendation badge */}
          <div className="mt-2">
            <Badge
              variant={warning.recommendation === "absolute_dealbreaker" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {RECOMMENDATION_LABELS[warning.recommendation] ?? warning.recommendation}
            </Badge>
          </div>

          {/* Expandable details */}
          {(warning.evidence.length > 0 || (warning.questionsToAsk && warning.questionsToAsk.length > 0)) && (
            <button
              onClick={toggleExpand}
              aria-expanded={isExpanded}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {isExpanded ? "Masquer détails" : "Voir détails"}
            </button>
          )}

          {isExpanded && (
            <div className="mt-3 space-y-3">
              {/* Evidence */}
              {warning.evidence.length > 0 && (
                <div className="bg-background/50 rounded p-3">
                  <h5 className="text-xs font-medium mb-2">Preuves</h5>
                  <ul className="text-xs space-y-1">
                    {warning.evidence.map((e, idx) => (
                      <li key={idx} className="text-muted-foreground">
                        • {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Questions to ask */}
              {warning.questionsToAsk && warning.questionsToAsk.length > 0 && (
                <div className="bg-background/50 rounded p-3">
                  <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Questions à poser
                  </h5>
                  <ul className="text-xs space-y-1">
                    {warning.questionsToAsk.map((q, idx) => (
                      <li key={idx} className="text-muted-foreground">
                        {idx + 1}. {typeof q === "string" ? q : (q as { question?: string }).question ?? JSON.stringify(q)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const EarlyWarningsPanel = memo(function EarlyWarningsPanel({
  warnings,
  hasCritical
}: EarlyWarningsPanelProps) {
  // Group warnings by severity
  const { critical, high, medium } = useMemo(() => ({
    critical: warnings.filter(w => w.severity === "critical"),
    high: warnings.filter(w => w.severity === "high"),
    medium: warnings.filter(w => w.severity === "medium"),
  }), [warnings]);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Card className={cn(
      "border-2",
      hasCritical ? "border-red-300 bg-red-50/30" : "border-orange-300 bg-orange-50/30"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className={cn(
            "h-5 w-5",
            hasCritical ? "text-red-600" : "text-orange-600"
          )} />
          Alertes Détectées
          <Badge variant={hasCritical ? "destructive" : "secondary"}>
            {warnings.length}
          </Badge>
        </CardTitle>
        {hasCritical && (
          <p className="text-sm text-red-700 font-medium">
            Risques critiques identifiés sur ce deal. Investigation approfondie recommandée.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Critical warnings first */}
        {critical.map(warning => (
          <WarningCard key={warning.id} warning={warning} />
        ))}

        {/* High priority warnings */}
        {high.map(warning => (
          <WarningCard key={warning.id} warning={warning} />
        ))}

        {/* Medium priority warnings */}
        {medium.map(warning => (
          <WarningCard key={warning.id} warning={warning} />
        ))}
      </CardContent>
    </Card>
  );
});
