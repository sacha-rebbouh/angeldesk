import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Release tracking — permet de filtrer les erreurs par deploy
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || undefined,

  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Performance tracing — 50% des transactions capturees (budget Sentry raisonnable)
  tracesSampleRate: 0.5,

  // Session Replay — 100% des sessions AVEC erreur, 0% en background
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Breadcrumbs: capturer console.warn + console.error automatiquement
  // (en complement du logger centralise qui hook aussi Sentry)
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Scrubber PII — les donnees sensibles ne doivent pas aller chez Sentry
  beforeSend(event, hint) {
    // Strip URLs query params qui peuvent contenir des tokens
    if (event.request?.url) {
      event.request.url = event.request.url.split("?")[0];
    }
    // Strip cookies
    if (event.request?.cookies) {
      event.request.cookies = { redacted: "[REDACTED]" };
    }
    // Strip headers Authorization
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>;
      if (h.authorization) h.authorization = "[REDACTED]";
      if (h.cookie) h.cookie = "[REDACTED]";
    }
    return event;
  },

  ignoreErrors: [
    // Erreurs de navigation Next.js qui ne sont pas des bugs
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    // Hydration mismatch ne bloque pas l'app
    /Hydration failed/i,
  ],
});
