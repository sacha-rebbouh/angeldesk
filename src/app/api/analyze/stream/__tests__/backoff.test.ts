import { describe, it, expect } from "vitest";
import {
  nextStreamBackoffMs,
  getStreamBackoffConfig,
  DEFAULT_STREAM_HARD_TIMEOUT_MS,
} from "../backoff";

describe("getStreamBackoffConfig", () => {
  it("retourne base=500 cap=2000 pour les types rapides", () => {
    expect(getStreamBackoffConfig("screening")).toEqual({ baseMs: 500, capMs: 2000 });
    expect(getStreamBackoffConfig("quick_scan")).toEqual({ baseMs: 500, capMs: 2000 });
    expect(getStreamBackoffConfig("extraction")).toEqual({ baseMs: 500, capMs: 2000 });
  });

  it("retourne base=2000 cap=5000 pour les types lents", () => {
    expect(getStreamBackoffConfig("full_analysis")).toEqual({ baseMs: 2000, capMs: 5000 });
    expect(getStreamBackoffConfig("full_dd")).toEqual({ baseMs: 2000, capMs: 5000 });
    expect(getStreamBackoffConfig("tier3_synthesis")).toEqual({ baseMs: 2000, capMs: 5000 });
  });

  it("fallback default pour type inconnu ou null", () => {
    expect(getStreamBackoffConfig(null)).toEqual({ baseMs: 1500, capMs: 3000 });
    expect(getStreamBackoffConfig(undefined)).toEqual({ baseMs: 1500, capMs: 3000 });
    expect(getStreamBackoffConfig("foo")).toEqual({ baseMs: 1500, capMs: 3000 });
  });
});

describe("nextStreamBackoffMs", () => {
  it("retourne base au premier tick (previousMs=0)", () => {
    expect(nextStreamBackoffMs({ type: "screening", previousMs: 0, progressed: false })).toBe(500);
    expect(nextStreamBackoffMs({ type: "full_analysis", previousMs: 0, progressed: false })).toBe(2000);
  });

  it("reset au base quand la progression est active", () => {
    expect(nextStreamBackoffMs({ type: "screening", previousMs: 2000, progressed: true })).toBe(500);
    expect(nextStreamBackoffMs({ type: "full_analysis", previousMs: 5000, progressed: true })).toBe(2000);
  });

  it("double sans depasser le cap (fast)", () => {
    expect(nextStreamBackoffMs({ type: "screening", previousMs: 500, progressed: false })).toBe(1000);
    expect(nextStreamBackoffMs({ type: "screening", previousMs: 1000, progressed: false })).toBe(2000);
    expect(nextStreamBackoffMs({ type: "screening", previousMs: 2000, progressed: false })).toBe(2000);
  });

  it("double sans depasser le cap (slow)", () => {
    expect(nextStreamBackoffMs({ type: "full_analysis", previousMs: 2000, progressed: false })).toBe(4000);
    expect(nextStreamBackoffMs({ type: "full_analysis", previousMs: 4000, progressed: false })).toBe(5000);
    expect(nextStreamBackoffMs({ type: "full_analysis", previousMs: 5000, progressed: false })).toBe(5000);
  });
});

describe("DEFAULT_STREAM_HARD_TIMEOUT_MS", () => {
  it("vaut 10 minutes", () => {
    expect(DEFAULT_STREAM_HARD_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});
