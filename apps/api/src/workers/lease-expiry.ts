import type { Redis } from 'ioredis'
import type { ModerationRepository } from '../repositories/moderation.repository.js'

// Scans Redis for active moderation leases and reverts stale under_review reports
export function startLeaseExpiryWorker(
  redis: Redis,
  moderationRepo: ModerationRepository,
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      // Collect all active lease keys via SCAN
      const activeReportIds: string[] = []
      let cursor = '0'
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'moderation:lock:*', 'COUNT', 100)
        cursor = nextCursor
        for (const key of keys) {
          // key format: moderation:lock:<report_id>
          const reportId = key.slice('moderation:lock:'.length)
          activeReportIds.push(reportId)
        }
      } while (cursor !== '0')

      // Find all under_review reports
      const underReviewIds = await moderationRepo.findUnderReview()

      // Revert those without an active lease
      const toRevert = underReviewIds.filter((id) => !activeReportIds.includes(id))

      if (toRevert.length > 0) {
        await moderationRepo.revertToQueue(toRevert)
        console.log(
          JSON.stringify({ event: 'lease_expiry', reverted: toRevert.length, ids: toRevert }),
        )
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'lease_expiry_error', error: String(err) }))
    }
  }, 2 * 60 * 1000) // every 2 minutes
}
