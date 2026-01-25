/**
 * GitHub Trending Source
 *
 * Import des repos trending sur GitHub comme signal de startups tech
 * Source: https://github.com/trending
 *
 * Les repos trending sont souvent des projets de startups early-stage
 * qui n'ont pas encore levé mais ont du traction technique.
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:github-trending')

const GITHUB_TRENDING_URL = 'https://github.com/trending'
const GITHUB_API_URL = 'https://api.github.com'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

// Languages to track (tech startup indicators)
const LANGUAGES = ['', 'typescript', 'python', 'rust', 'go'] // '' = all languages

interface TrendingRepo {
  name: string
  fullName: string
  description: string
  url: string
  stars: number
  language: string
  owner: string
  topics: string[]
}

async function parseTrendingPage(html: string): Promise<TrendingRepo[]> {
  const repos: TrendingRepo[] = []

  // GitHub trending page pattern
  const repoPattern = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match

  while ((match = repoPattern.exec(html)) !== null) {
    const repoHtml = match[1]

    // Extract repo name and URL
    const nameMatch = repoHtml.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[^>]*>/i)
    if (!nameMatch) continue

    const fullName = nameMatch[1].trim()
    const [owner, name] = fullName.split('/')

    // Extract description
    const descMatch = repoHtml.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    // Extract stars
    const starsMatch = repoHtml.match(/(\d+(?:,\d+)*)\s*stars?\s*today/i) ||
                       repoHtml.match(/<span[^>]*class="[^"]*d-inline-block[^"]*"[^>]*>[\s\S]*?(\d+(?:,\d+)*)/i)
    const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0

    // Extract language
    const langMatch = repoHtml.match(/<span[^>]*itemprop="programmingLanguage"[^>]*>([^<]+)<\/span>/i)
    const language = langMatch ? langMatch[1].trim() : ''

    repos.push({
      name,
      fullName,
      description,
      url: `https://github.com/${fullName}`,
      stars,
      language,
      owner,
      topics: [],
    })
  }

  return repos
}

async function fetchRepoDetails(fullName: string, token?: string): Promise<{ topics: string[]; createdAt: string; homepage: string | null } | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AngelDesk Bot/1.0',
    }

    if (token) {
      headers['Authorization'] = `token ${token}`
    }

    const response = await withTimeout(
      fetch(`${GITHUB_API_URL}/repos/${fullName}`, { headers }),
      10000,
      'GitHub API timeout'
    )

    if (!response.ok) return null

    const data = await response.json()

    return {
      topics: data.topics || [],
      createdAt: data.created_at || '',
      homepage: data.homepage || null,
    }
  } catch {
    return null
  }
}

/**
 * Check if a repo looks like a startup project
 */
function isStartupLikely(repo: TrendingRepo, topics: string[]): boolean {
  const indicators = [
    // Product-related topics
    'saas', 'startup', 'api', 'platform', 'tool', 'sdk',
    'developer-tools', 'devtools', 'productivity', 'automation',
    // AI/ML (hot sector)
    'ai', 'machine-learning', 'llm', 'gpt', 'chatgpt', 'openai',
    // Infra
    'database', 'infrastructure', 'cloud', 'serverless',
    // Has a homepage (product website)
    'homepage',
  ]

  const allText = `${repo.description} ${topics.join(' ')}`.toLowerCase()

  return indicators.some((ind) => allText.includes(ind)) || repo.stars > 1000
}

export const githubTrendingConnector: PaginatedSourceConnector = {
  name: 'github-trending',
  displayName: 'GitHub Trending',
  sourceType: 'scrape',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '0' // Index in LANGUAGES array
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const langIndex = cursor ? parseInt(cursor, 10) : 0
    const items: ParsedFunding[] = []

    if (langIndex >= LANGUAGES.length) {
      return { items: [], nextCursor: null, hasMore: false }
    }

    const language = LANGUAGES[langIndex]
    logger.info(`Fetching GitHub trending${language ? ` (${language})` : ' (all)'}`)

    try {
      const url = language ? `${GITHUB_TRENDING_URL}/${language}?since=weekly` : `${GITHUB_TRENDING_URL}?since=weekly`

      const response = await withRetry(
        () =>
          withTimeout(
            fetch(url, {
              headers: {
                'User-Agent': 'AngelDesk Bot/1.0',
                'Accept': 'text/html',
              },
            }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return res.text()
            }),
            MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
            'GitHub trending timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const repos = await parseTrendingPage(response)
      logger.info(`Found ${repos.length} trending repos`)

      const githubToken = process.env.GITHUB_TOKEN

      for (const repo of repos.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
        try {
          // Fetch additional details
          const details = await fetchRepoDetails(repo.fullName, githubToken)
          const topics = details?.topics || []

          // Skip if not startup-like
          if (!isStartupLikely(repo, topics)) {
            continue
          }

          const createdAt = details?.createdAt ? new Date(details.createdAt) : new Date()

          // Skip if created before 2021
          if (createdAt < MIN_DATE) {
            continue
          }

          // GitHub repos aren't funding rounds, but signals
          const parsed: ParsedFunding = {
            companyName: repo.name,
            amount: null, // No funding
            currency: 'USD',
            stage: 'PRE_SEED', // Tech signal = very early
            investors: [],
            leadInvestor: null,
            date: createdAt,
            sourceUrl: repo.url,
            sourceName: 'github-trending',
            description: repo.description,
          }

          items.push(parsed)

          // Rate limit respect
          await new Promise((resolve) => setTimeout(resolve, 200))
        } catch (error) {
          logger.warn(`Failed to process repo: ${repo.fullName}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      const hasMore = langIndex < LANGUAGES.length - 1

      return {
        items,
        nextCursor: hasMore ? String(langIndex + 1) : null,
        hasMore,
      }
    } catch (error) {
      logger.error('Failed to fetch GitHub trending', {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default githubTrendingConnector
