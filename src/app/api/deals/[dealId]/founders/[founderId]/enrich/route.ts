import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  analyzeFounderLinkedIn,
  isApifyLinkedInConfigured,
} from "@/services/context-engine/connectors/apify-linkedin";

interface RouteParams {
  params: Promise<{ dealId: string; founderId: string }>;
}

/**
 * Compute years of experience from work history
 */
function computeYearsExperience(
  previousCompanies: { startYear?: number; endYear?: number }[]
): number {
  if (previousCompanies.length === 0) return 0;

  const years = previousCompanies
    .filter((c) => c.startYear)
    .map((c) => c.startYear!);

  if (years.length === 0) return 0;

  const earliestYear = Math.min(...years);
  const currentYear = new Date().getFullYear();

  return currentYear - earliestYear;
}

/**
 * Determine education level from education array
 */
function computeEducationLevel(
  education: { degree?: string }[]
): "phd" | "masters" | "bachelors" | "other" | null {
  if (education.length === 0) return null;

  const degrees = education.map((e) => e.degree?.toLowerCase() ?? "");

  if (degrees.some((d) => d.includes("phd") || d.includes("doctorat") || d.includes("doctorate"))) {
    return "phd";
  }
  if (degrees.some((d) => d.includes("master") || d.includes("mba") || d.includes("msc") || d.includes("ma "))) {
    return "masters";
  }
  if (degrees.some((d) => d.includes("bachelor") || d.includes("bsc") || d.includes("ba ") || d.includes("licence") || d.includes("ingenieur") || d.includes("engineer"))) {
    return "bachelors";
  }

  return "other";
}

/**
 * POST /api/deals/[dealId]/founders/[founderId]/enrich
 *
 * Enriches a founder's profile by scraping their LinkedIn URL using Apify.
 * Stores the enriched data in the verifiedInfo field.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId, founderId } = await params;

    // Check if Apify is configured
    if (!isApifyLinkedInConfigured()) {
      return NextResponse.json(
        { error: "LinkedIn enrichment not configured. Please set APIFY_API_KEY." },
        { status: 503 }
      );
    }

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true, sector: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Get founder with LinkedIn URL
    const founder = await prisma.founder.findFirst({
      where: { id: founderId, dealId },
    });

    if (!founder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }

    if (!founder.linkedinUrl) {
      return NextResponse.json(
        { error: "Founder has no LinkedIn URL. Add a LinkedIn URL first." },
        { status: 400 }
      );
    }

    // Call Apify LinkedIn scraper
    console.log(`[Enrich] Scraping LinkedIn for ${founder.name}: ${founder.linkedinUrl}`);

    const result = await analyzeFounderLinkedIn(
      founder.linkedinUrl,
      founder.role,
      deal.sector ?? undefined
    );

    if (!result.success) {
      console.error(`[Enrich] Failed to scrape LinkedIn for ${founder.name}:`, result.error);
      return NextResponse.json(
        { error: result.error ?? "Failed to scrape LinkedIn profile" },
        { status: 502 }
      );
    }

    // Compute highlights from enriched data
    const yearsExperience = computeYearsExperience(result.profile?.previousCompanies ?? []);
    const educationLevel = computeEducationLevel(result.profile?.education ?? []);
    const expertise = result.analysis?.expertise;

    // Determine founder-related attributes from expertise
    const hasFounderExperience = expertise?.roles?.some(
      (r) => r.name === "founder_ceo" && r.percentage >= 10
    ) ?? false;
    const hasTechBackground = expertise?.roles?.some(
      (r) => r.name === "engineering" && r.percentage >= 20
    ) ?? false;
    const isSerialFounder = (result.profile?.previousVentures?.length ?? 0) >= 2;

    // Check sector relevance
    const hasRelevantIndustryExp = result.analysis?.sectorFit?.fits ?? false;

    // Build verifiedInfo object (must be JSON-serializable)
    const verifiedInfo = {
      linkedinScrapedAt: new Date().toISOString(),
      // Store key highlights for quick display in UI
      highlights: {
        yearsExperience,
        educationLevel,
        hasRelevantIndustryExp,
        hasFounderExperience,
        hasTechBackground,
        isSerialFounder,
      },
      // Store expertise summary
      expertise: expertise
        ? {
            primaryIndustry: expertise.primaryIndustry,
            primaryRole: expertise.primaryRole,
            primaryEcosystem: expertise.primaryEcosystem,
            description: expertise.expertiseDescription,
            isDiversified: expertise.isDiversified,
            hasDeepExpertise: expertise.hasDeepExpertise,
          }
        : null,
      // Store sector fit analysis
      sectorFit: result.analysis?.sectorFit ?? null,
      // Store red flags
      redFlags: result.analysis?.redFlags?.map((rf) => ({
        type: rf.type,
        severity: rf.severity,
        message: rf.description,
      })) ?? [],
      // Store questions to ask
      questionsToAsk: result.analysis?.questionsToAsk?.map((q) => ({
        question: q.question,
        context: q.context,
        priority: q.priority,
      })) ?? [],
    };

    // Build previousVentures from raw profile experiences
    const previousVentures = result.rawProfile?.experiences
      ?.filter((exp) => {
        const title = exp.title?.toLowerCase() ?? "";
        return (
          title.includes("founder") ||
          title.includes("ceo") ||
          title.includes("co-founder") ||
          title.includes("fondateur")
        );
      })
      .map((exp) => ({
        company: exp.company,
        role: exp.title,
        startYear: exp.starts_at?.year,
        endYear: exp.ends_at?.year,
      })) ?? [];

    // Update founder with enriched data
    const updatedFounder = await prisma.founder.update({
      where: { id: founderId },
      data: {
        verifiedInfo,
        previousVentures: previousVentures.length > 0 ? previousVentures : (founder.previousVentures ?? undefined),
      },
    });

    console.log(`[Enrich] Successfully enriched ${founder.name}'s profile`);

    return NextResponse.json({
      founder: updatedFounder,
      enrichment: {
        success: true,
        highlights: verifiedInfo.highlights,
        redFlagsCount: verifiedInfo.redFlags.length,
        previousVenturesCount: previousVentures.length,
      },
    });
  } catch (error) {
    console.error("Error enriching founder:", error);
    return NextResponse.json(
      { error: "Failed to enrich founder profile" },
      { status: 500 }
    );
  }
}
