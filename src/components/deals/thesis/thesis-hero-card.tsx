"use client";

/**
 * ThesisHeroCard — card principale de la these d'investissement (thesis-first).
 *
 * Affichee en HAUT de la page d'analyse du deal, avant VerdictPanel. Contient:
 *  - Reformulation de la these (3-5 phrases, longue) produite par thesis-extractor
 *  - Verdict + confidence (badge RECOMMENDATION_CONFIG)
 *  - Alertes (pas limitees a 3 — user a explicitement demande "plus que 3")
 *  - Load-bearing assumptions (hypotheses porteuses + status)
 *  - Toggle "Voir par framework" pour ThesisFrameworksExpand
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, AlertTriangle, ShieldAlert, Target } from "lucide-react";
import { RECOMMENDATION_CONFIG } from "@/lib/ui-configs";
import type { NormalizedThesisEvaluation } from "@/agents/thesis/types";

interface LoadBearing {
  id: string;
  statement: string;
  status: "verified" | "declared" | "projected" | "speculative";
  impact: string;
  validationPath: string;
}

interface AlertItem {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
}

interface ThesisHeroCardProps {
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  verdict: string;
  confidence: number;
  loadBearing: LoadBearing[];
  alerts: AlertItem[];
  evaluationAxes: NormalizedThesisEvaluation;
  hasPendingDecision: boolean;
  decision: string | null;
  onReviewDecisionClick?: () => void;
  onShowFrameworksClick?: () => void;
}

const STATUS_BADGE: Record<LoadBearing["status"], { label: string; className: string }> = {
  verified: { label: "Vérifiée", className: "bg-green-100 text-green-800 border-green-300" },
  declared: { label: "Déclarée", className: "bg-blue-100 text-blue-800 border-blue-300" },
  projected: { label: "Projection", className: "bg-amber-100 text-amber-800 border-amber-300" },
  speculative: { label: "Spéculative", className: "bg-red-100 text-red-800 border-red-300" },
};

const SEVERITY_BADGE: Record<AlertItem["severity"], { label: string; className: string }> = {
  critical: { label: "Critique", className: "bg-red-600 text-white" },
  high: { label: "Élevée", className: "bg-orange-500 text-white" },
  medium: { label: "Moyenne", className: "bg-yellow-500 text-white" },
  low: { label: "Faible", className: "bg-slate-400 text-white" },
};

export function ThesisHeroCard(props: ThesisHeroCardProps) {
  const [expandedAlerts, setExpandedAlerts] = useState(false);
  const [expandedLoadBearing, setExpandedLoadBearing] = useState(true);

  const verdictCfg = RECOMMENDATION_CONFIG[props.verdict] ?? RECOMMENDATION_CONFIG.contrasted;

  const alertsToShow = expandedAlerts ? props.alerts : props.alerts.slice(0, 5);

  return (
    <Card className={`border-2 ${verdictCfg.bg}`} role="region" aria-label="Thèse d'investissement">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-slate-600" />
              Thèse d&apos;investissement
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Ce que la société promet — analysée par AI contre 3 frameworks (YC, Thiel, Angel Desk).
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={`${verdictCfg.color} font-semibold`} variant="outline">
              {verdictCfg.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Confiance {props.confidence}/100
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Reformulation longue */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Reformulation</h3>
          <p className="text-base leading-relaxed text-slate-900">
            {props.reformulated}
          </p>
        </div>

        {/* Structure thèse */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ThesisField label="Problème" value={props.problem} />
          <ThesisField label="Solution" value={props.solution} />
          <ThesisField label="Why-now" value={props.whyNow} />
          <ThesisField label="Moat" value={props.moat} fallback="Non déclaré" />
          <div className="md:col-span-2">
            <ThesisField label="Path to exit" value={props.pathToExit} fallback="Non déclaré" />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Axes canoniques</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              props.evaluationAxes.thesisQuality,
              props.evaluationAxes.investorProfileFit,
              props.evaluationAxes.dealAccessibility,
            ].map((axis) => {
              const axisCfg = RECOMMENDATION_CONFIG[axis.verdict] ?? RECOMMENDATION_CONFIG.contrasted;
              return (
                <div key={axis.key} className="rounded-lg border bg-white/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{axis.label}</p>
                    <Badge variant="outline" className={axisCfg.color}>
                      {axisCfg.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-900">{axis.summary}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Load-bearing assumptions */}
        {props.loadBearing.length > 0 && (
          <div>
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left text-sm font-semibold text-slate-700 mb-2 hover:text-slate-900"
              onClick={() => setExpandedLoadBearing(!expandedLoadBearing)}
              aria-expanded={expandedLoadBearing}
            >
              <ShieldAlert className="h-4 w-4" />
              Hypothèses porteuses ({props.loadBearing.length})
              {expandedLoadBearing ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedLoadBearing && (
              <ul className="space-y-2 border-l-2 border-slate-200 pl-4">
                {props.loadBearing.map((lb) => {
                  const badge = STATUS_BADGE[lb.status];
                  return (
                    <li key={lb.id} className="text-sm">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className={`${badge.className} shrink-0`}>
                          {badge.label}
                        </Badge>
                        <span className="text-slate-900">{lb.statement}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-1">
                        <strong>Impact si fausse :</strong> {lb.impact}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Alertes */}
        {props.alerts.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Points d&apos;alerte ({props.alerts.length})
            </h3>
            <ul className="space-y-2">
              {alertsToShow.map((alert, idx) => {
                const sev = SEVERITY_BADGE[alert.severity];
                return (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <Badge className={`${sev.className} shrink-0 text-xs`}>{sev.label}</Badge>
                    <div>
                      <p className="font-medium text-slate-900">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {props.alerts.length > 5 && (
              <Button
                variant="link"
                size="sm"
                onClick={() => setExpandedAlerts(!expandedAlerts)}
                className="mt-2 px-0 h-auto text-xs"
              >
                {expandedAlerts ? "Voir moins" : `Voir les ${props.alerts.length - 5} alertes supplémentaires`}
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {props.hasPendingDecision && props.onReviewDecisionClick && (
            <Button onClick={props.onReviewDecisionClick} className="flex-1">
              Décider (Stop / Continuer / Contester)
            </Button>
          )}
          {!props.hasPendingDecision && props.decision && (
            <Badge variant="outline" className="text-xs">
              Décision : {props.decision === "stop" ? "Analyse arrêtée" : props.decision === "continue" ? "Analyse poursuivie" : "Contestation soumise"}
            </Badge>
          )}
          {props.onShowFrameworksClick && (
            <Button variant="outline" onClick={props.onShowFrameworksClick} size="sm">
              Voir par framework (YC / Thiel / Angel Desk)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ThesisField({ label, value, fallback = "Non renseigné" }: { label: string; value: string | null; fallback?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-slate-900">{value && value.trim().length > 0 ? value : <span className="italic text-muted-foreground">{fallback}</span>}</p>
    </div>
  );
}
