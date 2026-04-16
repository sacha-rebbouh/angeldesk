import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Performance tracing — 50% des transactions (backend cote analyse, cle pour
  // investiguer les Deep Dive lents)
  tracesSampleRate: 0.5,

  // PII scrubber: les traces LLM et documents chiffres ne doivent jamais partir
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.split("?")[0];
    }
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>;
      if (h.authorization) h.authorization = "[REDACTED]";
      if (h.cookie) h.cookie = "[REDACTED]";
    }
    return event;
  },

  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});
