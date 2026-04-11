import { describe, it, expect, vi } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { requireRole } from '../middleware/require-role.js'
import type { AuthPayload } from '@open-road/types'

function makeRequest(auth: AuthPayload | null) {
  return { auth } as unknown as FastifyRequest
}

function makeReply() {
  const send = vi.fn()
  const code = vi.fn().mockReturnValue({ send })
  return { code, send } as unknown as FastifyReply
}

describe('requireRole', () => {
  it('does not reply when role matches', async () => {
    const reply = makeReply()
    await requireRole('moderator', 'admin')(
      makeRequest({ clerkId: 'u1', role: 'moderator' }),
      reply,
    )
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('returns 403 when role does not match', async () => {
    const reply = makeReply()
    await requireRole('admin')(
      makeRequest({ clerkId: 'u1', role: 'user' }),
      reply,
    )
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('returns 403 when auth is null', async () => {
    const reply = makeReply()
    await requireRole('admin')(makeRequest(null), reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('allows admin when multiple roles specified', async () => {
    const reply = makeReply()
    await requireRole('moderator', 'admin')(
      makeRequest({ clerkId: 'u1', role: 'admin' }),
      reply,
    )
    expect(reply.code).not.toHaveBeenCalled()
  })
})
