export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ExternalLink, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

async function getDeals(userId: string) {
  return prisma.deal.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      documents: {
        select: { id: true },
      },
      redFlags: {
        where: { status: "OPEN" },
        select: { severity: true },
      },
    },
  });
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Passe",
    INVESTED: "Investi",
    ARCHIVED: "Archive",
  };
  return labels[status] ?? status;
}

function getStageLabel(stage: string | null) {
  if (!stage) return "-";
  const labels: Record<string, string> = {
    PRE_SEED: "Pre-seed",
    SEED: "Seed",
    SERIES_A: "Serie A",
    SERIES_B: "Serie B",
    SERIES_C: "Serie C",
    LATER: "Later Stage",
  };
  return labels[stage] ?? stage;
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DealsPage() {
  const user = await requireAuth();
  const deals = await getDeals(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals</h1>
          <p className="text-muted-foreground">
            Gerez et analysez vos opportunites d&apos;investissement
          </p>
        </div>
        <Button asChild>
          <Link href="/deals/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau deal
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tous les deals</CardTitle>
          <CardDescription>
            {deals.length} deal{deals.length !== 1 ? "s" : ""} au total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <h3 className="mt-4 text-lg font-semibold">Aucun deal</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Commencez par ajouter votre premier deal a analyser.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/deals/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un deal
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Secteur</TableHead>
                  <TableHead>Stade</TableHead>
                  <TableHead>Valorisation</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead>Mis a jour</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => {
                  const criticalFlags = deal.redFlags.filter(
                    (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
                  ).length;

                  return (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/deals/${deal.id}`}
                          className="hover:underline"
                        >
                          {deal.name}
                        </Link>
                        {deal.website && (
                          <a
                            href={deal.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 inline-flex"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>{deal.sector ?? "-"}</TableCell>
                      <TableCell>{getStageLabel(deal.stage)}</TableCell>
                      <TableCell>
                        {formatCurrency(
                          deal.valuationPre ? Number(deal.valuationPre) : null
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(deal.status)}
                        >
                          {getStatusLabel(deal.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {criticalFlags > 0 ? (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{criticalFlags}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(deal.updatedAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/deals/${deal.id}`}>Voir</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
