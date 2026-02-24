"use client";

import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  MessageSquare,
  AlertTriangle,
  Search,
  FileText,
  Handshake,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/lib/analysis-constants";

interface NextStepAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  priority: "critical" | "high" | "medium";
  proOnly?: boolean;
}

interface NextStepsGuideProps {
  criticalRedFlagCount: number;
  questionsCount: number;
  avgScore: number;
  hasTier3: boolean;
  subscriptionPlan: SubscriptionPlan;
}

export const NextStepsGuide = memo(function NextStepsGuide({
  criticalRedFlagCount,
  questionsCount,
  avgScore,
  hasTier3,
  subscriptionPlan,
}: NextStepsGuideProps) {
  const isFree = subscriptionPlan === "FREE";

  const steps = useMemo((): NextStepAction[] => {
    const actions: NextStepAction[] = [];

    if (criticalRedFlagCount > 0) {
      actions.push({
        id: "review-red-flags",
        label: "Examiner les red flags critiques",
        description: `${criticalRedFlagCount} red flag${criticalRedFlagCount > 1 ? "s" : ""} nécessitent votre attention immédiate. Lisez les détails et évaluez s'il s'agit de risques critiques.`,
        icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
        priority: "critical",
      });
    }

    if (questionsCount > 0) {
      actions.push({
        id: "ask-founder",
        label: "Poser les questions au fondateur",
        description: `${questionsCount} questions générées par l'analyse. Utilisez l'onglet "Réponses Fondateur" pour enregistrer ses réponses et relancer l'analyse.`,
        icon: <MessageSquare className="h-5 w-5 text-blue-500" />,
        priority: "high",
      });
    }

    if (avgScore < 60) {
      actions.push({
        id: "add-documents",
        label: "Ajouter des documents complémentaires",
        description: "Le score moyen est bas. Ajoutez le pitch deck, le BP financier, ou la cap table pour affiner l'analyse.",
        icon: <FileText className="h-5 w-5 text-amber-500" />,
        priority: "high",
      });
    }

    actions.push({
      id: "chat-deep-dive",
      label: "Approfondir avec le chat IA",
      description: "Posez des questions spécifiques sur les points d'ombre. Le chat connaît tous les résultats de l'analyse.",
      icon: <Search className="h-5 w-5 text-purple-500" />,
      priority: "medium",
    });

    if (isFree && !hasTier3) {
      actions.push({
        id: "run-full-analysis",
        label: "Lancer l'analyse complète (PRO)",
        description: "Obtenez le Devil's Advocate, les scénarios financiers, le détecteur de contradictions et le mémo d'investissement.",
        icon: <Crown className="h-5 w-5 text-amber-500" />,
        priority: "medium",
        proOnly: true,
      });
    }

    if (avgScore >= 50) {
      actions.push({
        id: "prepare-negotiation",
        label: "Préparer la négociation",
        description: "Les agents ont identifié des points de négociation. Utilisez-les pour discuter la valorisation et les termes.",
        icon: <Handshake className="h-5 w-5 text-green-500" />,
        priority: "medium",
      });
    }

    return actions;
  }, [criticalRedFlagCount, questionsCount, avgScore, hasTier3, isFree]);

  if (steps.length === 0) return null;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-primary" />
          Prochaines étapes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Actions recommandées en fonction de votre analyse
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                step.priority === "critical" && "bg-red-50 border-red-200",
                step.priority === "high" && "bg-amber-50/50 border-amber-200",
                step.priority === "medium" && "bg-muted/50 border-border"
              )}
            >
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {step.icon}
                  <span className="font-medium text-sm">{step.label}</span>
                  {step.proOnly && (
                    <Badge variant="secondary" className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 text-xs">
                      <Crown className="mr-0.5 h-3 w-3" />
                      PRO
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
});
