import { describe, it, expect, vi } from 'vitest'
import { checkNotificationRate } from '../lib/notification-rate-limit.js'

function makePipeline(zcardValue: number) {
  const pipe = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 0],
      [null, zcardValue],
      [null, 1],
      [null, 1],
    ]),
  }
  return pipe
}

describe('checkNotificationRate', () => {
  it('allows when current count is under the limit', async () => {
    const pipeline = makePipeline(0)
    const redis = { pipeline: vi.fn(() => pipeline) }
    const allowed = await checkNotificationRate(redis as never, 'u1', 1_700_000_000_000)
    expect(allowed).toBe(true)
  })

  it('allows when at one below the limit', async () => {
    const pipeline = makePipeline(9)
    const redis = { pipeline: vi.fn(() => pipeline) }
    expect(await checkNotificationRate(redis as never, 'u1', 1_700_000_000_000)).toBe(true)
  })

  it('blocks at exactly the limit', async () => {
    const pipeline = makePipeline(10)
    const redis = { pipeline: vi.fn(() => pipeline) }
    expect(await checkNotificationRate(redis as never, 'u1', 1_700_000_000_000)).toBe(false)
  })

  it('blocks when way over the limit', async () => {
    const pipeline = makePipeline(50)
    const redis = { pipeline: vi.fn(() => pipeline) }
    expect(await checkNotificationRate(redis as never, 'u1', 1_700_000_000_000)).toBe(false)
  })

  it('writes the sliding-window operations to the pipeline', async () => {
    const pipeline = makePipeline(0)
    const redis = { pipeline: vi.fn(() => pipeline) }
    await checkNotificationRate(redis as never, 'user-42', 1_000_000)

    expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
      'notifications:rate:user-42',
      0,
      940_000, // 1_000_000 − WINDOW_MS (60_000)
    )
    expect(pipeline.zcard).toHaveBeenCalledWith('notifications:rate:user-42')
    expect(pipeline.expire).toHaveBeenCalledWith('notifications:rate:user-42', 120)
  })
})
