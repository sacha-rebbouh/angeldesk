export const dynamic = "force-dynamic";

import { requireAuth, isAdmin as checkIsAdmin } from "@/lib/auth";
import { getCreditBalance } from "@/services/credits";
import { FEATURE_ACCESS } from "@/services/credits/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Shield, Coins, Check, Lock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { InvestmentPreferencesForm } from "@/components/settings/investment-preferences-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";

export default async function SettingsPage() {
  const [user, isAdmin] = await Promise.all([requireAuth(), checkIsAdmin()]);

  const creditBalance = await getCreditBalance(user.id);

  const features = [
    { label: "Quick Scan", unlocked: true },
    { label: "Deep Dive", unlocked: true },
    { label: "AI Board", unlocked: true },
    {
      label: "Négociation",
      unlocked: creditBalance.totalPurchased >= FEATURE_ACCESS.negotiation.minTotalPurchased,
      requirement: `${FEATURE_ACCESS.negotiation.minTotalPurchased} crédits achetés`,
    },
    {
      label: "API",
      unlocked: creditBalance.totalPurchased >= FEATURE_ACCESS.api.minTotalPurchased || isAdmin,
      requirement: `${FEATURE_ACCESS.api.minTotalPurchased} crédits achetés`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">
          Gérez votre compte et vos préférences d&apos;investissement
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profil
            </CardTitle>
            <CardDescription>
              Informations de votre compte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Email</span>
              </div>
              <span className="text-sm font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Nom</span>
              </div>
              <span className="text-sm font-medium">{user.name || "Non renseigné"}</span>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Rôle</span>
                </div>
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  Administrateur
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credits Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Crédits
            </CardTitle>
            <CardDescription>
              Votre solde et fonctionnalités débloquées
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Solde actuel</span>
              <Badge
                variant="secondary"
                className={
                  creditBalance.balance > 10
                    ? "bg-emerald-100 text-emerald-800"
                    : creditBalance.balance > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-800"
                }
              >
                {creditBalance.balance} crédit{creditBalance.balance !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Total acheté</span>
              <span className="text-sm font-medium">{creditBalance.totalPurchased} crédits</span>
            </div>
            {creditBalance.lastPackName && (
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Dernier pack</span>
                <span className="text-sm font-medium capitalize">{creditBalance.lastPackName}</span>
              </div>
            )}

            {/* Feature access */}
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Fonctionnalités
              </p>
              <div className="space-y-2">
                {features.map(({ label, unlocked, requirement }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      {unlocked ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={unlocked ? "" : "text-muted-foreground"}>{label}</span>
                    </div>
                    {!unlocked && requirement && (
                      <span className="text-xs text-muted-foreground">{requirement}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="pt-2">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <Coins className="h-4 w-4" />
                Acheter des crédits &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Investment Preferences */}
        <InvestmentPreferencesForm />

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Actions irréversibles sur votre compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              La suppression de votre compte est définitive. Tous vos deals,
              analyses, documents et crédits seront supprimés.
            </p>
            <DeleteAccountButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
