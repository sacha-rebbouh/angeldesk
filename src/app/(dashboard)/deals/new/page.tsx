"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

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
                  <Label htmlFor="arr">ARR (EUR)</Label>
                  <Input
                    id="arr"
                    type="number"
                    placeholder="Ex: 500000"
                    value={formData.arr}
                    onChange={handleChange("arr")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="growthRate">Croissance YoY (%)</Label>
                  <Input
                    id="growthRate"
                    type="number"
                    placeholder="Ex: 150"
                    value={formData.growthRate}
                    onChange={handleChange("growthRate")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountRequested">Montant demandé (EUR)</Label>
                  <Input
                    id="amountRequested"
                    type="number"
                    placeholder="Ex: 2000000"
                    value={formData.amountRequested}
                    onChange={handleChange("amountRequested")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valuationPre">Valorisation pre-money (EUR)</Label>
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
