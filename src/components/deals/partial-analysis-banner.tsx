"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Shield,
  Brain,
  BarChart3,
  FileText,
  Zap,
  Crown,
} from "lucide-react";
import type { SubscriptionPlan } from "@/lib/analysis-constants";

interface MissingAgent {
  name: string;
  icon: React.ReactNode;
  impact: string;
}

const MISSING_AGENTS_FOR_FREE: MissingAgent[] = [
  {
    name: "Devil's Advocate",
    icon: <Brain className="h-4 w-4 text-purple-500" />,
    impact: "Challenge la thèse d'investissement. Identifie les risques critiques que les autres agents ne voient pas.",
  },
  {
    name: "Detecteur de contradictions",
    icon: <Zap className="h-4 w-4 text-amber-500" />,
    impact: "Compare les affirmations du deck entre elles et avec les donnees reelles. Detecte les incoherences cachees.",
  },
  {
    name: "Modelisation de scenarios",
    icon: <BarChart3 className="h-4 w-4 text-indigo-500" />,
    impact: "Calcule votre retour potentiel (IRR, multiple) dans 4 scenarios avec probabilites.",
  },
  {
    name: "Expert sectoriel",
    icon: <Shield className="h-4 w-4 text-cyan-500" />,
    impact: "Analyse specialisee avec les KPIs et standards du secteur. Detecte les risques specifiques.",
  },
  {
    name: "Memo d'investissement",
    icon: <FileText className="h-4 w-4 text-green-500" />,
    impact: "Document structure avec these d'investissement, risques mitiges, et prochaines etapes concretes.",
  },
];

interface PartialAnalysisBannerProps {
  subscriptionPlan: SubscriptionPlan;
  isMissingTier3: boolean;
}

export const PartialAnalysisBanner = memo(function PartialAnalysisBanner({
  subscriptionPlan,
  isMissingTier3,
}: PartialAnalysisBannerProps) {
  const router = useRouter();

  if (subscriptionPlan !== "FREE" || !isMissingTier3) return null;

  return (
    <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-amber-900">
                Votre analyse est partielle
              </p>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                5 agents manquants
              </Badge>
            </div>
            <p className="text-sm text-amber-800 mb-3">
              Les agents ci-dessous sont essentiels pour une decision d'investissement eclairee.
              Sans eux, des risques critiques peuvent passer inapercus.
            </p>

            <div className="space-y-2 mb-4">
              {MISSING_AGENTS_FOR_FREE.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-start gap-2 p-2 rounded bg-white/60 border border-amber-200"
                >
                  {agent.icon}
                  <div>
                    <span className="text-sm font-medium text-amber-900">{agent.name}</span>
                    <p className="text-xs text-amber-700">{agent.impact}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                onClick={() => router.push("/pricing")}
              >
                <Crown className="mr-2 h-4 w-4" />
                Debloquer l'analyse complete
              </Button>
              <p className="text-xs text-amber-600">
                Votre score actuel pourrait changer significativement avec l'analyse complete.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
