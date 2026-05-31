/**
 * API Route — Stale Analysis Reaper (fallback cron Vercel)
 *
 * Filet de secours pour le watchdog des analyses figées. La planification
 * PRIMAIRE est le cron Inngest `staleAnalysisReaperFunction` (*/5). Comme c'est
 * le premier cron Inngest du repo (les autres jobs sont event-triggered) et que
 * l'enregistrement cloud d'un `{ cron }` n'est pas garanti, cette route Vercel
 * appelle le MÊME cœur `reapStaleAnalyses` — idempotent et sûr à exécuter en
 * parallèle du cron Inngest (flip atomique RUNNING→FAILED, refund une seule fois).
 *
 * Sécurité : Bearer CRON_SECRET en comparaison timing-safe (même pattern que les
 * routes cron maintenance).
 *
 * Planification : à déclarer côté Vercel (dashboard OU vercel.json). La fréquence
 * `*/5` dépend du plan Vercel — à vérifier.
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
