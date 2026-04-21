"use client";

/**
 * ThesisReviewModal — modal non-dismissible, apparait apres Tier 0.5 (thesis-extractor)
 * pour demander au BA sa decision : Stop / Continuer / Contester.
 *
 * Pattern non-dismissible identique a cgu-consent-modal.tsx :
 *  - showCloseButton={false}
 *  - onOpenChange={() => {}} (no-op)
 *  - onPointerDownOutside, onEscapeKeyDown, onInteractOutside: preventDefault
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Pause, Play, MessageSquareWarning } from "lucide-react";
import { RECOMMENDATION_CONFIG } from "@/lib/ui-configs";

interface ThesisReviewModalProps {
  open: boolean;
  dealId: string;
  reformulated: string;
  verdict: string;
  confidence: number;
  alertsCount: number;
  onDecided: (decision: "stop" | "continue" | "contest", result: unknown) => void;
}

type DecisionMode = "menu" | "contest" | "submitting";

export function isRetryableRebuttalResponse(
  status: number,
  payload: unknown
): payload is { error?: string; retryable: true; refundedCredits?: number } {
  return (
    status === 503 &&
    !!payload &&
    typeof payload === "object" &&
    "retryable" in payload &&
    (payload as { retryable?: unknown }).retryable === true
  );
}

export function ThesisReviewModal(props: ThesisReviewModalProps) {
  const [mode, setMode] = useState<DecisionMode>("menu");
  const [rebuttalText, setRebuttalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);

  const verdictCfg = RECOMMENDATION_CONFIG[props.verdict] ?? RECOMMENDATION_CONFIG.contrasted;
  const isFragile = props.verdict === "alert_dominant" || props.verdict === "vigilance" || props.verdict === "contrasted";

  async function submitDecision(decision: "stop" | "continue" | "contest") {
    setError(null);
    setIsRetryable(false);
    setMode("submitting");
    try {
      const payload: Record<string, unknown> = { decision };
      if (decision === "contest") payload.rebuttalText = rebuttalText;

      if (decision === "contest") {
        // Call rebuttal endpoint (which also marks decision)
        const response = await fetch(`/api/deals/${props.dealId}/thesis/rebuttal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rebuttalText }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({} as Record<string, unknown>));
          if (isRetryableRebuttalResponse(response.status, err)) {
            setError(
              err.error ??
              "Juge temporairement indisponible. Votre crédit a été remboursé."
            );
            setIsRetryable(true);
            setMode("contest");
            return;
          }
          throw new Error((err as { error?: string }).error ?? "Impossible de soumettre le rebuttal");
        }
        const data = await response.json();
        props.onDecided("contest", data);
      } else {
        const response = await fetch(`/api/deals/${props.dealId}/thesis/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error ?? "Impossible d'enregistrer la décision");
        }
        const data = await response.json();
        props.onDecided(decision, data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setIsRetryable(false);
      setMode(decision === "contest" ? "contest" : "menu");
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={() => { /* noop : non-dismissible */ }}>
      <DialogContent
        className="max-w-xl"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Décision requise sur la thèse
          </DialogTitle>
          <DialogDescription>
            L&apos;AI a extrait et testé la thèse de cette société contre 3 frameworks. Vous devez décider comment poursuivre l&apos;analyse avant que Tier 1/2/3 soient rendus visibles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <Badge className={`${verdictCfg.color} font-semibold`} variant="outline">
                {verdictCfg.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Confiance {props.confidence}/100 · {props.alertsCount} alerte{props.alertsCount > 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-sm text-slate-900">{props.reformulated}</p>
          </div>

          {mode === "menu" && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => submitDecision("stop")}
                disabled={mode === "menu" ? false : true}
              >
                <Pause className="h-4 w-4 mr-2" />
                Arrêter l&apos;analyse ici — rapport thèse-only, remboursement partiel (3 cr)
              </Button>
              <Button
                variant={isFragile ? "outline" : "default"}
                className="w-full justify-start"
                onClick={() => submitDecision("continue")}
              >
                <Play className="h-4 w-4 mr-2" />
                Continuer Deep Dive{isFragile ? " (avec alerte thèse fragile)" : ""}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMode("contest")}
              >
                <MessageSquareWarning className="h-4 w-4 mr-2" />
                Contester la reformulation (1 cr)
              </Button>
            </div>
          )}

          {mode === "contest" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Votre rebuttal écrit</label>
              <Textarea
                value={rebuttalText}
                onChange={(e) => setRebuttalText(e.target.value)}
                placeholder="Exemple : L'AI a mal compris le moat — la société possède un brevet X mentionné en page 14, pas un effet réseau. (Minimum 20 caractères.)"
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {rebuttalText.length}/4000 caractères. Soyez précis et factuel.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode("menu");
                    setIsRetryable(false);
                    setError(null);
                  }}
                >
                  Retour
                </Button>
                <Button
                  onClick={() => {
                    setIsRetryable(false);
                    setError(null);
                    void submitDecision("contest");
                  }}
                  disabled={rebuttalText.trim().length < 20}
                >
                  {isRetryable ? "Réessayer (crédit déjà remboursé)" : "Soumettre rebuttal (1 cr)"}
                </Button>
              </div>
              {error && (
                <p className={`text-sm font-medium ${isRetryable ? "text-orange-600" : "text-red-600"}`}>
                  {error}
                  {isRetryable && (
                    <span className="block text-xs mt-1 text-slate-600">
                      Votre crédit a été remboursé. Vous pouvez réessayer immédiatement.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {mode === "submitting" && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Traitement en cours...
            </div>
          )}

          {error && mode !== "contest" && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>

        <DialogFooter className="text-xs text-muted-foreground">
          Cette décision est enregistrée. Sans action sous 24h, l&apos;analyse expire et les crédits sont remboursés intégralement.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
