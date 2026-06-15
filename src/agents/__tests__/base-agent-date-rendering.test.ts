/**
 * Test #23 §6.5 from docs-private/evidence-engine-phase1-schema.md.
 * Covers the quick fix for the base-agent.ts:976 bug documented in audit §6.1
 * and tracked in errors.md 2026-05-17 (CONTEXT-ENGINE).
 *
 * Before fix: FILE document with sourceDate=null, receivedAt=null, uploadedAt=2026-05-17
 * was rendered as "### name (Fichier, TYPE) — produit le 17/05/2026 (...), importé le 17/05/2026 (...)"
 * which is FALSE — uploadedAt is not a production date.
 *
 * After fix: the same document is rendered as "produit le date inconnue, importé le 17/05/2026".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  completeJSON: vi.fn(),
  completeJSONWithFallback: vi.fn(),
  completeJSONStreaming: vi.fn(),
  stream: vi.fn(),
  getAnalysisContext: vi.fn(),
  runWithLLMContext: vi.fn(),
  setAgentContext: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  complete: routerMocks.complete,
  completeJSON: routerMocks.completeJSON,
  completeJSONWithFallback: routerMocks.completeJSONWithFallback,
  completeJSONStreaming: routerMocks.completeJSONStreaming,
  stream: routerMocks.stream,
  getAnalysisContext: routerMocks.getAnalysisContext,
  runWithLLMContext: routerMocks.runWithLLMContext,
  setAgentContext: routerMocks.setAgentContext,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: routerMocks.loggerWarn, error: routerMocks.loggerError },
}));

const { BaseAgent } = await import("../base-agent");
import type { AgentContext } from "../types";

class TestAgent extends BaseAgent<{ ok: boolean }> {
  constructor() {
    super({
      name: "test-agent-date",
      description: "Test agent for date rendering",
      modelComplexity: "medium",
      maxRetries: 1,
      timeoutMs: 1000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return "test";
  }

  protected async execute(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  publicFormatDealContext(context: AgentContext): string {
    return this.formatDealContext(context);
  }
}

const minimalDeal = {
  id: "deal-1",
  userId: "u-1",
  name: "Test Deal",
  companyName: "Test Corp",
  website: null,
  description: null,
  sector: null,
  stage: null,
  instrument: null,
  geography: null,
  amountRequested: null,
  valuationPre: null,
  arr: null,
  growthRate: null,
  status: "SCREENING",
  conditionsAnalysis: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as AgentContext["deal"];

const baseDoc = {
  id: "doc-1",
  name: "Cap table.png",
  type: "CAP_TABLE",
  sourceKind: "FILE" as const,
  corpusRole: "GENERAL" as const,
  uploadedAt: new Date("2026-05-17T12:00:00Z"),
  receivedAt: null,
  sourceAuthor: null,
  sourceSubject: null,
  sourceMetadata: null,
  corpusParentDocumentId: null,
  corpusParentDocumentName: null,
  linkedQuestionText: null,
  extractedText: "Test content",
  extractionRuns: [],
  extractionQuality: 80,
  extractionMetrics: null,
  extractionWarnings: null,
};

describe("base-agent date rendering — test #23 §6.5", () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  it("FILE sans sourceDate ni receivedAt → 'produit le date inconnue' (PAS uploadedAt)", () => {
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [{ ...baseDoc, sourceDate: null, receivedAt: null }],
      redFlags: [],
    };

    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    expect(rendered).toContain("Cap table.png");
    expect(rendered).toContain("produit le date inconnue");
    expect(rendered).not.toMatch(/produit le 17\/05\/2026/);
    // importé le must still show uploadedAt — that's technical metadata.
    expect(rendered).toMatch(/importé le 17\/05\/2026/);
  });

  it("FILE avec sourceDate set → 'produit le <sourceDate>'", () => {
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [{
        ...baseDoc,
        sourceDate: new Date("2024-09-18T00:00:00Z"),
        receivedAt: null,
      }],
      redFlags: [],
    };

    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    expect(rendered).toMatch(/produit le 18\/09\/2024/);
  });

  it("FILE avec receivedAt set (fallback) → 'produit le <receivedAt>'", () => {
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [{
        ...baseDoc,
        sourceDate: null,
        receivedAt: new Date("2026-04-22T01:00:00Z"),
      }],
      redFlags: [],
    };

    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    expect(rendered).toMatch(/produit le 22\/04\/2026/);
  });

  it("tri chronologique — FILE non datés vont à la FIN (Number.MAX_SAFE_INTEGER)", () => {
    const dated = { ...baseDoc, id: "doc-dated", name: "Dated.pdf", sourceDate: new Date("2024-01-01T00:00:00Z"), receivedAt: null };
    const undated = { ...baseDoc, id: "doc-undated", name: "Undated.pdf", sourceDate: null, receivedAt: null };
    const recent = { ...baseDoc, id: "doc-recent", name: "Recent.pdf", sourceDate: new Date("2026-03-15T00:00:00Z"), receivedAt: null };

    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [undated, recent, dated],
      redFlags: [],
    };

    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    const datedIdx = rendered.indexOf("Dated.pdf");
    const recentIdx = rendered.indexOf("Recent.pdf");
    const undatedIdx = rendered.indexOf("Undated.pdf");

    expect(datedIdx).toBeGreaterThan(0);
    expect(recentIdx).toBeGreaterThan(0);
    expect(undatedIdx).toBeGreaterThan(0);

    // Order: dated (2024) < recent (2026) < undated (end)
    expect(datedIdx).toBeLessThan(recentIdx);
    expect(recentIdx).toBeLessThan(undatedIdx);
  });
});

describe("base-agent — Phase 5 Evidence Engine prelude injection", () => {
  let agent: TestAgent;
  beforeEach(() => { agent = new TestAgent(); });

  it("injecte le global header 'Nous sommes le DD/MM/YYYY' (Codex Phase 5 gate)", () => {
    const today = new Date("2026-05-18T12:00:00Z");
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [],
      redFlags: [],
      evidenceToday: today,
    };
    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    expect(rendered).toContain("## Référence temporelle");
    expect(rendered).toContain("Nous sommes le 18/05/2026.");
  });

  it("injecte le doc prelude après le header '### name (...) — produit le ...'", () => {
    const today = new Date("2026-05-18T12:00:00Z");
    const docId = "doc-cap-table";
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [{
        ...baseDoc,
        id: docId,
        name: "Cap table.png",
        type: "CAP_TABLE",
        sourceDate: null,
        receivedAt: null,
      }],
      redFlags: [],
      evidenceToday: today,
      evidenceContext: {
        [docId]: {
          documentId: docId,
          documentName: "Cap table.png",
          documentType: "CAP_TABLE" as const,
          documentDate: null,
          asOf: {
            date: new Date("2024-09-18T00:00:00Z"),
            precision: "DAY" as const,
            confidence: "HIGH" as const,
            signalScopeKey: "run:c1",
            evidenceText: "à jour au 18/09/2024",
            signalId: "sig_1",
            signalKind: "CAP_TABLE_AS_OF" as const,
          },
          forecast: null,
          actuals: [],
          manualParent: null,
          detectedAttachments: [],
          claims: [],
          staleWarnings: [{
            kind: "cap_table_stale" as const,
            severity: "medium" as const,
            message: "Cap table is 19 months old (as of 2024-09-18). Request the latest cap table before relying on this.",
            ageDays: 580,
          }],
        },
      },
    };
    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    // Header line still present, with the "date inconnue" because sourceDate=null:
    expect(rendered).toContain("### Cap table.png (Fichier, CAP_TABLE) — produit le date inconnue");
    // Evidence prelude injected:
    expect(rendered).toContain("Cap table à jour au 18/09/2024");
    expect(rendered).toContain("⚠️");
    expect(rendered).toContain("19 months old");
  });

  it("fallback : evidenceToday absent → utilise new Date(), header présent quand même", () => {
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [],
      redFlags: [],
      // no evidenceToday, no evidenceContext
    };
    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    expect(rendered).toContain("## Référence temporelle");
    expect(rendered).toMatch(/Nous sommes le \d{2}\/\d{2}\/\d{4}\./);
  });

  it("doc avec evidenceContext absent → pas de prelude, header doc rendu normalement", () => {
    const today = new Date("2026-05-18T12:00:00Z");
    const context = {
      dealId: "deal-1",
      deal: minimalDeal,
      canonicalDeal: minimalDeal,
      founders: [],
      documents: [{ ...baseDoc, sourceDate: null, receivedAt: null }],
      redFlags: [],
      evidenceToday: today,
      evidenceContext: {}, // empty map, no entry for this doc
    };
    const rendered = agent.publicFormatDealContext(context as unknown as AgentContext);
    // Header still rendered, no prelude:
    expect(rendered).toContain("### Cap table.png (Fichier, CAP_TABLE) — produit le date inconnue");
    expect(rendered).not.toContain("Cap table à jour au");
    expect(rendered).not.toContain("⚠️");
  });
});
