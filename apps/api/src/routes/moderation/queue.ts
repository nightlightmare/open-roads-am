import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import type { ModerationRepository } from '../../repositories/moderation.repository.js'

const QueueQuerySchema = z.object({
  status: z.enum(['pending_review', 'under_review']).default('pending_review'),
  problem_type: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

interface ModerationQueueRoutesOptions {
  db: ModerationRepository
  redis: Redis
  cfImagesBaseUrl: string
}

function photoUrl(cfImagesBaseUrl: string, key: string | null): string | null {
  if (!key) return null
  return `${cfImagesBaseUrl}/${key}/public`
}

function thumbnailUrl(cfImagesBaseUrl: string, key: string | null): string | null {
  if (!key) return null
  return `${cfImagesBaseUrl}/${key}/thumbnail`
}

export async function moderationQueueRoutes(
  fastify: FastifyInstance,
  options: ModerationQueueRoutesOptions,
): Promise<void> {
  const { db, cfImagesBaseUrl } = options

  fastify.get(
    '/api/v1/moderation/queue',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      const parsed = QueueQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { status, problem_type, cursor, limit } = parsed.data
      const result = await db.getQueue({
        status,
        problemType: problem_type ?? null,
        cursor: cursor ?? null,
        limit,
      })

      return reply.send({
        reports: result.reports.map((r) => ({
          id: r.id,
          status: r.status,
          problem_type_user: r.problem_type_user,
          problem_type_ai: r.problem_type_ai,
          ai_confidence: r.ai_confidence,
          description: r.description,
          latitude: r.latitude,
          longitude: r.longitude,
          address_raw: r.address_raw,
          photo_url: photoUrl(cfImagesBaseUrl, r.photo_optimized_key),
          photo_thumbnail_url: thumbnailUrl(cfImagesBaseUrl, r.photo_optimized_key),
          confirmation_count: r.confirmation_count,
          created_at: r.created_at.toISOString(),
        })),
        cursor: result.cursor,
        total_pending: result.total_pending,
      })
    },
  )
}
