import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { enrichDeal, getFounderContext, getConfiguredConnectors } from "@/services/context-engine";
import type { ConnectorQuery } from "@/services/context-engine/types";
import { handleApiError } from "@/lib/api-error";

const contextSchema = z.object({
  companyName: z.string().max(500).optional(),
  sector: z.string().max(200).optional(),
  subSector: z.string().max(200).optional(),
  stage: z.string().max(100).optional(),
  geography: z.string().max(200).optional(),
  founderNames: z.array(z.string().max(200)).max(10).optional(),
  keywords: z.array(z.string().max(200)).max(20).optional(),
});

/**
 * GET /api/context - Get configured connectors info
 */
export async function GET() {
  try {
    await requireAuth();

    const connectors = getConfiguredConnectors();

    return NextResponse.json({
      data: {
        connectors: connectors.map((c) => ({
          name: c.name,
          type: c.type,
          configured: c.isConfigured(),
        })),
        totalConfigured: connectors.length,
      },
    });
  } catch (error) {
    return handleApiError(error, "get context info");
  }
}

/**
 * POST /api/context - Enrich a deal with context
 *
 * Body:
 * {
 *   companyName?: string,
 *   sector?: string,
 *   subSector?: string,
 *   stage?: string,
 *   geography?: string,
 *   founderNames?: string[],
 *   keywords?: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const rateLimit = checkRateLimit(`context:${user.id}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = contextSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const query: ConnectorQuery = {
      companyName: parsed.data.companyName,
      sector: parsed.data.sector,
      subSector: parsed.data.subSector,
      stage: parsed.data.stage,
      geography: parsed.data.geography,
      founderNames: parsed.data.founderNames,
      keywords: parsed.data.keywords,
    };

    // Enrich deal with context
    const context = await enrichDeal(query);

    // If founder names provided, get detailed background
    if (query.founderNames && query.founderNames.length > 0) {
      const founderBackgrounds = await Promise.all(
        query.founderNames.map((name) => getFounderContext(name))
      );

      // Merge founder backgrounds into people graph
      if (!context.peopleGraph) {
        context.peopleGraph = { founders: [] };
      }

      for (const bg of founderBackgrounds) {
        if (bg) {
          context.peopleGraph.founders.push(bg);
        }
      }
    }

    return NextResponse.json({ data: context });
  } catch (error) {
    return handleApiError(error, "enrich deal");
  }
}
