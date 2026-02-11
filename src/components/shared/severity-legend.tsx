"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

const SEVERITIES = [
  { key: "CRITICAL", label: "CRITIQUE", color: "bg-red-100 text-red-800 border-red-300", desc: "Dealbreaker potentiel" },
  { key: "HIGH", label: "ELEVE", color: "bg-orange-100 text-orange-800 border-orange-300", desc: "Risque serieux, investiguer avant d'investir" },
  { key: "MEDIUM", label: "MOYEN", color: "bg-yellow-100 text-yellow-800 border-yellow-300", desc: "Point de vigilance, peut devenir critique" },
  { key: "LOW", label: "FAIBLE", color: "bg-blue-100 text-blue-800 border-blue-300", desc: "Risque mineur, commun en early stage" },
];

export const SeverityLegend = memo(function SeverityLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border rounded-lg bg-muted/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Comprendre les niveaux de severite
        </span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t space-y-2">
          {SEVERITIES.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs w-20 justify-center shrink-0", s.color)}>
                {s.label}
              </Badge>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
