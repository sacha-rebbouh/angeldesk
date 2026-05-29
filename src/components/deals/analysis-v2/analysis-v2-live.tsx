"use client";

import "./tokens.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/query-keys";
import { AnalysisProgress } from "../analysis-progress";
import { ThesisReviewModal } from "../thesis/thesis-review-modal";
import { AnalysisV2PageShell } from "./page-shell";
import type { AnalysisV2ViewModel } from "./lib/selectors";

// Au-delà de cette durée d'activité sans complétion, on rend la main à la vue v2
// (l'analyse continue en arrière-plan) pour ne pas laisser un spinner bloqué.
const ACTIVE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

type LatestAnalysis = {
  id: string;
  status: string;
  completedAgents: number;
  totalAgents: number;
  startedAt: string | null;
  createdAt: string;
  mode: string | null;
};

type ThesisLite = {
  reformulated: string;
  verdict: string;
  confidence: number;
  alerts?: Array<unknown>;
};

type Props = {
  dealName: string;
  vm: AnalysisV2ViewModel;
  dealId: string;
  hideHeader?: boolean;
  /** true si une analyse RUNNING existe déjà au chargement (SSR). */
  initialActive: boolean;
};

function ActiveAnalysisView({
  dealName,
  hideHeader,
  running,
}: {
  dealName: string;
  hideHeader?: boolean;
  running: LatestAnalysis | null;
}) {
  const wrapperClass = hideHeader
    ? "analysis-v2 rounded-xl p-4 sm:p-6"
    : "analysis-v2 -m-4 min-h-screen p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8";
  return (
    <div className={wrapperClass}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        {hideHeader ? null : (
          <header className="flex flex-col gap-2">
            <span className="av-eyebrow">Analyse en cours</span>
            <h1 className="av-h1">{dealName}</h1>
          </header>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyse en cours…
            </CardTitle>
            {running ? (
              <CardDescription>
                {running.completedAgents}/{running.totalAgents} étapes terminées
              </CardDescription>
            ) : (
              <CardDescription>Initialisation de l&apos;analyse…</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <AnalysisProgress
              isRunning
              analysisType="full_analysis"
              completedAgents={running?.completedAgents ?? 0}
              totalAgents={running?.totalAgents ?? 0}
              startedAt={running?.startedAt ?? running?.createdAt ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * AnalysisV2Live — couche opérationnelle de la vue v2.
 *
 * Rend la v2 autosuffisante sur tout le cycle de vie (relance → revue de thèse →
 * progression → résultat), pour supprimer la bascule v2 ↔ ancien panel qui créait
 * le trou de timing (SSR vs Inngest async) et l'impasse « revue de thèse en attente ».
 *
 * - Polling du statut de la dernière analyse + de la thèse (hasPendingDecision).
 * - Auto-ouverture du `ThesisReviewModal` (réutilisé tel quel — self-routing vers
 *   /thesis/decision & /thesis/rebuttal) dès qu'une thèse est en attente.
 * - Relance thèse-aware : POST /api/analyze, puis bascule immédiate (client) sur le
 *   suivi live — pas de `router.refresh()` qui courait après le worker Inngest. Sur
 *   409 (analyse/thèse déjà en cours), on bascule aussi sur le suivi pour surfacer le
 *   modal au lieu d'un toast en cul-de-sac.
 * - Au COMPLETED/FAILED de l'analyse suivie, `router.refresh()` reconstruit la vue v2.
 */
export function AnalysisV2Live({ dealName, vm, dealId, hideHeader, initialActive }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isActive, setIsActive] = useState(initialActive);
  const [isRelaunching, setIsRelaunching] = useState(false);
  const [isThesisModalOpen, setIsThesisModalOpen] = useState(false);

  // Id de l'analyse RUNNING qu'on suit. Tant qu'il est null après une relance, un
  // statut COMPLETED correspond encore à l'ANCIENNE analyse → on l'ignore (le worker
  // Inngest n'a pas encore créé la nouvelle). Une fois la nouvelle RUNNING captée, son
  // passage en terminal nous fait rendre la vue v2.
  const watchedIdRef = useRef<string | null>(null);
  const activeSinceRef = useRef<number>(initialActive ? Date.now() : 0);

  const { data: latest } = useQuery({
    queryKey: queryKeys.analyses.latest(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/analyses`);
      if (!res.ok) throw new Error("Failed to fetch analysis status");
      return (await res.json()) as { data: LatestAnalysis | null };
    },
    refetchInterval: isActive ? 3000 : false,
    refetchOnWindowFocus: true,
    staleTime: isActive ? 0 : 30_000,
  });

  const status = latest?.data?.status ?? null;
  const runningAnalysisId = status === "RUNNING" ? latest?.data?.id ?? null : null;

  const { data: thesisData } = useQuery({
    queryKey: [...queryKeys.thesis.byDeal(dealId), runningAnalysisId ?? "latest"],
    queryFn: async () => {
      const search = runningAnalysisId ? `?analysisId=${runningAnalysisId}` : "";
      const res = await fetch(`/api/deals/${dealId}/thesis${search}`);
      if (!res.ok) throw new Error("Failed to fetch thesis");
      const json = await res.json();
      return json.data as { thesis: ThesisLite | null; hasPendingDecision: boolean };
    },
    refetchInterval: isActive ? 5000 : false,
    refetchOnWindowFocus: true,
    staleTime: isActive ? 0 : 15_000,
  });

  const thesis = thesisData?.thesis ?? null;
  const hasPendingDecision = thesisData?.hasPendingDecision ?? false;

  // Auto-open / auto-close du modal de revue de thèse (guard `!!thesis` : on n'ouvre
  // pas si le serveur renvoie pendingDecision=true mais thesis=null, état incohérent).
  useEffect(() => {
    if (hasPendingDecision && !!thesis && !isThesisModalOpen) {
      setIsThesisModalOpen(true);
    }
    if ((!hasPendingDecision || !thesis) && isThesisModalOpen) {
      setIsThesisModalOpen(false);
    }
  }, [hasPendingDecision, thesis, isThesisModalOpen]);

  // Détection du terminal de l'analyse suivie → on rend la vue v2 (recharge SSR).
  useEffect(() => {
    if (!isActive) return;
    const d = latest?.data;
    if (!d) return;

    if (d.status === "RUNNING") {
      watchedIdRef.current = d.id;
      return;
    }

    if (d.status === "COMPLETED" || d.status === "FAILED") {
      // Pas encore de nouvelle analyse captée (relance tout juste émise) → on attend.
      if (!watchedIdRef.current) return;
      setIsActive(false);
      watchedIdRef.current = null;
      activeSinceRef.current = 0;
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.analyze() });
      queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
      router.refresh();
      if (d.status === "COMPLETED") {
        toast.success("Analyse terminée");
      } else {
        toast.error("L'analyse a échoué. Relancez pour réessayer.");
      }
    }
  }, [isActive, latest, dealId, queryClient, router]);

  // Filet anti-spinner bloqué : au-delà du timeout, on rend la main à la v2.
  useEffect(() => {
    if (!isActive) return;
    if (activeSinceRef.current === 0) activeSinceRef.current = Date.now();
    const elapsed = Date.now() - activeSinceRef.current;
    const remaining = Math.max(0, ACTIVE_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => {
      setIsActive(false);
      activeSinceRef.current = 0;
      router.refresh();
      toast.info("L'analyse prend plus de temps que prévu. Elle continue en arrière-plan — rechargez pour voir le résultat.");
    }, remaining);
    return () => clearTimeout(timer);
  }, [isActive, router]);

  const handleRelaunch = useCallback(async () => {
    setIsRelaunching(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, type: "full_analysis" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403 || err.upgradeRequired) {
          toast.error(err.error || "Crédits insuffisants pour relancer l'analyse", {
            action: { label: "Acheter des crédits", onClick: () => router.push("/pricing") },
          });
          return;
        }
        if (res.status === 409) {
          // Analyse (ou revue de thèse) déjà en cours pour ce deal : on bascule sur le
          // suivi live — le polling captera la progression et ouvrira le modal de thèse.
          watchedIdRef.current = null;
          activeSinceRef.current = Date.now();
          setIsActive(true);
          queryClient.invalidateQueries({ queryKey: queryKeys.analyses.latest(dealId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.thesis.byDeal(dealId) });
          toast.info(err.error || "Une analyse est déjà en cours pour ce deal.");
          return;
        }
        throw new Error(err.error || "Échec du lancement de l'analyse");
      }

      // Succès (QUEUED / RESERVED / RESUMING) : bascule client immédiate sur le suivi,
      // sans attendre que le worker Inngest crée la ligne RUNNING (évite le trou SSR).
      watchedIdRef.current = null;
      activeSinceRef.current = Date.now();
      setIsActive(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.latest(dealId) });
      toast.success("Analyse relancée — suivez la progression ci-dessous.");
    } catch (error) {
      console.error("[AnalysisV2Live] relaunch error:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la relance de l'analyse");
    } finally {
      setIsRelaunching(false);
    }
  }, [dealId, router, queryClient]);

  const handleThesisDecided = useCallback(
    (decision: "stop" | "continue" | "contest") => {
      setIsThesisModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.thesis.byDeal(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.latest(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      // On reste en suivi : "continue" reprend le Deep Dive, "stop" finalise (thèse-only),
      // "contest" relance une extraction → nouvelle version à revoir. Le polling gère la suite.
      activeSinceRef.current = Date.now();
      setIsActive(true);
      if (decision === "stop") {
        toast.info("Analyse arrêtée. Rapport de thèse disponible.");
      } else if (decision === "continue") {
        toast.success("Analyse reprise.");
      } else {
        toast.info("Rebuttal soumis. Vérification en cours.");
      }
    },
    [dealId, queryClient]
  );

  return (
    <>
      {isActive ? (
        <ActiveAnalysisView dealName={dealName} hideHeader={hideHeader} running={runningAnalysisId ? latest?.data ?? null : null} />
      ) : (
        <AnalysisV2PageShell
          dealName={dealName}
          vm={vm}
          hideHeader={hideHeader}
          dealId={dealId}
          onRelaunch={handleRelaunch}
          isRelaunching={isRelaunching}
        />
      )}
      {thesis && isThesisModalOpen ? (
        <ThesisReviewModal
          open={isThesisModalOpen}
          dealId={dealId}
          reformulated={thesis.reformulated}
          verdict={thesis.verdict}
          confidence={thesis.confidence}
          alertsCount={thesis.alerts?.length ?? 0}
          onDecided={(decision) => handleThesisDecided(decision)}
        />
      ) : null}
    </>
  );
}
