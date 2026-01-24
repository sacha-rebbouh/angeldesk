/**
 * DB_COMPLETER - URL Scraper
 *
 * Scrape le contenu des URLs trouvées via la recherche web
 */

import type { ScrapedContent } from '../types'
import { stripHtml, truncateText, withTimeout, createLogger } from '../utils'
import { MAINTENANCE_CONSTANTS } from '../types'

const logger = createLogger('DB_COMPLETER:scraper')

// Maximum text length per source (to avoid huge prompts)
const MAX_TEXT_LENGTH = 3000

// URLs to skip (paywalls, logins, etc.)
const BLOCKED_DOMAINS = [
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'youtube.com',
  'login.',
  'signin.',
  'account.',
  'pdf',
]

/**
 * Scrape multiple URLs in parallel
 */
export async function scrapeUrls(urls: string[]): Promise<ScrapedContent[]> {
  // Filter out blocked domains and deduplicate
  const validUrls = [...new Set(urls)].filter((url) => {
    const urlLower = url.toLowerCase()
    return !BLOCKED_DOMAINS.some((blocked) => urlLower.includes(blocked))
  })

  logger.debug(`Scraping ${validUrls.length} URLs (filtered from ${urls.length})`)

  const results = await Promise.all(
    validUrls.map((url) => scrapeUrl(url).catch(() => createFailedResult(url)))
  )

  const successful = results.filter((r) => r.success)
  logger.debug(`Successfully scraped ${successful.length}/${validUrls.length} URLs`)

  return results
}

/**
 * Scrape a single URL
 */
async function scrapeUrl(url: string): Promise<ScrapedContent> {
  try {
    const html = await withTimeout(
      fetchPage(url),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
      `Scrape timeout for ${url}`
    )

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : url

    // Extract main content
    const text = extractMainContent(html)

    if (!text || text.length < 50) {
      return createFailedResult(url, 'No content extracted')
    }

    return {
      url,
      title,
      text: truncateText(text, MAX_TEXT_LENGTH),
      success: true,
    }
  } catch (error) {
    return createFailedResult(
      url,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/**
 * Fetch a page with proper headers
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  // Check content type
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error(`Invalid content type: ${contentType}`)
  }

  return response.text()
}

/**
 * Extract the main text content from HTML
 */
function extractMainContent(html: string): string {
  // Remove scripts, styles, and navigation
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // Try to find article content first
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*(?:article|content|post|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*(?:article|content|post|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const pattern of articlePatterns) {
    const match = cleaned.match(pattern)
    if (match && match[1].length > 200) {
      cleaned = match[1]
      break
    }
  }

  // Convert to plain text
  const text = stripHtml(cleaned)

  // Clean up whitespace
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Create a failed scrape result
 */
function createFailedResult(url: string, error?: string): ScrapedContent {
  return {
    url,
    title: '',
    text: '',
    success: false,
    error,
  }
}

// ============================================================================
// SPECIFIC SITE EXTRACTORS
// ============================================================================

/**
 * Extract content from FrenchWeb articles
 */
export function extractFrenchWebContent(html: string): string {
  const articleMatch = html.match(
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  )
  if (articleMatch) {
    return stripHtml(articleMatch[1])
  }
  return extractMainContent(html)
}

/**
 * Extract content from Maddyness articles
 */
export function extractMaddynessContent(html: string): string {
  const articleMatch = html.match(
    /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  )
  if (articleMatch) {
    return stripHtml(articleMatch[1])
  }
  return extractMainContent(html)
}

/**
 * Extract content from TechCrunch articles
 */
export function extractTechCrunchContent(html: string): string {
  const articleMatch = html.match(
    /<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  )
  if (articleMatch) {
    return stripHtml(articleMatch[1])
  }
  return extractMainContent(html)
}
