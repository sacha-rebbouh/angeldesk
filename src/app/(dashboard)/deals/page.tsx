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
import { DealsTable } from "@/components/deals/deals-table";

async function getDeals(userId: string) {
  noStore();
  const deals = await prisma.deal.findMany({
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

  // Serialize Decimal fields for client component
  return deals.map((deal) => ({
    ...deal,
    valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
  }));
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
                Commencez par ajouter votre premier deal à analyser.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/deals/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un deal
                </Link>
              </Button>
            </div>
          ) : (
            <DealsTable deals={deals} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
