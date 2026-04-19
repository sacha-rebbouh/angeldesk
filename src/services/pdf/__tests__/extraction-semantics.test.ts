import { describe, expect, it } from "vitest";

import { assessExtractionSemantics } from "../extraction-semantics";

describe("assessExtractionSemantics", () => {
  it("classifies sparse cover pages explicitly with low structural dependency", () => {
    const result = assessExtractionSemantics({
      pageNumber: 1,
      text: "Private and Confidential\nAppendix",
      charCount: 31,
      wordCount: 4,
      hasTables: false,
      hasCharts: false,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
      isEdgePage: true,
    });

    expect(result.pageClass).toBe("cover_page");
    expect(result.structureDependency).toBe("low");
    expect(result.semanticSufficiency).toBe("partial");
  });

  it("keeps transaction terms pages structurally critical even with abundant text", () => {
    const result = assessExtractionSemantics({
      pageNumber: 7,
      text: [
        "Sources and uses",
        "Pre-money valuation 120.0",
        "Post-money valuation 150.0",
        "Dilution 20%",
        "Board seat, liquidation preference, anti-dilution, pro rata",
        "Rollover 15.0, debt 5.0, equity 30.0",
      ].join("\n"),
      charCount: 220,
      wordCount: 33,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("transaction_terms");
    expect(result.structureDependency).toBe("critical");
    expect(result.shouldBlockIfStructureMissing).toBe(true);
  });

  it("classifies branded section divider pages explicitly as low-structure transitions", () => {
    const result = assessExtractionSemantics({
      pageNumber: 31,
      text: "Financials and Business Plan\n31\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 66,
      wordCount: 9,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("branding_transition");
    expect(result.structureDependency).toBe("low");
    expect(result.shouldBlockIfStructureMissing).toBe(false);
  });

  it("keeps explicit branded section dividers low-structure even when OCR adds noisy artifacts", () => {
    const result = assessExtractionSemantics({
      pageNumber: 36,
      text: "g\na\nm\nTear Sheets\n@\ns\n.u\nm\no\nli .c\nlp\nz\ne\ner\n36\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 92,
      wordCount: 18,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
      artifact: {
        tables: [{ markdown: "| col | value |\n| --- | --- |\n| 36 | 36 |" }],
        charts: [],
        numericClaims: [],
        unreadableRegions: [],
      } as never,
    });

    expect(result.pageClass).toBe("branding_transition");
    expect(result.structureDependency).toBe("low");
  });

  it("treats edge title pages with branding as cover pages even when OCR adds sparse noise", () => {
    const result = assessExtractionSemantics({
      pageNumber: 1,
      text: "Strategy Paper - Norway\nFebruary 2026\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 68,
      wordCount: 9,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
      isEdgePage: true,
    });

    expect(result.pageClass).toBe("cover_page");
    expect(result.structureDependency).toBe("low");
  });

  it("classifies table of contents pages explicitly and keeps analytical value low", () => {
    const result = assessExtractionSemantics({
      pageNumber: 3,
      text: "TABLE OF CONTENTS\nExecutive Summary\nMarket Commentary\nGeoScore Analysis\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 112,
      wordCount: 13,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: true,
    });

    expect(result.pageClass).toBe("table_of_contents");
    expect(result.analyticalValueScore).toBeLessThanOrEqual(20);
    expect(result.shouldBlockIfStructureMissing).toBe(false);
  });

  it("classifies spaced-letter table of contents headings correctly", () => {
    const result = assessExtractionSemantics({
      pageNumber: 3,
      text: "T A B L E O F C O N T E N T S\nExecutive Summary 4\nMarket Commentary 17\nGeoScore Analysis 24\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 136,
      wordCount: 19,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: true,
    });

    expect(result.pageClass).toBe("table_of_contents");
    expect(result.structureDependency).toBe("low");
    expect(result.analyticalValueScore).toBeLessThanOrEqual(20);
  });

  it("classifies contact/closing pages explicitly and keeps noise from escalating to blocking", () => {
    const result = assessExtractionSemantics({
      pageNumber: 57,
      text: "Pithos\n1, Place Saint Gervais 1201 Geneve\nwww.pithos.eu\ncontact@pithos.eu\nPITHOS | PRIVATE AND CONFIDENTIAL",
      charCount: 110,
      wordCount: 14,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
      isEdgePage: true,
    });

    expect(result.pageClass).toBe("closing_contact");
    expect(result.visualNoiseScore).toBeGreaterThan(0);
    expect(result.analyticalValueScore).toBeLessThanOrEqual(20);
  });

  it("keeps dense multi-section narrative pages out of mixed analytics when structure is textual", () => {
    const result = assessExtractionSemantics({
      pageNumber: 13,
      text: [
        "Self-Storage: What is it?",
        "First Generation",
        "Second Generation",
        "Third Generation",
        "Containers",
        "• Most family / small-business owned and operated",
        "• Basic pricing structure with on-demand quotes",
        "• Enhanced security features",
        "• Dynamic pricing introduced",
        "• Multi-story developments",
        "• Storage in standardized shipping containers",
        "Operating Platform as the Primary Performance Differentiator",
      ].join("\n"),
      charCount: 820,
      wordCount: 108,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: false,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("narrative");
    expect(result.structureDependency).toBe("low");
  });

  it("keeps comparative bullet industry slides as narrative when semantics are already explicit in text", () => {
    const result = assessExtractionSemantics({
      pageNumber: 3,
      text: [
        "The IT Managed Services Industry",
        "Strong business fundamentals",
        "but sub-optimized",
        "• Recurring & sticky customers ~100% NRR",
        "• Profitable & cash-generative ~90% cash conversion",
        "• Large & growing market $80B US TAM, 10% CAGR",
        "• Highly fragmented 40k+ independent US MSPs",
        "• Labor-heavy ~50% of the cost base is people",
        "• Low-value tasks ~50% of labor time is automatable",
        "• Sub-scale operations with weak sales engine",
        "• Significant upsell opportunities across customers",
      ].join("\n"),
      charCount: 640,
      wordCount: 84,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: true,
    });

    expect(result.pageClass).toBe("narrative");
    expect(result.structureDependency).toBe("low");
    expect(result.semanticSufficiency).toBe("sufficient");
  });

  it("does not treat generic market ownership language as transaction terms", () => {
    const result = assessExtractionSemantics({
      pageNumber: 13,
      text: [
        "Self-Storage: What is it?",
        "First Generation",
        "Second Generation",
        "Third Generation",
        "Containers",
        "• Institutional ownership steps up",
        "• Dynamic pricing introduced",
        "• Storage in standardized shipping containers",
        "• Enhanced security features",
        "• Sophisticated online marketing introduced",
        "• Basic pricing structure with on-demand quotes",
        "Operating Platform as the Primary Performance Differentiator",
      ].join("\n"),
      charCount: 840,
      wordCount: 112,
      hasTables: true,
      hasCharts: false,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: true,
    });

    expect(result.pageClass).not.toBe("transaction_terms");
    expect(result.pageClass).toBe("narrative");
  });

  it("recognizes dense chart pages with preserved periods and metrics as at least partial", () => {
    const result = assessExtractionSemantics({
      pageNumber: 21,
      text: [
        "Managed Services Revenue ($m) & Customer Evolution",
        "Churn 5.0%",
        "Net Revenue Retention 127%",
        "LTM Dec-25 Revenue in Highly Regulated Industries 60.5%",
        "Jan-22 Mar-22 May-22 Jul-22 Sep-22 Nov-22 Jan-23 Mar-23 May-23 Jul-23 Sep-23 Nov-23",
        "1.3 1.4 1.6 1.9 2.2 2.6 3.0 3.3 3.7 4.1 4.6 4.7 5.5",
      ].join("\n"),
      charCount: 340,
      wordCount: 53,
      hasTables: false,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("chart_kpi");
    expect(result.structureDependency).toBe("high");
    expect(result.labelValueIntegrity).not.toBe("weak");
    expect(result.semanticSufficiency).toBe("partial");
  });

  it("classifies playbook slides as process diagrams when explanatory text preserves the logic", () => {
    const result = assessExtractionSemantics({
      pageNumber: 5,
      text: [
        "The Operational Execution Playbook",
        "Compounding Sourcing Engine",
        "Multi-level structure & acquisition strategy with local operators undertaking best-fit tuck-ins to expand geography, capabilities and deepen verticals",
        "Retaining & Incentivizing the A-team",
        "Differentiated seller proposition offered by our structure with outsized & merit-based incentives",
        "GloCal Governance",
        "Upgraded centralized operations, local market relevance and customer intimacy preserved",
      ].join("\n"),
      charCount: 530,
      wordCount: 69,
      hasTables: false,
      hasCharts: true,
      hasFinancialKeywords: false,
      hasTeamKeywords: true,
      hasMarketKeywords: true,
      artifact: {
        tables: [],
        charts: [],
        numericClaims: [],
        unreadableRegions: [{ reason: "Illustrative boxes not parsed", severity: "high" }],
      } as never,
    });

    expect(result.pageClass).toBe("process_diagram");
    expect(result.structureDependency).toBe("medium");
    expect(result.semanticSufficiency).toBe("sufficient");
    expect(result.shouldBlockIfStructureMissing).toBe(false);
  });

  it("downgrades segmented service infographics to warning-capable high-structure pages", () => {
    const result = assessExtractionSemantics({
      pageNumber: 20,
      text: [
        "High-Value Managed Services",
        "Managed Infrastructure Services",
        "Managed Security Services",
        "Help Desk Services",
        "55.0% Managed Services Total Revenue",
        "38.9% Managed Services Total Revenue",
        "6.1% Managed Services Total Revenue",
        "Value of Services Provided: +++",
        "94% of managed services provided is highly value-add",
        "Managed Services Solutions Adoption Rate",
        "Penetrated Customers",
        "Unpenetrated Customers",
      ].join("\n"),
      charCount: 1010,
      wordCount: 119,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("segmented_infographic");
    expect(result.structureDependency).toBe("high");
    expect(result.semanticSufficiency).toBe("partial");
    expect(result.canDegradeToWarning).toBe(true);
  });

  it("keeps waterfall summaries warning-capable when bridge values and explanatory bullets are preserved", () => {
    const result = assessExtractionSemantics({
      pageNumber: 30,
      text: [
        "2025A Revenue Waterfall",
        "2026F Revenue Waterfall",
        "12.2% 112.2% 76.6% 24.5% 23.4% 100.0%",
        "$1.5m $3.4m $3.6m $13.9m $14.6m $12.4m $7.6m",
        "• Genesis outperformed the FY25 budget by 12.2%",
        "• This outperformance was driven primarily by +55% Managed Services growth",
        "• Genesis has already secured 76.6% of the 2026F revenue target",
        "• The remaining $3.4m is the go-get / buffer",
      ].join("\n"),
      charCount: 890,
      wordCount: 117,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: true,
      artifact: {
        tables: [],
        charts: [{ type: "waterfall", title: "Revenue Waterfall", values: [] }],
        numericClaims: [],
        unreadableRegions: [{ reason: "Some labels are partially obscured", severity: "high" }],
      } as never,
    });

    expect(result.pageClass).toBe("waterfall_summary");
    expect(result.structureDependency).toBe("high");
    expect(result.semanticSufficiency).toBe("partial");
    expect(result.canDegradeToWarning).toBe(true);
  });

  it("classifies asset tear sheets separately from generic mixed analytics", () => {
    const result = assessExtractionSemantics({
      pageNumber: 50,
      text: [
        "Tonsberg Freehold",
        "Population (20-minute drive - subject only) 80034",
        "Average Income (NOK) 700920 Oslo 806040 Norway 647654",
        "NLA (sqm) per 100 people 9.3 16.6 6.6",
        "Revenue 8481 9578 9937 10773 11606 12149",
        "Historical EBITDA is under review to confirm the Seller's cost allocations",
        "2020 2021 2022 2023 2024 2025 2026 2027 2028 2029 2030",
        "Occupied 5512 Vacant 995 Rent psm 1349 YoY 79%",
        "Competitors (3-mile) Market Avg Bodhotell Tonsberg Bodmannen",
      ].join("\n"),
      charCount: 520,
      wordCount: 77,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasTeamKeywords: false,
      hasMarketKeywords: false,
    });

    expect(result.pageClass).toBe("asset_tear_sheet");
    expect(result.structureDependency).toBe("critical");
    expect(result.shouldBlockIfStructureMissing).toBe(true);
    expect(result.minimumEvidence).toContain("comparable set");
  });
});
