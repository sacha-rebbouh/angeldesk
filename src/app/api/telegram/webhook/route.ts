/**
 * Telegram Webhook API Route
 *
 * Reçoit les messages du bot Telegram et route vers les handlers appropriés
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleTelegramCommand, sendToAdmin } from '@/services/notifications'

// ============================================================================
// TYPES
// ============================================================================

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      first_name: string
      username?: string
    }
    chat: {
      id: number
      type: string
    }
    date: number
    text?: string
  }
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate

    // Only process messages
    if (!update.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const { message } = update
    const chatId = String(message.chat.id)
    const text = message.text!  // Non-null assertion - already checked above
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID

    // Security: Only allow admin
    if (chatId !== adminChatId) {
      console.warn(`[Telegram] Unauthorized access attempt from chat ${chatId}`)
      return NextResponse.json({ ok: true })
    }

    // Parse command
    if (!text.startsWith('/')) {
      return NextResponse.json({ ok: true })
    }

    const parts = text.slice(1).split(/\s+/)
    const command = parts[0].toLowerCase().replace(/@\w+$/, '') // Remove @botname if present
    const args = parts.slice(1)

    console.log(`[Telegram] Command received: /${command}`, args)

    // Handle command
    const result = await handleTelegramCommand({
      chatId,
      command,
      args,
      messageId: message.message_id,
    })

    // Send response
    if (result.success && result.response) {
      await sendToAdmin(result.response)
    } else if (!result.success && result.error) {
      await sendToAdmin(`❌ Erreur: ${result.error}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Telegram] Webhook error:', error)

    // Don't expose errors to Telegram
    return NextResponse.json({ ok: true })
  }
}

// ============================================================================
// GET - Health check and webhook info
// ============================================================================

export async function GET() {
  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN
  const hasChatId = !!process.env.TELEGRAM_ADMIN_CHAT_ID

  return NextResponse.json({
    status: 'ok',
    configured: hasToken && hasChatId,
    endpoint: '/api/telegram/webhook',
  })
}
