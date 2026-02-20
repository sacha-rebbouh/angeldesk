import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { extractTermsFromDocument } from "@/services/term-sheet-extractor";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

const extractBodySchema = z.object({
  documentId: z.string(),
});

// POST /api/deals/[dealId]/terms/extract — Extract terms from a document via LLM
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const body = extractBodySchema.parse(await request.json());

    // Verify deal ownership + load document
    const [deal, document] = await Promise.all([
      prisma.deal.findFirst({
        where: { id: dealId, userId: user.id },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { id: body.documentId, dealId },
        select: { id: true, name: true, type: true, extractedText: true },
      }),
    ]);

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (!document.extractedText) {
      return NextResponse.json(
        { error: "Document has no extracted text. Upload and process the document first." },
        { status: 400 }
      );
    }

    const result = await extractTermsFromDocument({
      documentText: document.extractedText,
      documentName: document.name,
    });

    return NextResponse.json({
      suggestions: result,
      confidence: result.confidence,
      documentName: document.name,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/deals/[dealId]/terms/extract");
  }
}
