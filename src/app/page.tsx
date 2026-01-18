export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <BarChart3 className="h-6 w-6" />
            <span className="font-bold">FullInvest</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Connexion</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Commencer</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container flex flex-col items-center gap-8 py-24 text-center md:py-32">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
              La DD d&apos;un fonds VC,
              <br />
              <span className="text-primary">accessible a vous.</span>
            </h1>
            <p className="mx-auto max-w-[700px] text-lg text-muted-foreground md:text-xl">
              En 5 minutes, obtenez l&apos;analyse qu&apos;un analyste VC ferait
              en 2 jours. 50+ deals comparables, red flags detectes, questions a
              poser.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">Analyser mon premier deal</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#features">En savoir plus</Link>
            </Button>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="container py-24">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold">5 minutes</h3>
              <p className="text-muted-foreground">
                Uploadez votre deck, obtenez une analyse complete. Pas de
                formulaires interminables.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold">50+ comparables</h3>
              <p className="text-muted-foreground">
                Sachez si la valorisation est bonne grace a notre base de 50K+
                deals.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Zero faux positifs</h3>
              <p className="text-muted-foreground">
                Chaque red flag a un score de confiance &gt;80%. Pas de bruit,
                que du signal.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t bg-muted/50">
          <div className="container flex flex-col items-center gap-8 py-24 text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              Pret a investir plus intelligemment?
            </h2>
            <p className="max-w-[600px] text-muted-foreground">
              Rejoignez les Business Angels qui utilisent FullInvest pour
              prendre des decisions eclairees.
            </p>
            <Button size="lg" asChild>
              <Link href="/register">Creer un compte gratuit</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span className="font-semibold">FullInvest</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} FullInvest. Tous droits reserves.
          </p>
        </div>
      </footer>
    </div>
  );
}
