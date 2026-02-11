/**
 * GET /api/v1/keys - List API keys
 * POST /api/v1/keys - Create a new API key
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateApiKey, apiSuccess, apiError } from "@/lib/api-key-auth";
import { handleApiError } from "@/lib/api-error";
import { createApiTimer } from "@/lib/api-logger";

export async function GET() {
  const timer = createApiTimer("GET", "/api/v1/keys");
  try {
    const user = await requireAuth();

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    timer.success(200, { count: keys.length });
    return apiSuccess(keys);
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "list API keys");
  }
}

export async function POST(request: NextRequest) {
  const timer = createApiTimer("POST", "/api/v1/keys");
  try {
    const user = await requireAuth();

    // Check PRO status
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionStatus: true },
    });
    if (dbUser?.subscriptionStatus !== "PRO") {
      timer.error(403, "Not PRO");
      return apiError("FORBIDDEN", "API keys require a Pro subscription", 403);
    }

    // Max 5 active keys
    const activeCount = await prisma.apiKey.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount >= 5) {
      timer.error(400, "Limit reached");
      return apiError("LIMIT_REACHED", "Maximum 5 active API keys", 400);
    }

    const body = await request.json();
    const name = body.name ?? "API Key";

    const result = await generateApiKey(user.id, name);

    timer.success(201);
    return apiSuccess(
      {
        id: result.id,
        name: result.name,
        key: result.rawKey, // Only shown once!
        keyPrefix: result.keyPrefix,
        createdAt: result.createdAt,
      },
      201
    );
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "create API key");
  }
}

export async function DELETE(request: NextRequest) {
  const timer = createApiTimer("DELETE", "/api/v1/keys");
  try {
    const user = await requireAuth();
    const body = await request.json();
    const keyId = body.id;

    if (!keyId) {
      timer.error(400, "Missing key id");
      return apiError("VALIDATION_ERROR", "key id required", 400);
    }

    await prisma.apiKey.updateMany({
      where: { id: keyId, userId: user.id },
      data: { revokedAt: new Date() },
    });

    timer.success(200);
    return apiSuccess({ revoked: true });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "revoke API key");
  }
}
