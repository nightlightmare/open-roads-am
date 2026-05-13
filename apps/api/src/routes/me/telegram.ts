import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { resolveUserId } from '../../lib/resolve-user-id.js'
import type { TelegramLinkRepository } from '../../repositories/telegram-link.repository.js'
import type { NotificationPreferenceRepository } from '../../repositories/notification-preference.repository.js'

const LINK_TOKEN_TTL_SECS = 600

function linkTokenKey(token: string): string {
  return `telegram:link:${token}`
}

function userLinkTokenKey(userId: string): string {
  return `telegram:link:user:${userId}`
}

interface TelegramMeRoutesOptions {
  prisma: PrismaClient
  redis: Redis
  linkRepo: TelegramLinkRepository
  preferenceRepo: NotificationPreferenceRepository
  botUsername: string
}

/**
 * /api/v1/me/notifications/telegram/* — manage Telegram linkage for the
 * currently-authenticated user.
 */
export async function meTelegramRoutes(
  fastify: FastifyInstance,
  options: TelegramMeRoutesOptions,
): Promise<void> {
  const { prisma, redis, linkRepo, preferenceRepo, botUsername } = options

  // POST /api/v1/me/notifications/telegram/link
  fastify.post(
    '/api/v1/me/notifications/telegram/link',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!
      const userId = await resolveUserId(prisma, redis, clerkId)

      // Invalidate any previous outstanding token for this user.
      const prevToken = await redis.get(userLinkTokenKey(userId))
      if (prevToken) {
        await redis.del(linkTokenKey(prevToken))
      }

      const token = randomUUID()
      await redis.set(linkTokenKey(token), userId, 'EX', LINK_TOKEN_TTL_SECS)
      await redis.set(userLinkTokenKey(userId), token, 'EX', LINK_TOKEN_TTL_SECS)

      return reply.send({
        deepLink: `https://t.me/${botUsername}?start=${token}`,
        expiresIn: LINK_TOKEN_TTL_SECS,
      })
    },
  )

  // DELETE /api/v1/me/notifications/telegram/unlink
  fastify.delete(
    '/api/v1/me/notifications/telegram/unlink',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!
      const userId = await resolveUserId(prisma, redis, clerkId)

      await linkRepo.deleteByUserId(userId)
      await preferenceRepo.disableAllTelegram(userId)

      return reply.send({ unlinked: true })
    },
  )

  // GET /api/v1/me/notifications/telegram/status
  fastify.get(
    '/api/v1/me/notifications/telegram/status',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!
      const userId = await resolveUserId(prisma, redis, clerkId)

      const link = await linkRepo.findByUserId(userId)
      if (!link) return reply.send({ linked: false })

      return reply.send({
        linked: true,
        linkedAt: link.linked_at.toISOString(),
      })
    },
  )
}
