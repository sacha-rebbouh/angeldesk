import { afterEach, describe, expect, it } from "vitest";

import { AngelDeskLensSchema } from "@/agents/thesis/frameworks/angel-desk";
import { ThielLensSchema } from "@/agents/thesis/frameworks/thiel";
import { YcLensSchema } from "@/agents/thesis/frameworks/yc";
import { getThesisCallOptions } from "../call-options";

const originalTier = process.env.THESIS_MODEL_TIER;

afterEach(() => {
  if (originalTier === undefined) {
    delete process.env.THESIS_MODEL_TIER;
    return;
  }
  process.env.THESIS_MODEL_TIER = originalTier;
});

describe("getThesisCallOptions", () => {
  it("returns upgraded core chain with strict null defaults and no terminal fallback", () => {
    delete process.env.THESIS_MODEL_TIER;

    const options = getThesisCallOptions<{ moat: string | null; pathToExit: string | null }>("core");

    expect(options.fallbackChain).toEqual(["CLAUDE_SONNET_45", "GEMINI_PRO", "HAIKU"]);
    expect(options.fallbackDefaults).toEqual({ moat: null, pathToExit: null });
    expect(options.terminalFallbackData).toBeUndefined();
  });

  it("returns complete upgraded framework defaults and terminal fallback", () => {
    delete process.env.THESIS_MODEL_TIER;

    const yc = getThesisCallOptions("yc-lens");
    const thiel = getThesisCallOptions("thiel-lens");
    const angelDesk = getThesisCallOptions("angel-desk-lens");

    expect(yc.fallbackChain).toEqual(["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"]);
    expect(YcLensSchema.safeParse(yc.fallbackDefaults).success).toBe(true);
    expect(YcLensSchema.safeParse(yc.terminalFallbackData).success).toBe(true);
    expect(ThielLensSchema.safeParse(thiel.fallbackDefaults).success).toBe(true);
    expect(ThielLensSchema.safeParse(thiel.terminalFallbackData).success).toBe(true);
    expect(AngelDeskLensSchema.safeParse(angelDesk.fallbackDefaults).success).toBe(true);
    expect(AngelDeskLensSchema.safeParse(angelDesk.terminalFallbackData).success).toBe(true);
  });

  it("unwraps framework outputs when Haiku-style meta envelope is returned", () => {
    const yc = YcLensSchema.safeParse({
      meta: {
        verdict: "FAVORABLE",
        confidence: 77,
        question: "PMF ?",
        failures: ["Peu de preuves de retention"],
        strengths: ["Usage repetitif"],
        summary: "Le signal PMF existe mais reste incomplet.",
      },
      claims: [
        {
          claim: "La retention est naissante",
          derivedFrom: "Deck + usage",
          status: "PARTIAL",
        },
      ],
    });

    expect(yc.success).toBe(true);
    expect(yc.data?.verdict).toBe("favorable");
    expect(yc.data?.confidence).toBe(77);
    expect(yc.data?.summary).toContain("signal PMF");
    expect(yc.data?.claims[0]?.status).toBe("partial");
  });

  it("returns reconciler defaults and terminal no-op when context is present", () => {
    delete process.env.THESIS_MODEL_TIER;

    const options = getThesisCallOptions<{
      updatedVerdict: string;
      updatedConfidence: number;
      verdictChangeJustification: string;
      newRedFlags: unknown[];
      reconciliationNotes: Array<{ title: string; detail: string; impact: string }>;
      hiddenStrengths: unknown[];
    }>("reconciler", {
      initialVerdict: "vigilance",
      initialConfidence: 42,
    });

    expect(options.fallbackChain).toEqual(["GEMINI_PRO", "CLAUDE_SONNET_45", "HAIKU"]);
    expect(options.fallbackDefaults).toMatchObject({
      updatedVerdict: "vigilance",
      updatedConfidence: 42,
    });
    expect(options.terminalFallbackData).toMatchObject({
      updatedVerdict: "vigilance",
      updatedConfidence: 42,
      reconciliationNotes: [
        expect.objectContaining({
          title: "Reconciliation indisponible",
        }),
      ],
    });
  });

  it("returns no defaults and no terminal fallback for judge", () => {
    delete process.env.THESIS_MODEL_TIER;

    const options = getThesisCallOptions("judge");

    expect(options.fallbackChain).toEqual(["GEMINI_PRO", "GEMINI_3_FLASH", "HAIKU"]);
    expect(options.fallbackDefaults).toBeUndefined();
    expect(options.terminalFallbackData).toBeUndefined();
  });

  it("preserves role defaults and terminal fallbacks in legacy mode while removing custom chains", () => {
    process.env.THESIS_MODEL_TIER = "legacy";

    const core = getThesisCallOptions("core");
    const yc = getThesisCallOptions("yc-lens");
    const reconciler = getThesisCallOptions("reconciler", {
      initialVerdict: "favorable",
      initialConfidence: 61,
    });
    const judge = getThesisCallOptions("judge");

    expect(core.fallbackChain).toBeUndefined();
    expect(core.fallbackDefaults).toEqual({ moat: null, pathToExit: null });
    expect(core.terminalFallbackData).toBeUndefined();

    expect(yc.fallbackChain).toBeUndefined();
    expect(YcLensSchema.safeParse(yc.fallbackDefaults).success).toBe(true);
    expect(YcLensSchema.safeParse(yc.terminalFallbackData).success).toBe(true);

    expect(reconciler.fallbackChain).toBeUndefined();
    expect(reconciler.fallbackDefaults).toMatchObject({ updatedVerdict: "favorable" });
    expect(reconciler.terminalFallbackData).toMatchObject({ updatedVerdict: "favorable" });

    expect(judge).toEqual({});
  });
});
