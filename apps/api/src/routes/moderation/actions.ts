import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import type { PrismaClient } from '@prisma/client'
import type { ModerationRepository } from '../../repositories/moderation.repository.js'
import { resolveUserId } from '../../lib/resolve-user-id.js'

const LEASE_TTL = 900 // 15 minutes
const VALID_PROBLEM_TYPES = [
  'pothole', 'damaged_barrier', 'missing_marking', 'damaged_sign',
  'hazard', 'broken_light', 'missing_ramp', 'other',
] as const

const ApproveBodySchema = z.object({
  problem_type_final: z.enum(VALID_PROBLEM_TYPES).optional(),
  note: z.string().max(500).optional(),
})

const RejectBodySchema = z.object({
  rejection_reason: z.string().min(1).max(500),
})

const ReopenBodySchema = z.object({
  note: z.string().min(1).max(500),
})

const StatusBodySchema = z.object({
  status: z.enum(['in_progress', 'resolved']),
  note: z.string().max(500).optional(),
})

function leaseKey(reportId: string): string {
  return `moderation:lock:${reportId}`
}

interface ModerationActionsOptions {
  db: ModerationRepository
  redis: Redis
  prisma: PrismaClient
}

export async function moderationActionsRoutes(
  fastify: FastifyInstance,
  options: ModerationActionsOptions,
): Promise<void> {
  const { db, redis, prisma } = options

  // POST /api/v1/moderation/reports/:id/open
  fastify.post(
    '/api/v1/moderation/reports/:id/open',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const report = await db.findById(id)
      if (!report) return reply.code(404).send({ code: 'NOT_FOUND' })
      if (report.status !== 'pending_review') {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      const key = leaseKey(id)
      const existing = await redis.get(key)

      if (existing && existing !== auth.clerkId) {
        const ttl = await redis.ttl(key)
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

        const lockerUser = await redis.get(`cache:display_name:${existing}`)
        return reply.code(409).send({
          code: 'LOCKED',
          locked_by_display_name: lockerUser ?? existing,
          lock_expires_at: expiresAt,
        })
      }

      // Acquire or refresh lease
      await redis.set(key, auth.clerkId, 'EX', LEASE_TTL)

      const transitioned = await db.transitionStatus(
        id, 'pending_review', 'under_review', userId, auth.role, null,
      )
      if (!transitioned) {
        await redis.del(key)
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      return reply.send({ id, status: 'under_review' })
    },
  )

  // POST /api/v1/moderation/reports/:id/approve
  fastify.post(
    '/api/v1/moderation/reports/:id/approve',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const parsed = ApproveBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const report = await db.findById(id)
      if (!report) return reply.code(404).send({ code: 'NOT_FOUND' })
      if (report.status !== 'under_review') {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      // Verify lease
      const lease = await redis.get(leaseKey(id))
      if (lease !== auth.clerkId) {
        return reply.code(409).send({ code: 'LEASE_REQUIRED' })
      }

      await db.approve(id, {
        moderatedBy: userId,
        moderatedByRole: auth.role,
        problemTypeFinal: parsed.data.problem_type_final ?? null,
        note: parsed.data.note ?? null,
      })

      await redis.del(leaseKey(id))

      // Invalidate public caches
      await redis.del(`report:${id}`)
      await redis.publish('events:report-approved', JSON.stringify({ reportId: id }))

      return reply.send({ id, status: 'approved' })
    },
  )

  // POST /api/v1/moderation/reports/:id/reject
  fastify.post(
    '/api/v1/moderation/reports/:id/reject',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const parsed = RejectBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const report = await db.findById(id)
      if (!report) return reply.code(404).send({ code: 'NOT_FOUND' })
      if (report.status !== 'under_review') {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      // Verify lease
      const lease = await redis.get(leaseKey(id))
      if (lease !== auth.clerkId) {
        return reply.code(409).send({ code: 'LEASE_REQUIRED' })
      }

      await db.reject(id, {
        moderatedBy: userId,
        moderatedByRole: auth.role,
        rejectionReason: parsed.data.rejection_reason,
      })

      await redis.del(leaseKey(id))

      return reply.send({ id, status: 'rejected' })
    },
  )

  // POST /api/v1/moderation/reports/:id/reopen  (admin only)
  fastify.post(
    '/api/v1/moderation/reports/:id/reopen',
    { preHandler: [verifyAuth, requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const parsed = ReopenBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const report = await db.findById(id)
      if (!report) return reply.code(404).send({ code: 'NOT_FOUND' })
      if (report.status !== 'rejected') {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      const transitioned = await db.transitionStatus(
        id, 'rejected', 'under_review', userId, auth.role, parsed.data.note,
      )
      if (!transitioned) {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      // Admin acquires the lease for the reopened report
      await redis.set(leaseKey(id), auth.clerkId, 'EX', LEASE_TTL)

      return reply.send({ id, status: 'under_review' })
    },
  )

  // DELETE /api/v1/moderation/reports/:id/lock
  fastify.delete(
    '/api/v1/moderation/reports/:id/lock',
    { preHandler: [verifyAuth, requireRole('moderator', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const lease = await redis.get(leaseKey(id))
      if (!lease) return reply.code(404).send({ code: 'LOCK_NOT_FOUND' })

      // Only the holder or admin can release
      if (lease !== auth.clerkId && auth.role !== 'admin') {
        return reply.code(403).send({ code: 'FORBIDDEN' })
      }

      await redis.del(leaseKey(id))

      const reverted = await db.transitionStatus(
        id, 'under_review', 'pending_review', userId, auth.role, null,
      )
      if (!reverted) {
        // Report may have already been approved/rejected
        return reply.send({ id, status: 'released' })
      }

      return reply.send({ id, status: 'pending_review' })
    },
  )

  // POST /api/v1/reports/:id/status  (gov_agency, admin)
  fastify.post(
    '/api/v1/reports/:id/status',
    { preHandler: [verifyAuth, requireRole('gov_agency', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const auth = request.auth!
      const userId = await resolveUserId(prisma, auth.clerkId)

      const parsed = StatusBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const updated = await db.updateStatus(
        id,
        parsed.data.status,
        userId,
        auth.role,
        parsed.data.note ?? null,
      )

      if (!updated) {
        return reply.code(400).send({ code: 'INVALID_TRANSITION' })
      }

      await redis.del(`report:${id}`)

      return reply.send({ id, status: parsed.data.status })
    },
  )
}
