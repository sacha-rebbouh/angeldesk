import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ completeJSON: vi.fn() }));
vi.mock("@/services/openrouter/router", () => ({ completeJSON: mocks.completeJSON }));

import { completeSectorJSON } from "../complete-sector-json";

const Schema = z.object({ sectorScore: z.number(), notes: z.string() });

describe("completeSectorJSON (fix post-mortem Avekapeti — JSON sectoriel robuste)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("JSON valide + conforme au schema → valid:true, data validée, cost remonté", async () => {
    mocks.completeJSON.mockResolvedValue({ data: { sectorScore: 72, notes: "ok" }, cost: 0.1 });
    const r = await completeSectorJSON("p", { complexity: "complex" }, Schema);
    expect(r.valid).toBe(true);
    expect(r.data).toEqual({ sectorScore: 72, notes: "ok" });
    expect(r.cost).toBe(0.1);
  });

  it("JSON valide mais NON conforme (Zod fail) → valid:false + raw renvoyé (l'appelant met ses defaults)", async () => {
    mocks.completeJSON.mockResolvedValue({ data: { sectorScore: "haut", notes: 5 }, cost: 0.2 });
    const r = await completeSectorJSON("p", {}, Schema);
    expect(r.valid).toBe(false);
    expect(r.data).toEqual({ sectorScore: "haut", notes: 5 });
    expect(r.cost).toBe(0.2);
  });

  it("vraie réponse en prose (completeJSON lève après ses retries) → propage le throw à l'appelant", async () => {
    mocks.completeJSON.mockRejectedValue(new Error('Failed to parse LLM response: Unexpected token V'));
    await expect(completeSectorJSON("p", {}, Schema)).rejects.toThrow(/Failed to parse/);
  });

  it("force bien le passage par completeJSON (response_format json_object géré côté router)", async () => {
    mocks.completeJSON.mockResolvedValue({ data: { sectorScore: 1, notes: "x" }, cost: 0 });
    await completeSectorJSON("prompt-x", { systemPrompt: "sys", temperature: 0.3 }, Schema);
    expect(mocks.completeJSON).toHaveBeenCalledTimes(1);
    expect(mocks.completeJSON.mock.calls[0][0]).toBe("prompt-x");
    expect(mocks.completeJSON.mock.calls[0][1]).toMatchObject({ systemPrompt: "sys", temperature: 0.3 });
  });
});
