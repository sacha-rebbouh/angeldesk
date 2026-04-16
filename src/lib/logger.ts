/**
 * Logger centralise — Angel Desk
 *
 * Objectif: remplacer les 700+ `console.log/warn/error` eparpilles par un
 * logger structure avec:
 *   - niveaux (debug/info/warn/error) filtres par env
 *   - redaction automatique des champs PII sensibles
 *   - contexte enrichi (agent name, deal id, user id, trace id)
 *   - output JSON en production (parsable par Vercel/Sentry/Datadog)
 *   - console lisible en dev
 *   - hook Sentry automatique pour error + fatal
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ dealId, userId }, "Analysis started");
 *   logger.error({ err, dealId }, "Orchestrator crashed");
 *
 * Migration progressive:
 *   - remplace `console.log(...)` par `logger.info(...)` ou `logger.debug(...)`
 *   - remplace `console.warn(...)` par `logger.warn(...)`
 *   - remplace `console.error(...)` par `logger.error(...)`
 */

import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function resolveMinLevel(): LogLevel {
  const explicit = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (explicit && explicit in LEVEL_PRIORITY) return explicit;
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "warn";
  return "debug";
}

const MIN_PRIORITY = LEVEL_PRIORITY[resolveMinLevel()];

const IS_JSON_OUTPUT = process.env.NODE_ENV === "production";

/**
 * Champs a rediger systematiquement dans les logs (PII / secrets).
 * Redacted: remplace la valeur par "[REDACTED]" avant output.
 */
const REDACTED_KEYS = new Set([
  "password",
  "apiKey",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "session",
  "token",
  "accessToken",
  "refreshToken",
  "clerkId",
  "clerk_id",
  "stripePaymentId",
  "stripe_payment_id",
  "email",
  "linkedinUrl",
  "linkedin_url",
  "phone",
  "phoneNumber",
  "extractedText",
  "rawContent",
  "content",
  "userPrompt",
  "systemPrompt",
]);

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[DEEP]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Ne redact pas le contenu brut d'un message log (sinon le message disparait).
    // Seul le dictionnaire de champs structures est redacte (cf. redactFields).
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  return redactFields(value as Record<string, unknown>, depth + 1);
}

function redactFields(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = redactValue(val, depth);
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    };
  }
  return { message: String(err) };
}

function emit(level: LogLevel, context: Record<string, unknown> | undefined, message: string) {
  if (LEVEL_PRIORITY[level] < MIN_PRIORITY) return;

  const safeContext = context ? redactFields(context) : undefined;

  // Hook Sentry pour error + fatal
  if (level === "error" || level === "fatal") {
    const errorObj = context?.err ?? context?.error;
    if (errorObj instanceof Error) {
      Sentry.captureException(errorObj, { extra: safeContext });
    } else {
      Sentry.captureMessage(message, {
        level: level === "fatal" ? "fatal" : "error",
        extra: safeContext,
      });
    }
  } else if (level === "warn" && Sentry.getClient()) {
    Sentry.addBreadcrumb({
      category: "log",
      level: "warning",
      message,
      data: safeContext,
    });
  }

  if (IS_JSON_OUTPUT) {
    const record = {
      level,
      time: new Date().toISOString(),
      message,
      ...(safeContext ?? {}),
    };
    const line = JSON.stringify(record, (_, v) => {
      if (v instanceof Error) return serializeError(v);
      return v;
    });
    if (level === "error" || level === "fatal") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
    return;
  }

  // Dev: console lisible
  const prefix = `[${level.toUpperCase()}]`;
  const method = level === "error" || level === "fatal" ? "error" : level === "warn" ? "warn" : "log";
  if (safeContext && Object.keys(safeContext).length > 0) {
    console[method](prefix, message, safeContext);
  } else {
    console[method](prefix, message);
  }
}

export interface Logger {
  debug(context: Record<string, unknown>, message: string): void;
  debug(message: string): void;
  info(context: Record<string, unknown>, message: string): void;
  info(message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  warn(message: string): void;
  error(context: Record<string, unknown>, message: string): void;
  error(message: string): void;
  fatal(context: Record<string, unknown>, message: string): void;
  fatal(message: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

function buildLogger(bindings: Record<string, unknown>): Logger {
  function call(level: LogLevel, a: Record<string, unknown> | string, b?: string) {
    if (typeof a === "string") {
      emit(level, bindings, a);
    } else {
      emit(level, { ...bindings, ...a }, b ?? "");
    }
  }

  return {
    debug: (a: Record<string, unknown> | string, b?: string) => call("debug", a, b),
    info: (a: Record<string, unknown> | string, b?: string) => call("info", a, b),
    warn: (a: Record<string, unknown> | string, b?: string) => call("warn", a, b),
    error: (a: Record<string, unknown> | string, b?: string) => call("error", a, b),
    fatal: (a: Record<string, unknown> | string, b?: string) => call("fatal", a, b),
    child: (extra: Record<string, unknown>) => buildLogger({ ...bindings, ...extra }),
  } as Logger;
}

export const logger: Logger = buildLogger({});

/**
 * Cree un logger enfant avec bindings (ex: agentName, dealId).
 * Tous les logs emits par le child contiennent automatiquement les bindings.
 */
export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
