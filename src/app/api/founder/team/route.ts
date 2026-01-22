import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildPeopleGraph, type FounderInput } from "@/services/context-engine";

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
    await requireAuth();

    const body = await request.json();
    const { founders, startupSector } = body;

    // Validate input
    if (!founders || !Array.isArray(founders) || founders.length === 0) {
      return NextResponse.json(
        { error: "founders array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate each founder has at least a name
    for (const founder of founders) {
      if (!founder.name || typeof founder.name !== "string") {
        return NextResponse.json(
          { error: "Each founder must have a name" },
          { status: 400 }
        );
      }
    }

    // Convert to FounderInput format
    const founderInputs: FounderInput[] = founders.map((f: {
      name: string;
      role?: string;
      linkedinUrl?: string;
    }) => ({
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
    console.error("Error analyzing founding team:", error);
    return NextResponse.json(
      { error: "Failed to analyze founding team" },
      { status: 500 }
    );
  }
}
