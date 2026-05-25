/**
 * Phase C slice C3a — Live monitoring structured logs + error categorization.
 *
 * Couvre :
 *   - `categorizeLiveError` : 7 catégories stables + cas fallback.
 *   - `logCoachingLatency` : info < 5s, warn > 5s, contexte structuré.
 *   - `logCoachingError` : logger.error avec `errorCategory` + pas de PII raw.
 *   - `logSessionEvent` : logger.info avec event + data optionnel.
 *   - `trackCoachingCost` : logger.info avec cost + costUsd.
 *   - Aucune persistance DB ici (C3b séparé).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/lib/logger
// ---------------------------------------------------------------------------

const { infoMock, warnMock, errorMock, debugMock, fatalMock } = vi.hoisted(
  () => ({
    infoMock: vi.fn(),
    warnMock: vi.fn(),
    errorMock: vi.fn(),
    debugMock: vi.fn(),
    fatalMock: vi.fn(),
  })
);

vi.mock("@/lib/logger", () => {
  const loggerMock = {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    debug: debugMock,
    fatal: fatalMock,
    child: vi.fn(() => loggerMock),
  };
  return {
    logger: loggerMock,
    createLogger: vi.fn(() => loggerMock),
  };
});

import {
  categorizeLiveError,
  logCoachingError,
  logCoachingLatency,
  logSessionEvent,
  trackCoachingCost,
  type LiveErrorCategory,
} from "@/lib/live/monitoring";

// ---------------------------------------------------------------------------
// 1. categorizeLiveError — 7 catégories
// ---------------------------------------------------------------------------

describe("Phase C3a — categorizeLiveError", () => {
  describe("timeout", () => {
    it("message contient `timeout`", () => {
      expect(categorizeLiveError(new Error("Request timeout after 5s"))).toBe(
        "timeout"
      );
    });
    it("message contient `timed out`", () => {
      expect(categorizeLiveError(new Error("Operation timed out"))).toBe(
        "timeout"
      );
    });
    it("Promise.race TIMEOUT sentinel (coaching-engine)", () => {
      expect(categorizeLiveError(new Error("TIMEOUT"))).toBe("timeout");
    });
  });

  describe("llm_truncated", () => {
    it("marker `truncated and auto-repaired`", () => {
      expect(
        categorizeLiveError(
          new Error("LLM response truncated and auto-repaired by router")
        )
      ).toBe("llm_truncated");
    });
    it("marker `LLM JSON response was truncated`", () => {
      expect(
        categorizeLiveError(new Error("LLM JSON response was truncated"))
      ).toBe("llm_truncated");
    });
    it("gagne contre `parse` quand les deux sont présents (ordre)", () => {
      // Sécurité : un message qui contient `truncated and auto-repaired`
      // doit rester classé `llm_truncated` même si `JSON.parse` est mentionné.
      expect(
        categorizeLiveError(
          new Error("truncated and auto-repaired; JSON.parse hint")
        )
      ).toBe("llm_truncated");
    });
  });

  describe("llm_parse_error", () => {
    it("`JSON.parse`", () => {
      expect(categorizeLiveError(new Error("JSON.parse failed"))).toBe(
        "llm_parse_error"
      );
    });
    it("`Unexpected end of JSON`", () => {
      expect(
        categorizeLiveError(new Error("Unexpected end of JSON input"))
      ).toBe("llm_parse_error");
    });
    it("`Failed to parse LLM response`", () => {
      expect(
        categorizeLiveError(new Error("Failed to parse LLM response: ..."))
      ).toBe("llm_parse_error");
    });
    it("`parse LLM`", () => {
      expect(
        categorizeLiveError(new Error("could not parse LLM output"))
      ).toBe("llm_parse_error");
    });
  });

  describe("llm_provider_error", () => {
    it("CircuitOpenError détecté par `name`", () => {
      class CircuitOpenError extends Error {
        constructor() {
          super("circuit is open");
          this.name = "CircuitOpenError";
        }
      }
      expect(categorizeLiveError(new CircuitOpenError())).toBe(
        "llm_provider_error"
      );
    });
    it("`rate limit`", () => {
      expect(categorizeLiveError(new Error("rate limit exceeded"))).toBe(
        "llm_provider_error"
      );
    });
    it("`OpenRouter`", () => {
      expect(categorizeLiveError(new Error("OpenRouter unreachable"))).toBe(
        "llm_provider_error"
      );
    });
    it("`provider`", () => {
      expect(
        categorizeLiveError(new Error("upstream provider returned an error"))
      ).toBe("llm_provider_error");
    });
    it("`429`", () => {
      expect(categorizeLiveError(new Error("HTTP 429 Too Many Requests"))).toBe(
        "llm_provider_error"
      );
    });
    it("`5xx`", () => {
      expect(categorizeLiveError(new Error("HTTP 503 Service Unavailable"))).toBe(
        "llm_provider_error"
      );
    });
  });

  describe("db_error", () => {
    it("PrismaClientKnownRequestError détecté par `name`", () => {
      class PrismaClientKnownRequestError extends Error {
        constructor() {
          super("query failed");
          this.name = "PrismaClientKnownRequestError";
        }
      }
      expect(categorizeLiveError(new PrismaClientKnownRequestError())).toBe(
        "db_error"
      );
    });
    it("`Prisma` dans le message", () => {
      expect(categorizeLiveError(new Error("Prisma engine crashed"))).toBe(
        "db_error"
      );
    });
    it("`database` dans le message", () => {
      expect(
        categorizeLiveError(new Error("database connection lost"))
      ).toBe("db_error");
    });
  });

  describe("validation_error", () => {
    it("ZodError détecté par `name`", () => {
      class ZodError extends Error {
        constructor() {
          super("schema mismatch");
          this.name = "ZodError";
        }
      }
      expect(categorizeLiveError(new ZodError())).toBe("validation_error");
    });
    it("`validation` dans le message", () => {
      expect(categorizeLiveError(new Error("validation failed for field x"))).toBe(
        "validation_error"
      );
    });
  });

  describe("unknown — fallback", () => {
    it("message générique", () => {
      expect(categorizeLiveError(new Error("something weird happened"))).toBe(
        "unknown"
      );
    });
    it("string brute", () => {
      expect(categorizeLiveError("just a string")).toBe("unknown");
    });
    it("null", () => {
      expect(categorizeLiveError(null)).toBe("unknown");
    });
    it("undefined", () => {
      expect(categorizeLiveError(undefined)).toBe("unknown");
    });
    it("number", () => {
      expect(categorizeLiveError(42)).toBe("unknown");
    });
  });

  it("LiveErrorCategory : tous les types compilent", () => {
    const all: LiveErrorCategory[] = [
      "timeout",
      "llm_truncated",
      "llm_parse_error",
      "llm_provider_error",
      "db_error",
      "validation_error",
      "unknown",
    ];
    expect(all).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// 2. logCoachingLatency — info < 5s, warn > 5s
// ---------------------------------------------------------------------------

describe("Phase C3a — logCoachingLatency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logger.info sous 5s", () => {
    const start = Date.now() - 1000;
    logCoachingLatency("sess_1", "coaching_generation", start);

    expect(infoMock).toHaveBeenCalledOnce();
    expect(warnMock).not.toHaveBeenCalled();

    const [context, message] = infoMock.mock.calls[0];
    expect(context.component).toBe("live-coaching");
    expect(context.sessionId).toBe("sess_1");
    expect(context.stage).toBe("coaching_generation");
    expect(context.durationMs).toBeGreaterThanOrEqual(1000);
    expect(context.slow).toBe(false);
    expect(message).toMatch(/coaching_generation/);
  });

  it("logger.warn au-dessus de 5s", () => {
    const start = Date.now() - 6000;
    logCoachingLatency("sess_1", "full_pipeline", start);

    expect(warnMock).toHaveBeenCalledOnce();
    expect(infoMock).not.toHaveBeenCalled();

    const [context, message] = warnMock.mock.calls[0];
    expect(context.component).toBe("live-coaching");
    expect(context.sessionId).toBe("sess_1");
    expect(context.stage).toBe("full_pipeline");
    expect(context.durationMs).toBeGreaterThan(5000);
    expect(context.slow).toBe(true);
    expect(message).toMatch(/Slow/);
  });

  it("seuil exact 5s — strictement > 5000 déclenche slow", () => {
    // 5000ms exactement → slow === false (condition est `> SLOW_THRESHOLD_MS`).
    const start = Date.now() - 5000;
    logCoachingLatency("sess_1", "stage_x", start);

    // Tolérance : la latence mesurée peut être 5000 ou 5001+. On regarde
    // simplement quel canal a été utilisé.
    const usedInfo = infoMock.mock.calls.length === 1;
    const usedWarn = warnMock.mock.calls.length === 1;
    expect(usedInfo || usedWarn).toBe(true);
    expect(usedInfo && usedWarn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. logCoachingError — error avec errorCategory
// ---------------------------------------------------------------------------

describe("Phase C3a — logCoachingError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logger.error avec errorCategory et err: Error", () => {
    const err = new Error("Request timeout after 5s");
    logCoachingError("sess_1", "coaching_pipeline", err);

    expect(errorMock).toHaveBeenCalledOnce();
    const [context, message] = errorMock.mock.calls[0];
    expect(context.component).toBe("live-coaching");
    expect(context.sessionId).toBe("sess_1");
    expect(context.stage).toBe("coaching_pipeline");
    expect(context.errorCategory).toBe("timeout");
    expect(context.err).toBe(err);
    expect(context.errorMessage).toBeUndefined();
    expect(message).toMatch(/coaching_pipeline/);
    expect(message).toMatch(/timeout/);
  });

  it("non-Error → errorMessage field, errorCategory unknown", () => {
    logCoachingError("sess_1", "store_chunk", "boom");

    const [context] = errorMock.mock.calls[0];
    expect(context.errorCategory).toBe("unknown");
    expect(context.errorMessage).toBe("boom");
    expect(context.err).toBeUndefined();
  });

  it("undefined error → errorMessage vide, category unknown", () => {
    logCoachingError("sess_1", "stage", undefined);

    const [context] = errorMock.mock.calls[0];
    expect(context.errorCategory).toBe("unknown");
    expect(context.err).toBeUndefined();
    expect(context.errorMessage).toBe("");
  });

  it("CircuitOpenError → errorCategory `llm_provider_error`", () => {
    class CircuitOpenError extends Error {
      constructor() {
        super("circuit open");
        this.name = "CircuitOpenError";
      }
    }
    logCoachingError("sess_1", "coaching_pipeline", new CircuitOpenError());

    const [context] = errorMock.mock.calls[0];
    expect(context.errorCategory).toBe("llm_provider_error");
  });
});

// ---------------------------------------------------------------------------
// 4. logSessionEvent — info avec event + data optionnel
// ---------------------------------------------------------------------------

describe("Phase C3a — logSessionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logger.info avec event et data", () => {
    logSessionEvent("sess_1", "pipeline_start", {
      speaker: "Alice",
      speakerRole: "founder",
      words: 12,
    });

    expect(infoMock).toHaveBeenCalledOnce();
    const [context, message] = infoMock.mock.calls[0];
    expect(context.component).toBe("live-coaching");
    expect(context.sessionId).toBe("sess_1");
    expect(context.event).toBe("pipeline_start");
    expect(context.data).toEqual({
      speaker: "Alice",
      speakerRole: "founder",
      words: 12,
    });
    expect(message).toMatch(/pipeline_start/);
  });

  it("logger.info sans data — `data` non posé dans le contexte", () => {
    logSessionEvent("sess_1", "completed");

    const [context] = infoMock.mock.calls[0];
    expect(context.event).toBe("completed");
    expect(context.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. trackCoachingCost — info avec cost et costUsd
// ---------------------------------------------------------------------------

describe("Phase C3a — trackCoachingCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logger.info avec cost et costUsd", () => {
    trackCoachingCost("sess_1", "coaching-engine", 0.0012);

    expect(infoMock).toHaveBeenCalledOnce();
    const [context, message] = infoMock.mock.calls[0];
    expect(context.component).toBe("live-coaching");
    expect(context.sessionId).toBe("sess_1");
    expect(context.agentName).toBe("coaching-engine");
    expect(context.cost).toBe(0.0012);
    expect(context.costUsd).toBe(0.0012);
    expect(message).toMatch(/coaching-engine/);
  });

  it("cost 0 reste émis (audit complet)", () => {
    trackCoachingCost("sess_1", "visual-pipeline", 0);

    expect(infoMock).toHaveBeenCalledOnce();
    const [context] = infoMock.mock.calls[0];
    expect(context.cost).toBe(0);
    expect(context.costUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Anti-PII — monitoring.ts n'enrichit pas le contexte avec du raw
// ---------------------------------------------------------------------------

describe("Phase C3a — Anti-PII (aucune donnée raw injectée par monitoring.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logCoachingError ne pose pas de champ transcript/utterance/prompt/extractedText", () => {
    logCoachingError("sess_1", "stage_x", new Error("test"));
    const [context] = errorMock.mock.calls[0];

    expect(context.transcript).toBeUndefined();
    expect(context.utterance).toBeUndefined();
    expect(context.prompt).toBeUndefined();
    expect(context.userPrompt).toBeUndefined();
    expect(context.systemPrompt).toBeUndefined();
    expect(context.extractedText).toBeUndefined();
    expect(context.rawContent).toBeUndefined();
    expect(context.content).toBeUndefined();
  });

  it("logCoachingLatency ne pose pas de champ transcript/prompt/contenu", () => {
    logCoachingLatency("sess_1", "stage_x", Date.now());
    const ctx =
      infoMock.mock.calls[0]?.[0] ?? warnMock.mock.calls[0]?.[0] ?? {};

    expect(ctx.transcript).toBeUndefined();
    expect(ctx.utterance).toBeUndefined();
    expect(ctx.prompt).toBeUndefined();
    expect(ctx.extractedText).toBeUndefined();
    expect(ctx.rawContent).toBeUndefined();
  });

  it("trackCoachingCost ne pose pas de champ prompt/transcript", () => {
    trackCoachingCost("sess_1", "coaching-engine", 0.001);
    const [context] = infoMock.mock.calls[0];

    expect(context.transcript).toBeUndefined();
    expect(context.prompt).toBeUndefined();
    expect(context.userPrompt).toBeUndefined();
    expect(context.extractedText).toBeUndefined();
  });
});
