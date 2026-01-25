"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  ExternalLink,
  Plus,
  Linkedin,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Sparkles,
  GraduationCap,
  Briefcase,
  Award,
} from "lucide-react";

// Types
interface FounderHighlights {
  yearsExperience?: number;
  educationLevel?: "phd" | "masters" | "bachelors" | "other" | null;
  hasRelevantIndustryExp?: boolean;
  hasFounderExperience?: boolean;
  hasTechBackground?: boolean;
  isSerialFounder?: boolean;
}

interface RedFlag {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface ExpertiseSummary {
  primaryIndustry: string | null;
  primaryRole: string | null;
  primaryEcosystem: string | null;
  description: string;
  isDiversified: boolean;
  hasDeepExpertise: boolean;
}

interface VerifiedInfo {
  linkedinScrapedAt?: string;
  highlights?: FounderHighlights;
  expertise?: ExpertiseSummary | null;
  redFlags?: RedFlag[];
}

interface Founder {
  id: string;
  dealId: string;
  name: string;
  role: string;
  linkedinUrl: string | null;
  previousVentures: unknown;
  verifiedInfo: VerifiedInfo | null;
  createdAt: string;
}

interface TeamManagementProps {
  dealId: string;
  founders: Founder[];
}

// API functions
async function createFounder(dealId: string, data: { name: string; role: string; linkedinUrl?: string }) {
  const response = await fetch(`/api/deals/${dealId}/founders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to create founder");
  }
  return response.json();
}

async function updateFounder(dealId: string, founderId: string, data: { name?: string; role?: string; linkedinUrl?: string | null }) {
  const response = await fetch(`/api/deals/${dealId}/founders/${founderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to update founder");
  }
  return response.json();
}

async function deleteFounder(dealId: string, founderId: string) {
  const response = await fetch(`/api/deals/${dealId}/founders/${founderId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to delete founder");
  }
  return response.json();
}

async function enrichFounder(dealId: string, founderId: string) {
  const response = await fetch(`/api/deals/${dealId}/founders/${founderId}/enrich`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to enrich founder");
  }
  return response.json();
}

// Component
export function TeamManagement({ dealId, founders }: TeamManagementProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [founderToDelete, setFounderToDelete] = useState<Founder | null>(null);
  const [enrichingFounderId, setEnrichingFounderId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    linkedinUrl: "",
  });

  const resetForm = useCallback(() => {
    setFormData({ name: "", role: "", linkedinUrl: "" });
    setEditingFounder(null);
  }, []);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; role: string; linkedinUrl?: string }) =>
      createFounder(dealId, data),
    onSuccess: () => {
      toast.success("Fondateur ajoute");
      setDialogOpen(false);
      resetForm();
      router.refresh(); // Refresh server data
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ founderId, data }: { founderId: string; data: { name?: string; role?: string; linkedinUrl?: string | null } }) =>
      updateFounder(dealId, founderId, data),
    onSuccess: () => {
      toast.success("Fondateur mis a jour");
      setDialogOpen(false);
      resetForm();
      router.refresh(); // Refresh server data
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (founderId: string) => deleteFounder(dealId, founderId),
    onSuccess: () => {
      toast.success("Fondateur supprime");
      setDeleteDialogOpen(false);
      setFounderToDelete(null);
      router.refresh(); // Refresh server data
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const enrichMutation = useMutation({
    mutationFn: (founderId: string) => enrichFounder(dealId, founderId),
    onSuccess: (data) => {
      const redFlagsCount = data.enrichment?.redFlagsCount ?? 0;
      if (redFlagsCount > 0) {
        toast.warning(`Profil enrichi - ${redFlagsCount} point(s) d'attention detecte(s)`);
      } else {
        toast.success("Profil LinkedIn enrichi avec succes");
      }
      setEnrichingFounderId(null);
      router.refresh(); // Refresh server data
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setEnrichingFounderId(null);
    },
  });

  // Handlers
  const handleOpenDialog = useCallback((founder?: Founder) => {
    if (founder) {
      setEditingFounder(founder);
      setFormData({
        name: founder.name,
        role: founder.role,
        linkedinUrl: founder.linkedinUrl ?? "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  }, [resetForm]);

  const handleSubmit = useCallback(() => {
    if (!formData.name.trim() || !formData.role.trim()) {
      toast.error("Nom et role sont requis");
      return;
    }

    if (editingFounder) {
      updateMutation.mutate({
        founderId: editingFounder.id,
        data: {
          name: formData.name.trim(),
          role: formData.role.trim(),
          linkedinUrl: formData.linkedinUrl.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        role: formData.role.trim(),
        linkedinUrl: formData.linkedinUrl.trim() || undefined,
      });
    }
  }, [formData, editingFounder, createMutation, updateMutation]);

  const handleDelete = useCallback((founder: Founder) => {
    setFounderToDelete(founder);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (founderToDelete) {
      deleteMutation.mutate(founderToDelete.id);
    }
  }, [founderToDelete, deleteMutation]);

  const handleEnrich = useCallback((founder: Founder) => {
    if (!founder.linkedinUrl) {
      toast.error("Ajoutez d'abord une URL LinkedIn");
      return;
    }
    setEnrichingFounderId(founder.id);
    enrichMutation.mutate(founder.id);
  }, [enrichMutation]);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Equipe Fondatrice</CardTitle>
              <CardDescription>
                Ajoutez les fondateurs avec leur LinkedIn pour une analyse approfondie
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {founders.length === 0 ? (
            <EmptyState onAdd={() => handleOpenDialog()} />
          ) : (
            <div className="space-y-4">
              {founders.map((founder) => (
                <FounderCard
                  key={founder.id}
                  founder={founder}
                  isEnriching={enrichingFounderId === founder.id}
                  onEdit={() => handleOpenDialog(founder)}
                  onDelete={() => handleDelete(founder)}
                  onEnrich={() => handleEnrich(founder)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFounder ? "Modifier le fondateur" : "Ajouter un fondateur"}
            </DialogTitle>
            <DialogDescription>
              {editingFounder
                ? "Modifiez les informations du fondateur"
                : "Ajoutez un membre de l'equipe fondatrice"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom complet *</Label>
              <Input
                id="name"
                placeholder="Jean Dupont"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Input
                id="role"
                placeholder="CEO & Co-founder"
                value={formData.role}
                onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">
                <div className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-[#0077B5]" />
                  URL LinkedIn
                </div>
              </Label>
              <Input
                id="linkedinUrl"
                placeholder="https://linkedin.com/in/jeandupont"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Ajoutez l&apos;URL LinkedIn pour enrichir automatiquement le profil
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isLoading}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingFounder ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce fondateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Etes-vous sur de vouloir supprimer {founderToDelete?.name} ? Cette action est irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Empty state component
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Users className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">Aucun fondateur</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Ajoutez les fondateurs avec leur profil LinkedIn pour une analyse approfondie de l&apos;equipe.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Ajouter un fondateur
      </Button>
    </div>
  );
}

// Founder card component
function FounderCard({
  founder,
  isEnriching,
  onEdit,
  onDelete,
  onEnrich,
}: {
  founder: Founder;
  isEnriching: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onEnrich: () => void;
}) {
  const verifiedInfo = founder.verifiedInfo as VerifiedInfo | null;
  const isEnriched = !!verifiedInfo?.linkedinScrapedAt;
  const highlights = verifiedInfo?.highlights;
  const redFlags = verifiedInfo?.redFlags ?? [];

  return (
    <div className="rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
            {founder.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{founder.name}</p>
              {isEnriched && (
                <Badge variant="secondary" className="bg-green-50 text-green-700 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Enrichi
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{founder.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {founder.linkedinUrl && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEnrich}
                disabled={isEnriching}
                title={isEnriched ? "Re-analyser le profil" : "Analyser le profil LinkedIn"}
              >
                {isEnriching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={founder.linkedinUrl} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="h-4 w-4 text-[#0077B5]" />
                </a>
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Enriched Data */}
      {isEnriched && highlights && (
        <div className="mt-4 pt-4 border-t">
          {/* Highlights Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {highlights.yearsExperience !== undefined && (
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span>{highlights.yearsExperience} ans d&apos;exp.</span>
              </div>
            )}
            {highlights.educationLevel && (
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{highlights.educationLevel}</span>
              </div>
            )}
            {highlights.isSerialFounder && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Award className="h-4 w-4" />
                <span>Serial Founder</span>
              </div>
            )}
            {highlights.hasTechBackground && (
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Background Tech</span>
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {highlights.hasRelevantIndustryExp && (
              <Badge variant="secondary" className="bg-green-50 text-green-700">
                Experience sectorielle
              </Badge>
            )}
            {highlights.hasFounderExperience && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                Experience fondateur
              </Badge>
            )}
          </div>

          {/* Red Flags */}
          {redFlags.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Points d&apos;attention ({redFlags.length})
              </p>
              <div className="space-y-1">
                {redFlags.slice(0, 3).map((flag, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded ${
                      flag.severity === "high"
                        ? "bg-red-50 text-red-700"
                        : flag.severity === "medium"
                          ? "bg-orange-50 text-orange-700"
                          : "bg-yellow-50 text-yellow-700"
                    }`}
                  >
                    {flag.message}
                  </div>
                ))}
                {redFlags.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{redFlags.length - 3} autres points
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No LinkedIn hint */}
      {!founder.linkedinUrl && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Linkedin className="h-3 w-3" />
          Ajoutez le LinkedIn pour enrichir le profil
        </div>
      )}
    </div>
  );
}
