/**
 * API Route - DB_SOURCER Cron
 *
 * Déclenché par Vercel Cron tous les jours à 6h
 * Scrappe les sources et importe les nouveaux deals
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runSourcer } from '@/agents/maintenance/db-sourcer'

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
        agent: 'DB_SOURCER',
        status: 'PENDING',
        triggeredBy: 'CRON',
        scheduledAt: new Date(),
      },
    })

    // Run the agent (don't await to avoid timeout)
    runSourcer(run.id).catch((error) => {
      console.error('DB_SOURCER error:', error)
    })

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'DB_SOURCER started',
    })
  } catch (error) {
    console.error('Failed to start DB_SOURCER:', error)
    return NextResponse.json(
      { error: 'Failed to start sourcer' },
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
          agent: 'DB_SOURCER',
          status: 'PENDING',
          triggeredBy: 'MANUAL',
          scheduledAt: new Date(),
        },
      })
    }

    // Run the agent
    runSourcer(run.id).catch((error) => {
      console.error('DB_SOURCER error:', error)
    })

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'DB_SOURCER started',
    })
  } catch (error) {
    console.error('Failed to start DB_SOURCER:', error)
    return NextResponse.json(
      { error: 'Failed to start sourcer' },
      { status: 500 }
    )
  }
}
