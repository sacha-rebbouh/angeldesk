"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStageLabel, formatCurrencyEUR } from "@/lib/format-utils";

const STAGES = [
  { value: "PRE_SEED", label: "Pre-seed" },
  { value: "SEED", label: "Seed" },
  { value: "SERIES_A", label: "Série A" },
  { value: "SERIES_B", label: "Série B" },
  { value: "SERIES_C", label: "Série C" },
  { value: "LATER", label: "Later Stage" },
] as const;

const SECTORS = [
  "AI / Machine Learning",
  "Blockchain / Web3",
  "Cybersecurity",
  "FinTech",
  "HealthTech",
  "EdTech",
  "E-commerce",
  "SaaS B2B",
  "SaaS B2C",
  "Marketplace",
  "DeepTech",
  "CleanTech",
  "FoodTech",
  "PropTech",
  "InsurTech",
  "HRTech",
  "LegalTech",
  "Gaming / Esports",
  "Hardware / IoT",
  "Consumer",
] as const;

interface DealInfo {
  id: string;
  sector: string | null;
  stage: string | null;
  geography: string | null;
  description: string | null;
  amountRequested: number | null;
  arr: number | null;
  growthRate: number | null;
  valuationPre: number | null;
}

interface DealInfoCardProps {
  deal: DealInfo;
}

export function DealInfoCard({ deal }: DealInfoCardProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [sector, setSector] = useState(deal.sector ?? "");
  const [stage, setStage] = useState(deal.stage ?? "");
  const [geography, setGeography] = useState(deal.geography ?? "");
  const [description, setDescription] = useState(deal.description ?? "");
  const [arr, setArr] = useState(deal.arr != null ? String(deal.arr) : "");
  const [growthRate, setGrowthRate] = useState(deal.growthRate != null ? String(deal.growthRate) : "");
  const [amountRequested, setAmountRequested] = useState(deal.amountRequested != null ? String(deal.amountRequested) : "");
  const [valuationPre, setValuationPre] = useState(deal.valuationPre != null ? String(deal.valuationPre) : "");

  const openDialog = useCallback(() => {
    // Reset form to current deal values
    setSector(deal.sector ?? "");
    setStage(deal.stage ?? "");
    setGeography(deal.geography ?? "");
    setDescription(deal.description ?? "");
    setArr(deal.arr != null ? String(deal.arr) : "");
    setGrowthRate(deal.growthRate != null ? String(deal.growthRate) : "");
    setAmountRequested(deal.amountRequested != null ? String(deal.amountRequested) : "");
    setValuationPre(deal.valuationPre != null ? String(deal.valuationPre) : "");
    setIsOpen(true);
  }, [deal]);

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      const body: Record<string, unknown> = {};

      // Only send changed fields
      if (sector !== (deal.sector ?? "")) body.sector = sector || undefined;
      if (stage !== (deal.stage ?? "")) body.stage = stage || undefined;
      if (geography !== (deal.geography ?? "")) body.geography = geography || undefined;
      if (description !== (deal.description ?? "")) body.description = description || undefined;

      const newArr = arr ? parseFloat(arr) : undefined;
      const oldArr = deal.arr != null ? deal.arr : undefined;
      if (newArr !== oldArr) body.arr = newArr;

      const newGrowth = growthRate ? parseFloat(growthRate) : undefined;
      const oldGrowth = deal.growthRate != null ? deal.growthRate : undefined;
      if (newGrowth !== oldGrowth) body.growthRate = newGrowth;

      const newAmount = amountRequested ? parseFloat(amountRequested) : undefined;
      const oldAmount = deal.amountRequested != null ? deal.amountRequested : undefined;
      if (newAmount !== oldAmount) body.amountRequested = newAmount;

      const newValuation = valuationPre ? parseFloat(valuationPre) : undefined;
      const oldValuation = deal.valuationPre != null ? deal.valuationPre : undefined;
      if (newValuation !== oldValuation) body.valuationPre = newValuation;

      if (Object.keys(body).length === 0) {
        setIsOpen(false);
        return;
      }

      const response = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Erreur lors de la mise à jour");
      }

      toast.success("Deal mis à jour");
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la mise à jour");
    } finally {
      setIsLoading(false);
    }
  }, [deal, sector, stage, geography, description, arr, growthRate, amountRequested, valuationPre, router]);

  // Check if sector is a custom one (not in SECTORS list)
  const isCustomSector = sector && !SECTORS.includes(sector as typeof SECTORS[number]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Informations</CardTitle>
          <Button variant="ghost" size="sm" onClick={openDialog}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Modifier
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Secteur</p>
              <p>{deal.sector ?? "Non défini"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Stade</p>
              <p>{getStageLabel(deal.stage, "Non défini")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Géographie</p>
              <p>{deal.geography ?? "Non défini"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Montant demandé</p>
              <p>{formatCurrencyEUR(deal.amountRequested)}</p>
            </div>
          </div>
          {deal.description && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="mt-1 text-sm">{deal.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier les informations</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Stage */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage">Stade</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger id="edit-stage">
                  <SelectValue placeholder="Sélectionnez un stade" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sector */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-sector">Secteur</Label>
              {isCustomSector ? (
                <Input
                  id="edit-sector"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Secteur personnalisé"
                />
              ) : (
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger id="edit-sector">
                    <SelectValue placeholder="Sélectionnez un secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Geography */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-geography">Géographie</Label>
              <Input
                id="edit-geography"
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="Ex: France, Europe"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <textarea
                id="edit-description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description de la startup..."
              />
            </div>

            {/* Financial fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-arr">ARR (EUR)</Label>
                <Input
                  id="edit-arr"
                  type="number"
                  value={arr}
                  onChange={(e) => setArr(e.target.value)}
                  placeholder="Ex: 500000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-growth">Croissance YoY (%)</Label>
                <Input
                  id="edit-growth"
                  type="number"
                  value={growthRate}
                  onChange={(e) => setGrowthRate(e.target.value)}
                  placeholder="Ex: 150"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-amount">Montant demandé (EUR)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  value={amountRequested}
                  onChange={(e) => setAmountRequested(e.target.value)}
                  placeholder="Ex: 2000000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-valuation">Valo pre-money (EUR)</Label>
                <Input
                  id="edit-valuation"
                  type="number"
                  value={valuationPre}
                  onChange={(e) => setValuationPre(e.target.value)}
                  placeholder="Ex: 8000000"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
