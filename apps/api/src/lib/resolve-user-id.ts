import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'

const CACHE_TTL = 3600 // 1 hour

/** Resolve a Clerk ID to the internal user UUID. Cached in Redis with TTL. */
export async function resolveUserId(
  db: PrismaClient,
  redis: Redis,
  clerkId: string,
): Promise<string> {
  const cacheKey = `cache:user_id:${clerkId}`
  const cached = await redis.get(cacheKey)
  if (cached) return cached

  const user = await db.user.findUnique({
    where: { clerk_id: clerkId },
    select: { id: true },
  })
  if (!user) throw new Error(`User not found for clerk_id: ${clerkId}`)

  await redis.set(cacheKey, user.id, 'EX', CACHE_TTL)
  return user.id
}
