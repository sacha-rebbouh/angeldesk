import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";

/**
 * POST /api/user/cgu — Record CGU/IA consent acceptance.
 * Sets cguAcceptedAt to the current timestamp.
 */
export async function POST() {
  try {
    const user = await requireAuth();

    await prisma.user.update({
      where: { id: user.id },
      data: { cguAcceptedAt: new Date() },
    });

    return NextResponse.json({ accepted: true });
  } catch (error) {
    return handleApiError(error, "record CGU acceptance");
  }
}
