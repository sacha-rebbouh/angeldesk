/**
 * SUPERVISOR - Check Logic
 *
 * Vérifie si un agent a bien tourné et avec quels résultats
 * Inclut le contexte des erreurs pour des alertes plus informatives
 */

import { prisma } from '@/lib/prisma'
import type { MaintenanceAgent, MaintenanceStatus } from '@prisma/client'
import type {
  SupervisorCheckResult,
  SupervisorCheckDetails,
  AgentError,
  CondensedError,
  ErrorSummary,
  ErrorCategory,
} from '../types'
import { MAINTENANCE_CONSTANTS } from '../types'
import { createLogger } from '../utils'
import { categorizeError } from './retry'

const logger = createLogger('SUPERVISOR:check')

// Minimum expected items per agent
const MIN_EXPECTED_ITEMS: Record<MaintenanceAgent, number> = {
  DB_CLEANER: 0, // Can have 0 if no duplicates
  DB_SOURCER: 5, // Should find at least some articles
  DB_COMPLETER: 10, // Should enrich at least some companies
}

// ============================================================================
// ERROR CONTEXT EXTRACTION
// ============================================================================

/**
 * Extrait la première ligne du stack trace
 */
function extractStackFirstLine(stack?: string): string | undefined {
  if (!stack) return undefined

  const lines = stack.split('\n')
  // Skip the first line (error message) and get the first stack line
  for (const line of lines.slice(1)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('at ')) {
      // Clean up the line
      return trimmed
        .replace(/^at /, '')
        .replace(/\(.*node_modules.*\)/, '(node_modules)')
        .slice(0, 80) // Limit length
    }
  }

  return undefined
}

/**
 * Condense une erreur pour les notifications
 */
function condenseError(error: AgentError): CondensedError {
  return {
    message: error.message.slice(0, 200), // Limit message length
    category: categorizeError(error),
    stackFirstLine: extractStackFirstLine(error.stack),
    timestamp: error.timestamp,
  }
}

/**
 * Crée un résumé des patterns d'erreurs
 */
function createErrorSummary(errors: AgentError[]): ErrorSummary {
  const byCategory: Record<ErrorCategory, number> = {
    RATE_LIMIT: 0,
    TIMEOUT: 0,
    NETWORK: 0,
    AUTH: 0,
    RESOURCE: 0,
    VALIDATION: 0,
    EXTERNAL_API: 0,
    DATABASE: 0,
    UNKNOWN: 0,
  }

  for (const error of errors) {
    const category = categorizeError(error)
    byCategory[category]++
  }

  // Find dominant category
  let dominantCategory: ErrorCategory = 'UNKNOWN'
  let maxCount = 0
  for (const [category, count] of Object.entries(byCategory)) {
    if (count > maxCount) {
      maxCount = count
      dominantCategory = category as ErrorCategory
    }
  }

  const dominantPercentage = errors.length > 0
    ? Math.round((maxCount / errors.length) * 100)
    : 0

  return {
    totalErrors: errors.length,
    byCategory,
    dominantCategory,
    dominantPercentage,
  }
}

/**
 * Enrichit les détails du check avec le contexte des erreurs
 */
function enrichDetailsWithErrors(
  details: SupervisorCheckDetails,
  errors: AgentError[] | null
): SupervisorCheckDetails {
  if (!errors || errors.length === 0) {
    return details
  }

  // Get last 3 errors
  const lastErrors = errors
    .slice(-3)
    .map(condenseError)

  // Create error summary
  const errorSummary = createErrorSummary(errors)

  return {
    ...details,
    lastErrors,
    errorSummary,
  }
}

// ============================================================================
// MAIN CHECK LOGIC
// ============================================================================

/**
 * Vérifie le dernier run d'un agent
 */
export async function checkAgentRun(agent: MaintenanceAgent): Promise<SupervisorCheckResult> {
  // Find the most recent run from the last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

  const recentRun = await prisma.maintenanceRun.findFirst({
    where: {
      agent,
      createdAt: { gte: sixHoursAgo },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Case 1: No run found
  if (!recentRun) {
    logger.warn(`No recent run found for ${agent}`)

    return {
      runId: '',
      agent,
      checkStatus: 'MISSED',
      actionTaken: 'RETRY',
      details: {
        runFound: false,
        expectedMinItems: MIN_EXPECTED_ITEMS[agent],
        reason: 'No run found in the last 6 hours',
      },
    }
  }

  const errors = recentRun.errors as AgentError[] | null

  // Case 2: Run still in progress
  if (recentRun.status === 'RUNNING') {
    const runtime = Date.now() - (recentRun.startedAt?.getTime() || Date.now())

    // Check for timeout (2 hours)
    if (runtime > MAINTENANCE_CONSTANTS.AGENT_TIMEOUT_MS) {
      logger.error(`${agent} run timed out after ${runtime}ms`)

      // Mark as timed out
      await prisma.maintenanceRun.update({
        where: { id: recentRun.id },
        data: {
          status: 'TIMEOUT',
          completedAt: new Date(),
          durationMs: runtime,
        },
      })

      const baseDetails: SupervisorCheckDetails = {
        runFound: true,
        runStatus: 'TIMEOUT',
        runDurationMs: runtime,
        expectedMinItems: MIN_EXPECTED_ITEMS[agent],
        reason: `Run timed out after ${Math.round(runtime / 60000)} minutes`,
      }

      return {
        runId: recentRun.id,
        agent,
        checkStatus: 'TIMEOUT',
        actionTaken: 'RETRY',
        details: enrichDetailsWithErrors(baseDetails, errors),
      }
    }

    // Still running normally, check again later
    logger.info(`${agent} still running (${Math.round(runtime / 60000)} minutes)`)

    return {
      runId: recentRun.id,
      agent,
      checkStatus: 'PENDING',
      actionTaken: 'NONE',
      details: {
        runFound: true,
        runStatus: 'RUNNING',
        runDurationMs: runtime,
        itemsProcessed: recentRun.itemsProcessed,
        expectedMinItems: MIN_EXPECTED_ITEMS[agent],
        reason: 'Run still in progress',
      },
    }
  }

  // Case 3: Run completed with failure
  if (recentRun.status === 'FAILED') {
    const errorMessage = errors?.[0]?.message || 'Unknown error'

    const baseDetails: SupervisorCheckDetails = {
      runFound: true,
      runStatus: 'FAILED',
      runDurationMs: recentRun.durationMs || 0,
      itemsProcessed: recentRun.itemsProcessed,
      expectedMinItems: MIN_EXPECTED_ITEMS[agent],
      reason: `Run failed: ${errorMessage}`,
    }

    return {
      runId: recentRun.id,
      agent,
      checkStatus: 'FAILED',
      actionTaken: 'RETRY',
      details: enrichDetailsWithErrors(baseDetails, errors),
    }
  }

  // Case 4: Run completed with partial success
  if (recentRun.status === 'PARTIAL') {
    const errorCount = recentRun.itemsFailed
    const successCount = recentRun.itemsUpdated + recentRun.itemsCreated

    const baseDetails: SupervisorCheckDetails = {
      runFound: true,
      runStatus: 'PARTIAL',
      runDurationMs: recentRun.durationMs || 0,
      itemsProcessed: recentRun.itemsProcessed,
      expectedMinItems: MIN_EXPECTED_ITEMS[agent],
      reason: `Partial success: ${successCount} successful, ${errorCount} failed`,
    }

    // Check if it's acceptable
    if (successCount >= MIN_EXPECTED_ITEMS[agent]) {
      return {
        runId: recentRun.id,
        agent,
        checkStatus: 'WARNING',
        actionTaken: 'NONE',
        details: enrichDetailsWithErrors(baseDetails, errors),
      }
    }

    // Too many failures
    baseDetails.reason = `Too many failures: ${errorCount} failed out of ${recentRun.itemsProcessed}`

    return {
      runId: recentRun.id,
      agent,
      checkStatus: 'FAILED',
      actionTaken: 'RETRY',
      details: enrichDetailsWithErrors(baseDetails, errors),
    }
  }

  // Case 5: Run completed successfully
  if (recentRun.status === 'COMPLETED') {
    // Verify minimum items
    const totalSuccess = recentRun.itemsUpdated + recentRun.itemsCreated

    if (totalSuccess < MIN_EXPECTED_ITEMS[agent] && recentRun.itemsProcessed > 0) {
      logger.warn(`${agent} completed but with fewer items than expected`, {
        expected: MIN_EXPECTED_ITEMS[agent],
        actual: totalSuccess,
      })

      return {
        runId: recentRun.id,
        agent,
        checkStatus: 'WARNING',
        actionTaken: 'NONE',
        details: {
          runFound: true,
          runStatus: 'COMPLETED',
          runDurationMs: recentRun.durationMs || 0,
          itemsProcessed: recentRun.itemsProcessed,
          expectedMinItems: MIN_EXPECTED_ITEMS[agent],
          reason: `Low output: ${totalSuccess} items (expected at least ${MIN_EXPECTED_ITEMS[agent]})`,
        },
      }
    }

    // All good!
    return {
      runId: recentRun.id,
      agent,
      checkStatus: 'PASSED',
      actionTaken: 'NONE',
      details: {
        runFound: true,
        runStatus: 'COMPLETED',
        runDurationMs: recentRun.durationMs || 0,
        itemsProcessed: recentRun.itemsProcessed,
        expectedMinItems: MIN_EXPECTED_ITEMS[agent],
        reason: 'Run completed successfully',
      },
    }
  }

  // Case 6: Cancelled
  if (recentRun.status === 'CANCELLED') {
    return {
      runId: recentRun.id,
      agent,
      checkStatus: 'WARNING',
      actionTaken: 'NONE',
      details: {
        runFound: true,
        runStatus: 'CANCELLED',
        expectedMinItems: MIN_EXPECTED_ITEMS[agent],
        reason: 'Run was cancelled',
      },
    }
  }

  // Unexpected status
  return {
    runId: recentRun.id,
    agent,
    checkStatus: 'WARNING',
    actionTaken: 'NONE',
    details: {
      runFound: true,
      runStatus: recentRun.status,
      expectedMinItems: MIN_EXPECTED_ITEMS[agent],
      reason: `Unexpected status: ${recentRun.status}`,
    },
  }
}

/**
 * Formate les erreurs pour l'affichage
 */
export function formatErrorsForDisplay(details: SupervisorCheckDetails): string {
  if (!details.lastErrors || details.lastErrors.length === 0) {
    return ''
  }

  const lines: string[] = ['', '❌ *Errors:*']

  details.lastErrors.forEach((error, index) => {
    const categoryEmoji = getCategoryEmoji(error.category)
    lines.push(`${index + 1}. ${categoryEmoji} \`${error.message}\``)
    if (error.stackFirstLine) {
      lines.push(`   ↳ at ${error.stackFirstLine}`)
    }
  })

  if (details.errorSummary) {
    const { dominantCategory, dominantPercentage, totalErrors } = details.errorSummary
    lines.push('')
    lines.push(`📊 *Pattern:* ${dominantPercentage}% ${dominantCategory.toLowerCase().replace('_', ' ')} (${totalErrors} total)`)
  }

  return lines.join('\n')
}

/**
 * Get emoji for error category
 */
function getCategoryEmoji(category: ErrorCategory): string {
  switch (category) {
    case 'RATE_LIMIT':
      return '🚦'
    case 'TIMEOUT':
      return '⏱️'
    case 'NETWORK':
      return '🌐'
    case 'AUTH':
      return '🔐'
    case 'RESOURCE':
      return '💾'
    case 'DATABASE':
      return '🗄️'
    case 'VALIDATION':
      return '⚠️'
    case 'EXTERNAL_API':
      return '🔌'
    default:
      return '❓'
  }
}
