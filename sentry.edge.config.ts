import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  tracesSampleRate: 0.5,
});
