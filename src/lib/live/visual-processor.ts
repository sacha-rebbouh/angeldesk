// ============================================================================
// Live Coaching — Visual Processor
// ============================================================================
// Single-stage HAIKU vision pipeline for analyzing screen-shared content.
// Classifies + analyzes in one call (~5-8s vs 22s with two-stage).
//
// Maintains an in-memory cache of the current visual context per session,
// which the coaching engine injects into its prompts.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeVisionJSON } from "@/services/openrouter/router";
import { serializeContext } from "@/lib/live/context-compiler";
import { logCoachingLatency, logCoachingError, trackCoachingCost } from "@/lib/live/monitoring";
import type {
  VisualAnalysis,
  VisualContext,
  VisualContentType,
  DealContext,
} from "@/lib/live/types";

const VALID_CONTENT_TYPES: VisualContentType[] = [
  "slide", "dashboard", "demo", "code", "spreadsheet", "document", "other",
];

// Sanitize LLM-generated text before re-injecting into subsequent prompts
// Prevents cross-stage indirect prompt injection via visual content
function sanitizeLLMOutput(text: string): string {
  return text
    .replace(/```/g, "")
    .replace(/<\/?system>/gi, "")
    .replace(/<\/?user>/gi, "")
    .replace(/<\/?assistant>/gi, "")
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .slice(0, 2000);
}

// ============================================================================
// IN-MEMORY STATE (same pattern as context-compiler.ts)
// ============================================================================

interface VisualState {
  screenShareActive: boolean;
  lastAnalysis: VisualAnalysis | null;
  recentAnalyses: VisualAnalysis[]; // Last 5
  processing: boolean;
  updatedAt: number;
}

const visualStateCache = new Map<string, VisualState>();
const STATE_TTL_MS = 60 * 60_000; // 1 hour

function getOrCreateState(sessionId: string): VisualState {
  const existing = visualStateCache.get(sessionId);
  if (existing && Date.now() - existing.updatedAt < STATE_TTL_MS) {
    return existing;
  }
  const state: VisualState = {
    screenShareActive: false,
    lastAnalysis: null,
    recentAnalyses: [],
    processing: false,
    updatedAt: Date.now(),
  };
  visualStateCache.set(sessionId, state);
  return state;
}

// ============================================================================
// PUBLIC API — Screen share state
// ============================================================================

export function setScreenShareState(sessionId: string, active: boolean): void {
  const state = getOrCreateState(sessionId);
  state.screenShareActive = active;
  state.updatedAt = Date.now();
}

export function getScreenShareState(sessionId: string): boolean {
  return getOrCreateState(sessionId).screenShareActive;
}

export function clearVisualState(sessionId: string): void {
  visualStateCache.delete(sessionId);
}

// ============================================================================
// PUBLIC API — Visual context for coaching engine injection
// ============================================================================

export function getVisualContext(sessionId: string): VisualContext | null {
  const state = visualStateCache.get(sessionId);
  if (!state || !state.lastAnalysis) return null;
  return buildVisualContextFromAnalysis(state.lastAnalysis, state.recentAnalyses);
}

/**
 * DB fallback for getVisualContext — used when the in-memory cache is empty
 * (e.g. Vercel serverless cold start on a different instance).
 * Queries the latest ScreenCapture from DB.
 */
export async function getVisualContextWithFallback(
  sessionId: string
): Promise<VisualContext | null> {
  // Try in-memory cache first (fast path)
  const cached = getVisualContext(sessionId);
  if (cached) return cached;

  // DB fallback — fetch latest ScreenCapture
  try {
    const captures = await prisma.screenCapture.findMany({
      where: { sessionId },
      orderBy: { timestamp: "desc" },
      take: 5,
      select: {
        description: true,
        keyData: true,
        contradictions: true,
        newInsights: true,
        suggestedQuestion: true,
      },
    });

    if (captures.length === 0) return null;

    const latest = captures[0];
    const keyData = latest.keyData as VisualAnalysis["keyData"];
    const contradictions = latest.contradictions as VisualAnalysis["contradictions"];
    const newInsights = latest.newInsights as string[];
    const suggestedQuestion = (latest.suggestedQuestion as string | null) ?? null;

    const keyDataLines = (Array.isArray(keyData) ? keyData : []).map(
      (d) => `[${d.category}] ${d.dataPoint}`
    );
    for (const insight of Array.isArray(newInsights) ? newInsights : []) {
      keyDataLines.push(`[new] ${insight}`);
    }
    if (suggestedQuestion) {
      keyDataLines.push(`[question suggérée] ${suggestedQuestion}`);
    }

    // Sanitize DB-stored LLM output before re-injection into coaching prompts
    return {
      currentSlide: sanitizeLLMOutput(latest.description ?? ""),
      keyDataFromVisual: keyDataLines.map(sanitizeLLMOutput),
      visualContradictions: (Array.isArray(contradictions) ? contradictions : []).map(
        (c) => sanitizeLLMOutput(`Visuel: "${c.visualClaim}" vs Analyse: "${c.analysisClaim}" (${c.severity})`)
      ),
      recentSlideHistory: captures.slice(1).map((c) => sanitizeLLMOutput(c.description)),
    };
  } catch (error) {
    console.error(`[visual-processor] DB fallback failed for ${sessionId}:`, error);
    return null;
  }
}

function buildVisualContextFromAnalysis(
  last: VisualAnalysis,
  recentAnalyses: VisualAnalysis[]
): VisualContext {
  const keyDataLines = last.keyData.map(
    (d) => `[${d.category}] ${d.dataPoint}`
  );
  for (const insight of last.newInsights) {
    keyDataLines.push(`[new] ${insight}`);
  }
  if (last.suggestedQuestion) {
    keyDataLines.push(`[question suggérée] ${last.suggestedQuestion}`);
  }

  return {
    currentSlide: sanitizeLLMOutput(last.description),
    keyDataFromVisual: keyDataLines.map(sanitizeLLMOutput),
    visualContradictions: last.contradictions.map(
      (c) => sanitizeLLMOutput(`Visuel: "${c.visualClaim}" vs Analyse: "${c.analysisClaim}" (${c.severity})`)
    ),
    recentSlideHistory: recentAnalyses
      .filter((a) => a !== last)
      .map((a) => sanitizeLLMOutput(a.description)),
  };
}

// ============================================================================
// SINGLE-STAGE HAIKU VISION — classify + analyze in one call
// ============================================================================

const ANALYZE_PROMPT = `Tu es l'analyste visuel d'un Business Angel expérimenté pendant un call avec un fondateur.

## Contexte deal
{DEAL_CONTEXT}

## Contenu précédent à l'écran
{PREVIOUS}

## Instructions
1. Si l'écran ne montre PAS de contenu significatif (pas de slide, dashboard, doc, code) OU si le contenu est IDENTIQUE au précédent → réponds { "isNewContent": false }
2. Si c'est du contenu NOUVEAU ou significativement différent :
   - Identifie le type (slide, dashboard, demo, code, spreadsheet, document, other)
   - Décris le contenu en 1 phrase concise
   - Extrais CHAQUE donnée chiffrée ou factuelle visible (revenue, MRR, ARR, croissance, users, churn, CAC, LTV, runway, effectifs, parts de marché, etc.)
   - Compare au contexte deal : y a-t-il des écarts entre ce qui est affiché et ce que l'analyse du deal indique ?
   - Pour chaque écart, formule une question précise et incisive que le BA devrait poser

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.

## Format JSON
{
  "isNewContent": true,
  "contentType": "slide|dashboard|demo|code|spreadsheet|document|other",
  "description": "Description concise du contenu affiché",
  "keyData": [{ "dataPoint": "MRR: 45K€", "category": "financial|technical|market|team|other", "relevance": "high|medium|low" }],
  "contradictions": [{
    "visualClaim": "Ce que la slide/écran affirme (avec le chiffre exact)",
    "analysisClaim": "Ce que l'analyse du deal indique (avec le chiffre exact)",
    "severity": "high|medium|low",
    "suggestedQuestion": "Question directe et incisive pour le BA"
  }],
  "newInsights": ["Info nouvelle non couverte par l'analyse"],
  "suggestedQuestion": "Question globale la plus pertinente à poser" | null
}

Si pas de contenu nouveau : { "isNewContent": false }`;

interface SingleStageResult {
  isNewContent: boolean;
  contentType?: VisualContentType;
  description?: string;
  keyData?: VisualAnalysis["keyData"];
  contradictions?: Array<{
    visualClaim: string;
    analysisClaim: string;
    severity: "high" | "medium" | "low";
    suggestedQuestion?: string;
  }>;
  newInsights?: string[];
  suggestedQuestion?: string | null;
}

// ============================================================================
// MAIN PIPELINE — processVisualFrame
// ============================================================================

export interface ProcessVisualFrameResult {
  analyzed: boolean;
  analysis: VisualAnalysis | null;
  cost: number;
}

/**
 * Analyze a single frame using the compact deal context.
 * Internal — called by processVisualFrame and the pending-frame drain loop.
 */
async function analyzeFrame(
  sessionId: string,
  imageBase64: string,
  timestamp: number,
  dealContext: DealContext,
  state: VisualState
): Promise<ProcessVisualFrameResult> {
  const pipelineStart = Date.now();

  try {
    const previousDesc = sanitizeLLMOutput(
      state.lastAnalysis?.description ?? "Aucun (première capture)"
    );

    // Full deal context — all agents, financials, founders, benchmarks
    const prompt = ANALYZE_PROMPT
      .replace("{DEAL_CONTEXT}", serializeContext(dealContext))
      .replace("{PREVIOUS}", previousDesc);

    const { data, cost } = await completeVisionJSON<SingleStageResult>(
      prompt,
      imageBase64,
      {
        model: "HAIKU",
        maxTokens: 800,
        temperature: 0.2,
      }
    );

    trackCoachingCost(sessionId, "visual-pipeline", cost);

    if (!data.isNewContent) {
      logCoachingLatency(sessionId, "visual_pipeline_total", pipelineStart);
      return { analyzed: false, analysis: null, cost };
    }

    // Validate contentType
    const contentType: VisualContentType = VALID_CONTENT_TYPES.includes(
      data.contentType as VisualContentType
    )
      ? (data.contentType as VisualContentType)
      : "other";

    // Normalize contradictions with per-item suggestedQuestion
    const contradictions = (Array.isArray(data.contradictions) ? data.contradictions : []).map(
      (c) => ({
        visualClaim: c.visualClaim || "",
        analysisClaim: c.analysisClaim || "",
        severity: (["high", "medium", "low"].includes(c.severity) ? c.severity : "medium") as "high" | "medium" | "low",
        suggestedQuestion: c.suggestedQuestion || null,
      })
    );

    // Globally unique frameId
    const rand = Math.random().toString(36).slice(2, 8);
    const frameId = `frame-${sessionId}-${timestamp}-${rand}`;
    const analysis: VisualAnalysis = {
      frameId,
      sessionId,
      timestamp,
      contentType,
      description: data.description || "",
      keyData: Array.isArray(data.keyData) ? data.keyData : [],
      contradictions,
      newInsights: Array.isArray(data.newInsights) ? data.newInsights : [],
      suggestedQuestion: data.suggestedQuestion || null,
      analysisCost: cost,
    };

    // Update cache
    state.lastAnalysis = analysis;
    state.recentAnalyses = [analysis, ...state.recentAnalyses].slice(0, 5);
    state.updatedAt = Date.now();

    logCoachingLatency(sessionId, "visual_pipeline_total", pipelineStart);

    return { analyzed: true, analysis, cost };
  } catch (error) {
    logCoachingError(sessionId, "visual_processor", error);
    return { analyzed: false, analysis: null, cost: 0 };
  }
}

/**
 * Process a visual frame with simple processing lock.
 * If already processing, the frame is dropped (the rate limiter in visual-frame
 * route ensures we don't lose too many — max 1 frame per 3s anyway).
 */
export async function processVisualFrame(
  sessionId: string,
  imageBase64: string,
  timestamp: number,
  dealContext: DealContext
): Promise<ProcessVisualFrameResult> {
  const state = getOrCreateState(sessionId);

  if (state.processing) {
    return { analyzed: false, analysis: null, cost: 0 };
  }

  state.processing = true;
  try {
    return await analyzeFrame(sessionId, imageBase64, timestamp, dealContext, state);
  } catch (error) {
    logCoachingError(sessionId, "visual_processor", error);
    return { analyzed: false, analysis: null, cost: 0 };
  } finally {
    state.processing = false;
  }
}
