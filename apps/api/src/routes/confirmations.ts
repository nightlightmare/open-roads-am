import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { verifyAuth } from '../middleware/verify-auth.js'
import { createBannedCheck } from '../middleware/banned-check.js'
import { rateLimit, RateLimitError } from '../middleware/rate-limit.js'
import type { UserProfileRepository } from '../repositories/user-profile.repository.js'
import type { UserBanRepository } from '../middleware/banned-check.js'

const ReportIdParamSchema = z.object({
  id: z.string().uuid(),
})

interface ConfirmationRoutesOptions {
  db: UserProfileRepository
  banDb: UserBanRepository
  redis: Redis
}

export async function confirmationRoutes(
  fastify: FastifyInstance,
  options: ConfirmationRoutesOptions,
): Promise<void> {
  const { db, banDb, redis } = options
  const bannedCheck = createBannedCheck(redis, banDb)

  // POST /api/v1/reports/:id/confirm
  fastify.post(
    '/api/v1/reports/:id/confirm',
    { preHandler: [verifyAuth, bannedCheck] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const paramParsed = ReportIdParamSchema.safeParse(request.params)
      if (!paramParsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: paramParsed.error.flatten() })
      }

      try {
        await rateLimit(redis, `rate:confirm:user:${clerkId}`, 50, 3600)
      } catch (err) {
        if (err instanceof RateLimitError) {
          return reply.code(429).header('Retry-After', '3600').send({ code: 'RATE_LIMIT_EXCEEDED' })
        }
        throw err
      }

      const result = await db.addConfirmation(clerkId, paramParsed.data.id)

      if (!result.ok) {
        if (result.code === 'NOT_FOUND') return reply.code(404).send({ code: 'NOT_FOUND' })
        return reply.code(400).send({ code: result.code })
      }

      return reply.send({ report_id: paramParsed.data.id, confirmation_count: result.count })
    },
  )

  // DELETE /api/v1/reports/:id/confirm
  fastify.delete(
    '/api/v1/reports/:id/confirm',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const paramParsed = ReportIdParamSchema.safeParse(request.params)
      if (!paramParsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: paramParsed.error.flatten() })
      }

      const result = await db.removeConfirmation(clerkId, paramParsed.data.id)

      if (!result.ok) return reply.code(404).send({ code: 'NOT_FOUND' })

      return reply.send({ report_id: paramParsed.data.id, confirmation_count: result.count })
    },
  )
}
