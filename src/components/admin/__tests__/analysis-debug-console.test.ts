/**
 * B17.1 — Static guards on analysis-debug-console.tsx + admin debug page.
 *
 * The console is strictly READ-ONLY: no mutation, no useMutation, no
 * POST/DELETE/PATCH/retry/cancel/relaunch button. These grep-based
 * guards prevent the next refactor from silently slipping in a
 * mutation control.
 *
 * Component-level rendering tests would need JSDOM + react-query
 * provider — out of scope for B17.1 (B17.x can layer them on top).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const consoleSource = readFileSync(
  join(__dirname, "..", "analysis-debug-console.tsx"),
  "utf8"
);

const pageSource = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "..",
    "app",
    "(dashboard)",
    "admin",
    "analyses",
    "[analysisId]",
    "page.tsx"
  ),
  "utf8"
);

describe("admin analysis debug page — server-side admin gate", () => {
  it("is gated by requireAdmin()", () => {
    expect(pageSource).toMatch(/await\s+requireAdmin\s*\(\s*\)/);
  });
  it("renders the client console with the analysisId param", () => {
    expect(pageSource).toMatch(/AnalysisDebugConsole/);
    expect(pageSource).toMatch(/analysisId=\{analysisId\}/);
  });
});

describe("analysis-debug-console.tsx — strictly read-only", () => {
  it("does not import useMutation from @tanstack/react-query", () => {
    // Strip the docblock to avoid matching the comment that NAMES the
    // banned symbol for the guard. The real check is that the import
    // statement / call site does not reference useMutation.
    const codeOnly = consoleSource.replace(/\/\*[\s\S]*?\*\//, "");
    expect(codeOnly).not.toMatch(/useMutation/);
  });

  it("never POSTs / PATCHes / DELETEs anywhere", () => {
    // Defense-in-depth: any HTTP method besides GET would be a mutation.
    expect(consoleSource).not.toMatch(/method:\s*["']POST["']/);
    expect(consoleSource).not.toMatch(/method:\s*["']PATCH["']/);
    expect(consoleSource).not.toMatch(/method:\s*["']DELETE["']/);
    expect(consoleSource).not.toMatch(/method:\s*["']PUT["']/);
  });

  it("only fetches the debug endpoint with GET", () => {
    // The single fetch call must target the debug endpoint and use GET.
    expect(consoleSource).toMatch(/fetch\(`\/api\/admin\/analyses\/\$\{analysisId\}\/debug`/);
    expect(consoleSource).toMatch(/method:\s*["']GET["']/);
  });

  it("does not expose any retry/cancel/relaunch/kill button", () => {
    // The page must not provide any mutation controls per B17.1 spec.
    expect(consoleSource).not.toMatch(/\bRetry\b/i);
    expect(consoleSource).not.toMatch(/\bCancel\b/i);
    expect(consoleSource).not.toMatch(/\bRelaunch\b/i);
    expect(consoleSource).not.toMatch(/\bRestart\b/i);
    expect(consoleSource).not.toMatch(/\bKill\b/i);
    expect(consoleSource).not.toMatch(/\bAbort\b/i);
    // "Refresh" is the ONLY action button allowed (read-only re-fetch).
    expect(consoleSource).toMatch(/Refresh/);
  });
});

describe("analysis-debug-console.tsx — polling + manual refresh", () => {
  it("polls the debug endpoint with refetchInterval: 10_000", () => {
    expect(consoleSource).toMatch(/refetchInterval:\s*POLL_MS/);
    expect(consoleSource).toMatch(/POLL_MS\s*=\s*10_000/);
  });

  it("uses queryKeys.admin.analysisDebug(analysisId) for the query key", () => {
    expect(consoleSource).toMatch(/queryKeys\.admin\.analysisDebug\(analysisId\)/);
  });

  it("wires the Refresh button to refetch()", () => {
    expect(consoleSource).toMatch(/onRefresh[\s\S]*?refetch/);
    expect(consoleSource).toMatch(/onClick=\{onRefresh\}/);
  });
});

describe("analysis-debug-console.tsx — filters", () => {
  it("renders the Errors-only checkbox bound to errorsOnly state", () => {
    expect(consoleSource).toMatch(/errorsOnly,\s*setErrorsOnly\s*\]\s*=\s*useState\(false\)/);
    expect(consoleSource).toMatch(/aria-label="Errors only"/);
  });

  it("renders the Unknown-only checkbox bound to unknownOnly state", () => {
    expect(consoleSource).toMatch(/unknownOnly,\s*setUnknownOnly\s*\]\s*=\s*useState\(false\)/);
    expect(consoleSource).toMatch(/aria-label="Unknown only"/);
  });

  it("applies the errors-only filter on filteredCalls", () => {
    expect(consoleSource).toMatch(/if\s*\(\s*errorsOnly\s*&&\s*!c\.isError\s*\)\s*return\s*false/);
  });

  it("applies the unknown-only filter on filteredCalls", () => {
    expect(consoleSource).toMatch(/if\s*\(\s*unknownOnly\s*&&\s*c\.agentName\s*!==\s*"unknown"\s*\)\s*return\s*false/);
  });
});

describe("analysis-debug-console.tsx — sections + anomalies surface", () => {
  it("renders an Anomalies card only when anomalies.length > 0", () => {
    expect(consoleSource).toMatch(/anomalies\.length\s*>\s*0\s*&&/);
    expect(consoleSource).toMatch(/Anomalies détectées/);
  });

  it("tags each anomaly card with data-anomaly-type for downstream assertions", () => {
    expect(consoleSource).toMatch(/data-anomaly-type=\{a\.type\}/);
  });

  it("renders the 5 main sections (anomalies, summary, agents, llm calls, checkpoint)", () => {
    // CardTitle children render on next line — use [\s\S]*? for cross-line match.
    expect(consoleSource).toMatch(/CardTitle[^>]*>[\s\S]{0,200}?Summary/);
    expect(consoleSource).toMatch(/CardTitle[^>]*>[\s\S]{0,200}?Agents/);
    expect(consoleSource).toMatch(/CardTitle[^>]*>[\s\S]{0,200}?LLM calls/);
    expect(consoleSource).toMatch(/CardTitle[^>]*>[\s\S]{0,200}?Latest checkpoint/);
  });

  it("shows checkpoint state, completedAgents, pendingAgents and raw failedAgents", () => {
    expect(consoleSource).toMatch(/checkpoint\.state/);
    expect(consoleSource).toMatch(/checkpoint\.completedAgents\.length/);
    expect(consoleSource).toMatch(/checkpoint\.pendingAgents\.length/);
    expect(consoleSource).toMatch(/JSON\.stringify\(checkpoint\.failedAgents/);
  });

  it("badges agent rows with status: success | failed | unknown", () => {
    expect(consoleSource).toMatch(/statusBadgeVariant\(a\.status\)/);
    expect(consoleSource).toMatch(/status === "failed"/);
    expect(consoleSource).toMatch(/status === "unknown"/);
  });
});
