/**
 * DB_COMPLETER - Company Selector
 *
 * Sélectionne les companies à enrichir par priorité avec locking
 * pour éviter les traitements concurrents
 */

import { prisma } from '@/lib/prisma'
import { createLogger } from '../utils'

const logger = createLogger('DB_COMPLETER:selector')

// Lock expires after 1 hour (safety margin for long-running enrichments)
const LOCK_EXPIRY_MS = 60 * 60 * 1000

interface CompanyToEnrich {
  id: string
  name: string
  slug: string
  industry: string | null
  description: string | null
  dataQuality: number | null
  totalRaised: number | null
  lastRoundDate: Date | null
  fundingRounds?: Array<{ sourceUrl: string | null }>
}

/**
 * Sélectionne les companies à enrichir par priorité avec lock
 *
 * Critères de sélection:
 * - dataQuality < 50
 * - OU industry IS NULL
 * - OU description IS NULL
 * - OU status = UNKNOWN
 * - ET pas de lock actif (lock null ou expiré)
 *
 * Ordre de priorité:
 * - totalRaised DESC (plus grosses levées d'abord)
 * - lastRoundDate DESC (plus récentes d'abord)
 */
export async function selectCompaniesToEnrich(
  limit: number,
  runId?: string
): Promise<CompanyToEnrich[]> {
  // Get stale threshold (30 days)
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 30)

  // Lock expiry threshold (1 hour ago)
  const lockExpiryDate = new Date(Date.now() - LOCK_EXPIRY_MS)

  const companies = await prisma.company.findMany({
    where: {
      // Ensure no active lock
      OR: [
        { enrichmentLockedAt: null },
        { enrichmentLockedAt: { lt: lockExpiryDate } }, // Lock expired
      ],
      // And company needs enrichment
      AND: {
        OR: [
          // Low quality data
          { dataQuality: { lt: 50 } },
          { dataQuality: null },
          // Missing critical fields
          { industry: null },
          { description: null },
          // Unknown status
          { status: 'UNKNOWN' },
          // Stale data (not enriched in 30+ days)
          {
            AND: [
              { lastEnrichedAt: { lt: staleDate } },
              { dataQuality: { lt: 80 } }, // Only if quality not already high
            ],
          },
          // Never enriched
          { lastEnrichedAt: null },
        ],
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      description: true,
      dataQuality: true,
      totalRaised: true,
      lastRoundDate: true,
      fundingRounds: {
        select: { sourceUrl: true },
        take: 1,
        orderBy: { fundingDate: 'desc' },
      },
    },
    orderBy: [
      // Prioritize by total raised (bigger companies first)
      { totalRaised: { sort: 'desc', nulls: 'last' } },
      // Then by recency
      { lastRoundDate: { sort: 'desc', nulls: 'last' } },
      // Then by quality (lowest first)
      { dataQuality: { sort: 'asc', nulls: 'first' } },
    ],
    take: limit,
  })

  // Acquire locks on selected companies
  if (companies.length > 0 && runId) {
    const companyIds = companies.map((c) => c.id)
    const now = new Date()

    await prisma.company.updateMany({
      where: {
        id: { in: companyIds },
        // Double-check lock is still available (race condition protection)
        OR: [
          { enrichmentLockedAt: null },
          { enrichmentLockedAt: { lt: lockExpiryDate } },
        ],
      },
      data: {
        enrichmentLockedAt: now,
        enrichmentLockedBy: runId,
      },
    })

    logger.info(`Acquired enrichment lock on ${companies.length} companies`, { runId })
  }

  logger.info(`Selected ${companies.length} companies for enrichment`, {
    withIndustry: companies.filter((c) => c.industry).length,
    withDescription: companies.filter((c) => c.description).length,
    avgQuality:
      companies.length > 0
        ? Math.round(
            companies.reduce((sum, c) => sum + (c.dataQuality || 0), 0) / companies.length
          )
        : 0,
  })

  return companies.map((c) => ({
    ...c,
    totalRaised: c.totalRaised ? Number(c.totalRaised) : null,
  }))
}

/**
 * Libère le lock d'enrichissement d'une company
 */
export async function releaseEnrichmentLock(companyId: string): Promise<void> {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      enrichmentLockedAt: null,
      enrichmentLockedBy: null,
    },
  })
}

/**
 * Libère tous les locks d'un run spécifique
 */
export async function releaseAllLocksForRun(runId: string): Promise<number> {
  const result = await prisma.company.updateMany({
    where: { enrichmentLockedBy: runId },
    data: {
      enrichmentLockedAt: null,
      enrichmentLockedBy: null,
    },
  })

  if (result.count > 0) {
    logger.info(`Released ${result.count} enrichment locks for run ${runId}`)
  }

  return result.count
}

/**
 * Libère les locks expirés (maintenance)
 */
export async function releaseExpiredLocks(): Promise<number> {
  const lockExpiryDate = new Date(Date.now() - LOCK_EXPIRY_MS)

  const result = await prisma.company.updateMany({
    where: {
      AND: [
        { enrichmentLockedAt: { not: null } },
        { enrichmentLockedAt: { lt: lockExpiryDate } },
      ],
    },
    data: {
      enrichmentLockedAt: null,
      enrichmentLockedBy: null,
    },
  })

  if (result.count > 0) {
    logger.warn(`Released ${result.count} expired enrichment locks`)
  }

  return result.count
}

/**
 * Obtient les statistiques de la queue d'enrichissement
 */
export async function getEnrichmentQueueStats(): Promise<{
  totalPending: number
  byPriority: {
    critical: number // No industry and no description
    high: number // No industry OR no description
    medium: number // Low quality
    low: number // Stale
  }
}> {
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - 30)

  const [critical, high, medium, low] = await Promise.all([
    // Critical: no industry AND no description
    prisma.company.count({
      where: {
        industry: null,
        description: null,
      },
    }),
    // High: no industry OR no description
    prisma.company.count({
      where: {
        OR: [{ industry: null }, { description: null }],
        NOT: {
          AND: [{ industry: null }, { description: null }],
        },
      },
    }),
    // Medium: low quality
    prisma.company.count({
      where: {
        dataQuality: { lt: 50 },
        industry: { not: null },
        description: { not: null },
      },
    }),
    // Low: stale
    prisma.company.count({
      where: {
        lastEnrichedAt: { lt: staleDate },
        dataQuality: { gte: 50, lt: 80 },
      },
    }),
  ])

  return {
    totalPending: critical + high + medium + low,
    byPriority: { critical, high, medium, low },
  }
}
