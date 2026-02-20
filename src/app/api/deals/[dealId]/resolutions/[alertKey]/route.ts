import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid, checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string; alertKey: string }> }
) {
  try {
    const user = await requireAuth();
    const rl = await checkRateLimitDistributed(`resolutions-delete:${user.id}`, { maxRequests: 20, windowMs: 60000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { dealId, alertKey } = await params;
    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(alertKey);
    } catch {
      return NextResponse.json({ error: "Invalid alert key encoding" }, { status: 400 });
    }

    if (!decodedKey || decodedKey.length < 5 || decodedKey.length > 200) {
      return NextResponse.json({ error: "Invalid alert key" }, { status: 400 });
    }

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

    try {
      await prisma.alertResolution.delete({
        where: { dealId_alertKey: { dealId, alertKey: decodedKey } },
      });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
        return NextResponse.json({ error: "Resolution not found" }, { status: 404 });
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete resolution");
  }
}
