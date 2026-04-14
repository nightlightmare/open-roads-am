import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { rateLimit, RateLimitError } from '../../middleware/rate-limit.js'
import type { PublicReportRepository } from '../../repositories/public-report.repository.js'

const MAX_BBOX_DEGREES = 2

const BboxQuerySchema = z.object({
  bbox: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius_km: z.coerce.number().min(0.1).max(50).default(5),
  zoom: z.coerce.number().int().min(0).max(22).default(12),
  problem_type: z.string().optional(),
  include_resolved: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

const ReportIdParamSchema = z.object({
  id: z.string().uuid(),
})

interface PublicReportRoutesOptions {
  db: PublicReportRepository
  redis: Redis
  cfImagesBaseUrl: string
}

function photoUrl(cfImagesBaseUrl: string, key: string | null): string | null {
  if (!key) return null
  return `${cfImagesBaseUrl}/${key}/public`
}

function makeCacheKey(params: Record<string, unknown>): string {
  const hash = createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 16)
  return `map:reports:${hash}`
}

export async function publicReportRoutes(
  fastify: FastifyInstance,
  options: PublicReportRoutesOptions,
): Promise<void> {
  const { db, redis, cfImagesBaseUrl } = options

  // GET /api/v1/public/reports
  fastify.get('/api/v1/public/reports', async (request, reply) => {
    const ip = request.ip

    try {
      await rateLimit(redis, `rate:public:reports:${ip}`, 60, 60)
    } catch (err) {
      if (err instanceof RateLimitError) {
        return reply.code(429).header('Retry-After', '60').send({ code: 'RATE_LIMIT_EXCEEDED' })
      }
      throw err
    }

    const parsed = BboxQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
    }

    const { bbox: bboxStr, lat, lng, radius_km, zoom, problem_type, include_resolved } = parsed.data

    let bbox: { west: number; south: number; east: number; north: number }

    if (bboxStr) {
      const parts = bboxStr.split(',').map(Number)
      if (parts.length !== 4 || parts.some(isNaN)) {
        return reply.code(400).send({ code: 'INVALID_BBOX' })
      }
      const [west, south, east, north] = parts as [number, number, number, number]
      if (east - west > MAX_BBOX_DEGREES || north - south > MAX_BBOX_DEGREES) {
        return reply.code(400).send({ code: 'BBOX_TOO_LARGE' })
      }
      bbox = { west, south, east, north }
    } else if (lat !== undefined && lng !== undefined) {
      // Approximate degrees per km at mid-latitude ~40°
      const degPerKm = 1 / 111
      const latDelta = radius_km * degPerKm
      const lngDelta = radius_km * degPerKm / Math.cos((lat * Math.PI) / 180)
      if (latDelta * 2 > MAX_BBOX_DEGREES || lngDelta * 2 > MAX_BBOX_DEGREES) {
        return reply.code(400).send({ code: 'BBOX_TOO_LARGE' })
      }
      bbox = {
        west: lng - lngDelta,
        south: lat - latDelta,
        east: lng + lngDelta,
        north: lat + latDelta,
      }
    } else {
      return reply.code(400).send({ code: 'MISSING_LOCATION', message: 'Provide bbox or lat+lng' })
    }

    const problemTypes = problem_type ? problem_type.split(',').filter(Boolean) : null
    const cacheKey = makeCacheKey({ bbox, zoom, problemTypes, include_resolved })

    // Try cache
    const cached = await redis.get(cacheKey)
    if (cached) {
      return reply
        .header('Cache-Control', 'public, max-age=30')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.parse(cached) as unknown)
    }

    const { items, totalInArea } = await db.findMapItems({
      bbox,
      zoom,
      problemTypes,
      includeResolved: include_resolved,
    })

    // Inject photo_url for individual report items
    const responseItems = items.map((item) => {
      if (item.type === 'report') {
        return {
          ...item,
          photo_url: photoUrl(cfImagesBaseUrl, item.photo_optimized_key),
          photo_optimized_key: undefined,
        }
      }
      return item
    })

    const body = { items: responseItems, total_in_area: totalInArea }
    await redis.setex(cacheKey, 30, JSON.stringify(body))

    return reply
      .header('Cache-Control', 'public, max-age=30')
      .header('Access-Control-Allow-Origin', '*')
      .send(body)
  })

  // GET /api/v1/public/reports/:id
  fastify.get('/api/v1/public/reports/:id', async (request, reply) => {
    const ip = request.ip

    try {
      await rateLimit(redis, `rate:public:report:${ip}`, 120, 60)
    } catch (err) {
      if (err instanceof RateLimitError) {
        return reply.code(429).header('Retry-After', '60').send({ code: 'RATE_LIMIT_EXCEEDED' })
      }
      throw err
    }

    const paramParsed = ReportIdParamSchema.safeParse(request.params)
    if (!paramParsed.success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: paramParsed.error.flatten() })
    }

    const { id } = paramParsed.data
    const cacheKey = `report:${id}`

    const cached = await redis.get(cacheKey)
    if (cached) {
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .header('Access-Control-Allow-Origin', '*')
        .send(JSON.parse(cached) as unknown)
    }

    const report = await db.findById(id)
    if (!report) {
      return reply.code(404).send({ code: 'NOT_FOUND' })
    }

    const body = {
      id: report.id,
      status: report.status,
      problem_type: report.problem_type,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      address_raw: report.address_raw,
      region_id: report.region_id,
      confirmation_count: report.confirmation_count,
      photo_url: photoUrl(cfImagesBaseUrl, report.photo_optimized_key),
      photo_thumbnail_url: report.photo_optimized_key
        ? `${cfImagesBaseUrl}/${report.photo_optimized_key}/thumbnail`
        : null,
      status_history: report.status_history.map((h) => ({
        status: h.status,
        changed_at: h.changed_at.toISOString(),
        note: h.note ?? null,
      })),
      created_at: report.created_at.toISOString(),
      updated_at: report.updated_at.toISOString(),
    }

    await redis.setex(cacheKey, 300, JSON.stringify(body))

    return reply
      .header('Cache-Control', 'public, max-age=300')
      .header('Access-Control-Allow-Origin', '*')
      .send(body)
  })
}
