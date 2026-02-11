/**
 * GET /api/v1/webhooks - List webhooks
 * POST /api/v1/webhooks - Register a webhook
 * DELETE /api/v1/webhooks - Delete a webhook
 */

import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "../middleware";
import { apiSuccess, apiError } from "@/lib/api-key-auth";
import { handleApiError } from "@/lib/api-error";
import { createApiTimer } from "@/lib/api-logger";

const VALID_EVENTS = [
  "analysis.completed",
  "analysis.failed",
  "red_flag.detected",
  "deal.created",
  "deal.updated",
] as const;

export async function GET(request: NextRequest) {
  const timer = createApiTimer("GET", "/api/v1/webhooks");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const webhooks = await prisma.webhook.findMany({
      where: { userId: ctx.userId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        lastTriggeredAt: true,
        failureCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    timer.success(200, { count: webhooks.length });
    return apiSuccess(webhooks);
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "list webhooks (v1)");
  }
}

export async function POST(request: NextRequest) {
  const timer = createApiTimer("POST", "/api/v1/webhooks");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const body = await request.json();
    const { url, events } = body;

    if (!url || typeof url !== "string" || !url.startsWith("https://")) {
      timer.error(400, "Invalid URL format");
      return apiError("VALIDATION_ERROR", "url must be a valid HTTPS URL", 400);
    }

    // Anti-SSRF: reject private/internal URLs
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const BLOCKED_HOSTS = [
        "localhost", "127.0.0.1", "0.0.0.0", "::1",
        "metadata.google.internal", "169.254.169.254",
      ];
      const BLOCKED_PREFIXES = ["10.", "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
        "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
        "192.168.", "0.", "fc00:", "fd00:", "fe80:"];
      if (BLOCKED_HOSTS.includes(hostname) || BLOCKED_PREFIXES.some(p => hostname.startsWith(p)) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
        timer.error(400, "SSRF blocked");
        return apiError("VALIDATION_ERROR", "Internal/private URLs are not allowed", 400);
      }
    } catch {
      timer.error(400, "Invalid URL");
      return apiError("VALIDATION_ERROR", "Invalid URL", 400);
    }

    if (!Array.isArray(events) || events.length === 0) {
      timer.error(400, "Invalid events");
      return apiError(
        "VALIDATION_ERROR",
        `events must be a non-empty array of: ${VALID_EVENTS.join(", ")}`,
        400
      );
    }

    const invalidEvents = events.filter(
      (e: string) => !VALID_EVENTS.includes(e as (typeof VALID_EVENTS)[number])
    );
    if (invalidEvents.length > 0) {
      timer.error(400, `Invalid events: ${invalidEvents.join(", ")}`);
      return apiError(
        "VALIDATION_ERROR",
        `Invalid events: ${invalidEvents.join(", ")}`,
        400
      );
    }

    // Max 10 webhooks
    const count = await prisma.webhook.count({ where: { userId: ctx.userId } });
    if (count >= 10) {
      timer.error(400, "Limit reached");
      return apiError("LIMIT_REACHED", "Maximum 10 webhooks", 400);
    }

    const secret = randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        userId: ctx.userId,
        url,
        events,
        secret,
      },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
      },
    });

    timer.success(201, { webhookId: webhook.id });
    return apiSuccess({ ...webhook, secret }, 201);
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "create webhook (v1)");
  }
}

export async function DELETE(request: NextRequest) {
  const timer = createApiTimer("DELETE", "/api/v1/webhooks");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const body = await request.json();
    const webhookId = body.id;

    if (!webhookId) {
      timer.error(400, "Missing webhook id");
      return apiError("VALIDATION_ERROR", "webhook id required", 400);
    }

    const deleted = await prisma.webhook.deleteMany({
      where: { id: webhookId, userId: ctx.userId },
    });

    if (deleted.count === 0) {
      timer.error(404, "Webhook not found");
      return apiError("NOT_FOUND", "Webhook not found", 404);
    }

    timer.success(200);
    return apiSuccess({ deleted: true });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "delete webhook (v1)");
  }
}
