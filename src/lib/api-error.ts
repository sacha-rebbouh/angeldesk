import { NextResponse } from "next/server";
import { z } from "zod";

function sanitizeErrorText(value: unknown): string {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[redacted]@")
    .replace(/(BLOB_READ_WRITE_TOKEN|token|password|secret)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 2000);
}

function getSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      code: typeof withCode.code === "string" ? withCode.code : undefined,
      message: sanitizeErrorText(error.message),
      stack: sanitizeErrorText(error.stack),
    };
  }

  return {
    name: "UnknownError",
    message: sanitizeErrorText(error),
  };
}

/**
 * Standard API error response handler.
 * Handles common error types (Zod validation, Prisma, auth) and returns
 * appropriate HTTP status codes with safe error messages.
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  // Zod validation errors → 400
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation error", details: error.issues },
      { status: 400 }
    );
  }

  const safeDetails = getSafeErrorDetails(error);
  const shouldExposePreviewDetails = process.env.VERCEL_ENV === "preview";

  if (process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") {
    console.error(`[API] ${context}:`, safeDetails);
  }

  // Generic server error → 500 (never expose internal details)
  return NextResponse.json(
    {
      error: `Failed to ${context}`,
      ...(shouldExposePreviewDetails ? { debug: safeDetails } : {}),
    },
    { status: 500 }
  );
}
