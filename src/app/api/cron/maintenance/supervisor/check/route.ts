/**
 * API Route - SUPERVISOR Check Cron
 *
 * Déclenché par Vercel Cron:
 * - 5h (après CLEANER à 3h)
 * - 8h (après SOURCER à 6h)
 * - 10h (après COMPLETER à 8h)
 *
 * Vérifie que les agents ont bien tourné et déclenche les retries
 */

import { NextRequest, NextResponse } from 'next/server'
import { supervisorCheck, checkRetryResult } from '@/agents/maintenance/supervisor'
import { getPendingRetryChecks } from '@/agents/maintenance/supervisor/retry'
import type { MaintenanceAgent } from '@prisma/client'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute max

/**
 * Vérifie le secret cron pour sécuriser l'endpoint
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('CRON_SECRET not configured')
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

/**
 * Détermine quel agent vérifier selon l'heure
 */
function getAgentToCheck(): MaintenanceAgent | null {
  const hour = new Date().getUTCHours()

  // 5h UTC = après CLEANER (3h)
  if (hour >= 5 && hour < 6) {
    return 'DB_CLEANER'
  }

  // 8h UTC = après SOURCER (6h)
  if (hour >= 8 && hour < 9) {
    return 'DB_SOURCER'
  }

  // 10h UTC = après COMPLETER (8h)
  if (hour >= 10 && hour < 11) {
    return 'DB_COMPLETER'
  }

  return null
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: Array<{ agent: string; status: string; action: string }> = []

    // 1. Check pending retries first
    const pendingRetries = await getPendingRetryChecks()
    for (const retry of pendingRetries) {
      await checkRetryResult(retry.agent, retry.retryRunId)
      results.push({
        agent: retry.agent,
        status: 'retry_checked',
        action: 'checked_retry',
      })
    }

    // 2. Check the scheduled agent
    const agent = getAgentToCheck()
    if (agent) {
      const result = await supervisorCheck(agent)
      results.push({
        agent,
        status: result.checkStatus,
        action: result.actionTaken,
      })
    }

    return NextResponse.json({
      success: true,
      checked: results.length,
      results,
    })
  } catch (error) {
    console.error('Supervisor check error:', error)
    return NextResponse.json(
      { error: 'Check failed' },
      { status: 500 }
    )
  }
}

// POST for manual checks (from Telegram)
export async function POST(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const agent = body.agent as MaintenanceAgent | undefined

    if (!agent) {
      // Check all agents
      const agents: MaintenanceAgent[] = ['DB_CLEANER', 'DB_SOURCER', 'DB_COMPLETER']
      const results = []

      for (const a of agents) {
        const result = await supervisorCheck(a)
        results.push({
          agent: a,
          status: result.checkStatus,
          action: result.actionTaken,
        })
      }

      return NextResponse.json({
        success: true,
        checked: results.length,
        results,
      })
    }

    // Check specific agent
    const result = await supervisorCheck(agent)

    return NextResponse.json({
      success: true,
      agent,
      status: result.checkStatus,
      action: result.actionTaken,
      details: result.details,
    })
  } catch (error) {
    console.error('Supervisor check error:', error)
    return NextResponse.json(
      { error: 'Check failed' },
      { status: 500 }
    )
  }
}
