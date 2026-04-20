import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { getCorpusIntegrityOverview } from "@/services/corpus/integrity";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const overview = await getCorpusIntegrityOverview();

    return NextResponse.json({
      data: {
        admin: { id: admin.id },
        ...overview,
      },
    });
  } catch (error) {
    return handleApiError(error, "load corpus integrity overview");
  }
}
