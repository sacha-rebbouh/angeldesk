// ============================================================================
// Context Compiler — Assembles DealContext from DB for the coaching LLM
// ============================================================================

import { prisma } from "@/lib/prisma";
import type { DealContext, CondensedTranscriptIntel } from "@/lib/live/types";
import { loadResults } from "@/services/analysis-results/load-results";
import { extractAnalysisScores } from "@/services/analysis-results/score-extraction";
import { getCorpusSnapshotDocumentIds } from "@/services/corpus";
import {
  pickCanonicalAnalysis,
  type CanonicalCompletedAnalysis,
  type CanonicalLatestThesis,
} from "@/services/deals/canonical-read-model";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";

// ---------------------------------------------------------------------------
// In-memory cache — compileDealContext is called ~100-150 times per 30min
// session but returns identical results. Cache with 5-minute TTL.
// ---------------------------------------------------------------------------

const contextCache = new Map<
  string,
  { context: DealContext; serialized: string; cachedAt: number }
>();
const CONTEXT_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const CONTEXT_CACHE_MAX_ENTRIES = 50;

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

  // Evict stale/oldest entries when at capacity
  if (contextCache.size >= CONTEXT_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of contextCache) {
      if (now - entry.cachedAt > CONTEXT_CACHE_TTL_MS) contextCache.delete(key);
    }
    // If still over limit, evict oldest entry
    if (contextCache.size >= CONTEXT_CACHE_MAX_ENTRIES) {
      const oldest = contextCache.keys().next().value;
      if (oldest) contextCache.delete(oldest);
    }
  }

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

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

function getCurrentFactString(
  factMap: Map<string, CurrentFact>,
  factKey: string
): string | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string") return fact.currentValue;
  if (typeof fact.currentDisplayValue === "string" && fact.currentDisplayValue.length > 0) {
    return fact.currentDisplayValue;
  }
  return null;
}

function getCurrentFactNumber(
  factMap: Map<string, CurrentFact>,
  factKey: string
): number | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "number" && Number.isFinite(fact.currentValue)) {
    return fact.currentValue;
  }
  if (typeof fact.currentValue === "string") {
    const parsed = Number(fact.currentValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// compileDealContext — main function
// ---------------------------------------------------------------------------

export async function compileDealContext(dealId: string): Promise<DealContext> {
  // Fetch all data in parallel
  const [deal, latestThesis, completedAnalyses, previousSessions, currentFacts] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        redFlags: { orderBy: [{ severity: "asc" }, { detectedAt: "desc" }] },
        founders: {
          select: {
            name: true,
            role: true,
            linkedinUrl: true,
            verifiedInfo: true,
            previousVentures: true,
          },
        },
      },
    }),
    prisma.thesis.findFirst({
      where: { dealId, isLatest: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        verdict: true,
        corpusSnapshotId: true,
      },
    }),
    prisma.analysis.findMany({
      where: { dealId, status: "COMPLETED" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        dealId: true,
        mode: true,
        thesisId: true,
        corpusSnapshotId: true,
        completedAt: true,
        createdAt: true,
        negotiationStrategy: true,
      },
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
            newInformation: true,
            contradictions: true,
            remainingQuestions: true,
            condensedIntel: true,
            sessionStats: true,
          },
        },
      },
    }),
    getCurrentFactsFromView(dealId),
  ]);

  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }

  const selectedAnalysis = pickCanonicalAnalysis(
    latestThesis as CanonicalLatestThesis | null,
    completedAnalyses as CanonicalCompletedAnalysis[]
  );
  const selectedAnalysisDetails = selectedAnalysis
    ? completedAnalyses.find((analysis) => analysis.id === selectedAnalysis.id) ?? null
    : null;

  const scopedDocumentIds = selectedAnalysisDetails?.corpusSnapshotId
    ? await getCorpusSnapshotDocumentIds(selectedAnalysisDetails.corpusSnapshotId)
    : [];

  const scopedDocuments = await prisma.document.findMany({
    where: selectedAnalysisDetails?.corpusSnapshotId
      ? { id: { in: scopedDocumentIds } }
      : { dealId, isLatest: true },
    select: { id: true, name: true, type: true },
  });

  if (selectedAnalysisDetails?.corpusSnapshotId && scopedDocumentIds.length > 0) {
    const documentOrder = new Map(
      scopedDocumentIds.map((documentId, index) => [documentId, index])
    );
    scopedDocuments.sort(
      (left, right) =>
        (documentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (documentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  // Parse agent results
  const agentResults = selectedAnalysisDetails
    ? (await loadResults(selectedAnalysisDetails.id)) as AgentResults | null
    : null;
  const factMap = buildCurrentFactMap(currentFacts);
  const analysisScores = extractAnalysisScores(agentResults);

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

  // --- Founder details (LinkedIn, parcours) ---
  const founderDetails: DealContext["founderDetails"] = deal.founders.map((f) => {
    const vi = f.verifiedInfo as Record<string, unknown> | null;
    const experiences: Array<{ title: string; company: string; period: string }> = [];
    const education: string[] = [];
    let headline = "";

    if (vi) {
      headline = safeString(vi.headline);
      const exps = vi.experiences as Array<Record<string, unknown>> | undefined;
      if (exps) {
        for (const exp of exps.slice(0, 5)) {
          const period = exp.isCurrent
            ? `${exp.startYear ?? "?"}–present`
            : `${exp.startYear ?? "?"}–${exp.endYear ?? "?"}`;
          experiences.push({
            title: safeString(exp.title),
            company: safeString(exp.company),
            period,
          });
        }
      }
      const edus = vi.education as Array<Record<string, unknown>> | undefined;
      if (edus) {
        for (const edu of edus.slice(0, 3)) {
          const degree = safeString(edu.degree ?? edu.degreeName);
          const school = safeString(edu.school ?? edu.schoolName);
          if (degree || school) education.push(`${degree} @ ${school}`.trim());
        }
      }
    }

    const previousVentures = safeStringArray(f.previousVentures);

    return { name: f.name, role: f.role, headline, experiences, education, previousVentures };
  });

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
  // Group sanitized current facts by document for keyClaims.
  const factsByDoc = new Map<string, string[]>();
  for (const fact of currentFacts) {
    if (
      fact.currentSourceDocumentId &&
      (!selectedAnalysisDetails?.corpusSnapshotId ||
        scopedDocumentIds.includes(fact.currentSourceDocumentId))
    ) {
      const existing = factsByDoc.get(fact.currentSourceDocumentId) ?? [];
      existing.push(fact.currentDisplayValue);
      factsByDoc.set(fact.currentSourceDocumentId, existing);
    }
  }

  const documentSummaries: DealContext["documentSummaries"] = scopedDocuments.map(
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

  // --- ALL agent findings (iterate every agent, not just hand-picked ones) ---
  const allAgentFindings: DealContext["allAgentFindings"] = {};
  if (agentResults) {
    for (const [agentName, result] of Object.entries(agentResults)) {
      if (!result?.success || !result.data || typeof result.data !== "object") continue;
      const data = result.data as Record<string, unknown>;

      const summary = safeString(data.summary ?? data.recommendation ?? data.verdict ?? data.conclusion);
      const keyFindings: string[] = [];

      // Extract key findings from various structures
      for (const key of ["keyFindings", "findings", "concerns", "insights", "highlights"]) {
        const arr = data[key];
        if (Array.isArray(arr)) {
          for (const item of arr.slice(0, 5)) {
            if (typeof item === "string") {
              keyFindings.push(item);
            } else if (item && typeof item === "object") {
              const obj = item as Record<string, unknown>;
              const text = safeString(obj.finding ?? obj.concern ?? obj.summary ?? obj.insight ?? obj.description);
              if (text) keyFindings.push(text);
            }
          }
        }
      }

      const score = typeof data.score === "number" ? data.score : undefined;

      if (summary || keyFindings.length > 0) {
        allAgentFindings[agentName] = { summary, keyFindings, score };
      }
    }
  }

  // --- Negotiation strategy ---
  const negotiationStrategy = safeString(
    (selectedAnalysisDetails?.negotiationStrategy as Record<string, unknown> | null)?.summary ??
    (selectedAnalysisDetails?.negotiationStrategy as Record<string, unknown> | null)?.strategy ??
    (typeof selectedAnalysisDetails?.negotiationStrategy === "string"
      ? selectedAnalysisDetails.negotiationStrategy
      : "")
  );

  // --- Previous sessions ---
  const previousSessionsContext: DealContext["previousSessions"] =
    previousSessions.map((s) => {
      const summary = s.summary;
      const keyPoints = summary?.keyPoints;
      const remaining = summary?.remainingQuestions;
      const newInfo = summary?.newInformation;
      const contradictions = summary?.contradictions;

      const keyFindings: string[] = [];

      // Key points from the call
      if (Array.isArray(keyPoints)) {
        for (const kp of keyPoints) {
          if (kp && typeof kp === "object") {
            const kpObj = kp as Record<string, unknown>;
            const summaryText = safeString(kpObj.summary);
            if (summaryText) keyFindings.push(summaryText);
          }
        }
      }

      // New information discovered during the call (includes visual findings)
      if (Array.isArray(newInfo)) {
        for (const ni of newInfo) {
          if (ni && typeof ni === "object") {
            const niObj = ni as Record<string, unknown>;
            const fact = safeString(niObj.fact);
            const impact = safeString(niObj.impact);
            if (fact) {
              keyFindings.push(
                impact ? `[Nouveau] ${fact} — ${impact}` : `[Nouveau] ${fact}`
              );
            }
          }
        }
      }

      // Contradictions found during the call (audio + visual)
      if (Array.isArray(contradictions)) {
        for (const c of contradictions) {
          if (c && typeof c === "object") {
            const cObj = c as Record<string, unknown>;
            const deck = safeString(cObj.claimInDeck);
            const call = safeString(cObj.claimInCall);
            const severity = safeString(cObj.severity, "medium");
            if (deck && call) {
              keyFindings.push(
                `[Contradiction ${severity}] Avant: "${deck}" → Call: "${call}"`
              );
            }
          }
        }
      }

      // Parse duration from sessionStats
      const stats = summary?.sessionStats as { duration?: number } | null;
      const duration = stats?.duration ?? 0;

      // Parse condensed intel (null for legacy sessions without it)
      const rawIntel = summary?.condensedIntel as CondensedTranscriptIntel | null;

      return {
        date: (s.startedAt ?? s.createdAt).toISOString().split("T")[0],
        duration,
        keyFindings: keyFindings.slice(0, 10),
        unresolvedQuestions: Array.isArray(remaining)
          ? remaining.filter((q): q is string => typeof q === "string").slice(0, 5)
          : [],
        condensedIntel: rawIntel
          ? {
              keyFacts: (Array.isArray(rawIntel.keyFacts) ? rawIntel.keyFacts : []).slice(0, 8),
              founderCommitments: (Array.isArray(rawIntel.founderCommitments) ? rawIntel.founderCommitments : []).map(
                (c) => typeof c === "string" ? { commitment: c } : c
              ).slice(0, 5),
              financialDataPoints: (Array.isArray(rawIntel.financialDataPoints) ? rawIntel.financialDataPoints : []).slice(0, 6),
              competitiveInsights: safeStringArray(rawIntel.competitiveInsights).slice(0, 4),
              teamRevelations: safeStringArray(rawIntel.teamRevelations).slice(0, 4),
              contradictionsWithAnalysis: (Array.isArray(rawIntel.contradictionsWithAnalysis) ? rawIntel.contradictionsWithAnalysis : []).slice(0, 5),
              visualDataPoints: safeStringArray(rawIntel.visualDataPoints).slice(0, 4),
              answersObtained: (Array.isArray(rawIntel.answersObtained) ? rawIntel.answersObtained : []).slice(0, 6),
              actionItems: (Array.isArray(rawIntel.actionItems) ? rawIntel.actionItems : []).slice(0, 5),
              confidenceDelta: rawIntel.confidenceDelta ?? { direction: "stable" as const, reason: "" },
            }
          : null,
      };
    });

  return {
    dealId: deal.id,
    companyName:
      getCurrentFactString(factMap, "company.name") ?? deal.companyName ?? deal.name,
    sector: deal.sector,
    stage: deal.stage,
    dealBasics: {
      arr: getCurrentFactNumber(factMap, "financial.arr") ?? (deal.arr ? Number(deal.arr) : null),
      growthRate:
        getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
        (deal.growthRate ? Number(deal.growthRate) : null),
      amountRequested:
        getCurrentFactNumber(factMap, "financial.amount_raising") ??
        (deal.amountRequested ? Number(deal.amountRequested) : null),
      valuationPre:
        getCurrentFactNumber(factMap, "financial.valuation_pre") ??
        (deal.valuationPre ? Number(deal.valuationPre) : null),
      geography: deal.geography,
      description: deal.description,
      website: getCurrentFactString(factMap, "other.website") ?? deal.website,
    },
    scores: {
      global: analysisScores.globalScore ?? deal.globalScore,
      team: analysisScores.teamScore ?? deal.teamScore,
      market: analysisScores.marketScore ?? deal.marketScore,
      product: analysisScores.productScore ?? deal.productScore,
      financials: analysisScores.financialsScore ?? deal.financialsScore,
    },
    financialSummary,
    teamSummary,
    founderDetails,
    marketSummary,
    techSummary,
    redFlags,
    questionsToAsk,
    benchmarks,
    overallScore: analysisScores.globalScore ?? deal.globalScore,
    signalProfile: getSignalProfile(analysisScores.globalScore ?? deal.globalScore),
    keyContradictions,
    allAgentFindings,
    negotiationStrategy,
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
    dealBasics: { arr: null, growthRate: null, amountRequested: null, valuationPre: null, geography: null, description: null, website: null },
    scores: { global: null, team: null, market: null, product: null, financials: null },
    financialSummary: { keyMetrics: {}, benchmarkPosition: "", redFlags: [] },
    teamSummary: { founders: [], keyStrengths: [], concerns: [] },
    founderDetails: [],
    marketSummary: { size: "", competitors: [], positioning: "" },
    techSummary: { stack: "", maturity: "", concerns: [] },
    redFlags: [],
    questionsToAsk: [],
    benchmarks: { valuationRange: null, comparableDeals: [] },
    overallScore: null,
    signalProfile: "Aucune analyse disponible",
    keyContradictions: [],
    allAgentFindings: {},
    negotiationStrategy: "",
    documentSummaries: [],
    previousSessions: [],
  };
}

// ---------------------------------------------------------------------------
// serializeContext — full deal context for all LLM injections
// ---------------------------------------------------------------------------

export function serializeContext(context: DealContext): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Contexte du deal : ${context.companyName}`);
  if (context.sector || context.stage) {
    const parts = [context.sector, context.stage].filter(Boolean);
    lines.push(`Secteur/Stade : ${parts.join(" — ")}`);
  }
  if (context.dealBasics.geography) {
    lines.push(`Géographie : ${context.dealBasics.geography}`);
  }
  if (context.dealBasics.description) {
    lines.push(`Description : ${context.dealBasics.description}`);
  }
  if (context.dealBasics.website) {
    lines.push(`Site web : ${context.dealBasics.website}`);
  }
  lines.push("");

  // Scores (all dimensions)
  lines.push("## Scores d'analyse");
  lines.push(`- Score global : ${context.scores.global ?? "N/A"}/100 — ${context.signalProfile}`);
  if (context.scores.team != null) lines.push(`- Équipe : ${context.scores.team}/100`);
  if (context.scores.market != null) lines.push(`- Marché : ${context.scores.market}/100`);
  if (context.scores.product != null) lines.push(`- Produit : ${context.scores.product}/100`);
  if (context.scores.financials != null) lines.push(`- Financials : ${context.scores.financials}/100`);
  lines.push("");

  // Deal basics (raw financial numbers)
  const basics = context.dealBasics;
  if (basics.arr != null || basics.valuationPre != null || basics.amountRequested != null) {
    lines.push("## Données financières du deal");
    if (basics.arr != null) lines.push(`- ARR : ${formatEuro(basics.arr)}`);
    if (basics.growthRate != null) lines.push(`- Croissance : ${basics.growthRate}%`);
    if (basics.amountRequested != null) lines.push(`- Montant demandé : ${formatEuro(basics.amountRequested)}`);
    if (basics.valuationPre != null) lines.push(`- Valorisation pré-money : ${formatEuro(basics.valuationPre)}`);
    lines.push("");
  }

  // Financial agent metrics
  if (
    Object.keys(context.financialSummary.keyMetrics).length > 0 ||
    context.financialSummary.benchmarkPosition
  ) {
    lines.push("## Métriques financières (analyse)");
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

  // Benchmarks
  if (
    context.benchmarks.valuationRange ||
    context.benchmarks.comparableDeals.length > 0
  ) {
    lines.push("## Benchmarks");
    if (context.benchmarks.valuationRange) {
      const vr = context.benchmarks.valuationRange;
      lines.push(
        `- Valorisation comparable : P25=${formatEuro(vr.p25)} | Médiane=${formatEuro(vr.p50)} | P75=${formatEuro(vr.p75)}`
      );
    }
    if (context.benchmarks.comparableDeals.length > 0) {
      lines.push(
        `- Deals comparables : ${context.benchmarks.comparableDeals.join(", ")}`
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

  // Founder details (LinkedIn, parcours)
  if (context.founderDetails.length > 0) {
    lines.push("## Profils fondateurs");
    for (const f of context.founderDetails) {
      lines.push(`### ${f.name} (${f.role})`);
      if (f.headline) lines.push(`Tagline : ${f.headline}`);
      if (f.experiences.length > 0) {
        lines.push("Parcours :");
        for (const exp of f.experiences) {
          lines.push(`- ${exp.title} @ ${exp.company} (${exp.period})`);
        }
      }
      if (f.education.length > 0) {
        lines.push(`Formation : ${f.education.join("; ")}`);
      }
      if (f.previousVentures.length > 0) {
        lines.push(`Ventures précédentes : ${f.previousVentures.join("; ")}`);
      }
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

  // All agent findings
  const agentEntries = Object.entries(context.allAgentFindings);
  if (agentEntries.length > 0) {
    lines.push("## Résultats d'analyse par agent");
    for (const [agentName, finding] of agentEntries) {
      const scoreStr = finding.score != null ? ` (${finding.score}/100)` : "";
      lines.push(`### ${agentName}${scoreStr}`);
      if (finding.summary) lines.push(finding.summary);
      for (const f of finding.keyFindings) {
        lines.push(`- ${f}`);
      }
    }
    lines.push("");
  }

  // Negotiation strategy
  if (context.negotiationStrategy) {
    lines.push("## Stratégie de négociation");
    lines.push(context.negotiationStrategy);
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
      lines.push(`### Session du ${s.date}${s.duration ? ` (${s.duration} min)` : ""}`);
      if (s.keyFindings.length > 0) {
        lines.push(`- Constats : ${s.keyFindings.join("; ")}`);
      }
      if (s.unresolvedQuestions.length > 0) {
        lines.push(
          `- Questions non résolues : ${s.unresolvedQuestions.join("; ")}`
        );
      }

      // Render condensed intel if available
      if (s.condensedIntel) {
        const ci = s.condensedIntel;
        if (ci.keyFacts.length > 0) {
          lines.push(
            `- Faits clés : ${ci.keyFacts.map((f) => `[${f.category}] ${f.fact}`).join("; ")}`
          );
        }
        if (ci.financialDataPoints.length > 0) {
          lines.push(
            `- Données financières : ${ci.financialDataPoints.map((f) => `${f.metric}=${f.value}`).join("; ")}`
          );
        }
        if (ci.founderCommitments.length > 0) {
          lines.push(
            `- Engagements fondateur : ${ci.founderCommitments.map((c) => c.commitment + (c.deadline ? ` (${c.deadline})` : "")).join("; ")}`
          );
        }
        if (ci.competitiveInsights.length > 0) {
          lines.push(
            `- Insights concurrentiels : ${ci.competitiveInsights.join("; ")}`
          );
        }
        if (ci.teamRevelations.length > 0) {
          lines.push(
            `- Mouvements équipe : ${ci.teamRevelations.join("; ")}`
          );
        }
        if (ci.answersObtained.length > 0) {
          lines.push(
            `- Réponses obtenues : ${ci.answersObtained.map((a) => `${a.topic}: ${a.answer}`).join("; ")}`
          );
        }
        if (ci.visualDataPoints.length > 0) {
          lines.push(
            `- Données visuelles : ${ci.visualDataPoints.join("; ")}`
          );
        }
        if (ci.contradictionsWithAnalysis.length > 0) {
          lines.push(
            `- Contradictions : ${ci.contradictionsWithAnalysis.map((c) => `"${c.analysisClaim}" vs "${c.callClaim}" [${c.severity}]`).join("; ")}`
          );
        }
        if (ci.confidenceDelta) {
          lines.push(
            `- Confiance : ${ci.confidenceDelta.direction} — ${ci.confidenceDelta.reason}`
          );
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// Helper for formatting euros
function formatEuro(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M€`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K€`;
  return `${val}€`;
}
