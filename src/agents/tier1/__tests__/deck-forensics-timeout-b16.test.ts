import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("deck-forensics B16 timeout hardening", () => {
  it("uses a provider budget above the observed 180s production latency and below the 300s ceiling", () => {
    const source = readFileSync("src/agents/tier1/deck-forensics.ts", "utf8");

    expect(source).toContain("timeoutMs: 290000");
    expect(source).toContain("DECK_FORENSICS_PRO_TIMEOUT_MS = 190_000");
    expect(source).toContain("DECK_FORENSICS_FLASH_FALLBACK_TIMEOUT_MS = 80_000");
    expect(source).toContain("maxRetries: 0");
    expect(source).toContain("Gemini Pro as primary");
  });

  it("does not keep the old 150s production timeout", () => {
    const source = readFileSync("src/agents/tier1/deck-forensics.ts", "utf8");

    expect(source).not.toContain("timeoutMs: 150000");
  });

  it("bounds secondary document context and falls back only after provider timeout", () => {
    const source = readFileSync("src/agents/tier1/deck-forensics.ts", "utf8");

    expect(source).toContain("DECK_FORENSICS_OTHER_DOC_MAX_CHARS");
    expect(source).toContain("buildDeckForensicsPromptContext");
    expect(source).toContain("compactExtractedInfoForPrompt");
    expect(source).toContain('model: "GEMINI_3_FLASH"');
    expect(source).toContain("Gemini Pro timed out");
  });
});
