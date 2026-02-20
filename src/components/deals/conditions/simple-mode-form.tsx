"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { DealTermsData } from "./types";
import { TERMS_HELP } from "./conditions-help";

interface SimpleModeFormProps {
  form: DealTermsData;
  updateField: <K extends keyof DealTermsData>(key: K, value: DealTermsData[K]) => void;
}

const HelpLabel = React.memo(function HelpLabel({ fieldKey, fallbackLabel }: { fieldKey: string; fallbackLabel?: string }) {
  const help = TERMS_HELP[fieldKey];
  const label = help?.label ?? fallbackLabel ?? fieldKey;

  if (!help?.tooltip) {
    return <Label>{label}</Label>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Label>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p>{help.tooltip}</p>
          {help.example && <p className="mt-1 text-muted-foreground/80 italic">{help.example}</p>}
        </TooltipContent>
      </Tooltip>
    </div>
  );
});

export const SimpleModeForm = React.memo(function SimpleModeForm({ form, updateField }: SimpleModeFormProps) {
  return (
    <div className="space-y-6">
      {/* Valorisation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valorisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <HelpLabel fieldKey="valuationPre" />
            <Input
              type="number"
              placeholder="Ex: 5000000"
              value={form.valuationPre ?? ""}
              onChange={e => updateField("valuationPre", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel fieldKey="amountRaised" fallbackLabel="Montant leve (EUR)" />
            <Input
              type="number"
              placeholder="Ex: 1000000"
              value={form.amountRaised ?? ""}
              onChange={e => updateField("amountRaised", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel fieldKey="dilutionPct" fallbackLabel="Dilution (%)" />
            <Input
              type="number"
              placeholder="Ex: 15"
              min={0}
              max={100}
              value={form.dilutionPct ?? ""}
              onChange={e => updateField("dilutionPct", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instrument */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instrument</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <HelpLabel fieldKey="instrumentType" fallbackLabel="Type d'instrument" />
            <Select
              value={form.instrumentType ?? ""}
              onValueChange={v => updateField("instrumentType", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BSA_AIR">BSA-AIR</SelectItem>
                <SelectItem value="BSA_AIR_WITH_CAP_DISCOUNT">BSA-AIR (cap + discount)</SelectItem>
                <SelectItem value="BSA_AIR_WITH_CAP">BSA-AIR (cap uniquement)</SelectItem>
                <SelectItem value="BSA_AIR_NO_CAP">BSA-AIR (sans cap)</SelectItem>
                <SelectItem value="CONVERTIBLE_NOTE">Convertible Note</SelectItem>
                <SelectItem value="EQUITY_ORDINARY">Actions ordinaires</SelectItem>
                <SelectItem value="EQUITY_PREFERRED">Actions de preference</SelectItem>
                <SelectItem value="LOAN">Pret</SelectItem>
                <SelectItem value="MIXED">Mixte</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Details (si mixte/autre)</Label>
            <Input
              placeholder="Decrire l'instrument"
              value={form.instrumentDetails ?? ""}
              onChange={e => updateField("instrumentDetails", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Protections investisseur */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protections investisseur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <HelpLabel fieldKey="liquidationPref" />
              <Select
                value={form.liquidationPref ?? ""}
                onValueChange={v => updateField("liquidationPref", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="1x_non_participating">1x Non-participating</SelectItem>
                  <SelectItem value="1x_participating">1x Participating</SelectItem>
                  <SelectItem value="1x_participating_capped">1x Participating (cap)</SelectItem>
                  <SelectItem value="2x_participating">2x Participating</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <HelpLabel fieldKey="antiDilution" />
              <Select
                value={form.antiDilution ?? ""}
                onValueChange={v => updateField("antiDilution", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="weighted_average_broad">Weighted Average (broad)</SelectItem>
                  <SelectItem value="weighted_average_narrow">Weighted Average (narrow)</SelectItem>
                  <SelectItem value="full_ratchet">Full Ratchet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <HelpLabel fieldKey="proRataRights" fallbackLabel="Pro-rata rights" />
              <Switch
                checked={form.proRataRights ?? false}
                onCheckedChange={v => updateField("proRataRights", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <HelpLabel fieldKey="informationRights" fallbackLabel="Information rights" />
              <Switch
                checked={form.informationRights ?? false}
                onCheckedChange={v => updateField("informationRights", v)}
              />
            </div>
            <div className="space-y-2">
              <HelpLabel fieldKey="boardSeat" fallbackLabel="Siege au board" />
              <Select
                value={form.boardSeat ?? ""}
                onValueChange={v => updateField("boardSeat", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  <SelectItem value="observer">Observateur</SelectItem>
                  <SelectItem value="full_seat">Siege complet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gouvernance / Fondateurs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gouvernance / Fondateurs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <HelpLabel fieldKey="founderVesting" fallbackLabel="Founder vesting" />
              <Switch
                checked={form.founderVesting ?? false}
                onCheckedChange={v => updateField("founderVesting", v)}
              />
            </div>
            <div className="space-y-2">
              <HelpLabel fieldKey="vestingDurationMonths" fallbackLabel="Vesting (mois)" />
              <Input
                type="number"
                placeholder="48"
                min={0}
                value={form.vestingDurationMonths ?? ""}
                onChange={e => updateField("vestingDurationMonths", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <HelpLabel fieldKey="vestingCliffMonths" fallbackLabel="Cliff (mois)" />
              <Input
                type="number"
                placeholder="12"
                min={0}
                value={form.vestingCliffMonths ?? ""}
                onChange={e => updateField("vestingCliffMonths", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <HelpLabel fieldKey="esopPct" fallbackLabel="ESOP (%)" />
              <Input
                type="number"
                placeholder="10"
                min={0}
                max={100}
                value={form.esopPct ?? ""}
                onChange={e => updateField("esopPct", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <HelpLabel fieldKey="dragAlong" />
              <Switch
                checked={form.dragAlong ?? false}
                onCheckedChange={v => updateField("dragAlong", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <HelpLabel fieldKey="tagAlong" />
              <Switch
                checked={form.tagAlong ?? false}
                onCheckedChange={v => updateField("tagAlong", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clauses speciales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clauses speciales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <HelpLabel fieldKey="ratchet" />
                <p className="text-xs text-muted-foreground">Anti-dilution agressive</p>
              </div>
              <Switch
                checked={form.ratchet ?? false}
                onCheckedChange={v => updateField("ratchet", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <HelpLabel fieldKey="payToPlay" />
                <p className="text-xs text-muted-foreground">Obligation de participer</p>
              </div>
              <Switch
                checked={form.payToPlay ?? false}
                onCheckedChange={v => updateField("payToPlay", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <HelpLabel fieldKey="milestoneTranches" fallbackLabel="Tranches / Milestones" />
                <p className="text-xs text-muted-foreground">Financement conditionnel</p>
              </div>
              <Switch
                checked={form.milestoneTranches ?? false}
                onCheckedChange={v => updateField("milestoneTranches", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <HelpLabel fieldKey="nonCompete" />
                <p className="text-xs text-muted-foreground">Clause de non-concurrence</p>
              </div>
              <Switch
                checked={form.nonCompete ?? false}
                onCheckedChange={v => updateField("nonCompete", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes / champ libre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes et conditions specifiques</CardTitle>
          <CardDescription>
            Renseignez ici toute condition non couverte par les champs ci-dessus
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Conditions supplementaires</Label>
            <Textarea
              placeholder="Ex: Clause de sortie conjointe, earn-out, conditions suspensives..."
              rows={3}
              value={form.customConditions ?? ""}
              onChange={e => updateField("customConditions", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes personnelles</Label>
            <Textarea
              placeholder="Vos notes sur les conditions du deal..."
              rows={3}
              value={form.notes ?? ""}
              onChange={e => updateField("notes", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
