import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { meRoutes } from '../routes/me.js'
import { confirmationRoutes } from '../routes/confirmations.js'

vi.mock('../middleware/verify-auth.js', () => ({
  verifyAuth: vi.fn(async (req: { auth: unknown }) => {
    req.auth = { clerkId: 'user_clerk_123', role: 'user' }
  }),
}))
vi.mock('../middleware/banned-check.js', () => ({
  createBannedCheck: () => vi.fn(async () => undefined),
}))

const REPORT_ID = 'a0000000-0000-4000-8000-000000000001'
const CF_BASE = 'https://imagedelivery.net/test'

const mockDb = {
  getProfile: vi.fn(),
  getReports: vi.fn(),
  getReportById: vi.fn(),
  getConfirmations: vi.fn(),
  addConfirmation: vi.fn(),
  removeConfirmation: vi.fn(),
}

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
}

async function buildApp() {
  const fastify = Fastify()
  fastify.decorateRequest('auth', null)
  await fastify.register(meRoutes, {
    db: mockDb as never,
    redis: mockRedis as never,
    cfImagesBaseUrl: CF_BASE,
  })
  await fastify.register(confirmationRoutes, {
    db: mockDb as never,
    banDb: {} as never,
    redis: mockRedis as never,
  })
  return fastify
}

// ── GET /api/v1/me ──────────────────────────────────────────────────────────

describe('GET /api/v1/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns profile with stats', async () => {
    mockDb.getProfile.mockResolvedValue({
      clerk_id: 'user_clerk_123',
      display_name: 'Anna M.',
      role: 'user',
      member_since: new Date('2026-03-01T00:00:00Z'),
      stats: { reports_submitted: 14, reports_approved: 11, reports_resolved: 3, confirmations_given: 27 },
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ clerk_id: string; stats: { reports_submitted: number } }>()
    expect(body.clerk_id).toBe('user_clerk_123')
    expect(body.stats.reports_submitted).toBe(14)
  })

  it('returns cached profile on second request', async () => {
    const cached = JSON.stringify({ clerk_id: 'user_clerk_123', stats: {} })
    mockRedis.get.mockResolvedValue(cached)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(res.statusCode).toBe(200)
    expect(mockDb.getProfile).not.toHaveBeenCalled()
  })

  it('returns 404 if user not found in DB', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockDb.getProfile.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(res.statusCode).toBe(404)
  })
})

// ── GET /api/v1/me/reports ───────────────────────────────────────────────────

describe('GET /api/v1/me/reports', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns own reports list with thumbnail URLs', async () => {
    mockDb.getReports.mockResolvedValue({
      reports: [{
        id: REPORT_ID, status: 'approved', problem_type: 'pothole',
        address_raw: 'ул. Абовяна', photo_optimized_key: 'img/abc',
        confirmation_count: 4, created_at: new Date('2026-04-10T08:00:00Z'),
        updated_at: new Date('2026-04-11T10:00:00Z'),
      }],
      cursor: null,
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/reports' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ reports: Array<{ photo_thumbnail_url: string }> }>()
    expect(body.reports[0]?.photo_thumbnail_url).toBe(`${CF_BASE}/img/abc/thumbnail`)
  })

  it('passes status filter to repository', async () => {
    mockDb.getReports.mockResolvedValue({ reports: [], cursor: null })
    const app = await buildApp()
    await app.inject({ method: 'GET', url: '/api/v1/me/reports?status=approved' })
    expect(mockDb.getReports).toHaveBeenCalledWith('user_clerk_123', expect.objectContaining({ status: 'approved' }))
  })

  it('returns 400 for invalid status', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/reports?status=archived' })
    expect(res.statusCode).toBe(400)
  })
})

// ── GET /api/v1/me/reports/:id ───────────────────────────────────────────────

describe('GET /api/v1/me/reports/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns full report detail for owner', async () => {
    mockDb.getReportById.mockResolvedValue({
      id: REPORT_ID, status: 'in_progress', problem_type: 'pothole',
      problem_type_user: 'pothole', problem_type_ai: 'pothole', ai_confidence: 0.91,
      description: 'Big hole', latitude: 40.18, longitude: 44.51,
      address_raw: 'ул. Абовяна', photo_optimized_key: 'img/abc',
      confirmation_count: 7, status_history: [
        { status: 'approved', changed_at: new Date('2026-04-10T09:00:00Z'), note: null },
      ],
      created_at: new Date('2026-04-10T08:00:00Z'),
      updated_at: new Date('2026-04-11T14:00:00Z'),
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/v1/me/reports/${REPORT_ID}` })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ problem_type_ai: string; photo_url: string; status_history: unknown[] }>()
    expect(body.problem_type_ai).toBe('pothole')
    expect(body.photo_url).toBe(`${CF_BASE}/img/abc/public`)
    expect(body.status_history).toHaveLength(1)
  })

  it('returns 404 if report belongs to another user', async () => {
    mockDb.getReportById.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/v1/me/reports/${REPORT_ID}` })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for invalid UUID', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/reports/not-a-uuid' })
    expect(res.statusCode).toBe(400)
  })
})

// ── GET /api/v1/me/confirmations ─────────────────────────────────────────────

describe('GET /api/v1/me/confirmations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns confirmations list', async () => {
    mockDb.getConfirmations.mockResolvedValue({
      confirmations: [{
        report_id: REPORT_ID, problem_type: 'hazard', address_raw: 'Трасса М1',
        photo_optimized_key: 'img/xyz', report_status: 'in_progress',
        confirmed_at: new Date('2026-04-09T12:00:00Z'),
      }],
      cursor: null,
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/confirmations' })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ confirmations: Array<{ report_id: string; photo_thumbnail_url: string }> }>()
    expect(body.confirmations[0]?.report_id).toBe(REPORT_ID)
    expect(body.confirmations[0]?.photo_thumbnail_url).toBe(`${CF_BASE}/img/xyz/thumbnail`)
  })
})

// ── POST /api/v1/reports/:id/confirm ─────────────────────────────────────────

describe('POST /api/v1/reports/:id/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirms report and returns new count', async () => {
    mockDb.addConfirmation.mockResolvedValue({ ok: true, count: 8 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${REPORT_ID}/confirm`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ report_id: string; confirmation_count: number }>()
    expect(body.report_id).toBe(REPORT_ID)
    expect(body.confirmation_count).toBe(8)
  })

  it('returns 404 if report not found', async () => {
    mockDb.addConfirmation.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: `/api/v1/reports/${REPORT_ID}/confirm` })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 ALREADY_CONFIRMED', async () => {
    mockDb.addConfirmation.mockResolvedValue({ ok: false, code: 'ALREADY_CONFIRMED' })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: `/api/v1/reports/${REPORT_ID}/confirm` })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('ALREADY_CONFIRMED')
  })

  it('returns 400 OWN_REPORT', async () => {
    mockDb.addConfirmation.mockResolvedValue({ ok: false, code: 'OWN_REPORT' })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: `/api/v1/reports/${REPORT_ID}/confirm` })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('OWN_REPORT')
  })

  it('returns 400 INVALID_STATUS', async () => {
    mockDb.addConfirmation.mockResolvedValue({ ok: false, code: 'INVALID_STATUS' })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: `/api/v1/reports/${REPORT_ID}/confirm` })
    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('INVALID_STATUS')
  })
})

// ── DELETE /api/v1/reports/:id/confirm ───────────────────────────────────────

describe('DELETE /api/v1/reports/:id/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes confirmation and returns new count', async () => {
    mockDb.removeConfirmation.mockResolvedValue({ ok: true, count: 7 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/reports/${REPORT_ID}/confirm`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ confirmation_count: number }>().confirmation_count).toBe(7)
  })

  it('returns 404 if no active confirmation', async () => {
    mockDb.removeConfirmation.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/reports/${REPORT_ID}/confirm`,
    })
    expect(res.statusCode).toBe(404)
  })
})
