/**
 * Notifications Service - Unified Export
 */

// Telegram
export {
  sendMessage,
  sendToAdmin,
  editMessage,
  notifyAgentStarted,
  notifyAgentCompleted,
  notifyAgentFailed,
  notifyRetrySuccess,
  notifyCriticalAlert,
  notifyWeeklyReport,
  formatStatusMessage,
  formatHealthMessage,
  formatLastRunMessage,
  setWebhook,
  deleteWebhook,
  getBotInfo,
} from './telegram'

export { handleTelegramCommand } from './telegram-commands'

// Email (to be implemented)
export { sendEmail, sendWeeklyReportEmail, sendCriticalAlertEmail } from './email'
