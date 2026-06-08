import type { AnalysisStatus } from "@prisma/client";

/**
 * Politique commerciale post-analyse — gatée sur le STATUT TERMINAL PERSISTÉ (source de
 * vérité produit), JAMAIS sur `allSuccess` (= tous les agents `success:true`, perfection
 * d'exécution multi-agents).
 *
 * Doctrine : Angel Desk est « un environnement analytique fiable autour d'IA imparfaites ».
 * Une analyse `COMPLETED` — même avec des agents en échec — est une analyse LIVRÉE (mémo +
 * signaux + sources) → on notifie ET on facture. Seule une `FAILED` (non livrée) est
 * remboursée. Tout autre statut (non terminal) → rien (ne JAMAIS rembourser à l'aveugle).
 *
 * Bug corrigé (2026-06) : le gate de `inngest.ts` se basait sur `analysisResult.success`
 * (= allSuccess) → un Deep Dive COMPLETED avec ≥1 agent `success:false` était remboursé à
 * tort (fuite de revenu) ET ne déclenchait pas l'email « analyse prête ».
 */
export type CompletionAction = "notify" | "refund" | "none";

export function completionActionForStatus(
  status: AnalysisStatus | string | null | undefined,
): CompletionAction {
  if (status === "COMPLETED") return "notify";
  if (status === "FAILED") return "refund";
  return "none";
}
