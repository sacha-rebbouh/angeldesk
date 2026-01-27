/**
 * DB_COMPLETER Agent
 *
 * Agent d'enrichissement des données via recherche web + LLM.
 * Utilise Brave Search (gratuit) + DeepSeek (low cost)
 *
 * Fréquence: Jeudi 03:00 + Samedi 03:00
 * Coût: ~$0.26/run de 200 companies (~$1.30/1000 companies)
 */

import { prisma } from '@/lib/prisma'
import type {
  CompleterResult,
  CompleterDetails,
  FieldUpdateStats,
  ActivityStatusBreakdown,
  AgentError,
} from '../types'
import { MAINTENANCE_CONSTANTS } from '../types'
import { createLogger, createAgentError, processBatch } from '../utils'
import { selectCompaniesToEnrich, releaseEnrichmentLock, releaseAllLocksForRun } from './selector'
import { searchWithFallback, getBraveCircuitStatus, getSearchMetrics, resetSearchMetrics } from './web-search'
import { scrapeUrls } from './scraper'
import { extractWithLLM, type LLMExtractionResponse, getLLMCircuitStatus } from './llm-extract'
import { validateAndUpdate } from './validator'

const logger = createLogger('DB_COMPLETER')

// ============================================================================
// BATCH STATS (for multi-step Inngest)
// ============================================================================

export interface CompleterBatchStats {
  companiesProcessed: number
  companiesEnriched: number
  companiesSkipped: number
  companiesFailed: number
  totalCost: number
  llmCalls: number
  webSearches: number
  totalSources: number
  totalConfidence: number
  totalCompleteness: number
  fieldsUpdated: FieldUpdateStats
  activityStatusBreakdown: ActivityStatusBreakdown
  errors: AgentError[]
}

/**
 * Returns empty batch stats (for error handling in Inngest)
 */
export function emptyBatchStats(): CompleterBatchStats {
  return {
    companiesProcessed: 0,
    companiesEnriched: 0,
    companiesSkipped: 0,
    companiesFailed: 0,
    totalCost: 0,
    llmCalls: 0,
    webSearches: 0,
    totalSources: 0,
    totalConfidence: 0,
    totalCompleteness: 0,
    fieldsUpdated: {
      industry: 0, description: 0, tagline: 0, useCases: 0, founders: 0, investors: 0,
      headquarters: 0, foundedYear: 0, website: 0, linkedin: 0, competitors: 0,
      status: 0, employees: 0,
    },
    activityStatusBreakdown: {
      active: 0, shutdown: 0, acquired: 0, inactive: 0, unknown: 0,
    },
    errors: [],
  }
}

/**
 * Process a single batch of companies (for Inngest multi-step)
 * Returns stats that can be aggregated across batches
 */
export async function processCompleterBatch(batchNumber: number): Promise<CompleterBatchStats> {
  const stats: CompleterBatchStats = {
    companiesProcessed: 0,
    companiesEnriched: 0,
    companiesSkipped: 0,
    companiesFailed: 0,
    totalCost: 0,
    llmCalls: 0,
    webSearches: 0,
    totalSources: 0,
    totalConfidence: 0,
    totalCompleteness: 0,
    fieldsUpdated: {
      industry: 0, description: 0, tagline: 0, useCases: 0, founders: 0, investors: 0,
      headquarters: 0, foundedYear: 0, website: 0, linkedin: 0, competitors: 0,
      status: 0, employees: 0,
    },
    activityStatusBreakdown: {
      active: 0, shutdown: 0, acquired: 0, inactive: 0, unknown: 0,
    },
    errors: [],
  }

  logger.info(`Processing batch ${batchNumber}`)

  // Select companies for this batch
  const companies = await selectCompaniesToEnrich(MAINTENANCE_CONSTANTS.COMPLETER_BATCH_SIZE)

  if (companies.length === 0) {
    logger.info(`Batch ${batchNumber}: No companies to process`)
    return stats
  }

  logger.info(`Batch ${batchNumber}: Processing ${companies.length} companies`)

  // Process each company
  await processBatch(
    companies,
    async (company) => {
      stats.companiesProcessed++

      try {
        // Search for information
        const searchResults = await searchWithFallback(company.name)
        stats.webSearches++

        if (searchResults.length === 0) {
          stats.companiesSkipped++
          return
        }

        // Scrape URLs
        const urlsToScrape = [
          ...(company.fundingRounds?.[0]?.sourceUrl ? [company.fundingRounds[0].sourceUrl] : []),
          ...searchResults.slice(0, 3).map((r) => r.url),
        ]

        const scrapedContent = await scrapeUrls(urlsToScrape)
        const successfulScrapes = scrapedContent.filter((s) => s.success)

        if (successfulScrapes.length === 0) {
          stats.companiesSkipped++
          return
        }

        stats.totalSources += successfulScrapes.length

        // Combine content for LLM
        const combinedContent = [
          ...searchResults.map((r) => `Source: ${r.title}\n${r.description}`),
          ...successfulScrapes.map((s) => `Source: ${s.title}\n${s.text}`),
        ].join('\n\n---\n\n')

        // Extract with LLM
        const extractionResponse = await extractWithLLM(company.name, combinedContent)
        stats.llmCalls++

        if (extractionResponse.usage) {
          stats.totalCost +=
            (extractionResponse.usage.promptTokens / 1000) * MAINTENANCE_CONSTANTS.DEEPSEEK_COST_PER_1K_INPUT +
            (extractionResponse.usage.completionTokens / 1000) * MAINTENANCE_CONSTANTS.DEEPSEEK_COST_PER_1K_OUTPUT
        }

        if (!extractionResponse.result) {
          stats.companiesFailed++
          return
        }

        const extractionResult = extractionResponse.result
        stats.totalConfidence += extractionResult.confidence
        stats.totalCompleteness += extractionResult.data_completeness

        // Validate and update
        const updateResult = await validateAndUpdate(company.id, extractionResult, combinedContent)

        if (updateResult.success) {
          stats.companiesEnriched++

          for (const field of updateResult.fieldsUpdated) {
            if (field in stats.fieldsUpdated) {
              stats.fieldsUpdated[field as keyof FieldUpdateStats]++
            }
          }

          const status = extractionResult.activity_status || 'unknown'
          if (status in stats.activityStatusBreakdown) {
            stats.activityStatusBreakdown[status as keyof ActivityStatusBreakdown]++
          } else {
            stats.activityStatusBreakdown.unknown++
          }

          await releaseEnrichmentLock(company.id)
        } else {
          stats.companiesFailed++
          await releaseEnrichmentLock(company.id)
        }
      } catch (error) {
        stats.companiesFailed++
        const err = createAgentError(error, {
          phase: 'enrich_company',
          itemId: company.id,
          itemName: company.name,
        })
        stats.errors.push(err)
        logger.error(`Failed to enrich ${company.name}`, { error: err.message })

        try {
          await releaseEnrichmentLock(company.id)
        } catch {
          // Ignore
        }
      }
    },
    { batchSize: 5 }
  )

  logger.info(`Batch ${batchNumber} completed`, {
    processed: stats.companiesProcessed,
    enriched: stats.companiesEnriched,
    skipped: stats.companiesSkipped,
    failed: stats.companiesFailed,
    cost: stats.totalCost.toFixed(4),
  })

  return stats
}

/**
 * Aggregate batch stats and finalize run
 */
export async function finalizeCompleterRun(
  runId: string,
  batchStats: CompleterBatchStats[],
  startTime: number
): Promise<CompleterResult> {
  const durationMs = Date.now() - startTime

  // Aggregate all stats
  const aggregated = batchStats.reduce(
    (acc, batch) => ({
      companiesProcessed: acc.companiesProcessed + batch.companiesProcessed,
      companiesEnriched: acc.companiesEnriched + batch.companiesEnriched,
      companiesSkipped: acc.companiesSkipped + batch.companiesSkipped,
      companiesFailed: acc.companiesFailed + batch.companiesFailed,
      totalCost: acc.totalCost + batch.totalCost,
      llmCalls: acc.llmCalls + batch.llmCalls,
      webSearches: acc.webSearches + batch.webSearches,
      totalSources: acc.totalSources + batch.totalSources,
      totalConfidence: acc.totalConfidence + batch.totalConfidence,
      totalCompleteness: acc.totalCompleteness + batch.totalCompleteness,
      fieldsUpdated: {
        industry: acc.fieldsUpdated.industry + batch.fieldsUpdated.industry,
        description: acc.fieldsUpdated.description + batch.fieldsUpdated.description,
        tagline: acc.fieldsUpdated.tagline + batch.fieldsUpdated.tagline,
        useCases: acc.fieldsUpdated.useCases + batch.fieldsUpdated.useCases,
        founders: acc.fieldsUpdated.founders + batch.fieldsUpdated.founders,
        investors: acc.fieldsUpdated.investors + batch.fieldsUpdated.investors,
        headquarters: acc.fieldsUpdated.headquarters + batch.fieldsUpdated.headquarters,
        foundedYear: acc.fieldsUpdated.foundedYear + batch.fieldsUpdated.foundedYear,
        website: acc.fieldsUpdated.website + batch.fieldsUpdated.website,
        linkedin: acc.fieldsUpdated.linkedin + batch.fieldsUpdated.linkedin,
        competitors: acc.fieldsUpdated.competitors + batch.fieldsUpdated.competitors,
        status: acc.fieldsUpdated.status + batch.fieldsUpdated.status,
        employees: acc.fieldsUpdated.employees + batch.fieldsUpdated.employees,
      },
      activityStatusBreakdown: {
        active: acc.activityStatusBreakdown.active + batch.activityStatusBreakdown.active,
        shutdown: acc.activityStatusBreakdown.shutdown + batch.activityStatusBreakdown.shutdown,
        acquired: acc.activityStatusBreakdown.acquired + batch.activityStatusBreakdown.acquired,
        inactive: acc.activityStatusBreakdown.inactive + batch.activityStatusBreakdown.inactive,
        unknown: acc.activityStatusBreakdown.unknown + batch.activityStatusBreakdown.unknown,
      },
      errors: [...acc.errors, ...batch.errors],
    }),
    {
      companiesProcessed: 0,
      companiesEnriched: 0,
      companiesSkipped: 0,
      companiesFailed: 0,
      totalCost: 0,
      llmCalls: 0,
      webSearches: 0,
      totalSources: 0,
      totalConfidence: 0,
      totalCompleteness: 0,
      fieldsUpdated: {
        industry: 0, description: 0, tagline: 0, useCases: 0, founders: 0, investors: 0,
        headquarters: 0, foundedYear: 0, website: 0, linkedin: 0, competitors: 0,
        status: 0, employees: 0,
      },
      activityStatusBreakdown: {
        active: 0, shutdown: 0, acquired: 0, inactive: 0, unknown: 0,
      },
      errors: [] as AgentError[],
    }
  )

  const status =
    aggregated.companiesFailed === 0
      ? 'COMPLETED'
      : aggregated.companiesFailed < aggregated.companiesProcessed / 2
        ? 'PARTIAL'
        : 'FAILED'

  const details: CompleterDetails = {
    companiesProcessed: aggregated.companiesProcessed,
    companiesEnriched: aggregated.companiesEnriched,
    companiesSkipped: aggregated.companiesSkipped,
    companiesFailed: aggregated.companiesFailed,
    fieldsUpdated: aggregated.fieldsUpdated,
    activityStatusBreakdown: aggregated.activityStatusBreakdown,
    avgConfidence: aggregated.companiesEnriched > 0
      ? Math.round(aggregated.totalConfidence / aggregated.companiesEnriched)
      : 0,
    avgDataCompleteness: aggregated.companiesEnriched > 0
      ? Math.round(aggregated.totalCompleteness / aggregated.companiesEnriched)
      : 0,
    avgSourcesPerCompany: aggregated.companiesEnriched > 0
      ? Math.round((aggregated.totalSources / aggregated.companiesEnriched) * 10) / 10
      : 0,
  }

  // Update run record
  await prisma.maintenanceRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      durationMs,
      itemsProcessed: aggregated.companiesProcessed,
      itemsUpdated: aggregated.companiesEnriched,
      itemsSkipped: aggregated.companiesSkipped,
      itemsFailed: aggregated.companiesFailed,
      totalCost: aggregated.totalCost,
      llmCalls: aggregated.llmCalls,
      webSearches: aggregated.webSearches,
      details: details as object,
      errors: aggregated.errors.length > 0 ? (aggregated.errors as object[]) : undefined,
    },
  })

  logger.info('DB_COMPLETER multi-step completed', {
    status,
    durationMs,
    enriched: aggregated.companiesEnriched,
    cost: aggregated.totalCost.toFixed(4),
  })

  return {
    success: status !== 'FAILED',
    status,
    itemsProcessed: aggregated.companiesProcessed,
    itemsUpdated: aggregated.companiesEnriched,
    itemsCreated: 0,
    itemsFailed: aggregated.companiesFailed,
    itemsSkipped: aggregated.companiesSkipped,
    durationMs,
    totalCost: aggregated.totalCost,
    llmCalls: aggregated.llmCalls,
    webSearches: aggregated.webSearches,
    errors: aggregated.errors.length > 0 ? aggregated.errors : undefined,
    details,
  }
}

// ============================================================================
// MAIN AGENT (legacy, still works for single-step)
// ============================================================================

/**
 * Exécute l'agent DB_COMPLETER
 */
export async function runCompleter(runId?: string): Promise<CompleterResult> {
  const startTime = Date.now()
  const errors: AgentError[] = []

  let companiesProcessed = 0
  let companiesEnriched = 0
  let companiesSkipped = 0
  let companiesFailed = 0

  const fieldsUpdated: FieldUpdateStats = {
    industry: 0,
    description: 0,
    tagline: 0,
    useCases: 0,
    founders: 0,
    investors: 0,
    headquarters: 0,
    foundedYear: 0,
    website: 0,
    linkedin: 0,
    competitors: 0,
    status: 0,
    employees: 0,
  }

  const activityStatusBreakdown: ActivityStatusBreakdown = {
    active: 0,
    shutdown: 0,
    acquired: 0,
    inactive: 0,
    unknown: 0,
  }

  let totalConfidence = 0
  let totalCompleteness = 0
  let totalSources = 0
  let totalCost = 0
  let llmCalls = 0
  let webSearches = 0

  logger.info('Starting DB_COMPLETER run', { runId })

  // Reset search metrics for this run
  resetSearchMetrics()

  // Update run status to RUNNING
  if (runId) {
    await prisma.maintenanceRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  try {
    // =========================================================================
    // STEP 1: Select companies to enrich (with locking)
    // =========================================================================
    logger.info('Step 1: Selecting companies to enrich...')
    const companies = await selectCompaniesToEnrich(MAINTENANCE_CONSTANTS.COMPLETER_BATCH_SIZE, runId)
    logger.info(`Selected ${companies.length} companies for enrichment`)

    if (companies.length === 0) {
      logger.info('No companies need enrichment')

      if (runId) {
        await prisma.maintenanceRun.update({
          where: { id: runId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            itemsProcessed: 0,
            itemsSkipped: 0,
          },
        })
      }

      return {
        success: true,
        status: 'COMPLETED',
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsCreated: 0,
        itemsFailed: 0,
        itemsSkipped: 0,
        durationMs: Date.now() - startTime,
        details: {
          companiesProcessed: 0,
          companiesEnriched: 0,
          companiesSkipped: 0,
          companiesFailed: 0,
          fieldsUpdated,
          activityStatusBreakdown,
          avgConfidence: 0,
          avgDataCompleteness: 0,
          avgSourcesPerCompany: 0,
        },
      }
    }

    // =========================================================================
    // STEP 2: Process companies in batches
    // =========================================================================
    logger.info('Step 2: Processing companies...')

    await processBatch(
      companies,
      async (company, index) => {
        companiesProcessed++

        try {
          logger.debug(`Processing ${index + 1}/${companies.length}: ${company.name}`)

          // 2a. Search for information
          const searchResults = await searchWithFallback(company.name)
          webSearches++

          if (searchResults.length === 0) {
            logger.warn(`No search results for ${company.name}`)
            companiesSkipped++
            return
          }

          // 2b. Scrape URLs (sourceUrl + top 3 search results)
          const urlsToScrape = [
            // Get sourceUrl from latest funding round if exists
            ...(company.fundingRounds?.[0]?.sourceUrl ? [company.fundingRounds[0].sourceUrl] : []),
            ...searchResults.slice(0, 3).map((r) => r.url),
          ]

          const scrapedContent = await scrapeUrls(urlsToScrape)
          const successfulScrapes = scrapedContent.filter((s) => s.success)

          if (successfulScrapes.length === 0) {
            logger.warn(`No successful scrapes for ${company.name}`)
            companiesSkipped++
            return
          }

          totalSources += successfulScrapes.length

          // 2c. Combine content for LLM
          const combinedContent = [
            // Include search snippets
            ...searchResults.map((r) => `Source: ${r.title}\n${r.description}`),
            // Include scraped content
            ...successfulScrapes.map((s) => `Source: ${s.title}\n${s.text}`),
          ].join('\n\n---\n\n')

          // 2d. Extract with LLM
          const extractionResponse = await extractWithLLM(company.name, combinedContent)
          llmCalls++

          // Calculate real cost from token usage
          if (extractionResponse.usage) {
            totalCost +=
              (extractionResponse.usage.promptTokens / 1000) * MAINTENANCE_CONSTANTS.DEEPSEEK_COST_PER_1K_INPUT +
              (extractionResponse.usage.completionTokens / 1000) * MAINTENANCE_CONSTANTS.DEEPSEEK_COST_PER_1K_OUTPUT
          }

          if (!extractionResponse.result) {
            logger.warn(`LLM extraction failed for ${company.name}`, {
              error: extractionResponse.error,
            })
            companiesFailed++
            return
          }

          const extractionResult = extractionResponse.result
          totalConfidence += extractionResult.confidence
          totalCompleteness += extractionResult.data_completeness

          // 2e. Validate and update (pass scraped content for activity_status validation)
          const updateResult = await validateAndUpdate(company.id, extractionResult, combinedContent)

          if (updateResult.success) {
            companiesEnriched++

            // Track field updates
            for (const field of updateResult.fieldsUpdated) {
              if (field in fieldsUpdated) {
                fieldsUpdated[field as keyof FieldUpdateStats]++
              }
            }

            // Track activity status
            const status = extractionResult.activity_status || 'unknown'
            if (status in activityStatusBreakdown) {
              activityStatusBreakdown[status as keyof ActivityStatusBreakdown]++
            } else {
              activityStatusBreakdown.unknown++
            }

            // Release lock after successful enrichment
            await releaseEnrichmentLock(company.id)
          } else {
            companiesFailed++
            // Release lock on failure too
            await releaseEnrichmentLock(company.id)
          }
        } catch (error) {
          companiesFailed++
          const err = createAgentError(error, {
            phase: 'enrich_company',
            itemId: company.id,
            itemName: company.name,
          })
          errors.push(err)
          logger.error(`Failed to enrich ${company.name}`, { error: err.message })

          // Release lock on error
          try {
            await releaseEnrichmentLock(company.id)
          } catch {
            // Ignore lock release errors
          }
        }

        // Progress update every 20 companies
        if ((index + 1) % 20 === 0) {
          logger.info(`Progress: ${index + 1}/${companies.length} companies processed`)

          if (runId) {
            await prisma.maintenanceRun.update({
              where: { id: runId },
              data: {
                itemsProcessed: companiesProcessed,
                itemsUpdated: companiesEnriched,
                itemsFailed: companiesFailed,
              },
            })
          }
        }
      },
      {
        batchSize: 5, // Process 5 at a time to avoid rate limits
        onProgress: (processed, total) => {
          logger.debug(`Batch progress: ${processed}/${total}`)
        },
      }
    )

    // =========================================================================
    // FINALIZE
    // =========================================================================
    const durationMs = Date.now() - startTime
    const status =
      companiesFailed === 0
        ? 'COMPLETED'
        : companiesFailed < companiesProcessed / 2
          ? 'PARTIAL'
          : 'FAILED'

    const details: CompleterDetails = {
      companiesProcessed,
      companiesEnriched,
      companiesSkipped,
      companiesFailed,
      fieldsUpdated,
      activityStatusBreakdown,
      avgConfidence: companiesEnriched > 0 ? Math.round(totalConfidence / companiesEnriched) : 0,
      avgDataCompleteness:
        companiesEnriched > 0 ? Math.round(totalCompleteness / companiesEnriched) : 0,
      avgSourcesPerCompany:
        companiesEnriched > 0 ? Math.round((totalSources / companiesEnriched) * 10) / 10 : 0,
    }

    // Log circuit breaker status and search metrics for monitoring
    const braveCircuit = getBraveCircuitStatus()
    const llmCircuit = getLLMCircuitStatus('deepseek-llm')
    const searchMetricsData = getSearchMetrics()

    logger.info('DB_COMPLETER completed', {
      status,
      durationMs,
      enriched: companiesEnriched,
      failed: companiesFailed,
      cost: totalCost.toFixed(4),
      circuitBreakers: {
        brave: { failures: braveCircuit.failures, open: braveCircuit.isOpen },
        llm: { failures: llmCircuit.failures, open: llmCircuit.isOpen },
      },
      searchMetrics: {
        totalSearches: searchMetricsData.totalSearches,
        braveSuccesses: searchMetricsData.braveSuccesses,
        duckDuckGoUsed: searchMetricsData.duckDuckGoUsed,
        fallbackRate: `${(searchMetricsData.fallbackRate * 100).toFixed(1)}%`,
        shouldAlert: searchMetricsData.shouldAlert,
      },
    })

    // Warn if fallback rate is concerning
    if (searchMetricsData.shouldAlert) {
      logger.warn('ALERT: High DuckDuckGo fallback rate detected', {
        fallbackRate: `${(searchMetricsData.fallbackRate * 100).toFixed(1)}%`,
        recommendation: 'Check Brave API status and quota',
      })
    }

    // Update run record
    if (runId) {
      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: {
          status,
          completedAt: new Date(),
          durationMs,
          itemsProcessed: companiesProcessed,
          itemsUpdated: companiesEnriched,
          itemsSkipped: companiesSkipped,
          itemsFailed: companiesFailed,
          totalCost,
          llmCalls,
          webSearches,
          details: details as object,
          errors: errors.length > 0 ? (errors as object[]) : undefined,
        },
      })
    }

    return {
      success: status !== 'FAILED',
      status,
      itemsProcessed: companiesProcessed,
      itemsUpdated: companiesEnriched,
      itemsCreated: 0,
      itemsFailed: companiesFailed,
      itemsSkipped: companiesSkipped,
      durationMs,
      totalCost,
      llmCalls,
      webSearches,
      errors: errors.length > 0 ? errors : undefined,
      details,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const err = createAgentError(error, { phase: 'main' })

    logger.error('DB_COMPLETER failed', { error: err.message })

    // Release all locks held by this run on failure
    if (runId) {
      try {
        const released = await releaseAllLocksForRun(runId)
        if (released > 0) {
          logger.info(`Released ${released} locks after run failure`)
        }
      } catch {
        logger.error('Failed to release locks after run failure')
      }

      await prisma.maintenanceRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs,
          totalCost,
          llmCalls,
          webSearches,
          errors: [err] as object[],
        },
      })
    }

    return {
      success: false,
      status: 'FAILED',
      itemsProcessed: companiesProcessed,
      itemsUpdated: companiesEnriched,
      itemsCreated: 0,
      itemsFailed: companiesFailed + 1,
      itemsSkipped: companiesSkipped,
      durationMs,
      totalCost,
      llmCalls,
      webSearches,
      errors: [err],
      details: {
        companiesProcessed,
        companiesEnriched,
        companiesSkipped,
        companiesFailed,
        fieldsUpdated,
        activityStatusBreakdown,
        avgConfidence: 0,
        avgDataCompleteness: 0,
        avgSourcesPerCompany: 0,
      },
    }
  }
}

export default runCompleter
