"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Search,
  Users,
  Headphones,
  RefreshCw,
  MessageSquare,
  FileText,
  Gift,
  ArrowRight,
  Sparkles,
  Building2,
  Check,
} from "lucide-react";
import { CREDIT_PACKS, CREDIT_COSTS, FULL_DEAL_PACKAGE_CREDITS, CREDIT_RULES } from "@/services/credits/types";
import type { CreditBalanceInfo } from "@/services/credits/types";
import { PricingCtaButton } from "./pricing-cta-button";

interface PricingContentProps {
  balance: CreditBalanceInfo;
}

const ACTION_CARDS = [
  { action: "DEEP_DIVE" as const, label: "Deep Dive", desc: "Thèse + Tier 1+2+3 complet", icon: Search, color: "text-emerald-500" },
  { action: "AI_BOARD" as const, label: "AI Board", desc: "4 LLMs en débat (inclut round thèse)", icon: Users, color: "text-amber-500" },
  { action: "LIVE_COACHING" as const, label: "Live Coaching", desc: "Coaching temps réel", icon: Headphones, color: "text-purple-500" },
  { action: "RE_ANALYSIS" as const, label: "Re-analyse", desc: "Nouvelles données", icon: RefreshCw, color: "text-orange-500" },
  { action: "THESIS_REBUTTAL" as const, label: "Rebuttal thèse", desc: "Contester l'extraction", icon: Zap, color: "text-pink-500" },
  { action: "THESIS_REEXTRACT" as const, label: "Re-extract thèse", desc: "Sur nouveau document", icon: RefreshCw, color: "text-indigo-500" },
  { action: "CHAT" as const, label: "Chat IA", desc: "Illimité", icon: MessageSquare, color: "text-sky-500" },
  { action: "PDF_EXPORT" as const, label: "Export PDF", desc: "Rapport complet", icon: FileText, color: "text-slate-500" },
] as const;

export function PricingContent({ balance }: PricingContentProps) {
  return (
    <div className="space-y-12 pb-16 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Des crédits, pas des abonnements
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Payez pour ce que vous utilisez. Chaque action a un coût en crédits transparent.
          1 deal complet = {FULL_DEAL_PACKAGE_CREDITS} crédits.
        </p>

        {/* Current balance */}
        {balance.balance > 0 && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <Sparkles className="h-4 w-4" />
            <span className="font-semibold">{balance.balance} crédits disponibles</span>
          </div>
        )}
      </div>

      {/* Free tier banner */}
      {!balance.freeCreditsGranted && balance.balance === 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white text-center">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 mb-3">
              <Gift className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wider opacity-90">
                Offert
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              1 Deep Dive offert sur votre premier deal
            </h2>
            <p className="text-white/80 max-w-lg mx-auto mb-4">
              5 crédits gratuits. Pas de carte bancaire.
              Voyez ce que 20 agents d&apos;analyse, enrichis par 41 expertises disponibles, produisent sur votre deal réel.
            </p>
            <PricingCtaButton variant="banner" label="Commencer gratuitement" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
        </div>
      )}

      {/* Transition banner : Quick Scan retire au profit de Deep Dive these-first */}
      <div className="rounded-md border border-blue-300 bg-blue-50 p-4 flex items-start gap-3">
        <div className="rounded-full bg-blue-100 p-2 shrink-0">
          <Sparkles className="h-4 w-4 text-blue-700" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">
            Quick Scan remplacé par Deep Dive thesis-first
          </p>
          <p className="text-xs text-blue-800 mt-1 leading-relaxed">
            Depuis le 17 avril 2026, le Quick Scan a ete retire. Le Deep Dive (5 credits)
            inclut desormais l&apos;analyse de these (Tier 0.5, 3 frameworks YC/Thiel/Angel Desk)
            <strong> sans surcout</strong>. Vous pouvez arreter l&apos;analyse apres le verdict
            these (remboursement partiel de 3 credits) si les signaux sont insuffisants.
          </p>
        </div>
      </div>

      {/* Credit costs per action */}
      <div>
        <h2 className="text-2xl font-bold mb-1">Coût par action</h2>
        <p className="text-muted-foreground mb-6">Transparent. Pas de surprise.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACTION_CARDS.map(({ action, label, desc, icon: Icon, color }) => {
            const cost = CREDIT_COSTS[action];
            return (
              <div
                key={action}
                className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow"
              >
                <div className={`shrink-0 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
                <div className="shrink-0">
                  {cost === 0 ? (
                    <Badge variant="secondary" className="text-xs">Gratuit</Badge>
                  ) : (
                    <span className="font-bold text-sm">{cost} cr.</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Full deal package */}
          <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50/50">
            <div className="shrink-0 text-amber-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Deal complet</div>
              <div className="text-xs text-muted-foreground">Deep Dive + Board + Coaching + Re-analyse</div>
              <div className="text-xs text-amber-700 mt-1">Pack recommandé : Standard (30 crédits, 99€)</div>
            </div>
            <span className="shrink-0 font-bold text-sm text-amber-700">{FULL_DEAL_PACKAGE_CREDITS} cr.</span>
          </div>
        </div>
      </div>

      {/* Auto-refill toggle — hidden until Stripe integration */}

      {/* Packs */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CREDIT_PACKS.map((pack) => {
          const isHighlighted = pack.highlight;
          const displayPrice = pack.priceEur;
          const displayPerCredit = pack.perCredit.toFixed(2);

          return (
            <Card
              key={pack.name}
              className={`relative overflow-hidden transition-shadow hover:shadow-md ${
                isHighlighted ? "ring-2 ring-amber-500 shadow-md" : ""
              }`}
            >
              {isHighlighted && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
                  Populaire
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">{pack.displayName}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{displayPrice}€</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{pack.credits} crédits</span>
                    <span>·</span>
                    <span>{displayPerCredit}€/crédit</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{pack.description}</p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    Tous les tiers d&apos;analyse
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    Chat IA illimité
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    Export PDF inclus
                  </li>
                  {pack.credits >= 60 && (
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      Conditions & négociation
                    </li>
                  )}
                  {pack.credits >= 125 && (
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      API v1 (REST + webhooks)
                    </li>
                  )}
                </ul>

                <PricingCtaButton
                  variant="card"
                  packName={pack.name}
                  highlighted={isHighlighted}
                />
              </CardContent>
            </Card>
          );
        })}

        {/* Institutional */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-500" />
                <h3 className="text-xl font-bold">Institutional</h3>
              </div>
              <div className="text-3xl font-bold">Sur mesure</div>
              <div className="text-sm text-muted-foreground">
                Volume illimité négocié
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fonds PE, M&A corporate, family offices. Crédits illimités, intégration sur mesure.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Multi-utilisateurs
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Exports compliance / audit trail
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Rapports white-label
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Support dédié + SLA
              </li>
            </ul>
            <Button variant="outline" className="w-full group" asChild>
              <a href="mailto:contact@angeldesk.ai">
                Nous contacter
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Credit rules */}
      <div className="grid gap-4 sm:grid-cols-3 text-center text-sm">
        <div className="p-4 rounded-xl bg-muted/50">
          <div className="font-semibold mb-1">Validité</div>
          <div className="text-muted-foreground">
            Les crédits expirent {CREDIT_RULES.expiryMonths} mois après le dernier achat
          </div>
        </div>
        <div className="p-4 rounded-xl bg-muted/50">
          <div className="font-semibold mb-1">Cumul</div>
          <div className="text-muted-foreground">
            Les crédits non utilisés se cumulent à chaque achat
          </div>
        </div>
        <div className="p-4 rounded-xl bg-muted/50">
          <div className="font-semibold mb-1">Remboursement</div>
          <div className="text-muted-foreground">
            Crédits remboursés automatiquement si une action échoue
          </div>
        </div>
      </div>
    </div>
  );
}
