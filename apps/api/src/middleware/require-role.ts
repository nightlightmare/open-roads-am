import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@open-road/types'

export function requireRole(...roles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.auth || !roles.includes(request.auth.role)) {
      await reply.code(403).send({ code: 'FORBIDDEN' })
    }
  }
}
