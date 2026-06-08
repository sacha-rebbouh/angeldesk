"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/**
 * AnalysisRunningOverlay — masque pendant qu'une analyse tourne.
 *
 * SCOPE (volontaire) : couvre le CONTENU (deal + onglets + chat) mais PAS le menu latéral
 * (`md:left-64` = largeur de la sidebar). L'analyse tourne en arrière-plan (Inngest + email
 * à la complétion) → l'utilisateur reste LIBRE de naviguer via le menu (autres deals, autres
 * analyses, en lancer une autre). Pas de verrou de scroll, pas de blocage de navigation.
 *
 * AFFICHAGE IMMÉDIAT : le worker ne crée la ligne `RUNNING` qu'après ~90 s (dispatch + start).
 * Pour éviter ce trou, le bouton de lancement pose un signal `analysisLaunchedAt` (cache RQ) ;
 * l'overlay s'affiche pendant une fenêtre de grâce (`LAUNCH_GRACE_MS`) qui couvre le démarrage,
 * puis prend le relais sur le statut serveur (PENDING/RUNNING) — sans flicker.
 */

type LatestAnalysisMeta = {
  id: string;
  status: string;
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
  const withinGrace = launchedAt > 0 && Date.now() - launchedAt < LAUNCH_GRACE_MS;

  const { data } = useQuery({
    queryKey: queryKeys.analyses.latest(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/analyses`);
      if (!res.ok) throw new Error("Failed to fetch analysis status");
      return (await res.json()) as { data: LatestAnalysisMeta | null };
    },
    // Poll tant qu'une analyse est active (PENDING/RUNNING) OU pendant la fenêtre de grâce
    // post-lancement (capte la transition vers RUNNING) ; s'arrête au terminal hors grâce.
    refetchInterval: (query) => {
      const s = query.state.data?.data?.status;
      const la = (queryClient.getQueryData<number>(queryKeys.analyses.launchedAt(dealId)) ?? 0) as number;
      const grace = la > 0 && Date.now() - la < LAUNCH_GRACE_MS;
      return s === "RUNNING" || s === "PENDING" || grace ? 2500 : false;
    },
    refetchOnWindowFocus: true,
  });

  const meta = data?.data ?? null;
  const status = meta?.status ?? null;
  // Affiche si : analyse active (PENDING/RUNNING) ; OU fenêtre de grâce post-lancement (le worker
  // n'a pas encore posé RUNNING) ; OU le SSR a vu RUNNING au chargement avant le 1er fetch.
  const running =
    status === "RUNNING" ||
    status === "PENDING" ||
    withinGrace ||
    (status === null && initialActive);

  // beforeunload informatif léger : prévient seulement la FERMETURE d'onglet accidentelle (la
  // navigation in-app via le menu ne le déclenche pas). L'analyse continue de toute façon.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  if (!running) return null;

  const total = meta?.totalAgents ?? 0;
  const done = meta?.completedAgents ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  // Anneau de progression SVG (déterminé si on a des étapes, sinon spinner indéterminé).
  const RADIUS = 30;
  const CIRC = 2 * Math.PI * RADIUS;
  const determinate = total > 0;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Analyse en cours"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm md:left-64"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-8 text-center shadow-2xl">
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
      </div>
    </div>
  );
}
