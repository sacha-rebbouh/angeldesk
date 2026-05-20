/**
 * B17.1 — Admin Analysis Debug Console page.
 *
 * Server-component shell:
 *  - requireAdmin() gate
 *  - renders the client-side console which polls /api/admin/analyses/[id]/debug
 *
 * Strictly read-only. No mutation actions exposed.
 */

import { requireAdmin } from "@/lib/auth";
import { AnalysisDebugConsole } from "@/components/admin/analysis-debug-console";

type PageProps = {
  params: Promise<{ analysisId: string }>;
};

export default async function AdminAnalysisDebugPage({ params }: PageProps) {
  await requireAdmin();
  const { analysisId } = await params;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analysis debug</h1>
        <p className="text-sm text-muted-foreground font-mono break-all">{analysisId}</p>
      </div>
      <AnalysisDebugConsole analysisId={analysisId} />
    </div>
  );
}
