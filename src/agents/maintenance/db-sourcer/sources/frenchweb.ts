/**
 * FrenchWeb Source Connector
 *
 * Scrape les articles de levées de fonds depuis FrenchWeb.fr
 */

import type { ParsedFunding } from '../../types'
import { parseRSS } from '../parser'
import { parseArticleHybrid } from '../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:frenchweb')

const RSS_URL = 'https://www.frenchweb.fr/feed'
const FUNDING_CATEGORY = 'levees-de-fonds'

/**
 * Récupère les articles de levées de fonds depuis FrenchWeb
 */
export async function fetchFrenchWeb(): Promise<ParsedFunding[]> {
  const results: ParsedFunding[] = []

  try {
    // Fetch RSS feed
    const rssContent = await withRetry(
      () =>
        withTimeout(
          fetch(RSS_URL, {
            headers: {
              'User-Agent': 'FULLINVEST Bot/1.0 (Funding Tracker)',
            },
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.text()
          }),
          MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
          'FrenchWeb RSS timeout'
        ),
      { maxAttempts: 3, baseDelayMs: 1000 }
    )

    const items = parseRSS(rssContent)
    logger.info(`Found ${items.length} items in FrenchWeb RSS`)

    // Filter funding-related articles
    const fundingItems = items.filter((item) => {
      const title = item.title.toLowerCase()
      const content = (item.description || '').toLowerCase()
      const link = item.link.toLowerCase()

      return (
        link.includes(FUNDING_CATEGORY) ||
        title.includes('lève') ||
        title.includes('levée') ||
        title.includes('million') ||
        content.includes('levée de fonds') ||
        content.includes('tour de table')
      )
    })

    logger.info(`Filtered to ${fundingItems.length} funding-related items`)

    // Process each item
    for (const item of fundingItems.slice(0, MAINTENANCE_CONSTANTS.SOURCER_MAX_ARTICLES_PER_SOURCE)) {
      try {
        // Fetch full article content if needed
        let content = item.content || item.description || ''

        if (content.length < 200) {
          // Fetch full page
          try {
            const pageContent = await fetchArticlePage(item.link)
            if (pageContent) {
              content = pageContent
            }
          } catch {
            // Use RSS content
          }
        }

        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date()

        const parsed = await parseArticleHybrid(
          item.title,
          content,
          item.link,
          'frenchweb',
          pubDate
        )

        if (parsed) {
          results.push(parsed)
        }
      } catch (error) {
        logger.warn(`Failed to parse FrenchWeb article: ${item.title}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  } catch (error) {
    logger.error('Failed to fetch FrenchWeb', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }

  logger.info(`Parsed ${results.length} funding articles from FrenchWeb`)
  return results
}

/**
 * Récupère le contenu complet d'une page article
 */
async function fetchArticlePage(url: string): Promise<string | null> {
  try {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'FULLINVEST Bot/1.0 (Funding Tracker)',
        },
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS
    )

    if (!response.ok) return null

    const html = await response.text()

    // Extract article content
    // FrenchWeb uses specific selectors
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    if (articleMatch) {
      return articleMatch[1]
    }

    // Fallback: look for main content div
    const contentMatch = html.match(/<div[^>]*class="[^"]*(?:entry-content|post-content|article-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (contentMatch) {
      return contentMatch[1]
    }

    return null
  } catch {
    return null
  }
}
