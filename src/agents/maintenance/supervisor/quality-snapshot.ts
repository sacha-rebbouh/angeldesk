/**
 * SUPERVISOR - Quality Snapshot
 *
 * Capture les métriques de qualité de la base de données
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { DataQualityMetrics, ActivityStatusBreakdown } from '../types'
import { createLogger } from '../utils'

const logger = createLogger('SUPERVISOR:quality-snapshot')

/**
 * Capture un snapshot des métriques de qualité
 */
export async function captureQualitySnapshot(
  trigger: string,
  relatedRunId?: string
): Promise<DataQualityMetrics> {
  logger.info(`Capturing quality snapshot (trigger: ${trigger})`)

  // Count totals
  const [
    totalCompanies,
    totalFundingRounds,
    withIndustry,
    withDescription,
    withFounders,
    withWebsite,
    withInvestors,
    statusActive,
    statusShutdown,
    statusAcquired,
    statusInactive,
    statusUnknown,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.fundingRound.count(),
    prisma.company.count({ where: { industry: { not: null } } }),
    prisma.company.count({ where: { description: { not: null } } }),
    prisma.company.count({
      where: {
        NOT: { founders: { equals: Prisma.JsonNull } },
        // Check if founders is not null
      },
    }),
    prisma.company.count({ where: { website: { not: null } } }),
    // Companies with at least one funding round with investors
    prisma.company.count({
      where: {
        fundingRounds: {
          some: {
            investors: { isEmpty: false },
          },
        },
      },
    }),
    prisma.company.count({ where: { status: 'ACTIVE' } }),
    prisma.company.count({ where: { status: 'SHUTDOWN' } }),
    prisma.company.count({ where: { status: 'ACQUIRED' } }),
    prisma.company.count({ where: { status: 'INACTIVE' } }),
    prisma.company.count({ where: { status: 'UNKNOWN' } }),
  ])

  // Calculate stale companies (not enriched in 30+ days)
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

  // Calculate duplicates (approximate - companies with same slug prefix)
  const duplicates = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM (
      SELECT slug, COUNT(*) as cnt
      FROM "Company"
      GROUP BY slug
      HAVING COUNT(*) > 1
    ) as dups
  `
  const duplicateCount = Number(duplicates[0]?.count || 0)

  // Count orphaned funding rounds
  const orphanedRounds = await prisma.fundingRound.count({
    where: { companyId: null },
  })

  // Calculate average data quality
  const avgQualityResult = await prisma.company.aggregate({
    _avg: { dataQuality: true },
  })
  const avgDataQuality = avgQualityResult._avg.dataQuality || 0

  // Calculate percentages
  const safeDiv = (num: number, denom: number) => (denom > 0 ? (num / denom) * 100 : 0)

  const metrics: DataQualityMetrics = {
    totalCompanies,
    totalFundingRounds,
    avgDataQuality: Math.round(avgDataQuality * 10) / 10,
    withIndustryPct: Math.round(safeDiv(withIndustry, totalCompanies) * 10) / 10,
    withDescriptionPct: Math.round(safeDiv(withDescription, totalCompanies) * 10) / 10,
    withFoundersPct: Math.round(safeDiv(withFounders, totalCompanies) * 10) / 10,
    withInvestorsPct: Math.round(safeDiv(withInvestors, totalCompanies) * 10) / 10,
    withStatusPct: Math.round(safeDiv(totalCompanies - statusUnknown, totalCompanies) * 10) / 10,
    stalePct: Math.round(safeDiv(staleCompanies, totalCompanies) * 10) / 10,
    statusBreakdown: {
      active: statusActive,
      shutdown: statusShutdown,
      acquired: statusAcquired,
      inactive: statusInactive,
      unknown: statusUnknown,
    },
  }

  // Save snapshot to database
  await prisma.dataQualitySnapshot.create({
    data: {
      totalCompanies,
      totalFundingRounds,
      avgDataQuality: metrics.avgDataQuality,
      companiesWithIndustry: withIndustry,
      companiesWithDescription: withDescription,
      companiesWithFounders: withFounders,
      companiesWithWebsite: withWebsite,
      companiesWithInvestors: withInvestors,
      companiesActive: statusActive,
      companiesShutdown: statusShutdown,
      companiesAcquired: statusAcquired,
      companiesInactive: statusInactive,
      companiesStatusUnknown: statusUnknown,
      duplicateCompanies: duplicateCount,
      orphanedRounds,
      staleCompanies,
      withIndustryPct: metrics.withIndustryPct,
      withDescriptionPct: metrics.withDescriptionPct,
      withFoundersPct: metrics.withFoundersPct,
      withInvestorsPct: metrics.withInvestorsPct,
      withStatusPct: metrics.withStatusPct,
      stalePct: metrics.stalePct,
      trigger,
      relatedRunId,
    },
  })

  logger.info('Quality snapshot captured', {
    companies: totalCompanies,
    avgQuality: metrics.avgDataQuality,
    withIndustry: `${metrics.withIndustryPct}%`,
    stale: `${metrics.stalePct}%`,
  })

  return metrics
}

/**
 * Compare deux snapshots et calcule les deltas
 */
export function compareSnapshots(
  before: DataQualityMetrics,
  after: DataQualityMetrics
): {
  companiesDelta: number
  fundingRoundsDelta: number
  qualityDelta: number
  industryDelta: number
  descriptionDelta: number
  foundersDelta: number
  investorsDelta: number
  statusDelta: number
  staleDelta: number
} {
  return {
    companiesDelta: after.totalCompanies - before.totalCompanies,
    fundingRoundsDelta: after.totalFundingRounds - before.totalFundingRounds,
    qualityDelta: Math.round((after.avgDataQuality - before.avgDataQuality) * 10) / 10,
    industryDelta: Math.round((after.withIndustryPct - before.withIndustryPct) * 10) / 10,
    descriptionDelta: Math.round((after.withDescriptionPct - before.withDescriptionPct) * 10) / 10,
    foundersDelta: Math.round((after.withFoundersPct - before.withFoundersPct) * 10) / 10,
    investorsDelta: Math.round((after.withInvestorsPct - before.withInvestorsPct) * 10) / 10,
    statusDelta: Math.round((after.withStatusPct - before.withStatusPct) * 10) / 10,
    staleDelta: Math.round((after.stalePct - before.stalePct) * 10) / 10,
  }
}

/**
 * Récupère le dernier snapshot
 */
export async function getLatestSnapshot(): Promise<DataQualityMetrics | null> {
  const snapshot = await prisma.dataQualitySnapshot.findFirst({
    orderBy: { capturedAt: 'desc' },
  })

  if (!snapshot) return null

  return {
    totalCompanies: snapshot.totalCompanies,
    totalFundingRounds: snapshot.totalFundingRounds,
    avgDataQuality: snapshot.avgDataQuality,
    withIndustryPct: snapshot.withIndustryPct,
    withDescriptionPct: snapshot.withDescriptionPct,
    withFoundersPct: snapshot.withFoundersPct,
    withInvestorsPct: snapshot.withInvestorsPct,
    withStatusPct: snapshot.withStatusPct,
    stalePct: snapshot.stalePct,
    statusBreakdown: {
      active: snapshot.companiesActive,
      shutdown: snapshot.companiesShutdown,
      acquired: snapshot.companiesAcquired,
      inactive: snapshot.companiesInactive,
      unknown: snapshot.companiesStatusUnknown,
    },
  }
}
