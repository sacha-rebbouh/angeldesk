/**
 * Tech.eu Source Connector
 *
 * Scrape les articles de levées de fonds depuis Tech.eu
 */

import type { ParsedFunding } from '../../types'
import { parseRSS } from '../parser'
import { parseArticleHybrid } from '../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:tech-eu')

const RSS_URL = 'https://tech.eu/feed/'

/**
 * Récupère les articles de levées de fonds depuis Tech.eu
 */
export async function fetchTechEu(): Promise<ParsedFunding[]> {
  const results: ParsedFunding[] = []

  try {
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
          'Tech.eu RSS timeout'
        ),
      { maxAttempts: 3, baseDelayMs: 1000 }
    )

    const items = parseRSS(rssContent)
    logger.info(`Found ${items.length} items in Tech.eu RSS`)

    // Filter funding-related articles
    const fundingItems = items.filter((item) => {
      const title = item.title.toLowerCase()
      const content = (item.description || '').toLowerCase()

      return (
        title.includes('raises') ||
        title.includes('secures') ||
        title.includes('funding') ||
        title.includes('€') ||
        title.includes('$') ||
        title.includes('million') ||
        title.includes('series') ||
        content.includes('funding') ||
        content.includes('investment') ||
        content.includes('raised')
      )
    })

    logger.info(`Filtered to ${fundingItems.length} funding-related items`)

    for (const item of fundingItems.slice(0, MAINTENANCE_CONSTANTS.SOURCER_MAX_ARTICLES_PER_SOURCE)) {
      try {
        const content = item.content || item.description || ''
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date()

        const parsed = await parseArticleHybrid(
          item.title,
          content,
          item.link,
          'tech-eu',
          pubDate
        )

        if (parsed) {
          results.push(parsed)
        }
      } catch (error) {
        logger.warn(`Failed to parse Tech.eu article: ${item.title}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  } catch (error) {
    logger.error('Failed to fetch Tech.eu', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }

  logger.info(`Parsed ${results.length} funding articles from Tech.eu`)
  return results
}
