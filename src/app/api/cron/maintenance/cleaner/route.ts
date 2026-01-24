/**
 * API Route - DB_CLEANER Cron
 *
 * Déclenché par Vercel Cron tous les lundis à 3h
 * Nettoie les doublons et normalise les données
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCleaner } from '@/agents/maintenance/db-cleaner'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max

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

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Create run record
    const run = await prisma.maintenanceRun.create({
      data: {
        agent: 'DB_CLEANER',
        status: 'PENDING',
        triggeredBy: 'CRON',
        scheduledAt: new Date(),
      },
    })

    // Run the agent and wait for completion (max 5 min on Vercel)
    const result = await runCleaner({ runId: run.id })

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'DB_CLEANER completed',
      result,
    })
  } catch (error) {
    console.error('Failed to start DB_CLEANER:', error)
    return NextResponse.json(
      { error: 'Failed to start cleaner' },
      { status: 500 }
    )
  }
}

// POST for manual triggers (from Telegram or retry)
export async function POST(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const runId = body.runId as string | undefined

    let run
    if (runId) {
      // Use existing run (retry scenario)
      run = await prisma.maintenanceRun.findUnique({
        where: { id: runId },
      })
      if (!run) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      }
    } else {
      // Create new run
      run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_CLEANER',
          status: 'PENDING',
          triggeredBy: 'MANUAL',
          scheduledAt: new Date(),
        },
      })
    }

    // Run the agent and wait for completion
    const result = await runCleaner({ runId: run.id })

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'DB_CLEANER completed',
      result,
    })
  } catch (error) {
    console.error('Failed to start DB_CLEANER:', error)
    return NextResponse.json(
      { error: 'Failed to start cleaner' },
      { status: 500 }
    )
  }
}
