import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import type { ModerationRepository } from '../../repositories/moderation.repository.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const QUEUE_COUNT_INTERVAL_MS = 60_000
const MAX_SSE_CONNECTIONS = 10

let activeConnections = 0

interface ModerationFeedOptions {
  db: ModerationRepository
  redis: Redis
}

export async function moderationFeedRoutes(
  fastify: FastifyInstance,
  options: ModerationFeedOptions,
): Promise<void> {
  const { db, redis } = options

  fastify.get(
    '/api/v1/moderation/feed',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      if (activeConnections >= MAX_SSE_CONNECTIONS) {
        return reply.code(503).send({ code: 'TOO_MANY_CONNECTIONS' })
      }

      activeConnections++
      const raw = reply.raw
      raw.setHeader('Content-Type', 'text/event-stream')
      raw.setHeader('Cache-Control', 'no-cache')
      raw.setHeader('Connection', 'keep-alive')
      raw.setHeader('X-Accel-Buffering', 'no')
      raw.flushHeaders()

      // Subscribe to Redis pub/sub for new_report events
      const subscriber = redis.duplicate()
      await subscriber.subscribe('events:moderation')

      subscriber.on('message', (_channel: string, message: string) => {
        raw.write(`data: ${message}\n\n`)
      })

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        raw.write(': keepalive\n\n')
      }, HEARTBEAT_INTERVAL_MS)

      // Queue count every 60s
      const queueCount = setInterval(async () => {
        try {
          const result = await db.getQueue({ status: 'pending_review', problemType: null, cursor: null, limit: 1 })
          const underReview = await db.getQueue({ status: 'under_review', problemType: null, cursor: null, limit: 1 })
          const event = JSON.stringify({
            event: 'queue_count',
            pending: result.total_pending,
            under_review: underReview.reports.length,
          })
          raw.write(`data: ${event}\n\n`)
        } catch {
          // ignore errors in background interval
        }
      }, QUEUE_COUNT_INTERVAL_MS)

      const cleanup = () => {
        activeConnections--
        clearInterval(heartbeat)
        clearInterval(queueCount)
        subscriber.unsubscribe().catch(() => undefined)
        subscriber.quit().catch(() => undefined)
      }

      raw.on('close', cleanup)
      raw.on('error', cleanup)

      // Prevent Fastify from sending its own response
      await new Promise<void>((resolve) => {
        raw.on('close', resolve)
        raw.on('error', resolve)
      })
    },
  )
}
