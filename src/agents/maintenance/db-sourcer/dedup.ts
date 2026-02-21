/**
 * DB_SOURCER - Deduplication at Import
 *
 * Vérifie si un funding round existe déjà avant d'importer
 */

import { prisma } from '@/lib/prisma'
import type { ParsedFunding } from '../types'
import { normalizeCompanyName, normalizeStage, normalizeCountry, convertToUSD } from '../utils'

// ============================================================================
// DUPLICATE CHECK
// ============================================================================

/**
 * Vérifie si un funding round existe déjà
 *
 * Un round est un doublon si:
 * - Même company (slug)
 * - Montant similaire (±10%)
 * - Date proche (±7 jours)
 */
export async function checkDuplicate(funding: ParsedFunding): Promise<boolean> {
  const slug = normalizeCompanyName(funding.companyName)

  // Check by source URL first (exact duplicate)
  const existingByUrl = await prisma.fundingRound.findFirst({
    where: { sourceUrl: funding.sourceUrl },
  })

  if (existingByUrl) {
    return true
  }

  // Find company by slug
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { slug },
        { slug: { startsWith: slug } },
        { aliases: { has: funding.companyName } },
      ],
    },
    include: {
      fundingRounds: {
        where: {
          fundingDate: {
            gte: new Date(funding.date.getTime() - 7 * 24 * 60 * 60 * 1000), // -7 days
            lte: new Date(funding.date.getTime() + 7 * 24 * 60 * 60 * 1000), // +7 days
          },
        },
      },
    },
  })

  if (!company) {
    return false // New company, not a duplicate
  }

  // Check funding rounds for similar amounts
  if (funding.amount !== null) {
    const amountUsd = convertToUSD(funding.amount, funding.currency)

    for (const round of company.fundingRounds) {
      const roundAmountUsd = round.amountUsd != null ? Number(round.amountUsd) : null

      if (roundAmountUsd !== null) {
        const minAmount = Math.min(amountUsd, roundAmountUsd)
        const maxAmount = Math.max(amountUsd, roundAmountUsd)
        const diff = (maxAmount - minAmount) / maxAmount

        // Within 10% tolerance
        if (diff <= 0.1) {
          // Check stage if available
          if (funding.stage && round.stageNormalized) {
            if (normalizeStage(funding.stage) === round.stageNormalized) {
              return true // Same company, similar amount, same stage, close date
            }
          } else {
            return true // Same company, similar amount, close date
          }
        }
      }
    }
  }

  // If no amount, check by stage only
  if (funding.amount === null && funding.stage) {
    const normalizedStage = normalizeStage(funding.stage)

    for (const round of company.fundingRounds) {
      if (round.stageNormalized === normalizedStage) {
        return true // Same company, same stage, close date
      }
    }
  }

  return false
}

// ============================================================================
// CREATE COMPANY AND ROUND
// ============================================================================

interface CreateResult {
  companyId: string
  companyCreated: boolean
  roundId: string
  roundCreated: boolean
}

/**
 * Crée ou met à jour une company et son funding round
 */
export async function createCompanyAndRound(
  funding: ParsedFunding,
  sourceName: string
): Promise<CreateResult> {
  const slug = normalizeCompanyName(funding.companyName)

  // Find or create company
  let company = await prisma.company.findFirst({
    where: {
      OR: [{ slug }, { slug: { startsWith: slug } }, { aliases: { has: funding.companyName } }],
    },
  })

  let companyCreated = false
  let roundCreated = false

  if (!company) {
    // Create new company
    company = await prisma.company.create({
      data: {
        name: funding.companyName,
        slug,
        description: funding.description,
        status: 'ACTIVE',
        dataQuality: 20, // Low quality, needs enrichment
      },
    })
    companyCreated = true
  }

  // Calculate USD amount
  const amountUsd = funding.amount != null ? convertToUSD(funding.amount, funding.currency) : null

  // Create funding round
  const round = await prisma.fundingRound.create({
    data: {
      companyId: company.id,
      companyName: funding.companyName,
      companySlug: slug,
      description: funding.description,
      amount: funding.amount,
      amountUsd,
      currency: funding.currency,
      stage: funding.stage,
      stageNormalized: normalizeStage(funding.stage),
      investors: funding.investors,
      leadInvestor: funding.leadInvestor,
      fundingDate: funding.date,
      announcedDate: funding.date,
      source: sourceName,
      sourceUrl: funding.sourceUrl,
      isMigrated: true, // Linked to Company
    },
  })
  roundCreated = true

  // Update company with latest round info
  await prisma.company.update({
    where: { id: company.id },
    data: {
      lastRoundStage: normalizeStage(funding.stage),
      lastRoundDate: funding.date,
      totalRaised: amountUsd
        ? { increment: amountUsd }
        : undefined,
    },
  })

  // Log enrichment
  await prisma.companyEnrichment.create({
    data: {
      companyId: company.id,
      source: 'ARTICLE_IMPORT',
      sourceUrl: funding.sourceUrl,
      sourceDate: funding.date,
      fieldsUpdated: companyCreated
        ? ['name', 'slug', 'description']
        : ['lastRoundStage', 'lastRoundDate', 'totalRaised'],
      newData: {
        roundId: round.id,
        source: sourceName,
        amount: funding.amount,
        stage: funding.stage,
        investors: funding.investors,
      },
      confidence: 70, // Medium confidence for automated import
    },
  })

  return {
    companyId: company.id,
    companyCreated,
    roundId: round.id,
    roundCreated,
  }
}
