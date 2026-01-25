/**
 * ProductHunt Source
 *
 * Import les launches depuis ProductHunt API (GraphQL)
 * API: https://api.producthunt.com/v2/api/graphql
 *
 * ProductHunt est gratuit pour les lectures basiques.
 * Les launches ne sont pas des levées, mais un excellent signal early-stage.
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:producthunt')

const PH_API_URL = 'https://api.producthunt.com/v2/api/graphql'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

interface PHPost {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  website: string
  createdAt: string
  votesCount: number
  topics: { edges: Array<{ node: { name: string } }> }
}

/**
 * Fetch posts from ProductHunt GraphQL API
 */
async function fetchPHPosts(cursor: string | null, apiKey?: string): Promise<{ posts: PHPost[]; nextCursor: string | null; hasMore: boolean }> {
  const query = `
    query GetPosts($cursor: String) {
      posts(first: 50, after: $cursor, order: NEWEST) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            website
            createdAt
            votesCount
            topics(first: 5) {
              edges {
                node {
                  name
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  // Use API key if available (from env)
  const key = apiKey || process.env.PRODUCTHUNT_API_KEY
  if (key) {
    headers['Authorization'] = `Bearer ${key}`
  }

  const response = await fetch(PH_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables: { cursor },
    }),
  })

  if (!response.ok) {
    throw new Error(`ProductHunt API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
  }

  const edges = data.data?.posts?.edges || []
  const pageInfo = data.data?.posts?.pageInfo || {}

  return {
    posts: edges.map((e: { node: PHPost }) => e.node),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
    hasMore: pageInfo.hasNextPage || false,
  }
}

/**
 * Fallback: scrape ProductHunt website directly
 */
async function scrapePHPage(page: number): Promise<{ posts: PHPost[]; hasMore: boolean }> {
  const url = `https://www.producthunt.com/posts?page=${page}`

  const response = await withRetry(
    () =>
      withTimeout(
        fetch(url, {
          headers: {
            'User-Agent': 'AngelDesk Bot/1.0 (Startup Tracker)',
            'Accept': 'text/html',
          },
        }),
        MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
        'ProductHunt scrape timeout'
      ),
    { maxAttempts: 2, baseDelayMs: 2000 }
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const html = await response.text()
  const posts: PHPost[] = []

  // Extract Next.js data if available
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const items = data?.props?.pageProps?.posts || []

      for (const item of items) {
        posts.push({
          id: item.id || '',
          name: item.name || '',
          tagline: item.tagline || '',
          description: item.description || '',
          url: `https://www.producthunt.com/posts/${item.slug}`,
          website: item.website || '',
          createdAt: item.createdAt || item.created_at || '',
          votesCount: item.votesCount || item.votes_count || 0,
          topics: { edges: (item.topics || []).map((t: string) => ({ node: { name: t } })) },
        })
      }
    } catch {
      logger.warn('Failed to parse ProductHunt __NEXT_DATA__')
    }
  }

  const hasMore = html.includes(`page=${page + 1}`) || posts.length >= 20

  return { posts, hasMore }
}

export const producthuntConnector: PaginatedSourceConnector = {
  name: 'producthunt',
  displayName: 'ProductHunt',
  sourceType: 'api',
  cursorType: 'token',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '' // Empty string = start from beginning
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const items: ParsedFunding[] = []

    logger.info(`Fetching ProductHunt posts${cursor ? ` (cursor: ${cursor.slice(0, 20)}...)` : ''}`)

    try {
      let posts: PHPost[]
      let nextCursor: string | null
      let hasMore: boolean

      // Try API first, fallback to scraping
      try {
        const result = await fetchPHPosts(cursor || null)
        posts = result.posts
        nextCursor = result.nextCursor
        hasMore = result.hasMore
      } catch (apiError) {
        logger.warn('ProductHunt API failed, falling back to scraping', {
          error: apiError instanceof Error ? apiError.message : 'Unknown',
        })

        // Fallback to scraping
        const page = cursor ? parseInt(cursor, 10) : 1
        const result = await scrapePHPage(page)
        posts = result.posts
        hasMore = result.hasMore
        nextCursor = hasMore ? String(page + 1) : null
      }

      logger.info(`Found ${posts.length} ProductHunt posts`)

      for (const post of posts.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const launchDate = post.createdAt ? new Date(post.createdAt) : new Date()

          // Skip if before 2021
          if (launchDate < MIN_DATE) {
            logger.info(`Reached posts before 2021, stopping pagination`)
            return {
              items,
              nextCursor: null,
              hasMore: false,
            }
          }

          // ProductHunt launches aren't funding rounds, but we track them as "signals"
          // We'll mark them as PRE_SEED with amount = null
          const topics = post.topics?.edges?.map((e) => e.node.name) || []

          const parsed: ParsedFunding = {
            companyName: post.name,
            amount: null, // No funding amount - it's a launch
            currency: 'USD',
            stage: 'PRE_SEED', // Launches are typically pre-seed stage
            investors: [], // No investors
            leadInvestor: null,
            date: launchDate,
            sourceUrl: post.url || `https://www.producthunt.com`,
            sourceName: 'producthunt',
            description: post.tagline || post.description,
          }

          items.push(parsed)
        } catch (error) {
          logger.warn(`Failed to process PH post: ${post.name}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      return {
        items,
        nextCursor,
        hasMore,
      }
    } catch (error) {
      logger.error('Failed to fetch ProductHunt', {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default producthuntConnector
