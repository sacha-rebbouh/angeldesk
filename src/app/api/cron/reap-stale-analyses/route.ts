/**
 * API Route — Stale Analysis Reaper (fallback cron Vercel du BACKSTOP)
 *
 * Filet de dernier recours. La détection PRIMAIRE des analyses figées est désormais
 * ÉVÉNEMENTIELLE et par-analyse (analysisWatchdogFunction, déclenchée au lancement de
 * chaque analyse) ; le BACKSTOP global est le cron Inngest staleAnalysisReaperFunction
 * (toutes les 12 h, basse fréquence pour ne PAS réveiller Neon à vide). Comme
 * l'enregistrement cloud d'un cron Inngest n'est pas garanti, cette route Vercel appelle
 * le MEME coeur reapStaleAnalyses — idempotent et sûr à exécuter en parallèle (flip
 * atomique RUNNING vers FAILED, refund une seule fois).
 *
 * Securite : Bearer CRON_SECRET en comparaison timing-safe (meme pattern que les
 * routes cron maintenance).
 *
 * Planification : si déclarée côté Vercel (dashboard OU vercel.json), la caler sur la
 * cadence BACKSTOP (~12 h), PAS plus fréquent — sinon on réintroduit le drain compute-hours.
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
