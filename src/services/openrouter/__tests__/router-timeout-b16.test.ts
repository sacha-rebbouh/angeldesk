import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("OpenRouter completion timeout B16", () => {
  it("aborts the provider request instead of only timing out the caller", () => {
    const source = readFileSync("src/services/openrouter/router.ts", "utf8");
    const completeStart = source.indexOf("export async function complete(");
    const completeEnd = source.indexOf("// Extract the first valid JSON object", completeStart);
    const completeSource = source.slice(completeStart, completeEnd);

    expect(completeSource).toContain("timeoutMs = 120_000");
    expect(completeSource).toContain("new AbortController()");
    expect(completeSource).toContain("setTimeout(() => controller.abort(), timeoutMs)");
    expect(completeSource).toContain("{ signal: controller.signal }");
    expect(completeSource).toContain("{ timeoutMs }");
    expect(completeSource).toContain("otherwise a parent");
  });

  it("passes the per-agent timeout through the circuit breaker layer", () => {
    const source = readFileSync("src/services/openrouter/router.ts", "utf8");
    const completeStart = source.indexOf("export async function complete(");
    const completeEnd = source.indexOf("// Extract the first valid JSON object", completeStart);
    const completeSource = source.slice(completeStart, completeEnd);

    const circuitCall = completeSource.slice(
      completeSource.indexOf("const response = await circuitBreaker.execute("),
      completeSource.indexOf("clearTimeout(timeoutId);")
    );

    expect(circuitCall).toContain("{ timeoutMs }");
    expect(circuitCall).not.toContain("requestTimeout: 180000");
  });

  it("BaseAgent forwards its per-agent timeout down to the router call", () => {
    const source = readFileSync("src/agents/base-agent.ts", "utf8");
    const jsonStart = source.indexOf("protected async llmCompleteJSON");
    const jsonEnd = source.indexOf("/**", jsonStart + 1);
    const jsonSource = source.slice(jsonStart, jsonEnd);

    expect(jsonSource).toContain("const timeoutMs = options.timeoutMs ?? this.config.timeoutMs");
    expect(jsonSource).toContain("timeoutMs,");
    expect(jsonSource).toContain("LLM JSON call timed out after");
  });
});
