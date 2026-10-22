import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import type { TelegramClient } from '../lib/telegram.js'
import {
  QUEUE_NOTIFICATIONS,
  JOB_NOTIFICATION,
  type NotificationJobData,
  type TelegramPayload,
} from '../lib/notification-queue.js'
import type { NotificationLogRepository } from '../repositories/notification-log.repository.js'

/**
 * Worker for the `notifications` queue.
 *
 * Routes by `channel`:
 *   - telegram → TelegramClient
 *   - email → not implemented in v1 (logs `skipped`)
 *   - web_push → not implemented in v1 (logs `skipped`)
 *
 * Permanent failures are written to `notification_log` with status `failed`
 * and the error message (for internal debugging only — never returned to
 * clients). BullMQ retries up to 3 times with exponential backoff before
 * we reach this point.
 */
export function startNotificationWorker(opts: {
  workerRedis: Redis
  telegram: TelegramClient
  logRepo: NotificationLogRepository
}): Worker<NotificationJobData> {
  const { workerRedis, telegram, logRepo } = opts

  const worker = new Worker<NotificationJobData>(
    QUEUE_NOTIFICATIONS,
    async (job) => {
      if (job.name !== JOB_NOTIFICATION) return

      const data = job.data

      if (data.channel === 'telegram') {
        const payload = data.payload as TelegramPayload
        if (payload.photoUrl) {
          await telegram.sendPhoto({
            chatId: payload.chatId,
            photoUrl: payload.photoUrl,
            caption: payload.text,
            parseMode: payload.parseMode,
            replyMarkup: payload.inlineKeyboard
              ? { inline_keyboard: payload.inlineKeyboard }
              : undefined,
          })
        } else {
          await telegram.sendMessage({
            chatId: payload.chatId,
            text: payload.text,
            parseMode: payload.parseMode,
            replyMarkup: payload.inlineKeyboard
              ? { inline_keyboard: payload.inlineKeyboard }
              : undefined,
            disableWebPagePreview: false,
          })
        }

        await logRepo.log({
          userId: data.userId,
          channel: 'telegram',
          eventType: data.eventType,
          status: 'delivered',
          reportId: data.reportId,
        })
        return
      }

      // Email / web_push / mobile_push — not implemented in v1.
      await logRepo.log({
        userId: data.userId,
        channel: data.channel,
        eventType: data.eventType,
        status: 'skipped',
        error: `Channel ${data.channel} not implemented in v1`,
        reportId: data.reportId,
      })
    },
    {
      connection: workerRedis,
      concurrency: 5,
    },
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    const data = job.data
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1)

    console.error(
      JSON.stringify({
        worker: 'notifications',
        jobId: job.id,
        userId: data.userId,
        channel: data.channel,
        eventType: data.eventType,
        attempt: job.attemptsMade,
        errorCode: err.message,
      }),
    )

    if (isLastAttempt) {
      await logRepo.log({
        userId: data.userId,
        channel: data.channel,
        eventType: data.eventType,
        status: 'failed',
        error: err.message,
        reportId: data.reportId,
      })
    }
  })

  return worker
}
