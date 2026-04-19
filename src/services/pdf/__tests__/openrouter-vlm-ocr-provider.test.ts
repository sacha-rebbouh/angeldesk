import { beforeEach, describe, expect, it, vi } from "vitest";

const processImageOCRMock = vi.fn();
const processImageArtifactOCRMock = vi.fn();

vi.mock("../ocr-service", () => ({
  processImageOCR: processImageOCRMock,
  processImageArtifactOCR: processImageArtifactOCRMock,
}));

describe("OpenRouterVlmPageOcrProvider", () => {
  beforeEach(() => {
    processImageOCRMock.mockReset();
    processImageArtifactOCRMock.mockReset();
  });

  it("wraps the standard image OCR path for text-only extraction", async () => {
    processImageOCRMock.mockResolvedValue({
      text: "Revenue 12.4m",
      confidence: "high",
      cost: 0.002,
    });

    const { createOpenRouterVlmPageOcrProvider, OPENROUTER_VLM_PAGE_OCR_PROVIDER_ID } = await import("../providers");
    const provider = createOpenRouterVlmPageOcrProvider();
    const result = await provider.extractText({
      imageBuffer: Buffer.from("page-image"),
      format: "png",
      pageNumber: 3,
    });

    expect(processImageOCRMock).toHaveBeenCalledWith(Buffer.from("page-image"), "png");
    expect(result.provider.id).toBe(OPENROUTER_VLM_PAGE_OCR_PROVIDER_ID);
    expect(result.pageNumber).toBe(3);
    expect(result.mode).toBe("standard");
    expect(result.text).toBe("Revenue 12.4m");
  });

  it("wraps artifact OCR with the current high-fidelity default and preserves provider-specific fields", async () => {
    processImageArtifactOCRMock.mockResolvedValue({
      pageNumber: 2,
      text: "Revenue bridge",
      confidence: "medium",
      hasCharts: true,
      hasImages: false,
      processingTimeMs: 1200,
      cost: 0.006,
      mode: "high_fidelity",
      cacheHit: true,
      artifact: {
        version: "document-page-artifact-v1",
        pageNumber: 2,
        text: "Revenue bridge",
        visualBlocks: [{ type: "chart", description: "Bridge chart", confidence: "medium" }],
        tables: [],
        charts: [{ description: "Bridge chart", confidence: "medium" }],
        unreadableRegions: [],
        numericClaims: [],
        confidence: "medium",
        needsHumanReview: false,
      },
    });

    const { createOpenRouterVlmPageOcrProvider, getDefaultOpenRouterArtifactMode } = await import("../providers");
    const provider = createOpenRouterVlmPageOcrProvider();
    const result = await provider.extractArtifact({
      imageBuffer: Buffer.from("page-image"),
      format: "jpeg",
      pageNumber: 2,
    });

    expect(getDefaultOpenRouterArtifactMode()).toBe("high_fidelity");
    expect(processImageArtifactOCRMock).toHaveBeenCalledWith(
      Buffer.from("page-image"),
      "jpeg",
      2,
      "high_fidelity"
    );
    expect(result.cacheHit).toBe(true);
    expect(result.hasCharts).toBe(true);
    expect(result.mode).toBe("high_fidelity");
    expect(result.artifact?.version).toBe("document-page-artifact-v1");
  });

  it("passes through an explicit OCR mode override", async () => {
    processImageArtifactOCRMock.mockResolvedValue({
      pageNumber: 1,
      text: "Supreme result",
      confidence: "high",
      hasCharts: false,
      hasImages: true,
      processingTimeMs: 500,
      cost: 0.015,
      mode: "supreme",
    });

    const { createOpenRouterVlmPageOcrProvider } = await import("../providers");
    const provider = createOpenRouterVlmPageOcrProvider();

    await provider.extractArtifact({
      imageBuffer: Buffer.from("page-image"),
      format: "png",
      mode: "supreme",
    });

    expect(processImageArtifactOCRMock).toHaveBeenCalledWith(
      Buffer.from("page-image"),
      "png",
      1,
      "supreme"
    );
  });
});
