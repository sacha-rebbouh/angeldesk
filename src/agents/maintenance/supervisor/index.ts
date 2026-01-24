/**
 * SUPERVISOR
 *
 * Vérifie que chaque agent a bien tourné, déclenche les retries si nécessaire,
 * et génère le rapport hebdomadaire.
 *
 * Fréquence: +2h après chaque agent
 */

import { prisma } from '@/lib/prisma'
import type { MaintenanceAgent } from '@prisma/client'
import type { SupervisorCheckResult, DataQualityMetrics } from '../types'
import { createLogger } from '../utils'
import { checkAgentRun } from './check'
import { triggerRetry } from './retry'
import { captureQualitySnapshot } from './quality-snapshot'
import {
  notifyAgentCompleted,
  notifyAgentFailed,
  notifyRetrySuccess,
  notifyCriticalAlert,
} from '@/services/notifications'
import { sendCriticalAlertEmail } from '@/services/notifications/email'

const logger = createLogger('SUPERVISOR')

// ============================================================================
// MAIN SUPERVISOR CHECK
// ============================================================================

/**
 * Vérifie un agent et prend les actions appropriées
 */
export async function supervisorCheck(agent: MaintenanceAgent): Promise<SupervisorCheckResult> {
  logger.info(`Checking agent: ${agent}`)

  // Get the check result
  const result = await checkAgentRun(agent)

  // Take action based on result
  switch (result.checkStatus) {
    case 'PASSED':
      logger.info(`${agent} check PASSED`)

      // Send success notification (optional, can be disabled)
      if (result.details.itemsProcessed && result.details.itemsProcessed > 0) {
        await notifyAgentCompleted(agent, {
          itemsProcessed: result.details.itemsProcessed,
          durationMs: result.details.runDurationMs,
        })
      }
      break

    case 'WARNING':
      logger.warn(`${agent} check WARNING`, { reason: result.details.reason })
      // Still working, but metrics degraded - just notify with context
      await notifyAgentFailed(
        agent,
        result.details.reason,
        false,
        undefined,
        result.details
      )
      break

    case 'FAILED':
    case 'TIMEOUT':
    case 'MISSED':
      logger.error(`${agent} check ${result.checkStatus}`, { reason: result.details.reason })

      // Check if we should retry
      const recentRun = await prisma.maintenanceRun.findFirst({
        where: { agent },
        orderBy: { createdAt: 'desc' },
      })

      const retryAttempt = recentRun?.retryAttempt || 0

      if (retryAttempt < 2) {
        // Trigger retry (this now includes intelligent backoff)
        logger.info(`Triggering retry for ${agent} (attempt ${retryAttempt + 1}/2)`)

        // Note: notifyAgentFailed is called before triggerRetry because triggerRetry may sleep
        // We'll send an update after the retry is actually triggered
        await notifyAgentFailed(
          agent,
          result.details.reason,
          true,
          retryAttempt + 1,
          result.details
        )

        const retryRun = await triggerRetry(agent, recentRun?.id)
        result.actionTaken = 'RETRY'
        result.retryRunId = retryRun?.id
      } else {
        // Max retries reached - critical alert with full context
        logger.error(`${agent} max retries reached - critical alert`)

        result.actionTaken = 'ALERT_ONLY'

        await notifyCriticalAlert(
          agent,
          result.details.reason,
          'Vérifier les logs et relancer manuellement',
          result.details
        )

        await sendCriticalAlertEmail({
          agent,
          error: result.details.reason,
          attempts: retryAttempt + 1,
          action: 'Vérifier les logs Vercel et relancer manuellement via /run ou Prisma Studio',
        })
      }
      break

    case 'PENDING':
      logger.info(`${agent} still running, will check again later`)
      break
  }

  // Save supervisor check record
  if (result.runId) {
    await prisma.supervisorCheck.create({
      data: {
        runId: result.runId,
        checkStatus: result.checkStatus,
        checkDetails: result.details as object,
        actionTaken: result.actionTaken,
        retryRunId: result.retryRunId,
        telegramSent: true,
      },
    })
  }

  return result
}

// ============================================================================
// RETRY CHECK
// ============================================================================

/**
 * Vérifie si un retry a réussi
 */
export async function checkRetryResult(
  agent: MaintenanceAgent,
  retryRunId: string
): Promise<void> {
  const retryRun = await prisma.maintenanceRun.findUnique({
    where: { id: retryRunId },
  })

  if (!retryRun) {
    logger.error(`Retry run ${retryRunId} not found`)
    return
  }

  if (retryRun.status === 'RUNNING') {
    logger.info(`Retry ${retryRunId} still running`)
    return
  }

  if (retryRun.status === 'COMPLETED' || retryRun.status === 'PARTIAL') {
    logger.info(`Retry ${retryRunId} succeeded!`)

    await notifyRetrySuccess(agent, {
      itemsProcessed: retryRun.itemsProcessed,
      durationMs: retryRun.durationMs || 0,
    })
  } else {
    logger.error(`Retry ${retryRunId} failed with status ${retryRun.status}`)

    // Check if we should retry again
    if (retryRun.retryAttempt < 2) {
      const newRetry = await triggerRetry(agent, retryRunId)
      await notifyAgentFailed(
        agent,
        `Retry échoué (status: ${retryRun.status})`,
        true,
        retryRun.retryAttempt + 1
      )
    } else {
      // Final failure
      await notifyCriticalAlert(
        agent,
        `Tous les retries ont échoué (dernier status: ${retryRun.status})`,
        'Intervention manuelle requise'
      )

      await sendCriticalAlertEmail({
        agent,
        error: `Tous les retries ont échoué. Dernier status: ${retryRun.status}`,
        attempts: retryRun.retryAttempt + 1,
        action: 'Intervention manuelle requise. Vérifier les logs Vercel.',
      })
    }
  }
}

// ============================================================================
// QUALITY MONITORING
// ============================================================================

/**
 * Capture un snapshot de la qualité des données
 */
export async function captureDataQuality(
  trigger: string,
  relatedRunId?: string
): Promise<DataQualityMetrics> {
  return captureQualitySnapshot(trigger, relatedRunId)
}

// ============================================================================
// EXPORTS
// ============================================================================

export { generateWeeklyReport } from './weekly-report'
export { captureQualitySnapshot } from './quality-snapshot'
export {
  runHealthCheck,
  runHealthCheckWithAlerts,
  runQuickHealthCheck,
  scheduledHealthCheck,
  type HealthCheckResult,
  type SystemHealthReport,
} from './health-check'
