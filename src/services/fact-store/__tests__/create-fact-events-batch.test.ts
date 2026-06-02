import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedFact } from "../types";

// Mock prisma + deps avant import (hoisted).
const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    factEvent: { findFirst: prismaMocks.findFirst, create: prismaMocks.create },
    $transaction: prismaMocks.$transaction,
  },
}));

vi.mock("../current-facts", () => ({ refreshCurrentFactsView: vi.fn(async () => {}) }));
import { refreshCurrentFactsView } from "../current-facts";

// fact-keys mocké → sanitizeFactForPersistence accepte des facts scalaires arbitraires.
vi.mock("../fact-keys", () => ({
  canonicalizeFactKey: (k: string) => k,
  getFactKeyDefinition: () => ({ category: "FINANCIAL", type: "scalar", unit: null }),
}));

import { createFactEventsBatch } from "../persistence";

const FACTS = [
  { factKey: "financial.arr", value: 100000, displayValue: "100k", source: "DATA_ROOM", sourceConfidence: 80 },
  { factKey: "financial.mrr", value: 8333, displayValue: "8.3k", source: "DATA_ROOM", sourceConfidence: 80 },
] as unknown as ExtractedFact[];

function keysFromCreateCalls(): unknown[] {
  return prismaMocks.create.mock.calls.map(
    (c) => (c[0] as { data: { idempotencyKey: unknown } }).data.idempotencyKey
  );
}

describe("createFactEventsBatch — idempotence replay-safe (Fix C H/D.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "evt", ...args.data })
    );
    prismaMocks.$transaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises));
  });

  it("sans idempotency → idempotencyKey null, pas de batch-guard", async () => {
    const res = await createFactEventsBatch("d1", FACTS, "CREATED", "system");
    expect(res.success).toBe(true);
    expect(prismaMocks.findFirst).not.toHaveBeenCalled();
    expect(keysFromCreateCalls()).toEqual([null, null]);
  });

  it("batch frais (guard→null) → insert avec idempotencyKey ordinal 0..N-1", async () => {
    prismaMocks.findFirst.mockResolvedValue(null);
    const res = await createFactEventsBatch("d1", FACTS, "CREATED", "system", {
      runId: "a1",
      scope: "tier0-created",
    });
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(prismaMocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: "fact-event:a1:tier0-created:CREATED:0" } })
    );
    expect(keysFromCreateCalls()).toEqual([
      "fact-event:a1:tier0-created:CREATED:0",
      "fact-event:a1:tier0-created:CREATED:1",
    ]);
  });

  it("batch déjà committé (guard→{id}) → skip, $transaction PAS appelé, skipped=N", async () => {
    prismaMocks.findFirst.mockResolvedValue({ id: "evt_existing" });
    const res = await createFactEventsBatch("d1", FACTS, "CREATED", "system", {
      runId: "a1",
      scope: "tier1-finalize-resolved",
    });
    expect(res).toEqual({ success: true, skipped: 2 });
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
    expect(prismaMocks.create).not.toHaveBeenCalled();
    // Fix Codex : même sur skip, la vue matérialisée est reconstruite (le run committé a pu mourir
    // entre le $transaction et le refresh → sinon getCurrentFactsFromView resterait stale).
    expect(refreshCurrentFactsView).toHaveBeenCalled();
  });

  it("Tier0 drift lock : batch committé puis replay produisant PLUS de facts → skip, RIEN réinséré", async () => {
    prismaMocks.findFirst.mockResolvedValue({ id: "evt_existing" });
    const moreFacts = [
      ...FACTS,
      { factKey: "team.size", value: 5, displayValue: "5", source: "DATA_ROOM", sourceConfidence: 80 },
    ] as unknown as ExtractedFact[];
    const res = await createFactEventsBatch("d1", moreFacts, "CREATED", "system", {
      runId: "a1",
      scope: "tier0-created",
    });
    expect(res).toEqual({ success: true, skipped: 3 });
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
  });

  it("race : $transaction throw + re-check ordinal-0 committé → skipped (replay bénin)", async () => {
    prismaMocks.findFirst
      .mockResolvedValueOnce(null) // guard initial : pas encore committé
      .mockResolvedValueOnce({ id: "evt_winner" }); // re-check catch : le gagnant a committé
    prismaMocks.$transaction.mockRejectedValue(new Error("Unique constraint failed on idempotencyKey"));
    const res = await createFactEventsBatch("d1", FACTS, "CREATED", "system", {
      runId: "a1",
      scope: "tier0-created",
    });
    expect(res).toEqual({ success: true, skipped: 2 });
  });

  it("erreur réelle (pas une race) : $transaction throw + re-check vide → success:false", async () => {
    prismaMocks.findFirst.mockResolvedValue(null); // guard + re-check : rien committé
    prismaMocks.$transaction.mockRejectedValue(new Error("db down"));
    const res = await createFactEventsBatch("d1", FACTS, "CREATED", "system", {
      runId: "a1",
      scope: "tier0-created",
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("db down");
  });
});
