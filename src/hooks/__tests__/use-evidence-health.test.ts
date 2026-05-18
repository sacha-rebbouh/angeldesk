/**
 * Phase 8 — Guard test for use-evidence-health.
 *
 * Codex round 24 P2 — the hook MUST use `clerkFetch` (not raw `fetch`) so
 * the Clerk session is propagated correctly in preview/prod environments
 * where stale cookies can mask auth state. This is enforced via a static
 * grep on the source — cheaper than a full React hook integration test
 * and just as effective at catching the regression.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

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
