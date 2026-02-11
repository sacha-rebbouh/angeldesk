/**
 * API Key Authentication (F83)
 *
 * Validates API keys for the public API v1 endpoints.
 * Keys format: adk_live_<24 random chars>
 * Uses PBKDF2 (crypto native) for key hashing — no external dependency.
 */

import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/sanitize";
import { NextResponse } from "next/server";

const API_KEY_PREFIX = "adk_live_";
const KEY_LENGTH = 24;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_DIGEST = "sha512";

function hashKey(rawKey: string, salt: string): string {
  const derived = pbkdf2Sync(rawKey, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
  return `${salt}:${derived.toString("hex")}`;
}

function verifyKey(rawKey: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(rawKey, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), derived);
  } catch {
    return false;
  }
}

/**
 * Generate a new API key
 * Returns the raw key (show once) and its hash for storage
 */
export async function generateApiKey(userId: string, name: string) {
  const rawKey = API_KEY_PREFIX + randomBytes(KEY_LENGTH).toString("base64url").slice(0, KEY_LENGTH);
  const salt = randomBytes(16).toString("hex");
  const keyHash = hashKey(rawKey, salt);
  const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
      keyPrefix,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  return { ...apiKey, rawKey };
}

/**
 * Validate an API key from the Authorization header
 * Returns the user ID or null
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<{ userId: string; keyId: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawKey = authHeader.slice(7).trim();

  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);

  // Find candidate keys by prefix (fast lookup)
  const candidates = await prisma.apiKey.findMany({
    where: {
      keyPrefix,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
      keyHash: true,
    },
  });

  // Verify against PBKDF2 hash
  for (const candidate of candidates) {
    if (verifyKey(rawKey, candidate.keyHash)) {
      // Update lastUsedAt (fire-and-forget)
      prisma.apiKey
        .update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {});

      return { userId: candidate.userId, keyId: candidate.id };
    }
  }

  return null;
}

/**
 * Rate limit check for API key requests
 */
export function checkApiRateLimit(userId: string, isPro: boolean) {
  const limit = isPro ? 1000 : 100;
  return checkRateLimit(`api:${userId}`, {
    maxRequests: limit,
    windowMs: 3600_000, // 1 hour
  });
}

/**
 * Standard API error response
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  retryAfter?: number
) {
  const body: {
    error: { code: string; message: string; retryAfter?: number };
  } = { error: { code, message } };
  if (retryAfter) body.error.retryAfter = retryAfter;

  const headers: Record<string, string> = {};
  if (retryAfter) headers["Retry-After"] = String(retryAfter);

  return NextResponse.json(body, { status, headers });
}

/**
 * Standard API success response
 */
export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId: `req_${randomBytes(12).toString("hex")}`,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}
