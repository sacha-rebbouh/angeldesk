"use client";

/**
 * ThesisFrameworksExpand — composant collapsible affichant les 3 lunettes
 * (YC, Thiel, Angel Desk) en detail : claims + failures + strengths + summary.
 *
 * Appele depuis ThesisHeroCard via le bouton "Voir par framework". Chaque lunette
 * a son propre toggle pour deployer ses claims. Les verdicts sont surlignes avec
 * le mapping RECOMMENDATION_CONFIG (reutilisation labels existants).
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Check, X, HelpCircle, Minus, Target, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECOMMENDATION_CONFIG } from "@/lib/ui-configs";
import type {
  FrameworkClaim,
  FrameworkLensAvailability,
  NormalizedThesisEvaluation,
} from "@/agents/thesis/types";
import {
  getFrameworkLensAvailability,
  isFrameworkLensEvaluated,
  isThesisAxisUnavailable,
} from "@/agents/thesis/types";

interface FrameworkLens {
  framework: "yc" | "thiel" | "angel-desk";
  availability?: FrameworkLensAvailability;
  verdict: string;
  confidence: number;
  question: string;
  claims: FrameworkClaim[];
  failures: string[];
  strengths: string[];
  summary: string;
}

interface ThesisFrameworksExpandProps {
  ycLens: FrameworkLens;
  thielLens: FrameworkLens;
  angelDeskLens: FrameworkLens;
  evaluationAxes: NormalizedThesisEvaluation;
  defaultOpen?: boolean;
}

const FRAMEWORK_META: Record<FrameworkLens["framework"], { label: string; question: string; focus: string }> = {
  yc: {
    label: "YC Framework",
    question: "Le probleme est-il reel et la distribution realiste ?",
    focus: "Problem reality, PMF path, distribution, retention, why-now, moat PMF-driven",
  },
  thiel: {
    label: "Thiel Framework",
    question: "Existe-t-il une verite contrarienne et un chemin vers le monopole ?",
    focus: "Contrarian truth, 10x better, proprietary tech, network effects, monopoly path, timing",
  },
  "angel-desk": {
    label: "Angel Desk Framework",
    question: "Comment cette these se comporte-t-elle sous contraintes reelles de capital prive, et pour quels profils / conditions ?",
    focus: "Thesis quality sous contraintes reelles, investor profile fit, deal accessibility, exit realisable, ticket compatibility, dilution control, liquidity path",
  },
};

const CLAIM_STATUS_CONFIG: Record<FrameworkClaim["status"], { label: string; icon: typeof Check; className: string }> = {
  supported: { label: "Supporte", icon: Check, className: "bg-green-50 text-green-700 border-green-300" },
  contradicted: { label: "Contredit", icon: X, className: "bg-red-50 text-red-700 border-red-300" },
  unverifiable: { label: "Non verifiable", icon: HelpCircle, className: "bg-slate-50 text-slate-700 border-slate-300" },
  partial: { label: "Partiel", icon: Minus, className: "bg-amber-50 text-amber-700 border-amber-300" },
};

export function getFrameworkLensDisplayState(lens: Pick<FrameworkLens, "availability" | "verdict">) {
  if (!isFrameworkLensEvaluated(lens)) {
    return {
      unavailable: true,
      badgeLabel: "Indisponible",
      badgeClassName: "bg-slate-100 text-slate-700 border-slate-300",
      cardClassName: "bg-slate-50 border-slate-200",
      detailLabel:
        getFrameworkLensAvailability(lens) === "degraded_chain_exhausted"
          ? "Aucun modèle de la chaîne n'a pu produire une évaluation exploitable."
          : "Réponse partiellement récupérée, non retenue comme signal métier.",
    };
  }

  const verdictCfg = RECOMMENDATION_CONFIG[lens.verdict] ?? RECOMMENDATION_CONFIG.contrasted;
  return {
    unavailable: false,
    badgeLabel: verdictCfg.label,
    badgeClassName: cn("font-semibold text-xs", verdictCfg.color),
    cardClassName: verdictCfg.bg,
    detailLabel: null,
  };
}

export function ThesisFrameworksExpand({ ycLens, thielLens, angelDeskLens, evaluationAxes, defaultOpen = false }: ThesisFrameworksExpandProps) {
  const [open, setOpen] = useState(defaultOpen);

  const lenses = [ycLens, thielLens, angelDeskLens];

  return (
    <Card className="border-dashed" role="region" aria-label="Analyse par framework">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="w-full flex items-center justify-between text-left hover:opacity-80"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-600" />
            Analyse par framework (YC / Thiel / Angel Desk)
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground italic">
            Le verdict consolide ne doit jamais remplacer la lecture des axes canoniques: qualite de these, fit investisseur, accessibilite du deal.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              evaluationAxes.thesisQuality,
              evaluationAxes.investorProfileFit,
              evaluationAxes.dealAccessibility,
            ].map((axis) => {
              const axisUnavailable = isThesisAxisUnavailable(axis);
              const axisCfg = axisUnavailable
                ? null
                : (RECOMMENDATION_CONFIG[axis.verdict] ?? RECOMMENDATION_CONFIG.contrasted);
              return (
                <div key={axis.key} className="rounded-md border bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{axis.label}</p>
                    <Badge
                      variant="outline"
                      className={axisUnavailable ? "bg-slate-100 text-slate-700 border-slate-300" : axisCfg?.color}
                    >
                      {axisUnavailable ? "Indisponible" : axisCfg?.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-700">{axis.summary}</p>
                </div>
              );
            })}
          </div>
          {lenses.map((lens) => (
            <FrameworkSection key={lens.framework} lens={lens} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function FrameworkSection({ lens }: { lens: FrameworkLens }) {
  const [claimsOpen, setClaimsOpen] = useState(false);
  const meta = FRAMEWORK_META[lens.framework];
  const displayState = getFrameworkLensDisplayState(lens);

  return (
    <div className={cn("rounded-md border p-4", displayState.cardClassName)}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-slate-900">{meta.label}</h4>
          <p className="text-xs text-muted-foreground mt-1">
            <strong>Question centrale :</strong> {meta.question}
          </p>
          <p className="text-xs text-muted-foreground italic mt-1">{meta.focus}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={displayState.badgeClassName}>
            {displayState.badgeLabel}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {displayState.unavailable ? displayState.detailLabel : `Confiance ${lens.confidence}/100`}
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-800 leading-relaxed mb-3">{lens.summary}</p>

      {((!displayState.unavailable && lens.strengths.length > 0) || lens.failures.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {!displayState.unavailable && lens.strengths.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-xs font-medium text-green-700 mb-1">
                <TrendingUp className="h-3 w-3" />
                Points d&apos;adherence
              </div>
              <ul className="space-y-1">
                {lens.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-start gap-1">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lens.failures.length > 0 && (
            <div>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium mb-1",
                displayState.unavailable ? "text-slate-700" : "text-red-700"
              )}>
                <AlertCircle className="h-3 w-3" />
                {displayState.unavailable ? "Indisponibilité système" : "Points de fragilite"}
              </div>
              <ul className="space-y-1">
                {lens.failures.map((f, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-start gap-1">
                    <span className={cn("mt-0.5", displayState.unavailable ? "text-slate-500" : "text-red-600")}>-</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!displayState.unavailable && lens.claims.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setClaimsOpen(!claimsOpen)}
            aria-expanded={claimsOpen}
            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {claimsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {lens.claims.length} claim{lens.claims.length > 1 ? "s" : ""} testes contre les sources
          </button>
          {claimsOpen && (
            <ul className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
              {lens.claims.map((claim, i) => {
                const statusCfg = CLAIM_STATUS_CONFIG[claim.status];
                const StatusIcon = statusCfg.icon;
                return (
                  <li key={i} className="text-xs">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusCfg.className)}>
                        <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                        {statusCfg.label}
                      </Badge>
                      <span className="text-slate-800 font-medium">{claim.claim}</span>
                    </div>
                    <p className="mt-1 ml-1 text-muted-foreground">
                      <strong>Derive de :</strong> {claim.derivedFrom}
                    </p>
                    {claim.evidence && (
                      <p className="mt-0.5 ml-1 text-muted-foreground">
                        <strong>Evidence :</strong> {claim.evidence}
                      </p>
                    )}
                    {claim.concern && (
                      <p className="mt-0.5 ml-1 text-red-700">
                        <strong>Concern :</strong> {claim.concern}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
