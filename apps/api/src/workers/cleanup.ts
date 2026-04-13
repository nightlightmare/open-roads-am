import type { S3Client } from '@aws-sdk/client-s3'
import { deleteFromR2 } from '../lib/r2.js'
import type { ClassificationRepository } from '../repositories/classification.repository.js'
import type { ModerationRepository } from '../repositories/moderation.repository.js'

// Runs every 10 minutes — deletes expired photo_classifications and their R2 temp objects
export function startCleanupCron(
  db: ClassificationRepository,
  s3: S3Client,
  bucket: string,
): NodeJS.Timeout {
  return setInterval(
    () => {
      runCleanup(db, s3, bucket).catch((err) => {
        console.error('[cleanup] error:', err)
      })
    },
    10 * 60 * 1000,
  )
}

// Runs daily at 03:00 Yerevan time (UTC+4) = 23:00 UTC
export function startArchiveCron(moderationRepo: ModerationRepository): NodeJS.Timeout {
  function scheduleNext() {
    const now = new Date()
    const nextRun = new Date(now)
    // Target: 23:00 UTC (= 03:00 Yerevan UTC+4)
    nextRun.setUTCHours(23, 0, 0, 0)
    if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1)
    const delay = nextRun.getTime() - now.getTime()
    return setTimeout(async () => {
      try {
        const count = await moderationRepo.archiveOldReports()
        console.log(JSON.stringify({ event: 'archive_cron', archived: count }))
      } catch (err) {
        console.error(JSON.stringify({ event: 'archive_cron_error', error: String(err) }))
      }
      scheduleNext()
    }, delay)
  }
  return scheduleNext()
}

async function runCleanup(
  db: ClassificationRepository,
  s3: S3Client,
  bucket: string,
): Promise<void> {
  const expired = await db.findExpired()
  if (expired.length === 0) return

  await Promise.allSettled(
    expired.map(async ({ id, photoTempKey }) => {
      await deleteFromR2(s3, bucket, photoTempKey)
      await db.delete(id)
    }),
  )
}
