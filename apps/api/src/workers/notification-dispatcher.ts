import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import {
  JOB_NOTIFICATION,
  type NotificationJobData,
  type NotificationEventType,
  type TelegramPayload,
} from '../lib/notification-queue.js'
import {
  escapeMarkdownV2,
} from '../lib/telegram.js'
import { checkNotificationRate } from '../lib/notification-rate-limit.js'
import type {
  NotificationChannel,
  NotificationPreferenceRepository,
} from '../repositories/notification-preference.repository.js'
import type { TelegramLinkRepository } from '../repositories/telegram-link.repository.js'
import type {
  NotificationContextRepository,
  NotificationReportContext,
} from '../repositories/notification-context.repository.js'

const CONFIRMATION_MILESTONES = new Set([5, 10, 25])

/**
 * Resolve whether a notification should be sent for a (user, channel, event)
 * tuple, falling back to the channel default when no stored row exists.
 *
 * Defaults per Spec 12:
 *   - telegram → true (when account is linked; the caller must verify linkage)
 *   - email → true for status-change events, false for confirmed / area
 *   - web_push / mobile_push → false (user must explicitly opt in)
 */
export function getDefaultPreference(
  channel: NotificationChannel,
  eventType: NotificationEventType,
): boolean {
  if (channel === 'telegram') return true
  if (channel === 'email') {
    if (
      eventType === 'report.approved' ||
      eventType === 'report.in_progress' ||
      eventType === 'report.resolved' ||
      eventType === 'report.rejected'
    ) {
      return true
    }
    return false
  }
  return false
}

export function resolvePreference(
  stored: boolean | null,
  channel: NotificationChannel,
  eventType: NotificationEventType,
): boolean {
  if (stored !== null) return stored
  return getDefaultPreference(channel, eventType)
}

interface DispatcherDeps {
  /** Dedicated subscriber Redis client (must be a separate connection from the publisher). */
  subscriber: Redis
  /** Shared Redis client — used for rate limiting only. */
  redis: Redis
  notificationQueue: Queue<NotificationJobData>
  preferenceRepo: NotificationPreferenceRepository
  telegramLinkRepo: TelegramLinkRepository
  contextRepo: NotificationContextRepository
  /** Public web URL used to build report links inside notifications. */
  webUrl: string
}

/**
 * Event payloads on Redis pub/sub mix snake_case (legacy — kept for the SSE
 * feed in `moderation/feed.ts`) and camelCase. Each handler reads through
 * `extractReportId` / `extractConfirmationCount` to tolerate either shape.
 */
type RawEventPayload = Record<string, unknown>

function extractReportId(payload: RawEventPayload): string | null {
  const v = payload.reportId ?? payload.report_id
  return typeof v === 'string' ? v : null
}

function extractConfirmationCount(payload: RawEventPayload): number | null {
  const v = payload.confirmationCount ?? payload.confirmation_count
  return typeof v === 'number' ? v : null
}

function extractNewStatus(payload: RawEventPayload): string | null {
  const v = payload.newStatus ?? payload.new_status ?? payload.status
  return typeof v === 'string' ? v : null
}

/**
 * Build the MarkdownV2-formatted body + inline keyboard for each event type.
 *
 * IMPORTANT: every dynamic string segment must go through `escapeMarkdownV2`
 * before being interpolated, otherwise Telegram returns 400.
 */
function buildTelegramPayload(
  eventType: NotificationEventType,
  ctx: NotificationReportContext,
  webUrl: string,
  cfImagesBaseUrl: string | null,
  extra: { confirmationCount?: number } = {},
): TelegramPayload | null {
  const reportUrl = `${webUrl}/reports/${ctx.id}`
  const modUrl = `${webUrl}/moderation/reports/${ctx.id}`
  const submitUrl = `${webUrl}/submit`
  const address = ctx.address_raw ?? '—'
  const problemType = ctx.problem_type ?? 'unknown'
  const description = ctx.description?.slice(0, 100) ?? ''
  const photoUrl =
    cfImagesBaseUrl && ctx.photo_optimized_key
      ? `${cfImagesBaseUrl}/${ctx.photo_optimized_key}/public`
      : undefined

  const eAddress = escapeMarkdownV2(address)
  const eType = escapeMarkdownV2(problemType)
  const eDescription = escapeMarkdownV2(description)

  switch (eventType) {
    case 'report.new':
      return {
        chatId: '', // filled in by caller
        parseMode: 'MarkdownV2',
        text:
          `📍 *New report*\n\n` +
          `*Type:* ${eType}\n` +
          `*Address:* ${eAddress}` +
          (description ? `\n*Description:* ${eDescription}${description.length === 100 ? '\\.\\.\\.' : ''}` : ''),
        inlineKeyboard: [[{ text: 'Review now', url: modUrl }]],
        photoUrl,
      }

    case 'report.approved':
      return {
        chatId: '',
        parseMode: 'MarkdownV2',
        text:
          `✅ *Your report has been approved*\n\n` +
          `*Type:* ${eType}\n` +
          `*Address:* ${eAddress}\n\n` +
          `It's now visible on the map\\.`,
        inlineKeyboard: [[{ text: 'View report', url: reportUrl }]],
      }

    case 'report.in_progress':
      return {
        chatId: '',
        parseMode: 'MarkdownV2',
        text:
          `🔧 *Your report is in progress*\n\n` +
          `*Address:* ${eAddress}`,
        inlineKeyboard: [[{ text: 'View report', url: reportUrl }]],
      }

    case 'report.resolved':
      return {
        chatId: '',
        parseMode: 'MarkdownV2',
        text:
          `🎉 *Your report has been resolved*\n\n` +
          `*Address:* ${eAddress}\n\n` +
          `Thanks for reporting\\.`,
        inlineKeyboard: [[{ text: 'View report', url: reportUrl }]],
      }

    case 'report.rejected':
      // SECURITY: per Spec 12, never include the moderator's free-text
      // rejection reason. v1 ships with a generic message.
      return {
        chatId: '',
        parseMode: 'MarkdownV2',
        text:
          `⚠️ *Your report was not approved*\n\n` +
          `Please review the submission guidelines and try again\\.`,
        inlineKeyboard: [[{ text: 'Submit a new report', url: submitUrl }]],
      }

    case 'report.confirmed': {
      const count = extra.confirmationCount ?? 0
      const eCount = escapeMarkdownV2(String(count))
      return {
        chatId: '',
        parseMode: 'MarkdownV2',
        text: `👥 *Your report was confirmed by ${eCount} other users\\!*`,
        inlineKeyboard: [[{ text: 'View report', url: reportUrl }]],
      }
    }

    default:
      return null
  }
}

async function shouldDeliver(
  preferenceRepo: NotificationPreferenceRepository,
  userId: string,
  channel: NotificationChannel,
  eventType: NotificationEventType,
): Promise<boolean> {
  const stored = await preferenceRepo.getOne(userId, channel, eventType)
  return resolvePreference(stored, channel, eventType)
}

async function enqueueTelegram(
  deps: DispatcherDeps,
  cfImagesBaseUrl: string | null,
  userId: string,
  chatId: bigint,
  eventType: NotificationEventType,
  ctx: NotificationReportContext,
  extra: { confirmationCount?: number } = {},
): Promise<void> {
  const enabled = await shouldDeliver(
    deps.preferenceRepo,
    userId,
    'telegram',
    eventType,
  )
  if (!enabled) return

  const allowed = await checkNotificationRate(deps.redis, userId)
  if (!allowed) {
    // Drop silently — rate-limit log entries are kept for audit only.
    return
  }

  const payload = buildTelegramPayload(
    eventType,
    ctx,
    deps.webUrl,
    cfImagesBaseUrl,
    extra,
  )
  if (!payload) return

  payload.chatId = chatId.toString()

  await deps.notificationQueue.add(
    JOB_NOTIFICATION,
    {
      userId,
      channel: 'telegram',
      eventType,
      payload,
      triggeredAt: new Date().toISOString(),
      reportId: ctx.id,
    },
    {},
  )
}

async function dispatchModerationNew(
  deps: DispatcherDeps,
  cfImagesBaseUrl: string | null,
  reportId: string,
): Promise<void> {
  const ctx = await deps.contextRepo.getReportContext(reportId)
  if (!ctx) return

  const moderatorIds = await deps.contextRepo.listModeratorUserIds()
  if (moderatorIds.length === 0) return

  const chatIds = await deps.telegramLinkRepo.findChatIdsForUsers(moderatorIds)
  for (const userId of moderatorIds) {
    const chatId = chatIds.get(userId)
    if (!chatId) continue
    await enqueueTelegram(deps, cfImagesBaseUrl, userId, chatId, 'report.new', ctx)
  }
}

async function dispatchAuthorEvent(
  deps: DispatcherDeps,
  cfImagesBaseUrl: string | null,
  eventType: NotificationEventType,
  reportId: string,
  extra: { confirmationCount?: number } = {},
): Promise<void> {
  const ctx = await deps.contextRepo.getReportContext(reportId)
  if (!ctx) return

  const link = await deps.telegramLinkRepo.findByUserId(ctx.user_id)
  if (!link) return

  await enqueueTelegram(
    deps,
    cfImagesBaseUrl,
    ctx.user_id,
    link.chat_id,
    eventType,
    ctx,
    extra,
  )
}

/**
 * Subscribe to Redis pub/sub and fan out notifications.
 *
 * Channels:
 *   - events:moderation             → new report → notify moderators
 *   - events:report-approved        → notify author
 *   - events:report-status-changed  → notify author (in_progress / resolved)
 *   - events:report-rejected        → notify author
 *   - events:report-confirmed       → notify author (only at milestones)
 *
 * Returns an unsubscribe function (for tests / graceful shutdown).
 */
export function startNotificationDispatcher(
  deps: DispatcherDeps & { cfImagesBaseUrl: string | null },
): () => Promise<void> {
  const channels = [
    'events:moderation',
    'events:report-approved',
    'events:report-status-changed',
    'events:report-rejected',
    'events:report-confirmed',
  ]

  deps.subscriber.subscribe(...channels).catch((err) => {
    console.error('Failed to subscribe notification dispatcher:', err)
  })

  const handler = async (channel: string, message: string): Promise<void> => {
    try {
      const event = JSON.parse(message) as RawEventPayload
      const reportId = extractReportId(event)
      if (!reportId) return

      switch (channel) {
        case 'events:moderation':
          await dispatchModerationNew(deps, deps.cfImagesBaseUrl, reportId)
          return
        case 'events:report-approved':
          await dispatchAuthorEvent(deps, deps.cfImagesBaseUrl, 'report.approved', reportId)
          return
        case 'events:report-status-changed': {
          const newStatus = extractNewStatus(event)
          if (newStatus !== 'in_progress' && newStatus !== 'resolved') return
          const eventType: NotificationEventType =
            newStatus === 'resolved' ? 'report.resolved' : 'report.in_progress'
          await dispatchAuthorEvent(deps, deps.cfImagesBaseUrl, eventType, reportId)
          return
        }
        case 'events:report-rejected':
          await dispatchAuthorEvent(deps, deps.cfImagesBaseUrl, 'report.rejected', reportId)
          return
        case 'events:report-confirmed': {
          const count = extractConfirmationCount(event)
          if (count === null) return
          if (!CONFIRMATION_MILESTONES.has(count)) return
          await dispatchAuthorEvent(
            deps,
            deps.cfImagesBaseUrl,
            'report.confirmed',
            reportId,
            { confirmationCount: count },
          )
          return
        }
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          dispatcher: 'error',
          channel,
          err: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  deps.subscriber.on('message', (channel, message) => {
    void handler(channel, message)
  })

  return async () => {
    await deps.subscriber.unsubscribe(...channels)
    deps.subscriber.off('message', handler)
  }
}
