/**
 * Admin page /admin/thesis — backfill these pour deals pre-migration.
 *
 * Liste les deals sans these persistee, permet de declencher la re-extraction
 * pour chacun (2cr facturees a l'admin, pas au BA proprio).
 */

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminThesisBackfillClient } from "@/components/admin/admin-thesis-backfill-client";

async function getBackfillCandidates() {
  noStore();
  const deals = await prisma.deal.findMany({
    where: {
      theses: { none: {} },
    },
    select: {
      id: true,
      name: true,
      companyName: true,
      sector: true,
      stage: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { documents: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return deals.map((d) => ({
    id: d.id,
    name: d.name,
    companyName: d.companyName,
    sector: d.sector,
    stage: d.stage,
    userId: d.userId,
    documentCount: d._count.documents,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export default async function AdminThesisBackfillPage() {
  await requireAdmin();
  const candidates = await getBackfillCandidates();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin — Backfill thèse</h1>
        <p className="text-muted-foreground mt-1">
          Deals sans thèse extraite (pre-migration thesis-first). Relancer la re-extraction
          coûte <strong>2 crédits</strong> facturés sur le compte admin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Candidats au backfill ({candidates.length})</CardTitle>
          <CardDescription>
            Ces deals datent d&apos;avant le rollout thesis-first. Le BA verra le badge
            &quot;Thèse non analysée&quot; jusqu&apos;à ce qu&apos;un backfill soit declenche.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminThesisBackfillClient candidates={candidates} />
        </CardContent>
      </Card>
    </div>
  );
}
