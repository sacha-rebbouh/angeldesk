import { beforeEach, describe, expect, it, vi } from "vitest";

// F6 (gate Codex) : le chemin de persistance du document-extractor écrit la
// valeur growthRate EXTRAITE (sortie LLM) sans passer par les schémas Zod des
// routes. Il doit appliquer la même borne (skip + warn hors plage, jamais de
// clamp silencieux d'une donnée inférée) que createDealSchema/updateDealSchema.

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    deal: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
const loggerMock = vi.hoisted(() => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));

import { processAgentResult } from "../persistence";
import type { AgentResult } from "../../types";

const extractorResult = (growthRateYoY: number): AgentResult =>
  ({
    success: true,
    data: { extractedInfo: { growthRateYoY } },
  } as unknown as AgentResult);

describe("processAgentResult — borne growthRate extrait (document-extractor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deal sans growthRate posé → la branche `!deal.growthRate` est prise.
    prismaMocks.prisma.deal.findUnique.mockResolvedValue({ growthRate: null });
    prismaMocks.prisma.deal.update.mockResolvedValue({});
  });

  it("persiste une croissance extraite DANS la plage (5000%)", async () => {
    await processAgentResult("deal_1", "document-extractor", extractorResult(5000));

    expect(prismaMocks.prisma.deal.update).toHaveBeenCalledTimes(1);
    const arg = prismaMocks.prisma.deal.update.mock.calls[0][0] as {
      data: { growthRate?: number };
    };
    expect(arg.data.growthRate).toBe(5000);
    expect(loggerMock.logger.warn).not.toHaveBeenCalled();
  });

  it("skip + warn une croissance extraite HORS plage (250000%) — pas d'écriture overflow/policy-bypass", async () => {
    await processAgentResult("deal_1", "document-extractor", extractorResult(250000));

    // Seul champ extrait hors plage → updateData vide → aucun deal.update.
    expect(prismaMocks.prisma.deal.update).not.toHaveBeenCalled();
    expect(loggerMock.logger.warn).toHaveBeenCalledTimes(1);
    const [ctx] = loggerMock.logger.warn.mock.calls[0] as [
      { dealId: string; growthRateYoY: number }
    ];
    expect(ctx).toMatchObject({ dealId: "deal_1", growthRateYoY: 250000 });
  });
});
