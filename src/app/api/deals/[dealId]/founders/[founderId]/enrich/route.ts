import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  analyzeFounderLinkedIn,
  isRapidAPILinkedInConfigured,
} from "@/services/context-engine/connectors/rapidapi-linkedin";
import { handleApiError } from "@/lib/api-error";

// CUID validation
const cuidSchema = z.string().cuid();

// Request body validation — consent is REQUIRED (RGPD Art. 6.1.f)
const enrichRequestSchema = z.object({
  consentLinkedIn: z.literal(true),
});

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

    // Validate CUID format
    const dealCuidResult = cuidSchema.safeParse(dealId);
    const founderCuidResult = cuidSchema.safeParse(founderId);
    if (!dealCuidResult.success || !founderCuidResult.success) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // RGPD: Verify explicit consent before LinkedIn scraping
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body is required with consentLinkedIn: true" },
        { status: 400 }
      );
    }
    const consentResult = enrichRequestSchema.safeParse(body);
    if (!consentResult.success) {
      return NextResponse.json(
        { error: "Le consentement explicite pour le scraping LinkedIn est requis (RGPD Art. 6.1.f). Envoyez { consentLinkedIn: true } dans le body." },
        { status: 403 }
      );
    }

    // Check if RapidAPI LinkedIn is configured
    if (!isRapidAPILinkedInConfigured()) {
      return NextResponse.json(
        { error: "LinkedIn enrichment not configured. Please set RAPIDAPI_LINKEDIN_KEY." },
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
    if (process.env.NODE_ENV === "development") {
      console.log(`[Enrich] Scraping LinkedIn for ${founder.name}: ${founder.linkedinUrl}`);
    }

    const result = await analyzeFounderLinkedIn(
      founder.linkedinUrl,
      founder.role,
      deal.sector ?? undefined
    );

    if (!result.success) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[Enrich] Failed to scrape LinkedIn for ${founder.name}:`, result.error);
      }
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
    // Store the FULL profile data from the API — we pay for it, use it all
    const rawProfile = result.rawProfile;
    const verifiedInfo = {
      linkedinScrapedAt: new Date().toISOString(),
      // Full LinkedIn profile data
      fullName: rawProfile?.full_name ?? founder.name,
      headline: rawProfile?.headline ?? null,
      summary: rawProfile?.summary ?? null,
      country: rawProfile?.country ?? rawProfile?.country_full_name ?? null,
      city: rawProfile?.city ?? null,
      connections: rawProfile?.connections ?? null,
      followerCount: rawProfile?.follower_count ?? null,
      // Full work history (ALL experiences, not just founder roles)
      experiences: rawProfile?.experiences?.map((exp) => ({
        company: exp.company,
        title: exp.title,
        description: exp.description ?? null,
        location: exp.location ?? null,
        startYear: exp.starts_at?.year ?? null,
        startMonth: exp.starts_at?.month ?? null,
        endYear: exp.ends_at?.year ?? null,
        endMonth: exp.ends_at?.month ?? null,
        isCurrent: exp.ends_at === null,
      })) ?? [],
      // Full education
      education: rawProfile?.education?.map((edu) => ({
        school: edu.school,
        degree: edu.degree_name ?? null,
        fieldOfStudy: edu.field_of_study ?? null,
        startYear: edu.starts_at?.year ?? null,
        endYear: edu.ends_at?.year ?? null,
        description: edu.description ?? null,
      })) ?? [],
      // Skills & languages
      skills: rawProfile?.skills ?? [],
      languages: rawProfile?.languages ?? [],
      // Computed highlights for quick display in UI
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

    if (process.env.NODE_ENV === "development") {
      console.log(`[Enrich] Successfully enriched ${founder.name}'s profile`);
    }

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
    return handleApiError(error, "enrich founder profile");
  }
}
