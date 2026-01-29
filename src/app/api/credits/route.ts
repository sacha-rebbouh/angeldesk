import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getUserQuotaInfo, checkQuota } from "@/services/credits/usage-gate";

// GET /api/credits → user quota info
export async function GET() {
  try {
    const user = await requireAuth();
    const quotaInfo = await getUserQuotaInfo(user.id, user.subscriptionStatus);

    return NextResponse.json({ data: quotaInfo });
  } catch (error) {
    console.error("Error fetching quota info:", error);
    return NextResponse.json({ error: "Failed to fetch quota info" }, { status: 500 });
  }
}

// POST /api/credits → check if action is allowed
const checkSchema = z.object({
  action: z.enum(['ANALYSIS', 'UPDATE', 'BOARD']),
  dealId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const parseResult = checkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Validation error", details: parseResult.error.issues }, { status: 400 });
    }

    const { action, dealId } = parseResult.data;
    const result = await checkQuota(user.id, user.subscriptionStatus, action, dealId);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Error checking quota:", error);
    return NextResponse.json({ error: "Failed to check quota" }, { status: 500 });
  }
}
