/**
 * Smart Context Compression for AI Board
 *
 * Reduces ~450K tokens of raw agent JSON to ~60-80K tokens of structured text.
 * Strategy: Tier 3 syntheses already digest Tier 1 data, so we use Tier 3 as the
 * primary source and only include compact Tier 1 summaries for reference.
 */

import { sanitizeName, sanitizeDocumentText, sanitizeForLLM } from "@/lib/sanitize";
import type { BoardInput } from "./types";

// Target ~60-80K tokens (~240-320K chars at ~4 chars/token)
const MAX_CONTEXT_CHARS = 300000;
const MAX_DOC_CHARS = 10000;
const MAX_TIER1_SUMMARY_CHARS = 400; // ~100 tokens per agent
const MAX_ENRICHED_CHARS = 8000;

/**
 * Compress full board input into an optimized text context for LLM consumption.
 * Prioritizes Tier 3 syntheses over raw Tier 1 JSON.
 */
export function compressBoardContext(input: BoardInput): string {
  const sections: string[] = [];

  // 1. Deal header
  const safeDealName = sanitizeName(input.dealName);
  const safeCompanyName = sanitizeName(input.companyName);
  sections.push(`# DEAL: ${safeDealName}\nEntreprise: ${safeCompanyName}`);

  // 2. Tier 3 Syntheses (the core — already digested all Tier 1 data)
  const tier3Section = buildTier3Section(input);
  if (tier3Section) sections.push(tier3Section);

  // 3. Fact Store (pre-formatted, high-quality)
  if (input.agentOutputs.factStore?.formatted) {
    sections.push(`## FAITS VERIFIES (Fact Store)\n${input.agentOutputs.factStore.formatted}`);
  }

  // 4. Tier 1 compact summaries (verdict + top findings only)
  const tier1Section = buildTier1Summaries(input);
  if (tier1Section) sections.push(tier1Section);

  // 5. Tier 2 Sector Expert summary
  const tier2Section = buildTier2Summary(input);
  if (tier2Section) sections.push(tier2Section);

  // 6. Documents (already limited by existing sanitization)
  const docsSection = buildDocumentsSection(input);
  if (docsSection) sections.push(docsSection);

  // 7. Enriched data (Context Engine) — compact summary
  const enrichedSection = buildEnrichedSection(input);
  if (enrichedSection) sections.push(enrichedSection);

  // 8. Sources
  const sourcesSection = buildSourcesSection(input);
  if (sourcesSection) sections.push(sourcesSection);

  let result = sections.join("\n\n---\n\n");

  // Safety truncation if somehow over budget
  if (result.length > MAX_CONTEXT_CHARS) {
    result = result.substring(0, MAX_CONTEXT_CHARS) + "\n\n[...contexte tronque pour respecter la limite...]";
  }

  return result;
}

/**
 * Build a short deal summary for debate/vote prompts (~3K tokens).
 */
export function buildDealSummary(input: BoardInput): string {
  const safeDealName = sanitizeName(input.dealName);
  const parts: string[] = [`RAPPEL: Deal "${safeDealName}"`];

  // Score from synthesis
  const synthesis = input.agentOutputs.tier3?.synthesisDealScorer;
  if (synthesis && typeof synthesis === "object") {
    const s = synthesis as Record<string, unknown>;
    if (s.globalScore !== undefined || s.score !== undefined || s.finalScore !== undefined) {
      const score = s.globalScore ?? s.score ?? s.finalScore;
      parts.push(`Score global: ${score}/100`);
    }
    if (s.verdict) {
      parts.push(`Verdict Tier 3: ${s.verdict}`);
    }
  }

  // Top red flags from devil's advocate
  const devil = input.agentOutputs.tier3?.devilsAdvocate;
  if (devil && typeof devil === "object") {
    const d = devil as Record<string, unknown>;
    const flags = (d.criticalRedFlags ?? d.redFlags ?? d.dealbreakers) as string[] | undefined;
    if (Array.isArray(flags) && flags.length > 0) {
      parts.push(`Top red flags: ${flags.slice(0, 3).join(" | ")}`);
    }
  }

  // Thesis from memo
  const memo = input.agentOutputs.tier3?.memoGenerator;
  if (memo && typeof memo === "object") {
    const m = memo as Record<string, unknown>;
    const thesis = m.investmentThesis ?? m.thesis ?? m.recommendation;
    if (typeof thesis === "string") {
      parts.push(`These d'investissement: ${thesis.slice(0, 200)}`);
    }
  }

  return parts.join("\n");
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function buildTier3Section(input: BoardInput): string | null {
  const t3 = input.agentOutputs.tier3;
  if (!t3) return null;

  const parts: string[] = ["## SYNTHESE (Tier 3)"];

  // Synthesis Deal Scorer
  if (t3.synthesisDealScorer) {
    parts.push(`### Score Final (synthesis-deal-scorer)\n${extractStructuredSummary(t3.synthesisDealScorer, 2000)}`);
  }

  // Memo Generator
  if (t3.memoGenerator) {
    parts.push(`### Memo d'Investissement (memo-generator)\n${extractStructuredSummary(t3.memoGenerator, 3000)}`);
  }

  // Devil's Advocate
  if (t3.devilsAdvocate) {
    parts.push(`### Devil's Advocate\n${extractStructuredSummary(t3.devilsAdvocate, 2000)}`);
  }

  // Contradiction Detector
  if (t3.contradictionDetector) {
    parts.push(`### Contradictions Detectees\n${extractStructuredSummary(t3.contradictionDetector, 1500)}`);
  }

  // Scenario Modeler
  if (t3.scenarioModeler) {
    parts.push(`### Scenarios (scenario-modeler)\n${extractStructuredSummary(t3.scenarioModeler, 2000)}`);
  }

  return parts.length > 1 ? parts.join("\n\n") : null;
}

function buildTier1Summaries(input: BoardInput): string | null {
  const t1 = input.agentOutputs.tier1;
  if (!t1) return null;

  const agentEntries: [string, unknown][] = [
    ["Deck Forensics", t1.deckForensics],
    ["Financial Auditor", t1.financialAuditor],
    ["Market Intelligence", t1.marketIntelligence],
    ["Competitive Intel", t1.competitiveIntel],
    ["Team Investigator", t1.teamInvestigator],
    ["Tech Stack DD", t1.techStackDD],
    ["Tech Ops DD", t1.techOpsDD],
    ["Legal & Regulatory", t1.legalRegulatory],
    ["Cap Table Auditor", t1.capTableAuditor],
    ["GTM Analyst", t1.gtmAnalyst],
    ["Customer Intel", t1.customerIntel],
    ["Exit Strategist", t1.exitStrategist],
    ["Question Master", t1.questionMaster],
  ];

  const summaries = agentEntries
    .filter(([, data]) => data != null)
    .map(([name, data]) => `### ${name}\n${extractAgentSummary(data)}`)
    .filter(Boolean);

  if (summaries.length === 0) return null;

  return `## RESUMES AGENTS TIER 1 (${summaries.length}/13 agents)\n\n${summaries.join("\n\n")}`;
}

function buildTier2Summary(input: BoardInput): string | null {
  const t2 = input.agentOutputs.tier2;
  if (!t2?.sectorExpert) return null;

  return `## EXPERT SECTORIEL (${t2.sectorExpertName ?? "Tier 2"})\n${extractStructuredSummary(t2.sectorExpert, 2000)}`;
}

function buildDocumentsSection(input: BoardInput): string | null {
  if (input.documents.length === 0) return null;

  const perDocLimit = Math.floor(MAX_DOC_CHARS / Math.max(input.documents.length, 1));

  return `## DOCUMENTS\n${input.documents
    .map(
      (d) =>
        `### ${sanitizeName(d.name)} (${d.type})\n${sanitizeDocumentText(d.extractedText, perDocLimit)}`
    )
    .join("\n\n")}`;
}

function buildEnrichedSection(input: BoardInput): string | null {
  if (!input.enrichedData) return null;

  const parts: string[] = ["## DONNEES ENRICHIES (Context Engine)"];

  const ed = input.enrichedData;

  // LinkedIn profiles — extract key info only
  if (Array.isArray(ed.linkedinProfiles) && ed.linkedinProfiles.length > 0) {
    const profiles = ed.linkedinProfiles.slice(0, 5).map((p) => {
      if (typeof p === "object" && p !== null) {
        const pr = p as Record<string, unknown>;
        return `- ${pr.name ?? "?"}: ${pr.headline ?? pr.title ?? pr.role ?? "N/A"}`;
      }
      return `- ${String(p).slice(0, 100)}`;
    });
    parts.push(`### Profils LinkedIn\n${profiles.join("\n")}`);
  }

  // Market data — compact
  if (ed.marketData) {
    parts.push(`### Donnees Marche\n${extractStructuredSummary(ed.marketData, 1500)}`);
  }

  // Competitor data — compact
  if (ed.competitorData) {
    parts.push(`### Concurrents\n${extractStructuredSummary(ed.competitorData, 1500)}`);
  }

  // Funding history
  if (ed.fundingHistory) {
    parts.push(`### Historique Funding\n${extractStructuredSummary(ed.fundingHistory, 1000)}`);
  }

  // News — just titles
  if (Array.isArray(ed.newsArticles) && ed.newsArticles.length > 0) {
    const news = ed.newsArticles.slice(0, 5).map((n) => {
      if (typeof n === "object" && n !== null) {
        const article = n as Record<string, unknown>;
        return `- ${article.title ?? article.headline ?? String(n).slice(0, 100)}`;
      }
      return `- ${String(n).slice(0, 100)}`;
    });
    parts.push(`### Actualites\n${news.join("\n")}`);
  }

  const result = parts.join("\n\n");
  if (result.length > MAX_ENRICHED_CHARS) {
    return result.substring(0, MAX_ENRICHED_CHARS) + "\n[...donnees enrichies tronquees...]";
  }

  return parts.length > 1 ? result : null;
}

function buildSourcesSection(input: BoardInput): string | null {
  if (input.sources.length === 0) return null;

  return `## SOURCES\n${input.sources
    .map(
      (s) =>
        `- ${sanitizeName(s.source)} [${s.reliability}]: ${s.dataPoints.map((dp) => sanitizeForLLM(dp)).join(", ")}`
    )
    .join("\n")}`;
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extract a compact summary from an agent output.
 * Looks for common fields: verdict, score, confidence, findings, redFlags, etc.
 * Returns ~200-400 chars.
 */
function extractAgentSummary(data: unknown): string {
  if (data == null) return "Pas de donnees";
  if (typeof data === "string") return data.slice(0, MAX_TIER1_SUMMARY_CHARS);
  if (typeof data !== "object") return String(data).slice(0, MAX_TIER1_SUMMARY_CHARS);

  const obj = data as Record<string, unknown>;
  const parts: string[] = [];

  // Verdict / Score line
  const verdict = obj.verdict ?? obj.recommendation ?? obj.assessment;
  const score = obj.score ?? obj.globalScore ?? obj.overallScore ?? obj.confidence;
  if (verdict || score !== undefined) {
    parts.push(
      `Verdict: ${verdict ?? "N/A"}${score !== undefined ? ` | Score: ${score}` : ""}`
    );
  }

  // Top findings
  const findings =
    obj.findings ??
    obj.keyFindings ??
    obj.highlights ??
    obj.arguments ??
    obj.insights ??
    obj.points;
  if (Array.isArray(findings)) {
    const topFindings = findings.slice(0, 3).map((f) => {
      if (typeof f === "string") return f;
      if (typeof f === "object" && f !== null) {
        const fi = f as Record<string, unknown>;
        return fi.point ?? fi.finding ?? fi.title ?? fi.description ?? JSON.stringify(f);
      }
      return String(f);
    });
    parts.push(topFindings.map((f) => `- ${String(f).slice(0, 120)}`).join("\n"));
  }

  // Red flags
  const redFlags =
    obj.redFlags ?? obj.concerns ?? obj.risks ?? obj.warnings ?? obj.criticalIssues;
  if (Array.isArray(redFlags) && redFlags.length > 0) {
    const topFlags = redFlags.slice(0, 3).map((f) => {
      if (typeof f === "string") return f;
      if (typeof f === "object" && f !== null) {
        const fi = f as Record<string, unknown>;
        return fi.concern ?? fi.flag ?? fi.issue ?? fi.description ?? JSON.stringify(f);
      }
      return String(f);
    });
    parts.push(`Red flags: ${topFlags.map((f) => String(f).slice(0, 80)).join(" | ")}`);
  }

  const result = parts.join("\n");
  return result.length > 0 ? result.slice(0, MAX_TIER1_SUMMARY_CHARS) : "Analyse completee (voir details)";
}

/**
 * Extract a structured summary from a complex agent output.
 * Tries to format key fields as readable text instead of raw JSON.
 */
function extractStructuredSummary(data: unknown, maxChars: number): string {
  if (data == null) return "Pas de donnees";
  if (typeof data === "string") return data.slice(0, maxChars);
  if (typeof data !== "object") return String(data).slice(0, maxChars);

  const obj = data as Record<string, unknown>;
  const parts: string[] = [];

  // Iterate over top-level keys and format them
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;

    if (typeof value === "string") {
      parts.push(`**${key}**: ${value}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`**${key}**: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const items = value.slice(0, 5).map((item) => {
        if (typeof item === "string") return `  - ${item}`;
        if (typeof item === "object" && item !== null) {
          const it = item as Record<string, unknown>;
          // Try to find a meaningful string field
          const text =
            it.point ??
            it.title ??
            it.description ??
            it.finding ??
            it.concern ??
            it.name ??
            it.factor ??
            it.scenario;
          if (typeof text === "string") return `  - ${text}`;
          return `  - ${JSON.stringify(item).slice(0, 150)}`;
        }
        return `  - ${String(item)}`;
      });
      parts.push(`**${key}**:\n${items.join("\n")}`);
    } else if (typeof value === "object") {
      // Nested object — compact JSON
      const json = JSON.stringify(value);
      if (json.length > 300) {
        // Extract sub-keys
        const subObj = value as Record<string, unknown>;
        const subParts = Object.entries(subObj)
          .slice(0, 5)
          .map(([sk, sv]) => {
            if (typeof sv === "string" || typeof sv === "number" || typeof sv === "boolean") {
              return `  ${sk}: ${sv}`;
            }
            return `  ${sk}: ${JSON.stringify(sv).slice(0, 100)}`;
          });
        parts.push(`**${key}**:\n${subParts.join("\n")}`);
      } else {
        parts.push(`**${key}**: ${json}`);
      }
    }
  }

  const result = parts.join("\n");
  if (result.length > maxChars) {
    return result.substring(0, maxChars) + "\n[...tronque...]";
  }
  return result || "Donnees structurees (voir analyse complete)";
}
