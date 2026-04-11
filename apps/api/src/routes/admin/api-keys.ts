import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import bs58 from 'bs58'
import { z } from 'zod'
import { verifyAuth } from '../../middleware/verify-auth.js'
import { requireRole } from '../../middleware/require-role.js'

const CreateApiKeySchema = z.object({
  userId: z.string().min(1),
  scopes: z.array(z.enum(['reports:write', 'status:write'])).min(1),
  expiresAt: z.string().datetime().optional(),
})

export interface ApiKeyCreateRepository {
  create(data: {
    userId: string
    keyPrefix: string
    keyHash: string
    scopes: string[]
    expiresAt: Date | null
  }): Promise<{ id: string }>
}

export async function adminApiKeyRoutes(
  fastify: FastifyInstance,
  options: { db: ApiKeyCreateRepository },
): Promise<void> {
  fastify.post(
    '/api/v1/admin/api-keys',
    { preHandler: [verifyAuth, requireRole('admin')] },
    async (request, reply) => {
      const parsed = CreateApiKeySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const { userId, scopes, expiresAt } = parsed.data

      const bytes = randomBytes(32)
      const plaintext = `oak_live_${bs58.encode(bytes)}`
      const prefix = plaintext.slice(0, 12)
      const keyHash = await bcrypt.hash(plaintext, 12)

      await options.db.create({
        userId,
        keyPrefix: prefix,
        keyHash,
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })

      // Return plaintext once — never retrievable again
      return reply.code(201).send({ key: plaintext })
    },
  )
}
