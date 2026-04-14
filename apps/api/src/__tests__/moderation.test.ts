import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { moderationQueueRoutes } from '../routes/moderation/queue.js'
import { moderationActionsRoutes } from '../routes/moderation/actions.js'

vi.mock('../middleware/verify-auth.js', () => ({
  verifyAuth: vi.fn(async (req: { auth: unknown }) => {
    req.auth = { clerkId: 'mod_clerk_id', role: 'moderator' }
  }),
}))
vi.mock('../middleware/require-role.js', () => ({
  requireRole: () => vi.fn(async () => undefined),
}))
vi.mock('../lib/resolve-user-id.js', () => ({
  resolveUserId: vi.fn(async () => 'uuid_mod_clerk_id'),
}))

const REPORT_ID = 'a0000000-0000-4000-8000-000000000001'

const mockDb = {
  getQueue: vi.fn().mockResolvedValue({
    reports: [
      {
        id: REPORT_ID,
        status: 'pending_review',
        problem_type_user: 'pothole',
        problem_type_ai: 'pothole',
        ai_confidence: 0.91,
        description: 'Big hole',
        latitude: 40.18,
        longitude: 44.51,
        address_raw: 'ул. Абовяна',
        photo_optimized_key: 'img/abc123',
        confirmation_count: 0,
        created_at: new Date('2026-04-10T08:00:00Z'),
      },
    ],
    cursor: null,
    total_pending: 5,
  }),
  findById: vi.fn().mockResolvedValue({ id: REPORT_ID, status: 'pending_review', userId: 'user1' }),
  transitionStatus: vi.fn().mockResolvedValue(true),
  approve: vi.fn().mockResolvedValue(undefined),
  reject: vi.fn().mockResolvedValue(undefined),
  updateStatus: vi.fn().mockResolvedValue(true),
  findUnderReview: vi.fn().mockResolvedValue([]),
  revertToQueue: vi.fn().mockResolvedValue(undefined),
  archiveOldReports: vi.fn().mockResolvedValue(0),
}

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(600),
  publish: vi.fn().mockResolvedValue(1),
}

async function buildApp() {
  const fastify = Fastify()
  fastify.decorateRequest('auth', null)
  await fastify.register(moderationQueueRoutes, {
    db: mockDb as never,
    redis: mockRedis as never,
    cfImagesBaseUrl: 'https://imagedelivery.net/test',
  })
  await fastify.register(moderationActionsRoutes, {
    db: mockDb as never,
    redis: mockRedis as never,
    prisma: {} as never,
  })
  return fastify
}

describe('GET /api/v1/moderation/queue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns queue with photo URLs', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/moderation/queue' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ reports: Array<{ photo_url: string; photo_thumbnail_url: string }>; total_pending: number }>()
    expect(body.total_pending).toBe(5)
    expect(body.reports[0]?.photo_url).toBe('https://imagedelivery.net/test/img/abc123/public')
    expect(body.reports[0]?.photo_thumbnail_url).toBe('https://imagedelivery.net/test/img/abc123/thumbnail')
  })

  it('passes status filter to repository', async () => {
    const app = await buildApp()
    await app.inject({ method: 'GET', url: '/api/v1/moderation/queue?status=under_review' })
    expect(mockDb.getQueue).toHaveBeenCalledWith(expect.objectContaining({ status: 'under_review' }))
  })

  it('returns 400 for invalid status', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/moderation/queue?status=invalid' })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/v1/moderation/reports/:id/open', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens report and acquires lease', async () => {
    mockRedis.get.mockResolvedValue(null) // no existing lease
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'pending_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/open`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('under_review')
    expect(mockRedis.set).toHaveBeenCalledWith(`moderation:lock:${REPORT_ID}`, 'mod_clerk_id', 'EX', 900)
  })

  it('returns 409 if another moderator holds the lease', async () => {
    mockRedis.get.mockResolvedValue('other_mod_id')
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'pending_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/open`,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('LOCKED')
  })

  it('refreshes lease if same moderator reconnects', async () => {
    mockRedis.get.mockResolvedValue('mod_clerk_id') // same moderator
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'pending_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/open`,
    })
    expect(res.statusCode).toBe(200)
    expect(mockRedis.set).toHaveBeenCalled()
  })

  it('returns 400 for invalid transition', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'approved', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/open`,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('INVALID_TRANSITION')
  })
})

describe('POST /api/v1/moderation/reports/:id/approve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('approves report, releases lease, invalidates cache', async () => {
    mockRedis.get.mockResolvedValue('mod_clerk_id') // moderator holds lease
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'under_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/approve`,
      headers: { 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(mockDb.approve).toHaveBeenCalledWith(REPORT_ID, expect.objectContaining({ moderatedBy: 'uuid_mod_clerk_id' }))
    expect(mockRedis.del).toHaveBeenCalledWith(`moderation:lock:${REPORT_ID}`)
    expect(mockRedis.del).toHaveBeenCalledWith(`report:${REPORT_ID}`)
    expect(mockRedis.publish).toHaveBeenCalledWith('events:report-approved', expect.any(String))
  })

  it('returns 409 if moderator does not hold lease', async () => {
    mockRedis.get.mockResolvedValue('other_mod_id')
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'under_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/approve`,
      headers: { 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('LEASE_REQUIRED')
  })

  it('accepts optional problem_type_final override', async () => {
    mockRedis.get.mockResolvedValue('mod_clerk_id')
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'under_review', userId: 'user1' })
    const app = await buildApp()

    await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/approve`,
      headers: { 'content-type': 'application/json' },
      payload: { problem_type_final: 'hazard' },
    })
    expect(mockDb.approve).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({ problemTypeFinal: 'hazard' }),
    )
  })
})

describe('POST /api/v1/moderation/reports/:id/reject', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects report and releases lease', async () => {
    mockRedis.get.mockResolvedValue('mod_clerk_id')
    mockDb.findById.mockResolvedValue({ id: REPORT_ID, status: 'under_review', userId: 'user1' })
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/reject`,
      headers: { 'content-type': 'application/json' },
      payload: { rejection_reason: 'Not a road problem' },
    })
    expect(res.statusCode).toBe(200)
    expect(mockDb.reject).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({ rejectionReason: 'Not a road problem' }),
    )
    expect(mockRedis.del).toHaveBeenCalledWith(`moderation:lock:${REPORT_ID}`)
  })

  it('returns 400 if rejection_reason is missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/moderation/reports/${REPORT_ID}/reject`,
      headers: { 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/v1/moderation/reports/:id/lock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('releases lock and reverts report to pending_review', async () => {
    mockRedis.get.mockResolvedValue('mod_clerk_id')
    const app = await buildApp()

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/moderation/reports/${REPORT_ID}/lock`,
    })
    expect(res.statusCode).toBe(200)
    expect(mockRedis.del).toHaveBeenCalledWith(`moderation:lock:${REPORT_ID}`)
    expect(mockDb.transitionStatus).toHaveBeenCalledWith(
      REPORT_ID, 'under_review', 'pending_review', 'uuid_mod_clerk_id', 'moderator', null,
    )
  })

  it('returns 404 if no lock exists', async () => {
    mockRedis.get.mockResolvedValue(null)
    const app = await buildApp()

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/moderation/reports/${REPORT_ID}/lock`,
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/v1/reports/:id/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates status and invalidates cache', async () => {
    mockDb.updateStatus.mockResolvedValue(true)
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${REPORT_ID}/status`,
      headers: { 'content-type': 'application/json' },
      payload: { status: 'in_progress', note: 'We are working on it' },
    })
    expect(res.statusCode).toBe(200)
    expect(mockDb.updateStatus).toHaveBeenCalledWith(
      REPORT_ID, 'in_progress', 'uuid_mod_clerk_id', 'moderator', 'We are working on it',
    )
    expect(mockRedis.del).toHaveBeenCalledWith(`report:${REPORT_ID}`)
  })

  it('returns 400 for invalid transition', async () => {
    mockDb.updateStatus.mockResolvedValue(false)
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${REPORT_ID}/status`,
      headers: { 'content-type': 'application/json' },
      payload: { status: 'resolved' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('INVALID_TRANSITION')
  })

  it('returns 400 for invalid status value', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${REPORT_ID}/status`,
      headers: { 'content-type': 'application/json' },
      payload: { status: 'approved' }, // not allowed for gov_agency
    })
    expect(res.statusCode).toBe(400)
  })
})
