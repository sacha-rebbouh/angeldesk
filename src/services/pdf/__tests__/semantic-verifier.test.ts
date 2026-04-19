import { describe, expect, it } from "vitest";

import { verifyPageArtifact } from "../semantic-verifier";

describe("verifyPageArtifact", () => {
  it("keeps provider-structured analytical pages clear when structure and grounding are present", () => {
    const result = verifyPageArtifact({
      pageNumber: 12,
      nativeText: "Revenue bridge\n2025A 12.4m\n2026F 18.1m",
      combinedText: "Revenue bridge\n2025A 12.4m\n2026F 18.1m",
      flags: {
        hasCharts: true,
        hasFinancialKeywords: true,
        visualRiskScore: 82,
      },
      semanticAssessment: {
        pageClass: "waterfall_summary",
        classConfidence: "high",
        classReasons: ["bridge and financial labels"],
        structureDependency: "high",
        semanticSufficiency: "sufficient",
        labelValueIntegrity: "strong",
        visualNoiseScore: 12,
        analyticalValueScore: 72,
        requiresStructuredPreservation: true,
        shouldBlockIfStructureMissing: true,
        canDegradeToWarning: false,
        minimumEvidence: ["bridge steps"],
        rationale: ["values are preserved"],
      },
      artifact: {
        version: "document-page-artifact-v2",
        pageNumber: 12,
        text: "Revenue bridge\n2025A 12.4m\n2026F 18.1m",
        visualBlocks: [{ type: "chart", description: "Revenue bridge chart", confidence: "high" }],
        tables: [],
        charts: [{
          title: "Revenue bridge",
          chartType: "waterfall",
          description: "Revenue bridge chart",
          values: [
            { label: "2025A", value: "12.4m" },
            { label: "2026F", value: "18.1m" },
          ],
          confidence: "high",
        }],
        unreadableRegions: [],
        numericClaims: [
          { label: "2025A", value: "12.4m", sourceText: "2025A 12.4m", confidence: "high" },
          { label: "2026F", value: "18.1m", sourceText: "2026F 18.1m", confidence: "high" },
        ],
        confidence: "high",
        needsHumanReview: false,
        provider: {
          kind: "openrouter-vlm",
          modelId: "openai/gpt-5.4",
          mode: "high_fidelity",
          providerVersion: "openrouter-v1",
          promptVersion: "ocr-structured-v2",
          schemaVersion: "ocr-structured-schema-v1",
          transport: "json_schema",
        },
        verification: {
          state: "provider_structured",
          evidence: ["chart_count=1", "numeric_claims=2"],
        },
      },
    });

    expect(result.verification.state).toBe("provider_structured");
    expect(result.completeness.level).toBe("complete");
    expect(result.completeness.sourceAgreement).toBe("strong");
    expect(result.completeness.missingEvidence).toEqual([]);
    expect(result.recommendation).toBe("clear");
    expect(result.blocksAnalysis).toBe(false);
  });

  it("blocks structure-critical pages when required chart evidence is missing", () => {
    const result = verifyPageArtifact({
      pageNumber: 23,
      nativeText: "NRR 118%\nLogo retention 94%\nPipeline 6.2m",
      combinedText: "NRR 118%\nLogo retention 94%\nPipeline 6.2m",
      flags: {
        hasCharts: true,
        hasFinancialKeywords: true,
        visualRiskScore: 88,
      },
      semanticAssessment: {
        pageClass: "chart_kpi",
        classConfidence: "high",
        classReasons: ["kpi chart page"],
        structureDependency: "critical",
        semanticSufficiency: "partial",
        labelValueIntegrity: "mixed",
        visualNoiseScore: 34,
        analyticalValueScore: 80,
        requiresStructuredPreservation: true,
        shouldBlockIfStructureMissing: true,
        canDegradeToWarning: false,
        minimumEvidence: ["series labels", "chart values"],
        rationale: ["chart carries the page meaning"],
      },
      artifact: {
        version: "document-page-artifact-v2",
        pageNumber: 23,
        text: "NRR 118%\nLogo retention 94%\nPipeline 6.2m",
        visualBlocks: [{ type: "text", description: "Only freeform OCR text recovered", confidence: "medium" }],
        tables: [],
        charts: [],
        unreadableRegions: [],
        numericClaims: [],
        confidence: "medium",
        needsHumanReview: true,
        provider: {
          kind: "openrouter-vlm",
          modelId: "openai/gpt-4o",
          mode: "high_fidelity",
          providerVersion: "openrouter-v1",
          promptVersion: "ocr-standard-v2",
          transport: "legacy_text",
        },
      },
    });

    expect(result.completeness.level).toBe("insufficient");
    expect(result.completeness.missingEvidence).toContain("chart_structure");
    expect(result.recommendation).toBe("blocking");
    expect(result.reasons.join(" ")).toContain("missing evidence");
    expect(result.verification.issues).toContain("missing_chart_structure");
  });

  it("downgrades partially structured critical pages to warning when semantic evidence is already strong", () => {
    const result = verifyPageArtifact({
      pageNumber: 18,
      nativeText: "Revenue split\nSMB 42%\nEnterprise 58%\nNRR 118%",
      combinedText: "Revenue split\nSMB 42%\nEnterprise 58%\nNRR 118%",
      flags: {
        hasCharts: true,
        hasTables: true,
        hasFinancialKeywords: true,
        visualRiskScore: 92,
      },
      semanticAssessment: {
        pageClass: "mixed_visual_analytics",
        classConfidence: "high",
        classReasons: ["table and chart on same page"],
        structureDependency: "critical",
        semanticSufficiency: "sufficient",
        labelValueIntegrity: "strong",
        visualNoiseScore: 18,
        analyticalValueScore: 88,
        requiresStructuredPreservation: true,
        shouldBlockIfStructureMissing: true,
        canDegradeToWarning: false,
        minimumEvidence: ["table mapping", "chart semantics"],
        rationale: ["headline metrics and labels are preserved"],
      },
      artifact: {
        version: "document-page-artifact-v2",
        pageNumber: 18,
        text: "Revenue split\nSMB 42%\nEnterprise 58%\nNRR 118%",
        visualBlocks: [{ type: "table", description: "Segment split table", confidence: "high" }],
        tables: [{
          markdown: "| Segment | Value |\n| SMB | 42% |\n| Enterprise | 58% |",
          rows: [["Segment", "Value"], ["SMB", "42%"], ["Enterprise", "58%"]],
          confidence: "high",
        }],
        charts: [],
        unreadableRegions: [],
        numericClaims: [
          { label: "SMB", value: "42%", sourceText: "SMB 42%", confidence: "high" },
          { label: "Enterprise", value: "58%", sourceText: "Enterprise 58%", confidence: "high" },
          { label: "NRR", value: "118%", sourceText: "NRR 118%", confidence: "high" },
        ],
        confidence: "high",
        needsHumanReview: false,
        provider: {
          kind: "google-document-ai",
          providerVersion: "documentai-v1",
          transport: "provider_structured",
        },
        verification: {
          state: "provider_structured",
          evidence: ["tables:1", "numeric_claims:3"],
        },
      },
    });

    expect(result.completeness.level).toBe("partial");
    expect(result.completeness.missingEvidence).toContain("chart_structure");
    expect(result.recommendation).toBe("warning");
    expect(result.blocksAnalysis).toBe(false);
  });

  it("downgrades weak agreement heuristic artifacts to warning when low-information pages are otherwise complete", () => {
    const result = verifyPageArtifact({
      pageNumber: 3,
      nativeText: "Table of Contents\n1. Market Overview\n2. Team\n3. Financials",
      combinedText: "Table of Contents\n1. Market Overview\n2. Team\n3. Financials",
      flags: {
        hasTables: false,
        hasCharts: false,
      },
      semanticAssessment: {
        pageClass: "table_of_contents",
        classConfidence: "high",
        classReasons: ["toc heading"],
        structureDependency: "low",
        semanticSufficiency: "sufficient",
        labelValueIntegrity: "strong",
        visualNoiseScore: 8,
        analyticalValueScore: 10,
        requiresStructuredPreservation: false,
        shouldBlockIfStructureMissing: false,
        canDegradeToWarning: true,
        minimumEvidence: ["section titles"],
        rationale: ["low-information page"],
      },
      artifact: {
        version: "document-page-artifact-v2",
        pageNumber: 3,
        text: "Contents agenda summary", // intentionally weak overlap
        visualBlocks: [],
        tables: [],
        charts: [],
        unreadableRegions: [],
        numericClaims: [],
        confidence: "low",
        needsHumanReview: false,
        provider: {
          kind: "openrouter-vlm",
          modelId: "openai/gpt-4o-mini",
          mode: "standard",
          providerVersion: "openrouter-v1",
          promptVersion: "ocr-standard-v2",
          transport: "legacy_text",
        },
      },
    });

    expect(result.completeness.level).toBe("complete");
    expect(result.completeness.sourceAgreement).toBe("weak");
    expect(result.recommendation).toBe("warning");
    expect(result.blocksAnalysis).toBe(false);
    expect(result.verification.issues).toContain("weak_source_agreement");
  });

  it("treats parse failure and high unreadable regions as blocking", () => {
    const result = verifyPageArtifact({
      pageNumber: 31,
      combinedText: "Buyer Target TEV EBITDA multiple",
      flags: {
        hasTables: true,
        hasFinancialKeywords: true,
      },
      semanticAssessment: {
        pageClass: "structured_table",
        classConfidence: "high",
        classReasons: ["table comparables"],
        structureDependency: "critical",
        semanticSufficiency: "insufficient",
        labelValueIntegrity: "weak",
        visualNoiseScore: 30,
        analyticalValueScore: 85,
        requiresStructuredPreservation: true,
        shouldBlockIfStructureMissing: true,
        canDegradeToWarning: false,
        minimumEvidence: ["column mapping"],
        rationale: ["table values missing"],
      },
      artifact: {
        version: "document-page-artifact-v2",
        pageNumber: 31,
        text: "",
        visualBlocks: [],
        tables: [],
        charts: [],
        unreadableRegions: [{ reason: "page render failed", severity: "high" }],
        numericClaims: [],
        confidence: "low",
        needsHumanReview: true,
        verification: {
          state: "parse_failed",
          evidence: [],
          issues: ["schema_invalid"],
        },
      },
    });

    expect(result.verification.state).toBe("parse_failed");
    expect(result.completeness.level).toBe("insufficient");
    expect(result.recommendation).toBe("blocking");
    expect(result.blocksAnalysis).toBe(true);
  });

  it("keeps artifact-free narrative pages non-blocking when no structure is expected", () => {
    const result = verifyPageArtifact({
      pageNumber: 7,
      nativeText: "This market remains highly fragmented with clear whitespace for roll-up strategies.",
      combinedText: "This market remains highly fragmented with clear whitespace for roll-up strategies.",
      flags: {
        hasMarketKeywords: true,
        hasTables: false,
        hasCharts: false,
      },
      semanticAssessment: {
        pageClass: "narrative",
        classConfidence: "medium",
        classReasons: ["multi-section narrative"],
        structureDependency: "low",
        semanticSufficiency: "sufficient",
        labelValueIntegrity: "strong",
        visualNoiseScore: 4,
        analyticalValueScore: 28,
        requiresStructuredPreservation: false,
        shouldBlockIfStructureMissing: false,
        canDegradeToWarning: true,
        minimumEvidence: ["narrative text"],
        rationale: ["text captures the page"],
      },
    });

    expect(result.completeness.level).toBe("complete");
    expect(result.recommendation).toBe("clear");
    expect(result.verification.state).toBe("unverified");
    expect(result.supportsManifestGating).toBe(true);
  });
});
