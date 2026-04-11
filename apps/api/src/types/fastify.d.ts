import type { AuthPayload } from '@open-road/types'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthPayload | null
  }
}
