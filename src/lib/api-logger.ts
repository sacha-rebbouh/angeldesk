/**
 * Structured API logger for v1 routes.
 * Outputs JSON lines in production for log aggregation (Datadog, Vercel Logs, etc.).
 * Outputs readable format in development.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export interface ApiLogEntry {
  level: "info" | "warn" | "error";
  method: string;
  path: string;
  userId?: string;
  keyId?: string;
  status?: number;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function logApi(entry: ApiLogEntry): void {
  const timestamp = new Date().toISOString();
  const payload = { timestamp, ...entry };

  if (IS_PRODUCTION) {
    // JSON structured log for aggregation
    // Use console.warn for info (console.log stripped by removeConsole in prod)
    if (entry.level === "error") {
      console.error(JSON.stringify(payload));
    } else {
      console.warn(JSON.stringify(payload));
    }
  } else {
    // Readable format for dev
    const prefix = `[API:v1] ${entry.method} ${entry.path}`;
    const suffix = entry.durationMs ? ` (${entry.durationMs}ms)` : "";
    const status = entry.status ? ` → ${entry.status}` : "";
    if (entry.level === "error") {
      console.error(`${prefix}${status}${suffix} ERROR: ${entry.error}`);
    } else if (entry.level === "warn") {
      console.warn(`${prefix}${status}${suffix}`);
    }
    // Skip info in dev to reduce noise
  }
}

/**
 * Helper: measure request duration and log on completion.
 */
export function createApiTimer(method: string, path: string) {
  const start = Date.now();
  let _userId: string | undefined;
  let _keyId: string | undefined;
  return {
    setContext(userId: string, keyId: string) {
      _userId = userId;
      _keyId = keyId;
    },
    success(status: number, metadata?: Record<string, unknown>) {
      logApi({ level: "info", method, path, userId: _userId, keyId: _keyId, status, durationMs: Date.now() - start, metadata });
    },
    error(status: number, error: string) {
      logApi({ level: "error", method, path, userId: _userId, keyId: _keyId, status, durationMs: Date.now() - start, error });
    },
  };
}
