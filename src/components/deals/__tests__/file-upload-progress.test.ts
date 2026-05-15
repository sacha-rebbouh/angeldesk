import { describe, expect, it } from "vitest";

import {
  mergeMonotonicProgress,
  type UploadProgressSnapshot,
} from "../file-upload";

function snapshot(partial: Partial<UploadProgressSnapshot>): UploadProgressSnapshot {
  return {
    phase: "started",
    pageCount: 0,
    pagesProcessed: 0,
    percent: 0,
    ...partial,
  };
}

describe("mergeMonotonicProgress", () => {
  it("returns the next snapshot when there is no previous snapshot", () => {
    const next = snapshot({ percent: 5, message: "starting" });
    expect(mergeMonotonicProgress(null, next)).toEqual(next);
  });

  it("prevents the displayed percent from going backwards mid-upload", () => {
    const prev = snapshot({ percent: 36, message: "transfer done" });
    const next = snapshot({ percent: 1, message: "extraction queued" });

    const merged = mergeMonotonicProgress(prev, next);

    expect(merged.percent).toBe(36);
    expect(merged.message).toBe("extraction queued");
  });

  it("accepts a strictly higher percent", () => {
    const prev = snapshot({ percent: 36 });
    const next = snapshot({ percent: 60 });

    expect(mergeMonotonicProgress(prev, next).percent).toBe(60);
  });

  it("allows the percent to drop when entering the terminal 'completed' phase", () => {
    const prev = snapshot({ percent: 80, phase: "started" });
    const next = snapshot({ percent: 100, phase: "completed" });

    expect(mergeMonotonicProgress(prev, next)).toEqual(next);
  });

  it("allows the percent to drop when entering the terminal 'failed' phase", () => {
    const prev = snapshot({ percent: 65, phase: "started" });
    const next = snapshot({ percent: 0, phase: "failed", message: "OCR failed" });

    const merged = mergeMonotonicProgress(prev, next);
    // Terminal phases bypass the monotonic guard so the UI can settle.
    expect(merged.phase).toBe("failed");
    expect(merged.percent).toBe(0);
  });

  it("keeps the higher of two equal-percent snapshots unchanged", () => {
    const prev = snapshot({ percent: 50 });
    const next = snapshot({ percent: 50, message: "still processing" });

    expect(mergeMonotonicProgress(prev, next).percent).toBe(50);
    expect(mergeMonotonicProgress(prev, next).message).toBe("still processing");
  });
});
