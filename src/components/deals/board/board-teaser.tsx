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
import { BOARD_PRICING } from "@/services/board-credits";

interface BoardTeaserProps {
  dealName: string;
}

// Provider icon SVGs (matching vote-board.tsx / chat-view.tsx)
function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M17.304 3.541l-5.296 16.459h3.366L20.67 3.541h-3.366zm-10.608 0L1.4 20h3.366l1.058-3.286h5.417L12.3 20h3.366L10.37 3.541H6.696zm2.985 4.17l1.867 5.8h-3.74l1.873-5.8z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.516a5.986 5.986 0 00-5.712 4.14 6.044 6.044 0 00-4.041 2.926 6.048 6.048 0 00.749 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.288 23.5a6.048 6.048 0 005.712-4.138 6.047 6.047 0 004.042-2.928 6.048 6.048 0 00-.76-6.613zM13.29 21.538a4.49 4.49 0 01-2.888-1.054l.144-.08 4.802-2.772a.778.778 0 00.394-.676v-6.765l2.03 1.172a.071.071 0 01.038.053v5.607a4.504 4.504 0 01-4.52 4.515zm-9.697-4.138a4.49 4.49 0 01-.537-3.016l.144.083 4.802 2.773a.78.78 0 00.787 0l5.862-3.384v2.342a.073.073 0 01-.03.06L9.78 19.044a4.504 4.504 0 01-6.187-1.644zM2.372 7.878A4.49 4.49 0 014.714 5.87v5.716a.776.776 0 00.393.676l5.862 3.385-2.03 1.17a.071.071 0 01-.067.005L3.93 13.844a4.504 4.504 0 01-1.558-6.166zm16.656 3.879l-5.862-3.384 2.03-1.172a.071.071 0 01.067-.006l4.94 2.852a4.494 4.494 0 01-.679 8.133v-5.743a.78.78 0 00-.396-.68zm2.02-3.026l-.144-.083-4.802-2.772a.78.78 0 00-.787 0l-5.862 3.384V6.918a.073.073 0 01.03-.06l4.94-2.852a4.498 4.498 0 016.724 4.66l.001.065zm-12.7 4.18l-2.03-1.171a.071.071 0 01-.038-.053V6.08a4.497 4.497 0 017.407-3.443l-.144.08-4.802 2.773a.778.778 0 00-.393.676v6.765l.001-.04zm1.1-2.383l2.61-1.506 2.61 1.507v3.012l-2.61 1.506-2.61-1.506V10.528z" />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 11.01v3.32h5.47c-.24 1.26-1.01 2.33-2.16 3.04l3.49 2.71c2.03-1.87 3.2-4.62 3.2-7.89 0-.76-.07-1.49-.2-2.19H12z" />
          <path d="M5.84 14.09l-.78.6-2.78 2.16C4.56 20.63 8.03 23 12 23c3.24 0 5.95-1.07 7.93-2.91l-3.49-2.71c-.97.65-2.21 1.04-3.56 1.04-2.74 0-5.06-1.85-5.89-4.34l-.15.01z" />
          <path d="M2.28 6.85C1.47 8.45 1 10.17 1 12s.47 3.55 1.28 5.15l3.62-2.81C5.55 13.46 5.33 12.75 5.33 12s.22-1.46.57-2.34L2.28 6.85z" />
          <path d="M12 5.58c1.54 0 2.93.53 4.02 1.57l3.01-3.01C17.07 2.18 14.76 1 12 1 8.03 1 4.56 3.37 2.28 6.85l3.62 2.81C6.7 7.43 9.02 5.58 12 5.58z" />
        </svg>
      );
    case "xai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M2.2 2L10.7 14.3L2.6 22H4.4L11.5 15.5L17.2 22H22L13 9.2L20.4 2H18.6L12.2 8L7 2H2.2ZM5.2 3.5H6.8L19 20.5H17.4L5.2 3.5Z" />
        </svg>
      );
    default:
      return null;
  }
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
                4 LLMs de premier plan deliberent sur votre deal
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
                title="Debat structure"
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
                description="Identification des desaccords entre les modeles"
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
            Passez au plan PRO pour debloquer le AI Board
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
            Obtenez un avis eclaire de 4 des meilleurs LLMs du marche, avec debat
            structure et recommandations actionnables.
          </p>

          <div className="mt-6 space-y-1.5">
            <p className="text-3xl font-bold text-white">
              {BOARD_PRICING.PRO_MONTHLY} €
              <span className="text-sm font-normal text-slate-500">/mois</span>
            </p>
            <p className="text-xs text-slate-500">
              {BOARD_PRICING.PRO_INCLUDED_BOARDS} boards inclus &bull; +{BOARD_PRICING.EXTRA_BOARD} €/board supplementaire
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
            Passer au PRO
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
