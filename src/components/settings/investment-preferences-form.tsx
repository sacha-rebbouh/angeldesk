"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertCircle, Check, Loader2 } from "lucide-react";
import type { BAPreferences, Sector, FundingStage } from "@/services/benchmarks";

const SECTORS: { value: Sector; label: string }[] = [
  { value: "SaaS", label: "SaaS" },
  { value: "Fintech", label: "Fintech" },
  { value: "Marketplace", label: "Marketplace" },
  { value: "Healthtech", label: "Healthtech" },
  { value: "Deeptech", label: "Deeptech" },
  { value: "Climate", label: "Climate" },
  { value: "Consumer", label: "Consumer" },
  { value: "Hardware", label: "Hardware" },
  { value: "Gaming", label: "Gaming" },
];

const STAGES: { value: FundingStage; label: string }[] = [
  { value: "PRE_SEED", label: "Pre-Seed" },
  { value: "SEED", label: "Seed" },
  { value: "SERIES_A", label: "Series A" },
  { value: "SERIES_B", label: "Series B" },
];

const RISK_LABELS = [
  "Très conservateur",
  "Conservateur",
  "Modéré",
  "Dynamique",
  "Agressif",
];

async function fetchPreferences(): Promise<BAPreferences> {
  const res = await fetch("/api/user/preferences");
  if (!res.ok) throw new Error("Failed to fetch preferences");
  const data = await res.json();
  return data.preferences;
}

async function updatePreferences(preferences: Partial<BAPreferences>): Promise<BAPreferences> {
  const res = await fetch("/api/user/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  const data = await res.json();
  return data.preferences;
}

export function InvestmentPreferencesForm() {
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);

  const { data: preferences, isLoading, error } = useQuery({
    queryKey: queryKeys.userPreferences.all,
    queryFn: fetchPreferences,
  });

  const mutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userPreferences.all });
      setHasChanges(false);
    },
  });

  const [localPrefs, setLocalPrefs] = useState<Partial<BAPreferences>>({});

  // Merge local changes with server data
  const currentPrefs: BAPreferences | null = preferences
    ? { ...preferences, ...localPrefs }
    : null;

  const handleChange = useCallback((key: keyof BAPreferences, value: BAPreferences[keyof BAPreferences]) => {
    setLocalPrefs((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    mutation.mutate(localPrefs);
  }, [localPrefs, mutation]);

  const toggleArrayItem = useCallback(<K extends "preferredSectors" | "excludedSectors" | "preferredStages">(
    key: K,
    item: BAPreferences[K][number]
  ) => {
    const current = (currentPrefs?.[key] ?? []) as BAPreferences[K];
    const includes = (current as readonly unknown[]).includes(item);
    const newValue = includes
      ? (current as unknown[]).filter((i) => i !== item)
      : [...current, item];
    handleChange(key, newValue as BAPreferences[K]);
  }, [currentPrefs, handleChange]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !currentPrefs) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Erreur lors du chargement des préférences</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Préférences d&apos;investissement
        </CardTitle>
        <CardDescription>
          Ces paramètres sont utilisés par les agents d&apos;analyse pour personnaliser
          les recommandations (taille de ticket, time to liquidity, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Ticket Size */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Taille de ticket</h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ticketPercent">% typique du round</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ticketPercent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={Math.round(currentPrefs.typicalTicketPercent * 100)}
                  onChange={(e) =>
                    handleChange("typicalTicketPercent", Number(e.target.value) / 100)
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ex: 10% d&apos;un round de 500K€ = 50K€
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minTicket">Ticket minimum</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="minTicket"
                  type="number"
                  min={100}
                  max={1000000}
                  step={1000}
                  value={currentPrefs.minTicketAmount}
                  onChange={(e) =>
                    handleChange("minTicketAmount", Number(e.target.value))
                  }
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">€</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTicket">Ticket maximum</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="maxTicket"
                  type="number"
                  min={1000}
                  max={10000000}
                  step={5000}
                  value={currentPrefs.maxTicketAmount}
                  onChange={(e) =>
                    handleChange("maxTicketAmount", Number(e.target.value))
                  }
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">€</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preferred Stages */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Stages préférés</h3>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <Badge
                key={stage.value}
                variant={currentPrefs.preferredStages.includes(stage.value) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleArrayItem("preferredStages", stage.value)}
              >
                {currentPrefs.preferredStages.includes(stage.value) && (
                  <Check className="mr-1 h-3 w-3" />
                )}
                {stage.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Preferred Sectors */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Secteurs préférés</h3>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((sector) => (
              <Badge
                key={sector.value}
                variant={currentPrefs.preferredSectors.includes(sector.value) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleArrayItem("preferredSectors", sector.value)}
              >
                {currentPrefs.preferredSectors.includes(sector.value) && (
                  <Check className="mr-1 h-3 w-3" />
                )}
                {sector.label}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Laissez vide pour tous les secteurs
          </p>
        </div>

        {/* Risk Tolerance */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Tolérance au risque</h3>
          <div className="flex flex-wrap gap-2">
            {RISK_LABELS.map((label, idx) => (
              <Badge
                key={idx}
                variant={currentPrefs.riskTolerance === idx + 1 ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => handleChange("riskTolerance", idx + 1)}
              >
                {currentPrefs.riskTolerance === idx + 1 && (
                  <Check className="mr-1 h-3 w-3" />
                )}
                {label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Holding Period */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Horizon d&apos;investissement</h3>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={20}
              value={currentPrefs.expectedHoldingPeriod}
              onChange={(e) =>
                handleChange("expectedHoldingPeriod", Number(e.target.value))
              }
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">ans</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Durée avant une sortie attendue (liquidité)
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Enregistrer les préférences"
            )}
          </Button>
          {mutation.isSuccess && !hasChanges && (
            <span className="text-sm text-emerald-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Préférences enregistrées
            </span>
          )}
          {mutation.isError && (
            <span className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Erreur lors de l&apos;enregistrement
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
