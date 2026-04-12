import type { FastifyInstance } from 'fastify'
import { clerkClient } from '@clerk/fastify'
import { z } from 'zod'
import type { Redis } from 'ioredis'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { rateLimit, RateLimitError } from '../../middleware/rate-limit.js'
import type { Role } from '@open-road/types'

const UpdateRoleSchema = z.object({
  role: z.enum(['user', 'moderator', 'gov_agency', 'admin']),
})

export interface UserRoleRepository {
  updateRole(clerkId: string, role: Role): Promise<void>
}

export async function adminRoleRoutes(
  fastify: FastifyInstance,
  options: { db: UserRoleRepository; redis: Redis },
): Promise<void> {
  fastify.post(
    '/api/v1/admin/users/:clerk_id/role',
    { preHandler: [verifyAuth, requireRole('admin')] },
    async (request, reply) => {
      try {
        await rateLimit(options.redis, `rate:admin:roles:${request.auth!.clerkId}`, 5, 3600)
      } catch (err) {
        if (err instanceof RateLimitError) {
          return reply.code(429).header('Retry-After', '3600').send({ code: 'RATE_LIMIT_EXCEEDED' })
        }
        throw err
      }

      const { clerk_id } = request.params as { clerk_id: string }

      const parsed = UpdateRoleSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { role } = parsed.data

      await clerkClient.users.updateUser(clerk_id, {
        publicMetadata: { role },
      })

      await options.db.updateRole(clerk_id, role)

      return reply.code(200).send({ clerkId: clerk_id, role })
    },
  )
}
