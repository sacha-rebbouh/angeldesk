/**
 * Phase 8 — Guard test for use-evidence-health.
 *
 * Codex round 24 P2 — the hook MUST use `clerkFetch` (not raw `fetch`) so
 * the Clerk session is propagated correctly in preview/prod environments
 * where stale cookies can mask auth state. This is enforced via a static
 * grep on the source — cheaper than a full React hook integration test
 * and just as effective at catching the regression.
 *
 * B9.3.1 fix-up (Codex B9.3 P1) — also exercises the runtime
 * rehydration helper that converts `resolvedAt` ISO strings back to
 * Date instances. Without this, the panel's `.getTime()` sort would
 * throw the moment a resolution exists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { rehydrateEvidenceHealthPayload } from "../use-evidence-health";

describe("use-evidence-health — clerkFetch guard (Codex round 24 P2)", () => {
  const source = readFileSync(join(__dirname, "..", "use-evidence-health.ts"), "utf8");

  it("imports clerkFetch from @/lib/clerk-fetch", () => {
    expect(source).toMatch(/import\s+\{\s*clerkFetch\s*\}\s+from\s+["']@\/lib\/clerk-fetch["']/);
  });

  it("calls clerkFetch (not raw fetch) for /api/deals/:id/evidence-health", () => {
    expect(source).toContain("clerkFetch(`/api/deals/${dealId}/evidence-health`)");
  });

  it("no raw `fetch(` call remains in the hook body", () => {
    // Anything that looks like `fetch(`api/...` or `fetch(\`...`. The hook
    // should be using `clerkFetch` exclusively for the evidence-health route.
    expect(source).not.toMatch(/\bfetch\(/);
  });
});

// ----------------------------------------------------------------
// B9.3.1 — runtime rehydration (Codex B9.3 P1)
// ----------------------------------------------------------------

describe("rehydrateEvidenceHealthPayload — wire ISO string → Date (B9.3.1, Codex B9.3 P1)", () => {
  function jsonRoundtrip<T>(value: T): T {
    // Exactly what `await res.json()` produces: Date instances are
    // serialised to ISO strings, never preserved as Date.
    return JSON.parse(JSON.stringify(value)) as T;
  }

  const baseBundle = {
    report: {
      contradictions: [],
      missing: [],
      // Full `countsByKind` shape required by the strict
      // `Record<StaleWarningKind, number>` type. The fixture mirrors
      // an empty-deal state.
      freshness: {
        countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
        total: 0,
      },
    },
    byDocument: {},
  };

  it("freshness entry: resolvedAt traverses the wire as string, hook returns a Date", () => {
    const wire = jsonRoundtrip({
      ...baseBundle,
      resolved: [
        {
          kind: "freshness",
          signalKey: "freshness:cap_table_stale:d_a",
          action: "RESOLVED",
          reason: null,
          resolvedAt: new Date("2026-05-19T08:30:00Z"),
          freshnessKind: "cap_table_stale",
          documentId: "d_a",
          documentName: "a.pdf",
          severity: "HIGH",
        },
      ],
      ignored: [],
    });
    expect(typeof wire.resolved[0].resolvedAt).toBe("string"); // sanity: JSON.parse never preserves Date
    const out = rehydrateEvidenceHealthPayload(wire as Parameters<typeof rehydrateEvidenceHealthPayload>[0]);
    expect(out.resolved[0].resolvedAt).toBeInstanceOf(Date);
    expect(out.resolved[0].resolvedAt.toISOString()).toBe("2026-05-19T08:30:00.000Z");
  });

  it("RED test: sort `.getTime()` no longer throws after a JSON roundtrip (the original crash)", () => {
    const wire = jsonRoundtrip({
      ...baseBundle,
      resolved: [
        {
          kind: "freshness",
          signalKey: "freshness:cap_table_stale:d_a",
          action: "RESOLVED",
          reason: null,
          resolvedAt: new Date("2026-05-18T00:00:00Z"),
          freshnessKind: "cap_table_stale",
          documentId: "d_a",
          documentName: "a.pdf",
          severity: "HIGH",
        },
      ],
      ignored: [
        {
          kind: "freshness",
          signalKey: "freshness:balance_sheet_stale:d_b",
          action: "IGNORED",
          reason: null,
          resolvedAt: new Date("2026-05-19T00:00:00Z"),
          freshnessKind: "balance_sheet_stale",
          documentId: "d_b",
          documentName: "b.pdf",
          severity: "MEDIUM",
        },
      ],
    });
    const out = rehydrateEvidenceHealthPayload(wire as Parameters<typeof rehydrateEvidenceHealthPayload>[0]);
    // The TreatedSignalsSection merges + sorts with the EXACT call
    // below. If `resolvedAt` were still a string, `.getTime` would
    // be undefined and the call would throw.
    const merged = [...out.resolved, ...out.ignored].sort(
      (a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime()
    );
    expect(merged).toHaveLength(2);
    // Most-recent first — ignored (2026-05-19) before resolved (2026-05-18).
    expect(merged[0].action).toBe("IGNORED");
    expect(merged[1].action).toBe("RESOLVED");
  });

  it("idempotent — a Date that survives the call stays a Date (test fixtures don't break)", () => {
    const direct = {
      ...baseBundle,
      resolved: [
        {
          kind: "freshness" as const,
          signalKey: "freshness:cap_table_stale:d_a",
          action: "RESOLVED" as const,
          reason: null,
          resolvedAt: new Date("2026-05-19T08:30:00Z"),
          freshnessKind: "cap_table_stale" as const,
          documentId: "d_a",
          documentName: "a.pdf",
          severity: "HIGH" as const,
        },
      ],
      ignored: [],
    };
    const out = rehydrateEvidenceHealthPayload(direct as Parameters<typeof rehydrateEvidenceHealthPayload>[0]);
    expect(out.resolved[0].resolvedAt).toBeInstanceOf(Date);
    expect(out.resolved[0].resolvedAt.toISOString()).toBe("2026-05-19T08:30:00.000Z");
  });

  it("preserves discriminated-union kind tag through normalisation (no type collapse)", () => {
    const wire = jsonRoundtrip({
      ...baseBundle,
      resolved: [
        {
          kind: "contradiction",
          signalKey: "contradiction:METRIC_MISMATCH:CA:2025:abcd1234abcd1234",
          action: "RESOLVED",
          reason: "ok",
          resolvedAt: new Date("2026-05-19T00:00:00Z"),
          contradiction: {
            kind: "METRIC_MISMATCH",
            subject: "CA",
            year: 2025,
            severity: "HIGH",
            reason: "...",
            spreadRatio: 1.5,
            signals: [],
          },
        },
        {
          kind: "missing",
          signalKey: "missing:NO_FINANCIAL_STATEMENTS",
          action: "IGNORED",
          reason: null,
          resolvedAt: new Date("2026-05-19T01:00:00Z"),
          finding: {
            kind: "NO_FINANCIAL_STATEMENTS",
            severity: "MEDIUM",
            message: "...",
            affectedDocumentIds: [],
          },
          documentId: null,
        },
      ],
      ignored: [],
    });
    const out = rehydrateEvidenceHealthPayload(wire as Parameters<typeof rehydrateEvidenceHealthPayload>[0]);
    expect(out.resolved[0].kind).toBe("contradiction");
    expect(out.resolved[1].kind).toBe("missing");
  });
});
