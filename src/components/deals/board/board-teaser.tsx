"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
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
  ArrowRight,
} from "lucide-react";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import { ProviderIcon } from "@/components/shared/provider-icon";

interface BoardTeaserProps {
  dealName: string;
}

export const BoardTeaser = memo(function BoardTeaser({ dealName }: BoardTeaserProps) {
  const router = useRouter();

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Background grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Amber glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-amber-500/30">
              <Users className="h-7 w-7 text-amber-400" />
            </div>
            <div>
              <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
                AI Board
                <Badge className="border-0 bg-amber-500/15 text-amber-400 text-[10px] font-semibold uppercase tracking-wider">
                  <Crown className="mr-1 h-3 w-3" />
                  Premium
                </Badge>
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">
                4 LLMs de premier plan délibèrent sur votre deal
              </p>
            </div>
          </div>

          {/* Features grid */}
          <div className="mt-8 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Ce que le Board analyserait pour &quot;{dealName}&quot;
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureCard
                icon={<MessageSquare className="h-4 w-4 text-blue-400" />}
                title="Débat structuré"
                description="Les 4 modèles débattent jusqu'à consensus ou majorité stable"
              />
              <FeatureCard
                icon={<Scale className="h-4 w-4 text-emerald-400" />}
                title="Vote argumenté"
                description="Chaque modèle justifie son verdict avec des preuves"
              />
              <FeatureCard
                icon={<HelpCircle className="h-4 w-4 text-purple-400" />}
                title="Questions clés"
                description="Questions à poser au fondateur basées sur les concerns"
              />
              <FeatureCard
                icon={<Users className="h-4 w-4 text-amber-400" />}
                title="Points de friction"
                description="Identification des désaccords entre les modèles"
              />
            </div>
          </div>

          {/* Board members */}
          <div className="mt-8 border-t border-slate-800 pt-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-300">
              Les 4 membres du Board
            </h3>
            <div className="flex flex-wrap gap-3">
              {BOARD_MEMBERS_PROD.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 rounded-full border border-slate-700/50 bg-slate-800/40 px-3.5 py-2 transition-colors hover:border-slate-600/50 hover:bg-slate-800/60"
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: member.color }}
                  >
                    <ProviderIcon
                      provider={member.provider}
                      className="h-3.5 w-3.5 text-white"
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-300">
                    {member.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Subtle amber glow bottom */}
        <div className="pointer-events-none absolute -bottom-16 left-1/2 h-32 w-80 -translate-x-1/2 rounded-full bg-amber-500/8 blur-3xl" />

        <div className="relative flex flex-col items-center px-6 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/15 to-orange-500/15 ring-1 ring-amber-500/20">
            <Lock className="h-7 w-7 text-amber-400" />
          </div>

          <h3 className="mt-5 text-lg font-bold text-white">
            Débloquez le AI Board avec des crédits
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
            Obtenez un avis éclairé de 4 des meilleurs LLMs du marché, avec débat
            structuré et recommandations actionnables.
          </p>

          <div className="mt-6 space-y-1.5">
            <p className="text-3xl font-bold text-white">
              10
              <span className="text-sm font-normal text-slate-500"> crédits</span>
            </p>
            <p className="text-xs text-slate-500">
              Packs à partir de 49 € &bull; Crédits valables 6 mois
            </p>
          </div>

          <Button
            size="lg"
            className="mt-7 bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-600 hover:to-orange-700 hover:shadow-amber-500/30"
            onClick={() => {
              router.push("/pricing");
            }}
          >
            <Crown className="mr-2 h-4 w-4" />
            Voir les packs de crédits
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});

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
    <div className="flex gap-3 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 transition-colors hover:border-slate-700/60 hover:bg-slate-800/50">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
