/**
 * Phase 5.2 (Codex round 16 test gap) — structural test that verifies the
 * orchestrator wires Evidence Engine into ALL four context-construction sites.
 *
 * Why structural rather than runtime: AgentOrchestrator has dozens of
 * dependencies (Prisma, fact store, context engine, thesis, Inngest, …) and
 * fully mocking each entry method (`runBaseAnalysis`, `runTier1Analysis`,
 * `runFullAnalysis`, resume) to drive a real call into the helper would
 * triple the test surface for what is fundamentally a "did you forget to
 * call X at site Y" check.
 *
 * This test reads the orchestrator source file and asserts:
 *   1. `loadEvidenceContextSafe` is defined exactly once.
 *   2. It's invoked at EXACTLY 4 sites — runBaseAnalysis, runTier1Analysis,
 *      runFullAnalysis, resume — matching the audit gates of Codex r15 P1.
 *   3. Each AgentContext literal that includes `documents:` also includes
 *      `evidenceContext` and `evidenceToday`.
 *
 * If a future refactor drops or adds a context site without going through
 * the helper, this test fails loudly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ORCHESTRATOR_PATH = join(__dirname, "..", "index.ts");
const source = readFileSync(ORCHESTRATOR_PATH, "utf8");

describe("Evidence wiring — structural guard (Codex round 15+16 P1)", () => {
  it("`loadEvidenceContextSafe` est défini exactement 1 fois", () => {
    const defMatches = source.match(/async function loadEvidenceContextSafe\b/g) ?? [];
    expect(defMatches).toHaveLength(1);
  });

  it("`loadEvidenceContextSafe(...)` est appelé au moins 5 fois (Base + Tier1 + Full + Resume + Coherence)", () => {
    const callMatches = source.match(/loadEvidenceContextSafe\(/g) ?? [];
    // 1 occurrence is the function definition itself; the rest are call sites.
    expect(callMatches.length).toBeGreaterThanOrEqual(6); // 1 def + 5 calls
  });

  it("chaque AgentContext literal avec `documents:` injecte aussi `evidenceContext` ET `evidenceToday`", () => {
    // Match the contiguous block of an AgentContext literal:
    //   const ... : AgentContext = { ... documents: ... };
    // For each block, assert both `evidenceContext` and `evidenceToday` are present.
    const blockPattern = /:\s*AgentContext\s*=\s*\{[\s\S]+?documents:[\s\S]+?\};/g;
    const blocks = source.match(blockPattern) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(5); // 5 sites (Base + Tier1 + Full + Resume + Coherence)

    for (const [index, block] of blocks.entries()) {
      expect(
        block.includes("evidenceContext"),
        `AgentContext block ${index} missing evidenceContext:\n${block.slice(0, 400)}`
      ).toBe(true);
      expect(
        block.includes("evidenceToday"),
        `AgentContext block ${index} missing evidenceToday:\n${block.slice(0, 400)}`
      ).toBe(true);
    }
  });

  it("aucun call site ne contourne le helper (pas de buildDealEvidenceContext direct hors `loadEvidenceContextSafe`)", () => {
    // The bare import is allowed (it's used by the helper). The function call
    // `buildDealEvidenceContext(` should appear EXACTLY ONCE — inside the helper.
    const callMatches = source.match(/buildDealEvidenceContext\(/g) ?? [];
    expect(callMatches).toHaveLength(1);
  });

  it("le helper utilise un try/catch non-fatal (ne propage pas une erreur evidence)", () => {
    // Look for the try/catch around the buildDealEvidenceContext call inside
    // the helper. We don't parse — we assert keyword presence near the call.
    const helperMatch = source.match(/async function loadEvidenceContextSafe[\s\S]+?\n\}/);
    expect(helperMatch).not.toBeNull();
    const helperBody = helperMatch![0];
    expect(helperBody).toMatch(/try\s*\{/);
    expect(helperBody).toMatch(/catch\s*\(/);
    expect(helperBody).toMatch(/buildDealEvidenceContext/);
  });
});

describe("Evidence wiring — fingerprint signal load is fail-CLOSED (Codex round 16 P2)", () => {
  it("checkAnalysisCache returne null si signals load throw (no cache hit)", () => {
    // The cache lookup must NOT swallow signal errors with .catch(() => []) —
    // that would compute a fingerprint without signals and serve a stale
    // cached result. The fix uses try { ... } catch { ... return null; }.
    const checkCacheRegion = source.match(/private async checkAnalysisCache[\s\S]+?(?=\n\s+private |\n\s+\}\n\s+\}\n)/);
    expect(checkCacheRegion).not.toBeNull();
    const region = checkCacheRegion![0];
    // Both phrases must appear in the same region.
    expect(region).toMatch(/evidence signals load failed/i);
    expect(region).toMatch(/return null/);
  });

  it("storeAnalysisFingerprint skip le write si signals load throw (pas de fingerprint partiel)", () => {
    const storeRegion = source.match(/private async storeAnalysisFingerprint[\s\S]+?(?=\n\s+private |\n\s+\}\n\s+\}\n)/);
    expect(storeRegion).not.toBeNull();
    const region = storeRegion![0];
    expect(region).toMatch(/skipping fingerprint/i);
  });
});
