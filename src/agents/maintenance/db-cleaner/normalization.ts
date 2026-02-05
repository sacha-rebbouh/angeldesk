/**
 * DB_CLEANER - Normalization Logic
 *
 * Fonctions pour normaliser les données (pays, stages, industries)
 */

import { prisma } from '@/lib/prisma'
import {
  normalizeCountry,
  normalizeStage,
  normalizeIndustry,
  createLogger,
} from '../utils'
import type { PlannedNormalization } from '../types'

const logger = createLogger('DB_CLEANER:normalization')

interface NormalizationResult {
  normalized: number
  skipped: number
}

// ============================================================================
// COUNTRY NORMALIZATION
// ============================================================================

/**
 * Normalise tous les noms de pays dans Company et FundingRound
 * Uses batched updateMany grouped by normalized value to avoid N+1
 */
export async function normalizeAllCountries(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Normalize Company.headquarters - group by target value
  const companies = await prisma.company.findMany({
    where: { headquarters: { not: null } },
    select: { id: true, headquarters: true },
  })

  const companyUpdateGroups = new Map<string, string[]>() // normalizedCountry -> [companyIds]
  for (const company of companies) {
    const normalizedCountry = normalizeCountry(company.headquarters)
    if (normalizedCountry && normalizedCountry !== company.headquarters) {
      const ids = companyUpdateGroups.get(normalizedCountry) || []
      ids.push(company.id)
      companyUpdateGroups.set(normalizedCountry, ids)
    } else {
      skipped++
    }
  }

  // Batch update companies by normalized country
  const companyUpdates = Array.from(companyUpdateGroups.entries()).map(
    ([normalizedCountry, ids]) =>
      prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { headquarters: normalizedCountry },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(companyUpdates)

  // Normalize FundingRound.geography - group by target value
  const rounds = await prisma.fundingRound.findMany({
    where: { geography: { not: null } },
    select: { id: true, geography: true },
  })

  const roundUpdateGroups = new Map<string, string[]>() // normalizedCountry -> [roundIds]
  for (const round of rounds) {
    const normalizedCountry = normalizeCountry(round.geography)
    if (normalizedCountry && normalizedCountry !== round.geography) {
      const ids = roundUpdateGroups.get(normalizedCountry) || []
      ids.push(round.id)
      roundUpdateGroups.set(normalizedCountry, ids)
    } else {
      skipped++
    }
  }

  // Batch update rounds by normalized country
  const roundUpdates = Array.from(roundUpdateGroups.entries()).map(
    ([normalizedCountry, ids]) =>
      prisma.fundingRound.updateMany({
        where: { id: { in: ids } },
        data: { geography: normalizedCountry },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(roundUpdates)

  logger.info(`Country normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// STAGE NORMALIZATION
// ============================================================================

/**
 * Normalise tous les stages de funding
 * Uses batched updateMany grouped by normalized value to avoid N+1
 */
export async function normalizeAllStages(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Get rounds with stage - group by target normalized value
  const rounds = await prisma.fundingRound.findMany({
    where: { stage: { not: null } },
    select: { id: true, stage: true, stageNormalized: true },
  })

  const roundUpdateGroups = new Map<string, string[]>() // normalizedStage -> [roundIds]
  for (const round of rounds) {
    const normalizedStage = normalizeStage(round.stage)
    if (normalizedStage && normalizedStage !== round.stageNormalized) {
      const ids = roundUpdateGroups.get(normalizedStage) || []
      ids.push(round.id)
      roundUpdateGroups.set(normalizedStage, ids)
    } else {
      skipped++
    }
  }

  // Batch update rounds by normalized stage
  const roundUpdates = Array.from(roundUpdateGroups.entries()).map(
    ([normalizedStage, ids]) =>
      prisma.fundingRound.updateMany({
        where: { id: { in: ids } },
        data: { stageNormalized: normalizedStage },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(roundUpdates)

  // Normalize Company.lastRoundStage - group by target value
  const companies = await prisma.company.findMany({
    where: { lastRoundStage: { not: null } },
    select: { id: true, lastRoundStage: true },
  })

  const companyUpdateGroups = new Map<string, string[]>() // normalizedStage -> [companyIds]
  for (const company of companies) {
    const normalizedStage = normalizeStage(company.lastRoundStage)
    if (normalizedStage && normalizedStage !== company.lastRoundStage) {
      const ids = companyUpdateGroups.get(normalizedStage) || []
      ids.push(company.id)
      companyUpdateGroups.set(normalizedStage, ids)
    } else {
      skipped++
    }
  }

  // Batch update companies by normalized stage
  const companyUpdates = Array.from(companyUpdateGroups.entries()).map(
    ([normalizedStage, ids]) =>
      prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { lastRoundStage: normalizedStage },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(companyUpdates)

  logger.info(`Stage normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// INDUSTRY NORMALIZATION
// ============================================================================

/**
 * Normalise toutes les industries selon la taxonomie
 * Uses batched updateMany grouped by normalized value to avoid N+1
 */
export async function normalizeAllIndustries(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Normalize Company.industry - group by target value
  const companies = await prisma.company.findMany({
    where: { industry: { not: null } },
    select: { id: true, industry: true },
  })

  const companyUpdateGroups = new Map<string, string[]>() // normalizedIndustry -> [companyIds]
  const unknownIndustries: Array<{ companyId: string; industry: string }> = []

  for (const company of companies) {
    const normalizedIndustry = normalizeIndustry(company.industry)
    if (normalizedIndustry && normalizedIndustry !== company.industry) {
      const ids = companyUpdateGroups.get(normalizedIndustry) || []
      ids.push(company.id)
      companyUpdateGroups.set(normalizedIndustry, ids)
    } else if (!normalizedIndustry) {
      unknownIndustries.push({ companyId: company.id, industry: company.industry! })
      skipped++
    } else {
      skipped++
    }
  }

  // Log unknown industries in batch (avoid log spam)
  if (unknownIndustries.length > 0) {
    logger.warn(`Unknown industries found: ${unknownIndustries.length} records`, {
      samples: unknownIndustries.slice(0, 10).map(u => u.industry),
    })
  }

  // Batch update companies by normalized industry
  const companyUpdates = Array.from(companyUpdateGroups.entries()).map(
    ([normalizedIndustry, ids]) =>
      prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { industry: normalizedIndustry },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(companyUpdates)

  // Normalize FundingRound.sector → sectorNormalized - group by target value
  const rounds = await prisma.fundingRound.findMany({
    where: { sector: { not: null } },
    select: { id: true, sector: true, sectorNormalized: true },
  })

  const roundUpdateGroups = new Map<string, string[]>() // normalizedSector -> [roundIds]
  for (const round of rounds) {
    const normalizedSector = normalizeIndustry(round.sector)
    if (normalizedSector && normalizedSector !== round.sectorNormalized) {
      const ids = roundUpdateGroups.get(normalizedSector) || []
      ids.push(round.id)
      roundUpdateGroups.set(normalizedSector, ids)
    } else {
      skipped++
    }
  }

  // Batch update rounds by normalized sector
  const roundUpdates = Array.from(roundUpdateGroups.entries()).map(
    ([normalizedSector, ids]) =>
      prisma.fundingRound.updateMany({
        where: { id: { in: ids } },
        data: { sectorNormalized: normalizedSector },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(roundUpdates)

  logger.info(`Industry normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// SLUG NORMALIZATION
// ============================================================================

/**
 * Recalcule les slugs pour toutes les companies
 * Uses batched updates with pre-computed collision detection to avoid N+1
 */
export async function normalizeAllSlugs(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
  })

  // Helper to compute slug
  const computeSlug = (name: string): string =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(
        /\b(sas|sarl|sa|sasu|eurl|inc|incorporated|ltd|limited|llc|gmbh|ag|bv|nv|plc|corp|corporation|co|company)\b\.?/gi,
        ''
      )
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim()

  // Pre-compute all expected slugs and detect collisions locally
  const slugToCompanyIds = new Map<string, string[]>() // expectedSlug -> [company ids that want it]
  const companyExpectedSlug = new Map<string, string>() // companyId -> expectedSlug

  for (const company of companies) {
    const expectedSlug = computeSlug(company.name)
    companyExpectedSlug.set(company.id, expectedSlug)

    if (expectedSlug !== company.slug) {
      const ids = slugToCompanyIds.get(expectedSlug) || []
      ids.push(company.id)
      slugToCompanyIds.set(expectedSlug, ids)
    } else {
      skipped++
    }
  }

  // Build existing slugs set for collision detection
  const existingSlugs = new Set(companies.map(c => c.slug))

  // Group updates: no collision (can batch by slug) vs collision (need suffix)
  const noCollisionUpdates = new Map<string, string[]>() // slug -> [companyIds]
  const collisionUpdates: Array<{ id: string; slug: string }> = []
  const collisionLogs: string[] = []

  for (const [expectedSlug, companyIds] of slugToCompanyIds.entries()) {
    // If multiple companies want the same slug, first one wins, others get suffix
    const [firstId, ...restIds] = companyIds

    // Check if slug exists (owned by another company not in our update list)
    const slugExistsElsewhere = existingSlugs.has(expectedSlug) &&
      !companyIds.some(id => companies.find(c => c.id === id && c.slug === expectedSlug))

    if (slugExistsElsewhere) {
      // All need suffix
      for (const id of companyIds) {
        const suffixedSlug = `${expectedSlug}-${id.slice(0, 6)}`
        collisionUpdates.push({ id, slug: suffixedSlug })
        collisionLogs.push(suffixedSlug)
      }
    } else {
      // First one gets the slug
      const ids = noCollisionUpdates.get(expectedSlug) || []
      ids.push(firstId)
      noCollisionUpdates.set(expectedSlug, ids)

      // Rest get suffixed slugs
      for (const id of restIds) {
        const suffixedSlug = `${expectedSlug}-${id.slice(0, 6)}`
        collisionUpdates.push({ id, slug: suffixedSlug })
        collisionLogs.push(suffixedSlug)
      }
    }
  }

  // Log collisions in batch
  if (collisionLogs.length > 0) {
    logger.warn(`Slug collisions resolved: ${collisionLogs.length} records`, {
      samples: collisionLogs.slice(0, 10),
    })
  }

  // Batch update - no collision (grouped by slug)
  const batchUpdates = Array.from(noCollisionUpdates.entries()).map(
    ([slug, ids]) =>
      prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { slug },
      }).then(result => { normalized += result.count })
  )
  await Promise.all(batchUpdates)

  // Batch update - collisions (each needs unique slug, use transaction)
  const BATCH_SIZE = 100
  for (let i = 0; i < collisionUpdates.length; i += BATCH_SIZE) {
    const chunk = collisionUpdates.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      chunk.map(({ id, slug }) =>
        prisma.company.update({
          where: { id },
          data: { slug },
        })
      )
    )
    normalized += chunk.length
  }

  logger.info(`Slug normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// CURRENCY NORMALIZATION
// ============================================================================

/**
 * Convertit tous les montants en USD
 * Uses batched updates grouped by currency to avoid N+1
 */
export async function normalizeAllCurrencies(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Exchange rates (approximate - in production use an API)
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.27,
    CHF: 1.12,
    CAD: 0.74,
    AUD: 0.65,
  }

  const rounds = await prisma.fundingRound.findMany({
    where: {
      amount: { not: null },
      OR: [
        { amountUsd: null },
        { currency: { not: 'USD' } },
      ],
    },
    select: { id: true, amount: true, currency: true, amountUsd: true },
  })

  // Group updates by computed amountUsd (same amount can be batched)
  // For currency normalization, each record likely has a unique amountUsd
  // so we batch by chunks instead
  const BATCH_SIZE = 100
  const toUpdate: Array<{ id: string; amountUsd: number }> = []

  for (const round of rounds) {
    const rate = rates[round.currency] || 1
    const amountUsd = Number(round.amount) * rate

    if (amountUsd !== Number(round.amountUsd)) {
      toUpdate.push({ id: round.id, amountUsd })
    } else {
      skipped++
    }
  }

  // Batch update in chunks using transaction
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      chunk.map(({ id, amountUsd }) =>
        prisma.fundingRound.update({
          where: { id },
          data: { amountUsd },
        })
      )
    )
    normalized += chunk.length
  }

  logger.info(`Currency normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// PLANNING FUNCTIONS (for dry-run mode)
// ============================================================================

/**
 * Plan country normalizations without executing
 */
export async function planCountryNormalization(): Promise<PlannedNormalization[]> {
  const planned: PlannedNormalization[] = []

  // Plan Company.headquarters normalization
  const companies = await prisma.company.findMany({
    where: { headquarters: { not: null } },
    select: { id: true, name: true, headquarters: true },
  })

  for (const company of companies) {
    const normalized = normalizeCountry(company.headquarters)
    if (normalized && normalized !== company.headquarters) {
      planned.push({
        id: company.id,
        name: company.name,
        field: 'headquarters',
        currentValue: company.headquarters!,
        newValue: normalized,
      })
    }
  }

  // Plan FundingRound.geography normalization
  const rounds = await prisma.fundingRound.findMany({
    where: { geography: { not: null } },
    select: { id: true, geography: true, companyName: true },
  })

  for (const round of rounds) {
    const normalized = normalizeCountry(round.geography)
    if (normalized && normalized !== round.geography) {
      planned.push({
        id: round.id,
        name: round.companyName,
        field: 'geography',
        currentValue: round.geography!,
        newValue: normalized,
      })
    }
  }

  return planned
}

/**
 * Plan stage normalizations without executing
 */
export async function planStageNormalization(): Promise<PlannedNormalization[]> {
  const planned: PlannedNormalization[] = []

  // Plan FundingRound.stage normalization
  const rounds = await prisma.fundingRound.findMany({
    where: { stage: { not: null } },
    select: { id: true, stage: true, stageNormalized: true, companyName: true },
  })

  for (const round of rounds) {
    const normalized = normalizeStage(round.stage)
    if (normalized && normalized !== round.stageNormalized) {
      planned.push({
        id: round.id,
        name: round.companyName,
        field: 'stageNormalized',
        currentValue: round.stageNormalized || round.stage!,
        newValue: normalized,
      })
    }
  }

  // Plan Company.lastRoundStage normalization
  const companies = await prisma.company.findMany({
    where: { lastRoundStage: { not: null } },
    select: { id: true, name: true, lastRoundStage: true },
  })

  for (const company of companies) {
    const normalized = normalizeStage(company.lastRoundStage)
    if (normalized && normalized !== company.lastRoundStage) {
      planned.push({
        id: company.id,
        name: company.name,
        field: 'lastRoundStage',
        currentValue: company.lastRoundStage!,
        newValue: normalized,
      })
    }
  }

  return planned
}

/**
 * Plan industry normalizations without executing
 */
export async function planIndustryNormalization(): Promise<PlannedNormalization[]> {
  const planned: PlannedNormalization[] = []

  // Plan Company.industry normalization
  const companies = await prisma.company.findMany({
    where: { industry: { not: null } },
    select: { id: true, name: true, industry: true },
  })

  for (const company of companies) {
    const normalized = normalizeIndustry(company.industry)
    if (normalized && normalized !== company.industry) {
      planned.push({
        id: company.id,
        name: company.name,
        field: 'industry',
        currentValue: company.industry!,
        newValue: normalized,
      })
    }
  }

  // Plan FundingRound.sector normalization
  const rounds = await prisma.fundingRound.findMany({
    where: { sector: { not: null } },
    select: { id: true, sector: true, sectorNormalized: true, companyName: true },
  })

  for (const round of rounds) {
    const normalized = normalizeIndustry(round.sector)
    if (normalized && normalized !== round.sectorNormalized) {
      planned.push({
        id: round.id,
        name: round.companyName,
        field: 'sectorNormalized',
        currentValue: round.sectorNormalized || round.sector!,
        newValue: normalized,
      })
    }
  }

  return planned
}
