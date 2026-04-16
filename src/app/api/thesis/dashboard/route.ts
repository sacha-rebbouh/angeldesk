/**
 * GET /api/thesis/dashboard
 *
 * Dashboard cross-deals : liste des theses du user avec filtres.
 * Filtres : verdict, sector, stage, search, sortBy, sortDir, take, skip.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import type { ThesisDashboardFilters } from "@/services/thesis";
import type { ThesisVerdict } from "@/agents/thesis/types";

const VALID_VERDICTS: ReadonlySet<string> = new Set([
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
  "all",
]);

const VALID_SORTS: ReadonlySet<string> = new Set(["createdAt", "confidence", "verdict"]);

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(request.url);
    const params = url.searchParams;

    const verdictRaw = params.get("verdict") ?? "all";
    const verdict = (VALID_VERDICTS.has(verdictRaw) ? verdictRaw : "all") as ThesisVerdict | "all";
    const sector = params.get("sector") ?? undefined;
    const stage = params.get("stage") ?? undefined;
    const search = params.get("search") ?? undefined;
    const sortByRaw = params.get("sortBy") ?? "createdAt";
    const sortBy = (VALID_SORTS.has(sortByRaw) ? sortByRaw : "createdAt") as ThesisDashboardFilters["sortBy"];
    const sortDirRaw = params.get("sortDir") ?? "desc";
    const sortDir = (sortDirRaw === "asc" ? "asc" : "desc") as ThesisDashboardFilters["sortDir"];
    const take = Math.min(100, Math.max(1, Number.parseInt(params.get("take") ?? "50", 10) || 50));
    const skip = Math.max(0, Number.parseInt(params.get("skip") ?? "0", 10) || 0);

    const result = await thesisService.listDashboard({
      userId: user.id,
      verdict,
      sector: sector === "all" ? undefined : sector,
      stage: stage === "all" ? undefined : stage,
      search,
      sortBy,
      sortDir,
      take,
      skip,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, "thesis dashboard");
  }
}
