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

  const claims = auth.sessionClaims as Record<string, unknown>
  const metadata = (claims?.publicMetadata ?? claims?.public_metadata) as Record<string, unknown> | undefined
  const role = (metadata?.role ?? claims?.role) as Role | undefined

  request.auth = {
    clerkId: auth.userId!,
    role: role ?? 'user',
  }
}
