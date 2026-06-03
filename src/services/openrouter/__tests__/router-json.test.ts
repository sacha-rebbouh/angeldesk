import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  openrouter: {},
  MODELS: {},
}));

import { extractFirstJSON } from "../router";

describe("extractFirstJSON", () => {
  it("extracts JSON from fenced markdown with leading whitespace", () => {
    const content = '  ```json\n{"a":1,"b":["x"]}\n```';
    expect(extractFirstJSON(content)).toBe('{"a":1,"b":["x"]}');
  });

  it("extracts JSON from unclosed fenced markdown", () => {
    const content = '```json\n{"a":1,"b":{"c":2}}\n';
    expect(extractFirstJSON(content)).toBe('{"a":1,"b":{"c":2}}');
  });

  it("handles uppercase JSON fence labels", () => {
    const content = '```JSON\n{"ok":true}\n```';
    expect(extractFirstJSON(content)).toBe('{"ok":true}');
  });
});

// Source-guard (même pattern que router-timeout-b16) : prouve que le fallback model-aware implicite de
// completeJSON est OPT-OUT-able et que BaseAgent forwarde l'opt-out. Couplé à call-options.test.ts (le
// rôle reconciler met disableModelFallback:true), cela garantit que la chaîne explicite du reconciler
// (GEMINI_PRO → CLAUDE_SONNET_45 → HAIKU) ne déclenche PAS d'appel implicite hors ordre (HAIKU avant
// SONNET) ni hors chaîne (HAIKU → GEMINI_3_FLASH). Source-guard car completeJSON appelle complete() en
// intra-module (non mockable proprement) — convention du repo pour les invariants router.
describe("completeJSON — opt-out du fallback model-aware (disableModelFallback)", () => {
  it("router : la bascule model-aware est gardée par options.disableModelFallback !== true", () => {
    const source = readFileSync("src/services/openrouter/router.ts", "utf8");
    expect(source).toContain("disableModelFallback?: boolean");
    expect(source).toContain(
      "options._fallbackAttempted !== true && options.disableModelFallback !== true && !isEmptyResponse"
    );
  });

  it("BaseAgent : llmCompleteJSON forwarde disableModelFallback à completeJSON", () => {
    const source = readFileSync("src/agents/base-agent.ts", "utf8");
    const jsonStart = source.indexOf("protected async llmCompleteJSON");
    const jsonEnd = source.indexOf("/**", jsonStart + 1);
    const jsonSource = source.slice(jsonStart, jsonEnd);
    expect(jsonSource).toContain("disableModelFallback: options.disableModelFallback");
  });
});
