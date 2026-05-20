/**
 * Phase 9 — Unit tests for the backfill skip-decision helper.
 *
 * Covers:
 *   - --force bypass + 0 DB reads
 *   - No terminal run → skip
 *   - Per-extractor-version coverage (Codex round 28 P1):
 *       all required versions present → skip
 *       any required version missing → process
 *   - False-skip guard: WHERE scoped on `run:<latestRunId>` (Codex round 27)
 *   - WHERE filters terminal-success statuses only
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { shouldBackfillDocument } from "../backfill-skip-decision";

function makePrismaMock(over: {
  latestRun?: { id: string } | null;
  presentExtractorVersions?: string[]; // signals scoped to the run
}) {
  return {
    documentExtractionRun: {
      findFirst: vi.fn().mockResolvedValue(over.latestRun ?? null),
    },
    evidenceSignal: {
      findMany: vi
        .fn()
        .mockResolvedValue((over.presentExtractorVersions ?? []).map((v) => ({ extractorVersion: v }))),
    },
  } as unknown as Parameters<typeof shouldBackfillDocument>[0];
}

const TEMPORAL_VERSION = "temporal-extractor@2026-test-001";
const CLAIMS_VERSION = "claims-extractor@2026-test-001";
const REQUIRED = [TEMPORAL_VERSION, CLAIMS_VERSION];

describe("shouldBackfillDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("--force → process, no DB read", async () => {
    const prisma = makePrismaMock({});
    const decision = await shouldBackfillDocument(prisma, "doc_1", { force: true });
    expect(decision.skip).toBe(false);
    expect(decision.reason).toBe("force_flag");
    expect((prisma.documentExtractionRun.findFirst as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    expect((prisma.evidenceSignal.findMany as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("no terminal extraction run → skip with reason 'no_terminal_extraction_run'", async () => {
    const prisma = makePrismaMock({ latestRun: null });
    const decision = await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe("no_terminal_extraction_run");
    expect(decision.latestRunId).toBeNull();
    expect((prisma.evidenceSignal.findMany as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("Codex round 28 P1 — temporal exists but claims missing → process (must not skip)", async () => {
    // The bug: previous helper used `findFirst` on any signal scoped to the run.
    // If only temporal had run but claims hadn't (e.g. partial pipeline failure
    // or new extractor added after first backfill), the doc was wrongly skipped
    // and claims never got created.
    const prisma = makePrismaMock({
      latestRun: { id: "run_42" },
      presentExtractorVersions: [TEMPORAL_VERSION], // claims missing
    });
    const decision = await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    expect(decision.skip).toBe(false);
    expect(decision.reason).toBe("missing_signals_for_latest_run");
    expect(decision.missingExtractorVersions).toEqual([CLAIMS_VERSION]);
  });

  it("Codex round 28 P1 — claims exists but temporal missing → process (symmetric)", async () => {
    const prisma = makePrismaMock({
      latestRun: { id: "run_42" },
      presentExtractorVersions: [CLAIMS_VERSION], // temporal missing
    });
    const decision = await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    expect(decision.skip).toBe(false);
    expect(decision.missingExtractorVersions).toEqual([TEMPORAL_VERSION]);
  });

  it("both required versions present at latest run → skip with coveredExtractorVersions", async () => {
    const prisma = makePrismaMock({
      latestRun: { id: "run_42" },
      presentExtractorVersions: [TEMPORAL_VERSION, CLAIMS_VERSION],
    });
    const decision = await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe("latest_run_already_processed");
    expect(decision.latestRunId).toBe("run_42");
    expect(decision.coveredExtractorVersions?.sort()).toEqual([CLAIMS_VERSION, TEMPORAL_VERSION].sort());
  });

  it("old-version signals present (current version absent) → process", async () => {
    // After an extractor version bump, the old version's signals don't satisfy
    // the coverage check. The doc is reprocessed at the new version (via --force
    // or naturally, since the new version is missing).
    const prisma = makePrismaMock({
      latestRun: { id: "run_42" },
      presentExtractorVersions: ["temporal-extractor@2025-OLD-001"], // not in REQUIRED
    });
    const decision = await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    expect(decision.skip).toBe(false);
    expect(decision.missingExtractorVersions?.sort()).toEqual([CLAIMS_VERSION, TEMPORAL_VERSION].sort());
  });

  it("Codex round 27 false-skip guard — query scoped to run:<latestRunId>, NOT 'any signal exists'", async () => {
    const prisma = makePrismaMock({ latestRun: { id: "run_42" }, presentExtractorVersions: [] });
    await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    const signalMock = prisma.evidenceSignal.findMany as unknown as {
      mock: {
        calls: [{
          where?: { signalScopeKey?: string; extractorVersion?: { in?: string[] } };
          distinct?: string[];
        }][];
      };
    };
    const call = signalMock.mock.calls[0]?.[0];
    expect(call?.where?.signalScopeKey).toBe("run:run_42");
    // Codex round 28 P1: WHERE must filter to required versions to make the
    // DISTINCT result meaningful (otherwise stale versions could spuriously
    // satisfy the coverage check).
    expect(call?.where?.extractorVersion?.in).toEqual(REQUIRED);
    expect(call?.distinct).toEqual(["extractorVersion"]);
  });

  it("queries terminal-success run statuses only (READY / READY_WITH_WARNINGS / BLOCKED)", async () => {
    const prisma = makePrismaMock({ latestRun: { id: "run_1" }, presentExtractorVersions: REQUIRED });
    await shouldBackfillDocument(prisma, "doc_1", { requiredExtractorVersions: REQUIRED });
    const runMock = prisma.documentExtractionRun.findFirst as unknown as {
      mock: {
        calls: [{
          where?: { status?: { in?: string[] } };
          orderBy?: { startedAt?: string };
        }][];
      };
    };
    const call = runMock.mock.calls[0]?.[0];
    expect(call?.where?.status?.in).toEqual(["READY", "READY_WITH_WARNINGS", "BLOCKED"]);
    expect(call?.orderBy?.startedAt).toBe("desc");
  });

  it("default requiredExtractorVersions uses the module-level constant (TEMPORAL + CLAIMS)", async () => {
    // Smoke test that we don't accidentally pass an empty list when options
    // omit requiredExtractorVersions — would skip everything.
    const prisma = makePrismaMock({ latestRun: { id: "run_42" }, presentExtractorVersions: [] });
    const decision = await shouldBackfillDocument(prisma, "doc_1");
    expect(decision.skip).toBe(false);
    expect(decision.missingExtractorVersions?.length).toBeGreaterThanOrEqual(2);
  });
});
