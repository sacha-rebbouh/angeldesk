/**
 * BPI France Source
 *
 * Import des startups financées par BPI France (banque publique d'investissement)
 * Sources:
 * - https://www.bpifrance.fr/nos-actualites (news)
 * - https://bigmedia.bpifrance.fr/ (media hub)
 *
 * BPI France finance environ 2000+ startups/an avec:
 * - Prêts Innovation (PI)
 * - Bourse French Tech
 * - French Tech Seed
 * - Fonds Large Venture
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { parseArticleHybrid } from '../llm-parser'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:bpifrance')

const BPI_NEWS_URL = 'https://www.bpifrance.fr/nos-actualites'
const BPI_BIGMEDIA_URL = 'https://bigmedia.bpifrance.fr/nos-actualites'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

// Keywords indicating BPI funding
const FUNDING_KEYWORDS = [
  'lève', 'levée', 'financement', 'investissement',
  'french tech', 'bourse', 'prêt innovation',
  'seed', 'série', 'million', 'accompagne',
]

interface BPIArticle {
  title: string
  url: string
  date: string
  excerpt: string
}

async function parseBPIPage(html: string, baseUrl: string): Promise<BPIArticle[]> {
  const articles: BPIArticle[] = []

  // BPI news page pattern
  const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = articlePattern.exec(html)) !== null) {
    const articleHtml = match[1]

    // Extract title and URL
    const titleMatch = articleHtml.match(/<h[23][^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i) ||
                       articleHtml.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/i)
    if (!titleMatch) continue

    let url = titleMatch[1]
    const title = titleMatch[2].trim()

    // Make URL absolute
    if (url.startsWith('/')) {
      url = new URL(url, baseUrl).toString()
    }

    // Check if funding-related
    const titleLower = title.toLowerCase()
    const isFundingRelated = FUNDING_KEYWORDS.some((kw) => titleLower.includes(kw))
    if (!isFundingRelated) continue

    // Extract date
    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i) ||
                      articleHtml.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i)
    const date = dateMatch ? dateMatch[1] : ''

    // Extract excerpt
    const excerptMatch = articleHtml.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
                         articleHtml.match(/<div[^>]*class="[^"]*excerpt[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : ''

    articles.push({ title, url, date, excerpt })
  }

  // Fallback: simpler link extraction
  if (articles.length === 0) {
    const linkPattern = /<a[^>]*href="([^"]*(?:actualite|news)[^"]*)"[^>]*>([^<]+)<\/a>/gi
    while ((match = linkPattern.exec(html)) !== null) {
      let url = match[1]
      const title = match[2].trim()

      if (url.startsWith('/')) {
        url = new URL(url, baseUrl).toString()
      }

      const titleLower = title.toLowerCase()
      const isFundingRelated = FUNDING_KEYWORDS.some((kw) => titleLower.includes(kw))

      if (isFundingRelated && title.length > 15) {
        articles.push({ title, url, date: '', excerpt: '' })
      }
    }
  }

  return articles
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
                         html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    return contentMatch ? contentMatch[1] : null
  } catch {
    return null
  }
}

function parseFrenchDate(dateStr: string): Date {
  const months: Record<string, number> = {
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
  }

  // Try French format: "15 janvier 2024"
  const frMatch = dateStr.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i)
  if (frMatch) {
    return new Date(parseInt(frMatch[3]), months[frMatch[2].toLowerCase()], parseInt(frMatch[1]))
  }

  // Try ISO format
  const isoDate = new Date(dateStr)
  if (!isNaN(isoDate.getTime())) return isoDate

  return new Date()
}

function hasNextPage(html: string, currentPage: number): boolean {
  return html.includes(`page=${currentPage + 1}`) ||
         html.includes(`page/${currentPage + 1}`) ||
         html.includes('suivant') ||
         html.includes('next')
}

export const bpifranceConnector: PaginatedSourceConnector = {
  name: 'bpifrance',
  displayName: 'BPI France',
  sourceType: 'scrape',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    // Format: source:page (0 = bpifrance.fr, 1 = bigmedia)
    return '0:1'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const [sourceIndexStr, pageStr] = (cursor || '0:1').split(':')
    const sourceIndex = parseInt(sourceIndexStr, 10)
    const page = parseInt(pageStr, 10)

    const items: ParsedFunding[] = []
    const sources = [BPI_NEWS_URL, BPI_BIGMEDIA_URL]

    if (sourceIndex >= sources.length) {
      return { items: [], nextCursor: null, hasMore: false }
    }

    const baseUrl = sources[sourceIndex]
    logger.info(`Fetching BPI France: source ${sourceIndex}, page ${page}`)

    try {
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
            'BPI France timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const articles = await parseBPIPage(response, baseUrl)
      logger.info(`Found ${articles.length} funding-related articles`)

      for (const article of articles.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          const articleDate = article.date ? parseFrenchDate(article.date) : new Date()

          if (articleDate < MIN_DATE) {
            // Move to next source
            if (sourceIndex < sources.length - 1) {
              return {
                items,
                nextCursor: `${sourceIndex + 1}:1`,
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
            'bpifrance',
            articleDate
          )

          if (parsed) {
            // Add BPI France as investor if not already present
            if (!parsed.investors.includes('BPI France')) {
              parsed.investors.push('BPI France')
            }
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
          nextCursor: `${sourceIndex}:${page + 1}`,
          hasMore: true,
        }
      } else if (sourceIndex < sources.length - 1) {
        return {
          items,
          nextCursor: `${sourceIndex + 1}:1`,
          hasMore: true,
        }
      }

      return {
        items,
        nextCursor: null,
        hasMore: false,
      }
    } catch (error) {
      logger.error('Failed to fetch BPI France', {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default bpifranceConnector
