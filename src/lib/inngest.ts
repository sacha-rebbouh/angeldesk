/**
 * Inngest Client & Functions
 *
 * Background jobs pour les agents de maintenance (pas de limite de temps)
 */

import { Inngest } from 'inngest'
import { runCleaner } from '@/agents/maintenance/db-cleaner'
import { runSourcer } from '@/agents/maintenance/db-sourcer'
import { runCompleter } from '@/agents/maintenance/db-completer'
import { prisma } from '@/lib/prisma'
import { notifyAgentCompleted, notifyAgentFailed } from '@/services/notifications'

// Create the Inngest client
export const inngest = new Inngest({
  id: 'angeldesk',
  name: 'Angel Desk',
})

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * DB_CLEANER - Nettoie les doublons et normalise les données
 */
export const cleanerFunction = inngest.createFunction(
  {
    id: 'db-cleaner',
    name: 'DB Cleaner',
    retries: 2,
  },
  { event: 'maintenance/cleaner.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_CLEANER',
          status: 'PENDING',
          triggeredBy: 'CRON', // Inngest triggered via cron
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Step 2: Run the cleaner
    const result = await step.run('run-cleaner', async () => {
      return await runCleaner({ runId })
    })

    // Step 3: Notify via Telegram
    await step.run('notify', async () => {
      if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
        await notifyAgentCompleted('DB_CLEANER', {
          itemsProcessed: result.itemsProcessed,
          durationMs: result.durationMs,
        })
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_CLEANER', errorMsg, false)
      }
    })

    return result
  }
)

/**
 * DB_SOURCER - Scrappe les sources et importe les nouveaux deals
 */
export const sourcerFunction = inngest.createFunction(
  {
    id: 'db-sourcer',
    name: 'DB Sourcer',
    retries: 2,
  },
  { event: 'maintenance/sourcer.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_SOURCER',
          status: 'PENDING',
          triggeredBy: 'CRON',
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Step 2: Run the sourcer
    const result = await step.run('run-sourcer', async () => {
      return await runSourcer(runId)
    })

    // Step 3: Notify via Telegram
    await step.run('notify', async () => {
      if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
        await notifyAgentCompleted('DB_SOURCER', {
          itemsProcessed: result.itemsProcessed,
          itemsCreated: result.itemsCreated,
          durationMs: result.durationMs,
        })
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_SOURCER', errorMsg, false)
      }
    })

    return result
  }
)

/**
 * DB_COMPLETER - Enrichit les entreprises avec des données web + LLM
 */
export const completerFunction = inngest.createFunction(
  {
    id: 'db-completer',
    name: 'DB Completer',
    retries: 1, // Less retries because it uses LLM credits
  },
  { event: 'maintenance/completer.run' },
  async ({ event, step }) => {
    const { runId: existingRunId } = event.data as { runId?: string }

    // Step 1: Create or get run record
    const runId = await step.run('create-run', async () => {
      if (existingRunId) {
        return existingRunId
      }
      const run = await prisma.maintenanceRun.create({
        data: {
          agent: 'DB_COMPLETER',
          status: 'PENDING',
          triggeredBy: 'CRON',
          scheduledAt: new Date(),
        },
      })
      return run.id
    })

    // Step 2: Run the completer
    const result = await step.run('run-completer', async () => {
      return await runCompleter(runId)
    })

    // Step 3: Notify via Telegram
    await step.run('notify', async () => {
      if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
        await notifyAgentCompleted('DB_COMPLETER', {
          itemsProcessed: result.itemsProcessed,
          durationMs: result.durationMs,
          cost: result.totalCost ? Number(result.totalCost) : undefined,
        })
      } else {
        const errorMsg = result.errors?.[0]?.message || 'Unknown error'
        await notifyAgentFailed('DB_COMPLETER', errorMsg, false)
      }
    })

    return result
  }
)

// Export all functions for the serve handler
export const functions = [cleanerFunction, sourcerFunction, completerFunction]
