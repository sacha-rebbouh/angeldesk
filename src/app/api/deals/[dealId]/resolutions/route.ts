import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid, checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

const createResolutionSchema = z.object({
  alertKey: z.string().min(5).max(200),
  alertType: z.enum(["RED_FLAG", "DEVILS_ADVOCATE", "CONDITIONS"]),
  status: z.enum(["RESOLVED", "ACCEPTED"]),
  justification: z.string().min(1).max(2000),
  alertTitle: z.string().min(1).max(500),
  alertSeverity: z.string().min(1).max(50),
  alertCategory: z.string().max(100).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const rl = await checkRateLimitDistributed(`resolutions-get:${user.id}`, { maxRequests: 30, windowMs: 60000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { dealId } = await params;
    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const resolutions = await prisma.alertResolution.findMany({
      where: { dealId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(resolutions);
  } catch (error) {
    return handleApiError(error, "fetch resolutions");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const rl = await checkRateLimitDistributed(`resolutions-post:${user.id}`, { maxRequests: 20, windowMs: 60000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { dealId } = await params;
    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const data = createResolutionSchema.parse(body);

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Upsert: create or update resolution for this alertKey
    const resolution = await prisma.alertResolution.upsert({
      where: {
        dealId_alertKey: { dealId, alertKey: data.alertKey },
      },
      create: {
        dealId,
        userId: user.id,
        alertKey: data.alertKey,
        alertType: data.alertType,
        status: data.status,
        justification: data.justification,
        alertTitle: data.alertTitle,
        alertSeverity: data.alertSeverity,
        alertCategory: data.alertCategory,
      },
      update: {
        status: data.status,
        justification: data.justification,
        alertTitle: data.alertTitle,
        alertSeverity: data.alertSeverity,
        alertCategory: data.alertCategory,
      },
    });

    return NextResponse.json(resolution);
  } catch (error) {
    return handleApiError(error, "create resolution");
  }
}
