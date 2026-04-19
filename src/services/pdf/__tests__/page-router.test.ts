import { describe, expect, it } from "vitest";

import {
  chooseExtractionTier,
  detectPageSignals,
  getHighFidelityVisualPageIndices,
  getVisualExtractionPlan,
  scoreVisualExtractionRisk,
} from "../page-router";

describe("page-router", () => {
  it("keeps low-information edge pages in native_only", () => {
    const text = [
      "Strategy Paper",
      "Private and Confidential",
      "This document provides a general overview of the business, its product scope, operating model, and customer proposition.",
      "It is intended to summarize context, explain the history of the company, and describe the current organization without introducing charts, tables, or KPI-heavy exhibits.",
      "The content is narrative only and should stay in native extraction when the page is otherwise low-risk.",
    ].join("\n");
    const flags = detectPageSignals(text, { isEdgePage: true });
    const risk = scoreVisualExtractionRisk(text, flags);

    expect(flags.hasCharts).toBe(false);
    expect(flags.hasTables).toBe(false);
    expect(chooseExtractionTier(text, flags, risk.score)).toBe("native_only");
  });

  it("routes low-text pages to standard_ocr", () => {
    const text = "Revenue 12.4m";
    const flags = detectPageSignals(text);
    const risk = scoreVisualExtractionRisk(text, flags);

    expect(chooseExtractionTier(text, flags, risk.score)).toBe("standard_ocr");
  });

  it("routes dense financial table-like pages to high_fidelity", () => {
    const text = [
      "Regional performance table",
      "North   12   18",
      "South   14   22",
      "East   16   24",
      "West   18   26",
      "Central   20   28",
    ].join("\n");

    const flags = detectPageSignals(text);
    const risk = scoreVisualExtractionRisk(text, flags);

    expect(flags.hasTables).toBe(true);
    expect(risk.score).toBeGreaterThanOrEqual(55);
    expect(risk.score).toBeLessThan(85);
    expect(chooseExtractionTier(text, flags, risk.score)).toBe("high_fidelity");
  });

  it("routes highly visual investment-critical pages to supreme", () => {
    const text = [
      "Revenue chart and bridge waterfall by quarter",
      "Q1 2024 10 12% 14 16% 18 20%",
      "Q2 2024 21 22% 24 26% 28 30%",
      "Q3 2024 31 32% 34 36% 38 40%",
      "Q4 2024 41 42% 44 46% 48 50%",
      "Legend Axis Figure Schedule Timeline Workflow Funnel",
    ].join("\n");

    const flags = detectPageSignals(text);
    const risk = scoreVisualExtractionRisk(text, flags);

    expect(flags.hasCharts).toBe(true);
    expect(risk.score).toBeGreaterThanOrEqual(85);
    expect(chooseExtractionTier(text, flags, risk.score)).toBe("supreme");
  });

  it("builds a visual extraction plan and surfaces high/supreme page indices", () => {
    const pageTexts = [
      "Strategy Paper\n2026\nPrivate and Confidential",
      [
        "Strategy Paper",
        "Private and Confidential",
        "This document provides a general overview of the business, its product scope, operating model, and customer proposition.",
        "It is intended to summarize context, explain the history of the company, and describe the current organization without introducing charts, tables, or KPI-heavy exhibits.",
        "The content is narrative only and should stay in native extraction when the page is otherwise low-risk.",
      ].join("\n"),
      "Revenue 12.4m",
      [
        "Regional performance table",
        "North   12   18",
        "South   14   22",
        "East   16   24",
        "West   18   26",
        "Central   20   28",
      ].join("\n"),
      [
        "Revenue chart and bridge waterfall by quarter",
        "Q1 2024 10 12% 14 16% 18 20%",
        "Q2 2024 21 22% 24 26% 28 30%",
        "Q3 2024 31 32% 34 36% 38 40%",
        "Q4 2024 41 42% 44 46% 48 50%",
        "Legend Axis Figure Schedule Timeline Workflow Funnel",
      ].join("\n"),
    ];

    const plan = getVisualExtractionPlan(pageTexts);

    expect(plan.map((page) => page.tier)).toEqual([
      "standard_ocr",
      "native_only",
      "standard_ocr",
      "high_fidelity",
      "supreme",
    ]);
    expect(getHighFidelityVisualPageIndices(pageTexts)).toEqual([3, 4]);
  });
});
