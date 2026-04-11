import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAuth } from '../middleware/verify-auth.js'

vi.mock('@clerk/fastify', () => ({
  getAuth: vi.fn(),
  clerkPlugin: vi.fn(),
  clerkClient: {},
}))

const { getAuth } = await import('@clerk/fastify')

describe('verifyAuth', () => {
  let request: { auth: unknown; headers: Record<string, string> }
  let sendMock: ReturnType<typeof vi.fn>
  let reply: { code: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    request = { auth: null, headers: {} }
    sendMock = vi.fn()
    reply = { code: vi.fn().mockReturnValue({ send: sendMock }) }
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuth).mockReturnValue({ isAuthenticated: false } as ReturnType<typeof getAuth>)

    await verifyAuth(request as FastifyRequest, reply as unknown as FastifyReply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(sendMock).toHaveBeenCalledWith({ code: 'UNAUTHORIZED' })
  })

  it('sets request.auth with role from sessionClaims', async () => {
    vi.mocked(getAuth).mockReturnValue({
      isAuthenticated: true,
      userId: 'user_123',
      sessionClaims: { role: 'moderator' },
    } as unknown as ReturnType<typeof getAuth>)

    await verifyAuth(request as FastifyRequest, reply as unknown as FastifyReply)

    expect(request.auth).toEqual({ clerkId: 'user_123', role: 'moderator' })
  })

  it('defaults role to user when sessionClaims has no role', async () => {
    vi.mocked(getAuth).mockReturnValue({
      isAuthenticated: true,
      userId: 'user_456',
      sessionClaims: {},
    } as unknown as ReturnType<typeof getAuth>)

    await verifyAuth(request as FastifyRequest, reply as unknown as FastifyReply)

    expect(request.auth).toEqual({ clerkId: 'user_456', role: 'user' })
  })
})
