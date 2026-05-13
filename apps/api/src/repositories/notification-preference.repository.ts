import type { PrismaClient } from '@prisma/client'

export type NotificationChannel = 'telegram' | 'email' | 'web_push' | 'mobile_push'

export interface NotificationPreferenceRow {
  channel: NotificationChannel
  event_type: string
  enabled: boolean
}

export interface NotificationPreferenceRepository {
  /** Stored preferences for this user (no defaults applied). */
  listForUser(userId: string): Promise<NotificationPreferenceRow[]>
  /** Upsert one preference. */
  upsert(
    userId: string,
    pref: { channel: NotificationChannel; event_type: string; enabled: boolean },
  ): Promise<void>
  /** Disable every Telegram preference for this user (used on unlink). */
  disableAllTelegram(userId: string): Promise<void>
  /** Single preference lookup — used by the dispatcher. Returns null if no row. */
  getOne(
    userId: string,
    channel: NotificationChannel,
    eventType: string,
  ): Promise<boolean | null>
}

export class PrismaNotificationPreferenceRepository
  implements NotificationPreferenceRepository
{
  constructor(private readonly db: PrismaClient) {}

  async listForUser(userId: string): Promise<NotificationPreferenceRow[]> {
    const rows = await this.db.notificationPreference.findMany({
      where: { user_id: userId },
      select: { channel: true, event_type: true, enabled: true },
    })
    return rows as NotificationPreferenceRow[]
  }

  async upsert(
    userId: string,
    pref: { channel: NotificationChannel; event_type: string; enabled: boolean },
  ): Promise<void> {
    await this.db.notificationPreference.upsert({
      where: {
        user_id_channel_event_type: {
          user_id: userId,
          channel: pref.channel,
          event_type: pref.event_type,
        },
      },
      create: {
        user_id: userId,
        channel: pref.channel,
        event_type: pref.event_type,
        enabled: pref.enabled,
      },
      update: { enabled: pref.enabled },
    })
  }

  async disableAllTelegram(userId: string): Promise<void> {
    await this.db.notificationPreference.updateMany({
      where: { user_id: userId, channel: 'telegram' },
      data: { enabled: false },
    })
  }

  async getOne(
    userId: string,
    channel: NotificationChannel,
    eventType: string,
  ): Promise<boolean | null> {
    const row = await this.db.notificationPreference.findUnique({
      where: {
        user_id_channel_event_type: {
          user_id: userId,
          channel,
          event_type: eventType,
        },
      },
      select: { enabled: true },
    })
    return row?.enabled ?? null
  }
}
