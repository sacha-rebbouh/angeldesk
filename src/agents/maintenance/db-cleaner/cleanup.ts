/**
 * DB_CLEANER - Cleanup Logic
 *
 * Fonctions pour nettoyer les données invalides, orphelines et aberrantes
 */

import { prisma } from '@/lib/prisma'
import { createLogger } from '../utils'
import type { PlannedDeletion, PlannedAberrantFix } from '../types'

const logger = createLogger('DB_CLEANER:cleanup')

interface CleanupResult {
  removed: number
  fixed?: number
}

// ============================================================================
// INVALID ENTRIES REMOVAL
// ============================================================================

/**
 * Supprime les entrées invalides (companies sans données utiles)
 *
 * Une company est invalide si:
 * - Pas d'industry ET pas de description ET pas de totalRaised
 * - ET aucun funding round associé
 */
export async function removeInvalidEntries(): Promise<CleanupResult> {
  let removed = 0

  // Find companies with no useful data
  const invalidCompanies = await prisma.company.findMany({
    where: {
      industry: null,
      description: null,
      totalRaised: null,
      fundingRounds: { none: {} },
      enrichments: { none: {} },
    },
    select: { id: true, name: true },
  })

  if (invalidCompanies.length > 0) {
    logger.info(`Found ${invalidCompanies.length} invalid companies to remove`)

    // Delete in batches
    const batchSize = 100
    for (let i = 0; i < invalidCompanies.length; i += batchSize) {
      const batch = invalidCompanies.slice(i, i + batchSize)
      const ids = batch.map((c) => c.id)

      await prisma.company.deleteMany({
        where: { id: { in: ids } },
      })

      removed += batch.length
    }
  }

  // Also remove funding rounds with no useful data
  const invalidRounds = await prisma.fundingRound.findMany({
    where: {
      amount: null,
      amountUsd: null,
      stage: null,
      investors: { isEmpty: true },
      companyId: null, // Orphaned
    },
    select: { id: true },
  })

  if (invalidRounds.length > 0) {
    const ids = invalidRounds.map((r) => r.id)
    await prisma.fundingRound.deleteMany({
      where: { id: { in: ids } },
    })

    removed += invalidRounds.length
    logger.info(`Removed ${invalidRounds.length} invalid funding rounds`)
  }

  logger.info(`Invalid entries removal complete`, { removed })
  return { removed }
}

// ============================================================================
// ORPHAN REMOVAL
// ============================================================================

/**
 * Supprime les enregistrements orphelins
 *
 * - FundingRounds sans Company valide
 * - CompanyEnrichments sans Company
 */
export async function removeOrphans(): Promise<CleanupResult> {
  let removed = 0

  // Find orphaned funding rounds (companyId points to non-existent company)
  // Note: With proper foreign keys this shouldn't happen, but check anyway
  const orphanedRounds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT fr.id
    FROM "FundingRound" fr
    LEFT JOIN "Company" c ON fr."companyId" = c.id
    WHERE fr."companyId" IS NOT NULL AND c.id IS NULL
  `

  if (orphanedRounds.length > 0) {
    const ids = orphanedRounds.map((r) => r.id)
    await prisma.fundingRound.deleteMany({
      where: { id: { in: ids } },
    })

    removed += orphanedRounds.length
    logger.info(`Removed ${orphanedRounds.length} orphaned funding rounds`)
  }

  // Find orphaned enrichments
  const orphanedEnrichments = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ce.id
    FROM "CompanyEnrichment" ce
    LEFT JOIN "Company" c ON ce."companyId" = c.id
    WHERE c.id IS NULL
  `

  if (orphanedEnrichments.length > 0) {
    const ids = orphanedEnrichments.map((e) => e.id)
    await prisma.companyEnrichment.deleteMany({
      where: { id: { in: ids } },
    })

    removed += orphanedEnrichments.length
    logger.info(`Removed ${orphanedEnrichments.length} orphaned enrichments`)
  }

  logger.info(`Orphan removal complete`, { removed })
  return { removed }
}

// ============================================================================
// ABERRANT VALUES
// ============================================================================

/**
 * Corrige les valeurs aberrantes
 *
 * - foundedYear > currentYear ou < 1900
 * - totalRaised < 0
 * - employeeCount < 0
 * - dataQuality < 0 ou > 100
 */
export async function fixAberrantValues(): Promise<CleanupResult> {
  let fixed = 0
  const currentYear = new Date().getFullYear()

  // Fix foundedYear > currentYear + 1
  const futureYears = await prisma.company.updateMany({
    where: {
      foundedYear: { gt: currentYear + 1 },
    },
    data: { foundedYear: null },
  })
  fixed += futureYears.count
  if (futureYears.count > 0) {
    logger.info(`Fixed ${futureYears.count} companies with future foundedYear`)
  }

  // Fix foundedYear < 1900
  const ancientYears = await prisma.company.updateMany({
    where: {
      foundedYear: { lt: 1900 },
    },
    data: { foundedYear: null },
  })
  fixed += ancientYears.count
  if (ancientYears.count > 0) {
    logger.info(`Fixed ${ancientYears.count} companies with ancient foundedYear`)
  }

  // Fix negative totalRaised
  const negativeTotalRaised = await prisma.company.updateMany({
    where: {
      totalRaised: { lt: 0 },
    },
    data: { totalRaised: null },
  })
  fixed += negativeTotalRaised.count
  if (negativeTotalRaised.count > 0) {
    logger.info(`Fixed ${negativeTotalRaised.count} companies with negative totalRaised`)
  }

  // Fix negative employeeCount
  const negativeEmployees = await prisma.company.updateMany({
    where: {
      employeeCount: { lt: 0 },
    },
    data: { employeeCount: null },
  })
  fixed += negativeEmployees.count

  // Fix dataQuality out of range
  const outOfRangeQuality = await prisma.company.updateMany({
    where: {
      OR: [{ dataQuality: { lt: 0 } }, { dataQuality: { gt: 100 } }],
    },
    data: { dataQuality: null },
  })
  fixed += outOfRangeQuality.count

  // Fix FundingRound aberrant values
  const negativeAmounts = await prisma.fundingRound.updateMany({
    where: {
      OR: [{ amount: { lt: 0 } }, { amountUsd: { lt: 0 } }],
    },
    data: { amount: null, amountUsd: null },
  })
  fixed += negativeAmounts.count

  // Fix unrealistic amounts (> $100B for a single round)
  const unrealisticAmounts = await prisma.fundingRound.updateMany({
    where: {
      amountUsd: { gt: 100_000_000_000 },
    },
    data: { amount: null, amountUsd: null },
  })
  fixed += unrealisticAmounts.count
  if (unrealisticAmounts.count > 0) {
    logger.info(`Fixed ${unrealisticAmounts.count} funding rounds with unrealistic amounts`)
  }

  // Fix future funding dates
  const futureDates = await prisma.fundingRound.updateMany({
    where: {
      fundingDate: { gt: new Date() },
    },
    data: { fundingDate: null },
  })
  fixed += futureDates.count

  // Fix ancient funding dates (before 1990)
  const ancientDates = await prisma.fundingRound.updateMany({
    where: {
      fundingDate: { lt: new Date('1990-01-01') },
    },
    data: { fundingDate: null },
  })
  fixed += ancientDates.count

  logger.info(`Aberrant values fix complete`, { fixed })
  return { removed: 0, fixed }
}

// ============================================================================
// DATA QUALITY RECALCULATION
// ============================================================================

/**
 * Recalcule le dataQuality score pour toutes les companies
 */
export async function recalculateDataQuality(): Promise<CleanupResult> {
  let fixed = 0

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      industry: true,
      description: true,
      website: true,
      headquarters: true,
      foundedYear: true,
      founders: true,
      totalRaised: true,
      status: true,
      dataQuality: true,
      _count: {
        select: {
          fundingRounds: true,
          enrichments: true,
        },
      },
    },
  })

  for (const company of companies) {
    const score = calculateDataQuality(company)

    if (score !== company.dataQuality) {
      await prisma.company.update({
        where: { id: company.id },
        data: { dataQuality: score },
      })
      fixed++
    }
  }

  logger.info(`Data quality recalculation complete`, { fixed })
  return { removed: 0, fixed }
}

/**
 * Calcule le score de qualité des données (0-100)
 */
function calculateDataQuality(company: {
  name: string | null
  industry: string | null
  description: string | null
  website: string | null
  headquarters: string | null
  foundedYear: number | null
  founders: unknown
  totalRaised: unknown
  status: string
  _count: {
    fundingRounds: number
    enrichments: number
  }
}): number {
  let score = 0
  const maxScore = 100

  // Essential fields (60 points total)
  if (company.name) score += 5
  if (company.industry) score += 15
  if (company.description) score += 15
  if (company.headquarters) score += 10
  if (company.totalRaised) score += 15

  // Important fields (25 points total)
  if (company.website) score += 5
  if (company.foundedYear) score += 5
  if (company.founders && Array.isArray(company.founders) && company.founders.length > 0) {
    score += 10
  }
  if (company.status && company.status !== 'UNKNOWN') score += 5

  // Bonus points (15 points total)
  if (company._count.fundingRounds > 0) {
    score += Math.min(company._count.fundingRounds * 2, 10)
  }
  if (company._count.enrichments > 0) {
    score += Math.min(company._count.enrichments, 5)
  }

  return Math.min(score, maxScore)
}

// ============================================================================
// STALE DATA MARKING
// ============================================================================

/**
 * Marque les companies avec des données obsolètes (>30 jours sans enrichissement)
 */
export async function markStaleCompanies(): Promise<CleanupResult> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const staleCompanies = await prisma.company.count({
    where: {
      OR: [
        { lastEnrichedAt: null },
        { lastEnrichedAt: { lt: thirtyDaysAgo } },
      ],
    },
  })

  logger.info(`Found ${staleCompanies} stale companies (>30 days without enrichment)`)

  return { removed: 0, fixed: staleCompanies }
}

// ============================================================================
// PLANNING FUNCTIONS (for dry-run mode)
// ============================================================================

/**
 * Plan invalid entries removal without executing
 */
export async function planInvalidEntriesRemoval(): Promise<{
  companies: PlannedDeletion[]
  rounds: PlannedDeletion[]
}> {
  const companies: PlannedDeletion[] = []
  const rounds: PlannedDeletion[] = []

  // Find invalid companies
  const invalidCompanies = await prisma.company.findMany({
    where: {
      industry: null,
      description: null,
      totalRaised: null,
      fundingRounds: { none: {} },
      enrichments: { none: {} },
    },
    select: { id: true, name: true },
  })

  for (const company of invalidCompanies) {
    companies.push({
      id: company.id,
      name: company.name,
      reason: 'No industry, description, totalRaised, funding rounds, or enrichments',
    })
  }

  // Find invalid funding rounds
  const invalidRounds = await prisma.fundingRound.findMany({
    where: {
      amount: null,
      amountUsd: null,
      stage: null,
      investors: { isEmpty: true },
      companyId: null,
    },
    select: { id: true, companyName: true },
  })

  for (const round of invalidRounds) {
    rounds.push({
      id: round.id,
      name: round.companyName,
      reason: 'No amount, stage, investors, or linked company',
    })
  }

  return { companies, rounds }
}

/**
 * Plan orphan removal without executing
 */
export async function planOrphansRemoval(): Promise<{
  rounds: PlannedDeletion[]
  enrichments: PlannedDeletion[]
}> {
  const rounds: PlannedDeletion[] = []
  const enrichments: PlannedDeletion[] = []

  // Find orphaned funding rounds
  const orphanedRounds = await prisma.$queryRaw<{ id: string; companyName: string }[]>`
    SELECT fr.id, fr."companyName"
    FROM "FundingRound" fr
    LEFT JOIN "Company" c ON fr."companyId" = c.id
    WHERE fr."companyId" IS NOT NULL AND c.id IS NULL
  `

  for (const round of orphanedRounds) {
    rounds.push({
      id: round.id,
      name: round.companyName,
      reason: 'Linked company no longer exists',
    })
  }

  // Find orphaned enrichments
  const orphanedEnrichments = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ce.id
    FROM "CompanyEnrichment" ce
    LEFT JOIN "Company" c ON ce."companyId" = c.id
    WHERE c.id IS NULL
  `

  for (const enrichment of orphanedEnrichments) {
    enrichments.push({
      id: enrichment.id,
      name: 'Unknown',
      reason: 'Linked company no longer exists',
    })
  }

  return { rounds, enrichments }
}

/**
 * Plan aberrant value fixes without executing
 */
export async function planAberrantValuesFix(): Promise<PlannedAberrantFix[]> {
  const fixes: PlannedAberrantFix[] = []
  const currentYear = new Date().getFullYear()

  // Future foundedYear
  const futureYears = await prisma.company.findMany({
    where: { foundedYear: { gt: currentYear + 1 } },
    select: { id: true, name: true, foundedYear: true },
  })

  for (const company of futureYears) {
    fixes.push({
      id: company.id,
      name: company.name,
      field: 'foundedYear',
      currentValue: company.foundedYear,
      action: 'set_null',
      reason: `Year ${company.foundedYear} is in the future`,
    })
  }

  // Ancient foundedYear
  const ancientYears = await prisma.company.findMany({
    where: { foundedYear: { lt: 1900 } },
    select: { id: true, name: true, foundedYear: true },
  })

  for (const company of ancientYears) {
    fixes.push({
      id: company.id,
      name: company.name,
      field: 'foundedYear',
      currentValue: company.foundedYear,
      action: 'set_null',
      reason: `Year ${company.foundedYear} is before 1900`,
    })
  }

  // Negative totalRaised
  const negativeTotalRaised = await prisma.company.findMany({
    where: { totalRaised: { lt: 0 } },
    select: { id: true, name: true, totalRaised: true },
  })

  for (const company of negativeTotalRaised) {
    fixes.push({
      id: company.id,
      name: company.name,
      field: 'totalRaised',
      currentValue: Number(company.totalRaised),
      action: 'set_null',
      reason: 'Negative value',
    })
  }

  // Negative employeeCount
  const negativeEmployees = await prisma.company.findMany({
    where: { employeeCount: { lt: 0 } },
    select: { id: true, name: true, employeeCount: true },
  })

  for (const company of negativeEmployees) {
    fixes.push({
      id: company.id,
      name: company.name,
      field: 'employeeCount',
      currentValue: company.employeeCount,
      action: 'set_null',
      reason: 'Negative value',
    })
  }

  // Out of range dataQuality
  const outOfRangeQuality = await prisma.company.findMany({
    where: {
      OR: [{ dataQuality: { lt: 0 } }, { dataQuality: { gt: 100 } }],
    },
    select: { id: true, name: true, dataQuality: true },
  })

  for (const company of outOfRangeQuality) {
    fixes.push({
      id: company.id,
      name: company.name,
      field: 'dataQuality',
      currentValue: company.dataQuality,
      action: 'set_null',
      reason: `Value ${company.dataQuality} is out of range [0-100]`,
    })
  }

  // Unrealistic funding amounts (> $100B)
  const unrealisticAmounts = await prisma.fundingRound.findMany({
    where: { amountUsd: { gt: 100_000_000_000 } },
    select: { id: true, companyName: true, amountUsd: true },
  })

  for (const round of unrealisticAmounts) {
    fixes.push({
      id: round.id,
      name: round.companyName,
      field: 'amountUsd',
      currentValue: Number(round.amountUsd),
      action: 'set_null',
      reason: 'Amount > $100B is unrealistic for a single round',
    })
  }

  // Future funding dates
  const futureDates = await prisma.fundingRound.findMany({
    where: { fundingDate: { gt: new Date() } },
    select: { id: true, companyName: true, fundingDate: true },
  })

  for (const round of futureDates) {
    fixes.push({
      id: round.id,
      name: round.companyName,
      field: 'fundingDate',
      currentValue: round.fundingDate?.toISOString() || null,
      action: 'set_null',
      reason: 'Date is in the future',
    })
  }

  return fixes
}
