import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { enrichDeal, getFounderContext, getConfiguredConnectors } from "@/services/context-engine";
import type { ConnectorQuery } from "@/services/context-engine/types";

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
    console.error("Error getting context info:", error);
    return NextResponse.json(
      { error: "Failed to get context info" },
      { status: 500 }
    );
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
    await requireAuth();

    const body = await request.json();

    const query: ConnectorQuery = {
      companyName: body.companyName,
      sector: body.sector,
      subSector: body.subSector,
      stage: body.stage,
      geography: body.geography,
      founderNames: body.founderNames,
      keywords: body.keywords,
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
    console.error("Error enriching deal:", error);
    return NextResponse.json(
      { error: "Failed to enrich deal" },
      { status: 500 }
    );
  }
}
