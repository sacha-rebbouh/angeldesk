import { NextResponse } from "next/server";
import { z } from "zod";

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

  // Log in development only
  if (process.env.NODE_ENV === "development") {
    console.error(`[API] ${context}:`, error);
  }

  // Generic server error → 500 (never expose internal details)
  return NextResponse.json(
    { error: `Failed to ${context}` },
    { status: 500 }
  );
}
