/**
 * Email Notification Service
 *
 * Service pour envoyer des emails via Resend
 */

import type { EmailMessage } from '@/agents/maintenance/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const RESEND_API_BASE = 'https://api.resend.com'

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured - emails disabled')
    return null
  }

  return { apiKey, adminEmail }
}

// ============================================================================
// CORE API
// ============================================================================

interface ResendResponse {
  id?: string
  error?: { message: string; name: string }
}

/**
 * Envoie un email via Resend
 */
export async function sendEmail(
  message: EmailMessage
): Promise<{ success: boolean; id?: string; error?: string }> {
  const config = getConfig()
  if (!config) {
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FULLINVEST <maintenance@fullinvest.io>',
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })

    const data = (await response.json()) as ResendResponse

    if (data.error) {
      console.error('[Email] Send failed:', data.error)
      return { success: false, error: data.error.message }
    }

    return { success: true, id: data.id }
  } catch (error) {
    console.error('[Email] Request failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Envoie un email à l'admin
 */
async function sendToAdmin(
  subject: string,
  html: string,
  text?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const config = getConfig()
  if (!config?.adminEmail) {
    return { success: false, error: 'Admin email not configured' }
  }

  return sendEmail({
    to: config.adminEmail,
    subject,
    html,
    text,
  })
}

// ============================================================================
// FORMATTED EMAILS
// ============================================================================

/**
 * Envoie le rapport hebdomadaire par email
 */
export async function sendWeeklyReportEmail(report: {
  weekStart: Date
  weekEnd: Date
  overallStatus: string
  agents: Array<{
    name: string
    runs: number
    successful: number
    failed: number
    itemsProcessed: number
  }>
  metrics: {
    companiesBefore: number
    companiesAfter: number
    qualityBefore: number
    qualityAfter: number
    industryBefore: number
    industryAfter: number
  }
  incidents: Array<{ date: Date; agent: string; error: string; resolved: boolean }>
  totalCost: number
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const weekRange = `${formatDate(report.weekStart)} - ${formatDate(report.weekEnd)}`

  const statusColor =
    report.overallStatus === 'HEALTHY'
      ? '#22c55e'
      : report.overallStatus === 'DEGRADED'
        ? '#f59e0b'
        : '#ef4444'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #e5e7eb; }
    .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; color: white; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .section { margin: 30px 0; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #374151; }
    .metric-change { font-size: 12px; margin-left: 8px; }
    .metric-up { color: #22c55e; }
    .metric-down { color: #ef4444; }
    .incident { background: #fef3c7; padding: 12px; border-radius: 8px; margin: 8px 0; }
    .incident.resolved { background: #dcfce7; }
    .cost { font-size: 24px; font-weight: bold; color: #374151; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #111827;">📊 Rapport Hebdomadaire</h1>
      <p style="color: #6b7280; margin: 10px 0 0;">Semaine du ${weekRange}</p>
    </div>

    <div style="text-align: center; padding: 30px 0;">
      <span class="status-badge" style="background: ${statusColor};">
        ${report.overallStatus}
      </span>
    </div>

    <div class="section">
      <div class="section-title">📋 Résumé des Agents</div>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Runs</th>
            <th>Succès</th>
            <th>Échecs</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          ${report.agents
            .map(
              (a) => `
            <tr>
              <td><strong>${a.name}</strong></td>
              <td>${a.runs}</td>
              <td style="color: #22c55e;">${a.successful}</td>
              <td style="color: ${a.failed > 0 ? '#ef4444' : '#6b7280'};">${a.failed}</td>
              <td>${a.itemsProcessed.toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">📈 Évolution des Données</div>
      <table>
        <thead>
          <tr>
            <th>Métrique</th>
            <th>Avant</th>
            <th>Après</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Companies</td>
            <td>${report.metrics.companiesBefore.toLocaleString()}</td>
            <td>${report.metrics.companiesAfter.toLocaleString()}</td>
            <td class="${report.metrics.companiesAfter > report.metrics.companiesBefore ? 'metric-up' : ''}">
              ${report.metrics.companiesAfter > report.metrics.companiesBefore ? '+' : ''}${report.metrics.companiesAfter - report.metrics.companiesBefore}
            </td>
          </tr>
          <tr>
            <td>Qualité moyenne</td>
            <td>${report.metrics.qualityBefore}%</td>
            <td>${report.metrics.qualityAfter}%</td>
            <td class="${report.metrics.qualityAfter > report.metrics.qualityBefore ? 'metric-up' : 'metric-down'}">
              ${report.metrics.qualityAfter > report.metrics.qualityBefore ? '+' : ''}${report.metrics.qualityAfter - report.metrics.qualityBefore}%
            </td>
          </tr>
          <tr>
            <td>Avec industrie</td>
            <td>${report.metrics.industryBefore.toFixed(1)}%</td>
            <td>${report.metrics.industryAfter.toFixed(1)}%</td>
            <td class="${report.metrics.industryAfter > report.metrics.industryBefore ? 'metric-up' : 'metric-down'}">
              ${report.metrics.industryAfter > report.metrics.industryBefore ? '+' : ''}${(report.metrics.industryAfter - report.metrics.industryBefore).toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    ${
      report.incidents.length > 0
        ? `
    <div class="section">
      <div class="section-title">🔧 Incidents (${report.incidents.length})</div>
      ${report.incidents
        .map(
          (i) => `
        <div class="incident ${i.resolved ? 'resolved' : ''}">
          <strong>${formatDate(i.date)}</strong> - ${i.agent}<br>
          ${i.error}
          ${i.resolved ? '<br><span style="color: #22c55e;">✓ Résolu</span>' : '<br><span style="color: #f59e0b;">⚠ Non résolu</span>'}
        </div>
      `
        )
        .join('')}
    </div>
    `
        : ''
    }

    <div class="section" style="text-align: center; padding: 30px; background: #f9fafb; border-radius: 12px;">
      <div style="color: #6b7280; margin-bottom: 8px;">Coût total de la semaine</div>
      <div class="cost">$${report.totalCost.toFixed(2)}</div>
    </div>

    <div class="footer">
      <p>FULLINVEST - Système de Maintenance Automatisée</p>
      <p style="font-size: 12px;">Ce rapport est généré automatiquement chaque lundi à 08:00</p>
    </div>
  </div>
</body>
</html>
`

  const text = `
FULLINVEST - Rapport Hebdomadaire
Semaine du ${weekRange}

STATUT: ${report.overallStatus}

AGENTS:
${report.agents.map((a) => `- ${a.name}: ${a.successful}/${a.runs} runs, ${a.itemsProcessed} items`).join('\n')}

MÉTRIQUES:
- Companies: ${report.metrics.companiesBefore} → ${report.metrics.companiesAfter}
- Qualité: ${report.metrics.qualityBefore}% → ${report.metrics.qualityAfter}%

INCIDENTS: ${report.incidents.length}
${report.incidents.map((i) => `- ${formatDate(i.date)}: ${i.agent} - ${i.error}`).join('\n')}

COÛT: $${report.totalCost.toFixed(2)}
`

  return sendToAdmin(`[FULLINVEST] Rapport Hebdo - ${report.overallStatus}`, html, text)
}

/**
 * Envoie une alerte critique par email
 */
export async function sendCriticalAlertEmail(alert: {
  agent: string
  error: string
  attempts: number
  action: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert-box { background: #fef2f2; border: 2px solid #ef4444; border-radius: 12px; padding: 24px; }
    .alert-title { color: #dc2626; font-size: 24px; font-weight: bold; margin: 0 0 16px; }
    .error-box { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 8px; font-family: monospace; margin: 16px 0; }
    .action { background: #fef3c7; padding: 16px; border-radius: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="alert-box">
      <h1 class="alert-title">🚨 Alerte Critique</h1>

      <p><strong>${alert.agent}</strong> a échoué après ${alert.attempts} tentatives.</p>

      <div class="error-box">
        ${escapeHtml(alert.error)}
      </div>

      <div class="action">
        <strong>🔧 Action requise:</strong><br>
        ${alert.action}
      </div>
    </div>

    <p style="text-align: center; color: #6b7280; margin-top: 24px;">
      FULLINVEST - Système de Maintenance Automatisée
    </p>
  </div>
</body>
</html>
`

  const text = `
🚨 ALERTE CRITIQUE - FULLINVEST

${alert.agent} a échoué après ${alert.attempts} tentatives.

Erreur: ${alert.error}

Action requise: ${alert.action}
`

  return sendToAdmin(`🚨 [CRITIQUE] ${alert.agent} - Intervention requise`, html, text)
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
