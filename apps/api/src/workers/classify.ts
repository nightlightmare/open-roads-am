import { Worker } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import sharp from 'sharp'
import type { Redis } from 'ioredis'
import type { S3Client } from '@aws-sdk/client-s3'
import { getSignedDownloadUrl } from '../lib/r2.js'
import type { ClassificationRepository } from '../repositories/classification.repository.js'
import { QUEUE_REPORT_PHOTO, JOB_CLASSIFY, type ClassifyJobData } from '../lib/queue.js'

const CONFIDENCE_THRESHOLD = 0.6
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_IMAGE_DIMENSION = 1600

const ClassificationSchema = z.object({
  problem_type: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
})

export type ClassificationResult = z.infer<typeof ClassificationSchema>

const SYSTEM_PROMPT = `You are a road infrastructure analysis assistant. Your only task is to classify road problems from photos submitted by citizens in Armenia.

You must respond with valid JSON only. No explanation, no markdown, no extra text.`

const USER_PROMPT = `Analyze this photo and classify the road problem shown.

Respond with this exact JSON structure:
{
  "problem_type": "<type>",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one sentence in English>"
}

Valid values for problem_type:
- "pothole" — damaged or broken road surface, potholes
- "damaged_barrier" — damaged, missing or collapsed road barrier or guardrail
- "missing_marking" — faded, missing or damaged road markings
- "damaged_sign" — broken, missing, obscured or vandalized road signs
- "hazard" — dangerous road condition (cliff edge, flooding, landslide, road collapse)
- "broken_light" — non-functioning traffic light
- "missing_ramp" — missing or inaccessible pedestrian ramp / curb cut
- "other" — road-related problem that doesn't fit above categories
- "not_a_road_problem" — photo does not show a road problem (use if photo is irrelevant, blurry beyond recognition, or clearly not road infrastructure)

Rules:
- If the photo is too blurry or dark to classify reliably, set confidence below 0.5
- If multiple problems are visible, classify the most severe one
- confidence must reflect how certain you are, not how severe the problem is
- reasoning must be one sentence maximum`

async function fetchAndPrepareImage(
  s3: S3Client,
  bucket: string,
  photoKey: string,
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' }> {
  const signedUrl = await getSignedDownloadUrl(s3, bucket, photoKey, 300)
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`R2 fetch failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  // eslint-disable-next-line prefer-const
  let buffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer))

  // Resize if over 5 MB
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    buffer = await sharp(buffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
  }

  // Detect media type from magic bytes
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
  const mediaType = isJpeg ? 'image/jpeg' : 'image/png'

  return { data: buffer.toString('base64'), mediaType }
}

export function parseClassificationResponse(text: string): ClassificationResult {
  const parsed: unknown = JSON.parse(text)
  return ClassificationSchema.parse(parsed)
}

export function applyConfidenceThreshold(result: ClassificationResult): string | null {
  if (result.confidence < CONFIDENCE_THRESHOLD) return null
  if (result.problem_type === 'not_a_road_problem') return null
  return result.problem_type
}

export function startClassifyWorker(opts: {
  redis: Redis        // shared client for metrics/alerts
  workerRedis: Redis  // dedicated client for BullMQ (maxRetriesPerRequest: null)
  s3: S3Client
  r2Bucket: string
  claudeApiKey: string
  classificationRepo: ClassificationRepository
}): Worker<ClassifyJobData> {
  const { redis, workerRedis, s3, r2Bucket, claudeApiKey, classificationRepo } = opts
  const anthropic = new Anthropic({ apiKey: claudeApiKey })

  const worker = new Worker<ClassifyJobData>(
    QUEUE_REPORT_PHOTO,
    async (job) => {
      if (job.name !== JOB_CLASSIFY) return

      const { classificationId, photoTempKey } = job.data
      const startedAt = Date.now()

      console.log(JSON.stringify({ jobId: job.id, classificationId, status: 'started', attempt: job.attemptsMade + 1 }))

      // Prepare image
      const { data, mediaType } = await fetchAndPrepareImage(s3, r2Bucket, photoTempKey)

      // Call Claude API
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      })

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const result = parseClassificationResponse(responseText)
      const problemTypeAi = applyConfidenceThreshold(result)

      // Update classification record
      await classificationRepo.update(classificationId, {
        status: 'completed',
        problemTypeAi,
        aiConfidence: result.confidence,
        aiRawResponse: { ...result, raw: responseText },
      })

      // Redis metrics
      await redis.incr('metrics:ai:total')
      if (result.confidence < CONFIDENCE_THRESHOLD) {
        await redis.incr('metrics:ai:low_confidence')
      }

      console.log(
        JSON.stringify({
          jobId: job.id,
          classificationId,
          status: 'completed',
          durationMs: Date.now() - startedAt,
          problemType: problemTypeAi,
          confidence: result.confidence,
          attempt: job.attemptsMade + 1,
        }),
      )
    },
    {
      connection: workerRedis,
      concurrency: 2,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    const { classificationId } = job.data
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1)

    console.error(
      JSON.stringify({
        jobId: job.id,
        classificationId,
        status: 'failed',
        attempt: job.attemptsMade,
        errorCode: err.message,
      }),
    )

    if (isLastAttempt) {
      await classificationRepo.update(classificationId, { status: 'failed' })
      await redis.incr('metrics:ai:failed')
      await redis.publish('internal:alerts', JSON.stringify({ event: 'classify_failed', classificationId, jobId: job.id }))
    }
  })

  return worker
}
