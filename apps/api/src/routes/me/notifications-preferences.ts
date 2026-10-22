import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { resolveUserId } from '../../lib/resolve-user-id.js'
import type {
  NotificationChannel,
  NotificationPreferenceRepository,
} from '../../repositories/notification-preference.repository.js'
import type { TelegramLinkRepository } from '../../repositories/telegram-link.repository.js'
import {
  MODERATOR_ONLY_EVENTS,
  NOTIFICATION_EVENTS,
  type NotificationEventType,
} from '../../lib/notification-queue.js'
import {
  getDefaultPreference,
  resolvePreference,
} from '../../workers/notification-dispatcher.js'

const CHANNELS: NotificationChannel[] = [
  'telegram',
  'email',
  'web_push',
  'mobile_push',
]

const ChannelEnum = z.enum(['telegram', 'email', 'web_push', 'mobile_push'])

const UpdatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        channel: ChannelEnum,
        eventType: z.string().min(1).max(100),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(50),
})

interface NotificationsPreferencesOptions {
  prisma: PrismaClient
  redis: Redis
  preferenceRepo: NotificationPreferenceRepository
  linkRepo: TelegramLinkRepository
}

export async function notificationsPreferencesRoutes(
  fastify: FastifyInstance,
  options: NotificationsPreferencesOptions,
): Promise<void> {
  const { prisma, redis, preferenceRepo, linkRepo } = options

  // GET /api/v1/me/notifications/preferences
  fastify.get(
    '/api/v1/me/notifications/preferences',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId, role } = request.auth!
      const userId = await resolveUserId(prisma, redis, clerkId)
      const isModerator = role === 'moderator' || role === 'admin'

      const stored = await preferenceRepo.listForUser(userId)
      const storedMap = new Map<string, boolean>(
        stored.map((row) => [`${row.channel}:${row.event_type}`, row.enabled]),
      )

      const link = await linkRepo.findByUserId(userId)
      const preferences: Array<{
        channel: NotificationChannel
        eventType: NotificationEventType
        enabled: boolean
        isDefault: boolean
      }> = []

      for (const eventType of NOTIFICATION_EVENTS) {
        // Hide moderator-only events from non-moderators entirely.
        if (MODERATOR_ONLY_EVENTS.has(eventType) && !isModerator) continue

        for (const channel of CHANNELS) {
          const key = `${channel}:${eventType}`
          const storedValue = storedMap.get(key)
          const isDefault = storedValue === undefined
          const enabled = resolvePreference(
            storedValue ?? null,
            channel,
            eventType,
          )
          preferences.push({ channel, eventType, enabled, isDefault })
        }
      }

      return reply.send({
        preferences,
        channels: {
          telegram: link
            ? { linked: true, linkedAt: link.linked_at.toISOString() }
            : { linked: false },
          email: { available: true },
          web_push: { subscribed: false },
          mobile_push: { available: false },
        },
      })
    },
  )

  // PUT /api/v1/me/notifications/preferences
  fastify.put(
    '/api/v1/me/notifications/preferences',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId, role } = request.auth!
      const userId = await resolveUserId(prisma, redis, clerkId)
      const isModerator = role === 'moderator' || role === 'admin'

      const parsed = UpdatePreferencesSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const validEvents = new Set<string>(NOTIFICATION_EVENTS)
      for (const pref of parsed.data.preferences) {
        if (!validEvents.has(pref.eventType)) {
          return reply.code(400).send({ code: 'UNKNOWN_EVENT_TYPE' })
        }
      }

      // Reject enabling Telegram if not linked.
      const link = await linkRepo.findByUserId(userId)
      if (!link) {
        const enablesTelegram = parsed.data.preferences.some(
          (p) => p.channel === 'telegram' && p.enabled,
        )
        if (enablesTelegram) {
          return reply.code(400).send({ code: 'TELEGRAM_NOT_LINKED' })
        }
      }

      // Reject enabling web push without a subscription (no subs in v1).
      const enablesWebPush = parsed.data.preferences.some(
        (p) => p.channel === 'web_push' && p.enabled,
      )
      if (enablesWebPush) {
        return reply.code(400).send({ code: 'WEB_PUSH_NOT_SUBSCRIBED' })
      }

      let updated = 0
      for (const pref of parsed.data.preferences) {
        const eventType = pref.eventType as NotificationEventType
        // Non-moderators trying to enable moderator-only events: silently
        // ignore (per Spec 12 validation rules).
        if (MODERATOR_ONLY_EVENTS.has(eventType) && !isModerator) continue
        // Skip rows where the requested value already matches the default —
        // keeps the table small.
        const defaultValue = getDefaultPreference(pref.channel, eventType)
        if (pref.enabled === defaultValue) {
          // Still upsert to honour an explicit "I chose this".
        }
        await preferenceRepo.upsert(userId, {
          channel: pref.channel,
          event_type: pref.eventType,
          enabled: pref.enabled,
        })
        updated += 1
      }

      return reply.send({ updated })
    },
  )
}
