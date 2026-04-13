import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { verifyAuth } from '../middleware/verify-auth.js'
import type { UserProfileRepository } from '../repositories/user-profile.repository.js'

const STATS_CACHE_TTL = 300 // 5 min

const MyReportsQuerySchema = z.object({
  status: z
    .enum(['pending_review', 'approved', 'in_progress', 'resolved', 'rejected'])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const ReportIdParamSchema = z.object({
  id: z.string().uuid(),
})

const MyConfirmationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

interface MeRoutesOptions {
  db: UserProfileRepository
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

export async function meRoutes(
  fastify: FastifyInstance,
  options: MeRoutesOptions,
): Promise<void> {
  const { db, redis, cfImagesBaseUrl } = options

  // GET /api/v1/me
  fastify.get(
    '/api/v1/me',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const cacheKey = `cache:profile:stats:${clerkId}`
      const cached = await redis.get(cacheKey)
      if (cached) {
        return reply.send(JSON.parse(cached) as unknown)
      }

      const profile = await db.getProfile(clerkId)
      if (!profile) return reply.code(404).send({ code: 'NOT_FOUND' })

      const response = {
        clerk_id: profile.clerk_id,
        display_name: profile.display_name,
        role: profile.role,
        stats: profile.stats,
        member_since: profile.member_since.toISOString(),
      }

      await redis.set(cacheKey, JSON.stringify(response), 'EX', STATS_CACHE_TTL)
      return reply.send(response)
    },
  )

  // GET /api/v1/me/reports
  fastify.get(
    '/api/v1/me/reports',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const parsed = MyReportsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { status, cursor, limit } = parsed.data
      const result = await db.getReports(clerkId, {
        status: status ?? null,
        cursor: cursor ?? null,
        limit,
      })

      return reply.send({
        reports: result.reports.map((r) => ({
          id: r.id,
          status: r.status,
          problem_type: r.problem_type,
          address_raw: r.address_raw,
          photo_thumbnail_url: thumbnailUrl(cfImagesBaseUrl, r.photo_optimized_key),
          confirmation_count: r.confirmation_count,
          created_at: r.created_at.toISOString(),
          status_updated_at: r.updated_at.toISOString(),
        })),
        cursor: result.cursor,
      })
    },
  )

  // GET /api/v1/me/reports/:id
  fastify.get(
    '/api/v1/me/reports/:id',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const paramParsed = ReportIdParamSchema.safeParse(request.params)
      if (!paramParsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: paramParsed.error.flatten() })
      }

      const report = await db.getReportById(clerkId, paramParsed.data.id)
      if (!report) return reply.code(404).send({ code: 'NOT_FOUND' })

      return reply.send({
        id: report.id,
        status: report.status,
        problem_type: report.problem_type,
        problem_type_user: report.problem_type_user,
        problem_type_ai: report.problem_type_ai,
        ai_confidence: report.ai_confidence,
        description: report.description,
        latitude: report.latitude,
        longitude: report.longitude,
        address_raw: report.address_raw,
        photo_url: photoUrl(cfImagesBaseUrl, report.photo_optimized_key),
        photo_thumbnail_url: thumbnailUrl(cfImagesBaseUrl, report.photo_optimized_key),
        confirmation_count: report.confirmation_count,
        status_history: report.status_history.map((h) => ({
          status: h.status,
          changed_at: h.changed_at.toISOString(),
          note: h.note,
        })),
        created_at: report.created_at.toISOString(),
        updated_at: report.updated_at.toISOString(),
      })
    },
  )

  // GET /api/v1/me/confirmations
  fastify.get(
    '/api/v1/me/confirmations',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const { clerkId } = request.auth!

      const parsed = MyConfirmationsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { cursor, limit } = parsed.data
      const result = await db.getConfirmations(clerkId, {
        cursor: cursor ?? null,
        limit,
      })

      return reply.send({
        confirmations: result.confirmations.map((c) => ({
          report_id: c.report_id,
          problem_type: c.problem_type,
          address_raw: c.address_raw,
          photo_thumbnail_url: thumbnailUrl(cfImagesBaseUrl, c.photo_optimized_key),
          report_status: c.report_status,
          confirmed_at: c.confirmed_at.toISOString(),
        })),
        cursor: result.cursor,
      })
    },
  )
}
