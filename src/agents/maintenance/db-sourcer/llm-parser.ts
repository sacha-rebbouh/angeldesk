/**
 * DB_SOURCER - LLM Parser
 *
 * Extraction intelligente des informations de levée de fonds via LLM
 * Remplace le parser regex pour une meilleure précision
 */

import type { ParsedFunding } from '../types'
import { MAINTENANCE_CONSTANTS } from '../types'
import {
  withTimeout,
  withRetry,
  createLogger,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
  normalizeStage,
} from '../utils'

const logger = createLogger('DB_SOURCER:llm-parser')

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'deepseek/deepseek-chat' // Low cost model

const LLM_CIRCUIT_NAME = 'sourcer-llm'
const LLM_CIRCUIT_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 5 * 60 * 1000,
  successThreshold: 2,
}

// ============================================================================
// TYPES
// ============================================================================

interface LLMFundingExtraction {
  company_name: string | null
  amount: number | null
  currency: 'EUR' | 'USD' | 'GBP' | null
  stage: string | null
  investors: string[]
  lead_investor: string | null
  date: string | null // ISO date
  description: string | null
  confidence: number // 0-100
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ============================================================================
// SYSTEM PROMPT (cached)
// ============================================================================

const SYSTEM_PROMPT = `You are a funding news extraction expert. Extract structured funding information from French and English startup news articles.

CRITICAL RULES:
1. Extract ONLY information explicitly stated in the text
2. Do NOT guess or infer amounts, investors, or dates not mentioned
3. If information is missing, set the field to null
4. Convert all amounts to raw numbers (e.g., "5 millions d'euros" → 5000000)
5. Currency must be EUR, USD, or GBP only
6. Date must be in ISO format (YYYY-MM-DD) if extractable
7. Stage must be one of: pre_seed, seed, series_a, series_b, series_c, series_d, growth, bridge, late_stage

RESPONSE FORMAT: Valid JSON only, no markdown.`

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Parse un article de levée de fonds via LLM
 */
export async function parseArticleWithLLM(
  title: string,
  content: string,
  sourceUrl: string,
  sourceName: string,
  publishDate?: Date
): Promise<ParsedFunding | null> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    logger.warn('OPENROUTER_API_KEY not configured, falling back to regex parser')
    return null
  }

  // Check circuit breaker
  if (isCircuitOpen(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)) {
    logger.warn('Circuit breaker open for LLM parser')
    return null
  }

  // Prepare article content (limit to ~2000 tokens)
  const articleText = `Title: ${title}\n\nContent: ${content}`.slice(0, 8000)

  const userPrompt = `Extract funding information from this article:

${articleText}

Return JSON with these fields:
{
  "company_name": "exact company name from article or null",
  "amount": <number in base units or null>,
  "currency": "EUR" | "USD" | "GBP" | null,
  "stage": "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "series_d" | "growth" | "bridge" | "late_stage" | null,
  "investors": ["investor1", "investor2"],
  "lead_investor": "lead investor name or null",
  "date": "YYYY-MM-DD or null",
  "description": "brief company description (max 200 chars) or null",
  "confidence": <0-100 confidence score>
}

Return ONLY valid JSON, no explanation.`

  try {
    const result = await withRetry(
      () =>
        withTimeout(
          callLLM(apiKey, userPrompt),
          MAINTENANCE_CONSTANTS.LLM_TIMEOUT_MS,
          'LLM parsing timeout'
        ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`LLM parse retry ${attempt}: ${error.message}`)
        },
      }
    )

    recordCircuitSuccess(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)

    if (!result) {
      return null
    }

    // Validate and convert to ParsedFunding
    return convertToParsedFunding(result, sourceUrl, sourceName, publishDate)
  } catch (error) {
    recordCircuitFailure(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)
    logger.error('LLM parsing failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      title: title.slice(0, 100),
    })
    return null
  }
}

// ============================================================================
// LLM CALL
// ============================================================================

async function callLLM(apiKey: string, userPrompt: string): Promise<LLMFundingExtraction | null> {
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fullinvest.io',
      'X-Title': 'FULLINVEST DB Sourcer',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as OpenRouterResponse

  if (!data.choices?.[0]?.message?.content) {
    return null
  }

  const content = data.choices[0].message.content.trim()

  // Parse JSON response
  try {
    const cleaned = cleanJsonResponse(content)
    return JSON.parse(cleaned) as LLMFundingExtraction
  } catch (error) {
    logger.warn('Failed to parse LLM JSON response', {
      error: error instanceof Error ? error.message : 'Unknown',
      content: content.slice(0, 200),
    })
    return null
  }
}

function cleanJsonResponse(content: string): string {
  return content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

// ============================================================================
// CONVERSION
// ============================================================================

function convertToParsedFunding(
  extraction: LLMFundingExtraction,
  sourceUrl: string,
  sourceName: string,
  publishDate?: Date
): ParsedFunding | null {
  // Validate required field
  if (!extraction.company_name || extraction.confidence < 50) {
    logger.debug('Extraction rejected: low confidence or missing company name', {
      company: extraction.company_name,
      confidence: extraction.confidence,
    })
    return null
  }

  // Parse date
  let date = publishDate || new Date()
  if (extraction.date) {
    try {
      const parsed = new Date(extraction.date)
      if (!isNaN(parsed.getTime())) {
        date = parsed
      }
    } catch {
      // Keep default date
    }
  }

  return {
    companyName: extraction.company_name,
    amount: extraction.amount,
    currency: extraction.currency || 'EUR',
    stage: normalizeStage(extraction.stage),
    investors: extraction.investors || [],
    leadInvestor: extraction.lead_investor,
    date,
    sourceUrl,
    sourceName,
    description: extraction.description,
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Parse multiple articles efficiently
 * Groups articles to reduce API calls
 */
export async function parseArticlesBatch(
  articles: Array<{
    title: string
    content: string
    sourceUrl: string
    sourceName: string
    publishDate?: Date
  }>,
  options: { maxConcurrent?: number; useLLM?: boolean } = {}
): Promise<Array<ParsedFunding | null>> {
  const { maxConcurrent = 3, useLLM = true } = options

  if (!useLLM) {
    // Fallback to regex parser
    const { parseArticle } = await import('./parser')
    return articles.map((a) =>
      parseArticle(a.title, a.content, a.sourceUrl, a.sourceName, a.publishDate)
    )
  }

  // Process in batches with concurrency limit
  const results: Array<ParsedFunding | null> = []

  for (let i = 0; i < articles.length; i += maxConcurrent) {
    const batch = articles.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map((a) =>
        parseArticleWithLLM(a.title, a.content, a.sourceUrl, a.sourceName, a.publishDate)
      )
    )
    results.push(...batchResults)
  }

  return results
}

// ============================================================================
// HYBRID PARSER (LLM + Regex fallback)
// ============================================================================

/**
 * Parse avec LLM, fallback sur regex si échec
 */
export async function parseArticleHybrid(
  title: string,
  content: string,
  sourceUrl: string,
  sourceName: string,
  publishDate?: Date
): Promise<ParsedFunding | null> {
  // Try LLM first
  const llmResult = await parseArticleWithLLM(
    title,
    content,
    sourceUrl,
    sourceName,
    publishDate
  )

  if (llmResult) {
    return llmResult
  }

  // Fallback to regex parser
  logger.debug('Falling back to regex parser')
  const { parseArticle } = await import('./parser')
  return parseArticle(title, content, sourceUrl, sourceName, publishDate)
}
