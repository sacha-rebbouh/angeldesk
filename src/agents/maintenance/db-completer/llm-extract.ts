/**
 * DB_COMPLETER - LLM Extraction
 *
 * Extrait les données structurées via DeepSeek (via OpenRouter)
 *
 * Améliorations:
 * - Prompt optimisé via cache (~250 tokens au lieu de ~600)
 * - Circuit breaker pour l'API
 * - Validation/retry JSON intelligent
 * - Support du chunking pour contenus longs
 * - Calcul du coût réel basé sur les tokens consommés
 */

import type { LLMExtractionResult } from '../types'
import { MAINTENANCE_CONSTANTS } from '../types'
import {
  withTimeout,
  withRetry,
  createLogger,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
  getCircuitBreakerStatus,
  chunkContent,
  type ContentChunk,
} from '../utils'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  mapToExactIndustry,
  estimateTokens,
} from './prompt-cache'

const logger = createLogger('DB_COMPLETER:llm-extract')

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'deepseek/deepseek-chat' // DeepSeek V3 - très low cost
const LLM_CIRCUIT_NAME = 'deepseek-llm'

// Circuit breaker config pour LLM: 3 fails → pause 5min
const LLM_CIRCUIT_CONFIG = {
  failureThreshold: 3,
  resetTimeoutMs: 5 * 60 * 1000,
  successThreshold: 2,
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Résultat de l'extraction avec métadonnées
 */
export interface LLMExtractionResponse {
  result: LLMExtractionResult | null
  usage: TokenUsage | null
  error?: string
}

/**
 * Usage des tokens pour le calcul de coût
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extrait les données structurées d'une company via LLM
 * Gère automatiquement le chunking si le contenu est trop long
 */
export async function extractWithLLM(
  companyName: string,
  content: string
): Promise<LLMExtractionResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    logger.error('OPENROUTER_API_KEY not configured')
    return { result: null, usage: null, error: 'API key not configured' }
  }

  // Vérifier le circuit breaker
  if (isCircuitOpen(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)) {
    const status = getCircuitBreakerStatus(LLM_CIRCUIT_NAME)
    logger.warn(`Circuit breaker open for LLM, skipping "${companyName}"`, {
      failures: status.failures,
      openUntil: status.openUntil?.toISOString(),
    })
    return { result: null, usage: null, error: 'Circuit breaker open' }
  }

  // Vérifier si le contenu nécessite du chunking
  const estimatedContentTokens = estimateTokens(content)
  const MAX_CONTENT_TOKENS = 3000 // Garder de la marge pour le prompt

  if (estimatedContentTokens > MAX_CONTENT_TOKENS) {
    logger.debug(`Content too long (${estimatedContentTokens} tokens), using chunking`)
    return extractWithChunking(apiKey, companyName, content)
  }

  // Extraction simple
  return extractSingle(apiKey, companyName, content)
}

/**
 * Extraction simple (contenu court)
 */
async function extractSingle(
  apiKey: string,
  companyName: string,
  content: string
): Promise<LLMExtractionResponse> {
  const userPrompt = buildUserPrompt(companyName, content)

  try {
    const response = await withRetry(
      () =>
        withTimeout(
          callLLM(apiKey, userPrompt),
          MAINTENANCE_CONSTANTS.LLM_TIMEOUT_MS,
          'LLM extraction timeout'
        ),
      {
        maxAttempts: 2,
        baseDelayMs: 2000,
        onRetry: (attempt, error) => {
          logger.warn(`LLM retry ${attempt} for "${companyName}": ${error.message}`)
        },
      }
    )

    recordCircuitSuccess(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)
    return response
  } catch (error) {
    recordCircuitFailure(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)
    logger.error(`LLM extraction failed for "${companyName}"`, {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return { result: null, usage: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Extraction avec chunking (contenu long)
 * Fait une synthèse partielle de chaque chunk puis fusionne
 */
async function extractWithChunking(
  apiKey: string,
  companyName: string,
  content: string
): Promise<LLMExtractionResponse> {
  // Créer les chunks à partir des sources
  const sources = parseContentToSources(content)
  const chunks = chunkContent(sources, { maxChunkLength: 8000 })

  logger.debug(`Processing ${chunks.length} chunks for "${companyName}"`)

  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const partialResults: LLMExtractionResult[] = []

  // Extraire de chaque chunk
  for (const chunk of chunks) {
    const chunkPrompt = buildUserPrompt(
      companyName,
      `[Chunk ${chunk.index + 1}/${chunk.totalChunks}]\n${chunk.text}`
    )

    try {
      const response = await withTimeout(
        callLLM(apiKey, chunkPrompt),
        MAINTENANCE_CONSTANTS.LLM_TIMEOUT_MS
      )

      if (response.result) {
        partialResults.push(response.result)
      }
      if (response.usage) {
        totalUsage.promptTokens += response.usage.promptTokens
        totalUsage.completionTokens += response.usage.completionTokens
        totalUsage.totalTokens += response.usage.totalTokens
      }
    } catch (error) {
      logger.warn(`Chunk ${chunk.index + 1} extraction failed`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
    }
  }

  if (partialResults.length === 0) {
    recordCircuitFailure(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)
    return { result: null, usage: totalUsage, error: 'All chunks failed' }
  }

  // Fusionner les résultats partiels
  const mergedResult = mergePartialResults(partialResults)
  recordCircuitSuccess(LLM_CIRCUIT_NAME, LLM_CIRCUIT_CONFIG)

  return { result: mergedResult, usage: totalUsage }
}

/**
 * Parse le contenu brut en sources pour le chunking
 */
function parseContentToSources(content: string): Array<{ title: string; text: string }> {
  const parts = content.split(/\n\n---\n\n/)
  return parts.map((part, i) => {
    const match = part.match(/^Source: (.+)\n/)
    return {
      title: match ? match[1] : `Source ${i + 1}`,
      text: match ? part.replace(/^Source: .+\n/, '') : part,
    }
  })
}

/**
 * Fusionne plusieurs résultats partiels en un seul
 * Privilégie les données les plus complètes/confiantes
 */
function mergePartialResults(results: LLMExtractionResult[]): LLMExtractionResult {
  if (results.length === 1) return results[0]

  // Trier par confidence décroissante
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence)
  const base = { ...sorted[0] }

  // Fusionner les champs manquants depuis les autres résultats
  for (const result of sorted.slice(1)) {
    // Champs simples: prendre si manquant
    if (!base.industry && result.industry) base.industry = result.industry
    if (!base.description && result.description) base.description = result.description
    if (!base.activity_status && result.activity_status) {
      base.activity_status = result.activity_status
      base.activity_status_details = result.activity_status_details
    }
    if (!base.headquarters_country && result.headquarters_country) {
      base.headquarters_country = result.headquarters_country
      base.headquarters_city = result.headquarters_city
    }
    if (!base.founded_year && result.founded_year) base.founded_year = result.founded_year
    if (!base.website && result.website) base.website = result.website
    if (!base.business_model && result.business_model) base.business_model = result.business_model
    if (!base.target_market && result.target_market) base.target_market = result.target_market
    if (!base.employees && result.employees) base.employees = result.employees
    if (!base.total_raised && result.total_raised) base.total_raised = result.total_raised

    // Arrays: fusionner sans doublons
    base.founders = mergeArrays(base.founders, result.founders, (f) => f.name.toLowerCase())
    base.investors = [...new Set([...base.investors, ...result.investors])]
    base.competitors = [...new Set([...base.competitors, ...result.competitors])]
    base.notable_clients = [...new Set([...base.notable_clients, ...result.notable_clients])]
  }

  // Recalculer confidence et completeness
  base.confidence = Math.round(
    sorted.reduce((sum, r) => sum + r.confidence, 0) / sorted.length
  )
  base.data_completeness = calculateCompleteness(base)

  return base
}

/**
 * Fusionne deux arrays d'objets sans doublons
 */
function mergeArrays<T>(arr1: T[], arr2: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of [...arr1, ...arr2]) {
    const key = keyFn(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }

  return result
}

/**
 * Calcule le pourcentage de complétude d'un résultat
 */
function calculateCompleteness(result: LLMExtractionResult): number {
  const fields = [
    result.industry,
    result.description,
    result.activity_status,
    result.headquarters_country,
    result.founded_year,
    result.website,
    result.founders.length > 0,
    result.investors.length > 0,
    result.business_model,
    result.target_market,
  ]

  const filled = fields.filter(Boolean).length
  return Math.round((filled / fields.length) * 100)
}

// ============================================================================
// LLM API CALL
// ============================================================================

/**
 * Appelle le LLM via OpenRouter avec validation JSON robuste
 */
async function callLLM(apiKey: string, userPrompt: string): Promise<LLMExtractionResponse> {
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fullinvest.io',
      'X-Title': 'FULLINVEST DB Enrichment',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as OpenRouterResponse

  // Capturer l'usage des tokens
  const usage: TokenUsage | null = data.usage
    ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      }
    : null

  if (!data.choices?.[0]?.message?.content) {
    return { result: null, usage, error: 'No content in LLM response' }
  }

  const content = data.choices[0].message.content.trim()

  // Parse et valide le JSON avec retry si nécessaire
  const parseResult = await parseAndValidateJSON(content, apiKey)

  return {
    result: parseResult.result,
    usage,
    error: parseResult.error,
  }
}

// ============================================================================
// JSON PARSING & VALIDATION
// ============================================================================

interface ParseResult {
  result: LLMExtractionResult | null
  error?: string
}

/**
 * Parse et valide le JSON avec plusieurs niveaux de fallback
 */
async function parseAndValidateJSON(
  content: string,
  apiKey: string
): Promise<ParseResult> {
  // Étape 1: Nettoyage et parse direct
  let jsonStr = cleanJsonResponse(content)

  try {
    const parsed = JSON.parse(jsonStr) as LLMExtractionResult
    return { result: validateAndNormalize(parsed) }
  } catch {
    logger.debug('Initial JSON parse failed, trying fixes')
  }

  // Étape 2: Fixes automatiques courants
  jsonStr = applyCommonJsonFixes(jsonStr)

  try {
    const parsed = JSON.parse(jsonStr) as LLMExtractionResult
    return { result: validateAndNormalize(parsed) }
  } catch {
    logger.debug('Auto-fix JSON parse failed, trying LLM fix')
  }

  // Étape 3: Demander au LLM de fixer le JSON
  try {
    const fixedResult = await retryWithJsonFix(apiKey, content)
    if (fixedResult) {
      return { result: validateAndNormalize(fixedResult) }
    }
  } catch (error) {
    logger.warn('LLM JSON fix failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
  }

  // Étape 4: Extraction partielle via regex (dernier recours)
  const partialResult = extractCriticalFieldsViaRegex(content)
  if (partialResult) {
    logger.info('Fallback to regex extraction succeeded')
    return { result: partialResult }
  }

  return { result: null, error: 'Failed to parse JSON after all attempts' }
}

/**
 * Nettoie la réponse brute du LLM
 */
function cleanJsonResponse(content: string): string {
  return content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/**
 * Applique des fixes automatiques courants pour les JSON malformés
 */
function applyCommonJsonFixes(jsonStr: string): string {
  return jsonStr
    // Trailing commas
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    // Single quotes -> double quotes (attention aux apostrophes dans le texte)
    .replace(/(\w)'(\w)/g, '$1\u2019$2') // Préserver les apostrophes
    .replace(/'/g, '"')
    .replace(/\u2019/g, "'") // Restaurer les apostrophes
    // Unquoted keys (simple pattern)
    .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":')
    // Remove comments
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Fix common typos
    .replace(/"null"/g, 'null')
    .replace(/"true"/g, 'true')
    .replace(/"false"/g, 'false')
    .trim()
}

/**
 * Demande au LLM de corriger un JSON malformé
 */
async function retryWithJsonFix(
  apiKey: string,
  malformedContent: string
): Promise<LLMExtractionResult | null> {
  const truncated = malformedContent.slice(0, 1000)

  const fixPrompt = `This JSON is malformed. Fix it and return ONLY valid JSON (no explanation):

${truncated}${malformedContent.length > 1000 ? '...' : ''}

Return the fixed JSON:`

  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fullinvest.io',
      'X-Title': 'FULLINVEST JSON Fix',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: fixPrompt }],
      temperature: 0,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    throw new Error('JSON fix request failed')
  }

  const data = (await response.json()) as OpenRouterResponse
  const fixedContent = data.choices?.[0]?.message?.content?.trim()

  if (!fixedContent) {
    return null
  }

  const cleaned = cleanJsonResponse(fixedContent)
  return JSON.parse(cleaned) as LLMExtractionResult
}

/**
 * Extraction des champs critiques via regex (dernier recours)
 */
function extractCriticalFieldsViaRegex(content: string): LLMExtractionResult | null {
  const result: Partial<LLMExtractionResult> = {
    company_name: null,
    activity_status: null,
    activity_status_details: null,
    industry: null,
    sub_industry: null,
    description: null,
    business_model: null,
    target_market: null,
    headquarters_country: null,
    headquarters_city: null,
    founded_year: null,
    founders: [],
    employees: null,
    total_raised: null,
    last_round_amount: null,
    last_round_stage: null,
    investors: [],
    competitors: [],
    notable_clients: [],
    website: null,
    is_profitable: null,
    confidence: 30, // Basse confidence pour extraction regex
    data_completeness: 0,
  }

  // Extraire industry
  const industryMatch = content.match(/"industry"\s*:\s*"([^"]+)"/i)
  if (industryMatch) {
    result.industry = mapToExactIndustry(industryMatch[1])
  }

  // Extraire activity_status
  const statusMatch = content.match(/"activity_status"\s*:\s*"(active|shutdown|acquired|pivoted)"/i)
  if (statusMatch) {
    result.activity_status = statusMatch[1] as LLMExtractionResult['activity_status']
  }

  // Extraire description
  const descMatch = content.match(/"description"\s*:\s*"([^"]{10,500})"/i)
  if (descMatch) {
    result.description = descMatch[1]
  }

  // Extraire website
  const websiteMatch = content.match(/"website"\s*:\s*"(https?:\/\/[^"]+)"/i)
  if (websiteMatch) {
    result.website = websiteMatch[1]
  }

  // Extraire founded_year
  const yearMatch = content.match(/"founded_year"\s*:\s*(\d{4})/i)
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10)
    if (year >= 1900 && year <= new Date().getFullYear()) {
      result.founded_year = year
    }
  }

  // Extraire confidence
  const confMatch = content.match(/"confidence"\s*:\s*(\d+)/i)
  if (confMatch) {
    result.confidence = Math.min(parseInt(confMatch[1], 10), 50) // Cap à 50 pour regex
  }

  // Calculer completeness
  const filled = [result.industry, result.activity_status, result.description, result.website, result.founded_year]
    .filter(Boolean).length
  result.data_completeness = Math.round((filled / 10) * 100)

  // Retourner seulement si on a extrait quelque chose d'utile
  if (result.industry || result.activity_status || result.description) {
    return result as LLMExtractionResult
  }

  return null
}

/**
 * Valide et normalise le résultat parsé
 */
function validateAndNormalize(parsed: LLMExtractionResult): LLMExtractionResult {
  // Valider/mapper l'industrie
  if (parsed.industry) {
    parsed.industry = mapToExactIndustry(parsed.industry)
  }

  // Assurer les valeurs par défaut
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0) {
    parsed.confidence = 50
  }
  if (typeof parsed.data_completeness !== 'number' || parsed.data_completeness < 0) {
    parsed.data_completeness = calculateCompleteness(parsed)
  }

  // Assurer que les arrays existent
  if (!Array.isArray(parsed.founders)) parsed.founders = []
  if (!Array.isArray(parsed.investors)) parsed.investors = []
  if (!Array.isArray(parsed.competitors)) parsed.competitors = []
  if (!Array.isArray(parsed.notable_clients)) parsed.notable_clients = []

  // Valider founded_year
  if (parsed.founded_year) {
    const year = parsed.founded_year
    if (year < 1900 || year > new Date().getFullYear() + 1) {
      parsed.founded_year = null
    }
  }

  // Valider activity_status
  const validStatuses = ['active', 'shutdown', 'acquired', 'pivoted', null]
  if (!validStatuses.includes(parsed.activity_status)) {
    parsed.activity_status = null
  }

  return parsed
}

// ============================================================================
// OPENROUTER TYPES
// ============================================================================

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
// EXPORTS
// ============================================================================

export {
  extractSingle,
  extractWithChunking,
  parseAndValidateJSON,
  mergePartialResults,
  LLM_CIRCUIT_NAME,
  getCircuitBreakerStatus as getLLMCircuitStatus,
}
