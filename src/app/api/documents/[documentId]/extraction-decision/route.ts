import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { createExtractionOverride } from "@/services/documents/extraction-runs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

const decisionSchema = z.object({
  runId: z.string().cuid(),
  pageNumber: z.number().int().positive().nullable().optional(),
  action: z.enum(["BYPASS_PAGE", "EXCLUDE_PAGE"]),
  reason: z.string().trim().min(12, "A concrete reason is required"),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { documentId } = await context.params;

    if (!isValidCuid(documentId)) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    const body = decisionSchema.parse(await request.json());

    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        dealId: true,
        extractionRuns: {
          where: { id: body.runId },
          select: { id: true, pages: { select: { pageNumber: true } } },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const run = document.extractionRuns[0];
    if (!run) {
      return NextResponse.json({ error: "Extraction run not found for this document" }, { status: 404 });
    }

    if (body.pageNumber !== undefined && body.pageNumber !== null) {
      const pageExists = run.pages.some((page) => page.pageNumber === body.pageNumber);
      if (!pageExists) {
        return NextResponse.json({ error: "Page number does not exist in this extraction run" }, { status: 400 });
      }
    }

    const override = await createExtractionOverride({
      runId: body.runId,
      userId: user.id,
      pageNumber: body.pageNumber ?? null,
      overrideType: body.action,
      reason: body.reason,
      payload: buildOverridePayload(body),
    });

    return NextResponse.json({ data: override });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    return handleApiError(error, "record extraction decision");
  }
}

function buildOverridePayload(body: z.infer<typeof decisionSchema>): Prisma.InputJsonValue {
  return {
    type: body.action === "BYPASS_PAGE" ? "bypass_page" : "exclude_page",
    acknowledgedRisk: true,
  };
}
