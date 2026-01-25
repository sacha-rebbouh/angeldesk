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
// MAIN AGENT
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
    founders: 0,
    investors: 0,
    headquarters: 0,
    foundedYear: 0,
    website: 0,
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
