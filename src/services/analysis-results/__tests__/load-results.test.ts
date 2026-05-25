import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    analysis: {
      findUnique: vi.fn(),
    },
  },
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/services/storage", () => ({
  downloadFile: mocks.downloadFile,
  uploadFile: mocks.uploadFile,
  storageConfig: { isConfigured: false },
}));

import { loadResults } from "../load-results";

describe("loadResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadFile.mockResolvedValue({
      url: "/uploads/analysis-results/analysis_1.json",
      pathname: "analysis-results/analysis_1.json",
    });
  });

  it("falls back to DB and overwrites cache when cached results are incomplete", async () => {
    const staleResults = {
      "document-extractor": { success: true },
      "deck-forensics": { success: false },
      _costReport: { totalCost: 1.25 },
    };
    const dbResults = {
      "document-extractor": { success: true },
      "financial-auditor": { success: true },
    };

    mocks.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(staleResults)));
    mocks.prisma.analysis.findUnique
      .mockResolvedValueOnce({ status: "COMPLETED", completedAgents: 2 })
      .mockResolvedValueOnce({ results: dbResults });

    const result = await loadResults("analysis_1");

    expect(result).toEqual(dbResults);
    expect(mocks.prisma.analysis.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      "analysis-results/analysis_1.json",
      expect.any(Buffer),
      { access: "private", allowOverwrite: true }
    );
  });

  it("uses cache when it contains at least the completed agent count", async () => {
    const cachedResults = {
      "document-extractor": { success: true },
      "financial-auditor": { success: true },
    };

    mocks.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(cachedResults)));
    mocks.prisma.analysis.findUnique.mockResolvedValueOnce({
      status: "COMPLETED",
      completedAgents: 2,
    });

    const result = await loadResults("analysis_1");

    expect(result).toEqual(cachedResults);
    expect(mocks.prisma.analysis.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
});
