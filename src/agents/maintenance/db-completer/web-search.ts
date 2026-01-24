/**
 * DB_COMPLETER - Web Search
 *
 * Recherche web via Brave Search API (gratuit: 2000 req/mois)
 * Inclut un circuit breaker pour éviter les appels inutiles si l'API est down
 * Avec monitoring du fallback DuckDuckGo
 */

import type { WebSearchResult } from '../types'
import {
  withTimeout,
  withRetry,
  createLogger,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
  getCircuitBreakerStatus,
} from '../utils'
import { MAINTENANCE_CONSTANTS } from '../types'

const logger = createLogger('DB_COMPLETER:web-search')

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search'
const BRAVE_CIRCUIT_NAME = 'brave-search'

// Circuit breaker config pour Brave: 3 fails → pause 5min
const BRAVE_CIRCUIT_CONFIG = {
  failureThreshold: 3,
  resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
  successThreshold: 2,
}

// ============================================================================
// FALLBACK MONITORING
// ============================================================================

interface SearchMetrics {
  totalSearches: number
  braveSuccesses: number
  braveFailed: number
  duckDuckGoUsed: number
  lastResetAt: Date
}

// In-memory metrics (reset each run)
const searchMetrics: SearchMetrics = {
  totalSearches: 0,
  braveSuccesses: 0,
  braveFailed: 0,
  duckDuckGoUsed: 0,
  lastResetAt: new Date(),
}

// Threshold for alerting (20% fallback usage)
const FALLBACK_ALERT_THRESHOLD = 0.20

/**
 * Get current search metrics
 */
export function getSearchMetrics(): SearchMetrics & { fallbackRate: number; shouldAlert: boolean } {
  const fallbackRate = searchMetrics.totalSearches > 0
    ? searchMetrics.duckDuckGoUsed / searchMetrics.totalSearches
    : 0

  return {
    ...searchMetrics,
    fallbackRate,
    shouldAlert: fallbackRate >= FALLBACK_ALERT_THRESHOLD && searchMetrics.totalSearches >= 10,
  }
}

/**
 * Reset search metrics (call at start of run)
 */
export function resetSearchMetrics(): void {
  searchMetrics.totalSearches = 0
  searchMetrics.braveSuccesses = 0
  searchMetrics.braveFailed = 0
  searchMetrics.duckDuckGoUsed = 0
  searchMetrics.lastResetAt = new Date()
}

/**
 * Vérifie l'état du circuit breaker Brave (pour monitoring)
 */
export function getBraveCircuitStatus() {
  return getCircuitBreakerStatus(BRAVE_CIRCUIT_NAME)
}

/**
 * Recherche des informations sur une company via Brave Search
 */
export async function searchCompany(companyName: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    logger.warn('BRAVE_API_KEY not configured, skipping web search')
    searchMetrics.braveFailed++
    return []
  }

  // Vérifier le circuit breaker avant d'appeler
  if (isCircuitOpen(BRAVE_CIRCUIT_NAME, BRAVE_CIRCUIT_CONFIG)) {
    const status = getBraveCircuitStatus()
    logger.warn(`Circuit breaker open for Brave Search, skipping "${companyName}"`, {
      failures: status.failures,
      openUntil: status.openUntil?.toISOString(),
    })
    searchMetrics.braveFailed++
    return []
  }

  // Build search query
  // Focus on funding/startup context for better results
  const query = `${companyName} startup levée fonds funding`

  try {
    const results = await withRetry(
      () =>
        withTimeout(
          searchBrave(apiKey, query),
          MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
          'Brave Search timeout'
        ),
      {
        maxAttempts: 2,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Brave search retry ${attempt} for "${companyName}": ${error.message}`)
        },
      }
    )

    // Succès - enregistrer pour le circuit breaker et les métriques
    recordCircuitSuccess(BRAVE_CIRCUIT_NAME, BRAVE_CIRCUIT_CONFIG)
    searchMetrics.braveSuccesses++
    logger.debug(`Brave search for "${companyName}": ${results.length} results`)
    return results
  } catch (error) {
    // Échec - enregistrer pour le circuit breaker et les métriques
    recordCircuitFailure(BRAVE_CIRCUIT_NAME, BRAVE_CIRCUIT_CONFIG)
    searchMetrics.braveFailed++

    const status = getBraveCircuitStatus()
    logger.error(`Brave search failed for "${companyName}"`, {
      error: error instanceof Error ? error.message : 'Unknown',
      circuitFailures: status.failures,
      circuitOpen: status.isOpen,
    })
    return []
  }
}

/**
 * Appelle l'API Brave Search
 */
async function searchBrave(apiKey: string, query: string): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: '5', // Get top 5 results
    safesearch: 'moderate',
    freshness: 'py', // Past year
  })

  const response = await fetch(`${BRAVE_API_BASE}?${params}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Brave API error: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as BraveSearchResponse

  if (!data.web?.results) {
    return []
  }

  return data.web.results.map((result) => ({
    title: result.title,
    description: result.description,
    url: result.url,
  }))
}

// ============================================================================
// BRAVE API TYPES
// ============================================================================

interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string
      description: string
      url: string
      age?: string
    }>
  }
  query?: {
    original: string
  }
}

// ============================================================================
// FALLBACK: DuckDuckGo (if Brave not available)
// ============================================================================

/**
 * Fallback search using DuckDuckGo instant answers
 * Note: Limited results, but doesn't require API key
 */
export async function searchDuckDuckGo(companyName: string): Promise<WebSearchResult[]> {
  const query = encodeURIComponent(`${companyName} startup funding`)

  try {
    const response = await withTimeout(
      fetch(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1`),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS
    )

    if (!response.ok) {
      return []
    }

    const data = (await response.json()) as DuckDuckGoResponse

    const results: WebSearchResult[] = []

    // Add abstract if available
    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.Heading || companyName,
        description: data.Abstract,
        url: data.AbstractURL,
      })
    }

    // Add related topics
    for (const topic of data.RelatedTopics?.slice(0, 3) || []) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.split(' - ')[0] || topic.Text,
          description: topic.Text,
          url: topic.FirstURL,
        })
      }
    }

    return results
  } catch {
    return []
  }
}

interface DuckDuckGoResponse {
  Abstract?: string
  AbstractURL?: string
  Heading?: string
  RelatedTopics?: Array<{
    FirstURL?: string
    Text?: string
  }>
}

// ============================================================================
// COMBINED SEARCH
// ============================================================================

/**
 * Search using Brave, with DuckDuckGo fallback
 * Monitors fallback usage and logs warnings if threshold exceeded
 */
export async function searchWithFallback(companyName: string): Promise<WebSearchResult[]> {
  searchMetrics.totalSearches++

  // Try Brave first
  const braveResults = await searchCompany(companyName)

  if (braveResults.length > 0) {
    return braveResults
  }

  // Fallback to DuckDuckGo
  searchMetrics.duckDuckGoUsed++
  logger.debug(`Falling back to DuckDuckGo for "${companyName}"`)

  // Check if fallback rate is concerning
  const metrics = getSearchMetrics()
  if (metrics.shouldAlert && searchMetrics.duckDuckGoUsed % 10 === 0) {
    // Alert every 10 fallbacks when above threshold
    logger.warn(`High fallback rate detected`, {
      fallbackRate: `${(metrics.fallbackRate * 100).toFixed(1)}%`,
      duckDuckGoUsed: metrics.duckDuckGoUsed,
      totalSearches: metrics.totalSearches,
      braveFailed: metrics.braveFailed,
      braveSuccesses: metrics.braveSuccesses,
    })
  }

  return searchDuckDuckGo(companyName)
}
