"use client";

import { memo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Upload,
  Play,
  MessageSquare,
  ArrowRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FirstDealGuideProps {
  userName: string;
  totalDeals: number;
}

const STEPS = [
  {
    id: 1,
    title: "Creez votre premier deal",
    description: "Entrez les informations de base : nom de la startup, secteur, stade. Meme le minimum suffit pour commencer.",
    icon: FileText,
    href: "/deals/new",
  },
  {
    id: 2,
    title: "Uploadez le pitch deck",
    description: "Ajoutez le PDF du pitch deck. L'IA extraira automatiquement les metriques cles (valorisation, ARR, equipe...).",
    icon: Upload,
    href: null,
  },
  {
    id: 3,
    title: "Lancez l'analyse",
    description: "12 agents IA analysent le deal en parallele : finances, equipe, marche, tech, legal... En 2-3 minutes, c'est fait.",
    icon: Play,
    href: null,
  },
  {
    id: 4,
    title: "Explorez les resultats",
    description: "Consultez le score, les red flags, et les questions a poser au fondateur. Utilisez le chat IA pour approfondir.",
    icon: MessageSquare,
    href: null,
  },
];

export const FirstDealGuide = memo(function FirstDealGuide({
  userName,
  totalDeals,
}: FirstDealGuideProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("angeldesk-onboarding-dismissed") === "true";
    }
    return false;
  });

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("angeldesk-onboarding-dismissed", "true");
    }
  }, []);

  if (isDismissed || totalDeals > 0) return null;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 relative overflow-hidden">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        aria-label="Fermer le guide"
      >
        <X className="h-4 w-4" />
      </button>

      <CardHeader className="pb-3">
        <CardTitle className="text-xl">
          Bienvenue {userName} ! Voici comment analyser votre premier deal
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          En 5 minutes, obtenez une analyse digne d'un fonds VC. Suivez ces 4 etapes.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "relative p-4 rounded-lg border bg-background transition-shadow hover:shadow-md",
                i === 0 && "ring-2 ring-primary/50"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                  {step.id}
                </span>
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {i === 0 && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => router.push("/deals/new")}
                >
                  Commencer
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Button>
              )}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
