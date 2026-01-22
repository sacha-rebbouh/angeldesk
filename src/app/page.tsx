export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CheckCircle,
  Clock,
  Shield,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Users,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm transition-transform group-hover:scale-105">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">FullInvest</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Connexion</Link>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-sm" asChild>
              <Link href="/register">
                Commencer gratuitement
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-pattern-dots opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 via-transparent to-transparent" />

          <div className="container relative flex flex-col items-center gap-10 py-24 text-center md:py-32 lg:py-40">
            {/* Badge */}
            <div className="animate-fade-in">
              <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium shadow-sm">
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                La DD VC accessible aux Business Angels
              </Badge>
            </div>

            {/* Main Heading */}
            <div className="space-y-6 animate-slide-up">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl text-balance">
                L&apos;analyse qu&apos;un fonds VC
                <br />
                ferait en <span className="relative">
                  <span className="gradient-text-primary">2 jours</span>
                  <svg className="absolute -bottom-2 left-0 w-full" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
                    <path d="M0 7 Q 25 0, 50 7 T 100 7" stroke="url(#gradient)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="oklch(0.72 0.18 55)" />
                        <stop offset="100%" stopColor="oklch(0.62 0.20 40)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>.
                <br />
                <span className="text-muted-foreground/80">En 5 minutes.</span>
              </h1>
              <p className="mx-auto max-w-[680px] text-lg text-muted-foreground md:text-xl leading-relaxed">
                50+ deals comparables, red flags détectés automatiquement, questions à poser au fondateur.
                <span className="font-medium text-foreground"> Investissez avec confiance.</span>
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-4 sm:flex-row animate-slide-up delay-150">
              <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-md hover:shadow-lg transition-all text-base px-8" asChild>
                <Link href="/register">
                  <Brain className="mr-2 h-5 w-5" />
                  Analyser mon premier deal
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 shadow-sm" asChild>
                <Link href="#features">Découvrir la plateforme</Link>
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-muted-foreground animate-fade-in delay-300">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Aucune carte requise</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>5 analyses gratuites</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Résultats en 2 minutes</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="border-t bg-muted/30">
          <div className="container py-24 md:py-32">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
                Ce qui vous attend
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Une due diligence complète, comme si vous aviez une équipe d&apos;analystes à votre disposition.
              </p>
            </div>

            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              {/* Feature 1 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 transition-transform group-hover:scale-110">
                  <Clock className="h-7 w-7 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">5 minutes chrono</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Uploadez votre deck et recevez une analyse complète. Pas de formulaires interminables, pas d&apos;attente.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 transition-transform group-hover:scale-110">
                  <TrendingUp className="h-7 w-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">50+ comparables</h3>
                <p className="text-muted-foreground leading-relaxed">
                  La valorisation est-elle correcte ? Comparez avec notre base de 50K+ deals pour le savoir instantanément.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 transition-transform group-hover:scale-110">
                  <Shield className="h-7 w-7 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Zéro faux positifs</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Chaque red flag a un score de confiance supérieur à 80%. Que du signal, pas de bruit.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section className="border-t">
          <div className="container py-24 md:py-32">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
                Comment ça marche
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Trois étapes simples pour transformer votre façon d&apos;investir.
              </p>
            </div>

            <div className="mx-auto max-w-4xl">
              <div className="grid gap-8 md:grid-cols-3">
                {/* Step 1 */}
                <div className="relative text-center">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-lg shadow-md">
                    1
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Créez un deal</h3>
                  <p className="text-muted-foreground text-sm">
                    Uploadez le pitch deck ou renseignez les informations de base.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative text-center">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-lg shadow-md">
                    2
                  </div>
                  <h3 className="text-lg font-semibold mb-2">L&apos;IA analyse</h3>
                  <p className="text-muted-foreground text-sm">
                    12 agents spécialisés passent le deal au crible en parallèle.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative text-center">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-lg shadow-md">
                    3
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Décidez</h3>
                  <p className="text-muted-foreground text-sm">
                    Recevez votre verdict avec scores, red flags et questions à poser.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="border-t bg-muted/30">
          <div className="container py-16">
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-center">
              <div>
                <div className="text-3xl font-bold gradient-text-primary">50K+</div>
                <div className="text-sm text-muted-foreground">Deals dans notre base</div>
              </div>
              <div className="h-12 w-px bg-border hidden sm:block" />
              <div>
                <div className="text-3xl font-bold gradient-text-primary">27</div>
                <div className="text-sm text-muted-foreground">Agents IA spécialisés</div>
              </div>
              <div className="h-12 w-px bg-border hidden sm:block" />
              <div>
                <div className="text-3xl font-bold gradient-text-primary">2 min</div>
                <div className="text-sm text-muted-foreground">Temps d&apos;analyse moyen</div>
              </div>
              <div className="h-12 w-px bg-border hidden sm:block" />
              <div>
                <div className="text-3xl font-bold gradient-text-primary">80%+</div>
                <div className="text-sm text-muted-foreground">Confidence minimum</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t">
          <div className="container py-24 md:py-32">
            <div className="relative mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-12 text-center text-white shadow-xl overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10" />
              <div className="absolute bottom-0 left-0 -mb-12 -ml-12 h-40 w-40 rounded-full bg-white/10" />

              <div className="relative">
                <Users className="mx-auto h-12 w-12 mb-6 opacity-90" />
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4 text-balance">
                  Prêt à investir comme un pro ?
                </h2>
                <p className="text-white/90 mb-8 max-w-xl mx-auto text-lg">
                  Rejoignez les Business Angels qui ne laissent plus rien au hasard.
                  Essayez gratuitement, sans engagement.
                </p>
                <Button size="lg" variant="secondary" className="text-amber-600 font-semibold shadow-md hover:shadow-lg transition-all text-base px-8" asChild>
                  <Link href="/register">
                    Créer un compte gratuit
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container py-12">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold">FullInvest</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} FullInvest. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
