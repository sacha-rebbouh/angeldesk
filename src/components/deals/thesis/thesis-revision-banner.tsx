"use client";

/**
 * ThesisRevisionBanner — banner affiche en tete de page deal quand une nouvelle
 * version de these est disponible suite a re-extraction auto (nouveau doc upload).
 *
 * Compare la version latest avec la version precedente et affiche un diff :
 *  - Verdict (si change)
 *  - Confiance (delta)
 *  - Reformulation (diff texte)
 *  - Load-bearing assumptions (ajoutees/supprimees/modifiees)
 *
 * Actions : "Voir les details" (ouvre dialog avec diff complet) + "Fermer" (dismiss).
 */

import { useState } from "react";
import { AlertCircle, ArrowRight, X, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RECOMMENDATION_CONFIG, THESIS_VERDICT_CONFIG } from "@/lib/ui-configs";
import { cn } from "@/lib/utils";

interface ThesisVersion {
  id: string;
  version: number;
  verdict: string;
  confidence: number;
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  loadBearing: Array<{
    id: string;
    statement: string;
    status: "verified" | "declared" | "projected" | "speculative";
    impact: string;
    validationPath: string;
  }>;
  createdAt: string;
}

interface ThesisRevisionBannerProps {
  previous: ThesisVersion;
  latest: ThesisVersion;
  triggerDocumentName?: string;
  onDismiss?: () => void;
}

function getVerdictConfig(verdict: string) {
  return THESIS_VERDICT_CONFIG[verdict] ?? {
    label: RECOMMENDATION_CONFIG[verdict]?.label ?? verdict,
    shortLabel: RECOMMENDATION_CONFIG[verdict]?.label ?? verdict,
    color: RECOMMENDATION_CONFIG[verdict]?.color ?? "text-slate-800",
    bg: RECOMMENDATION_CONFIG[verdict]?.bg ?? "bg-slate-50 border-slate-300",
    description: "",
  };
}

export function ThesisRevisionBanner({ previous, latest, triggerDocumentName, onDismiss }: ThesisRevisionBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const verdictChanged = previous.verdict !== latest.verdict;
  const confidenceDelta = latest.confidence - previous.confidence;
  const reformulationChanged = previous.reformulated !== latest.reformulated;
  const loadBearingChanged = JSON.stringify(previous.loadBearing) !== JSON.stringify(latest.loadBearing);

  const prevCfg = getVerdictConfig(previous.verdict);
  const latestCfg = getVerdictConfig(latest.verdict);

  return (
    <>
      <div
        className="rounded-md border border-blue-300 bg-blue-50 p-4 mb-4 relative"
        role="status"
        aria-live="polite"
      >
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-2 right-2 rounded-full p-1 hover:bg-blue-100"
            aria-label="Fermer la notification"
          >
            <X className="h-4 w-4 text-blue-700" />
          </button>
        )}

        <div className="flex items-start gap-3">
          <div className="rounded-full bg-blue-100 p-2">
            <AlertCircle className="h-4 w-4 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-blue-900">
              La these a evolue — version {latest.version}
            </h3>
            <p className="text-xs text-blue-800 mt-1">
              {triggerDocumentName
                ? `Suite a l'upload de "${triggerDocumentName}", la these a ete re-extraite automatiquement.`
                : "Suite a un nouveau document ajoute, la these a ete re-extraite automatiquement."}
              {" "}1 credit facture (THESIS_REEXTRACT).
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {verdictChanged && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-700">Verdict :</span>
                  <Badge variant="outline" className={cn("text-[10px]", prevCfg.color)}>
                    {prevCfg.shortLabel}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-blue-700" />
                  <Badge variant="outline" className={cn("text-[10px]", latestCfg.color)}>
                    {latestCfg.shortLabel}
                  </Badge>
                </div>
              )}
              {confidenceDelta !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-blue-700">Confiance :</span>
                  <span className="font-medium text-blue-900">
                    {previous.confidence} → {latest.confidence}
                  </span>
                  {confidenceDelta > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : confidenceDelta < 0 ? (
                    <TrendingDown className="h-3 w-3 text-red-600" />
                  ) : (
                    <Minus className="h-3 w-3 text-slate-500" />
                  )}
                  <span className={cn(
                    "text-[10px] font-semibold",
                    confidenceDelta > 0 ? "text-green-700" : confidenceDelta < 0 ? "text-red-700" : "text-slate-600"
                  )}>
                    {confidenceDelta > 0 ? `+${confidenceDelta}` : confidenceDelta}
                  </span>
                </div>
              )}
              {reformulationChanged && !verdictChanged && confidenceDelta === 0 && (
                <span className="text-blue-700 italic">Reformulation modifiee.</span>
              )}
              {loadBearingChanged && (
                <span className="text-blue-700 italic">
                  Hypotheses porteuses modifiees.
                </span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
                className="h-7 text-xs border-blue-400 text-blue-800 hover:bg-blue-100"
              >
                <FileText className="h-3 w-3 mr-1" />
                Voir le diff complet
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Diff thèse — v{previous.version} → v{latest.version}
            </DialogTitle>
            <DialogDescription>
              Comparaison detaillee entre les deux versions de la these.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <DiffSection label="Verdict" before={prevCfg.label} after={latestCfg.label} />
            <DiffSection label="Confiance" before={`${previous.confidence}/100`} after={`${latest.confidence}/100`} />
            <DiffSection label="Reformulation" before={previous.reformulated} after={latest.reformulated} multiline />
            <DiffSection label="Probleme" before={previous.problem} after={latest.problem} multiline />
            <DiffSection label="Solution" before={previous.solution} after={latest.solution} multiline />
            <DiffSection label="Why-now" before={previous.whyNow} after={latest.whyNow} multiline />
            <DiffSection
              label="Moat"
              before={previous.moat ?? "(non declare)"}
              after={latest.moat ?? "(non declare)"}
              multiline
            />
            <DiffSection
              label="Path to exit"
              before={previous.pathToExit ?? "(non declare)"}
              after={latest.pathToExit ?? "(non declare)"}
              multiline
            />

            <div>
              <h4 className="text-sm font-semibold mb-2">Hypotheses porteuses</h4>
              <LoadBearingDiff previous={previous.loadBearing} latest={latest.loadBearing} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DiffSection({ label, before, after, multiline = false }: { label: string; before: string; after: string; multiline?: boolean }) {
  const changed = before !== after;
  if (!changed && !multiline) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{label}</h4>
        <p className="text-sm text-slate-900">{after} <span className="text-xs text-muted-foreground italic">(inchange)</span></p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 flex items-center gap-2">
        {label}
        {changed && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-300">Modifie</Badge>}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div className={cn("text-xs p-2 rounded border", changed ? "bg-red-50 border-red-200 text-red-900" : "bg-slate-50 border-slate-200 text-slate-700")}>
          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Avant</div>
          <div className={multiline ? "whitespace-pre-wrap" : ""}>{before}</div>
        </div>
        <div className={cn("text-xs p-2 rounded border", changed ? "bg-green-50 border-green-200 text-green-900" : "bg-slate-50 border-slate-200 text-slate-700")}>
          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Apres</div>
          <div className={multiline ? "whitespace-pre-wrap" : ""}>{after}</div>
        </div>
      </div>
    </div>
  );
}

function LoadBearingDiff({
  previous,
  latest,
}: {
  previous: ThesisVersion["loadBearing"];
  latest: ThesisVersion["loadBearing"];
}) {
  const prevIds = new Set(previous.map((lb) => lb.id));
  const latestIds = new Set(latest.map((lb) => lb.id));

  const added = latest.filter((lb) => !prevIds.has(lb.id));
  const removed = previous.filter((lb) => !latestIds.has(lb.id));
  const kept = latest.filter((lb) => prevIds.has(lb.id));

  const changed = kept.filter((lbLatest) => {
    const lbPrev = previous.find((p) => p.id === lbLatest.id);
    if (!lbPrev) return false;
    return lbPrev.statement !== lbLatest.statement || lbPrev.status !== lbLatest.status;
  });

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Aucune modification des hypotheses porteuses.</p>;
  }

  return (
    <div className="space-y-2">
      {added.map((lb) => (
        <div key={`add-${lb.id}`} className="rounded border border-green-200 bg-green-50 p-2 text-xs">
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-[9px] mr-2">Ajoutee</Badge>
          <span className="text-slate-900">{lb.statement}</span>
          <p className="mt-1 text-[10px] text-slate-600">Statut : {lb.status}</p>
        </div>
      ))}
      {removed.map((lb) => (
        <div key={`rem-${lb.id}`} className="rounded border border-red-200 bg-red-50 p-2 text-xs">
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-[9px] mr-2">Supprimee</Badge>
          <span className="text-slate-700 line-through">{lb.statement}</span>
        </div>
      ))}
      {changed.map((lb) => {
        const prev = previous.find((p) => p.id === lb.id)!;
        return (
          <div key={`chg-${lb.id}`} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[9px] mr-2">Modifiee</Badge>
            <div className="mt-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Avant : </span>
              <span className="text-slate-700">{prev.statement} ({prev.status})</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Apres : </span>
              <span className="text-slate-900">{lb.statement} ({lb.status})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
