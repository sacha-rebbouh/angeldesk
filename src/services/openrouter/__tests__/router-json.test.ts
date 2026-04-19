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
