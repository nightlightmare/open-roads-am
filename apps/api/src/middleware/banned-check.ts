import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Redis } from 'ioredis'

export interface UserBanRepository {
  isBanned(clerkId: string): Promise<boolean>
}

export function createBannedCheck(redis: Redis, db: UserBanRepository) {
  return async function bannedCheck(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.auth) return

    const { clerkId } = request.auth
    const cacheKey = `cache:user:banned:${clerkId}`

    const cached = await redis.get(cacheKey)
    if (cached !== null) {
      if (cached === '1') {
        await reply.code(403).send({ code: 'USER_BANNED' })
      }
      return
    }

    const banned = await db.isBanned(clerkId)
    await redis.set(cacheKey, banned ? '1' : '0', 'EX', 300)

    if (banned) {
      await reply.code(403).send({ code: 'USER_BANNED' })
    }
  }
}
