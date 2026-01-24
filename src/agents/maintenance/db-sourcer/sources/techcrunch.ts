/**
 * TechCrunch Source Connector
 *
 * Scrape les articles de levées de fonds depuis TechCrunch
 */

import type { ParsedFunding } from '../../types'
import { parseRSS } from '../parser'
import { parseArticleHybrid } from '../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:techcrunch')

// TechCrunch funding category feed
const RSS_URL = 'https://techcrunch.com/tag/funding/feed/'

/**
 * Récupère les articles de levées de fonds depuis TechCrunch
 */
export async function fetchTechCrunch(): Promise<ParsedFunding[]> {
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
          'TechCrunch RSS timeout'
        ),
      { maxAttempts: 3, baseDelayMs: 1000 }
    )

    const items = parseRSS(rssContent)
    logger.info(`Found ${items.length} items in TechCrunch RSS`)

    // All items from the funding feed are relevant
    for (const item of items.slice(0, MAINTENANCE_CONSTANTS.SOURCER_MAX_ARTICLES_PER_SOURCE)) {
      try {
        const content = item.content || item.description || ''
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date()

        const parsed = await parseArticleHybrid(
          item.title,
          content,
          item.link,
          'techcrunch',
          pubDate
        )

        if (parsed) {
          results.push(parsed)
        }
      } catch (error) {
        logger.warn(`Failed to parse TechCrunch article: ${item.title}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
  } catch (error) {
    logger.error('Failed to fetch TechCrunch', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    throw error
  }

  logger.info(`Parsed ${results.length} funding articles from TechCrunch`)
  return results
}
