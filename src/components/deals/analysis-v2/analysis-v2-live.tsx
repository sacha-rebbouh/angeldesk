"use client";

import "./tokens.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/query-keys";
import { fetchLatestAnalysis } from "@/lib/fetch-latest-analysis";
import { AuthExpiredError } from "@/lib/auth-expired-error";
import { AnalysisProgress } from "../analysis-progress";
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
  authExpired,
}: {
  dealName: string;
  hideHeader?: boolean;
  running: LatestAnalysis | null;
  /** Session Clerk expirée : le suivi live est coupé, mais l'analyse continue côté serveur. */
  authExpired: boolean;
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
          {authExpired ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  Session expirée
                </CardTitle>
                <CardDescription>
                  L&apos;analyse continue en arrière-plan — vous recevrez un email dès qu&apos;elle est
                  prête. Reconnectez-vous pour suivre la progression en direct.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                >
                  Se reconnecter
                </button>
                {running ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Dernière progression connue : {running.completedAgents}/{running.totalAgents} étapes
                  </p>
                ) : null}
              </CardContent>
            </>
          ) : (
            <>
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
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * AnalysisV2Live — couche opérationnelle de la vue v2.
 *
 * Rend la v2 autosuffisante sur le cycle de vie (relance → progression → résultat),
 * pour supprimer la bascule v2 ↔ ancien panel qui créait le trou de timing
 * (SSR vs Inngest async). Le gate thèse ayant été retiré, l'analyse déroule d'une
 * traite sans pause ni décision.
 *
 * - Polling du statut de la dernière analyse.
 * - Relance : POST /api/analyze, puis bascule immédiate (client) sur le suivi live —
 *   pas de `router.refresh()` qui courait après le worker Inngest. Sur 409 (analyse
 *   déjà en cours), on bascule aussi sur le suivi pour capter la progression.
 * - Au COMPLETED/FAILED de l'analyse suivie, `router.refresh()` reconstruit la vue v2.
 */
export function AnalysisV2Live({ dealName, vm, dealId, hideHeader, initialActive }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isActive, setIsActive] = useState(initialActive);
  const [isRelaunching, setIsRelaunching] = useState(false);

  // Id de l'analyse RUNNING qu'on suit. Tant qu'il est null après une relance, un
  // statut COMPLETED correspond encore à l'ANCIENNE analyse → on l'ignore (le worker
  // Inngest n'a pas encore créé la nouvelle). Une fois la nouvelle RUNNING captée, son
  // passage en terminal nous fait rendre la vue v2.
  const watchedIdRef = useRef<string | null>(null);
  const activeSinceRef = useRef<number>(initialActive ? Date.now() : 0);

  const { data: latest, error: latestError } = useQuery({
    queryKey: queryKeys.analyses.latest(dealId),
    queryFn: () => fetchLatestAnalysis<{ data: LatestAnalysis | null }>(dealId),
    // Pas de retry sur session expirée → on bascule tout de suite sur la reconnexion.
    retry: (failureCount, err) => !(err instanceof AuthExpiredError) && failureCount < 3,
    // Stop le poll sur session expirée (piloté par l'ERREUR de query, partagée par tous les
    // observers de la clé) ; sinon poll 3s tant que le suivi est actif.
    refetchInterval: (query) => {
      if (query.state.error instanceof AuthExpiredError) return false;
      return isActive ? 3000 : false;
    },
    refetchOnWindowFocus: true,
    staleTime: isActive ? 0 : 30_000,
  });

  const authExpired = latestError instanceof AuthExpiredError;
  const status = latest?.data?.status ?? null;
  const runningAnalysisId = status === "RUNNING" ? latest?.data?.id ?? null : null;

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
    // OPTIMISTE : poser le signal de lancement AVANT le POST → le masque (overlay)
    // s'affiche immédiatement au clic, sans subir la latence de /api/analyze (auth +
    // checks DB séquentiels + dispatch Inngest, ~30 s à froid). La fenêtre de grâce
    // couvre le démarrage worker ; on RETIRE le signal seulement si le lancement
    // échoue réellement (crédits insuffisants / erreur).
    queryClient.setQueryData(queryKeys.analyses.launchedAt(dealId), Date.now());
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, type: "full_analysis" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403 || err.upgradeRequired) {
          // Lancement refusé (crédits) → rollback du masque optimiste.
          queryClient.setQueryData(queryKeys.analyses.launchedAt(dealId), 0);
          toast.error(err.error || "Crédits insuffisants pour relancer l'analyse", {
            action: { label: "Acheter des crédits", onClick: () => router.push("/pricing") },
          });
          return;
        }
        if (res.status === 409) {
          // Analyse déjà en cours pour ce deal : on garde le masque + bascule sur le
          // suivi live — le polling captera la progression jusqu'au résultat.
          watchedIdRef.current = null;
          activeSinceRef.current = Date.now();
          setIsActive(true);
          queryClient.invalidateQueries({ queryKey: queryKeys.analyses.latest(dealId) });
          toast.info(err.error || "Une analyse est déjà en cours pour ce deal.");
          return;
        }
        throw new Error(err.error || "Échec du lancement de l'analyse");
      }

      // Succès (QUEUED / RESERVED / RESUMING) : le masque est déjà affiché. Bascule
      // client immédiate sur le suivi, sans attendre que le worker Inngest crée la
      // ligne RUNNING (évite le trou SSR).
      watchedIdRef.current = null;
      activeSinceRef.current = Date.now();
      setIsActive(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.analyses.latest(dealId) });
      toast.success("Analyse relancée — suivez la progression ci-dessous.");
    } catch (error) {
      // Échec réel du lancement → rollback du masque optimiste.
      queryClient.setQueryData(queryKeys.analyses.launchedAt(dealId), 0);
      console.error("[AnalysisV2Live] relaunch error:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de la relance de l'analyse");
    } finally {
      setIsRelaunching(false);
    }
  }, [dealId, router, queryClient]);

  return (
    <>
      {isActive ? (
        <ActiveAnalysisView dealName={dealName} hideHeader={hideHeader} running={runningAnalysisId ? latest?.data ?? null : null} authExpired={authExpired} />
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
    </>
  );
}
