/**
 * DB_SOURCER Agent
 *
 * Agent d'import de nouvelles données depuis des sources externes.
 *
 * Sources RSS (derniers articles):
 * - FrenchWeb, Maddyness, TechCrunch, EU-Startups, Sifted, Tech.eu
 *
 * Sources Paginées (import historique):
 * - Archives: FrenchWeb, Maddyness, EU-Startups, Sifted
 * - APIs: Y Combinator, ProductHunt, Crunchbase, GitHub
 * - Scraping: BPI France, Hacker News, Companies House UK
 *
 * Fréquence: Mardi 03:00
 * Coût: ~$0.10/run (scraping only, LLM pour parsing uniquement)
 */

import { prisma } from '@/lib/prisma'
import type {
  SourcerResult,
  SourcerDetails,
  SourceStats,
  AgentError,
  ParsedFunding,
  PaginatedSourceConnector,
  PaginatedSourceResult,
} from '../types'
import { MAINTENANCE_CONSTANTS } from '../types'
import { createLogger, createAgentError } from '../utils'
import { checkDuplicate, createCompanyAndRound } from './dedup'

// Legacy RSS source connectors
import { fetchFrenchWeb } from './sources/frenchweb'
import { fetchMaddyness } from './sources/maddyness'
import { fetchTechCrunch } from './sources/techcrunch'
import { fetchEUStartups } from './sources/eu-startups'
import { fetchSifted } from './sources/sifted'
import { fetchTechEu } from './sources/tech-eu'

// Archive source connectors (paginated)
import { frenchwebArchiveConnector } from './sources/archives/frenchweb-archive'
import { maddynessArchiveConnector } from './sources/archives/maddyness-archive'
import { euStartupsArchiveConnector } from './sources/archives/eu-startups-archive'
import { siftedArchiveConnector } from './sources/archives/sifted-archive'

// New paginated source connectors
import { ycombinatorConnector } from './sources/ycombinator'
import { producthuntConnector } from './sources/producthunt'
import { crunchbaseConnector } from './sources/crunchbase-basic'
import { bpifranceConnector } from './sources/bpifrance'
import { githubTrendingConnector } from './sources/github-trending'
import { hackernewsConnector } from './sources/hackernews'
import { companiesHouseConnector } from './sources/companies-house'

const logger = createLogger('DB_SOURCER')

// ============================================================================
// SOURCE REGISTRIES
// ============================================================================

interface LegacySourceConnector {
  name: string
  displayName: string
  fetch: () => Promise<ParsedFunding[]>
  enabled: boolean
}

// Legacy RSS sources (fetch latest articles only)
const LEGACY_SOURCES: LegacySourceConnector[] = [
  { name: 'frenchweb', displayName: 'FrenchWeb', fetch: fetchFrenchWeb, enabled: true },
  { name: 'maddyness', displayName: 'Maddyness', fetch: fetchMaddyness, enabled: true },
  { name: 'techcrunch', displayName: 'TechCrunch', fetch: fetchTechCrunch, enabled: true },
  { name: 'eu-startups', displayName: 'EU-Startups', fetch: fetchEUStartups, enabled: true },
  { name: 'sifted', displayName: 'Sifted', fetch: fetchSifted, enabled: true },
  { name: 'tech-eu', displayName: 'Tech.eu', fetch: fetchTechEu, enabled: true },
]

// Paginated sources (support historical import with cursor)
const PAGINATED_SOURCES: PaginatedSourceConnector[] = [
  // Archives (highest priority - get historical data from existing sources)
  frenchwebArchiveConnector,
  maddynessArchiveConnector,
  euStartupsArchiveConnector,
  siftedArchiveConnector,
  // High-value sources
  ycombinatorConnector,
  producthuntConnector,
  crunchbaseConnector,
  // Additional sources
  bpifranceConnector,
  githubTrendingConnector,
  hackernewsConnector,
  companiesHouseConnector,
]

// ============================================================================
// PAGINATED SOURCE PROCESSING
// ============================================================================

interface PaginatedSourceState {
  cursor: string | null
  historicalImportComplete: boolean
}

/**
 * Get pagination state for a source from DB
 */
async function getSourceState(sourceName: string): Promise<PaginatedSourceState> {
  const source = await prisma.fundingSource.findUnique({
    where: { name: sourceName },
  })

  return {
    cursor: source?.cursor || null,
    historicalImportComplete: source?.historicalImportComplete || false,
  }
}

/**
 * Update pagination state for a source
 */
async function updateSourceState(
  sourceName: string,
  displayName: string,
  sourceType: string,
  cursor: string | null,
  historicalComplete: boolean,
  stats: SourceStats
): Promise<void> {
  await prisma.fundingSource.upsert({
    where: { name: sourceName },
    update: {
      cursor,
      historicalImportComplete: historicalComplete,
      lastImportAt: new Date(),
      lastImportCount: stats.newRounds,
      totalRounds: { increment: stats.newRounds },
    },
    create: {
      name: sourceName,
      displayName,
      sourceType,
      cursor,
      historicalImportComplete: historicalComplete,
      lastImportAt: new Date(),
      lastImportCount: stats.newRounds,
      totalRounds: stats.newRounds,
      isActive: true,
    },
  })
}

/**
 * Process a paginated source - fetch batches until limit or complete
 */
async function processPaginatedSource(
  connector: PaginatedSourceConnector,
  errors: AgentError[]
): Promise<{ stats: SourceStats; items: ParsedFunding[] }> {
  const stats: SourceStats = {
    articlesFound: 0,
    articlesParsed: 0,
    newCompanies: 0,
    newRounds: 0,
    errors: 0,
  }
  const allItems: ParsedFunding[] = []

  // Get current state
  const state = await getSourceState(connector.name)

  // Skip if historical import is complete (for archive sources)
  if (state.historicalImportComplete && connector.sourceType === 'archive') {
    logger.info(`Skipping ${connector.displayName} - historical import complete`)
    return { stats, items: allItems }
  }

  let cursor = state.cursor
  let batchCount = 0
  let historicalComplete = state.historicalImportComplete

  // Process batches (up to max per run to avoid timeout)
  while (batchCount < MAINTENANCE_CONSTANTS.HISTORICAL_MAX_BATCHES_PER_RUN) {
    try {
      logger.info(`Fetching ${connector.displayName} batch ${batchCount + 1} (cursor: ${cursor || 'start'})`)

      const result: PaginatedSourceResult = await connector.fetch(cursor)

      stats.articlesFound += result.items.length
      allItems.push(...result.items)

      logger.info(`Got ${result.items.length} items from ${connector.displayName}`)

      // Update cursor for next batch
      cursor = result.nextCursor

      // Check if we're done
      if (!result.hasMore || !cursor) {
        historicalComplete = true
        logger.info(`${connector.displayName} historical import complete`)
        break
      }

      batchCount++
    } catch (error) {
      stats.errors++
      const err = createAgentError(error, {
        phase: 'fetch_paginated',
        itemName: connector.name,
      })
      errors.push(err)
      logger.error(`Failed to fetch from ${connector.displayName}`, { error: err.message })
      break
    }
  }

  // Save state for next run
  await updateSourceState(
    connector.name,
    connector.displayName,
    connector.sourceType,
    cursor,
    historicalComplete,
    stats
  )

  return { stats, items: allItems }
}

// ============================================================================
// MAIN AGENT
// ============================================================================

export interface SourcerOptions {
  /** Run only legacy RSS sources */
  legacyOnly?: boolean
  /** Run only paginated sources (historical import) */
  paginatedOnly?: boolean
  /** Specific sources to run (by name) */
  sources?: string[]
}

/**
 * Exécute l'agent DB_SOURCER
 */
export async function runSourcer(runId?: string, options: SourcerOptions = {}): Promise<SourcerResult> {
  const startTime = Date.now()
  const errors: AgentError[] = []

  const sourceBreakdown: Record<string, SourceStats> = {}
  let totalArticlesFound = 0
  let totalArticlesParsed = 0
  let totalDuplicatesSkipped = 0
  let totalNewCompanies = 0
  let totalNewRounds = 0

  logger.info('Starting DB_SOURCER run', { runId, options })

  // Update run status to RUNNING
  if (runId) {
    await prisma.maintenanceRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  try {
    // =========================================================================
    // PROCESS LEGACY RSS SOURCES
    // =========================================================================
    if (!options.paginatedOnly) {
      const legacySources = options.sources
        ? LEGACY_SOURCES.filter((s) => options.sources!.includes(s.name))
        : LEGACY_SOURCES.filter((s) => s.enabled)

      for (const source of legacySources) {
        logger.info(`Processing legacy source: ${source.displayName}`)

        const stats: SourceStats = {
          articlesFound: 0,
          articlesParsed: 0,
          newCompanies: 0,
          newRounds: 0,
          errors: 0,
        }

        try {
          const articles = await source.fetch()
          stats.articlesFound = articles.length
          totalArticlesFound += articles.length

          logger.info(`Found ${articles.length} articles from ${source.displayName}`)

          for (const article of articles) {
            try {
              const isDuplicate = await checkDuplicate(article)

              if (isDuplicate) {
                totalDuplicatesSkipped++
                continue
              }

              const result = await createCompanyAndRound(article, source.name)

              if (result.companyCreated) {
                stats.newCompanies++
                totalNewCompanies++
              }
              if (result.roundCreated) {
                stats.newRounds++
                totalNewRounds++
              }

              stats.articlesParsed++
              totalArticlesParsed++
            } catch (error) {
              stats.errors++
              const err = createAgentError(error, {
                phase: 'process_article',
                itemName: article.companyName,
              })
              errors.push(err)
              logger.error(`Failed to process article for ${article.companyName}`, {
                error: err.message,
              })
            }
          }
        } catch (error) {
          stats.errors++
          const err = createAgentError(error, {
            phase: 'fetch_source',
            itemName: source.name,
          })
          errors.push(err)
          logger.error(`Failed to fetch from ${source.displayName}`, { error: err.message })
        }

        sourceBreakdown[source.name] = stats

        // Update FundingSource stats
        await prisma.fundingSource.upsert({
          where: { name: source.name },
          update: {
            lastImportAt: new Date(),
            lastImportCount: stats.newRounds,
            totalRounds: { increment: stats.newRounds },
          },
          create: {
            name: source.name,
            displayName: source.displayName,
            sourceType: 'rss',
            lastImportAt: new Date(),
            lastImportCount: stats.newRounds,
            totalRounds: stats.newRounds,
            isActive: true,
          },
        })
      }
    }

    // =========================================================================
    // PROCESS PAGINATED SOURCES (Historical Import)
    // =========================================================================
    if (!options.legacyOnly) {
      const paginatedSources = options.sources
        ? PAGINATED_SOURCES.filter((s) => options.sources!.includes(s.name))
        : PAGINATED_SOURCES

      for (const connector of paginatedSources) {
        logger.info(`Processing paginated source: ${connector.displayName}`)

        const { stats, items } = await processPaginatedSource(connector, errors)

        // Process items
        for (const article of items) {
          try {
            const isDuplicate = await checkDuplicate(article)

            if (isDuplicate) {
              totalDuplicatesSkipped++
              continue
            }

            const result = await createCompanyAndRound(article, connector.name)

            if (result.companyCreated) {
              stats.newCompanies++
              totalNewCompanies++
            }
            if (result.roundCreated) {
              stats.newRounds++
              totalNewRounds++
            }

            stats.articlesParsed++
            totalArticlesParsed++
          } catch (error) {
            stats.errors++
            const err = createAgentError(error, {
              phase: 'process_article',
              itemName: article.companyName,
            })
            errors.push(err)
            logger.error(`Failed to process article for ${article.companyName}`, {
              error: err.message,
            })
          }
        }

        totalArticlesFound += stats.articlesFound
        sourceBreakdown[connector.name] = stats
      }
    }

    // =========================================================================
    // FINALIZE
    // =========================================================================
    const durationMs = Date.now() - startTime
    const sourcesScraped = Object.keys(sourceBreakdown).length
    const status = errors.length === 0 ? 'COMPLETED' : errors.length < sourcesScraped ? 'PARTIAL' : 'FAILED'

    const details: SourcerDetails = {
      sourcesScraped,
      articlesFound: totalArticlesFound,
      articlesParsed: totalArticlesParsed,
      duplicatesSkipped: totalDuplicatesSkipped,
      newCompaniesCreated: totalNewCompanies,
      newFundingRoundsCreated: totalNewRounds,
      sourceBreakdown,
    }

    logger.info('DB_SOURCER completed', {
      status,
      durationMs,
      newCompanies: totalNewCompanies,
      newRounds: totalNewRounds,
      errors: errors.length,
    })

    // Update run record
    if (runId) {
      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: {
          status,
          completedAt: new Date(),
          durationMs,
          itemsProcessed: totalArticlesFound,
          itemsCreated: totalNewCompanies + totalNewRounds,
          itemsSkipped: totalDuplicatesSkipped,
          itemsFailed: errors.length,
          details: details as object,
          errors: errors.length > 0 ? (errors as object[]) : undefined,
        },
      })
    }

    return {
      success: status !== 'FAILED',
      status,
      itemsProcessed: totalArticlesFound,
      itemsUpdated: 0,
      itemsCreated: totalNewCompanies + totalNewRounds,
      itemsFailed: errors.length,
      itemsSkipped: totalDuplicatesSkipped,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
      details,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const err = createAgentError(error, { phase: 'main' })

    logger.error('DB_SOURCER failed', { error: err.message })

    if (runId) {
      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs,
          errors: [err] as object[],
        },
      })
    }

    return {
      success: false,
      status: 'FAILED',
      itemsProcessed: 0,
      itemsUpdated: 0,
      itemsCreated: 0,
      itemsFailed: 1,
      itemsSkipped: 0,
      durationMs,
      errors: [err],
      details: {
        sourcesScraped: 0,
        articlesFound: 0,
        articlesParsed: 0,
        duplicatesSkipped: 0,
        newCompaniesCreated: 0,
        newFundingRoundsCreated: 0,
        sourceBreakdown: {},
      },
    }
  }
}

export default runSourcer
