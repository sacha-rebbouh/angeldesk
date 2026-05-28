/**
 * Helpers de lecture polymorphe sur les résultats d'agents.
 *
 * Source unique pour les transformations de bas niveau utilisées par les selectors.
 * Évite la dispersion observée dans le redesign Codex (3 copies divergentes).
 */

export type AgentResult = {
  success: boolean;
  agentName?: string;
  cost?: number;
  data?: unknown;
  error?: string;
};

export type ResultsMap = Record<string, AgentResult>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function valueAt(source: unknown, path: ReadonlyArray<string | number>): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (current == null) return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export function stringAt(source: unknown, path: ReadonlyArray<string | number>): string | null {
  const v = valueAt(source, path);
  return isString(v) ? v : null;
}

export function numberAt(source: unknown, path: ReadonlyArray<string | number>): number | null {
  const v = valueAt(source, path);
  return isFiniteNumber(v) ? v : null;
}

export function arrayAt(source: unknown, path: ReadonlyArray<string | number>): unknown[] {
  const v = valueAt(source, path);
  return Array.isArray(v) ? v : [];
}

export function agentData(results: ResultsMap | null | undefined, agentName: string): unknown {
  if (!results) return undefined;
  const entry = results[agentName];
  if (!entry || !entry.success) return undefined;
  return entry.data;
}

export function agentError(results: ResultsMap | null | undefined, agentName: string): string | null {
  if (!results) return null;
  const entry = results[agentName];
  if (!entry || entry.success) return null;
  return entry.error ?? "Agent failed without explicit error.";
}

export function agentExists(results: ResultsMap | null | undefined, agentName: string): boolean {
  if (!results) return false;
  return agentName in results;
}

export function agentSucceeded(results: ResultsMap | null | undefined, agentName: string): boolean {
  if (!results) return false;
  const entry = results[agentName];
  return Boolean(entry?.success);
}

export function compactString(value: unknown, maxLength = 240): string | null {
  if (!isString(value)) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1).trimEnd()}…` : trimmed;
}

export function clampPercent(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}
