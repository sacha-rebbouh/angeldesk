/**
 * SUPERVISOR - Retry Logic
 *
 * Déclenche les retries des agents qui ont échoué
 * avec analyse intelligente des erreurs et backoff exponentiel
 */

import { prisma } from '@/lib/prisma'
import type { MaintenanceAgent, MaintenanceRun } from '@prisma/client'
import {
  type AgentError,
  type ErrorCategory,
  type RetryStrategy,
  type RetryAdjustments,
  type BackoffConfig,
} from '../types'
import { createLogger, sleep } from '../utils'

const logger = createLogger('SUPERVISOR:retry')

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  rateLimitBaseMs: 5 * 60 * 1000, // 5 minutes for rate limits
  defaultBaseMs: 60 * 1000, // 1 minute for other errors
  maxDelayMs: 30 * 60 * 1000, // Max 30 minutes
  jitterFactor: 0.3, // 0-30% random jitter
}

/** Error patterns for categorization */
const ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  // Rate limiting
  { pattern: /rate.?limit/i, category: 'RATE_LIMIT' },
  { pattern: /429/i, category: 'RATE_LIMIT' },
  { pattern: /too many requests/i, category: 'RATE_LIMIT' },
  { pattern: /quota exceeded/i, category: 'RATE_LIMIT' },
  { pattern: /throttl/i, category: 'RATE_LIMIT' },

  // Timeout
  { pattern: /timeout/i, category: 'TIMEOUT' },
  { pattern: /timed out/i, category: 'TIMEOUT' },
  { pattern: /ETIMEDOUT/i, category: 'TIMEOUT' },
  { pattern: /deadline exceeded/i, category: 'TIMEOUT' },

  // Network
  { pattern: /ECONNREFUSED/i, category: 'NETWORK' },
  { pattern: /ECONNRESET/i, category: 'NETWORK' },
  { pattern: /ENOTFOUND/i, category: 'NETWORK' },
  { pattern: /network/i, category: 'NETWORK' },
  { pattern: /socket hang up/i, category: 'NETWORK' },
  { pattern: /connection refused/i, category: 'NETWORK' },
  { pattern: /DNS/i, category: 'NETWORK' },

  // Auth
  { pattern: /401/i, category: 'AUTH' },
  { pattern: /403/i, category: 'AUTH' },
  { pattern: /unauthorized/i, category: 'AUTH' },
  { pattern: /forbidden/i, category: 'AUTH' },
  { pattern: /api.?key/i, category: 'AUTH' },
  { pattern: /invalid.?token/i, category: 'AUTH' },

  // Resource
  { pattern: /out of memory/i, category: 'RESOURCE' },
  { pattern: /ENOMEM/i, category: 'RESOURCE' },
  { pattern: /heap/i, category: 'RESOURCE' },
  { pattern: /disk.?full/i, category: 'RESOURCE' },

  // Database
  { pattern: /prisma/i, category: 'DATABASE' },
  { pattern: /database/i, category: 'DATABASE' },
  { pattern: /postgresql/i, category: 'DATABASE' },
  { pattern: /connection.?pool/i, category: 'DATABASE' },
  { pattern: /deadlock/i, category: 'DATABASE' },

  // Validation
  { pattern: /validation/i, category: 'VALIDATION' },
  { pattern: /invalid/i, category: 'VALIDATION' },
  { pattern: /schema/i, category: 'VALIDATION' },
  { pattern: /parse.?error/i, category: 'VALIDATION' },

  // External API (generic)
  { pattern: /500/i, category: 'EXTERNAL_API' },
  { pattern: /502/i, category: 'EXTERNAL_API' },
  { pattern: /503/i, category: 'EXTERNAL_API' },
  { pattern: /504/i, category: 'EXTERNAL_API' },
  { pattern: /service unavailable/i, category: 'EXTERNAL_API' },
]

// ============================================================================
// ERROR ANALYSIS
// ============================================================================

/**
 * Catégorise une erreur basée sur son message
 */
export function categorizeError(error: AgentError | string): ErrorCategory {
  const message = typeof error === 'string' ? error : error.message

  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return category
    }
  }

  return 'UNKNOWN'
}

/**
 * Analyse les erreurs d'un run et détermine la stratégie de retry
 */
export function analyzeErrorsAndGetStrategy(
  errors: AgentError[],
  retryAttempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): RetryStrategy {
  if (errors.length === 0) {
    return {
      shouldRetry: true,
      delayMs: calculateBackoffDelay(retryAttempt, 'UNKNOWN', config),
      reason: 'No errors to analyze, retrying with default backoff',
      adjustments: {},
    }
  }

  // Categorize all errors
  const categoryCounts: Record<ErrorCategory, number> = {
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
    categoryCounts[category]++
  }

  // Find dominant category
  let dominantCategory: ErrorCategory = 'UNKNOWN'
  let maxCount = 0
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count
      dominantCategory = category as ErrorCategory
    }
  }

  // Build strategy based on dominant error type
  return buildRetryStrategy(dominantCategory, retryAttempt, errors.length, config)
}

/**
 * Construit la stratégie de retry selon la catégorie d'erreur
 */
function buildRetryStrategy(
  category: ErrorCategory,
  attempt: number,
  errorCount: number,
  config: BackoffConfig
): RetryStrategy {
  const adjustments: RetryAdjustments = {}

  switch (category) {
    case 'RATE_LIMIT':
      // Rate limit: long backoff, no other changes
      return {
        shouldRetry: attempt < 2,
        delayMs: calculateBackoffDelay(attempt, category, config),
        reason: `Rate limit detected (${errorCount} errors). Using extended backoff.`,
        adjustments: {
          reduceBatchSize: true, // Process fewer items to avoid hitting limits
        },
      }

    case 'TIMEOUT':
      // Timeout: increase timeout for next run
      return {
        shouldRetry: attempt < 2,
        delayMs: calculateBackoffDelay(attempt, category, config),
        reason: `Timeout errors (${errorCount}). Increasing timeout for retry.`,
        adjustments: {
          timeoutMultiplier: 1.5 + attempt * 0.5, // 1.5x, 2x, 2.5x...
        },
      }

    case 'NETWORK':
      // Network: short backoff, usually transient
      return {
        shouldRetry: attempt < 3, // Allow more retries for network issues
        delayMs: Math.min(
          calculateBackoffDelay(attempt, category, config),
          2 * 60 * 1000 // Max 2 min for network
        ),
        reason: `Network errors (${errorCount}). Quick retry with short backoff.`,
        adjustments: {},
      }

    case 'AUTH':
      // Auth: don't retry, needs manual intervention
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Authentication errors (${errorCount}). Manual intervention required.`,
        adjustments: {},
      }

    case 'RESOURCE':
      // Resource: don't retry, needs manual intervention
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Resource exhaustion (${errorCount}). Manual intervention required.`,
        adjustments: {},
      }

    case 'VALIDATION':
      // Validation: don't retry, code fix needed
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Validation errors (${errorCount}). Code fix required.`,
        adjustments: {},
      }

    case 'DATABASE':
      // Database: moderate backoff, might be transient
      return {
        shouldRetry: attempt < 2,
        delayMs: calculateBackoffDelay(attempt, category, config),
        reason: `Database errors (${errorCount}). Retrying with backoff.`,
        adjustments: {},
      }

    case 'EXTERNAL_API':
      // External API: moderate backoff
      return {
        shouldRetry: attempt < 2,
        delayMs: calculateBackoffDelay(attempt, category, config),
        reason: `External API errors (${errorCount}). Retrying with backoff.`,
        adjustments: {
          useBackupService: attempt > 0, // Use backup on 2nd attempt
        },
      }

    default:
      // Unknown: default retry strategy
      return {
        shouldRetry: attempt < 2,
        delayMs: calculateBackoffDelay(attempt, category, config),
        reason: `Unknown errors (${errorCount}). Using default retry strategy.`,
        adjustments: {},
      }
  }
}

/**
 * Calcule le délai de backoff exponentiel avec jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  category: ErrorCategory,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  const baseDelay =
    category === 'RATE_LIMIT' ? config.rateLimitBaseMs : config.defaultBaseMs

  // Exponential backoff: base * 2^attempt
  const exponential = baseDelay * Math.pow(2, attempt)

  // Add jitter (0 to jitterFactor * exponential)
  const jitter = Math.random() * config.jitterFactor * exponential

  // Cap at max delay
  return Math.min(exponential + jitter, config.maxDelayMs)
}

// ============================================================================
// RETRY TRIGGER
// ============================================================================

/**
 * Déclenche un retry pour un agent avec stratégie intelligente
 */
export async function triggerRetry(
  agent: MaintenanceAgent,
  parentRunId?: string
): Promise<MaintenanceRun | null> {
  // Get parent run details
  let retryAttempt = 0
  let errors: AgentError[] = []

  if (parentRunId) {
    const parentRun = await prisma.maintenanceRun.findUnique({
      where: { id: parentRunId },
    })

    if (parentRun) {
      retryAttempt = parentRun.retryAttempt + 1
      errors = (parentRun.errors as unknown as AgentError[]) || []
    }
  }

  // Analyze errors and get retry strategy
  const strategy = analyzeErrorsAndGetStrategy(errors, retryAttempt)

  logger.info(`Retry strategy for ${agent}`, {
    attempt: retryAttempt,
    shouldRetry: strategy.shouldRetry,
    delayMs: strategy.delayMs,
    reason: strategy.reason,
    adjustments: strategy.adjustments,
  })

  // Check if we should retry at all
  if (!strategy.shouldRetry) {
    logger.warn(`Not retrying ${agent}: ${strategy.reason}`)
    return null
  }

  // Wait for backoff delay
  if (strategy.delayMs > 0) {
    logger.info(`Waiting ${Math.round(strategy.delayMs / 1000)}s before retry...`)
    await sleep(strategy.delayMs)
  }

  // Create new run record with adjustments
  const run = await prisma.maintenanceRun.create({
    data: {
      agent,
      status: 'PENDING',
      triggeredBy: 'SUPERVISOR',
      parentRunId,
      retryAttempt,
      scheduledAt: new Date(),
      details: {
        retryStrategy: JSON.parse(JSON.stringify(strategy)),
        adjustments: JSON.parse(JSON.stringify(strategy.adjustments)),
      },
    },
  })

  logger.info(`Created retry run for ${agent}`, {
    runId: run.id,
    attempt: retryAttempt,
    parentRunId,
    delayApplied: strategy.delayMs,
  })

  // Trigger the agent via internal API
  const agentPath = agent.replace('DB_', '').toLowerCase()

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'

  try {
    const response = await fetch(`${baseUrl}/api/cron/maintenance/${agentPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId: run.id,
        adjustments: strategy.adjustments,
      }),
    })

    if (!response.ok) {
      logger.error(`Failed to trigger ${agent} retry`, {
        status: response.status,
        statusText: response.statusText,
      })

      // Mark run as failed
      await prisma.maintenanceRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: [{ message: `Failed to trigger: HTTP ${response.status}` }],
        },
      })

      return null
    }

    logger.info(`Successfully triggered ${agent} retry after ${strategy.delayMs}ms backoff`)
    return run
  } catch (error) {
    logger.error(`Error triggering ${agent} retry`, {
      error: error instanceof Error ? error.message : 'Unknown',
    })

    // Mark run as failed
    await prisma.maintenanceRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: [
          {
            message: `Trigger error: ${error instanceof Error ? error.message : 'Unknown'}`,
          },
        ],
      },
    })

    return null
  }
}

/**
 * Programme un check de retry après un délai
 */
export async function scheduleRetryCheck(
  agent: MaintenanceAgent,
  retryRunId: string,
  delayMinutes: number = 120
): Promise<void> {
  logger.info(`Retry check scheduled for ${agent}`, {
    runId: retryRunId,
    checkAfter: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
  })

  await prisma.supervisorCheck.updateMany({
    where: { retryRunId },
    data: {
      isRetryCheck: true,
      retryCheckAt: new Date(Date.now() + delayMinutes * 60 * 1000),
    },
  })
}

/**
 * Récupère les retries en attente de vérification
 */
export async function getPendingRetryChecks(): Promise<
  Array<{
    agent: MaintenanceAgent
    retryRunId: string
    scheduledAt: Date
  }>
> {
  const checks = await prisma.supervisorCheck.findMany({
    where: {
      isRetryCheck: true,
      retryCheckAt: { lte: new Date() },
      actionTaken: 'RETRY',
    },
    include: {
      run: true,
    },
  })

  return checks
    .filter((c) => c.retryRunId)
    .map((c) => ({
      agent: c.run.agent,
      retryRunId: c.retryRunId!,
      scheduledAt: c.retryCheckAt!,
    }))
}

/**
 * Formate le délai en format lisible
 */
export function formatDelay(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`
  } else if (ms < 3600000) {
    return `${Math.round(ms / 60000)}min`
  } else {
    return `${(ms / 3600000).toFixed(1)}h`
  }
}
