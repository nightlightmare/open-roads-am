import type { FastifyInstance } from 'fastify'
import type { S3Client } from '@aws-sdk/client-s3'
import type { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { verifyAuth } from '../middleware/verify-auth.js'
import { createBannedCheck } from '../middleware/banned-check.js'
import { rateLimit, RateLimitError } from '../middleware/rate-limit.js'
import { uploadToR2 } from '../lib/r2.js'
import { getClassifyQueue, JOB_CLASSIFY } from '../lib/queue.js'
import type { PrismaClient } from '@prisma/client'
import type { ClassificationRepository } from '../repositories/classification.repository.js'
import type { UserBanRepository } from '../middleware/banned-check.js'
import { resolveUserId } from '../lib/resolve-user-id.js'

// Magic bytes for file type validation
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function detectContentType(buf: Buffer): 'image/jpeg' | 'image/png' | null {
  if (buf.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg'
  if (buf.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png'
  return null
}

function getExtension(contentType: 'image/jpeg' | 'image/png'): string {
  return contentType === 'image/jpeg' ? 'jpg' : 'png'
}

interface ClassifyRoutesOptions {
  db: ClassificationRepository
  banDb: UserBanRepository
  s3: S3Client
  r2Bucket: string
  redis: Redis
  prisma: PrismaClient
}

export async function classifyRoutes(
  fastify: FastifyInstance,
  options: ClassifyRoutesOptions,
): Promise<void> {
  const { db, banDb, s3, r2Bucket, redis, prisma } = options
  const bannedCheck = createBannedCheck(redis, banDb)
  const queue = getClassifyQueue(redis)

  // POST /api/v1/classify — upload photo, enqueue AI classification
  fastify.post(
    '/api/v1/classify',
    { preHandler: [verifyAuth, bannedCheck] },
    async (request, reply) => {
      const auth = request.auth!
      const userId = await resolveUserId(prisma, redis, auth.clerkId)

      // Rate limit: 20 uploads/hour
      try {
        await rateLimit(redis, `rate:classify:user:${auth.clerkId}`, 20, 3600)
      } catch (err) {
        if (err instanceof RateLimitError) {
          return reply
            .code(429)
            .header('Retry-After', '3600')
            .send({ code: 'RATE_LIMIT_EXCEEDED' })
        }
        throw err
      }

      const data = await request.file()
      if (!data) {
        return reply.code(400).send({ code: 'INVALID_PHOTO' })
      }

      // Read into buffer — enforce size limit
      const chunks: Buffer[] = []
      let totalSize = 0
      for await (const chunk of data.file) {
        totalSize += chunk.length
        if (totalSize > MAX_FILE_SIZE) {
          return reply.code(400).send({ code: 'PHOTO_TOO_LARGE' })
        }
        chunks.push(chunk)
      }
      const rawBuffer = Buffer.concat(chunks)

      // Validate magic bytes
      const contentType = detectContentType(rawBuffer)
      if (!contentType) {
        return reply.code(400).send({ code: 'INVALID_PHOTO' })
      }

      // Strip EXIF via sharp (re-encode without metadata)
      const stripped = await sharp(rawBuffer).toFormat(contentType === 'image/jpeg' ? 'jpeg' : 'png').toBuffer()

      // Upload to R2 under temp prefix
      const ext = getExtension(contentType)
      const photoTempKey = `temp/${auth.clerkId}/${randomUUID()}.${ext}`
      await uploadToR2(s3, r2Bucket, photoTempKey, stripped, contentType)

      // Insert photo_classifications row
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // +30 min
      const { id: classificationId } = await db.create({
        userId,
        photoTempKey,
        expiresAt,
      })

      // Enqueue BullMQ job
      await queue.add(JOB_CLASSIFY, { classificationId, photoTempKey }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604_800 },
      })

      return reply.code(202).send({ job_token: classificationId })
    },
  )

  // GET /api/v1/classify/:job_token — poll classification status
  fastify.get(
    '/api/v1/classify/:job_token',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const auth = request.auth!
      const userId = await resolveUserId(prisma, redis, auth.clerkId)
      const { job_token } = request.params as { job_token: string }

      const record = await db.findByIdAndUser(job_token, userId)
      if (!record) {
        return reply.code(404).send({ code: 'NOT_FOUND' })
      }

      if (record.status === 'completed') {
        // Return null if confidence below threshold — client shows all categories unselected
        const problemType =
          record.aiConfidence !== null && record.aiConfidence >= 0.6
            ? record.problemTypeAi
            : null

        return reply.code(200).send({
          status: 'completed',
          problem_type_ai: problemType,
          ai_confidence: record.aiConfidence,
        })
      }

      return reply.code(200).send({ status: record.status })
    },
  )
}
