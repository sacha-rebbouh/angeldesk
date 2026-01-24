/**
 * Telegram Commands Handler
 *
 * Gère les commandes reçues via le bot Telegram
 */

import { prisma } from '@/lib/prisma'
import { inngest } from '@/lib/inngest'
import type { TelegramCommandContext, TelegramCommand } from '@/agents/maintenance/types'
import {
  sendToAdmin,
  formatStatusMessage,
  formatHealthMessage,
  formatLastRunMessage,
} from './telegram'

// ============================================================================
// COMMAND ROUTER
// ============================================================================

const COMMANDS: Record<TelegramCommand, (ctx: TelegramCommandContext) => Promise<string>> = {
  status: handleStatus,
  run: handleRun,
  report: handleReport,
  health: handleHealth,
  last: handleLast,
  retry: handleRetry,
  cancel: handleCancel,
  help: handleHelp,
}

/**
 * Parse et route une commande Telegram
 */
export async function handleTelegramCommand(
  ctx: TelegramCommandContext
): Promise<{ success: boolean; response?: string; error?: string }> {
  const command = ctx.command.toLowerCase() as TelegramCommand

  if (!(command in COMMANDS)) {
    return {
      success: false,
      error: `Commande inconnue: /${command}. Utilisez /help pour voir les commandes disponibles.`,
    }
  }

  try {
    const response = await COMMANDS[command](ctx)
    return { success: true, response }
  } catch (error) {
    console.error(`[Telegram] Command /${command} failed:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue',
    }
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * /status - État actuel de tous les agents
 */
async function handleStatus(_ctx: TelegramCommandContext): Promise<string> {
  // Get latest runs for each agent
  const agents = ['DB_CLEANER', 'DB_SOURCER', 'DB_COMPLETER'] as const
  const agentEmojis: Record<string, string> = {
    DB_CLEANER: '🧹',
    DB_SOURCER: '📥',
    DB_COMPLETER: '🔍',
  }

  // Next scheduled runs (approximations based on cron schedule)
  const now = new Date()
  const getNextRun = (agent: string): Date => {
    const d = new Date(now)
    d.setHours(3, 0, 0, 0)

    switch (agent) {
      case 'DB_CLEANER': // Sunday 03:00
        d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
        break
      case 'DB_SOURCER': // Tuesday 03:00
        d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7))
        break
      case 'DB_COMPLETER': // Thursday or Saturday 03:00
        const daysToThursday = (4 - d.getDay() + 7) % 7
        const daysToSaturday = (6 - d.getDay() + 7) % 7
        d.setDate(d.getDate() + Math.min(daysToThursday || 7, daysToSaturday || 7))
        break
    }

    if (d <= now) d.setDate(d.getDate() + 7)
    return d
  }

  const statusData = await Promise.all(
    agents.map(async (agent) => {
      // Check for running
      const runningRun = await prisma.maintenanceRun.findFirst({
        where: { agent, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
      })

      // Get last completed
      const lastRun = await prisma.maintenanceRun.findFirst({
        where: { agent, status: { in: ['COMPLETED', 'PARTIAL', 'FAILED'] } },
        orderBy: { completedAt: 'desc' },
      })

      return {
        name: agent.replace('DB_', ''),
        emoji: agentEmojis[agent],
        lastRun: lastRun
          ? {
              status: lastRun.status,
              time: lastRun.completedAt || lastRun.startedAt!,
              result: formatRunResult(lastRun),
            }
          : undefined,
        nextRun: getNextRun(agent),
        currentRun: runningRun
          ? {
              startTime: runningRun.startedAt!,
              progress:
                runningRun.itemsProcessed > 0 ? `${runningRun.itemsProcessed} traités` : undefined,
            }
          : undefined,
      }
    })
  )

  return formatStatusMessage(statusData)
}

/**
 * /run <agent> - Lance manuellement un agent
 */
async function handleRun(ctx: TelegramCommandContext): Promise<string> {
  const agentArg = ctx.args[0]?.toUpperCase()

  if (!agentArg) {
    return `Usage: /run <agent>\n\nAgents disponibles:\n• cleaner\n• sourcer\n• completer`
  }

  const agentMap: Record<string, string> = {
    CLEANER: 'DB_CLEANER',
    SOURCER: 'DB_SOURCER',
    COMPLETER: 'DB_COMPLETER',
    DB_CLEANER: 'DB_CLEANER',
    DB_SOURCER: 'DB_SOURCER',
    DB_COMPLETER: 'DB_COMPLETER',
  }

  const agent = agentMap[agentArg]
  if (!agent) {
    return `Agent inconnu: ${agentArg}\n\nAgents disponibles:\n• cleaner\n• sourcer\n• completer`
  }

  // Check if already running
  const running = await prisma.maintenanceRun.findFirst({
    where: { agent: agent as 'DB_CLEANER' | 'DB_SOURCER' | 'DB_COMPLETER', status: 'RUNNING' },
  })

  if (running) {
    return `⚠️ ${agent} est déjà en cours d'exécution.\n\nDémarré: ${running.startedAt?.toLocaleString('fr-FR')}`
  }

  // Trigger via Inngest (no time limit, runs in background)
  const eventName = `maintenance/${agent.replace('DB_', '').toLowerCase()}.run` as
    | 'maintenance/cleaner.run'
    | 'maintenance/sourcer.run'
    | 'maintenance/completer.run'

  await inngest.send({
    name: eventName,
    data: {},
  })

  return `🔄 *${agent} lancé via Inngest*

Je te notifierai quand ce sera terminé.`
}

/**
 * /report - Génère le rapport hebdo maintenant
 */
async function handleReport(_ctx: TelegramCommandContext): Promise<string> {
  // Trigger weekly report generation
  const baseUrl = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || process.env.NEXT_PUBLIC_APP_URL
    || 'http://localhost:3003'

  try {
    const response = await fetch(`${baseUrl}/api/cron/maintenance/supervisor/weekly-report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
      },
    })

    if (response.ok) {
      return `📊 Génération du rapport en cours...\n\nTu recevras le rapport dans quelques secondes.`
    } else {
      return `❌ Erreur lors de la génération du rapport.\n\nStatus: ${response.status}`
    }
  } catch (error) {
    return `❌ Impossible de générer le rapport: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
  }
}

/**
 * /health - Métriques de qualité DB
 */
async function handleHealth(_ctx: TelegramCommandContext): Promise<string> {
  // Get latest snapshot or compute metrics
  const snapshot = await prisma.dataQualitySnapshot.findFirst({
    orderBy: { capturedAt: 'desc' },
  })

  if (snapshot) {
    return formatHealthMessage({
      totalCompanies: snapshot.totalCompanies,
      avgQuality: Math.round(snapshot.avgDataQuality),
      withIndustry: snapshot.withIndustryPct,
      duplicates: (snapshot.duplicateCompanies / snapshot.totalCompanies) * 100,
      stale: snapshot.stalePct,
      lastEnrichment: snapshot.capturedAt,
    })
  }

  // Compute fresh metrics
  const [totalCompanies, withIndustry, withDescription] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { industry: { not: null } } }),
    prisma.company.count({ where: { description: { not: null } } }),
  ])

  const avgQuality = totalCompanies > 0 ? Math.round(((withIndustry + withDescription) / (totalCompanies * 2)) * 100) : 0

  return formatHealthMessage({
    totalCompanies,
    avgQuality,
    withIndustry: totalCompanies > 0 ? (withIndustry / totalCompanies) * 100 : 0,
    duplicates: 0, // Would need more complex query
    stale: 0, // Would need more complex query
  })
}

/**
 * /last <agent> - Détails du dernier run
 */
async function handleLast(ctx: TelegramCommandContext): Promise<string> {
  const agentArg = ctx.args[0]?.toUpperCase()

  if (!agentArg) {
    return `Usage: /last <agent>\n\nAgents disponibles:\n• cleaner\n• sourcer\n• completer`
  }

  const agentMap: Record<string, string> = {
    CLEANER: 'DB_CLEANER',
    SOURCER: 'DB_SOURCER',
    COMPLETER: 'DB_COMPLETER',
  }

  const agent = agentMap[agentArg] || agentArg
  if (!['DB_CLEANER', 'DB_SOURCER', 'DB_COMPLETER'].includes(agent)) {
    return `Agent inconnu: ${agentArg}`
  }

  const lastRun = await prisma.maintenanceRun.findFirst({
    where: { agent: agent as 'DB_CLEANER' | 'DB_SOURCER' | 'DB_COMPLETER' },
    orderBy: { createdAt: 'desc' },
  })

  if (!lastRun) {
    return formatLastRunMessage(agent, null)
  }

  // Build stats from details
  const details = (lastRun.details as Record<string, unknown>) || {}
  const stats: Record<string, number | string> = {
    'Items traités': lastRun.itemsProcessed,
    'Items mis à jour': lastRun.itemsUpdated,
    'Items créés': lastRun.itemsCreated,
  }

  // Add agent-specific stats
  if (agent === 'DB_CLEANER') {
    if (details.duplicateCompaniesMerged) stats['Doublons fusionnés'] = details.duplicateCompaniesMerged as number
  } else if (agent === 'DB_SOURCER') {
    if (details.sourcesScraped) stats['Sources scrapées'] = details.sourcesScraped as number
    if (details.articlesFound) stats['Articles trouvés'] = details.articlesFound as number
  } else if (agent === 'DB_COMPLETER') {
    if (details.companiesEnriched) stats['Companies enrichies'] = details.companiesEnriched as number
    if (details.avgConfidence) stats['Confidence moyenne'] = `${details.avgConfidence}%`
  }

  const errors = (lastRun.errors as Array<{ message: string }>) || []

  return formatLastRunMessage(agent, {
    status: lastRun.status,
    startedAt: lastRun.startedAt!,
    durationMs: lastRun.durationMs || 0,
    stats,
    cost: lastRun.totalCost ? Number(lastRun.totalCost) : undefined,
    errors: errors.map((e) => e.message),
  })
}

/**
 * /retry <agent> - Force un retry
 */
async function handleRetry(ctx: TelegramCommandContext): Promise<string> {
  const agentArg = ctx.args[0]?.toUpperCase()

  if (!agentArg) {
    return `Usage: /retry <agent>\n\nAgents disponibles:\n• cleaner\n• sourcer\n• completer`
  }

  // Same as /run but marks as SUPERVISOR triggered
  const agentMap: Record<string, string> = {
    CLEANER: 'DB_CLEANER',
    SOURCER: 'DB_SOURCER',
    COMPLETER: 'DB_COMPLETER',
  }

  const agent = agentMap[agentArg]
  if (!agent) {
    return `Agent inconnu: ${agentArg}`
  }

  // Get last failed run
  const lastFailed = await prisma.maintenanceRun.findFirst({
    where: {
      agent: agent as 'DB_CLEANER' | 'DB_SOURCER' | 'DB_COMPLETER',
      status: { in: ['FAILED', 'PARTIAL', 'TIMEOUT'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Create retry run
  const run = await prisma.maintenanceRun.create({
    data: {
      agent: agent as 'DB_CLEANER' | 'DB_SOURCER' | 'DB_COMPLETER',
      status: 'PENDING',
      triggeredBy: 'MANUAL',
      parentRunId: lastFailed?.id,
      retryAttempt: (lastFailed?.retryAttempt || 0) + 1,
      scheduledAt: new Date(),
    },
  })

  // Trigger via Inngest with existing runId
  const eventName = `maintenance/${agent.replace('DB_', '').toLowerCase()}.run` as
    | 'maintenance/cleaner.run'
    | 'maintenance/sourcer.run'
    | 'maintenance/completer.run'

  await inngest.send({
    name: eventName,
    data: { runId: run.id },
  })

  return `🔄 Retry de ${agent} lancé via Inngest.\n\nTentative #${run.retryAttempt}`
}

/**
 * /cancel - Annule un run en cours
 */
async function handleCancel(ctx: TelegramCommandContext): Promise<string> {
  const agentArg = ctx.args[0]?.toUpperCase()

  // Find running runs
  const whereClause = agentArg
    ? {
        agent: `DB_${agentArg}` as 'DB_CLEANER' | 'DB_SOURCER' | 'DB_COMPLETER',
        status: 'RUNNING' as const,
      }
    : { status: 'RUNNING' as const }

  const runningRuns = await prisma.maintenanceRun.findMany({
    where: whereClause,
  })

  if (runningRuns.length === 0) {
    return agentArg
      ? `Aucun run de ${agentArg} en cours.`
      : `Aucun run en cours.`
  }

  // Cancel all running runs
  await prisma.maintenanceRun.updateMany({
    where: { id: { in: runningRuns.map((r) => r.id) } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })

  const cancelled = runningRuns.map((r) => r.agent).join(', ')
  return `✅ Run(s) annulé(s): ${cancelled}`
}

/**
 * /help - Liste des commandes
 */
async function handleHelp(_ctx: TelegramCommandContext): Promise<string> {
  return `🤖 *Angel Desk Maintenance Bot*

Commandes disponibles:

/status - État actuel de tous les agents
/run <agent> - Lance manuellement un agent
/report - Génère le rapport hebdo
/health - Métriques de qualité DB
/last <agent> - Détails du dernier run
/retry <agent> - Force un retry
/cancel [agent] - Annule un run en cours
/help - Cette aide

Agents: cleaner, sourcer, completer`
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRunResult(run: {
  itemsProcessed: number
  itemsCreated: number
  itemsUpdated: number
  details: unknown
}): string {
  const details = run.details as Record<string, unknown> | null

  if (details?.duplicateCompaniesMerged) {
    return `${details.duplicateCompaniesMerged} merged`
  }
  if (run.itemsCreated > 0) {
    return `+${run.itemsCreated} new`
  }
  if (run.itemsUpdated > 0) {
    return `${run.itemsUpdated} updated`
  }
  return `${run.itemsProcessed} processed`
}
