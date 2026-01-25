/**
 * Crunchbase Basic Source
 *
 * Import des données depuis Crunchbase Basic API (gratuit, 50 calls/jour)
 * API: https://api.crunchbase.com/v4
 *
 * Limitations:
 * - 50 API calls/jour en gratuit
 * - Pas d'accès aux données financières détaillées
 * - Mais accès aux: organizations, funding rounds (basique), people
 */

import type { ParsedFunding, PaginatedSourceResult, PaginatedSourceConnector } from '../../types'
import { withTimeout, createLogger } from '../../utils'
import { MAINTENANCE_CONSTANTS } from '../../types'

const logger = createLogger('DB_SOURCER:crunchbase')

const CB_API_URL = 'https://api.crunchbase.com/api/v4'
const MIN_DATE = MAINTENANCE_CONSTANTS.HISTORICAL_MIN_DATE

interface CBFundingRound {
  uuid: string
  properties: {
    identifier: { value: string; permalink: string }
    short_description?: string
    announced_on?: string
    money_raised?: { value: number; currency: string }
    investment_type?: string
    lead_investor_identifiers?: Array<{ value: string }>
    investor_identifiers?: Array<{ value: string }>
    funded_organization_identifier?: { value: string; permalink: string }
  }
}

interface CBSearchResponse {
  count: number
  entities: CBFundingRound[]
}

/**
 * Convertit le type d'investissement Crunchbase en stage normalisé
 */
function mapInvestmentType(type: string | undefined): string {
  const mapping: Record<string, string> = {
    'pre_seed': 'PRE_SEED',
    'seed': 'SEED',
    'series_a': 'SERIES_A',
    'series_b': 'SERIES_B',
    'series_c': 'SERIES_C',
    'series_d': 'LATER',
    'series_e': 'LATER',
    'series_f': 'LATER',
    'private_equity': 'LATER',
    'debt_financing': 'LATER',
    'grant': 'SEED',
    'angel': 'PRE_SEED',
    'convertible_note': 'SEED',
  }
  return mapping[type?.toLowerCase() || ''] || 'SEED'
}

/**
 * Fetch funding rounds from Crunchbase API
 */
async function fetchCBFundingRounds(
  apiKey: string,
  cursor: number,
  limit: number = 25
): Promise<{ rounds: CBFundingRound[]; total: number }> {
  const url = `${CB_API_URL}/searches/funding_rounds`

  const body = {
    field_ids: [
      'identifier',
      'short_description',
      'announced_on',
      'money_raised',
      'investment_type',
      'lead_investor_identifiers',
      'investor_identifiers',
      'funded_organization_identifier',
    ],
    order: [{ field_id: 'announced_on', sort: 'desc' }],
    query: [
      {
        type: 'predicate',
        field_id: 'announced_on',
        operator_id: 'gte',
        values: ['2021-01-01'],
      },
      {
        type: 'predicate',
        field_id: 'location_identifiers',
        operator_id: 'includes',
        values: ['europe', 'united-states', 'france', 'united-kingdom', 'germany'],
      },
    ],
    limit,
    after_id: cursor > 0 ? String(cursor) : undefined,
  }

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-cb-user-key': apiKey,
      },
      body: JSON.stringify(body),
    }),
    30000,
    'Crunchbase API timeout'
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Crunchbase API error: ${response.status} - ${errorText}`)
  }

  const data: CBSearchResponse = await response.json()

  return {
    rounds: data.entities || [],
    total: data.count || 0,
  }
}

/**
 * Fallback: scrape Crunchbase news/recent funding
 */
async function scrapeCBRecent(): Promise<ParsedFunding[]> {
  const url = 'https://news.crunchbase.com/venture/'
  const items: ParsedFunding[] = []

  try {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'AngelDesk Bot/1.0 (Funding Tracker)',
          'Accept': 'text/html',
        },
      }),
      MAINTENANCE_CONSTANTS.SCRAPE_TIMEOUT_MS,
      'Crunchbase news timeout'
    )

    if (!response.ok) return items

    const html = await response.text()

    // Extract funding news articles
    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
    let match

    while ((match = articlePattern.exec(html)) !== null) {
      const articleHtml = match[1]

      // Look for funding-related articles
      const titleMatch = articleHtml.match(/<h[23][^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
      if (!titleMatch) continue

      const title = titleMatch[2].trim()
      const url = titleMatch[1]

      // Check if it's a funding article
      const isFunding =
        title.toLowerCase().includes('raises') ||
        title.toLowerCase().includes('funding') ||
        title.toLowerCase().includes('series') ||
        title.toLowerCase().includes('million')

      if (!isFunding) continue

      // Extract amount from title
      const amountMatch = title.match(/\$?([\d.]+)\s*(million|m|billion|b)/i)
      let amount: number | null = null
      if (amountMatch) {
        const value = parseFloat(amountMatch[1])
        const multiplier = amountMatch[2].toLowerCase().startsWith('b') ? 1e9 : 1e6
        amount = value * multiplier
      }

      // Extract company name (usually first part of title before "raises")
      const companyMatch = title.match(/^(.+?)\s+(?:raises|secures|closes|lands)/i)
      const companyName = companyMatch ? companyMatch[1].trim() : title

      items.push({
        companyName,
        amount,
        currency: 'USD',
        stage: 'SEED',
        investors: [],
        leadInvestor: null,
        date: new Date(),
        sourceUrl: url.startsWith('http') ? url : `https://news.crunchbase.com${url}`,
        sourceName: 'crunchbase-news',
        description: title,
      })
    }
  } catch (error) {
    logger.warn('Failed to scrape Crunchbase news', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
  }

  return items
}

export const crunchbaseConnector: PaginatedSourceConnector = {
  name: 'crunchbase',
  displayName: 'Crunchbase',
  sourceType: 'api',
  cursorType: 'offset',
  minDate: MIN_DATE,

  getInitialCursor(): string {
    return '0'
  },

  async fetch(cursor: string | null): Promise<PaginatedSourceResult> {
    const offset = cursor ? parseInt(cursor, 10) : 0
    const items: ParsedFunding[] = []

    logger.info(`Fetching Crunchbase funding rounds (offset: ${offset})`)

    const apiKey = process.env.CRUNCHBASE_API_KEY

    // If no API key, use scraping fallback
    if (!apiKey) {
      logger.warn('No CRUNCHBASE_API_KEY found, using news scraping fallback')

      const scrapedItems = await scrapeCBRecent()
      return {
        items: scrapedItems,
        nextCursor: null, // Scraping doesn't support pagination well
        hasMore: false,
      }
    }

    try {
      const { rounds, total } = await fetchCBFundingRounds(apiKey, offset, MAINTENANCE_CONSTANTS.HISTORICAL_ITEMS_PER_BATCH)

      logger.info(`Found ${rounds.length} funding rounds (total: ${total})`)

      for (const round of rounds) {
        try {
          const props = round.properties
          const announcedDate = props.announced_on ? new Date(props.announced_on) : new Date()

          // Skip if before 2021
          if (announcedDate < MIN_DATE) {
            continue
          }

          const companyName = props.funded_organization_identifier?.value || 'Unknown'
          const amount = props.money_raised?.value || null
          const currency = props.money_raised?.currency || 'USD'
          const stage = mapInvestmentType(props.investment_type)

          const leadInvestors = props.lead_investor_identifiers?.map((i) => i.value) || []
          const allInvestors = props.investor_identifiers?.map((i) => i.value) || []

          const parsed: ParsedFunding = {
            companyName,
            amount,
            currency,
            stage,
            investors: allInvestors,
            leadInvestor: leadInvestors[0] || null,
            date: announcedDate,
            sourceUrl: `https://www.crunchbase.com/funding_round/${props.identifier?.permalink || round.uuid}`,
            sourceName: 'crunchbase',
            description: props.short_description || null,
          }

          items.push(parsed)
        } catch (error) {
          logger.warn(`Failed to process Crunchbase round`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      const hasMore = offset + rounds.length < total && rounds.length > 0

      return {
        items,
        nextCursor: hasMore ? String(offset + rounds.length) : null,
        hasMore,
        totalEstimated: total,
      }
    } catch (error) {
      logger.error('Failed to fetch Crunchbase', {
        error: error instanceof Error ? error.message : 'Unknown',
      })

      // Fallback to scraping on API error
      logger.info('Falling back to Crunchbase news scraping')
      const scrapedItems = await scrapeCBRecent()

      return {
        items: scrapedItems,
        nextCursor: null,
        hasMore: false,
      }
    }
  },
}

export default crunchbaseConnector
