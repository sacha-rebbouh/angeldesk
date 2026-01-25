/**
 * EU-Startups Archive Source
 *
 * Scrape l'historique des articles de levées de fonds depuis EU-Startups.com
 * URL pattern: https://www.eu-startups.com/category/funding/page/{page}
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../../types'
import { parseArticleHybrid } from '../../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../../utils'
import { MAINTENANCE_CONSTANTS } from '../../../types'

const logger = createLogger('DB_SOURCER:eu-startups-archive')

const BASE_URL = 'https://www.eu-startups.com/category/funding/page/'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

async function parseArchivePage(html: string): Promise<Array<{ title: string; url: string; date: string; excerpt: string }>> {
  const articles: Array<{ title: string; url: string; date: string; excerpt: string }> = []

  const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = articlePattern.exec(html)) !== null) {
    const articleHtml = match[1]

    const titleMatch = articleHtml.match(/<h[23][^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
    if (!titleMatch) continue

    const url = titleMatch[1]
    const title = titleMatch[2].trim()

    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i) ||
                      articleHtml.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i)
    const date = dateMatch ? dateMatch[1] : ''

    const excerptMatch = articleHtml.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : ''

    articles.push({ title, url, date, excerpt })
  }

  return articles
}

function hasNextPage(html: string, currentPage: number): boolean {
  const nextPagePattern = new RegExp(`/page/${currentPage + 1}[/"']`, 'i')
  return nextPagePattern.test(html)
}

async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'AngelDesk Bot/1.0 (Funding Tracker)',
          'Accept': 'text/html',
        },
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS
    )

    if (!response.ok) return null

    const html = await response.text()
    const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    return contentMatch ? contentMatch[1] : null
  } catch {
    return null
  }
}

export const euStartupsArchiveConnector: PaginatedSourceConnector = {
  name: 'eu-startups-archive',
  displayName: 'EU-Startups (Archive)',
  sourceType: 'archive',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '1'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const page = cursor ? parseInt(cursor, 10) : 1
    const items: ParsedFunding[] = []

    logger.info(`Fetching EU-Startups archive page ${page}`)

    try {
      const url = `${BASE_URL}${page}`
      const response = await withRetry(
        () =>
          withTimeout(
            fetch(url, {
              headers: {
                'User-Agent': 'AngelDesk Bot/1.0 (Funding Tracker)',
                'Accept': 'text/html',
              },
            }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return res.text()
            }),
            MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
            'EU-Startups archive timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const articles = await parseArchivePage(response)
      logger.info(`Found ${articles.length} articles on page ${page}`)

      for (const article of articles.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const articleDate = article.date ? new Date(article.date) : new Date()

          if (articleDate < MIN_DATE) {
            logger.info(`Reached articles before 2021, stopping pagination`)
            return {
              items,
              nextCursor: null,
              hasMore: false,
            }
          }

          const content = await fetchArticleContent(article.url)

          const parsed = await parseArticleHybrid(
            article.title,
            content || article.excerpt,
            article.url,
            'eu-startups-archive',
            articleDate
          )

          if (parsed) {
            items.push(parsed)
          }

          await new Promise((resolve) => setTimeout(resolve, 500))
        } catch (error) {
          logger.warn(`Failed to parse article: ${article.title}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      const hasMore = hasNextPage(response, page)

      return {
        items,
        nextCursor: hasMore ? String(page + 1) : null,
        hasMore,
      }
    } catch (error) {
      logger.error(`Failed to fetch EU-Startups archive page ${page}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default euStartupsArchiveConnector
