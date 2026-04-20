import { requireAdmin } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminCorpusBackfillClient } from "@/components/admin/admin-corpus-backfill-client";
import { AdminCorpusIntegrityClient } from "@/components/admin/admin-corpus-integrity-client";

export default async function AdminCorpusBackfillPage() {
  await requireAdmin();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin — Backfill corpus snapshots</h1>
        <p className="mt-1 text-muted-foreground">
          Santé canonique + preview et lancement batch du backfill des snapshots via{" "}
          <code>/api/admin/corpus/*</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Intégrité canonique</CardTitle>
          <CardDescription>
            Mesure l’état réel de la migration snapshot-first: alignement thèse/analyse,
            reliquats legacy et drift éventuel entre snapshot et champs de compat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminCorpusIntegrityClient />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidats au backfill corpus</CardTitle>
          <CardDescription>
            Cette page reste purement UI: elle interroge l&apos;API admin pour prévisualiser les deals à
            rattacher à un snapshot canonique, puis déclenche les batches depuis la même route.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminCorpusBackfillClient />
        </CardContent>
      </Card>
    </div>
  );
}
