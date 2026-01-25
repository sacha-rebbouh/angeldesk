/**
 * Y Combinator Batch Source
 *
 * Import toutes les startups YC depuis la liste publique
 * Source: https://www.ycombinator.com/companies (public directory)
 *
 * YC publie toutes les batches depuis 2005 avec:
 * - Nom de la startup
 * - Description
 * - Batch (S21, W22, etc.)
 * - Status (Active, Acquired, Dead)
 * - Secteur
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, withRetry, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:ycombinator')

// YC API endpoint (public, JSON)
const YC_API_URL = 'https://www.ycombinator.com/companies'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

// YC batches depuis 2021 (format: W21, S21, W22, S22, etc.)
const BATCHES_SINCE_2021 = [
  'W21', 'S21', 'W22', 'S22', 'W23', 'S23', 'W24', 'S24', 'W25', 'S25', 'W26',
]

interface YCCompany {
  name: string
  slug: string
  description: string
  batch: string
  status: string
  industries: string[]
  regions: string[]
  website?: string
  team_size?: number
}

/**
 * Parse la page HTML de YC pour extraire les données des startups
 */
async function parseYCPage(html: string): Promise<YCCompany[]> {
  const companies: YCCompany[] = []

  // YC embeds company data in a Next.js __NEXT_DATA__ script
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const companiesData = data?.props?.pageProps?.companies || []

      for (const company of companiesData) {
        companies.push({
          name: company.name || '',
          slug: company.slug || '',
          description: company.one_liner || company.long_description || '',
          batch: company.batch || '',
          status: company.status || 'Active',
          industries: company.industries || [],
          regions: company.regions || [],
          website: company.website,
          team_size: company.team_size,
        })
      }
    } catch (e) {
      logger.warn('Failed to parse __NEXT_DATA__', { error: e instanceof Error ? e.message : 'Unknown' })
    }
  }

  // Fallback: scrape HTML directly
  if (companies.length === 0) {
    const companyPattern = /<a[^>]*href="\/companies\/([^"]+)"[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
    let match

    while ((match = companyPattern.exec(html)) !== null) {
      const slug = match[1]
      const content = match[2]

      const nameMatch = content.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/i)
      const descMatch = content.match(/<span[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/span>/i)
      const batchMatch = content.match(/<span[^>]*class="[^"]*batch[^"]*"[^>]*>([^<]+)<\/span>/i)

      if (nameMatch) {
        companies.push({
          name: nameMatch[1].trim(),
          slug,
          description: descMatch ? descMatch[1].trim() : '',
          batch: batchMatch ? batchMatch[1].trim() : '',
          status: 'Active',
          industries: [],
          regions: [],
        })
      }
    }
  }

  return companies
}

/**
 * Convertit un batch YC en date approximative
 * W = Winter (janvier), S = Summer (juin)
 */
function batchToDate(batch: string): Date {
  const match = batch.match(/([WS])(\d{2})/)
  if (!match) return new Date()

  const season = match[1]
  const year = 2000 + parseInt(match[2], 10)
  const month = season === 'W' ? 0 : 5 // January for Winter, June for Summer

  return new Date(year, month, 15)
}

/**
 * Vérifie si le batch est depuis 2021
 */
function isBatchSince2021(batch: string): boolean {
  const date = batchToDate(batch)
  return date >= MIN_DATE
}

export const ycombinatorConnector: PaginatedSourceConnector = {
  name: 'ycombinator',
  displayName: 'Y Combinator',
  sourceType: 'scrape',
  cursorType: 'page',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '0' // Index in BATCHES_SINCE_2021
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const batchIndex = cursor ? parseInt(cursor, 10) : 0
    const items: ParsedFunding[] = []

    if (batchIndex >= BATCHES_SINCE_2021.length) {
      return { items: [], nextCursor: null, hasMore: false }
    }

    const targetBatch = BATCHES_SINCE_2021[batchIndex]
    logger.info(`Fetching YC batch ${targetBatch}`)

    try {
      // YC directory with batch filter
      const url = `${YC_API_URL}?batch=${targetBatch}`
      const response = await withRetry(
        () =>
          withTimeout(
            fetch(url, {
              headers: {
                'User-Agent': 'AngelDesk Bot/1.0 (Startup Tracker)',
                'Accept': 'text/html',
              },
            }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return res.text()
            }),
            MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS * 2, // YC page is large
            'YC fetch timeout'
          ),
        { maxAttempts: 3, baseDelayMs: 2000 }
      )

      const companies = await parseYCPage(response)
      const batchCompanies = companies.filter((c) => c.batch === targetBatch || isBatchSince2021(c.batch))

      logger.info(`Found ${batchCompanies.length} companies in batch ${targetBatch}`)

      for (const company of batchCompanies.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH * 2)) {
        try {
          const fundingDate = batchToDate(company.batch)

          // YC standard deal: $500K for 7%
          const parsed: ParsedFunding = {
            companyName: company.name,
            amount: 500000, // YC standard deal
            currency: 'USD',
            stage: 'SEED',
            investors: ['Y Combinator'],
            leadInvestor: 'Y Combinator',
            date: fundingDate,
            sourceUrl: `https://www.ycombinator.com/companies/${company.slug}`,
            sourceName: 'ycombinator',
            description: company.description,
          }

          items.push(parsed)
        } catch (error) {
          logger.warn(`Failed to process YC company: ${company.name}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      const hasMore = batchIndex < BATCHES_SINCE_2021.length - 1

      return {
        items,
        nextCursor: hasMore ? String(batchIndex + 1) : null,
        hasMore,
        totalEstimated: BATCHES_SINCE_2021.length * 200, // ~200 companies per batch
      }
    } catch (error) {
      logger.error(`Failed to fetch YC batch ${targetBatch}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      throw error
    }
  },
}

export default ycombinatorConnector
