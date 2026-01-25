/**
 * FrenchWeb Archive Source
 *
 * Scrape l'historique des articles de levées de fonds depuis FrenchWeb.fr
 * URL pattern: https://www.frenchweb.fr/levees-de-fonds/page/{page}
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../../types'
import { parseArticleHybrid } from '../../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../../utils'
import { MAINTENANCE_CONSTANTS } from '../../../types'

const logger = createLogger('DB_SOURCER:frenchweb-archive')

const BASE_URL = 'https://www.frenchweb.fr/tag/levees-de-fonds/page/'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

/**
 * Parse une page d'archive FrenchWeb pour extraire les articles
 */
async function parseArchivePage(html: string): Promise<Array<{ title: string; url: string; date: string; excerpt: string }>> {
  const articles: Array<{ title: string; url: string; date: string; excerpt: string }> = []

  // Match article blocks - FrenchWeb uses article tags with specific classes
  const articlePattern = /<article[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = articlePattern.exec(html)) !== null) {
    const articleHtml = match[1]

    // Extract title and URL
    const titleMatch = articleHtml.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
    if (!titleMatch) continue

    const url = titleMatch[1]
    const title = titleMatch[2].trim()

    // Extract date
    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i) ||
                      articleHtml.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    const date = dateMatch ? dateMatch[1] : ''

    // Extract excerpt
    const excerptMatch = articleHtml.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         articleHtml.match(/<p[^>]*class="[^"]*excerpt[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : ''

    articles.push({ title, url, date, excerpt })
  }

  // Fallback: simpler pattern if the above doesn't work
  if (articles.length === 0) {
    const simplePattern = /<a[^>]*href="(https:\/\/www\.frenchweb\.fr\/[^"]*levee[^"]*)"[^>]*>([^<]+)<\/a>/gi
    while ((match = simplePattern.exec(html)) !== null) {
      articles.push({
        title: match[2].trim(),
        url: match[1],
        date: '',
        excerpt: '',
      })
    }
  }

  return articles
}

/**
 * Vérifie s'il y a une page suivante
 */
function hasNextPage(html: string, currentPage: number): boolean {
  // Look for pagination links
  const nextPagePattern = new RegExp(`/page/${currentPage + 1}[/"']`, 'i')
  return nextPagePattern.test(html)
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

    // Extract article content
    const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)

    return contentMatch ? contentMatch[1] : null
  } catch {
    return null
  }
}

/**
 * Connecteur d'archive FrenchWeb
 */
export const frenchwebArchiveConnector: PaginatedSourceConnector = {
  name: 'frenchweb-archive',
  displayName: 'FrenchWeb (Archive)',
  sourceType: 'archive',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '1' // Start from page 1
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const page = cursor ? parseInt(cursor, 10) : 1
    const items: ParsedFunding[] = []

    logger.info(`Fetching FrenchWeb archive page ${page}`)

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
            'FrenchWeb archive timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const articles = await parseArchivePage(response)
      logger.info(`Found ${articles.length} articles on page ${page}`)

      // Process each article
      for (const article of articles.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          // Parse date and check if it's after our min date
          let articleDate: Date
          if (article.date) {
            articleDate = new Date(article.date)
          } else {
            // Try to extract date from URL or fetch article
            const content = await fetchArticleContent(article.url)
            if (content) {
              const dateInContent = content.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i)
              if (dateInContent) {
                const months: Record<string, number> = {
                  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
                  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
                }
                articleDate = new Date(parseInt(dateInContent[3]), months[dateInContent[2].toLowerCase()], parseInt(dateInContent[1]))
              } else {
                articleDate = new Date()
              }
            } else {
              articleDate = new Date()
            }
          }

          // Skip if before 2021
          if (articleDate < MIN_DATE) {
            logger.info(`Skipping article before 2021: ${article.title}`)
            return {
              items,
              nextCursor: null, // Stop pagination - we've gone too far back
              hasMore: false,
            }
          }

          // Fetch full article content
          const content = await fetchArticleContent(article.url)

          const parsed = await parseArticleHybrid(
            article.title,
            content || article.excerpt,
            article.url,
            'frenchweb-archive',
            articleDate
          )

          if (parsed) {
            items.push(parsed)
          }

          // Small delay to be respectful
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
      logger.error(`Failed to fetch FrenchWeb archive page ${page}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default frenchwebArchiveConnector
