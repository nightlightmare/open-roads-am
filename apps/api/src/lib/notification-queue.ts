import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { NotificationChannel } from '../repositories/notification-preference.repository.js'

export const QUEUE_NOTIFICATIONS = 'notifications'
export const JOB_NOTIFICATION = 'deliver-notification'

/** All notification event types we recognise. Used for preference validation. */
export const NOTIFICATION_EVENTS = [
  // Moderator-only
  'report.new',
  'lease.expiring',
  // Author
  'report.approved',
  'report.in_progress',
  'report.resolved',
  'report.rejected',
  'report.confirmed',
  // Area subscriptions (Spec 16 — reserved)
  'area.new_report',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number]

/** Events that may only be delivered to moderators / admins. */
export const MODERATOR_ONLY_EVENTS = new Set<NotificationEventType>([
  'report.new',
  'lease.expiring',
])

export interface TelegramPayload {
  chatId: string
  text: string
  parseMode: 'MarkdownV2'
  /** Optional inline-keyboard buttons (URLs only — no callback buttons in v1). */
  inlineKeyboard?: Array<Array<{ text: string; url: string }>> | undefined
  /** Optional photo URL; when set, sendPhoto is used and text becomes the caption. */
  photoUrl?: string | undefined
}

export interface EmailPayload {
  to: string
  subject: string
  htmlBody: string
}

export interface WebPushPayload {
  endpoint: string
  keysP256dh: string
  keysAuth: string
  title: string
  body: string
  url: string
}

export interface NotificationJobData {
  /** Internal user UUID — for logging. */
  userId: string
  channel: NotificationChannel
  eventType: NotificationEventType
  /** Channel-specific payload. Discriminated by `channel`. */
  payload: TelegramPayload | EmailPayload | WebPushPayload
  /** ISO timestamp of the triggering event. */
  triggeredAt: string
  /** Originating report ID — for `notification_log.report_id`. */
  reportId?: string
}

let notificationQueue: Queue<NotificationJobData> | undefined

export function getNotificationQueue(redis: Redis): Queue<NotificationJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobData>(QUEUE_NOTIFICATIONS, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    })
  }
  return notificationQueue
}
