import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Redis } from 'ioredis'
import bcrypt from 'bcryptjs'
import type { Role } from '@open-road/types'

export interface ApiKeyRecord {
  id: string
  userId: string
  keyHash: string
  scopes: string[]
  role: Role
}

export interface ApiKeyRepository {
  findByPrefix(prefix: string): Promise<ApiKeyRecord | null>
  updateLastUsed(id: string): Promise<void>
}

export function createVerifyApiKey(redis: Redis, db: ApiKeyRepository) {
  return async function verifyApiKey(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const key = request.headers['x-api-key']
    if (!key || typeof key !== 'string') {
      await reply.code(401).send({ code: 'UNAUTHORIZED' })
      return
    }

    const prefix = key.slice(0, 12)
    const cacheKey = `cache:apikey:${prefix}`

    const cached = await redis.get(cacheKey)
    if (cached) {
      const record = JSON.parse(cached) as ApiKeyRecord
      const valid = await bcrypt.compare(key, record.keyHash)
      if (!valid) {
        await reply.code(401).send({ code: 'UNAUTHORIZED' })
        return
      }
      request.auth = { clerkId: record.userId, role: record.role, scopes: record.scopes }
      return
    }

    const record = await db.findByPrefix(prefix)
    if (!record) {
      await reply.code(401).send({ code: 'UNAUTHORIZED' })
      return
    }

    const valid = await bcrypt.compare(key, record.keyHash)
    if (!valid) {
      await reply.code(401).send({ code: 'UNAUTHORIZED' })
      return
    }

    // Cache after successful bcrypt verify (never cache on failure)
    await redis.set(cacheKey, JSON.stringify(record), 'EX', 300)

    // Update last_used_at async — don't block the request
    db.updateLastUsed(record.id).catch(() => undefined)

    request.auth = { clerkId: record.userId, role: record.role, scopes: record.scopes }
  }
}
