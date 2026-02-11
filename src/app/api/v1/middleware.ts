/**
 * API v1 Middleware (F83)
 *
 * Shared authentication + rate limiting for all v1 endpoints.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateApiKey,
  checkApiRateLimit,
  apiError,
} from "@/lib/api-key-auth";

export interface ApiContext {
  userId: string;
  keyId: string;
  isPro: boolean;
}

/**
 * Authenticate and rate-limit an API v1 request.
 * Returns the context or an error response.
 */
export async function authenticateApiRequest(
  request: NextRequest
): Promise<ApiContext | Response> {
  const auth = request.headers.get("Authorization");
  const result = await validateApiKey(auth);

  if (!result) {
    return apiError("UNAUTHORIZED", "Invalid or missing API key", 401);
  }

  // Get user subscription
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { subscriptionStatus: true },
  });

  if (!user) {
    return apiError("UNAUTHORIZED", "User not found", 401);
  }

  const isPro = user.subscriptionStatus === "PRO";

  // Only PRO users can use the API
  if (!isPro) {
    return apiError(
      "FORBIDDEN",
      "API access requires a Pro subscription",
      403
    );
  }

  // Rate limiting
  const rateLimit = checkApiRateLimit(result.userId, isPro);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMIT_EXCEEDED",
      "Too many requests",
      429,
      rateLimit.resetIn
    );
  }

  return { userId: result.userId, keyId: result.keyId, isPro };
}
