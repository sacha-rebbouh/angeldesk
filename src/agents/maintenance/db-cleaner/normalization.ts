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
 */
export async function normalizeAllCountries(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Normalize Company.headquarters
  const companies = await prisma.company.findMany({
    where: { headquarters: { not: null } },
    select: { id: true, headquarters: true },
  })

  for (const company of companies) {
    const normalizedCountry = normalizeCountry(company.headquarters)

    if (normalizedCountry && normalizedCountry !== company.headquarters) {
      await prisma.company.update({
        where: { id: company.id },
        data: { headquarters: normalizedCountry },
      })
      normalized++
    } else {
      skipped++
    }
  }

  // Normalize FundingRound.geography
  const rounds = await prisma.fundingRound.findMany({
    where: { geography: { not: null } },
    select: { id: true, geography: true },
  })

  for (const round of rounds) {
    const normalizedCountry = normalizeCountry(round.geography)

    if (normalizedCountry && normalizedCountry !== round.geography) {
      await prisma.fundingRound.update({
        where: { id: round.id },
        data: { geography: normalizedCountry },
      })
      normalized++
    } else {
      skipped++
    }
  }

  logger.info(`Country normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// STAGE NORMALIZATION
// ============================================================================

/**
 * Normalise tous les stages de funding
 */
export async function normalizeAllStages(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Get rounds with stage but no normalized stage, or mismatched
  const rounds = await prisma.fundingRound.findMany({
    where: { stage: { not: null } },
    select: { id: true, stage: true, stageNormalized: true },
  })

  for (const round of rounds) {
    const normalizedStage = normalizeStage(round.stage)

    if (normalizedStage && normalizedStage !== round.stageNormalized) {
      await prisma.fundingRound.update({
        where: { id: round.id },
        data: { stageNormalized: normalizedStage },
      })
      normalized++
    } else {
      skipped++
    }
  }

  // Also normalize Company.lastRoundStage
  const companies = await prisma.company.findMany({
    where: { lastRoundStage: { not: null } },
    select: { id: true, lastRoundStage: true },
  })

  for (const company of companies) {
    const normalizedStage = normalizeStage(company.lastRoundStage)

    if (normalizedStage && normalizedStage !== company.lastRoundStage) {
      await prisma.company.update({
        where: { id: company.id },
        data: { lastRoundStage: normalizedStage },
      })
      normalized++
    } else {
      skipped++
    }
  }

  logger.info(`Stage normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// INDUSTRY NORMALIZATION
// ============================================================================

/**
 * Normalise toutes les industries selon la taxonomie
 */
export async function normalizeAllIndustries(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  // Normalize Company.industry
  const companies = await prisma.company.findMany({
    where: { industry: { not: null } },
    select: { id: true, industry: true },
  })

  for (const company of companies) {
    const normalizedIndustry = normalizeIndustry(company.industry)

    if (normalizedIndustry && normalizedIndustry !== company.industry) {
      await prisma.company.update({
        where: { id: company.id },
        data: { industry: normalizedIndustry },
      })
      normalized++
    } else if (!normalizedIndustry) {
      // Industry not in taxonomy - log for review
      logger.warn(`Unknown industry: "${company.industry}"`, { companyId: company.id })
      skipped++
    } else {
      skipped++
    }
  }

  // Normalize FundingRound.sector → sectorNormalized
  const rounds = await prisma.fundingRound.findMany({
    where: { sector: { not: null } },
    select: { id: true, sector: true, sectorNormalized: true },
  })

  for (const round of rounds) {
    const normalizedSector = normalizeIndustry(round.sector)

    if (normalizedSector && normalizedSector !== round.sectorNormalized) {
      await prisma.fundingRound.update({
        where: { id: round.id },
        data: { sectorNormalized: normalizedSector },
      })
      normalized++
    } else {
      skipped++
    }
  }

  logger.info(`Industry normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// SLUG NORMALIZATION
// ============================================================================

/**
 * Recalcule les slugs pour toutes les companies
 */
export async function normalizeAllSlugs(): Promise<NormalizationResult> {
  let normalized = 0
  let skipped = 0

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
  })

  // Use a map to detect collisions
  const slugMap = new Map<string, string[]>() // slug -> [company ids]

  for (const company of companies) {
    const expectedSlug = company.name
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

    if (!slugMap.has(expectedSlug)) {
      slugMap.set(expectedSlug, [])
    }
    slugMap.get(expectedSlug)!.push(company.id)

    if (expectedSlug !== company.slug) {
      // Check for conflicts before updating
      const existing = await prisma.company.findFirst({
        where: { slug: expectedSlug, id: { not: company.id } },
      })

      if (!existing) {
        await prisma.company.update({
          where: { id: company.id },
          data: { slug: expectedSlug },
        })
        normalized++
      } else {
        // Collision - add suffix
        const suffixedSlug = `${expectedSlug}-${company.id.slice(0, 6)}`
        await prisma.company.update({
          where: { id: company.id },
          data: { slug: suffixedSlug },
        })
        normalized++
        logger.warn(`Slug collision for "${company.name}", using "${suffixedSlug}"`)
      }
    } else {
      skipped++
    }
  }

  logger.info(`Slug normalization complete`, { normalized, skipped })
  return { normalized, skipped }
}

// ============================================================================
// CURRENCY NORMALIZATION
// ============================================================================

/**
 * Convertit tous les montants en USD
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

  for (const round of rounds) {
    const rate = rates[round.currency] || 1
    const amountUsd = Number(round.amount) * rate

    if (amountUsd !== Number(round.amountUsd)) {
      await prisma.fundingRound.update({
        where: { id: round.id },
        data: { amountUsd },
      })
      normalized++
    } else {
      skipped++
    }
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
