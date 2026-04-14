import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";

export const maxDuration = 300; // 5 minutes

/**
 * GET /api/analyze/stream?dealId=xxx
 * SSE endpoint for real-time analysis progress.
 * The client connects and receives events as agents complete.
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
      let lastResults: string[] = [];
      let attempts = 0;
      const MAX_ATTEMPTS = 200; // 200 * 1.5s = 5 minutes max

      const poll = async () => {
        try {
          if (signal.aborted) {
            return false;
          }

          const analysis = await prisma.analysis.findFirst({
            where: { dealId, status: { in: ["RUNNING", "COMPLETED", "FAILED"] } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              completedAgents: true,
              totalAgents: true,
              summary: true,
              totalCost: true,
              totalTimeMs: true,
            },
          });

          if (!analysis) {
            sendEvent("waiting", { message: "No analysis found yet" });
            return true; // continue polling
          }

          // Detect new agent completions
          if (analysis.completedAgents !== lastCompletedAgents) {
            lastCompletedAgents = analysis.completedAgents;

            // Fetch the large results JSON only when progress changed.
            const analysisResults = await prisma.analysis.findUnique({
              where: { id: analysis.id },
              select: { results: true },
            });
            const currentResults = analysisResults?.results
              ? Object.keys(analysisResults.results as Record<string, unknown>)
              : [];
            const newAgents = currentResults.filter(a => !lastResults.includes(a));
            lastResults = currentResults;

            sendEvent("progress", {
              completedAgents: analysis.completedAgents,
              totalAgents: analysis.totalAgents,
              newAgents,
              percent: Math.round(
                (analysis.completedAgents / Math.max(analysis.totalAgents, 1)) * 100
              ),
            });
          }

          // Check if done
          if (analysis.status === "COMPLETED") {
            sendEvent("complete", {
              status: "COMPLETED",
              summary: analysis.summary,
              totalCost: analysis.totalCost?.toString(),
              totalTimeMs: analysis.totalTimeMs,
            });
            return false; // stop polling
          }

          if (analysis.status === "FAILED") {
            sendEvent("error", {
              status: "FAILED",
              summary: analysis.summary,
            });
            return false; // stop polling
          }

          return true; // continue polling
        } catch (error) {
          sendEvent("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
          return false;
        }
      };

      // Poll every 1.5 seconds
      while (attempts < MAX_ATTEMPTS && !signal.aborted) {
        const shouldContinue = await poll();
        if (!shouldContinue) break;
        attempts++;
        await sleep(1500);
      }

      if (attempts >= MAX_ATTEMPTS && !signal.aborted) {
        sendEvent("timeout", { message: "Stream timeout after 5 minutes" });
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
