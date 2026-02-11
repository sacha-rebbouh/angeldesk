/**
 * Telegram Setup API Route
 *
 * Configure le webhook Telegram pour recevoir les messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { setWebhook, deleteWebhook, getBotInfo } from '@/services/notifications/telegram'

export async function POST(request: NextRequest) {
  // Verify authorization with constant-time comparison
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET

  if (!authHeader || !expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expected = `Bearer ${expectedToken}`
  try {
    const isValid = authHeader.length === expected.length &&
      timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'set'

    if (action === 'delete') {
      const result = await deleteWebhook()
      return NextResponse.json({
        success: result.success,
        message: result.success ? 'Webhook supprimé' : result.error,
      })
    }

    // Build webhook URL
    const baseUrl = body.url || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL

    if (!baseUrl) {
      return NextResponse.json({
        error: 'No base URL configured. Set VERCEL_URL or NEXT_PUBLIC_APP_URL, or pass url in body.',
      }, { status: 400 })
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`

    const result = await setWebhook(webhookUrl)

    return NextResponse.json({
      success: result.success,
      webhookUrl: result.success ? webhookUrl : undefined,
      error: result.error,
    })
  } catch (error) {
    console.error('[Telegram] Setup error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Setup failed',
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const botInfo = await getBotInfo()
    const hasToken = !!process.env.TELEGRAM_BOT_TOKEN
    const hasChatId = !!process.env.TELEGRAM_ADMIN_CHAT_ID

    return NextResponse.json({
      configured: hasToken && hasChatId,
      bot: botInfo.success ? {
        username: botInfo.username,
        firstName: botInfo.firstName,
      } : null,
      webhookEndpoint: '/api/telegram/webhook',
      setupInstructions: !hasToken || !hasChatId ? {
        step1: 'Set TELEGRAM_BOT_TOKEN in .env.local',
        step2: 'Set TELEGRAM_ADMIN_CHAT_ID in .env.local (your chat ID)',
        step3: 'POST to this endpoint with Authorization header to configure webhook',
      } : null,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get bot info',
    }, { status: 500 })
  }
}
