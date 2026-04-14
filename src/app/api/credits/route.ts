import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { getCreditBalance, checkCredits, CREDIT_COSTS, CREDIT_PACKS } from "@/services/credits";
import { handleApiError } from "@/lib/api-error";

// GET /api/credits → user credit balance & info
export async function GET() {
  try {
    const user = await requireAuth();

    const rateLimit = checkRateLimit(`credits-get:${user.id}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const balance = await getCreditBalance(user.id);

    return NextResponse.json({
      data: {
        ...balance,
        costs: CREDIT_COSTS,
        packs: CREDIT_PACKS,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch credit info");
  }
}

// POST /api/credits → check if action is allowed
const checkSchema = z.object({
  action: z.enum([
    'QUICK_SCAN', 'DEEP_DIVE', 'AI_BOARD', 'LIVE_COACHING',
    'RE_ANALYSIS', 'EXTRACTION_STANDARD_PAGE', 'EXTRACTION_HIGH_PAGE',
    'EXTRACTION_SUPREME_PAGE', 'CHAT', 'PDF_EXPORT',
    // Legacy actions
    'ANALYSIS', 'UPDATE', 'BOARD',
  ]),
  dealId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

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

    // Map legacy actions
    let action = parseResult.data.action;
    if (action === 'ANALYSIS') action = 'DEEP_DIVE';
    if (action === 'UPDATE') action = 'RE_ANALYSIS';
    if (action === 'BOARD') action = 'AI_BOARD';

    const result = await checkCredits(user.id, action as Parameters<typeof checkCredits>[1]);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, "check credits");
  }
}
