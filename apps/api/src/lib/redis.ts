import { Redis } from 'ioredis'

let client: Redis | null = null

export function getRedis(url: string): Redis {
  if (!client) {
    client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
  }
  return client
}

export type { Redis }
