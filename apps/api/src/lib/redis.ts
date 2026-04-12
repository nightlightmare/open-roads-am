import { Redis } from 'ioredis'

let client: Redis | null = null

export function getRedis(url: string): Redis {
  if (!client) {
    client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
  }
  return client
}

// BullMQ workers require maxRetriesPerRequest: null for blocking commands
export function getBullMQRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null })
}

export type { Redis }
