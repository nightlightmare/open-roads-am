import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export const QUEUE_REPORT_PHOTO = 'report-photo-processing'
export const JOB_CLASSIFY = 'classify-report-photo'

export interface ClassifyJobData {
  classificationId: string
}

let classifyQueue: Queue<ClassifyJobData> | undefined

export function getClassifyQueue(redis: Redis): Queue<ClassifyJobData> {
  if (!classifyQueue) {
    classifyQueue = new Queue<ClassifyJobData>(QUEUE_REPORT_PHOTO, {
      connection: redis,
    })
  }
  return classifyQueue
}
