import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.4 — real extraction time budget. The durable pipeline arms an
// AbortController; its signal is threaded through `smartExtract` into the OCR
// leaf loops. These tests prove the leaf loop (`processSelectedPdfPages`, via
// the exported `selectiveOCR`) actually CHECKS the signal and stops before
// scheduling rendering/OCR work — not a decorative timer.

const renderPagesSpy = vi.fn();

vi.mock("../renderers", () => ({
  createRenderer: () => ({ renderPages: renderPagesSpy }),
  readExtractionRendererId: () => "poppler",
}));

vi.mock("../../openrouter/client", () => ({
  openrouter: {},
  MODELS: {
    GPT4O_MINI: { inputCost: 0.001, outputCost: 0.002 },
    GPT4O: { inputCost: 0.01, outputCost: 0.03 },
  },
}));

vi.mock("../providers/router", () => ({
  createDefaultPdfProviderStack: vi.fn(() => ({
    native: undefined,
    pageOcr: undefined,
    structuredPrimary: undefined,
    structuredFallback: undefined,
  })),
}));

vi.mock("../providers/native-pdf-provider", () => ({
  createPdfJsNativeExtractionProvider: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { documentExtractionPage: { findMany: vi.fn().mockResolvedValue([]) } },
}));

const { selectiveOCR } = await import("../ocr-service");

beforeEach(() => {
  renderPagesSpy.mockReset();
  // Default: render nothing — keeps the test off the real OCR/LLM path. The
  // point under test is WHETHER the loop reaches rendering at all.
  renderPagesSpy.mockResolvedValue([]);
});

describe("selectiveOCR — Phase 4.4 abort budget", () => {
  it("stops BEFORE rendering when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(); // budget already fired

    const result = await selectiveOCR(Buffer.from("pdf"), [0, 1, 2], "native corpus text", {
      signal: controller.signal,
    });

    // The leaf loop checked `signal.aborted` at the top of the first
    // iteration and broke out — no batch was ever rendered.
    expect(renderPagesSpy).not.toHaveBeenCalled();
    expect(result.pagesProcessed).toBe(0);
    expect(result.pageResults).toEqual([]);
    // It still returns a well-formed (empty) result — the pipeline, not this
    // loop, decides that an aborted run is a failure.
    expect(result.success).toBe(true);
  });

  it("DOES render when no abort signal is supplied (proves the signal is the gate)", async () => {
    const result = await selectiveOCR(Buffer.from("pdf"), [0, 1, 2], "native corpus text");

    // Control: without a signal the loop proceeds to render the batch.
    expect(renderPagesSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("does not render any further batch once the signal aborts after the first batch", async () => {
    // 8 pages → 2 batches of BATCH_SIZE=4. The renderer aborts the budget
    // during the first batch; the loop must NOT schedule the second.
    const controller = new AbortController();
    renderPagesSpy.mockImplementation(async () => {
      controller.abort();
      return [];
    });

    await selectiveOCR(Buffer.from("pdf"), [0, 1, 2, 3, 4, 5, 6, 7], "native corpus text", {
      signal: controller.signal,
    });

    // Batch 1 rendered (and aborted mid-way); batch 2 was never scheduled.
    expect(renderPagesSpy).toHaveBeenCalledTimes(1);
  });
});
