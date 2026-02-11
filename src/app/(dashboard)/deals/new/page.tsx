"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

function FieldLabel({ htmlFor, children, tooltip, recommended }: {
  htmlFor: string;
  children: React.ReactNode;
  tooltip?: string;
  recommended?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      {recommended && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-600 border-blue-200">
          Recommandé
        </Badge>
      )}
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

const STAGES = [
  { value: "PRE_SEED", label: "Pre-seed" },
  { value: "SEED", label: "Seed" },
  { value: "SERIES_A", label: "Série A" },
  { value: "SERIES_B", label: "Série B" },
  { value: "SERIES_C", label: "Série C" },
  { value: "LATER", label: "Later Stage" },
];

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
  "Autre",
];

interface CreateDealFormData {
  name: string;
  companyName: string;
  website: string;
  description: string;
  sector: string;
  customSector: string;
  stage: string;
  geography: string;
  arr: string;
  growthRate: string;
  amountRequested: string;
  valuationPre: string;
}

// Normalize website URL: add https:// if missing
function normalizeWebsite(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed) return "";
  // If already has protocol, return as-is
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Add https:// prefix
  return `https://${trimmed}`;
}

async function createDeal(data: CreateDealFormData) {
  // Use customSector if "Autre" was selected
  const effectiveSector = data.sector === "Autre" && data.customSector.trim()
    ? data.customSector.trim()
    : data.sector || undefined;

  const response = await fetch("/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      companyName: data.companyName || undefined,
      website: normalizeWebsite(data.website) || undefined,
      description: data.description || undefined,
      sector: effectiveSector,
      stage: data.stage || undefined,
      geography: data.geography || undefined,
      arr: data.arr ? parseFloat(data.arr) : undefined,
      growthRate: data.growthRate ? parseFloat(data.growthRate) : undefined,
      amountRequested: data.amountRequested
        ? parseFloat(data.amountRequested)
        : undefined,
      valuationPre: data.valuationPre
        ? parseFloat(data.valuationPre)
        : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to create deal");
  }

  return response.json();
}

export default function NewDealPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CreateDealFormData>({
    name: "",
    companyName: "",
    website: "",
    description: "",
    sector: "",
    customSector: "",
    stage: "",
    geography: "",
    arr: "",
    growthRate: "",
    amountRequested: "",
    valuationPre: "",
  });

  const [errors, setErrors] = useState({});

  // Completeness tracking (F88)
  const completeness = useMemo(() => {
    const fields = {
      name: { filled: !!formData.name.trim(), weight: 2, level: "minimum" as const },
      sector: { filled: !!formData.sector, weight: 2, level: "minimum" as const },
      stage: { filled: !!formData.stage, weight: 2, level: "minimum" as const },
      description: { filled: !!formData.description.trim(), weight: 2, level: "minimum" as const },
      companyName: { filled: !!formData.companyName.trim(), weight: 1, level: "optimal" as const },
      website: { filled: !!formData.website.trim(), weight: 1, level: "optimal" as const },
      geography: { filled: !!formData.geography.trim(), weight: 1, level: "optimal" as const },
      arr: { filled: !!formData.arr, weight: 1.5, level: "optimal" as const },
      growthRate: { filled: !!formData.growthRate, weight: 1, level: "optimal" as const },
      amountRequested: { filled: !!formData.amountRequested, weight: 1.5, level: "optimal" as const },
      valuationPre: { filled: !!formData.valuationPre, weight: 1.5, level: "optimal" as const },
    };

    const totalWeight = Object.values(fields).reduce((sum, f) => sum + f.weight, 0);
    const filledWeight = Object.values(fields).reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
    const percentage = Math.round((filledWeight / totalWeight) * 100);

    const minFields = Object.entries(fields).filter(([, f]) => f.level === "minimum");
    const minFilled = minFields.filter(([, f]) => f.filled).length;
    const isMinimumMet = minFilled === minFields.length;

    return {
      percentage,
      isMinimumMet,
      minFilled,
      minTotal: minFields.length,
      level: percentage >= 80 ? "optimal" as const : percentage >= 50 ? "good" as const : "basic" as const,
    };
  }, [formData]);

  const mutation = useMutation({
    mutationFn: createDeal,
    onSuccess: (response) => {
      toast.success("Deal créé avec succès");
      // Navigate immediately, invalidate in background
      router.push(`/deals/${response.data.id}`);
      // Invalidate after navigation starts (non-blocking)
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleChange = useCallback(
    (field: keyof CreateDealFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      },
    []
  );

  const handleSelectChange = useCallback(
    (field: keyof CreateDealFormData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name.trim()) {
        toast.error("Le nom du deal est requis");
        return;
      }
      mutation.mutate(formData);
    },
    [formData, mutation]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/deals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nouveau deal</h1>
          <p className="text-muted-foreground">
            Ajoutez les informations de base pour commencer l&apos;analyse
          </p>
        </div>
      </div>

      {/* Completeness Bar (F88) */}
      <Card className={cn(
        "border-2",
        completeness.level === "optimal" ? "border-green-200 bg-green-50" :
        completeness.level === "good" ? "border-blue-200 bg-blue-50" :
        "border-gray-200"
      )}>
        <CardContent className="py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Complétude du deal</span>
              <Badge variant={completeness.level === "optimal" ? "default" : "secondary"}>
                {completeness.percentage}%
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {completeness.isMinimumMet
                ? "Données minimales OK — Ajoutez les financiers pour une meilleure analyse"
                : `${completeness.minFilled}/${completeness.minTotal} champs minimaux remplis`}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                completeness.level === "optimal" ? "bg-green-500" :
                completeness.level === "good" ? "bg-blue-500" : "bg-gray-400"
              )}
              style={{ width: `${completeness.percentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Minimal</span>
            <span className="text-[10px] text-muted-foreground">Optimal</span>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Informations de base</CardTitle>
              <CardDescription>
                Les informations essentielles sur le deal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du deal *</Label>
                <Input
                  id="name"
                  placeholder="Ex: TechStartup Series A"
                  value={formData.name}
                  onChange={handleChange("name")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Nom de la société</Label>
                <Input
                  id="companyName"
                  placeholder="Ex: TechStartup SAS"
                  value={formData.companyName}
                  onChange={handleChange("companyName")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Site web</Label>
                <Input
                  id="website"
                  type="text"
                  placeholder="example.com"
                  value={formData.website}
                  onChange={handleChange("website")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Décrivez brièvement l'activité de la startup..."
                  value={formData.description}
                  onChange={handleChange("description")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Classification */}
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
              <CardDescription>
                Secteur, stade et localisation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sector">Secteur</Label>
                <Select
                  value={formData.sector}
                  onValueChange={handleSelectChange("sector")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.sector === "Autre" && (
                  <Input
                    id="customSector"
                    placeholder="Précisez le secteur..."
                    value={formData.customSector}
                    onChange={handleChange("customSector")}
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage">Stade</Label>
                <Select
                  value={formData.stage}
                  onValueChange={handleSelectChange("stage")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un stade" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="geography">Géographie</Label>
                <Input
                  id="geography"
                  placeholder="Ex: France, Europe"
                  value={formData.geography}
                  onChange={handleChange("geography")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Informations financières</CardTitle>
              <CardDescription>
                Métriques clés et détails de la levée
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <FieldLabel
                    htmlFor="arr"
                    tooltip="Annual Recurring Revenue — Revenu annuel récurrent. C'est la métrique clé pour les SaaS. Si la startup n'est pas SaaS, utilisez le CA annuel."
                    recommended
                  >
                    ARR (EUR)
                  </FieldLabel>
                  <Input
                    id="arr"
                    type="number"
                    placeholder="Ex: 500000"
                    value={formData.arr}
                    onChange={handleChange("arr")}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    htmlFor="growthRate"
                    tooltip="Taux de croissance annuel du revenu (year-over-year). Un SaaS Seed typique croît de 100-200%/an."
                  >
                    Croissance YoY (%)
                  </FieldLabel>
                  <Input
                    id="growthRate"
                    type="number"
                    placeholder="Ex: 150"
                    value={formData.growthRate}
                    onChange={handleChange("growthRate")}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    htmlFor="amountRequested"
                    tooltip="Montant total que la startup cherche à lever dans ce round. Inclut tous les investisseurs, pas seulement votre ticket."
                    recommended
                  >
                    Montant demandé (EUR)
                  </FieldLabel>
                  <Input
                    id="amountRequested"
                    type="number"
                    placeholder="Ex: 2000000"
                    value={formData.amountRequested}
                    onChange={handleChange("amountRequested")}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    htmlFor="valuationPre"
                    tooltip="Valorisation de l'entreprise AVANT l'investissement (pre-money). Post-money = Pre-money + Montant levé. Votre % = Ticket / Post-money."
                    recommended
                  >
                    Valorisation pre-money (EUR)
                  </FieldLabel>
                  <Input
                    id="valuationPre"
                    type="number"
                    placeholder="Ex: 8000000"
                    value={formData.valuationPre}
                    onChange={handleChange("valuationPre")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <Button variant="outline" type="button" asChild>
            <Link href="/deals">Annuler</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Créer le deal
          </Button>
        </div>
      </form>
    </div>
  );
}
