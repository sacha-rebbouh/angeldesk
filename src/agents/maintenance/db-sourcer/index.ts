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
// SOURCE REGISTRIES (EXPORTED for Inngest multi-step)
// ============================================================================

export interface LegacySourceConnector {
  name: string
  displayName: string
  fetch: () => Promise<ParsedFunding[]>
  enabled: boolean
}

// Legacy RSS sources (fetch latest articles only)
export const LEGACY_SOURCES: LegacySourceConnector[] = [
  { name: 'frenchweb', displayName: 'FrenchWeb', fetch: fetchFrenchWeb, enabled: true },
  { name: 'maddyness', displayName: 'Maddyness', fetch: fetchMaddyness, enabled: true },
  { name: 'techcrunch', displayName: 'TechCrunch', fetch: fetchTechCrunch, enabled: true },
  { name: 'eu-startups', displayName: 'EU-Startups', fetch: fetchEUStartups, enabled: true },
  { name: 'sifted', displayName: 'Sifted', fetch: fetchSifted, enabled: true },
  { name: 'tech-eu', displayName: 'Tech.eu', fetch: fetchTechEu, enabled: true },
]

// Paginated sources (support historical import with cursor)
// ALL ENABLED - Inngest handles each in separate step
export const PAGINATED_SOURCES: PaginatedSourceConnector[] = [
  // Tested and working
  hackernewsConnector,
  // Archives
  frenchwebArchiveConnector,
  maddynessArchiveConnector,
  euStartupsArchiveConnector,
  siftedArchiveConnector,
  // APIs
  ycombinatorConnector,
  producthuntConnector,
  crunchbaseConnector,
  // Additional
  bpifranceConnector,
  githubTrendingConnector,
  companiesHouseConnector,
]

// ============================================================================
// INDIVIDUAL SOURCE PROCESSING (for Inngest steps)
// ============================================================================

/**
 * Process a single legacy RSS source
 * Returns stats for this source only
 */
export async function processLegacySource(sourceName: string): Promise<SourceStats> {
  const source = LEGACY_SOURCES.find((s) => s.name === sourceName)
  if (!source) {
    throw new Error(`Unknown legacy source: ${sourceName}`)
  }

  const stats: SourceStats = {
    articlesFound: 0,
    articlesParsed: 0,
    newCompanies: 0,
    newRounds: 0,
    errors: 0,
  }

  logger.info(`Processing legacy source: ${source.displayName}`)

  try {
    const articles = await source.fetch()
    stats.articlesFound = articles.length

    logger.info(`Found ${articles.length} articles from ${source.displayName}`)

    for (const article of articles) {
      try {
        const isDuplicate = await checkDuplicate(article)

        if (isDuplicate) {
          continue
        }

        const result = await createCompanyAndRound(article, source.name)

        if (result.companyCreated) {
          stats.newCompanies++
        }
        if (result.roundCreated) {
          stats.newRounds++
        }

        stats.articlesParsed++
      } catch (error) {
        stats.errors++
        logger.error(`Failed to process article for ${article.companyName}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }

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
  } catch (error) {
    stats.errors++
    logger.error(`Failed to fetch from ${source.displayName}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    })
  }

  logger.info(`Completed ${source.displayName}`, { ...stats })
  return stats
}

/**
 * Process a single paginated source (one batch)
 * Returns stats for this source only
 */
export async function processPaginatedSource(sourceName: string): Promise<SourceStats> {
  const connector = PAGINATED_SOURCES.find((s) => s.name === sourceName)
  if (!connector) {
    throw new Error(`Unknown paginated source: ${sourceName}`)
  }

  const stats: SourceStats = {
    articlesFound: 0,
    articlesParsed: 0,
    newCompanies: 0,
    newRounds: 0,
    errors: 0,
  }

  logger.info(`Processing paginated source: ${connector.displayName}`)

  // Get current state from DB
  const sourceRecord = await prisma.fundingSource.findUnique({
    where: { name: connector.name },
  })

  const cursor = sourceRecord?.cursor || null
  const historicalComplete = sourceRecord?.historicalImportComplete || false

  // Skip if historical import is complete (for archive sources)
  if (historicalComplete && connector.sourceType === 'archive') {
    logger.info(`Skipping ${connector.displayName} - historical import complete`)
    return stats
  }

  let currentCursor = cursor
  let batchCount = 0
  let newHistoricalComplete = historicalComplete

  // Process batches (up to max per run)
  while (batchCount < MAINTENANCE_CONSTANTS.HISTORICAL_MAX_BATCHES_PER_RUN) {
    try {
      logger.info(`Fetching ${connector.displayName} batch ${batchCount + 1} (cursor: ${currentCursor || 'start'})`)

      const result: PaginatedSourceResult = await connector.fetch(currentCursor)

      stats.articlesFound += result.items.length
      logger.info(`Got ${result.items.length} items from ${connector.displayName}`)

      // Process items
      for (const article of result.items) {
        try {
          const isDuplicate = await checkDuplicate(article)

          if (isDuplicate) {
            continue
          }

          const createResult = await createCompanyAndRound(article, connector.name)

          if (createResult.companyCreated) {
            stats.newCompanies++
          }
          if (createResult.roundCreated) {
            stats.newRounds++
          }

          stats.articlesParsed++
        } catch (error) {
          stats.errors++
          logger.error(`Failed to process article for ${article.companyName}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          })
        }
      }

      // Update cursor for next batch
      currentCursor = result.nextCursor

      // Check if we're done
      if (!result.hasMore || !currentCursor) {
        newHistoricalComplete = true
        logger.info(`${connector.displayName} historical import complete`)
        break
      }

      batchCount++
    } catch (error) {
      stats.errors++
      logger.error(`Failed to fetch from ${connector.displayName}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      })
      break
    }
  }

  // Save state for next run
  await prisma.fundingSource.upsert({
    where: { name: connector.name },
    update: {
      cursor: currentCursor,
      historicalImportComplete: newHistoricalComplete,
      lastImportAt: new Date(),
      lastImportCount: stats.newRounds,
      totalRounds: { increment: stats.newRounds },
    },
    create: {
      name: connector.name,
      displayName: connector.displayName,
      sourceType: connector.sourceType,
      cursor: currentCursor,
      historicalImportComplete: newHistoricalComplete,
      lastImportAt: new Date(),
      lastImportCount: stats.newRounds,
      totalRounds: stats.newRounds,
      isActive: true,
    },
  })

  logger.info(`Completed ${connector.displayName}`, { ...stats })
  return stats
}

// ============================================================================
// AGGREGATE RESULTS (called at end of Inngest flow)
// ============================================================================

export interface SourceResult {
  sourceName: string
  stats: SourceStats
}

/**
 * Finalize a sourcer run with aggregated results
 */
export async function finalizeSourcerRun(
  runId: string,
  results: SourceResult[],
  startTime: number
): Promise<SourcerResult> {
  const durationMs = Date.now() - startTime

  // Aggregate stats
  const sourceBreakdown: Record<string, SourceStats> = {}
  let totalArticlesFound = 0
  let totalArticlesParsed = 0
  let totalNewCompanies = 0
  let totalNewRounds = 0
  let totalErrors = 0

  for (const result of results) {
    sourceBreakdown[result.sourceName] = result.stats
    totalArticlesFound += result.stats.articlesFound
    totalArticlesParsed += result.stats.articlesParsed
    totalNewCompanies += result.stats.newCompanies
    totalNewRounds += result.stats.newRounds
    totalErrors += result.stats.errors
  }

  const status = totalErrors === 0 ? 'COMPLETED' : totalErrors < results.length ? 'PARTIAL' : 'FAILED'

  const details: SourcerDetails = {
    sourcesScraped: results.length,
    articlesFound: totalArticlesFound,
    articlesParsed: totalArticlesParsed,
    duplicatesSkipped: totalArticlesFound - totalArticlesParsed,
    newCompaniesCreated: totalNewCompanies,
    newFundingRoundsCreated: totalNewRounds,
    sourceBreakdown,
  }

  // Update run record
  await prisma.maintenanceRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      durationMs,
      itemsProcessed: totalArticlesFound,
      itemsCreated: totalNewCompanies + totalNewRounds,
      itemsSkipped: totalArticlesFound - totalArticlesParsed,
      itemsFailed: totalErrors,
      details: details as object,
    },
  })

  logger.info('DB_SOURCER completed', {
    status,
    durationMs,
    newCompanies: totalNewCompanies,
    newRounds: totalNewRounds,
    errors: totalErrors,
  })

  return {
    success: status !== 'FAILED',
    status,
    itemsProcessed: totalArticlesFound,
    itemsUpdated: 0,
    itemsCreated: totalNewCompanies + totalNewRounds,
    itemsFailed: totalErrors,
    itemsSkipped: totalArticlesFound - totalArticlesParsed,
    durationMs,
    details,
  }
}

// ============================================================================
// LEGACY: FULL RUN (kept for backwards compatibility / local testing)
// ============================================================================

export interface SourcerOptions {
  legacyOnly?: boolean
  paginatedOnly?: boolean
  sources?: string[]
}

/**
 * Run all sources in one go (for local testing only - will timeout on Vercel)
 */
export async function runSourcer(runId?: string, options: SourcerOptions = {}): Promise<SourcerResult> {
  const startTime = Date.now()
  const results: SourceResult[] = []

  logger.info('Starting DB_SOURCER run (full mode)', { runId, options })

  // Update run status
  if (runId) {
    await prisma.maintenanceRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  try {
    // Process legacy sources
    if (!options.paginatedOnly) {
      const legacySources = options.sources
        ? LEGACY_SOURCES.filter((s) => options.sources!.includes(s.name))
        : LEGACY_SOURCES.filter((s) => s.enabled)

      for (const source of legacySources) {
        const stats = await processLegacySource(source.name)
        results.push({ sourceName: source.name, stats })
      }
    }

    // Process paginated sources
    if (!options.legacyOnly) {
      const paginatedSources = options.sources
        ? PAGINATED_SOURCES.filter((s) => options.sources!.includes(s.name))
        : PAGINATED_SOURCES

      for (const connector of paginatedSources) {
        const stats = await processPaginatedSource(connector.name)
        results.push({ sourceName: connector.name, stats })
      }
    }

    // Finalize
    if (runId) {
      return await finalizeSourcerRun(runId, results, startTime)
    }

    // No runId - return basic result
    const durationMs = Date.now() - startTime
    return {
      success: true,
      status: 'COMPLETED',
      itemsProcessed: results.reduce((acc, r) => acc + r.stats.articlesFound, 0),
      itemsUpdated: 0,
      itemsCreated: results.reduce((acc, r) => acc + r.stats.newCompanies + r.stats.newRounds, 0),
      itemsFailed: results.reduce((acc, r) => acc + r.stats.errors, 0),
      itemsSkipped: 0,
      durationMs,
      details: {
        sourcesScraped: results.length,
        articlesFound: results.reduce((acc, r) => acc + r.stats.articlesFound, 0),
        articlesParsed: results.reduce((acc, r) => acc + r.stats.articlesParsed, 0),
        duplicatesSkipped: 0,
        newCompaniesCreated: results.reduce((acc, r) => acc + r.stats.newCompanies, 0),
        newFundingRoundsCreated: results.reduce((acc, r) => acc + r.stats.newRounds, 0),
        sourceBreakdown: Object.fromEntries(results.map((r) => [r.sourceName, r.stats])),
      },
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
