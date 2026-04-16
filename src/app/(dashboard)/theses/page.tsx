import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { thesisService } from "@/services/thesis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RECOMMENDATION_CONFIG } from "@/lib/ui-configs";

/**
 * Dashboard cross-deals des theses — thesis-first architecture.
 *
 * Liste toutes les theses du BA (version latest de chaque deal), filtrables
 * par verdict / sector / stage. Server component avec filtres via searchParams.
 */

interface PageProps {
  searchParams: Promise<{
    verdict?: string;
    sector?: string;
    stage?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}

export default async function ThesesDashboardPage({ searchParams }: PageProps) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const { rows, total } = await thesisService.listDashboard({
    userId: user.id,
    verdict: (params.verdict as "all" | undefined) ?? "all",
    sector: params.sector,
    stage: params.stage,
    search: params.search,
    sortBy: (params.sortBy as "createdAt" | "confidence" | "verdict" | undefined) ?? "createdAt",
    sortDir: (params.sortDir as "asc" | "desc" | undefined) ?? "desc",
    take: 50,
  });

  const verdictCounts = rows.reduce(
    (acc, r) => {
      acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mes thèses d&apos;investissement</h1>
        <p className="text-muted-foreground mt-1">
          {total} deal{total > 1 ? "s" : ""} avec thèse analysée. Le verdict est la synthèse worst-of-3 des frameworks YC / Thiel / Angel Desk.
        </p>
      </div>

      {/* Counts par verdict */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"] as const).map((v) => {
          const cfg = RECOMMENDATION_CONFIG[v];
          const count = verdictCounts[v] ?? 0;
          return (
            <Card key={v} className={`border ${cfg.bg}`}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-slate-600 uppercase mb-1">{cfg.label}</p>
                <p className="text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Liste */}
      <Card>
        <CardHeader>
          <CardTitle>Thèses analysées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune thèse analysée. Lancez un Deep Dive pour commencer.
            </p>
          )}
          {rows.map((row) => {
            const cfg = RECOMMENDATION_CONFIG[row.verdict] ?? RECOMMENDATION_CONFIG.contrasted;
            return (
              <Link
                key={row.thesisId}
                href={`/deals/${row.dealId}`}
                className="block border rounded-lg p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900">{row.dealName}</h3>
                      {row.dealSector && <span className="text-xs text-muted-foreground">· {row.dealSector}</span>}
                      {row.dealStage && <span className="text-xs text-muted-foreground">· {row.dealStage}</span>}
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{row.reformulated}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={cfg.color} variant="outline">
                      {cfg.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Confiance {row.confidence}/100
                    </span>
                    {row.decision && (
                      <span className="text-xs text-slate-500">
                        {row.decision === "stop" ? "Arrêtée" : row.decision === "continue" ? "Continuée" : "Contestée"}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
