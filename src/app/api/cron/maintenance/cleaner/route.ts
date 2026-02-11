/**
 * API Route - DB_CLEANER Cron
 *
 * Déclenché par Vercel Cron tous les lundis à 3h
 * Trigger Inngest pour exécuter le cleaner (pas de limite de temps)
 */

import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'
import { handleApiError } from "@/lib/api-error";

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
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Trigger Inngest function (runs in background, no time limit)
    await inngest.send({
      name: 'maintenance/cleaner.run',
      data: {},
    })

    return NextResponse.json({
      success: true,
      message: 'DB_CLEANER triggered via Inngest',
    })
  } catch (error) {
    return handleApiError(error, "trigger cleaner")
  }
}

// POST for manual triggers (from Telegram)
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const runId = body.runId as string | undefined

    // Trigger Inngest function with optional runId
    await inngest.send({
      name: 'maintenance/cleaner.run',
      data: { runId },
    })

    return NextResponse.json({
      success: true,
      message: 'DB_CLEANER triggered via Inngest',
      runId,
    })
  } catch (error) {
    return handleApiError(error, "trigger cleaner")
  }
}
