/**
 * Maddyness Source Connector
 *
 * Scrape les articles de levées de fonds depuis Maddyness.com
 */

import type { ParsedFunding } from '../../types'
import { parseRSS } from '../parser'
import { parseArticleHybrid } from '../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:maddyness')

const RSS_URL = 'https://www.maddyness.com/feed/'

/**
 * Récupère les articles de levées de fonds depuis Maddyness
 */
export async function fetchMaddyness(): Promise<ParsedFunding[]> {
  const results: ParsedFunding[] = []

  try {
    // Fetch RSS feed
    const rssContent = await withRetry(
      () =>
        withTimeout(
          fetch(RSS_URL, {
            headers: {
              'User-Agent': 'AngelDesk Bot/1.0 (Funding Tracker)',
            },
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.text()
          }),
          MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
          'Maddyness RSS timeout'
        ),
      { maxAttempts: 3, baseDelayMs: 1000 }
    )

    const items = parseRSS(rssContent)
    logger.info(`Found ${items.length} items in Maddyness RSS`)

    // Filter funding-related articles
    const fundingItems = items.filter((item) => {
      const title = item.title.toLowerCase()
      const content = (item.description || '').toLowerCase()

      return (
        title.includes('lève') ||
        title.includes('levée') ||
        title.includes('million') ||
        title.includes('funding') ||
        content.includes('levée de fonds') ||
        content.includes('tour de table') ||
        content.includes('série a') ||
        content.includes('série b')
      )
    })

    logger.info(`Filtered to ${fundingItems.length} funding-related items`)

    // Process each item
    for (const item of fundingItems.slice(0, MAINTENANCE_CONSTANTS.SOURCER_MAX_ARTICLES_PER_SOURCE)) {
      try {
        const content = item.content || item.description || ''
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date()

        const parsed = await parseArticleHybrid(
          item.title,
          content,
          item.link,
          'maddyness',
          pubDate
        )

        if (parsed) {
          results.push(parsed)
        }
      } catch (error) {
        logger.warn(`Failed to parse Maddyness article: ${item.title}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  } catch (error) {
    logger.error('Failed to fetch Maddyness', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }

  logger.info(`Parsed ${results.length} funding articles from Maddyness`)
  return results
}
