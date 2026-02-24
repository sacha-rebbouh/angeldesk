"use client";

import React, { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterState {
  severities: Set<string>;
  types: Set<string>;
  status: "open" | "resolved" | "accepted" | "all";
}

export const INITIAL_FILTERS: FilterState = {
  severities: new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  types: new Set(["RED_FLAG", "DEVILS_ADVOCATE", "CONDITIONS"]),
  status: "all",
};

interface SuiviDDFiltersProps {
  filters: FilterState;
  onChange: React.Dispatch<React.SetStateAction<FilterState>>;
  counts: { byType: Record<string, number> };
}

const SEVERITY_ITEMS = [
  { key: "CRITICAL", label: "Critique", color: "data-[active=true]:bg-red-500 data-[active=true]:text-white data-[active=true]:border-red-500" },
  { key: "HIGH", label: "Élevé", color: "data-[active=true]:bg-orange-500 data-[active=true]:text-white data-[active=true]:border-orange-500" },
  { key: "MEDIUM", label: "Moyen", color: "data-[active=true]:bg-yellow-500 data-[active=true]:text-black data-[active=true]:border-yellow-500" },
  { key: "LOW", label: "Bas", color: "data-[active=true]:bg-blue-400 data-[active=true]:text-white data-[active=true]:border-blue-400" },
];

const TYPE_ITEMS = [
  { key: "RED_FLAG", label: "Red Flags" },
  { key: "DEVILS_ADVOCATE", label: "Devil's Advocate" },
  { key: "CONDITIONS", label: "Conditions" },
];

const STATUS_ITEMS = [
  { key: "all" as const, label: "Tous" },
  { key: "open" as const, label: "Ouvert" },
  { key: "resolved" as const, label: "Resolu" },
  { key: "accepted" as const, label: "Accepte" },
];

export const SuiviDDFilters = memo(function SuiviDDFilters({
  filters,
  onChange,
  counts,
}: SuiviDDFiltersProps) {
  const toggleSeverity = useCallback((sev: string) => {
    onChange(prev => {
      const next = new Set(prev.severities);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return { ...prev, severities: next };
    });
  }, [onChange]);

  const toggleType = useCallback((type: string) => {
    onChange(prev => {
      const next = new Set(prev.types);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { ...prev, types: next };
    });
  }, [onChange]);

  const setStatus = useCallback((status: FilterState["status"]) => {
    onChange(prev => ({ ...prev, status }));
  }, [onChange]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {/* Severity */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground font-medium mr-1">Severite :</span>
        {SEVERITY_ITEMS.map(item => (
          <Button
            key={item.key}
            variant="outline"
            size="sm"
            data-active={filters.severities.has(item.key)}
            aria-pressed={filters.severities.has(item.key)}
            className={cn("h-6 px-2 text-xs", item.color)}
            onClick={() => toggleSeverity(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {/* Type */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground font-medium mr-1">Type :</span>
        {TYPE_ITEMS.map(item => (
          <Button
            key={item.key}
            variant="outline"
            size="sm"
            data-active={filters.types.has(item.key)}
            aria-pressed={filters.types.has(item.key)}
            className={cn(
              "h-6 px-2 text-xs",
              "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
            )}
            onClick={() => toggleType(item.key)}
          >
            {item.label}
            {(counts.byType[item.key] ?? 0) > 0 && (
              <span className="ml-1 opacity-70">{counts.byType[item.key]}</span>
            )}
          </Button>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground font-medium mr-1">Statut :</span>
        {STATUS_ITEMS.map(item => (
          <Button
            key={item.key}
            variant="outline"
            size="sm"
            data-active={filters.status === item.key}
            aria-pressed={filters.status === item.key}
            className={cn(
              "h-6 px-2 text-xs",
              "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
            )}
            onClick={() => setStatus(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
});
