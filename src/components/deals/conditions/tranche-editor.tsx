"use client";

import React, { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { TrancheData } from "./types";
import { TRANCHE_TYPES, TRIGGER_TYPES, TRANCHE_STATUSES, isEquityTranche } from "./types";

interface TrancheEditorProps {
  tranche: TrancheData;
  index: number;
  onChange: (index: number, updated: TrancheData) => void;
  onRemove: (index: number) => void;
  isOpen: boolean;
  onToggle: (index: number) => void;
}

export const TrancheEditor = React.memo(function TrancheEditor({
  tranche,
  index,
  onChange,
  onRemove,
  isOpen,
  onToggle,
}: TrancheEditorProps) {
  const update = useCallback(
    <K extends keyof TrancheData>(key: K, value: TrancheData[K]) => {
      onChange(index, { ...tranche, [key]: value });
    },
    [index, tranche, onChange]
  );

  const typeLabel = TRANCHE_TYPES.find(t => t.value === tranche.trancheType)?.label ?? tranche.trancheType;
  const showEquityFields = isEquityTranche(tranche.trancheType);

  return (
    <Collapsible open={isOpen} onOpenChange={() => onToggle(index)}>
      <Card className="border-l-4 border-l-primary/30">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-normal">
                      {index + 1}
                    </Badge>
                    {tranche.label || `Tranche ${index + 1}`}
                    <Badge variant="secondary" className="text-xs">
                      {typeLabel}
                    </Badge>
                    {tranche.amount != null && (
                      <span className="text-muted-foreground font-normal">
                        — {tranche.amount.toLocaleString("fr-FR")} EUR
                      </span>
                    )}
                  </CardTitle>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Row 1: Label + Type */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom de la tranche</Label>
                <Input
                  placeholder="Ex: CCA Phase 1, Equity nominale..."
                  value={tranche.label}
                  onChange={e => update("label", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type d&apos;instrument</Label>
                <Select
                  value={tranche.trancheType}
                  onValueChange={v => update("trancheType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANCHE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Amount + Equity fields (if applicable) */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Montant (EUR)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 30000"
                  value={tranche.amount ?? ""}
                  onChange={e => update("amount", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              {showEquityFields && (
                <>
                  <div className="space-y-2">
                    <Label>Valorisation pre-money (EUR)</Label>
                    <Input
                      type="number"
                      placeholder="Ex: 1000000"
                      value={tranche.valuationPre ?? ""}
                      onChange={e => update("valuationPre", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Equity (%)</Label>
                    <Input
                      type="number"
                      placeholder="Ex: 10"
                      min={0}
                      max={100}
                      step={0.01}
                      value={tranche.equityPct ?? ""}
                      onChange={e => update("equityPct", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Row 3: Trigger */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Condition de declenchement</Label>
                <Select
                  value={tranche.triggerType ?? "UNCONDITIONAL"}
                  onValueChange={v => update("triggerType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tranche.triggerType && tranche.triggerType !== "UNCONDITIONAL" && (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Details du trigger</Label>
                    <Textarea
                      placeholder="Ex: Phase 1 validee avec CA > 50K sur 6 mois..."
                      rows={2}
                      value={tranche.triggerDetails ?? ""}
                      onChange={e => update("triggerDetails", e.target.value || null)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Row 4: Protections (equity types only) */}
            {showEquityFields && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Liquidation preference</Label>
                  <Select
                    value={tranche.liquidationPref ?? ""}
                    onValueChange={v => update("liquidationPref", v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="1x_non_participating">1x Non-participating</SelectItem>
                      <SelectItem value="1x_participating">1x Participating</SelectItem>
                      <SelectItem value="1x_participating_capped">1x Participating (cap)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Anti-dilution</Label>
                  <Select
                    value={tranche.antiDilution ?? ""}
                    onValueChange={v => update("antiDilution", v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="weighted_average_broad">Weighted Average (broad)</SelectItem>
                      <SelectItem value="weighted_average_narrow">Weighted Average (narrow)</SelectItem>
                      <SelectItem value="full_ratchet">Full Ratchet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Pro-rata rights</Label>
                  <Switch
                    checked={tranche.proRataRights ?? false}
                    onCheckedChange={v => update("proRataRights", v)}
                    aria-label="Pro-rata rights"
                  />
                </div>
              </div>
            )}

            {/* Row 5: Status + Type details */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select
                  value={tranche.status}
                  onValueChange={v => update("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANCHE_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Details supplementaires</Label>
                <Input
                  placeholder="Precisions sur cette tranche..."
                  value={tranche.typeDetails ?? ""}
                  onChange={e => update("typeDetails", e.target.value || null)}
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});
