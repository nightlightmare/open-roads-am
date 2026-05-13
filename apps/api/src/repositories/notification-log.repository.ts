import type { PrismaClient } from '@prisma/client'
import type { NotificationChannel } from './notification-preference.repository.js'

export type NotificationLogStatus =
  | 'delivered'
  | 'failed'
  | 'rate_limited'
  | 'skipped'

export interface NotificationLogEntry {
  userId: string
  channel: NotificationChannel
  eventType: string
  status: NotificationLogStatus
  /** Internal error message — never exposed to clients. */
  error?: string | null | undefined
  reportId?: string | null | undefined
}

export interface NotificationLogRepository {
  log(entry: NotificationLogEntry): Promise<void>
}

export class PrismaNotificationLogRepository implements NotificationLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async log(entry: NotificationLogEntry): Promise<void> {
    await this.db.notificationLog.create({
      data: {
        user_id: entry.userId,
        channel: entry.channel,
        event_type: entry.eventType,
        status: entry.status,
        error: entry.error ?? null,
        report_id: entry.reportId ?? null,
      },
    })
  }
}
