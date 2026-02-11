import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { buildPeopleGraph, type FounderInput } from "@/services/context-engine";
import { handleApiError } from "@/lib/api-error";

const teamSchema = z.object({
  founders: z.array(z.object({
    name: z.string().min(1).max(200),
    role: z.string().max(200).optional(),
    linkedinUrl: z.string().url().optional(),
  })).min(1).max(20),
  startupSector: z.string().max(200).optional(),
});

/**
 * POST /api/founder/team - Analyze a founding team
 *
 * Body:
 * {
 *   founders: [
 *     { name: string, role?: string, linkedinUrl?: string }
 *   ],
 *   startupSector?: string
 * }
 *
 * Returns EnrichedPeopleGraph:
 * {
 *   founders: EnrichedFounderData[],
 *   teamSize: number,
 *   allQuestionsToAsk: [{ founderName, question, context, priority }],
 *   teamAssessment: {
 *     hasFounderExperience,
 *     hasNotableCompanyExperience,
 *     hasSectorExpertise,
 *     hasComplementarySkills,
 *     coverageGaps
 *   }
 * }
 *
 * Cost: ~$0.01 per founder (Proxycurl API)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const rateLimit = checkRateLimit(`founder-team:${user.id}`, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = teamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const { founders, startupSector } = parsed.data;

    // Convert to FounderInput format
    const founderInputs: FounderInput[] = founders.map((f) => ({
      name: f.name,
      role: f.role,
      linkedinUrl: f.linkedinUrl,
    }));

    // Build the people graph
    const peopleGraph = await buildPeopleGraph(founderInputs, {
      startupSector,
    });

    return NextResponse.json({
      data: peopleGraph,
      meta: {
        foundersAnalyzed: peopleGraph.founders.length,
        foundersWithLinkedIn: peopleGraph.founders.filter(
          (f) => f.verificationStatus === "verified"
        ).length,
        questionsGenerated: peopleGraph.allQuestionsToAsk.length,
        estimatedCost: `$${(founderInputs.length * 0.01).toFixed(2)}`,
      },
    });
  } catch (error) {
    return handleApiError(error, "analyze founding team");
  }
}
