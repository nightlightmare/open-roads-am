import type { Redis } from 'ioredis'

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 10
const KEY_TTL_SECS = 120

/**
 * Sliding-window rate limit per user across all channels combined.
 * Returns `true` if the notification is allowed; `false` if it should be dropped.
 *
 * Rationale: 10 notifications/minute is more than enough; anything beyond is
 * almost always a misconfiguration or a moderator bulk-action. Dropping
 * silently is preferable to queueing because the user already has plenty to
 * look at.
 */
export async function checkNotificationRate(
  redis: Redis,
  userId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const key = `notifications:rate:${userId}`
  const windowStart = now - WINDOW_MS

  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, windowStart)
  pipe.zcard(key)
  pipe.zadd(key, now, `${now}-${Math.random()}`)
  pipe.expire(key, KEY_TTL_SECS)
  const results = await pipe.exec()

  const count = (results?.[1]?.[1] as number) ?? 0
  return count < MAX_PER_WINDOW
}
