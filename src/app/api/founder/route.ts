import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { analyzeFounderLinkedIn, findLinkedInProfile } from "@/services/context-engine/connectors/proxycurl";
import { buildPeopleGraph, type FounderInput } from "@/services/context-engine";
import { handleApiError } from "@/lib/api-error";

const founderSchema = z.object({
  linkedinUrl: z.string().url().optional(),
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  startupSector: z.string().max(200).optional(),
});

/**
 * POST /api/founder - Analyze a single founder via LinkedIn
 *
 * Body:
 * {
 *   linkedinUrl?: string,     // Direct LinkedIn URL (preferred)
 *   firstName?: string,       // For lookup if no URL
 *   lastName?: string,        // For lookup if no URL
 *   startupSector?: string    // For sector fit analysis
 * }
 *
 * Returns:
 * {
 *   profile: { ... },         // LinkedIn profile data
 *   insights: {
 *     totalExperienceYears,
 *     hasNotableCompanyExperience,
 *     notableCompanies,
 *     hasPreviousFounderExperience,
 *     previousVenturesCount,
 *     educationLevel,
 *     networkStrength,
 *     redFlags,
 *     questionsToAsk,
 *     expertise,
 *     sectorFit
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const rateLimit = checkRateLimit(`founder:${user.id}`, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = founderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const { linkedinUrl, firstName, lastName, startupSector } = parsed.data;

    // Validate LinkedIn URL to prevent SSRF
    if (linkedinUrl) {
      try {
        const parsed = new URL(linkedinUrl);
        if (!parsed.hostname.endsWith("linkedin.com")) {
          return NextResponse.json(
            { error: "Only LinkedIn URLs are accepted" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }
    }

    // Get LinkedIn URL - either direct or via lookup
    let finalUrl: string | undefined | null = linkedinUrl;

    if (!finalUrl && firstName && lastName) {
      finalUrl = await findLinkedInProfile(firstName, lastName);
      if (!finalUrl) {
        return NextResponse.json(
          { error: "Could not find LinkedIn profile for this name" },
          { status: 404 }
        );
      }
    }

    if (!finalUrl) {
      return NextResponse.json(
        { error: "Either linkedinUrl or (firstName + lastName) is required" },
        { status: 400 }
      );
    }

    // Analyze the founder
    const result = await analyzeFounderLinkedIn(finalUrl, { startupSector });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch LinkedIn profile" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        linkedinUrl: finalUrl,
        profile: result.profile,
        insights: result.insights,
      },
    });
  } catch (error) {
    return handleApiError(error, "analyze founder");
  }
}

/**
 * POST /api/founder/team - Analyze multiple founders
 *
 * Body:
 * {
 *   founders: [
 *     { name: string, role?: string, linkedinUrl?: string }
 *   ],
 *   startupSector?: string
 * }
 *
 * Returns EnrichedPeopleGraph with:
 * - founders: EnrichedFounderData[]
 * - allQuestionsToAsk: []
 * - teamAssessment: {}
 */
