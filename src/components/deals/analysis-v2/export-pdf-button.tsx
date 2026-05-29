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
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExportPdfButtonProps {
  dealId: string;
  /**
   * Optionnel : si absent, la route exporte la dernière analyse COMPLETED — ce qui
   * correspond exactement à ce que la vue v2 affiche (latestCompletedAnalysis).
   */
  analysisId?: string;
}

/**
 * Bouton d'export PDF de la vue analyse v2. Restauré après la migration v2 qui
 * avait laissé l'export uniquement dans l'ancien AnalysisPanel (fallback).
 * Logique de téléchargement portée à l'identique de l'ancien panel.
 */
export function ExportPdfButton({ dealId, analysisId }: ExportPdfButtonProps) {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(
    async (format: "full" | "summary") => {
      setIsExporting(true);
      try {
        const params = new URLSearchParams({ format });
        if (analysisId) params.set("analysisId", analysisId);
        const response = await fetch(`/api/deals/${dealId}/export-pdf?${params.toString()}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            toast.error("Crédits insuffisants pour l'export PDF", {
              action: { label: "Acheter des crédits", onClick: () => router.push("/pricing") },
            });
            return;
          }
          throw new Error(errorData.error || "Erreur lors de l'export");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "rapport-dd.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(format === "summary" ? "Résumé PDF exporté" : "Rapport complet PDF exporté");
      } catch (error) {
        console.error("[ExportPdfButton] PDF export error:", error);
        toast.error(error instanceof Error ? error.message : "Erreur lors de l'export PDF");
      } finally {
        setIsExporting(false);
      }
    },
    [dealId, analysisId, router],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting} className="gap-1.5">
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export PDF
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => handleExport("summary")}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-blue-600" />
            Résumé exécutif
          </div>
          <span className="text-xs text-muted-foreground ml-6">
            5-7 pages — Score, red flags, questions clés
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("full")}
          className="flex flex-col items-start gap-0.5 py-2.5"
        >
          <div className="flex items-center gap-2 font-medium">
            <Download className="h-4 w-4 text-blue-600" />
            Rapport complet
          </div>
          <span className="text-xs text-muted-foreground ml-6">
            30-50 pages — dossier complet, toutes les analyses
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
