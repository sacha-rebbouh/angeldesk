import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/register(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook(.*)",
  "/api/telegram(.*)",
  "/api/cron(.*)",
  "/api/inngest(.*)",
]);

// Dev mode bypass - ONLY works in development
const BYPASS_AUTH =
  process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true";

export default clerkMiddleware(async (auth, req) => {
  // In dev mode with BYPASS_AUTH, allow all routes
  if (BYPASS_AUTH) {
    return NextResponse.next();
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
