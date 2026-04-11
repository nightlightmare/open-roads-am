import type { Redis } from 'ioredis'

export class RateLimitError extends Error {
  constructor() {
    super('Rate limit exceeded')
    this.name = 'RateLimitError'
  }
}

export async function rateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSecs: number,
): Promise<void> {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSecs)
  if (count > limit) throw new RateLimitError()
}
