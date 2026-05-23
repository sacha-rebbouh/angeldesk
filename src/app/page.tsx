import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Shield,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Users,
  Brain,
  Layers,
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
            <span className="text-xl font-bold tracking-tight">Angel Desk</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Connexion</Link>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-sm" asChild>
              <Link href="/register">
                Se créer un compte
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
                Copilote analytique
              </Badge>
            </div>

            {/* Main Heading */}
            <div className="space-y-6 animate-slide-up">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl text-balance">
                Le copilote analytique
                <br />
                des <span className="gradient-text-primary">investisseurs privés</span>.
              </h1>
              <p className="mx-auto max-w-[680px] text-lg text-muted-foreground md:text-xl leading-relaxed">
                Qualifier les preuves disponibles, exposer les contradictions détectées,
                structurer les signaux, matérialiser les zones d&apos;incertitude.
                <span className="font-medium text-foreground"> La décision reste à l&apos;investisseur.</span>
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-4 sm:flex-row animate-slide-up delay-150">
              <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-md hover:shadow-lg transition-all text-base px-8" asChild>
                <Link href="/register">
                  <Brain className="mr-2 h-5 w-5" />
                  Accéder à la plateforme
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="text-base px-8 shadow-sm" asChild>
                <Link href="#features">Découvrir la plateforme</Link>
              </Button>
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
                Un environnement analytique pour décider sous incertitude.
              </p>
            </div>

            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              {/* Feature 1 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 transition-transform group-hover:scale-110">
                  <Layers className="h-7 w-7 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Analyse structurée du dossier</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Uploadez le deck et les documents disponibles. Les éléments sont extraits,
                  recoupés et structurés en signaux exploitables.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 transition-transform group-hover:scale-110">
                  <TrendingUp className="h-7 w-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Mise en perspective des éléments disponibles</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Les déclarations du deck sont confrontées aux données comparables disponibles,
                  avec source, date et fiabilité explicites.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group relative rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-ring/30">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 transition-transform group-hover:scale-110">
                  <Shield className="h-7 w-7 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Signaux d&apos;alerte sourcés</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Chaque signal d&apos;alerte est rattaché à sa source, sa date disponible
                  ou l&apos;absence de date explicitée, et sa fiabilité.
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
                Trois étapes pour structurer une décision sous incertitude.
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
                  <h3 className="text-lg font-semibold mb-2">L&apos;analyse</h3>
                  <p className="text-muted-foreground text-sm">
                    Le dossier est passé au crible en parallèle.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative text-center">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-lg shadow-md">
                    3
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Décidez</h3>
                  <p className="text-muted-foreground text-sm">
                    Recevez votre briefing : signaux clés, comparables, signaux d&apos;alerte et questions prioritaires.
                  </p>
                </div>
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
                  Analyser un dossier
                </h2>
                <p className="text-white/90 mb-8 max-w-xl mx-auto text-lg">
                  Pour les investisseurs privés et équipes d&apos;investissement légères.
                </p>
                <Button size="lg" variant="secondary" className="text-amber-600 font-semibold shadow-md hover:shadow-lg transition-all text-base px-8" asChild>
                  <Link href="/register">
                    Se créer un compte
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
              <span className="font-semibold">Angel Desk</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Angel Desk. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
