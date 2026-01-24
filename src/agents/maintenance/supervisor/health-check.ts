/**
 * SUPERVISOR - Proactive Health Checks
 *
 * Vérifie la santé du système AVANT que les problèmes surviennent:
 * - API quotas et validité
 * - Connectivité DB
 * - État des circuit breakers
 * - Queue de traitement
 */

import { prisma } from '@/lib/prisma'
import { createLogger, getCircuitBreakerStatus } from '../utils'
import { getCacheStats } from '../cache'
import { notifyCriticalAlert } from '@/services/notifications'

const logger = createLogger('SUPERVISOR:health-check')

// ============================================================================
// TYPES
// ============================================================================

export interface HealthCheckResult {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  message: string
  details?: Record<string, unknown>
  checkedAt: Date
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'warning' | 'critical'
  checks: HealthCheckResult[]
  timestamp: Date
  recommendations: string[]
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

/**
 * Check database connectivity and basic queries
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    // Simple query to test connection
    const companyCount = await prisma.company.count()
    const latency = Date.now() - startTime

    if (latency > 5000) {
      return {
        name: 'Database',
        status: 'warning',
        message: `Database responding slowly (${latency}ms)`,
        details: { latencyMs: latency, companyCount },
        checkedAt: new Date(),
      }
    }

    return {
      name: 'Database',
      status: 'healthy',
      message: `Connected (${latency}ms, ${companyCount} companies)`,
      details: { latencyMs: latency, companyCount },
      checkedAt: new Date(),
    }
  } catch (error) {
    return {
      name: 'Database',
      status: 'critical',
      message: `Database unreachable: ${error instanceof Error ? error.message : 'Unknown'}`,
      checkedAt: new Date(),
    }
  }
}

/**
 * Check OpenRouter API (for LLM)
 */
async function checkOpenRouterAPI(): Promise<HealthCheckResult> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return {
      name: 'OpenRouter API',
      status: 'critical',
      message: 'OPENROUTER_API_KEY not configured',
      checkedAt: new Date(),
    }
  }

  try {
    // Check API key validity with a simple models request
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return {
        name: 'OpenRouter API',
        status: 'critical',
        message: `API error: ${response.status} ${response.statusText}`,
        checkedAt: new Date(),
      }
    }

    // Check credits/limits if available
    const limitHeader = response.headers.get('x-ratelimit-remaining')
    const details: Record<string, unknown> = {}

    if (limitHeader) {
      const remaining = parseInt(limitHeader, 10)
      details.rateLimitRemaining = remaining

      if (remaining < 100) {
        return {
          name: 'OpenRouter API',
          status: 'warning',
          message: `Low rate limit remaining: ${remaining}`,
          details,
          checkedAt: new Date(),
        }
      }
    }

    return {
      name: 'OpenRouter API',
      status: 'healthy',
      message: 'API key valid and accessible',
      details,
      checkedAt: new Date(),
    }
  } catch (error) {
    return {
      name: 'OpenRouter API',
      status: 'warning',
      message: `Cannot verify API: ${error instanceof Error ? error.message : 'Unknown'}`,
      checkedAt: new Date(),
    }
  }
}

/**
 * Check Brave Search API
 */
async function checkBraveAPI(): Promise<HealthCheckResult> {
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    return {
      name: 'Brave Search API',
      status: 'warning',
      message: 'BRAVE_API_KEY not configured (optional)',
      checkedAt: new Date(),
    }
  }

  // Check circuit breaker status
  const circuitStatus = getCircuitBreakerStatus('brave-search')

  if (circuitStatus.isOpen) {
    return {
      name: 'Brave Search API',
      status: 'warning',
      message: `Circuit breaker open (${circuitStatus.failures} failures)`,
      details: {
        failures: circuitStatus.failures,
        openUntil: circuitStatus.openUntil?.toISOString(),
      },
      checkedAt: new Date(),
    }
  }

  return {
    name: 'Brave Search API',
    status: 'healthy',
    message: 'API configured and circuit closed',
    details: { failures: circuitStatus.failures },
    checkedAt: new Date(),
  }
}

/**
 * Check all circuit breakers
 */
async function checkCircuitBreakers(): Promise<HealthCheckResult> {
  const circuits = ['brave-search', 'deepseek-llm', 'sourcer-llm']
  const openCircuits: string[] = []
  const details: Record<string, unknown> = {}

  for (const circuit of circuits) {
    const status = getCircuitBreakerStatus(circuit)
    details[circuit] = {
      isOpen: status.isOpen,
      failures: status.failures,
    }

    if (status.isOpen) {
      openCircuits.push(circuit)
    }
  }

  if (openCircuits.length > 0) {
    return {
      name: 'Circuit Breakers',
      status: openCircuits.length >= 2 ? 'critical' : 'warning',
      message: `Open circuits: ${openCircuits.join(', ')}`,
      details,
      checkedAt: new Date(),
    }
  }

  return {
    name: 'Circuit Breakers',
    status: 'healthy',
    message: 'All circuits closed',
    details,
    checkedAt: new Date(),
  }
}

/**
 * Check processing queue health
 */
async function checkProcessingQueue(): Promise<HealthCheckResult> {
  try {
    // Check companies needing enrichment
    const pendingEnrichment = await prisma.company.count({
      where: {
        OR: [
          { industry: null },
          { description: null },
          { lastEnrichedAt: null },
        ],
      },
    })

    // Check stale runs (running > 2 hours)
    const staleRuns = await prisma.maintenanceRun.count({
      where: {
        status: 'RUNNING',
        startedAt: {
          lt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      },
    })

    // Check failed runs in last 24h
    const recentFailures = await prisma.maintenanceRun.count({
      where: {
        status: 'FAILED',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    })

    const details = {
      pendingEnrichment,
      staleRuns,
      recentFailures,
    }

    if (staleRuns > 0) {
      return {
        name: 'Processing Queue',
        status: 'critical',
        message: `${staleRuns} stale run(s) detected`,
        details,
        checkedAt: new Date(),
      }
    }

    if (recentFailures > 5) {
      return {
        name: 'Processing Queue',
        status: 'warning',
        message: `High failure rate: ${recentFailures} in 24h`,
        details,
        checkedAt: new Date(),
      }
    }

    return {
      name: 'Processing Queue',
      status: 'healthy',
      message: `${pendingEnrichment} pending, ${recentFailures} failures/24h`,
      details,
      checkedAt: new Date(),
    }
  } catch (error) {
    return {
      name: 'Processing Queue',
      status: 'warning',
      message: `Cannot check queue: ${error instanceof Error ? error.message : 'Unknown'}`,
      checkedAt: new Date(),
    }
  }
}

/**
 * Check cache health
 */
async function checkCacheHealth(): Promise<HealthCheckResult> {
  const stats = getCacheStats()

  const details = {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
    memoryEntries: stats.memorySize,
  }

  if (stats.hitRate < 0.3 && stats.hits + stats.misses > 100) {
    return {
      name: 'Cache',
      status: 'warning',
      message: `Low hit rate: ${(stats.hitRate * 100).toFixed(1)}%`,
      details,
      checkedAt: new Date(),
    }
  }

  return {
    name: 'Cache',
    status: 'healthy',
    message: `Hit rate: ${(stats.hitRate * 100).toFixed(1)}% (${stats.memorySize} entries)`,
    details,
    checkedAt: new Date(),
  }
}

/**
 * Check data quality metrics
 */
async function checkDataQuality(): Promise<HealthCheckResult> {
  try {
    const totalCompanies = await prisma.company.count()
    const withIndustry = await prisma.company.count({
      where: { industry: { not: null } },
    })
    const withDescription = await prisma.company.count({
      where: { description: { not: null } },
    })

    const industryPct = totalCompanies > 0 ? (withIndustry / totalCompanies) * 100 : 0
    const descPct = totalCompanies > 0 ? (withDescription / totalCompanies) * 100 : 0

    const details = {
      totalCompanies,
      industryPct: `${industryPct.toFixed(1)}%`,
      descriptionPct: `${descPct.toFixed(1)}%`,
    }

    if (industryPct < 50 || descPct < 30) {
      return {
        name: 'Data Quality',
        status: 'warning',
        message: `Low enrichment: ${industryPct.toFixed(0)}% industry, ${descPct.toFixed(0)}% description`,
        details,
        checkedAt: new Date(),
      }
    }

    return {
      name: 'Data Quality',
      status: 'healthy',
      message: `Enrichment: ${industryPct.toFixed(0)}% industry, ${descPct.toFixed(0)}% description`,
      details,
      checkedAt: new Date(),
    }
  } catch (error) {
    return {
      name: 'Data Quality',
      status: 'warning',
      message: `Cannot check quality: ${error instanceof Error ? error.message : 'Unknown'}`,
      checkedAt: new Date(),
    }
  }
}

// ============================================================================
// MAIN HEALTH CHECK
// ============================================================================

/**
 * Run all health checks and return a comprehensive report
 */
export async function runHealthCheck(): Promise<SystemHealthReport> {
  logger.info('Running proactive health check...')

  // Run all checks in parallel
  const checks = await Promise.all([
    checkDatabase(),
    checkOpenRouterAPI(),
    checkBraveAPI(),
    checkCircuitBreakers(),
    checkProcessingQueue(),
    checkCacheHealth(),
    checkDataQuality(),
  ])

  // Determine overall status
  const hasCritical = checks.some((c) => c.status === 'critical')
  const hasWarning = checks.some((c) => c.status === 'warning')

  let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (hasCritical) overallStatus = 'critical'
  else if (hasWarning) overallStatus = 'warning'

  // Generate recommendations
  const recommendations: string[] = []

  for (const check of checks) {
    if (check.status === 'critical') {
      switch (check.name) {
        case 'Database':
          recommendations.push('Check database connection string and Neon dashboard')
          break
        case 'OpenRouter API':
          recommendations.push('Verify OPENROUTER_API_KEY in environment variables')
          break
        case 'Processing Queue':
          recommendations.push('Check for stale runs and restart if needed')
          break
        case 'Circuit Breakers':
          recommendations.push('Multiple services degraded - check external API status')
          break
      }
    }
  }

  const report: SystemHealthReport = {
    overallStatus,
    checks,
    timestamp: new Date(),
    recommendations,
  }

  logger.info(`Health check complete: ${overallStatus}`, {
    critical: checks.filter((c) => c.status === 'critical').length,
    warning: checks.filter((c) => c.status === 'warning').length,
    healthy: checks.filter((c) => c.status === 'healthy').length,
  })

  return report
}

/**
 * Run health check and send alerts if issues found
 */
export async function runHealthCheckWithAlerts(): Promise<SystemHealthReport> {
  const report = await runHealthCheck()

  // Send alert for critical issues
  if (report.overallStatus === 'critical') {
    const criticalChecks = report.checks.filter((c) => c.status === 'critical')
    const issues = criticalChecks.map((c) => `${c.name}: ${c.message}`).join('\n')

    await notifyCriticalAlert(
      'DB_COMPLETER' as const, // Use any agent for the alert
      `Health check failed:\n${issues}`,
      report.recommendations.join('\n') || 'Check system logs'
    ).catch((err) => {
      logger.error('Failed to send health alert', { error: err.message })
    })
  }

  return report
}

/**
 * Quick health check (subset of checks)
 */
export async function runQuickHealthCheck(): Promise<{
  healthy: boolean
  issues: string[]
}> {
  const [db, circuitBreakers, queue] = await Promise.all([
    checkDatabase(),
    checkCircuitBreakers(),
    checkProcessingQueue(),
  ])

  const issues: string[] = []

  if (db.status !== 'healthy') issues.push(db.message)
  if (circuitBreakers.status === 'critical') issues.push(circuitBreakers.message)
  if (queue.status === 'critical') issues.push(queue.message)

  return {
    healthy: issues.length === 0,
    issues,
  }
}

// ============================================================================
// SCHEDULED HEALTH CHECK
// ============================================================================

/**
 * Entry point for cron-based health check
 */
export async function scheduledHealthCheck(): Promise<void> {
  const report = await runHealthCheckWithAlerts()

  // Log health check result (don't store in MaintenanceRun - SUPERVISOR is not an agent enum)
  logger.info('Health check stored', {
    status: report.overallStatus,
    checksRun: report.checks.length,
    issues: report.checks.filter((c) => c.status !== 'healthy').length,
  })
}
