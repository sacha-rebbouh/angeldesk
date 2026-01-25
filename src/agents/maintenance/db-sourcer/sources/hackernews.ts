/**
 * Hacker News Source
 *
 * Import des startups depuis:
 * - "Show HN" posts (launches)
 * - "Who is hiring" threads
 * - YC startup announcements
 *
 * API: https://hacker-news.firebaseio.com/v0
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:hackernews')

const HN_API_URL = 'https://hacker-news.firebaseio.com/v0'
const HN_SEARCH_API = 'https://hn.algolia.com/api/v1'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

interface HNItem {
  id: number
  title: string
  url?: string
  text?: string
  time: number
  score: number
  by: string
  type: string
}

interface AlgoliaHit {
  objectID: string
  title: string
  url: string
  author: string
  created_at: string
  points: number
  story_text?: string
}

/**
 * Search HN via Algolia API (better for historical data)
 */
async function searchHN(query: string, page: number): Promise<{ hits: AlgoliaHit[]; nbPages: number }> {
  const timestamp2021 = Math.floor(MIN_DATE.getTime() / 1000)

  const url = `${HN_SEARCH_API}/search?query=${encodeURIComponent(query)}&tags=story&page=${page}&numericFilters=created_at_i>${timestamp2021}`

  const response = await withTimeout(
    fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    }),
    15000,
    'HN Algolia timeout'
  )

  if (!response.ok) {
    throw new Error(`HN Algolia error: ${response.status}`)
  }

  const data = await response.json()

  return {
    hits: data.hits || [],
    nbPages: data.nbPages || 0,
  }
}

/**
 * Extract company info from Show HN post
 */
function parseShowHN(hit: AlgoliaHit): { companyName: string; description: string } | null {
  // Title format: "Show HN: CompanyName - Description" or "Show HN: Description (companyname.com)"
  const title = hit.title

  // Pattern 1: "Show HN: CompanyName - Description"
  const pattern1 = /Show HN:\s*([^–\-:]+)\s*[–\-:]\s*(.+)/i
  const match1 = pattern1.exec(title)
  if (match1) {
    return {
      companyName: match1[1].trim(),
      description: match1[2].trim(),
    }
  }

  // Pattern 2: "Show HN: Description (domain.com)"
  const pattern2 = /Show HN:\s*(.+?)\s*\(([^)]+)\)/i
  const match2 = pattern2.exec(title)
  if (match2) {
    // Use domain as company name
    const domain = match2[2].replace(/\.com|\.io|\.ai|\.co/gi, '')
    return {
      companyName: domain,
      description: match2[1].trim(),
    }
  }

  // Pattern 3: Just "Show HN: Something" - use URL domain
  if (hit.url) {
    try {
      const urlObj = new URL(hit.url)
      const domain = urlObj.hostname.replace(/^www\./, '').replace(/\.com|\.io|\.ai|\.co$/i, '')
      const description = title.replace(/^Show HN:\s*/i, '').trim()

      return {
        companyName: domain,
        description,
      }
    } catch {
      // Invalid URL
    }
  }

  return null
}

/**
 * Extract funding info from title
 */
function extractFundingFromTitle(title: string): { amount: number; stage: string } | null {
  // Pattern: "X raises $Y million"
  const fundingPattern = /(?:raises?|raised|secures?|closes?)\s+\$?([\d.]+)\s*(million|m|billion|b)/i
  const match = fundingPattern.exec(title)

  if (match) {
    const value = parseFloat(match[1])
    const multiplier = match[2].toLowerCase().startsWith('b') ? 1e9 : 1e6
    const amount = value * multiplier

    // Guess stage from amount
    let stage = 'SEED'
    if (amount >= 50e6) stage = 'SERIES_B'
    else if (amount >= 15e6) stage = 'SERIES_A'
    else if (amount >= 2e6) stage = 'SEED'
    else stage = 'PRE_SEED'

    return { amount, stage }
  }

  return null
}

// Search queries for different types of posts
const SEARCH_QUERIES = [
  'Show HN',
  'YC funded',
  'raises million',
  'seed round',
  'series A',
  'Launch HN',
]

export const hackernewsConnector: PaginatedSourceConnector = {
  name: 'hackernews',
  displayName: 'Hacker News',
  sourceType: 'api',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    // Format: queryIndex:page
    return '0:0'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const [queryIndexStr, pageStr] = (cursor || '0:0').split(':')
    const queryIndex = parseInt(queryIndexStr, 10)
    const page = parseInt(pageStr, 10)

    const items: ParsedFunding[] = []

    if (queryIndex >= SEARCH_QUERIES.length) {
      return { items: [], nextCursor: null, hasMore: false }
    }

    const query = SEARCH_QUERIES[queryIndex]
    logger.info(`Searching HN for "${query}" (page ${page})`)

    try {
      const { hits, nbPages } = await searchHN(query, page)
      logger.info(`Found ${hits.length} results`)

      for (const hit of hits.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const createdAt = new Date(hit.created_at)

          // Skip if before 2021
          if (createdAt < MIN_DATE) {
            continue
          }

          let companyName: string
          let description: string
          let amount: number | null = null
          let stage = 'PRE_SEED'

          // Handle Show HN posts
          if (hit.title.toLowerCase().includes('show hn')) {
            const parsed = parseShowHN(hit)
            if (!parsed) continue

            companyName = parsed.companyName
            description = parsed.description
          } else {
            // Handle funding announcements
            const funding = extractFundingFromTitle(hit.title)
            if (funding) {
              amount = funding.amount
              stage = funding.stage
            }

            // Try to extract company name from title
            const companyMatch = hit.title.match(/^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/i)
            companyName = companyMatch ? companyMatch[1].trim() : hit.title.slice(0, 30)
            description = hit.title
          }

          // Skip if company name is too generic
          if (companyName.length < 2 || ['the', 'a', 'an', 'show', 'hn'].includes(companyName.toLowerCase())) {
            continue
          }

          const parsed: ParsedFunding = {
            companyName,
            amount,
            currency: 'USD',
            stage,
            investors: [],
            leadInvestor: null,
            date: createdAt,
            sourceUrl: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            sourceName: 'hackernews',
            description,
          }

          items.push(parsed)
        } catch (error) {
          logger.warn(`Failed to process HN item`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      // Determine next cursor
      const hasMorePages = page < nbPages - 1 && page < 10 // Limit to 10 pages per query
      const hasMoreQueries = queryIndex < SEARCH_QUERIES.length - 1

      let nextCursor: string | null = null
      let hasMore = false

      if (hasMorePages) {
        nextCursor = `${queryIndex}:${page + 1}`
        hasMore = true
      } else if (hasMoreQueries) {
        nextCursor = `${queryIndex + 1}:0`
        hasMore = true
      }

      return {
        items,
        nextCursor,
        hasMore,
      }
    } catch (error) {
      logger.error('Failed to search HN', {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default hackernewsConnector
