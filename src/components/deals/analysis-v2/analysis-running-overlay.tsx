"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { fetchLatestAnalysis } from "@/lib/fetch-latest-analysis";
import { AuthExpiredError } from "@/lib/auth-expired-error";
import { getCurrentStepLabel, type AnalysisProgressType } from "@/lib/analysis-progress-model";

/**
 * AnalysisRunningOverlay — masque pendant qu'une analyse tourne.
 *
 * SCOPE (volontaire) : couvre le CONTENU (deal + onglets + chat) mais PAS le menu latéral
 * (`md:left-64` = largeur de la sidebar). L'analyse tourne en arrière-plan (Inngest + email
 * à la complétion) → l'utilisateur reste LIBRE de naviguer via le menu. Pas de verrou de scroll,
 * pas de blocage de navigation, pas de `beforeunload` (on invite explicitement à fermer l'onglet).
 *
 * AFFICHAGE IMMÉDIAT : le worker ne crée la ligne `RUNNING` qu'après ~90 s. Le bouton de lancement
 * pose un signal `analysisLaunchedAt` (cache RQ) ; l'overlay s'affiche pendant une fenêtre de grâce
 * (`LAUNCH_GRACE_MS`) qui couvre le démarrage, puis prend le relais sur le statut serveur.
 *
 * SESSION EXPIRÉE : les polls passent par `fetchLatestAnalysis` (auth-required). Si la session Clerk
 * expire (JWT 60 s + refresh échoué → middleware réécrit en 404 signed-out), le fetcher lève
 * `AuthExpiredError` → on ARRÊTE le poll et on affiche un état « Session expirée + reconnexion » au
 * lieu de figer une fausse progression 0 %.
 */

type LatestAnalysisMeta = {
  id: string;
  status: string;
  type: string;
  completedAgents: number;
  totalAgents: number;
  mode: string | null;
};

/** Couvre le démarrage worker (création de la ligne RUNNING) sans laisser de trou ni flicker. */
const LAUNCH_GRACE_MS = 150_000;

export function AnalysisRunningOverlay({
  dealId,
  initialActive,
}: {
  dealId: string;
  /** true si le SSR a détecté une analyse RUNNING au chargement (évite un flash sans masque). */
  initialActive: boolean;
}) {
  const queryClient = useQueryClient();
  const launchedAt = (queryClient.getQueryData<number>(queryKeys.analyses.launchedAt(dealId)) ?? 0) as number;
  // Fenêtre de grâce time-dependent : useSyncExternalStore (l'horloge = source externe) au lieu
  // de Date.now() au render (react-hooks/purity). Un timer programme le re-render à l'expiration.
  const withinGrace = useSyncExternalStore(
    useCallback(
      (onExpire: () => void) => {
        if (launchedAt <= 0) return () => {};
        const remainingMs = launchedAt + LAUNCH_GRACE_MS - Date.now();
        if (remainingMs <= 0) return () => {};
        const timer = setTimeout(onExpire, remainingMs);
        return () => clearTimeout(timer);
      },
      [launchedAt]
    ),
    () => launchedAt > 0 && Date.now() - launchedAt < LAUNCH_GRACE_MS,
    () => false
  );

  const { data, error } = useQuery({
    queryKey: queryKeys.analyses.latest(dealId),
    queryFn: () => fetchLatestAnalysis<{ data: LatestAnalysisMeta | null }>(dealId),
    // Ne PAS retry une session expirée (inutile, le fetcher a déjà tenté un token frais) → on
    // bascule tout de suite sur l'UI de reconnexion. Les autres erreurs gardent un retry borné.
    retry: (failureCount, err) => !(err instanceof AuthExpiredError) && failureCount < 3,
    // Poll tant qu'une analyse est active (PENDING/RUNNING) OU pendant la fenêtre de grâce ; STOP
    // sur session expirée (piloté par l'ERREUR de query, partagée par tous les observers de la clé).
    refetchInterval: (query) => {
      if (query.state.error instanceof AuthExpiredError) return false;
      const s = query.state.data?.data?.status;
      const la = (queryClient.getQueryData<number>(queryKeys.analyses.launchedAt(dealId)) ?? 0) as number;
      const grace = la > 0 && Date.now() - la < LAUNCH_GRACE_MS;
      return s === "RUNNING" || s === "PENDING" || grace ? 2500 : false;
    },
    refetchOnWindowFocus: true,
  });

  const authExpired = error instanceof AuthExpiredError;
  const meta = data?.data ?? null;
  const status = meta?.status ?? null;
  // Une analyse est (ou était au dernier poll réussi) active → on affiche l'overlay.
  const running =
    status === "RUNNING" ||
    status === "PENDING" ||
    withinGrace ||
    (status === null && initialActive);

  // Toast unique à l'expiration de session — `id` fixe : sonner déduplique overlay + tracker.
  useEffect(() => {
    if (authExpired && running) {
      toast.error("Session expirée — l'analyse continue en arrière-plan. Reconnectez-vous pour suivre.", {
        id: "analysis-session-expired",
      });
    }
  }, [authExpired, running]);

  if (!running) return null;

  const total = meta?.totalAgents ?? 0;
  const done = meta?.completedAgents ?? 0;
  const determinate = total > 0;
  // Plancher à ≥1 % dès qu'on a des étapes : un 0 % collé pendant le Tier0 (corpus + thèse =
  // 3 agents sur 22, ~5-7 min) donne l'impression d'un blocage alors que ça progresse.
  const pct = determinate ? Math.min(100, Math.max(1, Math.round((done / total) * 100))) : 0;

  const analysisType: AnalysisProgressType =
    meta?.type === "tier1_complete" ? "tier1_complete" : "full_analysis";
  const stepLabel = determinate ? getCurrentStepLabel(done, analysisType) : null;

  const RADIUS = 30;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={authExpired ? "Session expirée" : "Analyse en cours"}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm md:left-64"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-8 text-center shadow-2xl">
        {authExpired ? (
          <>
            <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
              <ShieldAlert className="h-9 w-9 text-amber-500" />
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">Session expirée</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Votre session a expiré, mais <span className="font-medium text-foreground">l&apos;analyse
              continue en arrière-plan</span> et vous recevrez un email dès qu&apos;elle est prête.
              Reconnectez-vous pour suivre la progression en direct.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Se reconnecter
            </button>
            {determinate ? (
              <p className="mt-4 text-xs font-medium tabular-nums text-muted-foreground/70">
                Dernière progression connue : {done}/{total} étapes
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="relative mx-auto h-[76px] w-[76px]">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 76 76" aria-hidden="true">
                <circle cx="38" cy="38" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
                <circle
                  cx="38"
                  cy="38"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className={determinate ? "stroke-primary" : "stroke-primary animate-spin origin-center"}
                  strokeDasharray={CIRC}
                  strokeDashoffset={determinate ? CIRC * (1 - pct / 100) : CIRC * 0.75}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="av-tabular text-lg font-semibold text-foreground">
                  {determinate ? `${pct}%` : ""}
                </span>
              </div>
            </div>

            <h2 className="mt-5 text-lg font-semibold tracking-tight">Analyse en cours</h2>
            {stepLabel ? <p className="mt-1.5 text-sm font-medium text-primary">{stepLabel}</p> : null}
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous pouvez rester ici, naviguer ailleurs via le menu, ou fermer l&apos;onglet — l&apos;analyse
              continue et vous recevrez un email dès qu&apos;elle est prête.
            </p>
            {determinate ? (
              <p className="mt-4 text-xs font-medium tabular-nums text-muted-foreground/80">
                {done}/{total} étapes terminées
              </p>
            ) : (
              <p className="mt-4 text-xs font-medium text-muted-foreground/80">Initialisation…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
