import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateOrUnauthorized } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/api-error";
import { getDocumentExtractionProgress } from "@/services/documents/extraction-progress";

const progressIdSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ progressId: string }>;
};

export async function GET(_request: NextRequest, context: RouteParams) {
  // B11.3.1 (Codex P2) — explicit 401 contract.
  const auth = await authenticateOrUnauthorized();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const { progressId } = await context.params;
    const idCheck = progressIdSchema.safeParse(progressId);
    if (!idCheck.success) {
      return NextResponse.json({ error: "Invalid progress ID" }, { status: 400 });
    }

    const progress = await getDocumentExtractionProgress(progressId);
    if (!progress) {
      return NextResponse.json({ data: null });
    }
    if (progress.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ data: progress });
  } catch (error) {
    return handleApiError(error, "fetch document extraction progress");
  }
}
