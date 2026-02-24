"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  impact: string;
  action: string;
}> = {
  CRITICAL: {
    label: "CRITIQUE",
    color: "bg-red-100 text-red-800 border-red-300",
    impact: "Risque potentiellement bloquant. Ce risque nécessite une investigation approfondie.",
    action: "Investiguer IMMÉDIATEMENT. Si confirmé, évaluer l'impact sur la décision.",
  },
  HIGH: {
    label: "ELEVE",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    impact: "Risque sérieux qui peut réduire significativement le retour attendu ou bloquer la croissance.",
    action: "Poser la question au fondateur AVANT d'investir. Négocier une protection (clause, milestone).",
  },
  MEDIUM: {
    label: "MOYEN",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    impact: "Point de vigilance. Peut devenir critique si non adressé, surtout combiné à d'autres risques.",
    action: "Aborder le sujet avec le fondateur. Suivre dans le temps post-investissement.",
  },
  LOW: {
    label: "FAIBLE",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    impact: "Risque mineur, commun à beaucoup de startups early stage. À noter, pas à prioriser.",
    action: "Pas d'action immédiate requise. Surveiller lors des board meetings.",
  },
};

interface SeverityBadgeProps {
  severity: string;
  showTooltip?: boolean;
  className?: string;
}

export const SeverityBadge = memo(function SeverityBadge({
  severity,
  showTooltip = true,
  className,
}: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity.toUpperCase()] ?? {
    label: severity,
    color: "bg-gray-100 text-gray-800",
    impact: "Niveau de sévérité inconnu.",
    action: "Évaluer au cas par cas.",
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn("text-xs cursor-help", config.color, className)}
    >
      {config.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs p-3"
        >
          <div className="space-y-1.5">
            <p className="font-medium text-sm">Impact : {config.label}</p>
            <p className="text-xs text-muted-foreground">{config.impact}</p>
            <p className="text-xs font-medium">Action : {config.action}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
