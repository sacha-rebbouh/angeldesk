/**
 * Sifted Archive Source
 *
 * Scrape l'historique des articles de levées de fonds depuis Sifted.eu
 * URL pattern: https://sifted.eu/sector/fintech?page={page} (and other sectors)
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../../types'
import { parseArticleHybrid } from '../../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../../utils'
import { MAINTENANCE_CONSTANTS } from '../../../types'

const logger = createLogger('DB_SOURCER:sifted-archive')

// Sifted organizes by sector, we'll scrape the funding-related sectors
const SECTOR_URLS = [
  'https://sifted.eu/sector/fintech',
  'https://sifted.eu/sector/healthtech',
  'https://sifted.eu/sector/deeptech',
  'https://sifted.eu/sector/sustainability',
]
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

async function parseArchivePage(html: string): Promise<Array<{ title: string; url: string; date: string; excerpt: string }>> {
  const articles: Array<{ title: string; url: string; date: string; excerpt: string }> = []

  // Sifted uses a modern layout with article cards
  const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = articlePattern.exec(html)) !== null) {
    const articleHtml = match[1]

    // Look for funding-related articles
    const titleLower = articleHtml.toLowerCase()
    const isFundingRelated =
      titleLower.includes('raises') ||
      titleLower.includes('funding') ||
      titleLower.includes('million') ||
      titleLower.includes('series') ||
      titleLower.includes('seed') ||
      titleLower.includes('round')

    if (!isFundingRelated) continue

    const titleMatch = articleHtml.match(/<a[^>]*href="(https:\/\/sifted\.eu\/articles\/[^"]+)"[^>]*>([^<]+)<\/a>/i)
    if (!titleMatch) continue

    const url = titleMatch[1]
    const title = titleMatch[2].trim()

    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i) ||
                      articleHtml.match(/(\d{1,2}\s+\w+\s+\d{4})/i)
    const date = dateMatch ? dateMatch[1] : ''

    const excerptMatch = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : ''

    articles.push({ title, url, date, excerpt })
  }

  // Fallback pattern for different Sifted layouts
  if (articles.length === 0) {
    const linkPattern = /<a[^>]*href="(https:\/\/sifted\.eu\/articles\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1]
      const title = match[2].replace(/<[^>]+>/g, '').trim()

      if (title.length > 10 && (
        title.toLowerCase().includes('raises') ||
        title.toLowerCase().includes('funding') ||
        title.toLowerCase().includes('million')
      )) {
        articles.push({ title, url, date: '', excerpt: '' })
      }
    }
  }

  return articles
}

function hasNextPage(html: string, currentPage: number): boolean {
  return html.includes(`page=${currentPage + 1}`) || html.includes('Load more') || html.includes('next')
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
    const contentMatch = html.match(/<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    return contentMatch ? contentMatch[1] : null
  } catch {
    return null
  }
}

export const siftedArchiveConnector: PaginatedSourceConnector = {
  name: 'sifted-archive',
  displayName: 'Sifted (Archive)',
  sourceType: 'archive',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    // Format: sectorIndex:page (e.g., "0:1" = first sector, page 1)
    return '0:1'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const [sectorIndexStr, pageStr] = (cursor || '0:1').split(':')
    let sectorIndex = parseInt(sectorIndexStr, 10)
    let page = parseInt(pageStr, 10)

    const items: ParsedFunding[] = []

    logger.info(`Fetching Sifted archive: sector ${sectorIndex}, page ${page}`)

    try {
      const baseUrl = SECTOR_URLS[sectorIndex]
      const url = page > 1 ? `${baseUrl}?page=${page}` : baseUrl

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
            'Sifted archive timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const articles = await parseArchivePage(response)
      logger.info(`Found ${articles.length} funding articles on ${baseUrl} page ${page}`)

      for (const article of articles.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const articleDate = article.date ? new Date(article.date) : new Date()

          if (articleDate < MIN_DATE) {
            // Move to next sector
            if (sectorIndex < SECTOR_URLS.length - 1) {
              return {
                items,
                nextCursor: `${sectorIndex + 1}:1`,
                hasMore: true,
              }
            }
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
            'sifted-archive',
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

      if (hasMore) {
        return {
          items,
          nextCursor: `${sectorIndex}:${page + 1}`,
          hasMore: true,
        }
      } else if (sectorIndex < SECTOR_URLS.length - 1) {
        // Move to next sector
        return {
          items,
          nextCursor: `${sectorIndex + 1}:1`,
          hasMore: true,
        }
      }

      return {
        items,
        nextCursor: null,
        hasMore: false,
      }
    } catch (error) {
      logger.error(`Failed to fetch Sifted archive`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default siftedArchiveConnector
