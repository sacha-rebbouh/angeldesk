/**
 * Companies House UK Source
 *
 * Import des données de financement depuis Companies House (UK)
 * API: https://api.company-information.service.gov.uk
 *
 * Companies House est gratuit et contient:
 * - Création d'entreprises
 * - Augmentations de capital (share allotments)
 * - Directors et shareholders
 *
 * Limitations:
 * - Rate limit: 600 requests/5 minutes
 * - UK companies only
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:companies-house')

const CH_API_URL = 'https://api.company-information.service.gov.uk'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

interface CHCompany {
  company_number: string
  title: string
  company_status: string
  date_of_creation: string
  sic_codes?: string[]
  address?: {
    locality?: string
    region?: string
    country?: string
  }
}

interface CHFiling {
  transaction_id: string
  date: string
  description: string
  type: string
  category: string
}

// SIC codes for tech/startup companies
const TECH_SIC_CODES = [
  '62011', // Computer programming
  '62012', // Business/domestic software
  '62020', // IT consultancy
  '62090', // Other IT services
  '63110', // Data processing
  '63120', // Web portals
  '63910', // News agency
  '72110', // Research (biotech)
  '72190', // Other R&D
]

/**
 * Search for recently incorporated companies
 */
async function searchRecentCompanies(
  apiKey: string,
  startIndex: number
): Promise<{ companies: CHCompany[]; total: number }> {
  const headers = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Accept': 'application/json',
  }

  // Search for recently created companies with tech SIC codes
  const params = new URLSearchParams({
    incorporated_from: MIN_DATE.toISOString().split('T')[0],
    size: '50',
    start_index: String(startIndex),
  })

  const url = `${CH_API_URL}/advanced-search/companies?${params}`

  const response = await withTimeout(
    fetch(url, { headers }),
    15000,
    'Companies House API timeout'
  )

  if (!response.ok) {
    throw new Error(`Companies House API error: ${response.status}`)
  }

  const data = await response.json()

  return {
    companies: data.items || [],
    total: data.total_results || 0,
  }
}

/**
 * Get filing history for a company (to find share allotments = funding)
 */
async function getFilingHistory(apiKey: string, companyNumber: string): Promise<CHFiling[]> {
  const headers = {
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Accept': 'application/json',
  }

  const url = `${CH_API_URL}/company/${companyNumber}/filing-history?category=capital`

  try {
    const response = await withTimeout(
      fetch(url, { headers }),
      10000,
      'Companies House filing timeout'
    )

    if (!response.ok) return []

    const data = await response.json()
    return data.items || []
  } catch {
    return []
  }
}

/**
 * Fallback: scrape Companies House search
 */
async function scrapeCompaniesHouse(page: number): Promise<CHCompany[]> {
  const companies: CHCompany[] = []

  try {
    // Search for "tech" or "software" companies
    const url = `https://find-and-update.company-information.service.gov.uk/search?q=tech+limited&page=${page}`

    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'AngelDesk Bot/1.0',
          'Accept': 'text/html',
        },
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
      'Companies House scrape timeout'
    )

    if (!response.ok) return companies

    const html = await response.text()

    // Extract company listings
    const companyPattern = /<li[^>]*class="[^"]*type-company[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
    let match

    while ((match = companyPattern.exec(html)) !== null) {
      const itemHtml = match[1]

      const linkMatch = itemHtml.match(/<a[^>]*href="\/company\/(\d+)"[^>]*>([^<]+)<\/a>/i)
      if (!linkMatch) continue

      const companyNumber = linkMatch[1]
      const title = linkMatch[2].trim()

      const dateMatch = itemHtml.match(/Incorporated on (\d{1,2} \w+ \d{4})/i)
      const creationDate = dateMatch ? new Date(dateMatch[1]).toISOString() : ''

      const statusMatch = itemHtml.match(/Status:\s*([^<]+)/i)
      const status = statusMatch ? statusMatch[1].trim() : 'Active'

      companies.push({
        company_number: companyNumber,
        title,
        company_status: status,
        date_of_creation: creationDate,
      })
    }
  } catch (error) {
    logger.warn('Failed to scrape Companies House', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
  }

  return companies
}

/**
 * Check if company is likely a tech startup
 */
function isTechCompany(company: CHCompany): boolean {
  const titleLower = company.title.toLowerCase()

  // Check SIC codes if available
  if (company.sic_codes?.some((code) => TECH_SIC_CODES.includes(code))) {
    return true
  }

  // Check name for tech indicators
  const techKeywords = [
    'tech', 'software', 'digital', 'data', 'ai', 'cloud',
    'cyber', 'fintech', 'healthtech', 'edtech', 'app',
    'platform', 'saas', 'labs', 'systems', 'solutions',
  ]

  return techKeywords.some((kw) => titleLower.includes(kw))
}

export const companiesHouseConnector: PaginatedSourceConnector = {
  name: 'companies-house',
  displayName: 'Companies House UK',
  sourceType: 'api',
  cursorType: 'offset',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '0'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const offset = cursor ? parseInt(cursor, 10) : 0
    const items: ParsedFunding[] = []

    logger.info(`Fetching Companies House data (offset: ${offset})`)

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY

    let companies: CHCompany[]
    let total = 0

    if (apiKey) {
      try {
        const result = await searchRecentCompanies(apiKey, offset)
        companies = result.companies
        total = result.total
      } catch (error) {
        logger.warn('Companies House API failed, using scraping fallback', {
          error: error instanceof Error ? error.message : 'Unknown',
        })
        companies = await scrapeCompaniesHouse(Math.floor(offset / 20) + 1)
      }
    } else {
      logger.warn('No COMPANIES_HOUSE_API_KEY, using scraping')
      companies = await scrapeCompaniesHouse(Math.floor(offset / 20) + 1)
    }

    logger.info(`Found ${companies.length} companies`)

    for (const company of companies.slice(0, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)) {
      try {
        // Filter for tech companies
        if (!isTechCompany(company)) {
          continue
        }

        // Skip inactive companies
        if (company.company_status?.toLowerCase() !== 'active') {
          continue
        }

        const creationDate = company.date_of_creation ? new Date(company.date_of_creation) : new Date()

        // Skip if before 2021
        if (creationDate < MIN_DATE) {
          continue
        }

        // Check for funding filings if we have API access
        let amount: number | null = null
        if (apiKey) {
          const filings = await getFilingHistory(apiKey, company.company_number)
          const shareAllotments = filings.filter((f) => f.type.includes('SH01'))

          // If there are share allotments, it indicates funding
          if (shareAllotments.length > 0) {
            // Can't get exact amount from CH, but presence indicates funding
            amount = null // We don't know the amount
          }

          // Rate limit respect
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        const parsed: ParsedFunding = {
          companyName: company.title.replace(/\s+(LIMITED|LTD|PLC)$/i, '').trim(),
          amount,
          currency: 'GBP',
          stage: 'SEED', // UK companies are typically early stage when just created
          investors: [],
          leadInvestor: null,
          date: creationDate,
          sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${company.company_number}`,
          sourceName: 'companies-house',
          description: null,
        }

        items.push(parsed)
      } catch (error) {
        logger.warn(`Failed to process company: ${company.title}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }

    const hasMore = apiKey ? (offset + companies.length < total && companies.length > 0) : companies.length >= 20

    return {
      items,
      nextCursor: hasMore ? String(offset + companies.length) : null,
      hasMore,
      totalEstimated: total || undefined,
    }
  },
}

export default companiesHouseConnector
