"use client";

import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyPointsSectionProps {
  consensusPoints: string[];
  frictionPoints: string[];
  questionsForFounder: string[];
}

export function KeyPointsSection({
  consensusPoints,
  frictionPoints,
  questionsForFounder,
}: KeyPointsSectionProps) {
  const hasContent =
    consensusPoints.length > 0 ||
    frictionPoints.length > 0 ||
    questionsForFounder.length > 0;

  if (!hasContent) return null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Consensus Points */}
      <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/90 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <h4 className="text-sm font-medium text-emerald-400">Points de Consensus</h4>
        </div>
        {consensusPoints.length > 0 ? (
          <ul className="space-y-2.5">
            {consensusPoints.map((point, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 text-sm text-slate-300"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Aucun point de consensus identifie
          </p>
        )}
      </div>

      {/* Friction Points */}
      <div className="rounded-2xl border border-amber-500/20 bg-slate-900/90 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <h4 className="text-sm font-medium text-amber-400">Points de Friction</h4>
        </div>
        {frictionPoints.length > 0 ? (
          <ul className="space-y-2.5">
            {frictionPoints.map((point, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 text-sm text-slate-300"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Aucun desaccord majeur
          </p>
        )}
      </div>

      {/* Questions for Founder */}
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/90 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
            <HelpCircle className="h-4 w-4 text-blue-400" />
          </div>
          <h4 className="text-sm font-medium text-blue-400">Questions pour le Fondateur</h4>
        </div>
        {questionsForFounder.length > 0 ? (
          <ul className="space-y-2.5">
            {questionsForFounder.map((question, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 text-sm text-slate-300"
              >
                <span className="mt-0.5 shrink-0 text-xs font-medium text-blue-400 w-4 text-right">
                  {index + 1}.
                </span>
                <span className="leading-relaxed">{question}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Pas de questions supplementaires
          </p>
        )}
      </div>
    </div>
  );
}
