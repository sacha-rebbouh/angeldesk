import { unstable_noStore as noStore } from "next/cache";
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
import { Plus } from "lucide-react";
import { DealsViewToggle } from "@/components/deals/deals-view-toggle";
import {
  loadCanonicalDealSignals,
  resolveCanonicalDealFields,
} from "@/services/deals/canonical-read-model";

// Bound the number of deals materialized server-side (each one resolves
// canonical signals). The header still shows the true total via a cheap count.
const DEALS_PAGE_CAP = 200;

async function getDeals(userId: string) {
  noStore();
  const [deals, totalCount] = await Promise.all([
    prisma.deal.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: DEALS_PAGE_CAP,
      include: {
        documents: {
          select: { id: true },
        },
        redFlags: {
          where: { status: "OPEN" },
          select: { severity: true, title: true },
        },
      },
    }),
    prisma.deal.count({ where: { userId } }),
  ]);

  const signals = await loadCanonicalDealSignals(deals.map((deal) => deal.id));

  const items = deals.map((deal) => {
    const canonicalFields = resolveCanonicalDealFields(deal.id, signals, {
      companyName: deal.companyName,
      website: deal.website,
      arr: deal.arr != null ? Number(deal.arr) : null,
      growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
      amountRequested:
        deal.amountRequested != null ? Number(deal.amountRequested) : null,
      valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
      sector: deal.sector,
      stage: deal.stage,
      instrument: deal.instrument,
      geography: deal.geography,
      description: deal.description,
      globalScore: deal.globalScore,
      teamScore: deal.teamScore,
      marketScore: deal.marketScore,
      productScore: deal.productScore,
      financialsScore: deal.financialsScore,
    });

    return {
      ...deal,
      ...canonicalFields,
      thesisVerdict:
        signals.latestThesisByDealId.get(deal.id)?.verdict ?? null,
    };
  });

  return { deals: items, totalCount };
}

export default async function DealsPage() {
  const user = await requireAuth();
  const { deals, totalCount } = await getDeals(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals</h1>
          <p className="text-muted-foreground">
            Gérez et analysez vos opportunités d&apos;investissement
          </p>
        </div>
        <Button asChild>
          <Link href="/deals/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau deal
          </Link>
        </Button>
      </div>

      {totalCount === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <h3 className="mt-4 text-lg font-semibold">Aucun deal</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Commencez par ajouter votre premier deal à analyser.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/deals/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un deal
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Tous les deals</CardTitle>
                <CardDescription>
                  {totalCount} deal{totalCount !== 1 ? "s" : ""} au total
                  {totalCount > deals.length
                    ? ` · ${deals.length} affichés`
                    : ""}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DealsViewToggle deals={deals} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
