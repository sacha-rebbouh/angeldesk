"use client";

import { memo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, MapPin, Target, Banknote, TrendingUp, BarChart3, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-foreground/[0.04] shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-foreground/40" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="text-[14px] font-medium text-foreground/85 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export const DealInfoCard = memo(function DealInfoCard({ deal }: DealInfoCardProps) {
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

  const isCustomSector = sector && !SECTORS.includes(sector as typeof SECTORS[number]);

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5">
              <Building2 className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight">Informations</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={openDialog} className="text-xs text-muted-foreground hover:text-foreground gap-1.5">
            <Pencil className="h-3 w-3" />
            Modifier
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-2">
          <div className="grid grid-cols-2 gap-x-6">
            <InfoRow icon={Target} label="Secteur" value={deal.sector ?? "Non défini"} />
            <InfoRow icon={BarChart3} label="Stade" value={getStageLabel(deal.stage, "Non défini")} />
            <InfoRow icon={MapPin} label="Géographie" value={deal.geography ?? "Non défini"} />
            <InfoRow icon={Banknote} label="Montant demandé" value={formatCurrencyEUR(deal.amountRequested)} />
            <InfoRow icon={TrendingUp} label="Valorisation pre-money" value={formatCurrencyEUR(deal.valuationPre)} />
            <InfoRow icon={Banknote} label="ARR" value={formatCurrencyEUR(deal.arr)} />
          </div>
          {deal.growthRate != null && (
            <div className="border-t border-border/30 mt-1">
              <InfoRow icon={TrendingUp} label="Croissance YoY" value={`+${deal.growthRate}%`} />
            </div>
          )}
          {deal.description && (
            <div className="border-t border-border/30 mt-1 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5">Description</p>
              <p className="text-[13px] text-foreground/70 leading-relaxed">{deal.description}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier les informations</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
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

            <div className="space-y-1.5">
              <Label htmlFor="edit-geography">Géographie</Label>
              <Input
                id="edit-geography"
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="Ex: France, Europe"
              />
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
});
