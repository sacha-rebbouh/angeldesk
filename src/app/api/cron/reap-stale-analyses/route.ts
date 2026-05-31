/**
 * API Route — Stale Analysis Reaper (fallback cron Vercel)
 *
 * Filet de secours pour le watchdog des analyses figées. La planification
 * PRIMAIRE est le cron Inngest staleAnalysisReaperFunction (toutes les 5 min).
 * Comme c'est le premier cron Inngest du repo (les autres jobs sont
 * event-triggered) et que l'enregistrement cloud d'un cron Inngest n'est pas
 * garanti, cette route Vercel appelle le MEME coeur reapStaleAnalyses —
 * idempotent et sur a executer en parallele du cron Inngest (flip atomique
 * RUNNING vers FAILED, refund une seule fois).
 *
 * Securite : Bearer CRON_SECRET en comparaison timing-safe (meme pattern que les
 * routes cron maintenance).
 *
 * Planification : a declarer cote Vercel (dashboard OU vercel.json). La frequence
 * (toutes les 5 min) depend du plan Vercel — a verifier.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { reapStaleAnalyses } from '@/lib/analysis-compensation'
import { handleApiError } from '@/lib/api-error'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('CRON_SECRET not configured')
    return false
  }

  const expected = `Bearer ${cronSecret}`
  if (!authHeader || authHeader.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await reapStaleAnalyses()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return handleApiError(error, 'reap stale analyses')
  }
}
