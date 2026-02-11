import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { getUserQuotaInfo, checkQuota } from "@/services/credits/usage-gate";
import { handleApiError } from "@/lib/api-error";

// GET /api/credits → user quota info
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 60 requests per minute
    const rateLimit = checkRateLimit(`credits-get:${user.id}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const quotaInfo = await getUserQuotaInfo(user.id, user.subscriptionStatus);

    return NextResponse.json({ data: quotaInfo });
  } catch (error) {
    return handleApiError(error, "fetch quota info");
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

    // Rate limiting: max 60 requests per minute
    const rateLimit = checkRateLimit(`credits-post:${user.id}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const body = await request.json();

    const parseResult = checkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Validation error", details: parseResult.error.issues }, { status: 400 });
    }

    const { action, dealId } = parseResult.data;
    const result = await checkQuota(user.id, user.subscriptionStatus, action, dealId);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, "check quota");
  }
}
