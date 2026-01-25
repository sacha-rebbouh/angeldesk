/**
 * Maddyness Archive Source
 *
 * Scrape l'historique des articles de levées de fonds depuis Maddyness.com
 * URL pattern: https://www.maddyness.com/categorie/financement/page/{page}
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../../types'
import { parseArticleHybrid } from '../../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../../utils'
import { MAINTENANCE_CONSTANTS } from '../../../types'

const logger = createLogger('DB_SOURCER:maddyness-archive')

// Maddyness uses search for funding articles
const BASE_URL = 'https://www.maddyness.com/page/'
const SEARCH_QUERY = '?s=levee+de+fonds'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

/**
 * Parse une page d'archive Maddyness pour extraire les articles
 */
async function parseArchivePage(html: string): Promise<Array<{ title: string; url: string; date: string; excerpt: string }>> {
  const articles: Array<{ title: string; url: string; date: string; excerpt: string }> = []

  // Maddyness article pattern
  const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = articlePattern.exec(html)) !== null) {
    const articleHtml = match[1]

    // Extract title and URL
    const titleMatch = articleHtml.match(/<h[23][^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
    if (!titleMatch) continue

    const url = titleMatch[1]
    const title = titleMatch[2].trim()

    // Skip non-funding articles
    if (!url.includes('maddyness.com')) continue

    // Extract date
    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i) ||
                      articleHtml.match(/(\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4})/i)
    const date = dateMatch ? dateMatch[1] : ''

    // Extract excerpt
    const excerptMatch = articleHtml.match(/<p[^>]*class="[^"]*excerpt[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
                         articleHtml.match(/<div[^>]*class="[^"]*entry[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : ''

    articles.push({ title, url, date, excerpt })
  }

  return articles
}

/**
 * Vérifie s'il y a une page suivante
 */
function hasNextPage(html: string, currentPage: number): boolean {
  const nextPagePattern = new RegExp(`/page/${currentPage + 1}[/"']`, 'i')
  return nextPagePattern.test(html) || html.includes('next') || html.includes('suivant')
}

/**
 * Fetch le contenu d'un article individuel
 */
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

    const contentMatch = html.match(/<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)

    return contentMatch ? contentMatch[1] : null
  } catch {
    return null
  }
}

/**
 * Parse French date format
 */
function parseFrenchDate(dateStr: string): Date {
  const months: Record<string, number> = {
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
  }

  const match = dateStr.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i)
  if (match) {
    return new Date(parseInt(match[3]), months[match[2].toLowerCase()], parseInt(match[1]))
  }

  // Try ISO format
  const isoDate = new Date(dateStr)
  if (!isNaN(isoDate.getTime())) return isoDate

  return new Date()
}

export const maddynessArchiveConnector: PaginatedSourceConnector = {
  name: 'maddyness-archive',
  displayName: 'Maddyness (Archive)',
  sourceType: 'archive',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '1'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const page = cursor ? parseInt(cursor, 10) : 1
    const items: ParsedFunding[] = []

    logger.info(`Fetching Maddyness archive page ${page}`)

    try {
      const url = `${BASE_URL}${page}/${SEARCH_QUERY}`
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
            'Maddyness archive timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const articles = await parseArchivePage(response)
      logger.info(`Found ${articles.length} articles on page ${page}`)

      for (const article of articles.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const articleDate = article.date ? parseFrenchDate(article.date) : new Date()

          // Skip if before 2021
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
            'maddyness-archive',
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
      logger.error(`Failed to fetch Maddyness archive page ${page}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default maddynessArchiveConnector
