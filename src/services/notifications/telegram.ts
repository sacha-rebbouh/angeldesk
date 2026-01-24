/**
 * Telegram Notification Service
 *
 * Service pour envoyer des messages et notifications via Telegram Bot API
 */

import type {
  TelegramMessage,
  SupervisorCheckDetails,
  ErrorCategory,
} from '@/agents/maintenance/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  }
  if (!adminChatId) {
    throw new Error('TELEGRAM_ADMIN_CHAT_ID is not configured')
  }

  return { token, adminChatId }
}

// ============================================================================
// CORE API
// ============================================================================

interface TelegramApiResponse<T = unknown> {
  ok: boolean
  result?: T
  error_code?: number
  description?: string
}

interface SentMessage {
  message_id: number
  chat: { id: number }
  date: number
  text?: string
}

/**
 * Appelle l'API Telegram
 */
async function callTelegramApi<T>(
  method: string,
  params: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const { token } = getConfig()
  const url = `${TELEGRAM_API_BASE}${token}/${method}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    const data = (await response.json()) as TelegramApiResponse<T>

    if (!data.ok) {
      console.error('[Telegram] API error:', data.description)
    }

    return data
  } catch (error) {
    console.error('[Telegram] Request failed:', error)
    return {
      ok: false,
      description: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// SEND MESSAGES
// ============================================================================

/**
 * Envoie un message texte
 */
export async function sendMessage(
  message: TelegramMessage
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const response = await callTelegramApi<SentMessage>('sendMessage', {
    chat_id: message.chatId,
    text: message.text,
    parse_mode: message.parseMode || 'Markdown',
    disable_notification: message.disableNotification || false,
  })

  if (response.ok && response.result) {
    return { success: true, messageId: response.result.message_id }
  }

  return { success: false, error: response.description }
}

/**
 * Envoie un message à l'admin
 */
export async function sendToAdmin(
  text: string,
  options: { parseMode?: 'Markdown' | 'HTML'; silent?: boolean } = {}
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const { adminChatId } = getConfig()

  return sendMessage({
    chatId: adminChatId,
    text,
    parseMode: options.parseMode || 'Markdown',
    disableNotification: options.silent,
  })
}

/**
 * Met à jour un message existant
 */
export async function editMessage(
  chatId: string,
  messageId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<{ success: boolean; error?: string }> {
  const response = await callTelegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
  })

  return { success: response.ok, error: response.description }
}

// ============================================================================
// FORMATTED NOTIFICATIONS
// ============================================================================

/**
 * Notification: Agent démarré
 */
export async function notifyAgentStarted(
  agent: string,
  scheduledTime?: Date
): Promise<{ success: boolean; messageId?: number }> {
  const time = scheduledTime
    ? scheduledTime.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

  const text = `ℹ️ *Angel Desk Maintenance*

🔄 ${agent} démarré
📅 ${time}`

  return sendToAdmin(text, { silent: true })
}

/**
 * Notification: Agent terminé avec succès
 */
export async function notifyAgentCompleted(
  agent: string,
  stats: { itemsProcessed?: number; itemsCreated?: number; durationMs?: number; cost?: number }
): Promise<{ success: boolean; messageId?: number }> {
  const parts = [`✅ *Angel Desk Maintenance*`, '', `${agent} terminé`]

  if (stats.itemsProcessed !== undefined) {
    parts.push(`📊 ${stats.itemsProcessed} items traités`)
  }
  if (stats.itemsCreated !== undefined && stats.itemsCreated > 0) {
    parts.push(`➕ ${stats.itemsCreated} nouveaux`)
  }
  if (stats.durationMs !== undefined) {
    const duration = formatDuration(stats.durationMs)
    parts.push(`⏱ Durée: ${duration}`)
  }
  if (stats.cost !== undefined && stats.cost > 0) {
    parts.push(`💰 Coût: $${stats.cost.toFixed(4)}`)
  }

  return sendToAdmin(parts.join('\n'))
}

/**
 * Notification: Agent échoué (version enrichie avec contexte)
 */
export async function notifyAgentFailed(
  agent: string,
  error: string,
  willRetry: boolean,
  retryAttempt?: number,
  details?: SupervisorCheckDetails,
  retryDelayMs?: number
): Promise<{ success: boolean; messageId?: number }> {
  const parts = [`⚠️ *Angel Desk Maintenance*`, '', `${agent} a échoué`]

  // Add run info if available
  if (details?.runDurationMs) {
    parts.push(`⏱ Durée: ${formatDuration(details.runDurationMs)}`)
  }
  if (details?.itemsProcessed !== undefined) {
    parts.push(`📊 Traités: ${details.itemsProcessed}`)
  }

  // Add error context if available
  if (details?.lastErrors && details.lastErrors.length > 0) {
    parts.push('', '❌ *Erreurs:*')
    details.lastErrors.forEach((err, index) => {
      const emoji = getCategoryEmoji(err.category)
      parts.push(`${index + 1}. ${emoji} \`${escapeMarkdown(err.message.slice(0, 100))}\``)
      if (err.stackFirstLine) {
        parts.push(`   ↳ at ${escapeMarkdown(err.stackFirstLine)}`)
      }
    })

    // Add pattern summary
    if (details.errorSummary) {
      const { dominantCategory, dominantPercentage, totalErrors } = details.errorSummary
      parts.push('')
      parts.push(`📊 *Pattern:* ${dominantPercentage}% ${formatCategory(dominantCategory)} (${totalErrors} total)`)
    }
  } else {
    parts.push(`❌ Erreur: ${escapeMarkdown(error)}`)
  }

  // Add retry info
  if (willRetry && retryAttempt !== undefined) {
    const delayStr = retryDelayMs ? formatDuration(retryDelayMs) : '5min'
    parts.push('', `🔄 Retry automatique dans ${delayStr}...`, `⏱ Tentative ${retryAttempt}/2`)

    // Add adjustment hints if available
    if (details?.errorSummary?.dominantCategory === 'RATE_LIMIT') {
      parts.push(`💡 Backoff étendu (rate limit détecté)`)
    } else if (details?.errorSummary?.dominantCategory === 'TIMEOUT') {
      parts.push(`💡 Timeout augmenté pour le retry`)
    }
  } else if (!willRetry) {
    parts.push('', `🚫 Pas de retry (max atteint ou erreur fatale)`)
  }

  return sendToAdmin(parts.join('\n'))
}

/**
 * Notification: Retry réussi
 */
export async function notifyRetrySuccess(
  agent: string,
  stats: { itemsProcessed?: number; durationMs?: number }
): Promise<{ success: boolean; messageId?: number }> {
  const parts = [`✅ *Angel Desk Maintenance*`, '', `${agent} récupéré avec succès!`]

  if (stats.itemsProcessed !== undefined) {
    parts.push(`📊 ${stats.itemsProcessed} items traités`)
  }
  if (stats.durationMs !== undefined) {
    parts.push(`⏱ Durée: ${formatDuration(stats.durationMs)}`)
  }

  return sendToAdmin(parts.join('\n'))
}

/**
 * Notification: Alerte critique (version enrichie)
 */
export async function notifyCriticalAlert(
  agent: string,
  error: string,
  action: string,
  details?: SupervisorCheckDetails
): Promise<{ success: boolean; messageId?: number }> {
  const parts = [
    `🚨 *${agent} FAILED*`,
    '━━━━━━━━━━━━━━━━━━━━━━',
  ]

  // Add run info
  if (details?.runDurationMs) {
    parts.push(`⏱ Durée: ${formatDuration(details.runDurationMs)}`)
  }
  if (details?.itemsProcessed !== undefined) {
    parts.push(`📊 Traités: ${details.itemsProcessed}`)
  }

  // Add detailed errors if available
  if (details?.lastErrors && details.lastErrors.length > 0) {
    parts.push('', '❌ *Erreurs (dernières 3):*')
    details.lastErrors.forEach((err, index) => {
      const emoji = getCategoryEmoji(err.category)
      parts.push(`${index + 1}. ${emoji} \`${escapeMarkdown(err.message.slice(0, 150))}\``)
      if (err.stackFirstLine) {
        parts.push(`   ↳ at ${escapeMarkdown(err.stackFirstLine)}`)
      }
    })

    // Add pattern analysis
    if (details.errorSummary) {
      const { dominantCategory, dominantPercentage, totalErrors } = details.errorSummary
      parts.push('')
      parts.push(`📊 *Pattern:* ${dominantPercentage}% ${formatCategory(dominantCategory)} (${totalErrors} erreurs)`)

      // Add specific recommendations based on pattern
      parts.push('')
      parts.push('💡 *Diagnostic:*')
      switch (dominantCategory) {
        case 'RATE_LIMIT':
          parts.push('• API rate limit atteint')
          parts.push('• Vérifier les quotas OpenRouter/Brave')
          parts.push('• Considérer augmenter le délai entre requêtes')
          break
        case 'TIMEOUT':
          parts.push('• Opérations trop longues')
          parts.push('• Vérifier les performances DB')
          parts.push('• Considérer réduire le batch size')
          break
        case 'NETWORK':
          parts.push('• Problèmes réseau/DNS')
          parts.push('• Vérifier la connectivité Vercel')
          parts.push('• Peut être transitoire')
          break
        case 'AUTH':
          parts.push('• Problème d\'authentification API')
          parts.push('• Vérifier OPENROUTER\\_API\\_KEY')
          parts.push('• Vérifier les credentials Neon')
          break
        case 'DATABASE':
          parts.push('• Problème base de données')
          parts.push('• Vérifier Neon Console')
          parts.push('• Vérifier le connection pool')
          break
        default:
          parts.push('• Erreur non catégorisée')
          parts.push('• Consulter les logs Vercel')
      }
    }
  } else {
    parts.push('', '❌ *Dernière erreur:*')
    parts.push(`> ${escapeMarkdown(error)}`)
  }

  parts.push('')
  parts.push('━━━━━━━━━━━━━━━━━━━━━━')
  parts.push(`🔧 *Action:* ${action}`)

  return sendToAdmin(parts.join('\n'))
}

/**
 * Notification: Rapport hebdomadaire
 */
export async function notifyWeeklyReport(report: {
  weekStart: Date
  weekEnd: Date
  overallStatus: string
  agents: Array<{
    name: string
    emoji: string
    runs: string
    result: string
  }>
  metrics: Array<{
    name: string
    before: string | number
    after: string | number
    delta: string
  }>
  incidents: number
  incidentDetails?: Array<{ day: string; agent: string; result: string }>
  totalCost: number
}): Promise<{ success: boolean; messageId?: number }> {
  const weekRange = `${formatDate(report.weekStart)}-${formatDate(report.weekEnd)}`

  const statusEmoji = report.overallStatus === 'HEALTHY' ? '✅' : report.overallStatus === 'DEGRADED' ? '⚠️' : '🚨'

  // Build agents table
  const agentsRows = report.agents
    .map((a) => `│ ${a.emoji} ${a.name.padEnd(8)} │ ${a.runs.padEnd(6)} │ ${a.result.padEnd(8)} │`)
    .join('\n')

  // Build metrics table
  const metricsRows = report.metrics
    .map(
      (m) =>
        `│ ${m.name.padEnd(15)} │ ${String(m.before).padEnd(6)} │ ${String(m.after).padEnd(6)} │ ${m.delta.padEnd(5)} │`
    )
    .join('\n')

  // Build incidents section
  let incidentsSection = ''
  if (report.incidents > 0 && report.incidentDetails) {
    incidentsSection =
      `\n🔧 *INCIDENTS: ${report.incidents}*\n` +
      report.incidentDetails.map((i) => `• ${i.day}: ${i.agent} → ${i.result}`).join('\n')
  }

  const text = `📊 *Angel Desk - Rapport Hebdo*
_Semaine du ${weekRange}_

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏥 *SANTÉ: ${statusEmoji} ${report.overallStatus}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *AGENTS*
┌────────────┬────────┬──────────┐
│ Agent      │ Status │ Résultat │
├────────────┼────────┼──────────┤
${agentsRows}
└────────────┴────────┴──────────┘

📈 *ÉVOLUTION DATA*
┌─────────────────┬────────┬────────┬───────┐
│ Métrique        │ Avant  │ Après  │ Delta │
├─────────────────┼────────┼────────┼───────┤
${metricsRows}
└─────────────────┴────────┴────────┴───────┘
${incidentsSection}
💰 *COÛT: $${report.totalCost.toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━`

  return sendToAdmin(text)
}

// ============================================================================
// STATUS RESPONSES
// ============================================================================

/**
 * Génère le message de status pour /status
 */
export function formatStatusMessage(agents: Array<{
  name: string
  emoji: string
  lastRun?: { status: string; time: Date; result?: string }
  nextRun?: Date
  currentRun?: { startTime: Date; progress?: string }
}>): string {
  const parts = ['📊 *Status Maintenance*', '']

  for (const agent of agents) {
    parts.push(`${agent.emoji} ${agent.name}`)

    if (agent.currentRun) {
      const elapsed = Math.floor((Date.now() - agent.currentRun.startTime.getTime()) / 60000)
      parts.push(`└ 🔄 EN COURS (${elapsed}min)`)
      if (agent.currentRun.progress) {
        parts.push(`└ Progress: ${agent.currentRun.progress}`)
      }
    } else if (agent.lastRun) {
      const statusEmoji = agent.lastRun.status === 'COMPLETED' ? '✅' : agent.lastRun.status === 'PARTIAL' ? '⚠️' : '❌'
      const timeStr = formatDateTime(agent.lastRun.time)
      parts.push(`└ Dernier: ${statusEmoji} ${timeStr}${agent.lastRun.result ? ` (${agent.lastRun.result})` : ''}`)
    } else {
      parts.push(`└ Dernier: Aucun`)
    }

    if (agent.nextRun) {
      parts.push(`└ Prochain: ${formatDateTime(agent.nextRun)}`)
    }

    parts.push('')
  }

  return parts.join('\n')
}

/**
 * Génère le message de santé pour /health
 */
export function formatHealthMessage(health: {
  totalCompanies: number
  avgQuality: number
  withIndustry: number
  duplicates: number
  stale: number
  lastEnrichment?: Date
}): string {
  const qualityEmoji = health.avgQuality >= 70 ? '✅' : health.avgQuality >= 50 ? '⚠️' : '❌'

  return `📈 *Santé de la DB*

Companies: ${health.totalCompanies.toLocaleString()}
Qualité moyenne: ${health.avgQuality}/100

${health.withIndustry >= 90 ? '✅' : '⚠️'} Avec industrie: ${health.withIndustry.toFixed(1)}%
${health.duplicates <= 1 ? '✅' : '⚠️'} Doublons: ${health.duplicates.toFixed(1)}%
${health.stale <= 20 ? '✅' : '⚠️'} Données >30j: ${health.stale.toFixed(1)}%

${health.lastEnrichment ? `Dernier enrichissement: ${formatRelativeTime(health.lastEnrichment)}` : 'Aucun enrichissement récent'}`
}

/**
 * Génère le message de dernier run pour /last
 */
export function formatLastRunMessage(
  agent: string,
  run: {
    status: string
    startedAt: Date
    durationMs: number
    stats: Record<string, number | string>
    cost?: number
    errors?: string[]
  } | null
): string {
  if (!run) {
    return `📋 *Dernier run ${agent}*\n\nAucun run trouvé.`
  }

  const statusEmoji =
    run.status === 'COMPLETED' ? '✅' : run.status === 'PARTIAL' ? '⚠️' : run.status === 'RUNNING' ? '🔄' : '❌'

  const parts = [
    `📋 *Dernier run ${agent}*`,
    '',
    `Status: ${statusEmoji} ${run.status}`,
    `Démarré: ${formatDateTime(run.startedAt)}`,
    `Durée: ${formatDuration(run.durationMs)}`,
    '',
    '📊 Résultats:',
  ]

  for (const [key, value] of Object.entries(run.stats)) {
    parts.push(`• ${key}: ${value}`)
  }

  if (run.cost !== undefined && run.cost > 0) {
    parts.push('', `💰 Coût: $${run.cost.toFixed(4)}`)
  }

  if (run.errors && run.errors.length > 0) {
    parts.push('', '❌ Erreurs:', ...run.errors.slice(0, 3).map((e) => `• ${escapeMarkdown(e)}`))
    if (run.errors.length > 3) {
      parts.push(`... et ${run.errors.length - 3} autres`)
    }
  }

  return parts.join('\n')
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Échappe les caractères spéciaux Markdown
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

/**
 * Get emoji for error category
 */
function getCategoryEmoji(category: ErrorCategory): string {
  switch (category) {
    case 'RATE_LIMIT':
      return '🚦'
    case 'TIMEOUT':
      return '⏱️'
    case 'NETWORK':
      return '🌐'
    case 'AUTH':
      return '🔐'
    case 'RESOURCE':
      return '💾'
    case 'DATABASE':
      return '🗄️'
    case 'VALIDATION':
      return '⚠️'
    case 'EXTERNAL_API':
      return '🔌'
    default:
      return '❓'
  }
}

/**
 * Format error category for display
 */
function formatCategory(category: ErrorCategory): string {
  switch (category) {
    case 'RATE_LIMIT':
      return 'rate limit'
    case 'TIMEOUT':
      return 'timeout'
    case 'NETWORK':
      return 'network'
    case 'AUTH':
      return 'auth'
    case 'RESOURCE':
      return 'resource'
    case 'DATABASE':
      return 'database'
    case 'VALIDATION':
      return 'validation'
    case 'EXTERNAL_API':
      return 'external API'
    default:
      return 'unknown'
  }
}

/**
 * Formate une durée en ms
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min`
  return `${(ms / 3600000).toFixed(1)}h`
}

/**
 * Formate une date courte
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/**
 * Formate une date avec heure
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formate une date relative (il y a X)
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `il y a ${minutes}min`

  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `il y a ${hours}h`

  const days = Math.floor(diff / 86400000)
  return `il y a ${days}j`
}

// ============================================================================
// WEBHOOK SETUP
// ============================================================================

/**
 * Configure le webhook Telegram
 */
export async function setWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  const response = await callTelegramApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message'],
  })

  return { success: response.ok, error: response.description }
}

/**
 * Supprime le webhook (pour passer en mode polling)
 */
export async function deleteWebhook(): Promise<{ success: boolean; error?: string }> {
  const response = await callTelegramApi('deleteWebhook', {})
  return { success: response.ok, error: response.description }
}

/**
 * Récupère les infos du bot
 */
export async function getBotInfo(): Promise<{
  success: boolean
  username?: string
  firstName?: string
  error?: string
}> {
  interface BotInfo {
    username: string
    first_name: string
  }

  const response = await callTelegramApi<BotInfo>('getMe', {})

  if (response.ok && response.result) {
    return {
      success: true,
      username: response.result.username,
      firstName: response.result.first_name,
    }
  }

  return { success: false, error: response.description }
}
