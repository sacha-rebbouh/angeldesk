import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { nextStreamBackoffMs, DEFAULT_STREAM_HARD_TIMEOUT_MS } from "./backoff";

export const maxDuration = 300; // 5 minutes

/**
 * GET /api/analyze/stream?dealId=xxx
 * SSE endpoint for real-time analysis progress.
 * The client connects and receives events as agents complete.
 *
 * IMPORTANT: Ne charge jamais `Analysis.results` (blob JSON 5-10MB). Seules les
 * colonnes minimales sont selectionnees pour le polling. Le client doit refetch
 * les resultats complets via le Blob cache ou l'endpoint dedie apres 'complete'.
 *
 * Backoff exponentiel (voir ./backoff.ts) : reset a la progression active
 * (completedAgents augmente), sinon double jusqu'au cap par type d'analyse.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const dealId = request.nextUrl.searchParams.get("dealId");

  if (!dealId || !isValidCuid(dealId)) {
    return new Response("Invalid dealId", { status: 400 });
  }

  // Verify ownership
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id },
    select: { id: true },
  });

  if (!deal) {
    return new Response("Deal not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      const sendEvent = (event: string, data: unknown) => {
        if (closed || signal.aborted) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      const sleep = (ms: number) => new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const timeoutId = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          resolve();
        }, { once: true });
      });

      let lastCompletedAgents = -1;
      let currentBackoffMs = 0;
      const startedAt = Date.now();

      const poll = async (): Promise<"continue" | "stop"> => {
        try {
          if (signal.aborted) {
            return "stop";
          }

          // Colonnes minimales uniquement — pas de `results` ici. Le client
          // refetch les resultats complets via le cache Blob quand status=COMPLETED.
          const analysis = await prisma.analysis.findFirst({
            where: { dealId, status: { in: ["PENDING", "RUNNING", "COMPLETED", "FAILED"] } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              status: true,
              completedAgents: true,
              totalAgents: true,
              summary: true,
              totalCost: true,
              totalTimeMs: true,
              startedAt: true,
              completedAt: true,
            },
          });

          if (!analysis) {
            sendEvent("waiting", { message: "No analysis found yet" });
            return "continue";
          }

          // Progression: emit uniquement si completedAgents a change
          const progressed = analysis.completedAgents !== lastCompletedAgents;
          if (progressed) {
            lastCompletedAgents = analysis.completedAgents;
            sendEvent("progress", {
              analysisId: analysis.id,
              type: analysis.type,
              completedAgents: analysis.completedAgents,
              totalAgents: analysis.totalAgents,
              percent: Math.round(
                (analysis.completedAgents / Math.max(analysis.totalAgents, 1)) * 100
              ),
              status: analysis.status,
            });
          }

          if (analysis.status === "COMPLETED") {
            sendEvent("complete", {
              analysisId: analysis.id,
              status: "COMPLETED",
              summary: analysis.summary,
              totalCost: analysis.totalCost?.toString(),
              totalTimeMs: analysis.totalTimeMs,
            });
            return "stop";
          }

          if (analysis.status === "FAILED") {
            sendEvent("error", {
              analysisId: analysis.id,
              status: "FAILED",
              summary: analysis.summary,
            });
            return "stop";
          }

          // Calcul du prochain backoff (reset sur progression, sinon double jusqu'au cap par type)
          currentBackoffMs = nextStreamBackoffMs({
            type: analysis.type,
            previousMs: currentBackoffMs,
            progressed,
          });

          return "continue";
        } catch (error) {
          sendEvent("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
          return "stop";
        }
      };

      // Backoff exponentiel borne par un hard timeout global (10 min Deep Dive max)
      while (!signal.aborted) {
        const shouldContinue = await poll();
        if (shouldContinue === "stop") break;

        if (Date.now() - startedAt > DEFAULT_STREAM_HARD_TIMEOUT_MS) {
          sendEvent("timeout", { message: "Stream timeout reached" });
          break;
        }

        await sleep(currentBackoffMs);
      }

      close();
    },
    cancel() {
      // The request signal drives the polling loop; this hook exists so abandoned
      // clients do not leave future work scheduled by the stream itself.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
