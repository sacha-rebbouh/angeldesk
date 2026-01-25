/**
 * DB_COMPLETER - Web Search
 *
 * Recherche web avec fallback chain:
 * 1. Serper.dev (Google results, 2500 req/mois gratuit)
 * 2. Brave Search (2000 req/mois gratuit)
 * 3. DuckDuckGo Instant Answers (illimité mais limité en résultats)
 *
 * Inclut circuit breakers pour éviter les appels inutiles si une API est down
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

// API endpoints
const SERPER_API_BASE = 'https://google.serper.dev/search'
const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search'

// Circuit breaker names
const SERPER_CIRCUIT_NAME = 'serper-search'
const BRAVE_CIRCUIT_NAME = 'brave-search'

// Circuit breaker config: 3 fails → pause 5min
const CIRCUIT_CONFIG = {
  failureThreshold: 3,
  resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
  successThreshold: 2,
}

// ============================================================================
// METRICS
// ============================================================================

interface SearchMetrics {
  totalSearches: number
  serperSuccesses: number
  serperFailed: number
  braveSuccesses: number
  braveFailed: number
  duckDuckGoUsed: number
  lastResetAt: Date
}

// In-memory metrics (reset each run)
const searchMetrics: SearchMetrics = {
  totalSearches: 0,
  serperSuccesses: 0,
  serperFailed: 0,
  braveSuccesses: 0,
  braveFailed: 0,
  duckDuckGoUsed: 0,
  lastResetAt: new Date(),
}

/**
 * Get current search metrics
 */
export function getSearchMetrics() {
  const fallbackRate = searchMetrics.totalSearches > 0
    ? (searchMetrics.braveFailed + searchMetrics.duckDuckGoUsed) / searchMetrics.totalSearches
    : 0

  const shouldAlert = fallbackRate >= 0.20 && searchMetrics.totalSearches >= 10

  return {
    ...searchMetrics,
    fallbackRate,
    primarySuccessRate: searchMetrics.totalSearches > 0
      ? searchMetrics.serperSuccesses / searchMetrics.totalSearches
      : 0,
    shouldAlert,
  }
}

/**
 * Reset search metrics (call at start of run)
 */
export function resetSearchMetrics(): void {
  searchMetrics.totalSearches = 0
  searchMetrics.serperSuccesses = 0
  searchMetrics.serperFailed = 0
  searchMetrics.braveSuccesses = 0
  searchMetrics.braveFailed = 0
  searchMetrics.duckDuckGoUsed = 0
  searchMetrics.lastResetAt = new Date()
}

/**
 * Get circuit breaker status (for monitoring)
 */
export function getBraveCircuitStatus() {
  return getCircuitBreakerStatus(BRAVE_CIRCUIT_NAME)
}

export function getSerperCircuitStatus() {
  return getCircuitBreakerStatus(SERPER_CIRCUIT_NAME)
}

// ============================================================================
// SERPER (PRIMARY) - Google Results
// ============================================================================

/**
 * Search using Serper.dev (Google results)
 */
async function searchSerper(companyName: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY

  if (!apiKey) {
    logger.debug('SERPER_API_KEY not configured, skipping')
    return []
  }

  // Check circuit breaker
  if (isCircuitOpen(SERPER_CIRCUIT_NAME, CIRCUIT_CONFIG)) {
    const status = getSerperCircuitStatus()
    logger.debug(`Circuit breaker open for Serper, skipping "${companyName}"`, {
      failures: status.failures,
    })
    return []
  }

  const query = `${companyName} startup funding levée de fonds`

  try {
    const response = await withTimeout(
      fetch(SERPER_API_BASE, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num: 5,
        }),
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
      'Serper timeout'
    )

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`)
    }

    const data = (await response.json()) as SerperResponse

    recordCircuitSuccess(SERPER_CIRCUIT_NAME, CIRCUIT_CONFIG)
    searchMetrics.serperSuccesses++

    if (!data.organic?.length) {
      return []
    }

    return data.organic.slice(0, 5).map((result) => ({
      title: result.title,
      description: result.snippet,
      url: result.link,
    }))
  } catch (error) {
    recordCircuitFailure(SERPER_CIRCUIT_NAME, CIRCUIT_CONFIG)
    searchMetrics.serperFailed++
    logger.debug(`Serper search failed for "${companyName}": ${error instanceof Error ? error.message : 'Unknown'}`)
    return []
  }
}

interface SerperResponse {
  organic?: Array<{
    title: string
    snippet: string
    link: string
  }>
}

// ============================================================================
// BRAVE (FALLBACK 1)
// ============================================================================

/**
 * Search using Brave Search API
 */
async function searchBrave(companyName: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    logger.debug('BRAVE_API_KEY not configured, skipping')
    return []
  }

  // Check circuit breaker
  if (isCircuitOpen(BRAVE_CIRCUIT_NAME, CIRCUIT_CONFIG)) {
    const status = getBraveCircuitStatus()
    logger.debug(`Circuit breaker open for Brave, skipping "${companyName}"`, {
      failures: status.failures,
    })
    return []
  }

  const query = `${companyName} startup levée fonds funding`
  const params = new URLSearchParams({
    q: query,
    count: '5',
    safesearch: 'moderate',
    freshness: 'py',
  })

  try {
    const response = await withTimeout(
      fetch(`${BRAVE_API_BASE}?${params}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
      'Brave timeout'
    )

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`)
    }

    const data = (await response.json()) as BraveSearchResponse

    recordCircuitSuccess(BRAVE_CIRCUIT_NAME, CIRCUIT_CONFIG)
    searchMetrics.braveSuccesses++

    if (!data.web?.results) {
      return []
    }

    return data.web.results.map((result) => ({
      title: result.title,
      description: result.description,
      url: result.url,
    }))
  } catch (error) {
    recordCircuitFailure(BRAVE_CIRCUIT_NAME, CIRCUIT_CONFIG)
    searchMetrics.braveFailed++
    logger.debug(`Brave search failed for "${companyName}": ${error instanceof Error ? error.message : 'Unknown'}`)
    return []
  }
}

interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string
      description: string
      url: string
    }>
  }
}

// ============================================================================
// DUCKDUCKGO (FALLBACK 2 - Last Resort)
// ============================================================================

/**
 * Search using DuckDuckGo Instant Answers (limited but free)
 */
async function searchDuckDuckGo(companyName: string): Promise<WebSearchResult[]> {
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

    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.Heading || companyName,
        description: data.Abstract,
        url: data.AbstractURL,
      })
    }

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
// COMBINED SEARCH WITH FALLBACK CHAIN
// ============================================================================

/**
 * Search with fallback chain: Serper → Brave → DuckDuckGo
 */
export async function searchWithFallback(companyName: string): Promise<WebSearchResult[]> {
  searchMetrics.totalSearches++

  // 1. Try Serper (Google results)
  const serperResults = await searchSerper(companyName)
  if (serperResults.length > 0) {
    return serperResults
  }

  // 2. Fallback to Brave
  logger.debug(`Serper failed, falling back to Brave for "${companyName}"`)
  const braveResults = await searchBrave(companyName)
  if (braveResults.length > 0) {
    return braveResults
  }

  // 3. Last resort: DuckDuckGo
  logger.debug(`Brave failed, falling back to DuckDuckGo for "${companyName}"`)
  searchMetrics.duckDuckGoUsed++
  return searchDuckDuckGo(companyName)
}

// Legacy exports for compatibility
export { searchBrave as searchCompany }
export { searchDuckDuckGo }
