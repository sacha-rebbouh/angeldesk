/**
 * SUPERVISOR - Weekly Report
 *
 * Génère le rapport hebdomadaire de maintenance
 */

import { prisma } from '@/lib/prisma'
import type { HealthStatus, MaintenanceAgent } from '@prisma/client'
import type {
  WeeklyReportData,
  AgentWeeklySummary,
  WeeklyIssue,
  DataQualityMetrics,
} from '../types'
import { getWeekStart, getWeekEnd, createLogger } from '../utils'
import { captureQualitySnapshot, getLatestSnapshot, compareSnapshots } from './quality-snapshot'
import { notifyWeeklyReport } from '@/services/notifications'
import { sendWeeklyReportEmail } from '@/services/notifications/email'

const logger = createLogger('SUPERVISOR:weekly-report')

/**
 * Génère et envoie le rapport hebdomadaire
 */
export async function generateWeeklyReport(): Promise<WeeklyReportData> {
  const weekEnd = getWeekEnd()
  const weekStart = getWeekStart()

  logger.info('Generating weekly report', {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  })

  // Check if report already exists for this week
  const existingReport = await prisma.weeklyReport.findUnique({
    where: { weekStart },
  })

  if (existingReport) {
    logger.info('Weekly report already exists for this period')
    // Could return existing report or regenerate
  }

  // Get runs for the week
  const runs = await prisma.maintenanceRun.findMany({
    where: {
      createdAt: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Get supervisor checks for issues
  const checks = await prisma.supervisorCheck.findMany({
    where: {
      checkedAt: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    include: { run: true },
  })

  // Build agent summaries
  const cleanerSummary = buildAgentSummary(runs, 'DB_CLEANER')
  const sourcerSummary = buildAgentSummary(runs, 'DB_SOURCER')
  const completerSummary = buildAgentSummary(runs, 'DB_COMPLETER')

  // Get quality snapshots
  // Try to get snapshot from start of week
  const startSnapshot = await prisma.dataQualitySnapshot.findFirst({
    where: {
      capturedAt: {
        gte: weekStart,
        lte: new Date(weekStart.getTime() + 24 * 60 * 60 * 1000), // First day
      },
    },
    orderBy: { capturedAt: 'asc' },
  })

  // Capture current snapshot
  const currentMetrics = await captureQualitySnapshot('weekly_report')

  // Build start metrics (from snapshot or estimate)
  const startMetrics: DataQualityMetrics = startSnapshot
    ? {
        totalCompanies: startSnapshot.totalCompanies,
        totalFundingRounds: startSnapshot.totalFundingRounds,
        avgDataQuality: startSnapshot.avgDataQuality,
        withIndustryPct: startSnapshot.withIndustryPct,
        withDescriptionPct: startSnapshot.withDescriptionPct,
        withFoundersPct: startSnapshot.withFoundersPct,
        withInvestorsPct: startSnapshot.withInvestorsPct,
        withStatusPct: startSnapshot.withStatusPct,
        stalePct: startSnapshot.stalePct,
        statusBreakdown: {
          active: startSnapshot.companiesActive,
          shutdown: startSnapshot.companiesShutdown,
          acquired: startSnapshot.companiesAcquired,
          inactive: startSnapshot.companiesInactive,
          unknown: startSnapshot.companiesStatusUnknown,
        },
      }
    : currentMetrics // Fallback to current if no start snapshot

  const qualityDelta = compareSnapshots(startMetrics, currentMetrics)

  // Build issues list
  const issues: WeeklyIssue[] = checks
    .filter((c) => c.checkStatus !== 'PASSED')
    .map((c) => ({
      date: c.checkedAt,
      agent: c.run.agent,
      issue: (c.checkDetails as { reason?: string })?.reason || c.checkStatus,
      resolution: c.actionTaken === 'RETRY' ? 'Retry triggered' : c.actionTaken,
      recovered: c.actionTaken === 'RETRY' && c.run.status === 'COMPLETED',
    }))

  // Calculate total cost
  const totalCost = runs.reduce((sum, r) => sum + Number(r.totalCost || 0), 0)

  // Determine overall health
  const overallStatus = determineHealthStatus(
    cleanerSummary,
    sourcerSummary,
    completerSummary,
    issues
  )

  // Build report data
  const reportData: WeeklyReportData = {
    weekStart,
    weekEnd,
    overallStatus,
    agentSummaries: {
      cleaner: cleanerSummary,
      sourcer: sourcerSummary,
      completer: completerSummary,
    },
    dataQualityStart: startMetrics,
    dataQualityEnd: currentMetrics,
    qualityDelta,
    issues,
    totalCost,
    costByAgent: {
      cleaner: runs
        .filter((r) => r.agent === 'DB_CLEANER')
        .reduce((sum, r) => sum + Number(r.totalCost || 0), 0),
      sourcer: runs
        .filter((r) => r.agent === 'DB_SOURCER')
        .reduce((sum, r) => sum + Number(r.totalCost || 0), 0),
      completer: runs
        .filter((r) => r.agent === 'DB_COMPLETER')
        .reduce((sum, r) => sum + Number(r.totalCost || 0), 0),
    },
  }

  // Save report to database
  await prisma.weeklyReport.upsert({
    where: { weekStart },
    update: {
      weekEnd,
      overallStatus,
      cleanerSummary: cleanerSummary as object,
      sourcerSummary: sourcerSummary as object,
      completerSummary: completerSummary as object,
      dataQualityStart: startMetrics as object,
      dataQualityEnd: currentMetrics as object,
      qualityDelta: qualityDelta as object,
      issuesDetected: issues.length,
      retriesTriggered: checks.filter((c) => c.actionTaken === 'RETRY').length,
      retriesSuccessful: issues.filter((i) => i.recovered).length,
      retriesFailed: issues.filter((i) => !i.recovered && i.resolution === 'Retry triggered')
        .length,
      totalCost,
      costByAgent: reportData.costByAgent as object,
    },
    create: {
      weekStart,
      weekEnd,
      overallStatus,
      cleanerSummary: cleanerSummary as object,
      sourcerSummary: sourcerSummary as object,
      completerSummary: completerSummary as object,
      dataQualityStart: startMetrics as object,
      dataQualityEnd: currentMetrics as object,
      qualityDelta: qualityDelta as object,
      issuesDetected: issues.length,
      retriesTriggered: checks.filter((c) => c.actionTaken === 'RETRY').length,
      retriesSuccessful: issues.filter((i) => i.recovered).length,
      retriesFailed: issues.filter((i) => !i.recovered && i.resolution === 'Retry triggered')
        .length,
      totalCost,
      costByAgent: reportData.costByAgent as object,
    },
  })

  // Send notifications
  await sendNotifications(reportData)

  logger.info('Weekly report generated', {
    status: overallStatus,
    issues: issues.length,
    cost: totalCost.toFixed(2),
  })

  return reportData
}

/**
 * Construit le résumé d'un agent
 */
function buildAgentSummary(
  runs: Array<{
    agent: MaintenanceAgent
    status: string
    itemsProcessed: number
    itemsUpdated: number
    itemsCreated: number
    durationMs: number | null
    totalCost: unknown
    retryAttempt: number
  }>,
  agent: MaintenanceAgent
): AgentWeeklySummary {
  const agentRuns = runs.filter((r) => r.agent === agent)

  // Only count original runs (not retries) for total
  const originalRuns = agentRuns.filter((r) => r.retryAttempt === 0)

  return {
    totalRuns: originalRuns.length,
    successfulRuns: originalRuns.filter(
      (r) => r.status === 'COMPLETED' || r.status === 'PARTIAL'
    ).length,
    failedRuns: originalRuns.filter(
      (r) => r.status === 'FAILED' || r.status === 'TIMEOUT'
    ).length,
    itemsProcessed: agentRuns.reduce((sum, r) => sum + r.itemsProcessed, 0),
    itemsUpdated: agentRuns.reduce((sum, r) => sum + r.itemsUpdated, 0),
    itemsCreated: agentRuns.reduce((sum, r) => sum + r.itemsCreated, 0),
    retriesTriggered: agentRuns.filter((r) => r.retryAttempt > 0).length,
    retriesSuccessful: agentRuns.filter(
      (r) => r.retryAttempt > 0 && (r.status === 'COMPLETED' || r.status === 'PARTIAL')
    ).length,
    avgDurationMs:
      agentRuns.length > 0
        ? Math.round(
            agentRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / agentRuns.length
          )
        : 0,
    totalCost: agentRuns.reduce((sum, r) => sum + Number(r.totalCost || 0), 0),
  }
}

/**
 * Détermine le statut de santé global
 */
function determineHealthStatus(
  cleaner: AgentWeeklySummary,
  sourcer: AgentWeeklySummary,
  completer: AgentWeeklySummary,
  issues: WeeklyIssue[]
): HealthStatus {
  // Critical if any agent completely failed
  if (
    (cleaner.totalRuns > 0 && cleaner.successfulRuns === 0) ||
    (sourcer.totalRuns > 0 && sourcer.successfulRuns === 0) ||
    (completer.totalRuns > 0 && completer.successfulRuns === 0)
  ) {
    return 'CRITICAL'
  }

  // Critical if more than half of issues unresolved
  const unresolvedIssues = issues.filter((i) => !i.recovered)
  if (unresolvedIssues.length > issues.length / 2 && issues.length > 2) {
    return 'CRITICAL'
  }

  // Degraded if any issues occurred
  if (issues.length > 0) {
    return 'DEGRADED'
  }

  // Degraded if any run had partial success
  const allRuns = cleaner.totalRuns + sourcer.totalRuns + completer.totalRuns
  const partialRuns =
    (cleaner.successfulRuns - cleaner.failedRuns > cleaner.totalRuns ? 0 : 1) +
    (sourcer.successfulRuns - sourcer.failedRuns > sourcer.totalRuns ? 0 : 1) +
    (completer.successfulRuns - completer.failedRuns > completer.totalRuns ? 0 : 1)

  if (partialRuns > 0) {
    return 'DEGRADED'
  }

  return 'HEALTHY'
}

/**
 * Envoie les notifications du rapport
 */
async function sendNotifications(report: WeeklyReportData): Promise<void> {
  // Format for Telegram
  const telegramAgents = [
    {
      name: 'CLEANER',
      emoji: '🧹',
      runs: `${report.agentSummaries.cleaner.successfulRuns}/${report.agentSummaries.cleaner.totalRuns}`,
      result:
        report.agentSummaries.cleaner.itemsUpdated > 0
          ? `-${report.agentSummaries.cleaner.itemsUpdated} dupl`
          : '0 dupl',
    },
    {
      name: 'SOURCER',
      emoji: '📥',
      runs: `${report.agentSummaries.sourcer.successfulRuns}/${report.agentSummaries.sourcer.totalRuns}`,
      result: `+${report.agentSummaries.sourcer.itemsCreated} new`,
    },
    {
      name: 'COMPLET',
      emoji: '🔍',
      runs: `${report.agentSummaries.completer.successfulRuns}/${report.agentSummaries.completer.totalRuns}`,
      result: `+${report.agentSummaries.completer.itemsUpdated} enr`,
    },
  ]

  const telegramMetrics = [
    {
      name: 'Companies',
      before: report.dataQualityStart.totalCompanies,
      after: report.dataQualityEnd.totalCompanies,
      delta:
        report.qualityDelta.companiesDelta > 0
          ? `+${report.qualityDelta.companiesDelta}`
          : String(report.qualityDelta.companiesDelta),
    },
    {
      name: 'Qualité moy',
      before: Math.round(report.dataQualityStart.avgDataQuality),
      after: Math.round(report.dataQualityEnd.avgDataQuality),
      delta:
        report.qualityDelta.qualityDelta > 0
          ? `+${report.qualityDelta.qualityDelta}`
          : String(report.qualityDelta.qualityDelta),
    },
    {
      name: 'Avec industrie',
      before: `${report.dataQualityStart.withIndustryPct}%`,
      after: `${report.dataQualityEnd.withIndustryPct}%`,
      delta:
        report.qualityDelta.industryDelta > 0
          ? `+${report.qualityDelta.industryDelta}%`
          : `${report.qualityDelta.industryDelta}%`,
    },
  ]

  await notifyWeeklyReport({
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    overallStatus: report.overallStatus,
    agents: telegramAgents,
    metrics: telegramMetrics,
    incidents: report.issues.length,
    incidentDetails: report.issues.slice(0, 5).map((i) => ({
      day: i.date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      agent: i.agent.replace('DB_', ''),
      result: i.recovered ? '✅ retry' : '❌ fail',
    })),
    totalCost: report.totalCost,
  })

  // Send email
  await sendWeeklyReportEmail({
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    overallStatus: report.overallStatus,
    agents: [
      {
        name: 'DB_CLEANER',
        runs: report.agentSummaries.cleaner.totalRuns,
        successful: report.agentSummaries.cleaner.successfulRuns,
        failed: report.agentSummaries.cleaner.failedRuns,
        itemsProcessed: report.agentSummaries.cleaner.itemsProcessed,
      },
      {
        name: 'DB_SOURCER',
        runs: report.agentSummaries.sourcer.totalRuns,
        successful: report.agentSummaries.sourcer.successfulRuns,
        failed: report.agentSummaries.sourcer.failedRuns,
        itemsProcessed: report.agentSummaries.sourcer.itemsProcessed,
      },
      {
        name: 'DB_COMPLETER',
        runs: report.agentSummaries.completer.totalRuns,
        successful: report.agentSummaries.completer.successfulRuns,
        failed: report.agentSummaries.completer.failedRuns,
        itemsProcessed: report.agentSummaries.completer.itemsProcessed,
      },
    ],
    metrics: {
      companiesBefore: report.dataQualityStart.totalCompanies,
      companiesAfter: report.dataQualityEnd.totalCompanies,
      qualityBefore: Math.round(report.dataQualityStart.avgDataQuality),
      qualityAfter: Math.round(report.dataQualityEnd.avgDataQuality),
      industryBefore: report.dataQualityStart.withIndustryPct,
      industryAfter: report.dataQualityEnd.withIndustryPct,
    },
    incidents: report.issues.map((i) => ({
      date: i.date,
      agent: i.agent,
      error: i.issue,
      resolved: i.recovered,
    })),
    totalCost: report.totalCost,
  })

  // Mark report as sent
  await prisma.weeklyReport.update({
    where: { weekStart: report.weekStart },
    data: {
      telegramSent: true,
      telegramSentAt: new Date(),
      emailSent: true,
      emailSentAt: new Date(),
    },
  })
}
