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
import { validatePublicUrl } from "@/lib/url-validator";

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

    const urlValidation = await validatePublicUrl(url);
    if (!urlValidation.valid) {
      timer.error(400, urlValidation.reason ?? "Invalid webhook URL");
      return apiError(
        "VALIDATION_ERROR",
        urlValidation.reason ?? "Invalid webhook URL",
        400
      );
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
