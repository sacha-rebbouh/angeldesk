"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { queryKeys } from "@/lib/query-keys";

/**
 * AnalysisRunningOverlay — masque plein écran au niveau page/onglets pendant qu'une analyse
 * tourne. Monté une fois sur la page deal (pas dans l'onglet « Analyse IA »), il recouvre
 * l'intégralité de la vue (onglets, chat, header) et capture les interactions tant que le
 * statut SERVEUR de la dernière analyse est RUNNING. Dérivé de la vérité serveur (poll de /api/deals/[id]/analyses, même
 * queryKey que AnalysisV2Live → pas de double requête), il s'efface au terminal.
 *
 * UX : « restez ici, ou fermez l'onglet et revenez — vous recevrez un email à la fin »
 * (l'email est envoyé côté Inngest à la complétion). `beforeunload` informatif : le texte
 * custom n'est plus honoré par les navigateurs modernes, seule la confirmation native l'est.
 */

type LatestAnalysisMeta = {
  id: string;
  status: string;
  completedAgents: number;
  totalAgents: number;
  mode: string | null;
};

export function AnalysisRunningOverlay({
  dealId,
  initialActive,
}: {
  dealId: string;
  /** true si le SSR a détecté une analyse RUNNING au chargement (évite un flash sans masque). */
  initialActive: boolean;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.analyses.latest(dealId),
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/analyses`);
      if (!res.ok) throw new Error("Failed to fetch analysis status");
      return (await res.json()) as { data: LatestAnalysisMeta | null };
    },
    // Poll uniquement tant qu'une analyse tourne ; s'arrête au terminal.
    refetchInterval: (query) =>
      query.state.data?.data?.status === "RUNNING" ? 3000 : false,
    refetchOnWindowFocus: true,
  });

  const meta = data?.data ?? null;
  const status = meta?.status ?? null;
  // Avant le 1er fetch (status inconnu), si le SSR a vu RUNNING on masque déjà.
  const running = status === "RUNNING" || (status === null && initialActive);

  // beforeunload informatif + verrou de scroll tant qu'une analyse tourne.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.body.style.overflow = prevOverflow;
    };
  }, [running]);

  if (!running) return null;

  const showProgress = !!meta && meta.status === "RUNNING" && meta.totalAgents > 0;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Analyse en cours"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight">Analyse en cours</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Restez sur cette page, ou fermez l&apos;onglet et revenez quand vous voulez — vous
          recevrez un email dès que l&apos;analyse sera prête.
        </p>
        {showProgress ? (
          <p className="mt-4 text-xs font-medium tabular-nums text-muted-foreground/80">
            {meta!.completedAgents}/{meta!.totalAgents} étapes terminées
          </p>
        ) : null}
      </div>
    </div>
  );
}
