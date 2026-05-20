import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("deck-forensics B16 timeout hardening", () => {
  it("uses a provider budget above the observed 180s production latency and below the 300s ceiling", () => {
    const source = readFileSync("src/agents/tier1/deck-forensics.ts", "utf8");

    expect(source).toContain("timeoutMs: 280000");
    expect(source).toContain("timeoutMs: 260000");
    expect(source).toContain("maxRetries: 0");
    expect(source).toContain("old 150s agent timeout");
  });

  it("does not keep the old 150s production timeout", () => {
    const source = readFileSync("src/agents/tier1/deck-forensics.ts", "utf8");

    expect(source).not.toContain("timeoutMs: 150000");
  });
});
