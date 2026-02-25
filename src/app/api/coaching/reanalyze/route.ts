import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid, checkRateLimit } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  triggerTargetedReanalysis,
  generateDeltaReport,
  identifyImpactedAgents,
} from "@/lib/live/post-call-reanalyzer";
import type { PostCallReport } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// Full list of Tier 1 + Tier 3 agent names for "full" reanalysis mode
// ---------------------------------------------------------------------------

const ALL_AGENT_NAMES = [
  // Tier 1
  "financial-auditor",
  "deck-forensics",
  "team-investigator",
  "market-intelligence",
  "competitive-intel",
  "exit-strategist",
  "tech-stack-dd",
  "tech-ops-dd",
  "legal-regulatory",
  "gtm-analyst",
  "customer-intel",
  "cap-table-auditor",
  "question-master",
  // Tier 3
  "contradiction-detector",
  "synthesis-deal-scorer",
  "devils-advocate",
  "scenario-modeler",
  "memo-generator",
];

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const reanalyzeSchema = z.object({
  sessionId: z.string(),
  mode: z.enum(["delta", "targeted", "full"]),
});

// POST /api/coaching/reanalyze — Trigger post-call re-analysis
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Limit to 3 reanalyze calls per hour per user
    const rateCheck = checkRateLimit(`coaching-reanalyze:${user.id}`, { maxRequests: 3, windowMs: 3600000 });
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
    }

    const body = await request.json();
    const { sessionId, mode } = reanalyzeSchema.parse(body);

    if (!isValidCuid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify session exists, belongs to user, and has valid status
    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
        status: { in: ["completed", "processing"] },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found, access denied, or session not in completed/processing status" },
        { status: 404 }
      );
    }

    if (!session.dealId) {
      return NextResponse.json(
        { error: "Cannot reanalyze a session without an associated deal" },
        { status: 400 }
      );
    }

    // --- Delta mode: lightweight comparison, no agent re-run ---
    if (mode === "delta") {
      const deltaReport = await generateDeltaReport(sessionId, session.dealId);
      return NextResponse.json({ data: deltaReport });
    }

    // --- Targeted mode: identify impacted agents from session summary ---
    if (mode === "targeted") {
      const summary = await prisma.sessionSummary.findUnique({
        where: { sessionId },
      });

      if (!summary) {
        return NextResponse.json(
          { error: "Post-call report not generated yet. Wait for processing to complete." },
          { status: 400 }
        );
      }

      // Reconstruct a PostCallReport from the summary data
      const postCallReport: PostCallReport = {
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints as PostCallReport["keyPoints"],
        actionItems: summary.actionItems as PostCallReport["actionItems"],
        newInformation: summary.newInformation as PostCallReport["newInformation"],
        contradictions: summary.contradictions as PostCallReport["contradictions"],
        questionsAsked: summary.questionsAsked as PostCallReport["questionsAsked"],
        remainingQuestions: summary.remainingQuestions as PostCallReport["remainingQuestions"],
        confidenceDelta: summary.confidenceDelta as PostCallReport["confidenceDelta"],
        sessionStats: summary.sessionStats as PostCallReport["sessionStats"],
      };

      const agentNames = identifyImpactedAgents(postCallReport);

      await triggerTargetedReanalysis(session.dealId, agentNames, sessionId);

      // Fetch the created analysis to return its ID
      const analysis = await prisma.analysis.findFirst({
        where: {
          dealId: session.dealId,
          mode: "post_call_reanalysis",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      return NextResponse.json({
        data: {
          agents: agentNames,
          analysisId: analysis?.id ?? null,
        },
      });
    }

    // --- Full mode: re-run all agents ---
    await triggerTargetedReanalysis(session.dealId, ALL_AGENT_NAMES, sessionId);

    // Fetch the created analysis to return its ID
    const analysis = await prisma.analysis.findFirst({
      where: {
        dealId: session.dealId,
        mode: "post_call_reanalysis",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    return NextResponse.json({
      data: {
        agents: ALL_AGENT_NAMES,
        analysisId: analysis?.id ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "trigger post-call reanalysis");
  }
}
