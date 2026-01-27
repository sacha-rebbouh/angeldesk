export const dynamic = "force-dynamic";

import { requireAuth, isAdmin as checkIsAdmin } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Shield, CreditCard } from "lucide-react";
import { InvestmentPreferencesForm } from "@/components/settings/investment-preferences-form";

export default async function SettingsPage() {
  const [user, isAdmin] = await Promise.all([requireAuth(), checkIsAdmin()]);

  const isPro = user.subscriptionStatus === "PRO" || isAdmin;

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

        {/* Subscription Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Abonnement
            </CardTitle>
            <CardDescription>
              Détails de votre plan actuel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Plan actuel</span>
              <Badge
                variant="secondary"
                className={isPro ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}
              >
                {isPro ? "Pro" : "Gratuit"}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Analyses par mois</span>
              <span className="text-sm font-medium">{isPro ? "Illimité" : "3"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Investment Preferences */}
        <InvestmentPreferencesForm />
      </div>
    </div>
  );
}
