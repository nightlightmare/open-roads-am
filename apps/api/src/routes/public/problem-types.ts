import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { rateLimit, RateLimitError } from '../../middleware/rate-limit.js'
import type { ProblemTypeRepository } from '../../repositories/problem-type.repository.js'

const CACHE_KEY = 'cache:problem-types:active'
const CACHE_TTL = 300 // 5 minutes

interface ProblemTypesRoutesOptions {
  db: ProblemTypeRepository
  redis: Redis
}

export async function publicProblemTypesRoutes(
  fastify: FastifyInstance,
  options: ProblemTypesRoutesOptions,
): Promise<void> {
  const { db, redis } = options

  fastify.get('/api/v1/public/problem-types', async (request, reply) => {
    const ip = request.ip

    try {
      await rateLimit(redis, `rate:public:problem-types:${ip}`, 60, 60)
    } catch (err) {
      if (err instanceof RateLimitError) {
        return reply.code(429).header('Retry-After', '60').send({ code: 'RATE_LIMIT_EXCEEDED' })
      }
      throw err
    }

    // Check Redis cache
    const cached = await redis.get(CACHE_KEY)
    if (cached) {
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.parse(cached) as unknown)
    }

    const types = await db.findAllActive()

    // Return only public-facing fields (no is_active, no sort_order)
    const result = types.map((t) => ({
      id: t.id,
      name_hy: t.name_hy,
      name_ru: t.name_ru,
      name_en: t.name_en,
    }))

    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result))

    return reply
      .header('Cache-Control', 'public, max-age=300')
      .header('Access-Control-Allow-Origin', '*')
      .send(result)
  })
}
