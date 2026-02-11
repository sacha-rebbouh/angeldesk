/**
 * Webhook Dispatcher (F83)
 *
 * Sends webhook events to registered endpoints with HMAC signature.
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

export type WebhookEvent =
  | "analysis.completed"
  | "analysis.failed"
  | "red_flag.detected"
  | "deal.created"
  | "deal.updated";

export interface WebhookPayload {
  event: WebhookEvent;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Dispatch a webhook event to all registered endpoints for a user.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export async function dispatchWebhookEvent(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      active: true,
      events: { has: event },
    },
  });

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);

  await Promise.allSettled(
    webhooks.map(async (webhook) => {
      const signature = createHmac("sha256", webhook.secret)
        .update(body)
        .digest("hex");

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": event,
          },
          body,
          signal: AbortSignal.timeout(10_000), // 10s timeout
        });

        if (response.ok) {
          await prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastTriggeredAt: new Date(), failureCount: 0 },
          });
        } else {
          await prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              failureCount: { increment: 1 },
              // Disable after 10 consecutive failures
              ...(webhook.failureCount >= 9 ? { active: false } : {}),
            },
          });
        }
      } catch {
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            failureCount: { increment: 1 },
            ...(webhook.failureCount >= 9 ? { active: false } : {}),
          },
        });
      }
    })
  );
}
