import type { S3Client } from '@aws-sdk/client-s3'
import { deleteFromR2 } from '../lib/r2.js'
import type { ClassificationRepository } from '../repositories/classification.repository.js'

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
