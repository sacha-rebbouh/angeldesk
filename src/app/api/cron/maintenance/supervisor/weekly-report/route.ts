/**
 * API Route - SUPERVISOR Weekly Report Cron
 *
 * Déclenché par Vercel Cron tous les lundis à 9h
 * Génère et envoie le rapport hebdomadaire
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyReport } from '@/agents/maintenance/supervisor'
import { handleApiError } from "@/lib/api-error";

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes max

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
    const report = await generateWeeklyReport()

    return NextResponse.json({
      success: true,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      overallStatus: report.overallStatus,
      issues: report.issues.length,
      totalCost: report.totalCost.toFixed(2),
    })
  } catch (error) {
    return handleApiError(error, "generate weekly report")
  }
}

// POST for manual trigger (from Telegram)
export async function POST(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await generateWeeklyReport()

    return NextResponse.json({
      success: true,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      overallStatus: report.overallStatus,
      agentSummaries: {
        cleaner: {
          runs: `${report.agentSummaries.cleaner.successfulRuns}/${report.agentSummaries.cleaner.totalRuns}`,
          processed: report.agentSummaries.cleaner.itemsProcessed,
        },
        sourcer: {
          runs: `${report.agentSummaries.sourcer.successfulRuns}/${report.agentSummaries.sourcer.totalRuns}`,
          created: report.agentSummaries.sourcer.itemsCreated,
        },
        completer: {
          runs: `${report.agentSummaries.completer.successfulRuns}/${report.agentSummaries.completer.totalRuns}`,
          enriched: report.agentSummaries.completer.itemsUpdated,
        },
      },
      qualityDelta: report.qualityDelta,
      issues: report.issues.length,
      totalCost: report.totalCost.toFixed(2),
    })
  } catch (error) {
    return handleApiError(error, "generate weekly report")
  }
}
