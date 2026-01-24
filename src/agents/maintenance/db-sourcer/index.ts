/**
 * DB_SOURCER Agent
 *
 * Agent d'import de nouvelles données depuis des sources externes.
 * Sources: FrenchWeb, Maddyness, TechCrunch, EU-Startups, Sifted, Tech.eu
 *
 * Fréquence: Mardi 03:00
 * Coût: ~$0.10/run (scraping only, pas de LLM)
 */

import { prisma } from '@/lib/prisma'
import type { SourcerResult, SourcerDetails, SourceStats, AgentError, ParsedFunding } from '../types'
import { createLogger, createAgentError } from '../utils'
import { checkDuplicate, createCompanyAndRound } from './dedup'
import { parseArticleHybrid } from './llm-parser'

// Import source connectors
import { fetchFrenchWeb } from './sources/frenchweb'
import { fetchMaddyness } from './sources/maddyness'
import { fetchTechCrunch } from './sources/techcrunch'
import { fetchEUStartups } from './sources/eu-startups'
import { fetchSifted } from './sources/sifted'
import { fetchTechEu } from './sources/tech-eu'

const logger = createLogger('DB_SOURCER')

// ============================================================================
// SOURCE REGISTRY
// ============================================================================

interface SourceConnector {
  name: string
  displayName: string
  fetch: () => Promise<ParsedFunding[]>
  enabled: boolean
}

const SOURCES: SourceConnector[] = [
  { name: 'frenchweb', displayName: 'FrenchWeb', fetch: fetchFrenchWeb, enabled: true },
  { name: 'maddyness', displayName: 'Maddyness', fetch: fetchMaddyness, enabled: true },
  { name: 'techcrunch', displayName: 'TechCrunch', fetch: fetchTechCrunch, enabled: true },
  { name: 'eu-startups', displayName: 'EU-Startups', fetch: fetchEUStartups, enabled: true },
  { name: 'sifted', displayName: 'Sifted', fetch: fetchSifted, enabled: true },
  { name: 'tech-eu', displayName: 'Tech.eu', fetch: fetchTechEu, enabled: true },
]

// ============================================================================
// MAIN AGENT
// ============================================================================

/**
 * Exécute l'agent DB_SOURCER
 */
export async function runSourcer(runId?: string): Promise<SourcerResult> {
  const startTime = Date.now()
  const errors: AgentError[] = []

  const sourceBreakdown: Record<string, SourceStats> = {}
  let totalArticlesFound = 0
  let totalArticlesParsed = 0
  let totalDuplicatesSkipped = 0
  let totalNewCompanies = 0
  let totalNewRounds = 0

  logger.info('Starting DB_SOURCER run', { runId })

  // Update run status to RUNNING
  if (runId) {
    await prisma.maintenanceRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  try {
    // Process each source
    const enabledSources = SOURCES.filter((s) => s.enabled)

    for (const source of enabledSources) {
      logger.info(`Processing source: ${source.displayName}`)

      const stats: SourceStats = {
        articlesFound: 0,
        articlesParsed: 0,
        newCompanies: 0,
        newRounds: 0,
        errors: 0,
      }

      try {
        // Fetch articles from source
        const articles = await source.fetch()
        stats.articlesFound = articles.length
        totalArticlesFound += articles.length

        logger.info(`Found ${articles.length} articles from ${source.displayName}`)

        // Process each article
        for (const article of articles) {
          try {
            // Check for duplicates
            const isDuplicate = await checkDuplicate(article)

            if (isDuplicate) {
              totalDuplicatesSkipped++
              continue
            }

            // Create company and funding round
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
          lastImportAt: new Date(),
          lastImportCount: stats.newRounds,
          totalRounds: stats.newRounds,
          isActive: true,
        },
      })
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
