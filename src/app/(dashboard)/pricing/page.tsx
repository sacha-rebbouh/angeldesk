import { requireAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Crown,
  Zap,
  Shield,
  Users,
  Brain,
  Target,
  TrendingUp,
  AlertTriangle,
  FileSearch,
  Scale,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import { PricingCtaButton } from "./pricing-cta-button";

export default async function PricingPage() {
  const user = await requireAuth();
  const isPro = user.subscriptionStatus === "PRO" || user.subscriptionStatus === "ENTERPRISE";

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          La DD d&apos;un fonds VC,
          <br />
          <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
            accessible à un Business Angel
          </span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          En 5 minutes, obtenez l&apos;analyse qu&apos;un analyste VC ferait en 2 jours.
          Plus de décisions au feeling.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
        {/* FREE Plan */}
        <Card className={!isPro ? "ring-2 ring-primary" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">FREE</CardTitle>
              {!isPro && <Badge>Plan actuel</Badge>}
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold">0 €</span>
              <span className="text-muted-foreground">/mois</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Parfait pour découvrir la plateforme
            </p>
            <ul className="space-y-3">
              <PricingFeature included>5 deals analysés/mois</PricingFeature>
              <PricingFeature included>Tier 1: Screening rapide</PricingFeature>
              <PricingFeature included>GO/NO-GO en 2 min</PricingFeature>
              <PricingFeature included>Red flags critiques</PricingFeature>
              <PricingFeature>Tier 2: Deep Analysis</PricingFeature>
              <PricingFeature>Tier 3: Expert Sectoriel</PricingFeature>
              <PricingFeature>AI Board (4 LLMs)</PricingFeature>
            </ul>
            {!isPro && (
              <Button variant="outline" className="w-full" disabled>
                Plan actuel
              </Button>
            )}
          </CardContent>
        </Card>

        {/* PRO Plan */}
        <Card className={isPro ? "ring-2 ring-primary" : "ring-2 ring-amber-500"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                PRO
              </CardTitle>
              {isPro ? (
                <Badge>Plan actuel</Badge>
              ) : (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">
                  Recommandé
                </Badge>
              )}
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold">249 €</span>
              <span className="text-muted-foreground">/mois</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pour les BA sérieux qui veulent un edge
            </p>
            <ul className="space-y-3">
              <PricingFeature included>Deals illimités</PricingFeature>
              <PricingFeature included>Tier 1: Screening rapide</PricingFeature>
              <PricingFeature included>Tier 2: Deep Analysis</PricingFeature>
              <PricingFeature included>Tier 3: Expert Sectoriel</PricingFeature>
              <PricingFeature included>AI Board (5 sessions/mois)</PricingFeature>
              <PricingFeature included>Questions pour fondateurs</PricingFeature>
              <PricingFeature included>Arguments de négo chiffrés</PricingFeature>
            </ul>
            {isPro ? (
              <Button variant="outline" className="w-full" disabled>
                Plan actuel
              </Button>
            ) : (
              <PricingCtaButton variant="card" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tier Explanation Section */}
      <div className="space-y-8 mt-16">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Comprendre les Tiers d&apos;analyse</h2>
          <p className="text-muted-foreground mt-2">
            Chaque tier ajoute une couche d&apos;intelligence supplémentaire
          </p>
        </div>

        {/* Tier 1 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Tier 1: Screening Rapide
                  <Badge variant="secondary">FREE</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">12 agents en parallèle • 2 min</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              <strong>Objectif :</strong> Répondre à la question « Est-ce que je dois regarder ce deal de plus près ? »
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <AgentCard
                icon={<FileSearch className="h-5 w-5" />}
                title="Deck Forensics"
                description="Analyse le pitch deck, détecte les incohérences et claims non supportés"
              />
              <AgentCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="Financial Auditor"
                description="Vérifie les métriques (ARR, growth, unit economics) vs benchmarks"
              />
              <AgentCard
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Red Flag Detector"
                description="Identifie les signaux d'alarme critiques (founder, legal, market)"
              />
              <AgentCard
                icon={<Users className="h-5 w-5" />}
                title="Team Investigator"
                description="Vérifie les profils LinkedIn, track record, complémentarité"
              />
              <AgentCard
                icon={<Target className="h-5 w-5" />}
                title="Market Intelligence"
                description="Taille du marché, timing, tendances macro"
              />
              <AgentCard
                icon={<Shield className="h-5 w-5" />}
                title="+ 7 autres agents"
                description="Competitive intel, legal, cap table, GTM, customer intel..."
              />
            </div>
            <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
              <p className="font-medium text-blue-800">Output Tier 1:</p>
              <p className="text-sm text-blue-700">
                Verdict GO/NO-GO, scores 5 dimensions, red flags avec confidence, questions à poser
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tier 2 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Tier 2: Deep Analysis
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">PRO</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">5 agents de synthèse • +3 min</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              <strong>Objectif :</strong> Aller au-delà du screening - comprendre les nuances et préparer la négo
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <AgentCard
                icon={<Scale className="h-5 w-5" />}
                title="Synthesis Scorer"
                description="Croise les 12 analyses Tier 1, détecte les contradictions, score final pondéré"
              />
              <AgentCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="Scenario Modeler"
                description="Simule 3 scénarios (bear/base/bull) avec projections financières"
              />
              <AgentCard
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Devil&apos;s Advocate"
                description="Challenge systematiquement chaque point positif - trouve les failles"
              />
              <AgentCard
                icon={<Target className="h-5 w-5" />}
                title="Contradiction Detector"
                description="Identifie les incohérences entre ce que dit le founder et les données"
              />
              <AgentCard
                icon={<FileSearch className="h-5 w-5" />}
                title="Memo Generator"
                description="Génère un Investment Memo structuré prêt pour votre décision"
              />
            </div>
            <div className="mt-4 p-4 rounded-lg bg-purple-50 border border-purple-200">
              <p className="font-medium text-purple-800">Output Tier 2:</p>
              <p className="text-sm text-purple-700">
                Investment memo, scénarios chiffrés, points de négo, questions killer pour le founder
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tier 3 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <Lightbulb className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Tier 3: Expert Sectoriel
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">PRO</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">1 expert spécialisé • +2 min</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              <strong>Objectif:</strong> L&apos;avis d&apos;un expert qui connait VRAIMENT le secteur
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <AgentCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="SaaS B2B Expert"
                description="Benchmarks ARR, NRR, CAC payback spécifiques au SaaS"
              />
              <AgentCard
                icon={<Shield className="h-5 w-5" />}
                title="FinTech Expert"
                description="Réglementation, unit economics, comparables du secteur"
              />
              <AgentCard
                icon={<Target className="h-5 w-5" />}
                title="Marketplace Expert"
                description="Take rate, liquidity, chicken-egg problem analysis"
              />
              <AgentCard
                icon={<Users className="h-5 w-5" />}
                title="HealthTech Expert"
                description="Cycles de vente hôpitaux, remboursement, FDA/CE"
              />
              <AgentCard
                icon={<Zap className="h-5 w-5" />}
                title="DeepTech Expert"
                description="Moat technologique, timeline R&D, IP strategy"
              />
              <AgentCard
                icon={<Lightbulb className="h-5 w-5" />}
                title="+ 4 autres experts"
                description="Climate, Hardware, Gaming, Consumer"
              />
            </div>
            <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="font-medium text-green-800">Output Tier 3:</p>
              <p className="text-sm text-green-700">
                Analyse sectorielle profonde, benchmarks specifiques, risques sectoriels, comparables pertinents
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Board */}
        <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  AI Board: Deliberation Multi-LLM
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">PRO</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">4 LLMs TOP délibèrent • 5-10 min</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              <strong>Objectif :</strong> Simuler un comité d&apos;investissement avec 4 perspectives différentes
            </p>

            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <div className="p-4 rounded-lg bg-white border">
                <h4 className="font-semibold mb-2">Les 4 membres du Board</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <span className="text-sm">Claude Opus - Anthropic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="text-sm">GPT-4 Turbo - OpenAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="text-sm">Gemini Ultra - Google</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-violet-500" />
                    <span className="text-sm">Mistral Large - Mistral AI</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white border">
                <h4 className="font-semibold mb-2">Comment ça marche</h4>
                <ol className="text-sm space-y-1 text-muted-foreground">
                  <li>1. Chaque LLM analyse le deal indépendamment</li>
                  <li>2. Ils débattent entre eux (2-3 rounds)</li>
                  <li>3. Ils votent : GO / NO-GO / NEED MORE INFO</li>
                  <li>4. Vous recevez le verdict + arguments</li>
                </ol>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-amber-100 border border-amber-300">
              <p className="font-medium text-amber-800">Output AI Board:</p>
              <p className="text-sm text-amber-700">
                Verdict avec niveau de consensus (unanime/majorité/partagé), points d&apos;accord, points de friction,
                questions killer pour le founder basées sur les désaccords
              </p>
            </div>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              <strong>5 sessions/mois incluses</strong> dans le plan PRO • Sessions supplémentaires : 79 €/session
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA Section */}
      {!isPro && (
        <div className="text-center mt-12 p-8 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <h2 className="text-2xl font-bold mb-2">
            Prêt à investir comme un pro ?
          </h2>
          <p className="text-white/80 mb-6 max-w-lg mx-auto">
            Rejoignez les Business Angels qui ne laissent plus rien au hasard.
            Essayez PRO pendant 30 jours, satisfait ou remboursé.
          </p>
          <PricingCtaButton variant="banner" />
        </div>
      )}
    </div>
  );
}

function PricingFeature({
  children,
  included = false,
}: {
  children: React.ReactNode;
  included?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      {included ? (
        <Check className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      )}
      <span className={!included ? "text-muted-foreground" : ""}>{children}</span>
    </li>
  );
}

function AgentCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-muted-foreground">{icon}</div>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
