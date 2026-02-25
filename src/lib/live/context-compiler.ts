// ============================================================================
// Context Compiler — Assembles DealContext from DB for the coaching LLM
// ============================================================================

import { prisma } from "@/lib/prisma";
import type { DealContext } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// In-memory cache — compileDealContext is called ~100-150 times per 30min
// session but returns identical results. Cache with 5-minute TTL.
// ---------------------------------------------------------------------------

const contextCache = new Map<
  string,
  { context: DealContext; serialized: string; cachedAt: number }
>();
const CONTEXT_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

/**
 * Cached version of compileDealContext — returns cached result if available
 * and not expired (5 minutes TTL). Use this for hot paths like coaching.
 */
export async function compileDealContextCached(
  dealId: string
): Promise<DealContext> {
  const cached = contextCache.get(dealId);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_CACHE_TTL_MS) {
    return cached.context;
  }
  const context = await compileDealContext(dealId);
  const serialized = serializeContext(context);
  contextCache.set(dealId, { context, serialized, cachedAt: Date.now() });
  return context;
}

/**
 * Get the serialized context string from cache (no DB call).
 * Returns null if the context is not cached.
 */
export function getCachedSerializedContext(dealId: string): string | null {
  const cached = contextCache.get(dealId);
  return cached ? cached.serialized : null;
}

/**
 * Invalidate the cache for a specific deal (e.g., after reanalysis).
 */
export function clearContextCache(dealId: string): void {
  contextCache.delete(dealId);
}

// ---------------------------------------------------------------------------
// Signal profile mapping (mirrors CLAUDE.md rule #1 grille)
// ---------------------------------------------------------------------------

function getSignalProfile(score: number | null): string {
  if (score == null) return "Aucune analyse disponible";
  if (score >= 85) return "Signaux très favorables";
  if (score >= 70) return "Signaux favorables";
  if (score >= 55) return "Signaux contrastés";
  if (score >= 40) return "Vigilance requise";
  return "Signaux d'alerte dominants";
}

// ---------------------------------------------------------------------------
// Safe agent data extraction helpers
// ---------------------------------------------------------------------------

interface AgentResult {
  agentName: string;
  success: boolean;
  data?: unknown;
}

type AgentResults = Record<string, AgentResult>;

function getAgentData(results: AgentResults | null, agentName: string): Record<string, unknown> | null {
  if (!results) return null;
  const r = results[agentName];
  if (!r?.success || !r.data || typeof r.data !== "object") return null;
  return r.data as Record<string, unknown>;
}

function safeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}

function safeString(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

// ---------------------------------------------------------------------------
// compileDealContext — main function
// ---------------------------------------------------------------------------

export async function compileDealContext(dealId: string): Promise<DealContext> {
  // Fetch all data in parallel
  const [deal, latestAnalysis, previousSessions] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        redFlags: { orderBy: [{ severity: "asc" }, { detectedAt: "desc" }] },
        documents: {
          where: { isLatest: true },
          select: { id: true, name: true, type: true },
        },
        founders: { select: { name: true, role: true } },
        factEvents: {
          where: { eventType: "CREATED" },
          select: { factKey: true, displayValue: true, sourceDocumentId: true },
          take: 50,
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.analysis.findFirst({
      where: { dealId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, results: true },
    }),
    prisma.liveSession.findMany({
      where: { dealId, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        summary: {
          select: {
            executiveSummary: true,
            keyPoints: true,
            remainingQuestions: true,
          },
        },
      },
    }),
  ]);

  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }

  // Parse agent results
  const agentResults = latestAnalysis?.results as AgentResults | null;

  // --- Financial summary ---
  const financialData = getAgentData(agentResults, "financial-auditor");
  const financialSummary: DealContext["financialSummary"] = {
    keyMetrics: {},
    benchmarkPosition: "",
    redFlags: [],
  };

  if (financialData) {
    // Extract key metrics — structure varies, pull common fields
    const metrics = financialData.keyMetrics ?? financialData.metrics;
    if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
      financialSummary.keyMetrics = metrics as Record<string, number | string>;
    }
    financialSummary.benchmarkPosition = safeString(
      financialData.benchmarkPosition ?? financialData.benchmarkSummary
    );
    financialSummary.redFlags = safeStringArray(
      financialData.redFlags ?? financialData.concerns
    );
  }

  // --- Team summary ---
  const teamData = getAgentData(agentResults, "team-investigator");
  const teamSummary: DealContext["teamSummary"] = {
    founders: deal.founders.map((f) => `${f.name} (${f.role})`),
    keyStrengths: [],
    concerns: [],
  };

  if (teamData) {
    teamSummary.keyStrengths = safeStringArray(
      teamData.keyStrengths ?? teamData.strengths
    );
    teamSummary.concerns = safeStringArray(
      teamData.concerns ?? teamData.risks ?? teamData.weaknesses
    );
  }

  // --- Market summary ---
  const marketData = getAgentData(agentResults, "market-intelligence");
  const marketSummary: DealContext["marketSummary"] = {
    size: "",
    competitors: [],
    positioning: "",
  };

  if (marketData) {
    marketSummary.size = safeString(
      marketData.marketSize ?? marketData.tam ?? marketData.size
    );
    marketSummary.competitors = safeStringArray(
      marketData.competitors ?? marketData.keyCompetitors
    );
    marketSummary.positioning = safeString(
      marketData.positioning ?? marketData.competitivePositioning
    );
  }

  // --- Tech summary ---
  const techData = getAgentData(agentResults, "tech-stack-dd");
  const techSummary: DealContext["techSummary"] = {
    stack: "",
    maturity: "",
    concerns: [],
  };

  if (techData) {
    techSummary.stack = safeString(techData.stack ?? techData.techStack);
    techSummary.maturity = safeString(
      techData.maturity ?? techData.maturityLevel
    );
    techSummary.concerns = safeStringArray(
      techData.concerns ?? techData.risks ?? techData.techDebt
    );
  }

  // --- Questions from question-master ---
  const questionData = getAgentData(agentResults, "question-master");
  const questionsToAsk: DealContext["questionsToAsk"] = [];

  if (questionData) {
    const rawQuestions = questionData.questions;
    if (Array.isArray(rawQuestions)) {
      for (const q of rawQuestions) {
        if (q && typeof q === "object") {
          const qObj = q as Record<string, unknown>;
          questionsToAsk.push({
            question: safeString(qObj.question),
            priority: (["high", "medium", "low"].includes(
              safeString(qObj.priority)
            )
              ? safeString(qObj.priority)
              : "medium") as "high" | "medium" | "low",
            category: safeString(qObj.category, "general"),
            context: safeString(qObj.context ?? qObj.rationale),
          });
        }
      }
    }
  }

  // --- Red flags ---
  const redFlags: DealContext["redFlags"] = deal.redFlags.map((rf) => ({
    severity: rf.severity,
    description: rf.description,
    source: rf.category,
    question: rf.questionsToAsk?.[0] ?? "",
  }));

  // --- Contradictions from contradiction-detector ---
  const contradictionData = getAgentData(agentResults, "contradiction-detector");
  let keyContradictions: string[] = [];

  if (contradictionData) {
    const rawContradictions =
      contradictionData.contradictions ?? contradictionData.findings;
    if (Array.isArray(rawContradictions)) {
      keyContradictions = rawContradictions
        .map((c: unknown) => {
          if (typeof c === "string") return c;
          if (c && typeof c === "object") {
            const cObj = c as Record<string, unknown>;
            return safeString(
              cObj.description ?? cObj.summary ?? cObj.contradiction
            );
          }
          return "";
        })
        .filter(Boolean);
    }
  }

  // --- Document summaries ---
  // Group factEvents by document for keyClaims
  const factsByDoc = new Map<string, string[]>();
  for (const fe of deal.factEvents) {
    if (fe.sourceDocumentId) {
      const existing = factsByDoc.get(fe.sourceDocumentId) ?? [];
      existing.push(fe.displayValue);
      factsByDoc.set(fe.sourceDocumentId, existing);
    }
  }

  const documentSummaries: DealContext["documentSummaries"] = deal.documents.map(
    (doc) => ({
      name: doc.name,
      type: doc.type,
      keyClaims: (factsByDoc.get(doc.id) ?? []).slice(0, 5),
    })
  );

  // --- Benchmarks ---
  const benchmarks: DealContext["benchmarks"] = {
    valuationRange: null,
    comparableDeals: [],
  };

  if (financialData) {
    const vRange = financialData.valuationRange ?? financialData.benchmark;
    if (vRange && typeof vRange === "object" && !Array.isArray(vRange)) {
      const r = vRange as Record<string, unknown>;
      if (r.p25 != null && r.p50 != null && r.p75 != null) {
        benchmarks.valuationRange = {
          p25: Number(r.p25),
          p50: Number(r.p50),
          p75: Number(r.p75),
        };
      }
    }
    benchmarks.comparableDeals = safeStringArray(
      financialData.comparableDeals ?? financialData.comparables
    );
  }

  // --- Previous sessions ---
  const previousSessionsContext: DealContext["previousSessions"] =
    previousSessions.map((s) => {
      const summary = s.summary;
      const keyPoints = summary?.keyPoints;
      const remaining = summary?.remainingQuestions;

      const keyFindings: string[] = [];
      if (Array.isArray(keyPoints)) {
        for (const kp of keyPoints) {
          if (kp && typeof kp === "object") {
            const kpObj = kp as Record<string, unknown>;
            const summaryText = safeString(kpObj.summary);
            if (summaryText) keyFindings.push(summaryText);
          }
        }
      }

      return {
        date: (s.startedAt ?? s.createdAt).toISOString().split("T")[0],
        keyFindings: keyFindings.slice(0, 5),
        unresolvedQuestions: Array.isArray(remaining)
          ? remaining.filter((q): q is string => typeof q === "string").slice(0, 5)
          : [],
      };
    });

  return {
    dealId: deal.id,
    companyName: deal.companyName ?? deal.name,
    sector: deal.sector,
    stage: deal.stage,
    financialSummary,
    teamSummary,
    marketSummary,
    techSummary,
    redFlags,
    questionsToAsk,
    benchmarks,
    overallScore: deal.globalScore,
    signalProfile: getSignalProfile(deal.globalScore),
    keyContradictions,
    documentSummaries,
    previousSessions: previousSessionsContext,
  };
}

// ---------------------------------------------------------------------------
// compileContextForColdMode — minimal context for sessions without a deal
// ---------------------------------------------------------------------------

export function compileContextForColdMode(): DealContext {
  return {
    dealId: "",
    companyName: "Startup (non rattachée)",
    sector: null,
    stage: null,
    financialSummary: { keyMetrics: {}, benchmarkPosition: "", redFlags: [] },
    teamSummary: { founders: [], keyStrengths: [], concerns: [] },
    marketSummary: { size: "", competitors: [], positioning: "" },
    techSummary: { stack: "", maturity: "", concerns: [] },
    redFlags: [],
    questionsToAsk: [],
    benchmarks: { valuationRange: null, comparableDeals: [] },
    overallScore: null,
    signalProfile: "Aucune analyse disponible",
    keyContradictions: [],
    documentSummaries: [],
    previousSessions: [],
  };
}

// ---------------------------------------------------------------------------
// serializeContext — readable text for LLM prompt injection
// ---------------------------------------------------------------------------

export function serializeContext(context: DealContext): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Contexte du deal : ${context.companyName}`);
  if (context.sector || context.stage) {
    const parts = [context.sector, context.stage].filter(Boolean);
    lines.push(`Secteur/Stade : ${parts.join(" — ")}`);
  }
  if (context.overallScore != null) {
    lines.push(
      `Score global : ${context.overallScore}/100 — ${context.signalProfile}`
    );
  }
  lines.push("");

  // Financial
  if (
    Object.keys(context.financialSummary.keyMetrics).length > 0 ||
    context.financialSummary.benchmarkPosition
  ) {
    lines.push("## Financier");
    for (const [key, val] of Object.entries(
      context.financialSummary.keyMetrics
    )) {
      lines.push(`- ${key} : ${val}`);
    }
    if (context.financialSummary.benchmarkPosition) {
      lines.push(
        `- Position benchmark : ${context.financialSummary.benchmarkPosition}`
      );
    }
    if (context.financialSummary.redFlags.length > 0) {
      lines.push(
        `- Alertes financières : ${context.financialSummary.redFlags.join("; ")}`
      );
    }
    lines.push("");
  }

  // Team
  if (
    context.teamSummary.founders.length > 0 ||
    context.teamSummary.keyStrengths.length > 0
  ) {
    lines.push("## Équipe");
    if (context.teamSummary.founders.length > 0) {
      lines.push(`- Fondateurs : ${context.teamSummary.founders.join(", ")}`);
    }
    if (context.teamSummary.keyStrengths.length > 0) {
      lines.push(
        `- Forces : ${context.teamSummary.keyStrengths.join("; ")}`
      );
    }
    if (context.teamSummary.concerns.length > 0) {
      lines.push(
        `- Points d'attention : ${context.teamSummary.concerns.join("; ")}`
      );
    }
    lines.push("");
  }

  // Market
  if (
    context.marketSummary.size ||
    context.marketSummary.competitors.length > 0
  ) {
    lines.push("## Marché");
    if (context.marketSummary.size) {
      lines.push(`- Taille : ${context.marketSummary.size}`);
    }
    if (context.marketSummary.competitors.length > 0) {
      lines.push(
        `- Concurrents : ${context.marketSummary.competitors.join(", ")}`
      );
    }
    if (context.marketSummary.positioning) {
      lines.push(
        `- Positionnement : ${context.marketSummary.positioning}`
      );
    }
    lines.push("");
  }

  // Tech
  if (context.techSummary.stack || context.techSummary.maturity) {
    lines.push("## Technique");
    if (context.techSummary.stack) {
      lines.push(`- Stack : ${context.techSummary.stack}`);
    }
    if (context.techSummary.maturity) {
      lines.push(`- Maturité : ${context.techSummary.maturity}`);
    }
    if (context.techSummary.concerns.length > 0) {
      lines.push(
        `- Points d'attention : ${context.techSummary.concerns.join("; ")}`
      );
    }
    lines.push("");
  }

  // Red flags
  if (context.redFlags.length > 0) {
    lines.push("## Signaux d'alerte");
    for (const rf of context.redFlags) {
      lines.push(
        `- [${rf.severity}] ${rf.description}${rf.question ? ` — Question : ${rf.question}` : ""}`
      );
    }
    lines.push("");
  }

  // Contradictions
  if (context.keyContradictions.length > 0) {
    lines.push("## Contradictions identifiées");
    for (const c of context.keyContradictions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Questions to ask
  if (context.questionsToAsk.length > 0) {
    lines.push("## Questions prioritaires à poser");
    const sorted = [...context.questionsToAsk].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
    for (const q of sorted) {
      lines.push(
        `- [${q.priority}] ${q.question}${q.context ? ` (${q.context})` : ""}`
      );
    }
    lines.push("");
  }

  // Benchmarks
  if (
    context.benchmarks.valuationRange ||
    context.benchmarks.comparableDeals.length > 0
  ) {
    lines.push("## Benchmarks");
    if (context.benchmarks.valuationRange) {
      const vr = context.benchmarks.valuationRange;
      lines.push(
        `- Valorisation comparable : P25=${vr.p25}€ | Médiane=${vr.p50}€ | P75=${vr.p75}€`
      );
    }
    if (context.benchmarks.comparableDeals.length > 0) {
      lines.push(
        `- Deals comparables : ${context.benchmarks.comparableDeals.join(", ")}`
      );
    }
    lines.push("");
  }

  // Documents
  if (context.documentSummaries.length > 0) {
    lines.push("## Documents analysés");
    for (const doc of context.documentSummaries) {
      const claims =
        doc.keyClaims.length > 0
          ? ` — Claims clés : ${doc.keyClaims.join("; ")}`
          : "";
      lines.push(`- ${doc.name} (${doc.type})${claims}`);
    }
    lines.push("");
  }

  // Previous sessions
  if (context.previousSessions.length > 0) {
    lines.push("## Sessions précédentes");
    for (const s of context.previousSessions) {
      lines.push(`### Session du ${s.date}`);
      if (s.keyFindings.length > 0) {
        lines.push(`- Constats : ${s.keyFindings.join("; ")}`);
      }
      if (s.unresolvedQuestions.length > 0) {
        lines.push(
          `- Questions non résolues : ${s.unresolvedQuestions.join("; ")}`
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
