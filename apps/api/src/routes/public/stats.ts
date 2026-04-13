import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { rateLimit, RateLimitError } from '../../middleware/rate-limit.js'
import type { PublicReportRepository } from '../../repositories/public-report.repository.js'

const MAX_DATE_RANGE_DAYS = 365

const StatsQuerySchema = z.object({
  region_id: z.string().uuid().optional(),
  problem_type: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

interface PublicStatsRoutesOptions {
  db: PublicReportRepository
  redis: Redis
}

export async function publicStatsRoutes(
  fastify: FastifyInstance,
  options: PublicStatsRoutesOptions,
): Promise<void> {
  const { db, redis } = options

  fastify.get('/api/v1/public/stats', async (request, reply) => {
    const ip = request.ip

    try {
      await rateLimit(redis, `rate:public:stats:${ip}`, 30, 60)
    } catch (err) {
      if (err instanceof RateLimitError) {
        return reply.code(429).header('Retry-After', '60').send({ code: 'RATE_LIMIT_EXCEEDED' })
      }
      throw err
    }

    const parsed = StatsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
    }

    const { region_id, problem_type } = parsed.data

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 30)

    const fromStr = parsed.data.from ?? defaultFrom.toISOString().split('T')[0]!
    const toStr = parsed.data.to ?? now.toISOString().split('T')[0]!

    const fromDate = new Date(`${fromStr}T00:00:00.000Z`)
    const toDate = new Date(`${toStr}T23:59:59.999Z`)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return reply.code(400).send({ code: 'INVALID_DATE' })
    }

    const diffDays = (toDate.getTime() - fromDate.getTime()) / 86400000
    if (diffDays > MAX_DATE_RANGE_DAYS) {
      return reply.code(400).send({ code: 'DATE_RANGE_TOO_LARGE' })
    }

    const cacheKey = `stats:${createHash('sha1')
      .update(JSON.stringify({ region_id, problem_type, from: fromStr, to: toStr }))
      .digest('hex')
      .slice(0, 16)}`

    const cached = await redis.get(cacheKey)
    if (cached) {
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.parse(cached) as unknown)
    }

    const stats = await db.getStats({
      regionId: region_id ?? null,
      problemType: problem_type ?? null,
      from: fromDate,
      to: toDate,
    })

    await redis.setex(cacheKey, 300, JSON.stringify(stats))

    return reply
      .header('Cache-Control', 'public, max-age=300')
      .header('Access-Control-Allow-Origin', '*')
      .send(stats)
  })
}
