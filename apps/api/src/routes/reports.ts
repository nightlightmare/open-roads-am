import type { FastifyInstance } from 'fastify'
import type { S3Client } from '@aws-sdk/client-s3'
import type { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { verifyAuth } from '../middleware/verify-auth.js'
import { createBannedCheck } from '../middleware/banned-check.js'
import { rateLimit, RateLimitError } from '../middleware/rate-limit.js'
import { copyInR2 } from '../lib/r2.js'
import type { ClassificationRepository } from '../repositories/classification.repository.js'
import type { ReportRepository } from '../repositories/report.repository.js'
import type { UserBanRepository } from '../middleware/banned-check.js'

// Armenia bounding box + ~50 km buffer (per spec)
const LAT_MIN = 38.8
const LAT_MAX = 41.4
const LNG_MIN = 43.4
const LNG_MAX = 46.7

const CreateReportSchema = z.object({
  job_token: z.string().uuid(),
  latitude: z.number().min(LAT_MIN).max(LAT_MAX),
  longitude: z.number().min(LNG_MIN).max(LNG_MAX),
  problem_type_user: z.enum([
    'pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign',
    'hazard', 'broken_light', 'missing_ramp', 'other',
  ]),
  description: z.string().max(1000).trim().optional(),
})

interface ReportRoutesOptions {
  classificationDb: ClassificationRepository
  reportDb: ReportRepository
  banDb: UserBanRepository
  s3: S3Client
  r2Bucket: string
  redis: Redis
}

export async function reportRoutes(
  fastify: FastifyInstance,
  options: ReportRoutesOptions,
): Promise<void> {
  const { classificationDb, reportDb, banDb, s3, r2Bucket, redis } = options
  const bannedCheck = createBannedCheck(redis, banDb)

  fastify.post(
    '/api/v1/reports',
    { preHandler: [verifyAuth, bannedCheck] },
    async (request, reply) => {
      const auth = request.auth!

      const parsed = CreateReportSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { job_token, latitude, longitude, problem_type_user, description } = parsed.data

      // Rate limit: 10 reports/24h
      try {
        await rateLimit(redis, `rate:report:user:${auth.clerkId}`, 10, 86400)
      } catch (err) {
        if (err instanceof RateLimitError) {
          return reply
            .code(429)
            .header('Retry-After', '86400')
            .send({ code: 'RATE_LIMIT_EXCEEDED' })
        }
        throw err
      }

      // Validate job_token ownership and expiry
      const classification = await classificationDb.findByIdAndUser(job_token, auth.clerkId)
      if (!classification) {
        return reply.code(400).send({ code: 'INVALID_JOB_TOKEN' })
      }

      // Move photo from temp to permanent key
      const ext = classification.photoTempKey.split('.').pop() ?? 'jpg'
      const reportId = randomUUID()
      const now = new Date()
      const permanentKey = `reports/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${reportId}/original.${ext}`

      await copyInR2(s3, r2Bucket, classification.photoTempKey, permanentKey)

      // Insert report (location via raw SQL in repository)
      const { id, createdAt } = await reportDb.create({
        userId: auth.clerkId,
        problemTypeUser: problem_type_user,
        problemTypeAi: classification.problemTypeAi,
        aiConfidence: classification.aiConfidence,
        aiRawResponse: classification.aiRawResponse,
        latitude,
        longitude,
        photoOriginalKey: permanentKey,
        description: description ?? null,
      })

      // Delete classification row (photo temp key cleaned up by cron or can delete now)
      await classificationDb.delete(job_token)

      // Async: resolve region + address (fire and forget — non-blocking per spec)
      resolveGeoAsync(reportDb, id, latitude, longitude).catch(() => undefined)

      // Notify moderators via Redis pub/sub
      await redis.publish(
        'events:moderation',
        JSON.stringify({
          event: 'new_report',
          report_id: id,
          problem_type_user,
          created_at: createdAt.toISOString(),
        }),
      )

      return reply.code(201).send({ id, status: 'pending_review', created_at: createdAt.toISOString() })
    },
  )
}

// Resolves region_id via PostGIS and address via Nominatim — both async, non-blocking
async function resolveGeoAsync(
  reportDb: ReportRepository,
  reportId: string,
  lat: number,
  lng: number,
): Promise<void> {
  const [regionId, addressRaw] = await Promise.allSettled([
    resolveRegionId(reportDb, lat, lng),
    reverseGeocode(lat, lng),
  ])

  await reportDb.updateRegionAndAddress(
    reportId,
    regionId.status === 'fulfilled' ? regionId.value : null,
    addressRaw.status === 'fulfilled' ? addressRaw.value : null,
  )
}

async function resolveRegionId(
  reportDb: ReportRepository,
  lat: number,
  lng: number,
): Promise<string | null> {
  // Delegate to repository — needs PostGIS ST_Within query
  return (reportDb as PrismaReportRepositoryWithGeo).findRegionByPoint?.(lat, lng) ?? null
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const res = await fetch(url, { headers: { 'User-Agent': 'open-road.am/1.0' } })
    if (!res.ok) return null
    const json = (await res.json()) as { display_name?: string }
    return json.display_name ?? null
  } catch {
    return null
  }
}

// Optional extension interface for PostGIS region lookup
interface PrismaReportRepositoryWithGeo extends ReportRepository {
  findRegionByPoint?: (lat: number, lng: number) => Promise<string | null>
}
