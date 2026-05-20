import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateOrUnauthorized } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/api-error";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { getRunningAnalysisForDeal, isPendingThesisReview } from "@/services/analysis/guards";

export const maxDuration = 30;

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_CLIENT_ENCRYPTED_FILE_BYTES = MAX_FILE_SIZE_BYTES + 64;

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/png",
  "image/jpeg",
];

const cuidSchema = z.string().cuid();
const clientPayloadSchema = z.object({
  dealId: z.string(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

class ClientUploadTokenError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ClientUploadTokenError";
  }
}

export async function POST(request: NextRequest) {
  // B11.3.1 (Codex P2) — explicit 401 contract. The 501 env gate
  // stays FIRST so an unconfigured environment surfaces clearly
  // before we even check auth (consistent with the existing
  // contract — an unconfigured server is a server-side bug, not
  // an auth issue).
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob client uploads are not configured" },
      { status: 501 }
    );
  }

  const auth = await authenticateOrUnauthorized();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const rateLimit = await checkRateLimitDistributed(`upload-token:${user.id}`, {
      maxRequests: 30,
      windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith("tmp/document-uploads/")) {
          throw new ClientUploadTokenError("Invalid upload pathname", 400);
        }

        let parsedPayload: z.infer<typeof clientPayloadSchema>;
        try {
          parsedPayload = clientPayloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        } catch {
          throw new ClientUploadTokenError("Invalid upload metadata", 400);
        }

        const cuidResult = cuidSchema.safeParse(parsedPayload.dealId);
        if (!cuidResult.success) {
          throw new ClientUploadTokenError("Invalid deal ID format", 400);
        }

        // Hard binding: the pathname requested for the token MUST be inside
        // this deal's namespace. Without this, an authenticated caller can
        // request a token for `tmp/document-uploads/<victim-deal>/...` while
        // claiming `dealId = <attacker-deal>` in the payload — the deal
        // ownership check passes (attacker-deal IS theirs) but the resulting
        // token lets them write into the victim's namespace.
        const expectedPrefix = `tmp/document-uploads/${parsedPayload.dealId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new ClientUploadTokenError(
            "Upload pathname does not match the target deal",
            400
          );
        }

        if (!ALLOWED_MIME_TYPES.includes(parsedPayload.mimeType)) {
          throw new ClientUploadTokenError(
            "Invalid file type. Allowed: PDF, Word, Excel, PowerPoint, Images (PNG, JPG)",
            400
          );
        }

        const deal = await prisma.deal.findFirst({
          where: {
            id: parsedPayload.dealId,
            userId: user.id,
          },
          select: { id: true },
        });
        if (!deal) {
          throw new ClientUploadTokenError("Deal not found", 404);
        }

        const runningAnalysis = await getRunningAnalysisForDeal(parsedPayload.dealId);
        if (runningAnalysis) {
          throw new ClientUploadTokenError(
            isPendingThesisReview(runningAnalysis)
              ? "Une revue de these est en attente. Finalisez-la avant d'uploader un nouveau document sur ce deal."
              : "Une analyse est deja en cours sur ce deal. Attendez sa fin avant de modifier le corpus documentaire.",
            409
          );
        }

        return {
          allowedContentTypes: ["application/octet-stream"],
          maximumSizeInBytes: MAX_CLIENT_ENCRYPTED_FILE_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({
            userId: user.id,
            dealId: parsedPayload.dealId,
          }),
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ClientUploadTokenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error, "generate document upload token");
  }
}
