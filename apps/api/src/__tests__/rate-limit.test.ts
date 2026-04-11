import { describe, it, expect, vi } from 'vitest'
import { rateLimit, RateLimitError } from '../middleware/rate-limit.js'
import type { Redis } from 'ioredis'

function makeRedis(incrResult: number) {
  return {
    incr: vi.fn().mockResolvedValue(incrResult),
    expire: vi.fn().mockResolvedValue(1),
  } as unknown as Redis
}

describe('rateLimit', () => {
  it('resolves when under limit', async () => {
    await expect(rateLimit(makeRedis(5), 'key', 10, 60)).resolves.toBeUndefined()
  })

  it('throws RateLimitError when limit exceeded', async () => {
    await expect(rateLimit(makeRedis(11), 'key', 10, 60)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('sets TTL on first request (count === 1)', async () => {
    const redis = makeRedis(1)
    await rateLimit(redis, 'key', 10, 60)
    expect(redis.expire).toHaveBeenCalledWith('key', 60)
  })

  it('does not set TTL when count > 1', async () => {
    const redis = makeRedis(3)
    await rateLimit(redis, 'key', 10, 60)
    expect(redis.expire).not.toHaveBeenCalled()
  })

  it('throws on exact limit boundary', async () => {
    await expect(rateLimit(makeRedis(10), 'key', 9, 60)).rejects.toBeInstanceOf(RateLimitError)
  })
})
