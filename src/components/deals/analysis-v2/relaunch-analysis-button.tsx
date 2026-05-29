"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";

interface RelaunchAnalysisButtonProps {
  dealId: string;
}

/**
 * Bouton « Relancer une analyse » de la vue v2, à côté de l'Export PDF.
 * Reproduit l'appel de l'ancien AnalysisPanel (POST /api/analyze, full_analysis).
 * En dropdown : le clic explicite sur l'item sert de garde-fou (la relance
 * consomme des crédits et lance une nouvelle analyse en arrière-plan).
 *
 * Feedback : toast + router.refresh() (pas de progression live sur la v2 — éviter
 * de cacher la dernière analyse valide derrière un état ANALYZING potentiellement
 * bloqué). La nouvelle analyse apparaît au rechargement une fois terminée.
 */
export function RelaunchAnalysisButton({ dealId }: RelaunchAnalysisButtonProps) {
  const router = useRouter();
  const [isRelaunching, setIsRelaunching] = useState(false);

  const handleRelaunch = useCallback(async () => {
    setIsRelaunching(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, type: "full_analysis" }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 403 || err.upgradeRequired) {
          toast.error(err.error || "Crédits insuffisants pour relancer l'analyse", {
            action: { label: "Acheter des crédits", onClick: () => router.push("/pricing") },
          });
          return;
        }
        throw new Error(err.error || "Échec du lancement de l'analyse");
      }

      toast.success(
        "Analyse relancée en arrière-plan — recharge la page dans quelques minutes pour voir le nouveau résultat.",
      );
      router.refresh();
    } catch (error) {
      console.error("[RelaunchAnalysisButton] relaunch error:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la relance de l'analyse");
    } finally {
      setIsRelaunching(false);
    }
  }, [dealId, router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isRelaunching} className="gap-1.5">
          {isRelaunching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Relancer
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onClick={handleRelaunch}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <div className="flex items-center gap-2 font-medium">
            <RotateCw className="h-4 w-4 text-blue-600" />
            Relancer l'analyse complète
          </div>
          <span className="text-xs text-muted-foreground ml-6">
            Consomme des crédits · lance une nouvelle analyse en arrière-plan
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
