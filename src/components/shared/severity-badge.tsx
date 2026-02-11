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
    impact: "Dealbreaker potentiel. Ce risque peut a lui seul justifier de passer le deal.",
    action: "Investiguer IMMEDIATEMENT. Si confirme, envisager serieusement le NO GO.",
  },
  HIGH: {
    label: "ELEVE",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    impact: "Risque serieux qui peut reduire significativement le retour attendu ou bloquer la croissance.",
    action: "Poser la question au fondateur AVANT d'investir. Negocier une protection (clause, milestone).",
  },
  MEDIUM: {
    label: "MOYEN",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    impact: "Point de vigilance. Peut devenir critique si non adresse, surtout combine a d'autres risques.",
    action: "Aborder le sujet avec le fondateur. Suivre dans le temps post-investissement.",
  },
  LOW: {
    label: "FAIBLE",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    impact: "Risque mineur, commun a beaucoup de startups early stage. A noter, pas a prioriser.",
    action: "Pas d'action immediate requise. Surveiller lors des board meetings.",
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
    impact: "Niveau de severite inconnu.",
    action: "Evaluer au cas par cas.",
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
