import type { Redis } from 'ioredis'

export class RateLimitError extends Error {
  constructor() {
    super('Rate limit exceeded')
    this.name = 'RateLimitError'
  }
}

const LUA_RATE_LIMIT = `
  local count = redis.call('incr', KEYS[1])
  if count == 1 then
    redis.call('pexpire', KEYS[1], ARGV[1])
  end
  return count
`

export async function rateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSecs: number,
): Promise<void> {
  const count = (await redis.eval(LUA_RATE_LIMIT, 1, key, windowSecs * 1000)) as number
  if (count > limit) throw new RateLimitError()
}
