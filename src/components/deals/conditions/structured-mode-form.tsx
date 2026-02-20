"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Layers } from "lucide-react";
import { TrancheEditor } from "./tranche-editor";
import type { TrancheData } from "./types";
import { EMPTY_TRANCHE, TRANCHE_TYPES } from "./types";

interface StructuredModeFormProps {
  tranches: TrancheData[];
  onTranchesChange: (tranches: TrancheData[]) => void;
}

let trancheIdCounter = 0;
function generateTempId(): string {
  return `temp-${Date.now()}-${++trancheIdCounter}`;
}

export const StructuredModeForm = React.memo(function StructuredModeForm({
  tranches,
  onTranchesChange,
}: StructuredModeFormProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(() => {
    // Open all tranches by default if there are few
    return new Set(tranches.length <= 3 ? tranches.map((_, i) => i) : []);
  });

  const handleToggle = useCallback((index: number) => {
    setOpenIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleChange = useCallback((index: number, updated: TrancheData) => {
    const next = [...tranches];
    next[index] = updated;
    onTranchesChange(next);
  }, [tranches, onTranchesChange]);

  const handleRemove = useCallback((index: number) => {
    const next = tranches.filter((_, i) => i !== index);
    // Re-index
    const reindexed = next.map((t, i) => ({ ...t, orderIndex: i }));
    onTranchesChange(reindexed);
    setOpenIndexes(prev => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  }, [tranches, onTranchesChange]);

  const handleAdd = useCallback(() => {
    const newTranche: TrancheData = {
      ...EMPTY_TRANCHE,
      id: generateTempId(),
      orderIndex: tranches.length,
      label: `Tranche ${tranches.length + 1}`,
    };
    onTranchesChange([...tranches, newTranche]);
    setOpenIndexes(prev => new Set([...prev, tranches.length]));
  }, [tranches, onTranchesChange]);

  // Summary stats
  const summary = useMemo(() => {
    const totalAmount = tranches.reduce((s, t) => s + (t.amount ?? 0), 0);
    const totalEquity = tranches.reduce((s, t) => s + (t.equityPct ?? 0), 0);
    const typeCount = new Map<string, number>();
    for (const t of tranches) {
      typeCount.set(t.trancheType, (typeCount.get(t.trancheType) ?? 0) + 1);
    }
    return { totalAmount, totalEquity, typeCount };
  }, [tranches]);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      {tranches.length > 0 && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Resume de la structure
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tranches:</span>{" "}
              <span className="font-semibold">{tranches.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Investissement total:</span>{" "}
              <span className="font-semibold">
                {summary.totalAmount > 0
                  ? `${summary.totalAmount.toLocaleString("fr-FR")} EUR`
                  : "—"}
              </span>
            </div>
            {summary.totalEquity > 0 && (
              <div>
                <span className="text-muted-foreground">Equity totale:</span>{" "}
                <span className="font-semibold">{summary.totalEquity}%</span>
              </div>
            )}
            <div className="flex gap-1.5">
              {Array.from(summary.typeCount.entries()).map(([type, count]) => {
                const label = TRANCHE_TYPES.find(t => t.value === type)?.label ?? type;
                return (
                  <Badge key={type} variant="outline" className="text-xs">
                    {label}{count > 1 ? ` x${count}` : ""}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tranche editors */}
      {tranches.map((tranche, index) => (
        <TrancheEditor
          key={tranche.id}
          tranche={tranche}
          index={index}
          onChange={handleChange}
          onRemove={handleRemove}
          isOpen={openIndexes.has(index)}
          onToggle={handleToggle}
        />
      ))}

      {/* Add tranche button */}
      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={handleAdd}
        disabled={tranches.length >= 10}
      >
        <Plus className="mr-2 h-4 w-4" />
        Ajouter une tranche
        {tranches.length >= 10 && (
          <span className="ml-2 text-xs text-muted-foreground">(max 10)</span>
        )}
      </Button>

      {/* Empty state */}
      {tranches.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Aucune tranche definie</p>
          <p className="text-xs mt-1">
            Ajoutez des tranches pour decrire la structure de votre investissement
            (CCA, equity, options...)
          </p>
        </div>
      )}
    </div>
  );
});
