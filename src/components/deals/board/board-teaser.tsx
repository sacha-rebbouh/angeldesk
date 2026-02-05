"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Lock,
  Crown,
  Sparkles,
  MessageSquare,
  Scale,
  HelpCircle,
} from "lucide-react";
// Use BOARD_MEMBERS_PROD directly since this is a client component
// and we want to show the premium models in the teaser
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import { BOARD_PRICING } from "@/services/board-credits";

interface BoardTeaserProps {
  dealName: string;
}

export function BoardTeaser({ dealName }: BoardTeaserProps) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                AI Board
                <Badge className="bg-white/20 text-white hover:bg-white/30">
                  <Crown className="mr-1 h-3 w-3" />
                  Premium
                </Badge>
              </h2>
              <p className="text-white/80">
                4 LLMs de premier plan délibèrent sur votre deal
              </p>
            </div>
          </div>
        </div>

        <CardContent className="pt-6">
          {/* What it does */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Ce que le Board analyserait pour &quot;{dealName}&quot;
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={<MessageSquare className="h-5 w-5 text-blue-500" />}
                title="Débat structuré"
                description="Les 4 modèles débattent jusqu'à consensus ou majorité stable"
              />
              <FeatureCard
                icon={<Scale className="h-5 w-5 text-green-500" />}
                title="Vote argumenté"
                description="Chaque modèle justifie son verdict avec des preuves"
              />
              <FeatureCard
                icon={<HelpCircle className="h-5 w-5 text-purple-500" />}
                title="Questions clés"
                description="Questions à poser au fondateur basées sur les concerns"
              />
              <FeatureCard
                icon={<Users className="h-5 w-5 text-amber-500" />}
                title="Points de friction"
                description="Identification des désaccords entre les modèles"
              />
            </div>
          </div>

          {/* The models */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-semibold mb-4">Les 4 membres du Board</h3>
            <div className="flex flex-wrap gap-3">
              {BOARD_MEMBERS_PROD.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5"
                  style={{ borderColor: member.color }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: member.color }}
                  />
                  <span className="text-sm font-medium">{member.name}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              Passez au plan PRO pour débloquer le AI Board
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Obtenez un avis éclairé de 4 des meilleurs LLMs du marché, avec débat
              structuré et recommandations actionnables.
            </p>

            <div className="mt-6 space-y-2 text-center">
              <p className="text-2xl font-bold">
                {BOARD_PRICING.PRO_MONTHLY} €<span className="text-sm font-normal text-muted-foreground">/mois</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {BOARD_PRICING.PRO_INCLUDED_BOARDS} boards inclus • +{BOARD_PRICING.EXTRA_BOARD} €/board supplémentaire
              </p>
            </div>

            <Button
              size="lg"
              className="mt-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
              onClick={() => {
                router.push("/pricing");
              }}
            >
              <Crown className="mr-2 h-4 w-4" />
              Passer au PRO
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
