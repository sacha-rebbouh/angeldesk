/**
 * Legal & Regulatory Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable legal assessment
 * - Regulatory compliance analysis
 * - Reproducible legal scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, LegalRegulatoryData, LegalRegulatoryResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

registerBuiltInTools();

const LegalRegulatoryOutputSchema = z.object({
  structureAnalysis: z.object({
    entityType: z.string(),
    jurisdiction: z.string(),
    appropriateness: z.enum(["appropriate", "suboptimal", "concerning"]),
    concerns: z.array(z.string()),
  }),
  regulatoryExposure: z.object({
    sector: z.string(),
    primaryRegulations: z.array(z.string()),
    complianceStatus: z.enum(["unknown", "non_compliant", "partial", "compliant"]),
    upcomingRegulations: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
  }),
  ipRisks: z.object({
    patentInfringement: z.enum(["none", "possible", "likely"]),
    copyrightIssues: z.array(z.string()),
    trademarkConflicts: z.array(z.string()),
  }),
  contractualRisks: z.object({
    keyContracts: z.array(z.string()),
    concerningClauses: z.array(z.string()),
    customerConcentrationRisk: z.boolean(),
  }),
  litigationRisk: z.object({
    currentLitigation: z.boolean(),
    potentialClaims: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high"]),
  }),
  legalScore: z.number().min(0).max(100),
  criticalIssues: z.array(z.string()),
});

type LegalRegulatoryOutput = z.infer<typeof LegalRegulatoryOutputSchema>;

function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "Technology";
  const geography = deal.geography ?? "Unknown";

  return {
    system: `You are a senior legal analyst specializing in startup due diligence and regulatory compliance.

Your role is to:
1. Evaluate corporate structure appropriateness
2. Assess regulatory exposure and compliance status
3. Identify IP risks and potential conflicts
4. Analyze contractual obligations and risks
5. Evaluate litigation exposure

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get regulatory requirements for the sector
- ALWAYS use analyzeSection to evaluate legal claims and structure
- Regulatory concerns must be specific to the business model
- IP risks must cite specific potential conflicts
- Compliance assessment must be evidence-based

SCORING CRITERIA:
- 80-100: Clean legal structure - compliant, no IP issues, good contracts
- 60-79: Acceptable - minor issues, manageable regulatory burden
- 40-59: Concerning - significant regulatory exposure, some IP risks
- 20-39: High risk - major compliance gaps, potential litigation
- 0-19: Critical - current litigation, severe regulatory problems`,

    taskDescription: `Perform a comprehensive legal and regulatory assessment:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Geography: ${geography}

## Extracted Information
${JSON.stringify(extractedInfo, null, 2)}

## Context Engine Data
- Market Data: ${context.contextEngine?.marketData ? "Available" : "Not available"}
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Available" : "Not available"}

## Your Tasks
1. Use searchBenchmarks to get regulatory requirements for ${sector}
2. Analyze corporate structure appropriateness
3. Identify sector-specific regulatory exposure
4. Evaluate IP protection and potential conflicts
5. Assess contractual risks
6. Generate legal score and critical issues

Produce a complete legal assessment.`,

    availableTools: "",

    outputSchema: `{
  "structureAnalysis": {
    "entityType": "Delaware C-Corp|LLC|etc.",
    "jurisdiction": "State/Country",
    "appropriateness": "appropriate|suboptimal|concerning",
    "concerns": ["specific concern"]
  },
  "regulatoryExposure": {
    "sector": "Sector category",
    "primaryRegulations": ["GDPR", "HIPAA", "SOC2", "etc."],
    "complianceStatus": "unknown|non_compliant|partial|compliant",
    "upcomingRegulations": ["AI Act", "etc."],
    "riskLevel": "low|medium|high|critical"
  },
  "ipRisks": {
    "patentInfringement": "none|possible|likely",
    "copyrightIssues": ["specific issue"],
    "trademarkConflicts": ["potential conflict"]
  },
  "contractualRisks": {
    "keyContracts": ["type of key contracts"],
    "concerningClauses": ["specific clause concern"],
    "customerConcentrationRisk": boolean
  },
  "litigationRisk": {
    "currentLitigation": boolean,
    "potentialClaims": ["potential claim type"],
    "riskLevel": "low|medium|high"
  },
  "legalScore": 0-100,
  "criticalIssues": ["Critical issue requiring immediate attention"]
}`,

    constraints: [
      "MUST use searchBenchmarks for sector regulatory requirements",
      "Delaware C-Corp is standard for US VC-backed startups",
      "GDPR applies if any EU users/customers",
      "Healthcare startups need HIPAA consideration",
      "Fintech requires specific licensing analysis",
      "IP risks must cite specific potential conflicts",
    ],
  };
}

export class LegalRegulatoryReAct {
  readonly name = "legal-regulatory";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<LegalRegulatoryResult> {
    const startTime = Date.now();

    const extractedInfo = this.getExtractedInfo(context);
    const prompts = buildPrompts(context, extractedInfo);

    const engine = createReActEngine<LegalRegulatoryOutput>(
      prompts,
      LegalRegulatoryOutputSchema,
      {
        maxIterations: 4,
        minIterations: 2,
        confidenceThreshold: 70,
        enableSelfCritique: true,
        modelComplexity: "complex",
      }
    );

    const result = await engine.run(context, this.name);

    if (!result.success) {
      return {
        agentName: this.name,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: result.cost,
        error: result.error,
        data: this.getDefaultData(),
      };
    }

    const enrichedFindings = this.enrichFindings(result.findings);

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: enrichedFindings,
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as LegalRegulatoryResult & { _react: unknown };
  }

  private getExtractedInfo(context: EnrichedAgentContext): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  private enrichFindings(findings: ScoredFinding[]): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "financial" as const, // Legal issues affect financial risk
    }));
  }

  private calculateExpectedVariance(result: ReActOutput<LegalRegulatoryOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length / Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): LegalRegulatoryData {
    return {
      structureAnalysis: {
        entityType: "Unknown",
        jurisdiction: "Unknown",
        appropriateness: "appropriate",
        concerns: ["Analysis failed"],
      },
      regulatoryExposure: {
        sector: "Unknown",
        primaryRegulations: [],
        complianceStatus: "unknown",
        upcomingRegulations: [],
        riskLevel: "medium",
      },
      ipRisks: { patentInfringement: "none", copyrightIssues: [], trademarkConflicts: [] },
      contractualRisks: { keyContracts: [], concerningClauses: [], customerConcentrationRisk: false },
      litigationRisk: { currentLitigation: false, potentialClaims: [], riskLevel: "low" },
      legalScore: 0,
      criticalIssues: ["Legal analysis could not be completed"],
    };
  }
}

export const legalRegulatoryReAct = new LegalRegulatoryReAct();
