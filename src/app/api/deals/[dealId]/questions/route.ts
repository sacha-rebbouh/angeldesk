/**
 * GET /api/deals/[dealId]/questions
 *
 * Returns the open questions surface for a deal so the corpus-ingestion UI can
 * offer "Cet email/note répond à une question (optionnel)" without forcing the
 * client to know the schema of RedFlag.
 *
 * The response is a typed union mirroring the Zod linkedQuestion schema in
 * src/services/documents/text-ingestion.ts:
 *
 *   - { source: "RED_FLAG", redFlagId, questionText, severity, category }
 *     One entry per open or under-investigation RedFlag, using the red flag's
 *     title as the question text. Picking this option creates a strong link
 *     (FK on Document.linkedRedFlagId).
 *
 *   - { source: "QUESTION_TO_ASK", redFlagId, questionText, severity, category, index }
 *     One entry per RedFlag.questionsToAsk[] entry. These don't have a stable
 *     primary key (questionsToAsk is a String[]), so the link snapshots the
 *     question text only and keeps the parent redFlagId as soft metadata.
 *
 * Anti-IDOR: every red flag returned belongs to a deal owned by the requester.
 */

import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/api-error";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";

type RouteParams = {
  params: Promise<{ dealId: string }>;
};

export interface RedFlagQuestionEntry {
  source: "RED_FLAG";
  redFlagId: string;
  questionText: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
}

export interface QuestionToAskEntry {
  source: "QUESTION_TO_ASK";
  redFlagId: string;
  questionText: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  /** Position of the question inside RedFlag.questionsToAsk[] — soft, only useful for the picker. */
  index: number;
}

export type DealQuestionEntry = RedFlagQuestionEntry | QuestionToAskEntry;

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    // Anti-IDOR: confirm the deal belongs to the requester before exposing
    // anything about it.
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const redFlags = await prisma.redFlag.findMany({
      where: {
        dealId,
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      select: {
        id: true,
        title: true,
        severity: true,
        category: true,
        questionsToAsk: true,
      },
    });

    const entries: DealQuestionEntry[] = [];
    for (const flag of redFlags) {
      const title = flag.title?.trim();
      if (title) {
        entries.push({
          source: "RED_FLAG",
          redFlagId: flag.id,
          questionText: title,
          severity: flag.severity,
          category: String(flag.category),
        });
      }
      flag.questionsToAsk.forEach((question, index) => {
        const text = question?.trim();
        if (!text) return;
        entries.push({
          source: "QUESTION_TO_ASK",
          redFlagId: flag.id,
          questionText: text,
          severity: flag.severity,
          category: String(flag.category),
          index,
        });
      });
    }

    return NextResponse.json({ data: entries });
  } catch (error) {
    return handleApiError(error, "list deal questions");
  }
}
