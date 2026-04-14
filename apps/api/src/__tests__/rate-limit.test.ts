import { describe, it, expect, vi } from 'vitest'
import { rateLimit, RateLimitError } from '../middleware/rate-limit.js'
import type { Redis } from 'ioredis'

function makeRedis(evalResult: number) {
  return {
    eval: vi.fn().mockResolvedValue(evalResult),
  } as unknown as Redis
}

describe('rateLimit', () => {
  it('resolves when under limit', async () => {
    await expect(rateLimit(makeRedis(5), 'key', 10, 60)).resolves.toBeUndefined()
  })

  it('throws RateLimitError when limit exceeded', async () => {
    await expect(rateLimit(makeRedis(11), 'key', 10, 60)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('calls eval with correct args', async () => {
    const redis = makeRedis(1)
    await rateLimit(redis, 'key', 10, 60)
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'key', 60000)
  })

  it('throws on exact limit boundary', async () => {
    await expect(rateLimit(makeRedis(10), 'key', 9, 60)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('allows exact limit', async () => {
    await expect(rateLimit(makeRedis(10), 'key', 10, 60)).resolves.toBeUndefined()
  })
})
