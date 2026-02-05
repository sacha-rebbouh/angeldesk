"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
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
  Plus,
  Linkedin,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  Sparkles,
  Briefcase,
  Award,
  GraduationCap,
  TrendingUp,
  Target,
  Network,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface AnalysisScores {
  domainExpertise?: number;
  entrepreneurialExperience?: number;
  executionCapability?: number;
  networkStrength?: number;
  overallFounderScore?: number;
}

interface AnalysisBackground {
  yearsExperience?: number;
  headline?: string;
  topPreviousCompanies?: string[];
  keySkills?: string[];
  educationHighlight?: string;
  relevantRoles?: string[];
  domainExpertiseYears?: number;
}

interface AnalysisRedFlag {
  type: string;
  severity: string;
  description: string;
  evidence?: string;
}

/** verifiedInfo can come from LinkedIn enrichment OR team-investigator analysis */
interface VerifiedInfo {
  // From LinkedIn enrichment
  linkedinScrapedAt?: string;
  highlights?: {
    yearsExperience?: number;
    educationLevel?: "phd" | "masters" | "bachelors" | "other" | null;
    hasRelevantIndustryExp?: boolean;
    hasFounderExperience?: boolean;
    hasTechBackground?: boolean;
    isSerialFounder?: boolean;
  };
  expertise?: {
    primaryIndustry?: string | null;
    primaryRole?: string | null;
    description?: string;
  } | null;
  // From LinkedIn enrichment (old format)
  redFlags?: Array<{ type: string; severity: string; message: string }>;

  // From team-investigator analysis (new format)
  source?: "team-investigator";
  analyzedAt?: string;
  scores?: AnalysisScores;
  background?: AnalysisBackground;
  strengths?: string[];
  concerns?: string[];
  linkedinVerified?: boolean;
  entrepreneurialTrack?: {
    isFirstTimeFounder?: boolean;
    previousVentures?: Array<{
      name: string;
      role: string;
      outcome: string;
      duration?: string;
      relevance?: string;
    }>;
    totalVentures?: number;
    successfulExits?: number;
  };
}

interface Founder {
  id: string;
  dealId: string;
  name: string;
  role: string;
  linkedinUrl: string | null;
  previousVentures: unknown;
  verifiedInfo: VerifiedInfo | Record<string, unknown> | null;
  createdAt: string;
}

interface TeamManagementProps {
  dealId: string;
  founders: Founder[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 50) return "text-blue-700 bg-blue-50 border-blue-200";
  if (score >= 30) return "text-orange-700 bg-orange-50 border-orange-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function getScoreBg(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-blue-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-500";
}

function getVerifiedInfo(founder: Founder): VerifiedInfo | null {
  if (!founder.verifiedInfo) return null;
  return founder.verifiedInfo as VerifiedInfo;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TeamManagement = memo(function TeamManagement({ dealId, founders }: TeamManagementProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [founderToDelete, setFounderToDelete] = useState<Founder | null>(null);
  const [enrichingFounderId, setEnrichingFounderId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    linkedinUrl: "",
  });

  const resetForm = useCallback(() => {
    setFormData({ name: "", role: "", linkedinUrl: "" });
    setEditingFounder(null);
  }, []);

  // Count analyzed members
  const analyzedCount = useMemo(
    () => founders.filter(f => {
      const vi = getVerifiedInfo(f);
      return vi?.source === "team-investigator";
    }).length,
    [founders]
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; role: string; linkedinUrl?: string }) =>
      createFounder(dealId, data),
    onSuccess: () => {
      toast.success("Membre ajoute");
      setDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ founderId, data }: { founderId: string; data: { name?: string; role?: string; linkedinUrl?: string | null } }) =>
      updateFounder(dealId, founderId, data),
    onSuccess: () => {
      toast.success("Membre mis a jour");
      setDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (founderId: string) => deleteFounder(dealId, founderId),
    onSuccess: () => {
      toast.success("Membre supprime");
      setDeleteDialogOpen(false);
      setFounderToDelete(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      router.refresh();
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
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      router.refresh();
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Equipe
              </CardTitle>
              <CardDescription className="mt-1">
                {founders.length} membre{founders.length !== 1 ? "s" : ""}
                {analyzedCount > 0 && (
                  <span className="ml-1 text-blue-600">
                    &middot; {analyzedCount} analyse{analyzedCount !== 1 ? "s" : ""} IA
                  </span>
                )}
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {founders.length === 0 ? (
            <EmptyState onAdd={() => handleOpenDialog()} />
          ) : (
            <div className="space-y-3">
              {founders.map((founder) => (
                <MemberCard
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
              {editingFounder ? "Modifier" : "Ajouter un membre"}
            </DialogTitle>
            <DialogDescription>
              {editingFounder
                ? "Modifiez les informations. Les modifications sont conservees pour les prochaines analyses."
                : "Ajoutez un membre de l'equipe"}
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
                placeholder="CEO, CTO, Architecte SI..."
                value={formData.role}
                onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">
                <span className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-[#0077B5]" />
                  URL LinkedIn
                </span>
              </Label>
              <Input
                id="linkedinUrl"
                placeholder="https://linkedin.com/in/jeandupont"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
              />
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
            <AlertDialogTitle>Supprimer ce membre ?</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer {founderToDelete?.name} de l&apos;equipe ? Cette personne ne sera plus incluse dans les prochaines analyses.
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
});

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Users className="h-12 w-12 text-muted-foreground/30" />
      <h3 className="mt-4 text-base font-semibold">Aucun membre</h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
        Ajoutez les membres de l&apos;equipe ou lancez une analyse pour les detecter automatiquement.
      </p>
      <Button className="mt-4" size="sm" onClick={onAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Ajouter un membre
      </Button>
    </div>
  );
}

// ============================================================================
// SCORE MINI BAR
// ============================================================================

function ScoreMiniBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-muted-foreground truncate">{label}</span>
          <span className="text-[10px] font-semibold ml-1">{value}</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getScoreBg(value))}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MEMBER CARD (unified: DB founder + analysis data)
// ============================================================================

function MemberCard({
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
  const vi = getVerifiedInfo(founder);
  const isAnalyzed = vi?.source === "team-investigator";
  const isLinkedInEnriched = !!vi?.linkedinScrapedAt;
  const scores = vi?.scores;
  const background = vi?.background;
  const strengths = vi?.strengths;
  const concerns = vi?.concerns;
  const analysisRedFlags = isAnalyzed
    ? (vi?.redFlags as AnalysisRedFlag[] | undefined)
    : undefined;
  const linkedInRedFlags = !isAnalyzed
    ? (vi?.redFlags as Array<{ type: string; severity: string; message: string }> | undefined)
    : undefined;
  const highlights = vi?.highlights;
  const overallScore = scores?.overallFounderScore;

  return (
    <div className="rounded-lg border bg-card transition-colors hover:border-muted-foreground/20">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4 pb-2">
        {/* Avatar with score ring */}
        <div className="relative shrink-0">
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold",
            overallScore !== undefined
              ? getScoreColor(overallScore) + " border"
              : "bg-muted text-muted-foreground"
          )}>
            {overallScore !== undefined ? overallScore : founder.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Name + role + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{founder.name}</span>
            {isAnalyzed && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                IA
              </Badge>
            )}
            {(isLinkedInEnriched || vi?.linkedinVerified) ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                LinkedIn
              </Badge>
            ) : isAnalyzed ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                Deck seul
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{founder.role}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {founder.linkedinUrl && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEnrich}
                disabled={isEnriching}
                title="Enrichir via LinkedIn"
              >
                {isEnriching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={founder.linkedinUrl} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="h-3.5 w-3.5 text-[#0077B5]" />
                </a>
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Modifier">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} title="Supprimer">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      {/* Analysis scores */}
      {scores && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-4 gap-3">
            <ScoreMiniBar label="Domain" value={scores.domainExpertise ?? 0} icon={Target} />
            <ScoreMiniBar label="Startup XP" value={scores.entrepreneurialExperience ?? 0} icon={TrendingUp} />
            <ScoreMiniBar label="Execution" value={scores.executionCapability ?? 0} icon={Zap} />
            <ScoreMiniBar label="Network" value={scores.networkStrength ?? 0} icon={Network} />
          </div>
          {isAnalyzed && !vi?.linkedinVerified && !isLinkedInEnriched && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Scores estimes depuis le deck. <button onClick={onEdit} className="underline font-medium hover:text-amber-900">Ajoutez le LinkedIn</button> pour une analyse verifiee.</span>
            </div>
          )}
        </div>
      )}

      {/* Background companies */}
      {background?.topPreviousCompanies && background.topPreviousCompanies.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {background.topPreviousCompanies.map((co, j) => (
            <Badge key={j} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
              {co}
            </Badge>
          ))}
          {background.yearsExperience !== undefined && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
              <Briefcase className="mr-0.5 h-2.5 w-2.5" />
              {background.yearsExperience} ans
            </Badge>
          )}
        </div>
      )}

      {/* LinkedIn highlights (old enrichment format) */}
      {isLinkedInEnriched && highlights && !isAnalyzed && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {highlights.yearsExperience !== undefined && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                <Briefcase className="mr-0.5 h-2.5 w-2.5" />
                {highlights.yearsExperience} ans
              </Badge>
            )}
            {highlights.educationLevel && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                <GraduationCap className="mr-0.5 h-2.5 w-2.5" />
                {highlights.educationLevel}
              </Badge>
            )}
            {highlights.isSerialFounder && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700">
                <Award className="mr-0.5 h-2.5 w-2.5" />
                Serial Founder
              </Badge>
            )}
            {highlights.hasTechBackground && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700">
                Background Tech
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Strengths + Concerns */}
      {((strengths && strengths.length > 0) || (concerns && concerns.length > 0)) && (
        <div className="px-4 pb-2 space-y-1">
          {strengths?.slice(0, 2).map((s, j) => (
            <div key={`s-${j}`} className="flex items-start gap-1.5 text-[11px] text-green-700">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{s}</span>
            </div>
          ))}
          {concerns?.slice(0, 2).map((c, j) => (
            <div key={`c-${j}`} className="flex items-start gap-1.5 text-[11px] text-orange-600">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {/* Analysis red flags */}
      {analysisRedFlags && analysisRedFlags.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {analysisRedFlags.slice(0, 2).map((rf, j) => (
            <div key={j} className={cn(
              "text-[11px] px-2 py-1 rounded",
              rf.severity === "CRITICAL" ? "bg-red-50 text-red-700" :
              rf.severity === "HIGH" ? "bg-orange-50 text-orange-700" :
              "bg-yellow-50 text-yellow-700"
            )}>
              {rf.description}
            </div>
          ))}
        </div>
      )}

      {/* LinkedIn enrichment red flags (old format) */}
      {linkedInRedFlags && linkedInRedFlags.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {linkedInRedFlags.slice(0, 2).map((flag, idx) => (
            <div key={idx} className={cn(
              "text-[11px] px-2 py-1 rounded",
              flag.severity === "high" ? "bg-red-50 text-red-700" :
              flag.severity === "medium" ? "bg-orange-50 text-orange-700" :
              "bg-yellow-50 text-yellow-700"
            )}>
              {flag.message}
            </div>
          ))}
        </div>
      )}

      {/* No LinkedIn hint */}
      {!founder.linkedinUrl && !isAnalyzed && (
        <div className="px-4 pb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Linkedin className="h-3 w-3" />
          Ajoutez le LinkedIn pour enrichir le profil
        </div>
      )}
    </div>
  );
}
