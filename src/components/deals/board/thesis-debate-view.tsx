"use client";

/**
 * ThesisDebateView — affiche le Round 0 (THESIS_DEBATE) du Board IA.
 * Chaque membre (Claude / GPT / Gemini / Grok) expose son adhesion a la these,
 * sa critique majeure et ses recommandations au BA.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Check, X, Minus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThesisDebateResponse } from "@/agents/board/types";

interface ThesisDebateViewProps {
  responses: Array<{
    memberId: string;
    memberName: string;
    response: ThesisDebateResponse;
  }>;
}

const AGREEMENT_CONFIG: Record<ThesisDebateResponse["agreement"], { label: string; color: string; icon: typeof Check }> = {
  strong_agree: { label: "Forte adhesion", color: "bg-green-100 text-green-800 border-green-300", icon: Check },
  agree: { label: "Adhesion", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
  neutral: { label: "Neutre", color: "bg-slate-50 text-slate-700 border-slate-200", icon: Minus },
  disagree: { label: "Desaccord", color: "bg-amber-50 text-amber-800 border-amber-200", icon: X },
  strong_disagree: { label: "Fort desaccord", color: "bg-red-100 text-red-800 border-red-300", icon: AlertTriangle },
};

export function ThesisDebateView({ responses }: ThesisDebateViewProps) {
  if (responses.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-slate-300" role="region" aria-label="Round 0 — Debat sur la these">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-slate-600" />
          Round 0 — Debat sur la these d&apos;investissement
        </CardTitle>
        <CardDescription>
          These debattue par les {responses.length} membres IA — adhesions, desaccords et critiques exposes ci-dessous.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {responses.map((r) => {
          const cfg = AGREEMENT_CONFIG[r.response.agreement];
          const AgreementIcon = cfg.icon;
          return (
            <div key={r.memberId} className="rounded-md border p-3 bg-card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{r.memberName}</span>
                    <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>
                      <AgreementIcon className="h-2.5 w-2.5 mr-0.5" />
                      {cfg.label}
                    </Badge>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-800 leading-relaxed mb-2">{r.response.justification}</p>

              {r.response.weakestAssumption && (
                <div className="text-xs mb-1">
                  <span className="font-medium text-slate-600">Hypothese la plus fragile : </span>
                  <span className="text-slate-900">{r.response.weakestAssumption}</span>
                </div>
              )}

              {r.response.majorCritique && (
                <div className="text-xs mb-1">
                  <span className="font-medium text-red-700">Critique majeure : </span>
                  <span className="text-slate-900">{r.response.majorCritique}</span>
                </div>
              )}

              {r.response.recommendations && r.response.recommendations.length > 0 && (
                <div className="text-xs mt-2">
                  <span className="font-medium text-slate-600">Recommandations :</span>
                  <ul className="mt-1 ml-2 space-y-0.5">
                    {r.response.recommendations.map((rec, i) => (
                      <li key={i} className="text-slate-800">
                        <span className="text-slate-400 mr-1">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
