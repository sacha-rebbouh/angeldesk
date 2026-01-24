/**
 * DB_CLEANER Agent
 *
 * Agent de nettoyage et maintenance de la base de données.
 * Tâches: déduplication, normalisation, nettoyage des orphelins
 *
 * Fréquence: Dimanche 03:00
 * Coût: ~$0 (pas de LLM)
 *
 * Améliorations v2:
 * - Mode dry-run pour prévisualiser les changements
 * - Transactions atomiques pour garantir la cohérence
 * - Algorithmes de similarité avancés (Jaro-Winkler, Soundex)
 * - Audit trail complet avec CompanyMergeLog
 */

import { prisma } from '@/lib/prisma'
import type {
  CleanerResult,
  CleanerDetails,
  CleanerOptions,
  CleanerPlan,
  CleanerPlanSummary,
  AgentError,
  PlannedNormalization,
  PlannedDeletion,
  PlannedAberrantFix,
} from '../types'
import {
  createLogger,
  createAgentError,
  formatDuration,
  normalizeCountry,
  normalizeStage,
  normalizeIndustry,
} from '../utils'
import {
  deduplicateCompanies,
  deduplicateFundingRounds,
  planCompanyDeduplication,
  planFundingRoundDeduplication,
} from './duplicates'
import {
  normalizeAllCountries,
  normalizeAllStages,
  normalizeAllIndustries,
  planCountryNormalization,
  planStageNormalization,
  planIndustryNormalization,
} from './normalization'
import {
  removeInvalidEntries,
  removeOrphans,
  fixAberrantValues,
  planInvalidEntriesRemoval,
  planOrphansRemoval,
  planAberrantValuesFix,
} from './cleanup'

const logger = createLogger('DB_CLEANER')

// Transaction timeout: 5 minutes (enough for large datasets)
const TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000

// ============================================================================
// MAIN AGENT
// ============================================================================

/**
 * Exécute l'agent DB_CLEANER
 *
 * @param options.dryRun - Si true, retourne un plan sans modifier la DB
 * @param options.runId - ID du MaintenanceRun pour tracking
 * @param options.skipPhases - Phases à ignorer
 */
export async function runCleaner(options: CleanerOptions = {}): Promise<CleanerResult> {
  const { dryRun = false, runId, skipPhases = [] } = options
  const startTime = Date.now()
  const errors: AgentError[] = []

  const details: CleanerDetails = {
    duplicateCompaniesMerged: 0,
    duplicateFundingRoundsMerged: 0,
    invalidEntriesRemoved: 0,
    countriesNormalized: 0,
    stagesNormalized: 0,
    industriesNormalized: 0,
    orphansRemoved: 0,
    aberrantValuesFixed: 0,
  }

  logger.info(`Starting DB_CLEANER run${dryRun ? ' (DRY-RUN)' : ''}`, { runId, skipPhases })

  // Update run status to RUNNING if we have a runId
  if (runId && !dryRun) {
    await prisma.maintenanceRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  // =========================================================================
  // DRY-RUN MODE: Generate plan without modifications
  // =========================================================================
  if (dryRun) {
    try {
      const plan = await generateCleanerPlan(skipPhases)
      const durationMs = Date.now() - startTime

      logger.info('DB_CLEANER dry-run complete', {
        durationMs,
        totalActions: plan.summary.totalCompanyMerges +
          plan.summary.totalFundingRoundMerges +
          plan.summary.totalInvalidCompanies +
          plan.summary.totalInvalidRounds +
          plan.summary.totalCountryNormalizations +
          plan.summary.totalStageNormalizations +
          plan.summary.totalIndustryNormalizations +
          plan.summary.totalAberrantFixes,
      })

      return {
        success: true,
        status: 'COMPLETED',
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsCreated: 0,
        itemsFailed: 0,
        itemsSkipped: 0,
        durationMs,
        details,
        plan,
      }
    } catch (error) {
      const err = createAgentError(error, { phase: 'dry_run' })
      logger.error('DB_CLEANER dry-run failed', { error: err.message })

      return {
        success: false,
        status: 'FAILED',
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsCreated: 0,
        itemsFailed: 1,
        itemsSkipped: 0,
        durationMs: Date.now() - startTime,
        errors: [err],
        details,
      }
    }
  }

  // =========================================================================
  // EXECUTION MODE: Run with atomic transactions
  // =========================================================================
  try {
    // Phase 1 & 2: Deduplication (critical - use individual transactions per merge)
    // These already use transactions internally for each merge operation
    if (!skipPhases.includes('deduplicate_companies')) {
      logger.info('Step 1: Deduplicating companies...')
      try {
        const companyResult = await deduplicateCompanies({ maintenanceRunId: runId })
        details.duplicateCompaniesMerged = companyResult.merged
        logger.info(`Merged ${companyResult.merged} duplicate companies`)
      } catch (error) {
        const err = createAgentError(error, { phase: 'deduplicate_companies' })
        errors.push(err)
        logger.error('Failed to deduplicate companies', { error: err.message })
      }
    }

    if (!skipPhases.includes('deduplicate_rounds')) {
      logger.info('Step 2: Deduplicating funding rounds...')
      try {
        const roundsResult = await deduplicateFundingRounds()
        details.duplicateFundingRoundsMerged = roundsResult.merged
        logger.info(`Merged ${roundsResult.merged} duplicate funding rounds`)
      } catch (error) {
        const err = createAgentError(error, { phase: 'deduplicate_rounds' })
        errors.push(err)
        logger.error('Failed to deduplicate funding rounds', { error: err.message })
      }
    }

    // Phase 3-8: Non-critical operations (can be batched in transaction)
    // These are safe to run together as they don't have complex interdependencies
    await prisma.$transaction(
      async (tx) => {
        // Step 3: Remove invalid entries
        if (!skipPhases.includes('remove_invalid')) {
          logger.info('Step 3: Removing invalid entries...')
          try {
            const invalidResult = await removeInvalidEntriesWithTx(tx)
            details.invalidEntriesRemoved = invalidResult.removed
            logger.info(`Removed ${invalidResult.removed} invalid entries`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'remove_invalid' })
            errors.push(err)
            logger.error('Failed to remove invalid entries', { error: err.message })
          }
        }

        // Step 4: Normalize countries
        if (!skipPhases.includes('normalize_countries')) {
          logger.info('Step 4: Normalizing countries...')
          try {
            const countryResult = await normalizeCountriesWithTx(tx)
            details.countriesNormalized = countryResult.normalized
            logger.info(`Normalized ${countryResult.normalized} countries`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'normalize_countries' })
            errors.push(err)
            logger.error('Failed to normalize countries', { error: err.message })
          }
        }

        // Step 5: Normalize stages
        if (!skipPhases.includes('normalize_stages')) {
          logger.info('Step 5: Normalizing funding stages...')
          try {
            const stageResult = await normalizeStagesWithTx(tx)
            details.stagesNormalized = stageResult.normalized
            logger.info(`Normalized ${stageResult.normalized} stages`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'normalize_stages' })
            errors.push(err)
            logger.error('Failed to normalize stages', { error: err.message })
          }
        }

        // Step 6: Normalize industries
        if (!skipPhases.includes('normalize_industries')) {
          logger.info('Step 6: Normalizing industries...')
          try {
            const industryResult = await normalizeIndustriesWithTx(tx)
            details.industriesNormalized = industryResult.normalized
            logger.info(`Normalized ${industryResult.normalized} industries`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'normalize_industries' })
            errors.push(err)
            logger.error('Failed to normalize industries', { error: err.message })
          }
        }

        // Step 7: Remove orphans
        if (!skipPhases.includes('remove_orphans')) {
          logger.info('Step 7: Removing orphaned records...')
          try {
            const orphanResult = await removeOrphansWithTx(tx)
            details.orphansRemoved = orphanResult.removed
            logger.info(`Removed ${orphanResult.removed} orphaned records`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'remove_orphans' })
            errors.push(err)
            logger.error('Failed to remove orphans', { error: err.message })
          }
        }

        // Step 8: Fix aberrant values
        if (!skipPhases.includes('fix_aberrant')) {
          logger.info('Step 8: Fixing aberrant values...')
          try {
            const aberrantResult = await fixAberrantValuesWithTx(tx)
            details.aberrantValuesFixed = aberrantResult.fixed || 0
            logger.info(`Fixed ${aberrantResult.fixed || 0} aberrant values`)
          } catch (error) {
            const err = createAgentError(error, { phase: 'fix_aberrant' })
            errors.push(err)
            logger.error('Failed to fix aberrant values', { error: err.message })
          }
        }
      },
      {
        maxWait: TRANSACTION_TIMEOUT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      }
    )

    // =========================================================================
    // FINALIZE
    // =========================================================================
    const durationMs = Date.now() - startTime
    const totalProcessed =
      details.duplicateCompaniesMerged +
      details.duplicateFundingRoundsMerged +
      details.invalidEntriesRemoved +
      details.countriesNormalized +
      details.stagesNormalized +
      details.industriesNormalized +
      details.orphansRemoved +
      details.aberrantValuesFixed

    const status = errors.length === 0 ? 'COMPLETED' : errors.length < 4 ? 'PARTIAL' : 'FAILED'

    logger.info('DB_CLEANER completed', {
      status,
      durationMs,
      totalProcessed,
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
          itemsProcessed: totalProcessed,
          itemsUpdated:
            details.countriesNormalized +
            details.stagesNormalized +
            details.industriesNormalized +
            details.aberrantValuesFixed,
          itemsFailed: errors.length,
          details: details as object,
          errors: errors.length > 0 ? (errors as object[]) : undefined,
        },
      })
    }

    return {
      success: status !== 'FAILED',
      status,
      itemsProcessed: totalProcessed,
      itemsUpdated:
        details.countriesNormalized +
        details.stagesNormalized +
        details.industriesNormalized +
        details.aberrantValuesFixed,
      itemsCreated: 0,
      itemsFailed: errors.length,
      itemsSkipped: 0,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
      details,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const err = createAgentError(error, { phase: 'main' })

    logger.error('DB_CLEANER failed', { error: err.message })

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
      details,
    }
  }
}

// ============================================================================
// DRY-RUN PLAN GENERATION
// ============================================================================

/**
 * Generate a complete plan of all changes that would be made
 */
async function generateCleanerPlan(skipPhases: string[]): Promise<CleanerPlan> {
  const plan: CleanerPlan = {
    companyMerges: [],
    fundingRoundMerges: [],
    invalidCompaniesToDelete: [],
    invalidRoundsToDelete: [],
    countryNormalizations: [],
    stageNormalizations: [],
    industryNormalizations: [],
    aberrantValueFixes: [],
    summary: {
      totalCompanyMerges: 0,
      totalFundingRoundMerges: 0,
      totalInvalidCompanies: 0,
      totalInvalidRounds: 0,
      totalCountryNormalizations: 0,
      totalStageNormalizations: 0,
      totalIndustryNormalizations: 0,
      totalAberrantFixes: 0,
      estimatedDuration: '0s',
    },
  }

  // Plan company deduplication
  if (!skipPhases.includes('deduplicate_companies')) {
    const companyPlan = await planCompanyDeduplication()
    plan.companyMerges = companyPlan.plannedMerges
    plan.summary.totalCompanyMerges = companyPlan.candidates
  }

  // Plan funding round deduplication
  if (!skipPhases.includes('deduplicate_rounds')) {
    const roundPlan = await planFundingRoundDeduplication()
    plan.fundingRoundMerges = roundPlan.plannedMerges
    plan.summary.totalFundingRoundMerges = roundPlan.candidates
  }

  // Plan invalid entries removal
  if (!skipPhases.includes('remove_invalid')) {
    const invalidPlan = await planInvalidEntriesRemoval()
    plan.invalidCompaniesToDelete = invalidPlan.companies
    plan.invalidRoundsToDelete = invalidPlan.rounds
    plan.summary.totalInvalidCompanies = invalidPlan.companies.length
    plan.summary.totalInvalidRounds = invalidPlan.rounds.length
  }

  // Plan country normalization
  if (!skipPhases.includes('normalize_countries')) {
    const countryPlan = await planCountryNormalization()
    plan.countryNormalizations = countryPlan
    plan.summary.totalCountryNormalizations = countryPlan.length
  }

  // Plan stage normalization
  if (!skipPhases.includes('normalize_stages')) {
    const stagePlan = await planStageNormalization()
    plan.stageNormalizations = stagePlan
    plan.summary.totalStageNormalizations = stagePlan.length
  }

  // Plan industry normalization
  if (!skipPhases.includes('normalize_industries')) {
    const industryPlan = await planIndustryNormalization()
    plan.industryNormalizations = industryPlan
    plan.summary.totalIndustryNormalizations = industryPlan.length
  }

  // Plan aberrant value fixes
  if (!skipPhases.includes('fix_aberrant')) {
    const aberrantPlan = await planAberrantValuesFix()
    plan.aberrantValueFixes = aberrantPlan
    plan.summary.totalAberrantFixes = aberrantPlan.length
  }

  // Estimate duration based on total operations
  const totalOps =
    plan.summary.totalCompanyMerges * 100 + // ~100ms per merge
    plan.summary.totalFundingRoundMerges * 50 + // ~50ms per merge
    plan.summary.totalInvalidCompanies * 10 + // ~10ms per delete
    plan.summary.totalInvalidRounds * 5 + // ~5ms per delete
    plan.summary.totalCountryNormalizations * 5 + // ~5ms per update
    plan.summary.totalStageNormalizations * 5 +
    plan.summary.totalIndustryNormalizations * 5 +
    plan.summary.totalAberrantFixes * 5

  plan.summary.estimatedDuration = formatDuration(totalOps)

  return plan
}

// ============================================================================
// TRANSACTION-AWARE HELPERS
// ============================================================================

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function removeInvalidEntriesWithTx(tx: TransactionClient) {
  // Simplified version that works within transaction
  let removed = 0

  const invalidCompanies = await tx.company.findMany({
    where: {
      industry: null,
      description: null,
      totalRaised: null,
      fundingRounds: { none: {} },
      enrichments: { none: {} },
    },
    select: { id: true },
  })

  if (invalidCompanies.length > 0) {
    const ids = invalidCompanies.map((c) => c.id)
    await tx.company.deleteMany({ where: { id: { in: ids } } })
    removed += invalidCompanies.length
  }

  // Also remove invalid funding rounds within transaction
  const invalidRounds = await tx.fundingRound.findMany({
    where: {
      amount: null,
      amountUsd: null,
      stage: null,
      investors: { isEmpty: true },
      companyId: null,
    },
    select: { id: true },
  })

  if (invalidRounds.length > 0) {
    const ids = invalidRounds.map((r) => r.id)
    await tx.fundingRound.deleteMany({ where: { id: { in: ids } } })
    removed += invalidRounds.length
  }

  return { removed }
}

async function normalizeCountriesWithTx(tx: TransactionClient) {
  let normalized = 0

  // Normalize Company.headquarters using transaction client
  const companies = await tx.company.findMany({
    where: { headquarters: { not: null } },
    select: { id: true, headquarters: true },
  })

  for (const company of companies) {
    const normalizedCountry = normalizeCountry(company.headquarters)
    if (normalizedCountry && normalizedCountry !== company.headquarters) {
      await tx.company.update({
        where: { id: company.id },
        data: { headquarters: normalizedCountry },
      })
      normalized++
    }
  }

  // Normalize FundingRound.geography using transaction client
  const rounds = await tx.fundingRound.findMany({
    where: { geography: { not: null } },
    select: { id: true, geography: true },
  })

  for (const round of rounds) {
    const normalizedCountry = normalizeCountry(round.geography)
    if (normalizedCountry && normalizedCountry !== round.geography) {
      await tx.fundingRound.update({
        where: { id: round.id },
        data: { geography: normalizedCountry },
      })
      normalized++
    }
  }

  return { normalized, skipped: companies.length + rounds.length - normalized }
}

async function normalizeStagesWithTx(tx: TransactionClient) {
  let normalized = 0

  // Normalize FundingRound stages using transaction client
  const rounds = await tx.fundingRound.findMany({
    where: { stage: { not: null } },
    select: { id: true, stage: true, stageNormalized: true },
  })

  for (const round of rounds) {
    const normalizedStage = normalizeStage(round.stage)
    if (normalizedStage && normalizedStage !== round.stageNormalized) {
      await tx.fundingRound.update({
        where: { id: round.id },
        data: { stageNormalized: normalizedStage },
      })
      normalized++
    }
  }

  // Normalize Company.lastRoundStage using transaction client
  const companies = await tx.company.findMany({
    where: { lastRoundStage: { not: null } },
    select: { id: true, lastRoundStage: true },
  })

  for (const company of companies) {
    const normalizedStage = normalizeStage(company.lastRoundStage)
    if (normalizedStage && normalizedStage !== company.lastRoundStage) {
      await tx.company.update({
        where: { id: company.id },
        data: { lastRoundStage: normalizedStage },
      })
      normalized++
    }
  }

  return { normalized, skipped: rounds.length + companies.length - normalized }
}

async function normalizeIndustriesWithTx(tx: TransactionClient) {
  let normalized = 0

  // Normalize Company.industry using transaction client
  const companies = await tx.company.findMany({
    where: { industry: { not: null } },
    select: { id: true, industry: true },
  })

  for (const company of companies) {
    const normalizedIndustry = normalizeIndustry(company.industry)
    if (normalizedIndustry && normalizedIndustry !== company.industry) {
      await tx.company.update({
        where: { id: company.id },
        data: { industry: normalizedIndustry },
      })
      normalized++
    }
  }

  // Normalize FundingRound.sector using transaction client
  const rounds = await tx.fundingRound.findMany({
    where: { sector: { not: null } },
    select: { id: true, sector: true, sectorNormalized: true },
  })

  for (const round of rounds) {
    const normalizedSector = normalizeIndustry(round.sector)
    if (normalizedSector && normalizedSector !== round.sectorNormalized) {
      await tx.fundingRound.update({
        where: { id: round.id },
        data: { sectorNormalized: normalizedSector },
      })
      normalized++
    }
  }

  return { normalized, skipped: companies.length + rounds.length - normalized }
}

async function removeOrphansWithTx(tx: TransactionClient) {
  let removed = 0

  // Find orphaned funding rounds using raw query within transaction
  // Note: Prisma doesn't support raw queries within transactions directly,
  // so we use a workaround with findMany and filter
  const allRoundsWithCompany = await tx.fundingRound.findMany({
    where: { companyId: { not: null } },
    select: { id: true, companyId: true },
  })

  const companyIds = [...new Set(allRoundsWithCompany.map((r) => r.companyId).filter(Boolean))] as string[]
  const existingCompanies = await tx.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true },
  })
  const existingCompanyIds = new Set(existingCompanies.map((c) => c.id))

  const orphanedRoundIds = allRoundsWithCompany
    .filter((r) => r.companyId && !existingCompanyIds.has(r.companyId))
    .map((r) => r.id)

  if (orphanedRoundIds.length > 0) {
    await tx.fundingRound.deleteMany({ where: { id: { in: orphanedRoundIds } } })
    removed += orphanedRoundIds.length
  }

  // Find orphaned enrichments
  const allEnrichmentsWithCompany = await tx.companyEnrichment.findMany({
    where: { companyId: { not: null } },
    select: { id: true, companyId: true },
  })

  const enrichmentCompanyIds = [...new Set(allEnrichmentsWithCompany.map((e) => e.companyId).filter(Boolean))] as string[]
  const existingEnrichmentCompanies = await tx.company.findMany({
    where: { id: { in: enrichmentCompanyIds } },
    select: { id: true },
  })
  const existingEnrichmentCompanyIds = new Set(existingEnrichmentCompanies.map((c) => c.id))

  const orphanedEnrichmentIds = allEnrichmentsWithCompany
    .filter((e) => e.companyId && !existingEnrichmentCompanyIds.has(e.companyId))
    .map((e) => e.id)

  if (orphanedEnrichmentIds.length > 0) {
    await tx.companyEnrichment.deleteMany({ where: { id: { in: orphanedEnrichmentIds } } })
    removed += orphanedEnrichmentIds.length
  }

  return { removed }
}

async function fixAberrantValuesWithTx(tx: TransactionClient) {
  let fixed = 0
  const currentYear = new Date().getFullYear()

  // Fix foundedYear > currentYear + 1 using transaction client
  const futureYears = await tx.company.updateMany({
    where: { foundedYear: { gt: currentYear + 1 } },
    data: { foundedYear: null },
  })
  fixed += futureYears.count

  // Fix foundedYear < 1900
  const ancientYears = await tx.company.updateMany({
    where: { foundedYear: { lt: 1900 } },
    data: { foundedYear: null },
  })
  fixed += ancientYears.count

  // Fix negative totalRaised
  const negativeTotalRaised = await tx.company.updateMany({
    where: { totalRaised: { lt: 0 } },
    data: { totalRaised: null },
  })
  fixed += negativeTotalRaised.count

  // Fix negative employeeCount
  const negativeEmployees = await tx.company.updateMany({
    where: { employeeCount: { lt: 0 } },
    data: { employeeCount: null },
  })
  fixed += negativeEmployees.count

  // Fix dataQuality out of range
  const outOfRangeQuality = await tx.company.updateMany({
    where: {
      OR: [{ dataQuality: { lt: 0 } }, { dataQuality: { gt: 100 } }],
    },
    data: { dataQuality: null },
  })
  fixed += outOfRangeQuality.count

  // Fix FundingRound negative amounts
  const negativeAmounts = await tx.fundingRound.updateMany({
    where: {
      OR: [{ amount: { lt: 0 } }, { amountUsd: { lt: 0 } }],
    },
    data: { amount: null, amountUsd: null },
  })
  fixed += negativeAmounts.count

  // Fix unrealistic amounts (> $100B)
  const unrealisticAmounts = await tx.fundingRound.updateMany({
    where: { amountUsd: { gt: 100_000_000_000 } },
    data: { amount: null, amountUsd: null },
  })
  fixed += unrealisticAmounts.count

  // Fix future funding dates
  const futureDates = await tx.fundingRound.updateMany({
    where: { fundingDate: { gt: new Date() } },
    data: { fundingDate: null },
  })
  fixed += futureDates.count

  // Fix ancient funding dates (before 1990)
  const ancientDates = await tx.fundingRound.updateMany({
    where: { fundingDate: { lt: new Date('1990-01-01') } },
    data: { fundingDate: null },
  })
  fixed += ancientDates.count

  return { removed: 0, fixed }
}

export default runCleaner
