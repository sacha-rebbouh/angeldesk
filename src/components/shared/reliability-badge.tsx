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
import { ShieldCheck, FileQuestion, TrendingUp, Calculator, HelpCircle } from "lucide-react";

type DataReliability = "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";

const RELIABILITY_CONFIG: Record<DataReliability, {
  label: string;
  shortLabel: string;
  color: string;
  icon: React.ElementType;
  tooltip: string;
}> = {
  AUDITED: {
    label: "Audité",
    shortLabel: "Audité",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: ShieldCheck,
    tooltip: "Confirmé par un audit externe ou des relevés bancaires",
  },
  VERIFIED: {
    label: "Vérifié",
    shortLabel: "Vérifié",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    icon: ShieldCheck,
    tooltip: "Croisé et confirmé par plusieurs sources indépendantes",
  },
  DECLARED: {
    label: "Déclaré",
    shortLabel: "Déclaré",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: FileQuestion,
    tooltip: "Chiffre annoncé par le fondateur, non vérifié de manière indépendante",
  },
  PROJECTED: {
    label: "Projection",
    shortLabel: "Proj.",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    icon: TrendingUp,
    tooltip: "Projection future basée sur un business plan ou prévisions",
  },
  ESTIMATED: {
    label: "Estimé",
    shortLabel: "Estimé",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Calculator,
    tooltip: "Calculé ou déduit par l'IA à partir de données partielles",
  },
  UNVERIFIABLE: {
    label: "Non vérifiable",
    shortLabel: "N/V",
    color: "bg-gray-100 text-gray-500 border-gray-300",
    icon: HelpCircle,
    tooltip: "Impossible à vérifier avec les données disponibles",
  },
};

interface ReliabilityBadgeProps {
  reliability: DataReliability;
  compact?: boolean;
  className?: string;
}

export const ReliabilityBadge = memo(function ReliabilityBadge({
  reliability,
  compact = true,
  className,
}: ReliabilityBadgeProps) {
  const config = RELIABILITY_CONFIG[reliability];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium cursor-help gap-0.5 px-1.5 py-0",
              config.color,
              className
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {compact ? config.shortLabel : config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{config.label}</p>
          <p className="text-sm text-muted-foreground">{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
