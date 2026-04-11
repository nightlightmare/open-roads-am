import type { FastifyRequest, FastifyReply } from 'fastify'
import { getAuth } from '@clerk/fastify'
import type { Role } from '@open-road/types'

export async function verifyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request)

  if (!auth.isAuthenticated) {
    await reply.code(401).send({ code: 'UNAUTHORIZED' })
    return
  }

  request.auth = {
    clerkId: auth.userId!,
    role: ((auth.sessionClaims as Record<string, unknown>)?.role as Role) ?? 'user',
  }
}
